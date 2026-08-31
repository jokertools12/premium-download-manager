'use strict';
/* فحص v3: إثبات أن شريط التقدم يتغير حياً + الواجهة سريعة الاستجابة أثناء التحميل */
const http = require('http');
const fs = require('fs');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let mid = 0;
    const pending = new Map();
    const events = [];
    ws.addEventListener('open', () => resolve({
      send(method, params) {
        return new Promise((res, rej) => {
          const i = ++mid;
          pending.set(i, { res, rej });
          ws.send(JSON.stringify({ id: i, method, params: params || {} }));
        });
      },
      events,
      close() { try { ws.close(); } catch (_e) {} }
    }));
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
      } else if (msg.method) {
        events.push(msg);
      }
    });
    ws.addEventListener('error', () => reject(new Error('ws error')));
  });
}

async function evalIn(cdp, expr) {
  const t0 = Date.now();
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  const latency = Date.now() - t0;
  if (r.exceptionDetails) throw new Error('EVAL: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return { value: r.result.value, latency };
}

function parseOr(v) {
  return typeof v === 'string' ? JSON.parse(v) : v;
}

(async () => {
  const results = [];
  const ok = (name, cond, extra = '') => {
    results.push(`${cond ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`);
  };
  await sleep(4000);

  const targets = await getTargets();
  const mainT = targets.find(t => t.url.includes('index.html'));
  if (!mainT) throw new Error('main window target not found');
  const main = await connect(mainT.webSocketDebuggerUrl);
  await main.send('Runtime.enable');
  main.events.length = 0;

  // حد السرعة 512KB/s + ملف 12.5MB = ~25 ثانية نافذة قياس
  await evalIn(main, `window.pdm.invoke('setSettings', {maxSpeedKB: 512})`);
  await evalIn(main, `window.pdm.invoke('add', {url:'https://proof.ovh.net/files/100Mb.dat', filename:'freeze-test.dat'})`);
  await sleep(2500);

  // 1) قياس حركة شريط التقدم + استجابة الواجهة أثناء التحميل
  const widths = [];
  let maxLatency = 0;
  for (let i = 0; i < 8; i++) {
    const r = await evalIn(main, `(function(){
      const bar = document.querySelector('.task .bar > div');
      return bar ? bar.style.width : 'NO-BAR';
    })()`);
    maxLatency = Math.max(maxLatency, r.latency);
    if (r.value !== 'NO-BAR') widths.push(r.value);
    await sleep(900);
  }
  const distinct = new Set(widths).size;
  ok('شريط التقدم يتحرك حياً (4+ قيم مختلفة)', distinct >= 4, `قيم: ${widths.join(', ')}`);
  ok('الواجهة سريعة الاستجابة أثناء التحميل (<200ms)', maxLatency < 200, `أقصى استجابة: ${maxLatency}ms`);

  // 2) عداد السرعة حي
  const speedNow = await evalIn(main, `document.querySelector('#totalSpeed').textContent`);
  ok('عداد السرعة نشط', !/\b0 B\//.test(speedNow), speedNow);

  // 3) بيانات المهمة حية
  const live = parseOr(await evalIn(main, `(async () => {
    const l = await window.pdm.invoke('list');
    const t = l.find(x => x.status === 'downloading');
    return {received: t && t.received, speed: t && t.speed, pct: t && t.percent};
  })()`));
  ok('بيانات المهمة تتحدث حياً', live.received > 0 || (live.pct && live.pct > 0), JSON.stringify(live));

  // تنظيف
  await evalIn(main, `(async () => {
    window.pdm.invoke('pauseAll');
    await new Promise(r=>setTimeout(r,500));
    const l = await window.pdm.invoke('list');
    for (const t of l) {
      if (t.filename === 'freeze-test.dat') await window.pdm.invoke('remove', {id: t.id, deleteFile: true});
    }
    window.pdm.invoke('setSettings', {maxSpeedKB: 0});
    window.pdm.invoke('clearCompleted');
  })()`);

  const out = results.join('\n');
  console.log(out);
  fs.writeFileSync(process.env.TEMP + '\\cdp3-results.txt', out);
  process.exit(0);
})().catch(e => { console.error('CDP3-FAIL:', e.message); process.exit(1); });
