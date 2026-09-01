'use strict';
/* نشر Release على GitHub تلقائياً:
   ✓ ينشئ الوسم + الـRelease ✓ يرفع dist/*.exe + *.blockmap + latest.yml
   الاستخدام: node scripts/release-now.js [tag] [اسم-release]
   مثال:      node scripts/release-now.js v1.0.1 "v1.0.1 — إصلاح تقاط المتصفح"
   يحتاج وصول GitHub (يُستخرج من Git Credential Manager تلقائياً). */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO = 'jokertools12/premium-download-manager';
const TAG = process.argv[2] || 'v1.0.1';
const NAME = process.argv[3] || 'v1.0.1 — إصلاح تقاط المتصفح';
const BODY = process.argv[4] || '## Premium Download Manager v1.0.1\n\n- إصلاح ميزة بالتأكيد: المتصفح يُلغي تحميله ويُحوّله للبرنامج\n- مضيف Native Messaging يعمل بوضع --native-host الصحيح\n- اعتراض أذكى وقوي مع إلغاء حقيقي لتحميل المتصفح';

function getToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  const out = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n', encoding: 'utf8' });
  const m = out.match(/^password=(.+)$/m);
  if (m && m[1]) return m[1].trim();
  throw new Error('لا يوجد رمز GitHub');
}

function api(method, urlOrPath, { token, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = /^https?:\/\//i.test(urlOrPath) ? new URL(urlOrPath) : new URL('https://api.github.com' + urlOrPath);
    const req = https.request({
      method, hostname: u.hostname, path: u.pathname + u.search,
      headers: { 'authorization': 'token ' + token, 'user-agent': 'PDM-Release', 'accept': 'application/vnd.github+json', ...headers }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const obj = text ? JSON.parse(text) : {};
        if (res.statusCode >= 400) return reject(new Error(`${method} ${urlOrPath.slice(0, 90)} → ${res.statusCode}: ${JSON.stringify(obj).slice(0, 200)}`));
        resolve(obj);
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function uploadAsset(token, uploadUrl, filePath, name) {
  const size = fs.statSync(filePath).size;
  const contentType = name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream';
  return api('POST', uploadUrl, { token, headers: { 'content-type': contentType, 'content-length': size }, body: fs.readFileSync(filePath) });
}

(async () => {
  const token = getToken();
  console.log('✓ الرمز الذي حصلت عليه (' + token.slice(0, 4) + '...)');

  // 1) الوسم
  try { execSync(`git tag ${TAG}`, { stdio: 'ignore' }); } catch (_e) {}
  execSync(`git push origin ${TAG}`, { stdio: ['ignore', 'inherit', 'inherit'] });
  console.log('✓ الوسم ' + TAG + ' مرفوع');

  // 2) إنشاء/جلب الـRelease
  let release;
  try {
    release = await api('POST', `/repos/${REPO}/releases`, {
      token, body: JSON.stringify({ tag_name: TAG, name: NAME, body: BODY, draft: false, prerelease: false })
    });
    console.log('✓ Release أُنشئ id=' + release.id);
  } catch (e) {
    release = await api('GET', `/repos/${REPO}/releases/tags/${encodeURIComponent(TAG)}`, { token });
    console.log('✓ Release موجود id=' + release.id);
  }

  // 3) رفع الأصول من مجلد الإخراج (dist أو dist2)
  const outDir = fs.existsSync('dist2') ? 'dist2' : 'dist';
  const uploadBase = release.upload_url.replace('{?name,label}', '');
  for (const f of fs.readdirSync(outDir)) {
    if (!/\.(exe|blockmap|yml)$/i.test(f)) continue;
    const full = path.join(outDir, f);
    if (!fs.statSync(full).isFile()) continue;
    console.log('رفع ' + f + ' (' + Math.round(fs.statSync(full).size / 1048576) + 'MB)...');
    try {
      await uploadAsset(token, uploadBase + '?name=' + encodeURIComponent(f), full, f);
      console.log('  ✓ ' + f);
    } catch (e) {
      if (e.message.includes('already_exists')) console.log('  (موجود مسبقاً — تخطي)');
      else throw e;
    }
  }
  console.log('✓ اكتمل: ' + release.html_url);
})().catch(e => { console.error('فشل: ' + e.message); process.exit(1); });