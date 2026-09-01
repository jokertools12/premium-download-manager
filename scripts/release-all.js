'use strict';
/* ═══════════════════════════════════════════════════════════
   رفع التحديث الآلي — Premium Download Manager
   الاستخدام:  node scripts/release-all.js [رقم-الإصدار]
   مثال:       node scripts/release-all.js 1.0.3
   تشغل تلقائيا من upload.bat
   ═══════════════════════════════════════════════════════════ */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const REPO = 'jokertools12/premium-download-manager';
const OWNER = 'jokertools12';
const PKG = path.join(__dirname, '..', 'package.json');
const OUTDIR = path.join(__dirname, '..', 'build-out');
const rootDir = path.join(__dirname, '..');

let TOKEN = '';
try { TOKEN = fs.readFileSync(path.join(os.homedir(), '.pdm-gh-token'), 'utf8').trim(); } catch (_) {}
if (!TOKEN && process.env.GH_TOKEN) TOKEN = process.env.GH_TOKEN;

function log(m) { console.log(m); }
function step(n, m) { log('\n── [' + n + '/6] ' + m); }
function getVersion() { return JSON.parse(fs.readFileSync(PKG, 'utf8')).version; }
function setVersion(v) {
  const p = JSON.parse(fs.readFileSync(PKG, 'utf8'));
  p.version = v;
  fs.writeFileSync(PKG, JSON.stringify(p, null, 2) + '\n', 'utf8');
}
function git(args) {
  return execSync('git ' + args, {
    cwd: rootDir, encoding: 'utf8', timeout: 240000, windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  });
}
function gitPush(ref) {
  if (TOKEN) {
    try {
      const url = 'https://' + OWNER + ':' + encodeURIComponent(TOKEN) + '@github.com/' + REPO + '.git';
      const r = execSync('git push --force ' + JSON.stringify(url) + ' ' + ref + ' 2>&1', {
        cwd: rootDir, encoding: 'utf8', timeout: 240000, windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      });
      return { ok: true, via: 'token', out: r.trim().split('\n').slice(-2).join(' | ') };
    } catch (e) { log('   (الدفع بالرمز تعذر — نجرب GCM...)'); }
  }
  const r = execSync('git push --force origin ' + ref + ' 2>&1', {
    cwd: rootDir, encoding: 'utf8', timeout: 240000, windowsHide: true
  });
  return { ok: true, via: 'gcm', out: r.trim().split('\n').slice(-2).join(' | ') };
}

function api(method, urlOrPath, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = /^https?:\/\//i.test(urlOrPath) ? new URL(urlOrPath) : new URL('https://api.github.com' + urlOrPath);
    const req = https.request({
      method, hostname: u.hostname, path: u.pathname + u.search,
      headers: {
        'authorization': 'token ' + TOKEN,
        'user-agent': 'PDM-Release',
        'accept': 'application/vnd.github+json',
        'content-type': 'application/json',
        ...headers
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let obj = null;
        try { obj = text ? JSON.parse(text) : null; } catch (_) {}
        if (res.statusCode >= 400) {
          return reject(new Error(method + ' → ' + res.statusCode + ': ' + JSON.stringify(obj || text).slice(0, 200)));
        }
        resolve(obj);
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function uploadAsset(uploadBase, filePath, fileName) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(filePath);
    const u = new URL(uploadBase + '?name=' + encodeURIComponent(fileName));
    const req = https.request({
      method: 'POST', hostname: u.hostname, path: u.pathname + u.search,
      headers: {
        'authorization': 'token ' + TOKEN,
        'user-agent': 'PDM-Release',
        'content-type': 'application/octet-stream',
        'content-length': stat.size
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          let msg = text;
          try { msg = JSON.parse(text).message || text; } catch (_) {}
          if (msg.includes('already_exists')) return resolve({ alreadyExists: true });
          return reject(new Error('Upload ' + res.statusCode + ': ' + msg));
        }
        resolve(JSON.parse(text));
      });
    });
    req.on('error', reject);
    fs.createReadStream(filePath).pipe(req);
  });
}

function buildBody(version) {
  return '## 📥 Premium Download Manager v' + version + '\n\n' +
    '### ما الجديد\n- تحسينات عامة وإصلاحات\n\n' +
    '### التثبيت\n1. حمل ملف `PremiumDM-Setup-' + version + '.exe`\n' +
    '2. شغل المثبت (لن يحذف بياناتك)\n\n' +
    '### التحديث التلقائي\nإذا كان لديك البرنامج مثبتا — سيحدث تلقائيا عند فتحه.\n';
}

