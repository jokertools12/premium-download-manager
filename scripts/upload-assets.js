'use strict';
/* رفع ملف التثبيت EXE إلى الـ Release (الأصول الأخرى موجودة) */
const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');

const out = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n', encoding: 'utf8' });
const token = out.match(/^password=(.+)$/m)[1].trim();
const name = 'PremiumDM-Setup-1.0.0.exe';
const BASE = 'https://uploads.github.com/repos/jokertools12/premium-download-manager/releases/380163653/assets';

const data = fs.readFileSync('dist/' + name);
const u = new URL(BASE + '?name=' + encodeURIComponent(name));
const req = https.request({
  method: 'POST', hostname: u.hostname, path: u.pathname + u.search,
  headers: {
    'authorization': 'token ' + token, 'user-agent': 'pdm-up',
    'accept': 'application/vnd.github+json', 'content-type': 'application/octet-stream',
    'content-length': data.length
  }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log(name, 'STATUS', res.statusCode, '(' + Math.round(data.length / 1024 / 1024) + 'MB)');
    if (res.statusCode >= 400) return console.error(d.slice(0, 300));
    console.log('DONE');
  });
});
req.on('error', e => console.error('ERR', e.message));
req.write(data);
req.end();