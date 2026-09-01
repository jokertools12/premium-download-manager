'use strict';
/* نشر Release على GitHub تلقائياً (v1.0.0 + رفع ملفات dist)
   الاستخدام: node scripts/publish-release.js
   يحتاج رمز GitHub في متغير البيئة GH_TOKEN (أو يُستخرج من Git Credential Manager). */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO = 'jokertools12/premium-download-manager';
const TAG = process.argv[2] || 'v1.0.0';
const NAME = process.argv[3] || 'v1.0.0 — الإصدار الأول الكامل';
const BODY = process.argv[4] || '## Premium Download Manager v1.0.0\n\n- محرك تحميل متعدد الاتصالات (32)\n- استئناف التحميل + مصادر بديلة\n- مستخرج فيديوهات (yt-dlp) + HLS + دمج ffmpeg\n- تورنت + قوائم تشغيل + نافذة عائمة\n- إضافة متصفح (اعتراض + كليك يمين)\n- 3 لغات (عربي/English/Türkçe)\n- تحديث تلقائي';

// جلب الرمز: من GH_TOKEN أو من Git Credential Manager
function getToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    const out = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n', encoding: 'utf8' });
    const m = out.match(/^password=(.+)$/m);
    if (m && m[1]) return m[1].trim();
  } catch (_e) {}
  throw new Error('لا يوجد رمز GitHub. اضبط GH_TOKEN أو سجّل دخول Git.');
}

function api(method, urlOrPath, { token, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    // إذا كان رابطاً كاملاً نستخدمه كما هو، وإلا نضيف بادئة api.github.com
    const u = /^https?:\/\//i.test(urlOrPath) ? new URL(urlOrPath) : new URL('https://api.github.com' + urlOrPath);
    const req = https.request({
      method, hostname: u.hostname, path: u.pathname + u.search,
      headers: {
        'authorization': 'token ' + token,
        'user-agent': 'PDM-Release-Script',
        'accept': 'application/vnd.github+json',
        ...headers
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const obj = text ? JSON.parse(text) : {};
        if (res.statusCode >= 400) return reject(new Error(`${method} ${urlOrPath.slice(0, 80)} → ${res.statusCode}: ${JSON.stringify(obj).slice(0, 200)}`));
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
  const contentType = name.endsWith('.exe') ? 'application/octet-stream'
    : name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream';
  const data = fs.readFileSync(filePath);
  return api('POST', uploadUrl, {
    token,
    headers: { 'content-type': contentType, 'content-length': size },
    body: data
  });
}

(async () => {
  const token = getToken();
  console.log('✓ /' + ' حصلت على الرمز (' + token.slice(0, 4) + '...)');

  // 1) إنشاء الـ Release
  console.log('إنشاء Release ' + TAG + ' ...');
  let release;
  try {
    release = await api('POST', `/repos/${REPO}/releases`, {
      token,
      body: JSON.stringify({ tag_name: TAG, name: NAME, body: BODY, draft: false, prerelease: false })
    });
  } catch (e) {
    if (/already_exists/i.test(e.message)) {
      console.log('Release موجود مسبقاً — سأرفع الأصول إن نقصت.');
      // نجلب الـ Release بالوسم
      release = await api('GET', `/repos/${REPO}/releases/tags/${encodeURIComponent(TAG)}`, { token });
    } else throw e;
  }
  console.log('Release id=' + release.id);

  // 2) رفع الأصول
  const uploadUrl = release.upload_url.replace('{?name,label}', '');
  const files = [
    'dist/PremiumDM-Setup-1.0.0.exe',
    'dist/PremiumDM-Setup-1.0.0.exe.blockmap',
    'dist/latest.yml'
  ];
  for (const f of files) {
    if (!fs.existsSync(f)) { console.log('تخطي مفقود: ' + f); continue; }
    const name = path.basename(f);
    console.log('رفع ' + name + ' ...');
    await uploadAsset(token, uploadUrl + '?name=' + encodeURIComponent(name), f, name);
    console.log('  ✓ ' + name);
  }
  console.log('اكتمل النشر! رابط الـ Release:');
  console.log(release.html_url);
})().catch(e => { console.error('فشل: ' + e.message); process.exit(1); });