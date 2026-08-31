'use strict';
/* محاكاة إضافة المتصفح: إرسال رابط عبر الخادم المحلي كما في Native Messaging */
const http = require('http');

const payload = JSON.stringify({
  url: 'https://proof.ovh.net/files/1Mb.dat',
  referrer: 'https://example.com/page',
  filename: 'browser-file.dat'
});

const req = http.request({
  host: '127.0.0.1',
  port: 45762,
  path: '/add',
  method: 'POST',
  headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
}, res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => { console.log('HTTP', res.statusCode, b); process.exit(0); });
});
req.on('error', e => { console.error('FAIL:', e.message); process.exit(1); });
req.end(payload);
