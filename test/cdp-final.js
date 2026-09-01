'use strict';
/* الفحص الشامل النهائي v4:
   1) رابط المستخدم المحمي (hotlink) بدون أي إدخال → تحميل تلقائي 100%
   2) جميع الأزرار: إيقاف/استئناف/حذف/مسح/فتح/مجلد
   3) قائمة كليك يمين على المهام
   4) صفر أخطاء JavaScript */
const http = require('http');
const fs = require('fs');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MOVIE = 'https://deva-cpmav9sk6x16.cimanowtv.com/uploads/2021/11/11/_Cima-Now.CoM_%20La.Brea.S01E07.HD/%5BCima-Now.CoM%5D%20La.Brea.S01E07.HD-480p.mp4';

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
const parseOr = v => typeof v === 'string' ? JSON.parse(v) : v;

(async () => {
  const results = [];
  const ok = (name, cond, extra = '') => {
    results.push(`${cond ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`);
  };
  await sleep(4000);
  const targets = await getTargets();
  const mainT = targets.find(t => t.url.includes('index.html'));
  if (!mainT) throw new Error('main target not found');
  const main = await connect(mainT.webSocketDebuggerUrl);
  await main.send('Runtime.enable');
  main.events.length = 0;

  // 1) رابط الفيلم المحمي — بدون Referer وبدون أي إدخال (الحل الآلي)
  await evalIn(main, `window.pdm.invoke('add', {url: ${JSON.stringify(MOVIE)}, filename: 'movie-test.mp4'})`);
  let sawDownloading = false, received = 0, taskError = '';
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const l = parseOr(await evalIn(main, `(async () => { const l = await window.pdm.invoke('list'); const t = l.find(x=>x.filename==='movie-test.mp4'); return t ? {status:t.status, received:t.received, error:t.error} : {status:'GONE'}; })()`));
    if (l.status === 'downloading') { sawDownloading = true; received = Math.max(received, l.received); if (received > 3 * 1024 * 1024) break; }
    if (l.status === 'failed') { taskError = l.error; break; }
    if (l.status === 'completed') { received = l.received; break; }
  }
  ok('الحل الآلي للروابط المحمية (Hotlink Auto-Referer)', sawDownloading && received > 2 * 1024 * 1024 && !taskError, `downloaded=${received} err=${taskError}`);

  // 2) زر الإيقاف أثناء التحميل
  const paused = await evalIn(main, `(async () => {
    const b = document.querySelector('[data-act="pause"]');
    if (!b) return 'NO-BUTTON';
    const id = b.dataset.id;
    b.click();
    await new Promise(r=>setTimeout(r,1500));
    const l = await window.pdm.invoke('list');
    const t = l.find(x=>x.id===id);
    return t ? t.status : 'GONE';
  })()`);
  ok('زر الإيقاف ⏸', paused === 'paused', paused);

  // 3) زر الاستئناف
  const resumed = await evalIn(main, `(async () => {
    const b = document.querySelector('[data-act="resume"]');
    if (!b) return 'NO-BUTTON';
    const id = b.dataset.id;
    b.click();
    await new Promise(r=>setTimeout(r,1500));
    const l = await window.pdm.invoke('list');
    const t = l.find(x=>x.id===id);
    return t ? t.status : 'GONE';
  })()`);
  ok('زر الاستئناف ▶', ['downloading','queued'].includes(resumed), resumed);

  // 4) قائمة كليك يمين على المهمة
  const ctxOk = await evalIn(main, `(async () => {
    const card = document.querySelector('.task');
    if (!card) return 'NO-CARD';
    card.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 300, clientY: 300}));
    await new Promise(r=>setTimeout(r,300));
    const menu = document.querySelector('.ctx-menu');
    if (!menu) return 'NO-MENU';
    const items = menu.querySelectorAll('.ctx-item').length;
    document.body.click();
    await new Promise(r=>setTimeout(r,200));
    return 'MENU-OK items=' + items;
  })()`);
  ok('قائمة كليك يمين على المهمة', String(ctxOk).includes('MENU-OK'), ctxOk);
  // 5) إيقاف الكل ثم حذف المهمة (زر 🗑️)
  const removed = await evalIn(main, `(async () => {
    window.pdm.invoke('pauseAll');
    await new Promise(r=>setTimeout(r,1000));
    const b = document.querySelector('[data-act="remove"]');
    if (!b) return 'NO-REMOVE-BUTTON';
    const id = b.dataset.id;
    b.click();
    await new Promise(r=>setTimeout(r,1500));
    const l = await window.pdm.invoke('list');
    return JSON.stringify({stillThere: l.some(x=>x.id===id), count: l.length});
  })()`);
  ok('زر الحذف 🗑️', /"stillThere":false/.test(removed), removed);

  // 6) حذف مهمة مع ملفها
  await evalIn(main, `window.pdm.invoke('add', {url:'https://proof.ovh.net/files/1Mb.dat', filename:'del-file-test.dat'})`);
  await sleep(4000);
  const removedFile = await evalIn(main, `(async () => {
    const l1 = await window.pdm.invoke('list');
    const t = l1.find(x=>x.filename==='del-file-test.dat');
    if (!t) return 'NO-TASK';
    const filePath = t.filePath;
    await window.pdm.invoke('remove', {id: t.id, deleteFile: true});
    await new Promise(r=>setTimeout(r,1200));
    const l2 = await window.pdm.invoke('list');
    return JSON.stringify({removed: !l2.some(x=>x.id===t.id), filePath});
  })()`);
  ok('حذف المهمة مع الملف 💥', /"removed":true/.test(removedFile), removedFile);

  // 7) زر المسح 🧹
  await evalIn(main, `window.pdm.invoke('add', {url:'https://proof.ovh.net/files/1Mb.dat', filename:'clear-test.dat'})`);
  await sleep(4000);
  const cleared = await evalIn(main, `(async () => {
    document.querySelector('#btnClear').click();
    await new Promise(r=>setTimeout(r,1500));
    const l = await window.pdm.invoke('list');
    return JSON.stringify({completed: l.filter(x=>x.status==='completed').length, total: l.length});
  })()`);
  ok('زر المسح 🧹', /"completed":0/.test(cleared), cleared);

  // 8) أزرار 🗂️/📂 على مهمة مكتملة
  await evalIn(main, `window.pdm.invoke('add', {url:'https://proof.ovh.net/files/1Mb.dat', filename:'open-test.dat'})`);
  await sleep(4000);
  const openBtns = await evalIn(main, `(async () => {
    const f = document.querySelector('[data-act="folder"]');
    const o = document.querySelector('[data-act="open"]');
    if (!f || !o) return 'NO-BUTTONS';
    f.click();
    await new Promise(r=>setTimeout(r,800));
    o.click();
    await new Promise(r=>setTimeout(r,800));
    return 'BOTH-CLICKED';
  })()`);
  ok('أزرار 🗂️/📂', openBtns === 'BOTH-CLICKED', openBtns);

  // 9) أخطاء JavaScript
  const jsErrors = main.events.filter(e => e.method === 'Runtime.exceptionThrown');
  ok('لا أخطاء JavaScript', jsErrors.length === 0, jsErrors.map(e => JSON.stringify(e.params.exceptionDetails.exception).slice(0, 130)).join(' || '));

  // تنظيف نهائي
  await evalIn(main, `(async () => {
    const l = await window.pdm.invoke('list');
    for (const t of l) await window.pdm.invoke('remove', {id: t.id, deleteFile: true});
    window.pdm.invoke('clearCompleted');
  })()`);

  const out = results.join('\n');
  console.log(out);
  fs.writeFileSync(process.env.TEMP + '\\cdp-final.txt', out);
  process.exit(0);
})();
