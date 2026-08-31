'use strict';
/* فحص حي v2: حد السرعة 512KB/s + ملف 10MB = نافذة زمنية ~20 ثانية للفحص الفعلي */
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
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('EVAL: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
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

  // 0) فعّل حد السرعة 512KB/s لضمان نافذة زمنية كافية
  await evalIn(main, `window.pdm.invoke('setSettings', {maxSpeedKB: 512})`);

  // 1) أضف تحميل 10MB (يستغرق ~20 ثانية بحد 512KB/s)
  const addRes = await evalIn(main, `(async () => {
    const r = await window.pdm.invoke('add', {url:'https://proof.ovh.net/files/10Mb.dat', filename:'cdp-speed.dat'});
    return JSON.stringify(r);
  })()`);
  await sleep(2500);

  // 2) عداد السرعة في الشريط + سرعة المهمة (3 عينات)
  let totalSpeedText = null, taskSpeed = 0;
  for (let i = 0; i < 3; i++) {
    totalSpeedText = await evalIn(main, `document.querySelector('#totalSpeed').textContent`);
    const r2 = JSON.parse(await evalIn(main, `(async () => { const l = await window.pdm.invoke('list'); return JSON.stringify(l.filter(x=>x.status==='downloading').map(x=>x.speed)); })()`));
    if (r2.length) taskSpeed = Math.max(taskSpeed, ...r2);
    if (taskSpeed > 0 && !/\b0 B\//.test(totalSpeedText)) break;
    await sleep(800);
  }
  ok('عداد السرعة في الشريط > 0', !/\b0 B\//.test(totalSpeedText || '0 B/'), totalSpeedText);
  ok('سرعة المهمة > 0', taskSpeed > 0, String(taskSpeed) + ' B/s');
  // 3) زر الإيقاف أثناء التحميل
  const paused = await evalIn(main, `(async () => {
    const b = document.querySelector('[data-act="pause"]');
    if (!b) return 'NO-PAUSE-BUTTON';
    const id = b.dataset.id;
    b.click();
    await new Promise(r=>setTimeout(r,1500));
    const l = await window.pdm.invoke('list');
    const t = l.find(x=>x.id===id);
    return t ? t.status : 'GONE';
  })()`);
  ok('زر الإيقاف ⏸', paused === 'paused', paused);

  // 4) زر الاستئناف
  const resumed = await evalIn(main, `(async () => {
    const b = document.querySelector('[data-act="resume"]');
    if (!b) return 'NO-RESUME-BUTTON';
    const id = b.dataset.id;
    b.click();
    await new Promise(r=>setTimeout(r,1500));
    const l = await window.pdm.invoke('list');
    const t = l.find(x=>x.id===id);
    return t ? t.status : 'GONE';
  })()`);
  ok('زر الاستئناف ▶', ['downloading','queued'].includes(resumed), resumed);

  // 5) النافذة العائمة أثناء التحميل
  await evalIn(main, `window.pdm.invoke('float:toggle')`);
  await sleep(2500);
  const targets2 = await getTargets();
  const floatT = targets2.find(t => t.url.includes('float.html'));
  if (!floatT) {
    ok('النافذة العائمة تُفتح', false, 'float target not found');
  } else {
    const fl = await connect(floatT.webSocketDebuggerUrl);
    await fl.send('Runtime.enable');
    await sleep(2500);
    const f2 = await evalIn(fl, `JSON.stringify({name: document.getElementById('fName').textContent, speed: document.getElementById('fSpeed').textContent, pct: document.getElementById('fPct').textContent, count: document.getElementById('fCount').textContent})`);
    const f = JSON.parse(f2);
    ok('النافذة العائمة تعرض الاسم', f.name !== '' && f.name.indexOf('لا') !== 0, f.name);
    ok('النافذة العائمة تعرض سرعة/نسبة', f.pct !== '0%' || f.speed.indexOf('0 B/s') === -1, f2);
    fl.close();
    await evalIn(main, `window.pdm.invoke('float:toggle')`);
  }

  // 6) إيقاف الكل ثم الحذف والمسح
  const removed = await evalIn(main, `(async () => {
    window.pdm.invoke('pauseAll');
    await new Promise(r=>setTimeout(r,800));
    const b = document.querySelector('[data-act="remove"]');
    if (!b) return 'NO-REMOVE-BUTTON';
    const id = b.dataset.id;
    b.click();
    await new Promise(r=>setTimeout(r,1500));
    const l = await window.pdm.invoke('list');
    return JSON.stringify({count: l.length, stillThere: l.some(x=>x.id===id)});
  })()`);
  ok('زر الحذف 🗑️ يزيل المهمة فقط', /"stillThere":false/.test(removed), removed);

  const cleared = await evalIn(main, `(async () => {
    document.querySelector('#btnClear').click();
    await new Promise(r=>setTimeout(r,1500));
    const l = await window.pdm.invoke('list');
    return JSON.stringify({total: l.length, completed: l.filter(x=>x.status==='completed').length});
  })()`);
  const cl = JSON.parse(cleared);
  ok('زر المسح 🧹', cl.completed === 0, cleared);

  // 7) زر إظهار في المجلد + فتح الملف على مهمة مكتملة
  await evalIn(main, `window.pdm.invoke('setSettings', {maxSpeedKB: 0})`);
  await evalIn(main, `window.pdm.invoke('add', {url:'https://proof.ovh.net/files/1Mb.dat', filename:'cdp-c.dat'})`);
  await sleep(4000);
  const folderBtn = await evalIn(main, `(async () => {
    const b = document.querySelector('[data-act="folder"]');
    if (!b) return 'NO-FOLDER-BUTTON';
    b.click();
    await new Promise(r=>setTimeout(r,1200));
    const b2 = document.querySelector('[data-act="open"]');
    if (!b2) return 'NO-OPEN-BUTTON';
    b2.click();
    await new Promise(r=>setTimeout(r,1200));
    return 'BOTH-CLICKED';
  })()`);
  ok('أزرار 🗂️/📂 تعمل بدون أخطاء', folderBtn === 'BOTH-CLICKED', folderBtn);

  // 8) أخطاء JavaScript
  const jsErrors = main.events.filter(e => e.method === 'Runtime.exceptionThrown');
  ok('لا أخطاء JavaScript في الواجهة', jsErrors.length === 0, jsErrors.map(e => JSON.stringify(e.params.exceptionDetails.exception).slice(0, 150)).join(' || '));

  const out = results.join('\n');
  console.log(out);
  fs.writeFileSync(process.env.TEMP + '\\cdp-results.txt', out);
  process.exit(0);
})();
