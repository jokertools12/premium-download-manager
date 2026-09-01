'use strict';
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
  const targets = await getTargets();
  const mainT = targets.find(t => t.url.includes('index.html'));
  const main = await connect(mainT.webSocketDebuggerUrl);
  // الحالة الحالية: هل بقيت مهمة sync-live.dat؟
  const st = await evalIn(main, `(async () => {
    const l = await window.pdm.invoke('list');
    const cards = document.querySelectorAll('.task').length;
    return JSON.stringify({listCount: l.length, statuses: l.map(x=>({f:x.filename, s:x.status})), domCards: cards});
  })()`);
  console.log('STATE =>', st);
  process.exit(0);
})().catch(e => { console.error('CHK-FAIL:', e.message); process.exit(1); });
