'use strict';
/* فحص مزامنة الحذف: بعد الضغط على 🗑️ يجب أن تختفي البطاقة من الواجهة فوراً
   (هذا كان خطأ المستخدم: المهمة تُحذف من النواة لكن تبقى ظاهرة في القائمة) */
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
  if (r.exceptionDetails) throw new Error('EVAL: ' + JSON.stringify(r.exceptionDetails).slice(0, 250));
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
  const main = await connect(mainT.webSocketDebuggerUrl);
  await main.send('Runtime.enable');
  main.events.length = 0;

  // 1) أضف مهمة وانتظر اكتمالها
  await evalIn(main, `window.pdm.invoke('add', {url:'https://proof.ovh.net/files/1Mb.dat', filename:'sync-del-1.dat'})`);
  await evalIn(main, `window.pdm.invoke('add', {url:'https://proof.ovh.net/files/1Mb.dat', filename:'sync-del-2.dat'})`);
  await sleep(5000);

  // 2) اضغط 🗑️ على أول مهمة → يجب أن تختفي بطاقتها من الواجهة فوراً
  const del1 = await evalIn(main, `(async () => {
    const b = document.querySelector('[data-act="remove"]');
    if (!b) return 'NO-BUTTON';
    const id = b.dataset.id;
    const before = document.querySelectorAll('.task').length;
    b.click();
    await new Promise(r=>setTimeout(r,2000));
    const after = document.querySelectorAll('.task').length;
    const goneFromDOM = !document.querySelector('.task[data-id="' + id + '"]');
    return JSON.stringify({before, after, goneFromDOM});
  })()`);
  ok('زر 🗑️ يخفي البطاقة من الواجهة فوراً', /"goneFromDOM":true/.test(del1) && /"after":1/.test(del1), del1);

  // 3) اضغط 🗑️ على الثانية
  const del2 = await evalIn(main, `(async () => {
    const b = document.querySelector('[data-act="remove"]');
    if (!b) return 'NO-BUTTON';
    b.click();
    await new Promise(r=>setTimeout(r,2000));
    const after = document.querySelectorAll('.task').length;
    return JSON.stringify({after});
  })()`);
  ok('الحذف الثاني 🗑️', /"after":0/.test(del2), del2);

  // 4) 🧹 المسح: أضف 2 مكتملة ثم امسح
  await evalIn(main, `window.pdm.invoke('add', {url:'https://proof.ovh.net/files/1Mb.dat', filename:'sync-c1.dat'})`);
  await evalIn(main, `window.pdm.invoke('add', {url:'https://proof.ovh.net/files/1Mb.dat', filename:'sync-c2.dat'})`);
  await sleep(5000);
  const cleared = await evalIn(main, `(async () => {
    const before = document.querySelectorAll('.task').length;
    document.querySelector('#btnClear').click();
    await new Promise(r=>setTimeout(r,2000));
    const after = document.querySelectorAll('.task').length;
    return JSON.stringify({before, after});
  })()`);
  ok('زر المسح 🧹 يخفي المكتملة من الواجهة', /"after":0/.test(cleared), cleared);

  // 5) إزالة أثناء التحميل (يجب أن يتوقف ثم يختفي بسرعة)
  await evalIn(main, `window.pdm.invoke('add', {url:'https://proof.ovh.net/files/100Mb.dat', filename:'sync-live.dat'})`);
  await sleep(3000);
  const removeLive = await evalIn(main, `(async () => {
    const b = document.querySelector('[data-act="remove"]');
    if (!b) return 'NO-BUTTON';
    b.click();
    await new Promise(r=>setTimeout(r,6000));
    const after = document.querySelectorAll('.task').length;
    return JSON.stringify({after});
  })()`);
  ok('حذف مهمة أثناء التحميل يتوقف ويختفي', /"after":0/.test(removeLive), removeLive);

  // 6) أخطاء JavaScript
  const jsErrors = main.events.filter(e => e.method === 'Runtime.exceptionThrown');
  ok('لا أخطاء JavaScript', jsErrors.length === 0, jsErrors.map(e => JSON.stringify(e.params.exceptionDetails.exception).slice(0, 130)).join(' || '));

  const out = results.join('\n');
  console.log(out);
  fs.writeFileSync(process.env.TEMP + '\\sync-results.txt', out);
  process.exit(0);
})().catch(e => { console.error('SYNC-FAIL:', e.message); process.exit(1); });
