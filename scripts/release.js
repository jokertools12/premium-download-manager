'use strict';

/* مساعد الإصدار: يجهز نسخة جديدة خطوة بخطوة
   الاستخدام:
     node scripts/release.js            ← بناء محلي فقط (بدون نشر)
     node scripts/release.js --publish  ← بناء + نشر على GitHub (يتطلب GH_TOKEN)
*/

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const publishMode = process.argv.includes('--publish');
const type = process.argv.includes('--minor') ? 'minor' : process.argv.includes('--major') ? 'major' : 'patch';

function run(cmd, label) {
  console.log('\n▶ ' + (label || cmd));
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

(async () => {
  // 1) تحقق من نظيفية git
  try {
    const status = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
    if (status) {
      console.log('⚠ هناك تغييرات غير محفوظة في Git. سيتم حفظها تلقائياً برسالة الإصدار.');
    }
  } catch (_e) { /* ليس مستودع git بعد */ }

  // 2) ارفع رقم الإصدار
  run(`npm version ${type} --no-git-tag-version`, 'رفع رقم الإصدار (' + type + ')');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = pkg.version;

  // 3) اختبر
  run('node test/queue-test.js', 'اختبار سريع (طابور - بدون إنترنت)');

  // 4) نظّف وابنِ
  run('node scripts/clean.js', 'تنظيف مخرجات البناء القديمة');
  if (publishMode) {
    if (!process.env.GH_TOKEN) {
      console.error('\n✖ GH_TOKEN غير مضبوط! اضبطه أولاً:');
      console.error('  PowerShell:  $env:GH_TOKEN="ghp_رمزك"');
      console.error('  CMD:         set GH_TOKEN=ghp_رمزك');
      process.exit(1);
    }
    run('npx electron-builder --publish always', 'بناء + نشر v' + version + ' إلى GitHub');
  } else {
    run('npx electron-builder', 'بناء v' + version + ' (محلي فقط)');
  }

  console.log('\n✅ اكتمل البناء v' + version);
  if (!publishMode) {
    console.log('📦 الملفات في dist/ — ارفعها يدوياً إلى GitHub Releases (exe + latest.yml + blockmap)');
  } else {
    console.log('🌐 راجع المسودة في GitHub → Releases → أضف ملاحظات الإصدار → Publish');
    console.log('📥 لا تنسَ حفظ تغييرات Git: git add -A && git commit -m "v' + version + '" && git push');
  }
})().catch(e => { console.error('✖ فشل:', e.message); process.exit(1); });
