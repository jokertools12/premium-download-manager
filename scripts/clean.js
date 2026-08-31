'use strict';

/* تنظيف مخرجات البناء والملفات المؤقتة للمشروع
   الاستخدام: npm run clean
   لا يمس أبداً بيانات المستخدم (توجد في %APPDATA%) */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = [
  'dist',                 // مخرجات electron-builder
  'crash-test',           // تطبيق تشخيص الإقلاع
  'node_modules/.cache',  // كاش أدوات البناء
  'test/.tmp'             // مخلفات الاختبارات
];

let removed = 0;
for (const t of TARGETS) {
  const p = path.join(ROOT, t);
  try {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
      console.log('✓ حُذف:', t);
      removed++;
    }
  } catch (e) {
    console.warn('⚠ تعذر حذف:', t, '-', e.message);
  }
}
if (!removed) console.log('لا شيء للتنظيف — المشروع نظيف ✓');
console.log('تم.');
