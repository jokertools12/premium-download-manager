'use strict';

/* وضع مضيف Native Messaging داخل التطبيق المثبت:
   المتصفح يشغّل البرنامج نفسه بوسيط chrome-extension://... 
   فنتعرف عليه، نقرأ رسالة الماغنت من stdin، نرسلها للنسخة العاملة
   عبر الخادم المحلي 45762 (أو نشغل البرنامج بالرابط إن لم يكن شغالاً)، ثم نخرج. */

const http = require('http');
const { app } = require('electron');

function reply(obj) {
  try {
    const out = Buffer.from(JSON.stringify(obj), 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(out.length, 0);
    process.stdout.write(len);
    process.stdout.write(out);
  } catch (_e) {}
  app.exit(0);
}

function relay(msg) {
  return new Promise(resolve => {
    const payload = JSON.stringify(msg);
    const req = http.request({
      host: '127.0.0.1',
      port: 45762,
      path: '/add',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
    }, res => {
      res.resume();
      res.on('end', () => resolve(true));
    });
    req.on('error', () => resolve(false));
    req.end(payload);
    setTimeout(() => resolve(false), 3000);
  });
}

function ping() {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port: 45762, path: '/ping' }, res => {
      res.resume();
      res.on('end', () => resolve(true));
    });
    req.on('error', () => resolve(false));
    setTimeout(() => resolve(false), 2000);
  });
}

function readMessage(cb) {
  const chunks = [];
  let total = 0;
  let expectedLen = null;

  const onReadable = () => {
    let chunk;
    while ((chunk = process.stdin.read()) !== null) {
      chunks.push(chunk);
      total += chunk.length;
      if (expectedLen === null && total >= 4) {
        const header = Buffer.concat(chunks);
        expectedLen = header.readUInt32LE(0);
        if (expectedLen === 0 || expectedLen > 10 * 1024 * 1024) {
          process.stdin.removeListener('readable', onReadable);
          return cb(null);
        }
      }
      if (expectedLen !== null && total >= 4 + expectedLen) {
        process.stdin.removeListener('readable', onReadable);
        const all = Buffer.concat(chunks);
        const body = all.subarray(4, 4 + expectedLen);
        try {
          cb(JSON.parse(body.toString('utf8')));
        } catch (_e) {
          cb(null);
        }
        return;
      }
    }
  };
  process.stdin.on('readable', onReadable);
  onReadable();
}

module.exports = function runNativeHostMode() {
  readMessage(async msg => {
    // رسالة فحص حالة من نافذة الإضافة المنبثقة
    if (msg && msg.ping) {
      const running = await ping();
      reply({ ok: true, running, version: app.getVersion() });
      return;
    }
    if (!msg || !msg.url) return reply({ ok: false });

    const okRelay = await relay(msg);
    if (okRelay) return reply({ ok: true });

    // البرنامج غير شغال: شغّله بالرابط (second-instance يعالجها)
    try {
      const { spawn } = require('child_process');
      spawn(process.execPath, [msg.url], { detached: true, stdio: 'ignore' }).unref();
      await new Promise(r => setTimeout(r, 2500));
      reply({ ok: true, launched: true });
    } catch (_e) {
      reply({ ok: false });
    }
  });
};
