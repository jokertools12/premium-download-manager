'use strict';

// جسر Native Messaging (وضع التطوير): يقرأ رسالة JSON من stdin (المتصفح)
// ويرسلها للبرنامج عبر الخادم المحلي 127.0.0.1:45762 ثم يرد على المتصفح ويخرج.
// يدعم أيضاً رسالة ping من النافذة المنبثقة للإضافة (فحص حالة البرنامج).
const http = require('http');

function reply(obj) {
  try {
    const out = Buffer.from(JSON.stringify(obj), 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(out.length, 0);
    process.stdout.write(len);
    process.stdout.write(out);
  } catch (_e) {}
  process.exit(0);
}

function request(msg) {
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
    http.get({ host: '127.0.0.1', port: 45762, path: '/ping' }, res => {
      res.resume();
      res.on('end', () => resolve(true));
    }).on('error', () => resolve(false));
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

readMessage(async msg => {
  if (!msg) return reply({ ok: false });
  if (msg.ping) return reply({ ok: true, running: await ping() });
  const okRelay = await request(msg);
  if (okRelay) return reply({ ok: true });
  reply({ ok: false });
});