(async () => {
  if (!TOKEN) {
    log('⚠️ لا يوجد رمز وصول. أضف الرمز في: %USERPROFILE%\.pdm-gh-token');
    log('   أو شغل: set GH_TOKEN=رمزك');
  }

  const argVersion = (process.argv[2] || '').trim();
  if (argVersion) { setVersion(argVersion); log('✓ رقم الإصدار: ' + argVersion); }
  const version = getVersion();
  const tag = 'v' + version;
  log('== الإصدار: ' + version + ' ==');

  // [1/6] البناء
  step(1, 'بناء ملف التثبيت EXE...');
  try { execSync('taskkill /F /IM electron.exe 2>nul', { stdio: 'ignore' }); } catch (_) {}
  try { execSync('taskkill /F /IM "Premium Download Manager.exe" 2>nul', { stdio: 'ignore' }); } catch (_) {}
  if (fs.existsSync(OUTDIR)) fs.rmSync(OUTDIR, { recursive: true, force: true });
  execSync('node_modules\\.bin\\electron-builder --win --publish never --config.directories.output=build-out', {
    cwd: rootDir, stdio: 'inherit', timeout: 600000, windowsHide: true
  });
  const exeFile = fs.readdirSync(OUTDIR).find(f => f.endsWith('.exe'));
  if (!exeFile) throw new Error('لم ينتج البناء ملف exe!');
  log('✓ اكتمل البناء: ' + exeFile + ' (' + Math.round(fs.statSync(path.join(OUTDIR, exeFile)).size / 1048576) + 'MB)');

  // [2/6] التزام الكود
  step(2, 'التزام الكود...');
  git('add -A');
  try { git('commit -m "release: v' + version + '"'); }
  catch (_) { log('   (لا تغييرات جديدة)'); }

  // [3/6] دفع الكود
  step(3, 'دفع الكود إلى GitHub...');
  const p1 = gitPush('main');
  log('✓ رفع الكود (عبر ' + p1.via + '): ' + p1.out);

  // [4/6] الوسم
  step(4, 'رفع الوسم ' + tag + '...');
  try { git('tag -d ' + tag); } catch (_) {}
  git('tag ' + tag);
  const p2 = gitPush(tag);
  log('✓ رفع الوسم (عبر ' + p2.via + ')');

  // [5/6] الـRelease
  step(5, 'إنشاء الـRelease...');
  let release;
  try {
    release = await api('POST', `/repos/${REPO}/releases`, {
      body: JSON.stringify({
        tag_name: tag,
        name: tag + ' — Premium Download Manager',
        body: buildBody(version),
        draft: false,
        prerelease: false
      })
    });
    log('✓ أنشئ الـRelease');
  } catch (e) {
    release = await api('GET', `/repos/${REPO}/releases/tags/${encodeURIComponent(tag)}`);
    log('✓ الـRelease موجود — سأرفع الأصول');
  }

  // [6/6] رفع الأصول
  step(6, 'رفع الملفات (exe + latest.yml + blockmap)...');
  const uploadBase = release.upload_url.replace('{?name,label}', '');
  for (const f of fs.readdirSync(OUTDIR)) {
    if (!/\.(exe|blockmap|yml)$/i.test(f)) continue;
    const full = path.join(OUTDIR, f);
    if (!fs.statSync(full).isFile()) continue;
    log('  ⏫ ' + f + ' (' + Math.round(fs.statSync(full).size / 1048576) + 'MB)...');
    try {
      await uploadAsset(uploadBase, full, f);
      log('  ✓ ' + f);
    } catch (e) {
      if (e.message && e.message.includes('already_exists')) log('  (موجود — تخطي)');
      else throw e;
    }
  }

  const url = release.html_url || ('https://github.com/' + REPO + '/releases/tag/' + tag);
  log('\n════════════════════════════════════════');
  log('🎉 تم رفع التحديث بنجاح!');
  log('🔗 ' + url);
  log('📥 كل المستخدمين المثبتين سيستلمون التحديث تلقائيا');
  log('════════════════════════════════════════');
})().catch(e => {
  console.error('\n❌ فشل: ' + e.message);
  console.error('   جرب مجددا أو راجع DEVELOPER.md');
  process.exit(1);
});
