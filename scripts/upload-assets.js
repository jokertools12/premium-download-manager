'use strict';
/* رفع PremiumDM-Setup-1.0.1.exe + blockmap إلى Release v1.0.1 */
const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tok = fs.readFileSync(path.join(os.homedir(), '.pdm-gh-token'), 'utf8').trim();
const BASE = 'https://uploads.github.com/repos/jokertools12/premium-download-manager/releases/';

function upload(releaseId, name, file) {
  return new Promise((resolve, reject) => {
    const data = fs.readFileSync(file);
    const u = new URL(BASE + releaseId + '/assets?name=' + encodeURIComponent(name));
    const req = https.request({
      method: 'POST', hostname: u.hostname, path: u.pathname + u.search,
      headers: {
        'authorization': 'token ' + tok, 'user-agent': 'pdm-up',
        'accept': 'application/vnd.github+json', 'content-type': 'application/octet-stream',
        'content-length': data.length
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        console.log(name, 'STATUS', res.statusCode, '(' + Math.round(data.length / 1048576) + 'MB)');
        if (res.statusCode >= 400) return reject(new Error(d.slice(0, 200)));
        resolve();
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  // نجد release id من الوسم
  const id = await new Promise((resolve, reject) => {
    const url = 'https://api.github.com/repos/jokertools12/premium-download-manager/releases/tags/v1.0.1';
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname, headers: { 'authorization': 'token ' + tok, 'user-agent': 'pdm-up', 'accept': 'application/vnd.github+json' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).id); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
  console.log('Release ID:', id);
  await upload(id, 'PremiumDM-Setup-1.0.1.exe', 'dist2/PremiumDM-Setup-1.0.1.exe').catch(async e => {
    console.log('exe:', e.message.slice(0, 80));
  });
  await upload(id, 'PremiumDM-Setup-1.0.1.exe.blockmap', 'dist2/PremiumDM-Setup-1.0.1.exe.blockmap').catch(async e => {
    console.log('blockmap:', e.message.slice(0, 80));
  });
  console.log('DONE');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });