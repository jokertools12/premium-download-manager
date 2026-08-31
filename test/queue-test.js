'use strict';
/* اختبار منطق أولويات الطابور بدون شبكة (استبدال _start) */
const { DownloadEngine } = require('../src/main/engine/DownloadEngine');

const db = {
  getTasks: () => [],
  getSettings: () => ({
    maxConnections: 8, maxConcurrent: 1, maxSpeedKB: 0, organizeByCategory: false,
    downloadDir: 'C:\\tmp', categoryDirs: {}
  }),
  upsertTask() {}, removeTask() {}, save() {},
  saveResumeState() {}, getResumeState: () => null, clearResumeState() {},
  addStats() {}, getStatsData: () => ({})
};

const e = new DownloadEngine(db, null);
e._start = t => { t.status = 'downloading'; }; // يحاكي بدء التحميل دون شبكة

const a = e.addTask({ url: 'https://a.com/f1.zip' }).task;
const b = e.addTask({ url: 'https://a.com/f2.zip' }).task;
const c = e.addTask({ url: 'https://a.com/f3.zip' }).task;

console.log('الطابور:', e.queue.length, 'مهمة (واحدة بدأت فوراً)');
if (e.queue.length !== 2) throw new Error('الطابور غير صحيح');

// تقديم الأخير (في الطابور) للأمام
e.moveUp(c.id);
if (e.queue[0] !== c.id) throw new Error('moveUp فشل');
console.log('moveUp ✅');

// تأجيله للخلف
e.moveDown(c.id);
if (e.queue[0] !== b.id) throw new Error('moveDown فشل');
console.log('moveDown ✅');

// تحميل فوري يتخطى الطابور
e.downloadNow(c.id);
if (e.queue.includes(c.id)) throw new Error('downloadNow لم يزله من الطابور');
if (e.tasks.get(c.id).status !== 'downloading') throw new Error('downloadNow لم يبدأ المهمة');
console.log('downloadNow ✅ (تخطى الطابور وبدأ فوراً)');

const st = e.getDashboardStats();
if (!st.byCategory || st.today === undefined) throw new Error('getDashboardStats فشل');
console.log('getDashboardStats ✅', JSON.stringify(st.byCategory));

console.log('QUEUE-OK');
process.exit(0);
