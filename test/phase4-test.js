'use strict';
/* اختبار المرحلة 4: Mirrors + Torrent + i18n (بيئة Node عادية) */
const os = require('os');
const path = require('path');
const fs = require('fs');
const { DownloadEngine } = require('../src/main/engine/DownloadEngine');
const TorrentManager = require('../src/main/integrations/TorrentManager');
const i18n = require('../src/renderer/i18n.js');

const outDir = path.join(os.tmpdir(), 'pdm-phase4-out');
fs.rmSync(outDir, { recursive: true, force: true });

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

const db = {
  getTasks: () => [],
  getSettings: () => ({
    maxConnections: 4, maxConcurrent: 1, maxSpeedKB: 0,
    organizeByCategory: false, downloadDir: outDir, categoryDirs: {}, rules: []
  }),
  upsertTask() {}, removeTask() {}, save() {},
  saveResumeState() {}, getResumeState: () => null, clearResumeState() {},
  addStats() {}, getStatsData: () => ({})
};

const MAGNET = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F';

function waitEngineTask(e, id, status, timeoutMs) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      const t = e.get(id);
      if (!t) return;
      if (t.status === status) { clearInterval(timer); resolve(t); }
      else if (['failed', 'canceled'].includes(t.status)) { clearInterval(timer); reject(new Error('task: ' + t.status + ' ' + (t.error || ''))); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(timer); reject(new Error('timeout')); }
    }, 500);
  });
}

function waitTorrent(tm, id, status, timeoutMs) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      const t = tm.tasks.get(id);
      if (!t) return;
      if (t.status === status) { clearInterval(timer); resolve(t); }
      else if (t.status === 'failed') { clearInterval(timer); reject(new Error('torrent: ' + t.error)); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(timer); reject(new Error('timeout')); }
    }, 700);
  });
}

(async () => {
  // 1) i18n
  if (i18n.t('status.completed') !== 'مكتمل') throw new Error('i18n ar فشل');
  log('i18n عربي ✅:', i18n.t('status.completed'));

  // 2) Mirrors: المصدر الأساسي نطاق غير موجود → ينتقل تلقائياً للبديل
  log('2) اختبار Mirrors: مصدر أساسي معطل + بديل يعمل...');
  const e = new DownloadEngine(db, null);
  const r = e.addTask({
    url: 'https://nonexistent-domain-xyz.invalid/file.dat',
    mirrors: ['https://proof.ovh.net/files/1Mb.dat']
  });
  const done = await waitEngineTask(e, r.task.id, 'completed', 120000);
  if (!done.filePath || !fs.existsSync(done.filePath)) throw new Error('ملف Mirrors غير موجود');
  log(`   اكتمل عبر المصدر البديل ✅ (${done.received} bytes)`);

  // 3) Torrent
  const tm = new TorrentManager();
  await tm.ensureLoaded();
  if (!tm.available) {
    log('3) WebTorrent غير مثبت — تخطي اختبار التورنت');
  } else {
    log('3) فحص ماغنت Sintel (جلب بيانات من المصادر)...');
    const info = await tm.probe(MAGNET);
    log(`   الاسم: ${info.name} | الملفات: ${info.files.length}`);
    if (!info.files.length) throw new Error('لا ملفات في التورنت');
    const smallest = [...info.files].sort((a, b) => a.length - b.length)[0];
    log(`   تحميل أصغر ملف: ${smallest.name} (${smallest.length} bytes)...`);
    const dl = await tm.start({
      magnet: MAGNET, files: [smallest.index],
      dir: path.join(outDir, 'torrent')
    });
    const tdone = await waitTorrent(tm, dl.task.id, 'completed', 300000);
    log(`   اكتمل ✅ ${tdone.filename}`);
  }

  console.log('PHASE4-OK');
  process.exit(0);
})().catch(e => { console.error('PHASE4-FAIL:', e.message); process.exit(1); });
