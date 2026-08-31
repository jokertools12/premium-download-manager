'use strict';
/* اختبار القواعد التلقائية + الاستيراد الجماعي (بدون شبكة) */
const { DownloadEngine } = require('../src/main/engine/DownloadEngine');

const db = {
  getTasks: () => [],
  getSettings: () => ({
    maxConnections: 4, maxConcurrent: 1, maxSpeedKB: 0,
    organizeByCategory: false, downloadDir: 'C:\\tmp', categoryDirs: {},
    rules: [{ pattern: 'github.com', folder: 'C:\\Downloads\\GitHub' }]
  }),
  upsertTask() {}, removeTask() {}, save() {},
  saveResumeState() {}, getResumeState: () => null, clearResumeState() {},
  addStats() {}, getStatsData: () => ({})
};

const e = new DownloadEngine(db, null);
e._start = t => { t.status = 'downloading'; };

// 1) قاعدة: رابط يحتوي github.com → مجلد القاعدة
const t1 = e.addTask({ url: 'https://github.com/user/repo/releases/v1.zip' }).task;
if (t1.dir !== 'C:\\Downloads\\GitHub') throw new Error('القاعدة لم تُطبق! dir=' + t1.dir);
console.log('rule applied ✅ dir =', t1.dir);

// 2) رابط لا يطابق أي قاعدة → المجلد الافتراضي
const t2 = e.addTask({ url: 'https://example.com/a.zip' }).task;
if (t2.dir !== 'C:\\tmp') throw new Error('المجلد الافتراضي خطأ: ' + t2.dir);
console.log('fallback dir ✅');

// 3) مجلد يدوي يتجاوز القاعدة
const t3 = e.addTask({ url: 'https://github.com/x.tar.gz', dir: 'C:\\custom' }).task;
if (t3.dir !== 'C:\\custom') throw new Error('المجلد اليدوي يجب أن يتجاوز القاعدة');
console.log('manual dir override ✅');

// 4) الاستيراد الجماعي: 4 مدخلات (صالح، مكرر، غير صالح، صالح جديد)
const bulk = e.addBulk([
  'https://a.com/1.zip',
  'https://a.com/1.zip',
  'notaurl',
  'https://b.com/2.zip'
]);
console.log('bulk:', JSON.stringify(bulk));
if (bulk.added !== 2 || bulk.existed !== 1 || bulk.invalid !== 1) {
  throw new Error('نتيجة الاستيراد خاطئة');
}
console.log('RULES-BULK-OK');
process.exit(0);
