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
  const lenBuf = Buffer.alloc(4);
  let read = 0;
  const onLen = () => {
    if (read < 4) return;
    process.stdin.removeListener('readable', onLen);
    const len = lenBuf.readUInt32LE(0);
    if (len === 0 || len > 1024 * 1024) return cb(null);
    const msgBuf = Buffer.alloc(len);
    let got = 0;
    const onMsg = () => {
      const data = process.stdin.read();
      if (!data) return;
      data.copy(msgBuf, got);
      got += data.length;
      if (got >= len) {
        process.stdin.removeListener('readable', onMsg);
        try { cb(JSON.parse(msgBuf.toString('utf8'))); }
        catch (_e) { cb(null); }
      }
    };
    process.stdin.on('readable', onMsg);
    onMsg();
  };
  process.stdin.on('readable', onLen);
  onLen();
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
