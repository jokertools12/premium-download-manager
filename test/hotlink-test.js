'use strict';
/* اختبار رابط المستخدم الفعلي (حماية Hotlink + Referer) عبر المحرك الحقيقي
   ننزل أول 3MB ثم نوقف ونتحقق من محتوى الملف الفعلي على القرص */
const { DownloadEngine } = require('../src/main/engine/DownloadEngine');
const os = require('os');
const path = require('path');
const fs = require('fs');

const outDir = path.join(os.tmpdir(), 'pdm-hotlink-test');
const URL = 'https://deva-cpmav9sk6x16.cimanowtv.com/uploads/2021/11/11/_Cima-Now.CoM_%20La.Brea.S01E07.HD/%5BCima-Now.CoM%5D%20La.Brea.S01E07.HD-480p.mp4';
const REFERER = 'https://cimanowtv.com/';

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

const db = {
  getTasks: () => [],
  getSettings: () => ({
    maxConnections: 8, maxConcurrent: 1, maxSpeedKB: 0,
    organizeByCategory: false, downloadDir: outDir, categoryDirs: {}, rules: []
  }),
  upsertTask() {}, removeTask() {}, save() {},
  saveResumeState() {}, getResumeState: () => null, clearResumeState() {},
  addStats() {}, getStatsData: () => ({})
};

function waitStatus(e, id, statuses, timeoutMs) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      const t = e.get(id);
      if (!t) return;
      if (statuses.includes(t.status)) { clearInterval(timer); resolve(t); }
      else if (t.status === 'failed') { clearInterval(timer); reject(new Error(t.error)); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(timer); reject(new Error('timeout')); }
    }, 500);
  });
}

(async () => {
  fs.rmSync(outDir, { recursive: true, force: true });
  const e = new DownloadEngine(db, null);

  // 1) بدون Referer → يجب أن يفشل برسالة واضحة (ولا يُترك ملف فارغ)
  log('1) بدون Referer (متوقع فشل برسالة واضحة)...');
  const r1 = e.addTask({ url: URL, filename: 'no-referer.mp4' });
  const f1 = await waitStatus(e, r1.task.id, ['failed'], 240000);
  log(`   فشل كما هو متوقع ✅ : ${f1.error.slice(0, 80)}`);
  const file1 = f1.filePath;
  if (file1 && fs.existsSync(file1)) {
    throw new Error('✖ تُرك ملف فارغ! يجب حذفه عند الفشل بلا بايتات');
  }
  log('   لا ملفات فارغة متبقية ✅');
  e.removeTask({ id: r1.task.id });

  // 2) مع Referer → يجب أن يحمّل فعلياً
  log('2) مع Referer (تحميل حقيقي حتى ~3MB ثم إيقاف)...');
  const r2 = e.addTask({ url: URL, filename: 'with-referer.mp4', referer: REFERER });
  await new Promise((resolve, reject) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      const t = e.get(r2.task.id);
      if (!t) return;
      if (t.status === 'failed') { clearInterval(timer); reject(new Error(t.error)); }
      else if (t.received > 3 * 1024 * 1024) { clearInterval(timer); e.pause(r2.task.id); resolve(); }
      else if (Date.now() - t0 > 180000) { clearInterval(timer); e.pause(r2.task.id); resolve(); }
    }, 400);
  });
  await new Promise(r => setTimeout(r, 2000)); // انتظار إغلاق الملف
  const t2 = e.get(r2.task.id);
  log(`   الحالة: ${t2.status} | المُحمّل: ${t2.received} bytes | السرعة كانت تعمل`);
  const file2 = t2.filePath;
  if (!file2 || !fs.existsSync(file2)) throw new Error('الملف غير موجود');
  const size = fs.statSync(file2).size;
  log(`   حجم الملف على القرص: ${size} bytes`);
  if (size === 0) throw new Error('الملف فارغ!');
  // التحقق من أن المحتوى ليس أصفاراً (فيديو حقيقي)
  const fd = fs.openSync(file2, 'r');
  const buf = Buffer.alloc(16);
  fs.readSync(fd, buf, 0, 16, 0);
  fs.closeSync(fd);
  const nonZero = buf.some(b => b !== 0);
  if (!nonZero) throw new Error('محتوى الملف أصفار! الكتابة لا تعمل');
  log('   محتوى حقيقي ✅ (أول 16 بايت:', buf.toString('hex'), ')');

  // تنظيف
  e.removeTask({ id: r2.task.id, deleteFile: true });
  console.log('HOTLINK-OK');
  process.exit(0);
})().catch(e => { console.error('HOTLINK-FAIL:', e.message); process.exit(1); });
