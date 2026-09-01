// Upload local build assets to an existing GitHub release
// Usage: node scripts\upload-to-release.js <releaseId> <file1> [file2] ...
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tok = fs.readFileSync(path.join(os.homedir(), '.pdm-gh-token'), 'utf8').trim();

const releaseId = process.argv[2];
const files = process.argv.slice(2).slice(1);
const owner = 'jokertools12';
const repo = 'premium-download-manager';

if (!releaseId || files.length === 0) {
  console.log('Usage: node scripts\\upload-to-release.js <releaseId> <file1> [file2] ...');
  process.exit(1);
}

function upload(fileName) {
  return new Promise((resolve, reject) => {
    const filePath = path.resolve(fileName);
    const name = path.basename(filePath);
    const stat = fs.statSync(filePath);
    const url = `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`;
    const u = new URL(url);
    const headers = {
      'User-Agent': 'pdm-release',
      'Authorization': `token ${tok}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
    };
    console.log(`  Uploading ${name} (${(stat.size/1048576).toFixed(1)}MB)...`);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const body = JSON.parse(d);
          console.log(`    OK: ${body.name} -> ${body.browser_download_url}`);
          resolve(body);
        } else {
          console.log(`    FAIL ${res.statusCode}: ${d}`);
          reject(new Error(`Upload failed: ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    const stream = fs.createReadStream(filePath);
    stream.pipe(req);
    stream.on('end', () => req.end());
  });
}

(async () => {
  console.log(`Uploading ${files.length} file(s) to release ${releaseId}...\n`);
  for (const f of files) {
    if (!fs.existsSync(f)) { console.log(`  SKIP (not found): ${f}`); continue; }
    try { await upload(f); } catch (e) { console.log(`  ERROR: ${e.message}`); }
  }
  console.log('\nDone.');
})();
