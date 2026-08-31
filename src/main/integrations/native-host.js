'use strict';

// جسر Native Messaging: يقرأ رسالة JSON من stdin (المتصفح) ويرسلها للبرنامج
// عبر الخادم المحلي 127.0.0.1:45762 ثم يرد على المتصفح ويخرج.
const http = require('http');

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

function finish() {
  try {
    const out = Buffer.from(JSON.stringify({ ok: true }), 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(out.length, 0);
    process.stdout.write(len);
    process.stdout.write(out);
  } catch (_e) {}
  process.exit(0);
}

readMessage(msg => {
  if (!msg || !msg.url) return finish();
  const payload = JSON.stringify(msg);
  const req = http.request({
    host: '127.0.0.1',
    port: 45762,
    path: '/add',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload)
    }
  }, () => finish());
  req.on('error', () => finish());
  req.end(payload);
  // أمان زمني: لا نبقى معلقاً
  setTimeout(finish, 4000).unref();
});
