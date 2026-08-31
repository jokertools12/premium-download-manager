'use strict';
/* فحص نظام التحديث: حالة IPC + إصدار currentVersion + وضع dev */
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
    ws.addEventListener('open', () => resolve({
      send(method, params) {
        return new Promise((res, rej) => {
          const i = ++mid;
          pending.set(i, { res, rej });
          ws.send(JSON.stringify({ id: i, method, params: params || {} }));
        });
      },
      close() { try { ws.close(); } catch (_e) {} }
    }));
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
      }
    });
    ws.addEventListener('error', () => reject(new Error('ws error')));
  });
}

async function evalIn(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('EVAL: ' + JSON.stringify(r.exceptionDetails).slice(0, 200));
  return r.result.value;
}

(async () => {
  await sleep(3000);
  const targets = await getTargets();
  const mainT = targets.find(t => t.url.includes('index.html'));
  const main = await connect(mainT.webSocketDebuggerUrl);
  await main.send('Runtime.enable');

  // 1) حالة التحديث عبر IPC
  const st = await evalIn(main, `(async () => { return await window.pdm.invoke('update:state'); })()`);
  console.log('update:state =>', JSON.stringify(st));
  if (!st.currentVersion) throw new Error('currentVersion مفقود');

  // 2) فحص يدوي في وضع التطوير → يجب أن يعيد dev
  const chk = await evalIn(main, `(async () => { return await window.pdm.invoke('update:check'); })()`);
  console.log('update:check =>', JSON.stringify(chk));
  if (chk.status !== 'dev') throw new Error('expected dev status, got ' + chk.status);

  // 3) عناصر الواجهة موجودة
  const ui = await evalIn(main, `JSON.stringify({banner: !!document.getElementById('updateBanner'), btn: !!document.getElementById('btnCheckUpdate'), ver: document.getElementById('updVersion').textContent})`);
  console.log('UI =>', ui);

  // 4) الترجمة
  const tr = await evalIn(main, `JSON.stringify({ar: window.t('update.check'), avail: window.t('update.available', {v:'9.9'})})`);
  console.log('i18n =>', tr);

  console.log('UPDATER-OK');
  process.exit(0);
})().catch(e => { console.error('UPD-FAIL:', e.message); process.exit(1); });
