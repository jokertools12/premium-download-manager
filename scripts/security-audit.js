'use strict';

const fs = require('fs');
const path = require('path');

console.log('🔍 تشغيل الفحص الأمني الآلي (Electron Security & Hardening Audit - المرحلة 7.3)...\n');

let issues = 0;
let passed = 0;

function check(title, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${title}`);
    passed++;
  } else {
    console.error(`  ✗ ${title} - ${detail}`);
    issues++;
  }
}

// 1. فحص main.js
const mainJsPath = path.join(__dirname, '..', 'src', 'main', 'main.js');
if (fs.existsSync(mainJsPath)) {
  const mainContent = fs.readFileSync(mainJsPath, 'utf8');

  check(
    'contextIsolation مفعّل في كافة النوافذ',
    mainContent.includes('contextIsolation: true') && !mainContent.includes('contextIsolation: false')
  );

  check(
    'nodeIntegration معطّل في واجهة العرض',
    mainContent.includes('nodeIntegration: false') && !mainContent.includes('nodeIntegration: true')
  );

  check(
    'sandbox مفعّل لحماية العمليات المعزولة',
    mainContent.includes('sandbox: true')
  );

  check(
    'منع فتح النوافذ الخارجية غير المصرح بها (setWindowOpenHandler)',
    mainContent.includes('setWindowOpenHandler') && mainContent.includes("action: 'deny'")
  );

  check(
    'تقييد أذونات الأجهزة عبر setPermissionRequestHandler',
    mainContent.includes('setPermissionRequestHandler')
  );

  check(
    'تطبيق سياسة أمان المحتوى الصارمة (Content-Security-Policy)',
    mainContent.includes('content-security-policy')
  );
} else {
  check('وجود ملف main.js', false, 'الملف مفقود');
}

// 2. فحص index.html
const indexHtmlPath = path.join(__dirname, '..', 'src', 'renderer', 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
  check(
    'وجود ترويسة CSP داخل index.html',
    htmlContent.includes('http-equiv="Content-Security-Policy"')
  );
  check(
    'تعطيل eval والسكربتات الخارجية في CSP',
    !htmlContent.includes("'unsafe-eval'")
  );
}

// 3. فحص preload.js
const preloadPath = path.join(__dirname, '..', 'src', 'preload.js');
if (fs.existsSync(preloadPath)) {
  const preloadContent = fs.readFileSync(preloadPath, 'utf8');
  check(
    'استخدام contextBridge حصرياً وتجنب تسريب ipcRenderer المباشر',
    preloadContent.includes('contextBridge.exposeInMainWorld') && !preloadContent.includes('window.ipcRenderer =')
  );
}

console.log(`\n========================================`);
console.log(`نتيجة التدقيق الأمني: ${passed} نجاح / ${issues} تحذيرات أو أخطاء حرجة.`);
if (issues === 0) {
  console.log('✅ المعايير الأمنية مطابقة لـ Electron Hardening بنجاح 100%!');
  process.exit(0);
} else {
  console.error('❌ توجد ملاحظات أمنية يجب تصحيحها!');
  process.exit(1);
}
