const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tok = fs.readFileSync(path.join(os.homedir(), '.pdm-gh-token'), 'utf8').trim();
const owner = 'jokertools12';
const repo = 'premium-download-manager';

function request(method, urlPath, body, contentType) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.github.com${urlPath}`);
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'User-Agent': 'pdm-release',
      'Authorization': `token ${tok}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': contentType || 'application/vnd.github+json',
    };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d, headers: res.headers }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const r = await request('GET', `/repos/${owner}/${repo}/releases`);
  const rels = JSON.parse(r.body);
  if (!Array.isArray(rels) || rels.length === 0) {
    console.log('No releases found.');
    return;
  }
  rels.forEach(rel => {
    console.log(`\nID=${rel.id}  tag=${rel.tag_name}  published=${rel.published_at ? 'YES' : 'DRAFT'}  assets(${rel.assets.length}):`);
    rel.assets.forEach(a => console.log(`  - ${a.name} (${(a.size/1048576).toFixed(1)}MB)`));
  });
})();
