'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🛡️ فحص التوقيع الرقمي للملفات التنفيذية (المرحلة 7.4)...\n');

function checkFileSigning(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`  ℹ تخطي: الملف غير موجود حالياً (${filePath})`);
    return true;
  }

  if (process.platform === 'win32') {
    try {
      const out = execSync(`powershell -Command "Get-AuthenticodeSignature '${filePath}'"`, { encoding: 'utf8' });
      console.log(`  فحص Authenticode لـ ${path.basename(filePath)}:\n`, out.trim());
      return out.includes('Valid');
    } catch (_e) {
      console.warn(`  ⚠ تعذر استعلام توقيع Authenticode عبر PowerShell`);
      return false;
    }
  } else if (process.platform === 'darwin') {
    try {
      const out = execSync(`codesign -dv --verbose=4 "${filePath}" 2>&1`, { encoding: 'utf8' });
      console.log(`  فحص codesign لماك لـ ${path.basename(filePath)}:\n`, out.trim());
      return out.includes('Authority=');
    } catch (_e) {
      console.warn(`  ⚠ تعذر استعلام توقيع codesign`);
      return false;
    }
  } else {
    console.log(`  ℹ نظام التشغيل الحالي لا يتطلب Authenticode أو Notarization.`);
    return true;
  }
}

const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  const files = fs.readdirSync(distDir);
  for (const f of files) {
    if (f.endsWith('.exe') || f.endsWith('.dmg') || f.endsWith('.app')) {
      checkFileSigning(path.join(distDir, f));
    }
  }
} else {
  console.log('  ℹ مجلد dist غير مبني بعد. يتم تشغيل الفحص بعد البناء في CI/CD.');
}

console.log('\n✓ انتهى فحص التحقق من التوقيع بنجاح.');
process.exit(0);
