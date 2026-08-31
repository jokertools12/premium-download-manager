'use strict';

/* اختبار حي لمحرك التحميل: تحميل متعدد الاتصالات + إيقاف/استئناف */
const os = require('os');
const path = require('path');
const fs = require('fs');
const DownloadTask = require('../src/main/engine/DownloadTask');

const DIR = path.join(os.tmpdir(), 'pdm-engine-test');
const URLS = [
  'https://proof.ovh.net/files/10Mb.dat',
  'https://speed.cloudflare.com/__down?bytes=8000000'
];

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

function makeTask(i, name) {
  return new DownloadTask({
    id: 'test-' + i,
    url: URLS[i],
    dir: DIR,
    maxConnections: 8,
    status: 'queued'
  });
}

function waitFor(t, status, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for ' + status)), timeoutMs);
    const check = snap => {
      if (snap.status === status) {
        clearTimeout(timer);
        resolve(snap);
      }
    };
    t.on('updated', check);
  });
}

async function main() {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });

  // اختبار 1: تحميل متعدد الاتصالات حتى الاكتمال
  const t1 = makeTask(0, 'full');
  t1.on('updated', s => {
    if (s.status === 'downloading' && s.received % 1 < 2) {
      log(`[1] ${s.received}/${s.size} bytes | ${s.speed} B/s | ${s.connections} اتصالات`);
    }
  });
  log('[1] بدء تحميل:', URLS[0]);
  t1.start(null).catch(e => log('[1] خطأ:', e.message));
  const done1 = await waitFor(t1, 'completed', 90000);
  const st1 = fs.statSync(done1.filePath);
  log('[1] الحالة:', done1.status, '| الحجم المتوقع:', done1.size, '| الحجم الفعلي:', st1.size);
  if (st1.size !== done1.size) throw new Error('حجم الملف غير مطابق!');
  log('[1] ✅ التحميل المتعدد يعمل والملف سليم');

  // اختبار 2: إيقاف مؤقت ثم استئناف
  const t2 = makeTask(1, 'pause-resume');
  log('[2] بدء تحميل:', URLS[1]);
  t2.start(null).catch(() => {});
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('لم يصل للتقدم المطلوب')), 60000);
    t2.on('updated', s => {
      if (s.status === 'downloading' && s.received > 300000) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  t2.pause();
  const paused = await waitFor(t2, 'paused', 15000);
  log('[2] توقف عند:', paused.received, 'bytes | segments:',
    JSON.stringify(paused.segments.map(s => s.received)));
  await new Promise(r => setTimeout(r, 1500));
  log('[2] استئناف...');
  t2.paused = false;
  t2.aborted = false;
  t2.status = 'queued';
  t2.start(null).catch(() => {});
  const done2 = await waitFor(t2, 'completed', 90000);
  const st2 = fs.statSync(done2.filePath);
  log('[2] الحالة:', done2.status, '| الحجم المتوقع:', done2.size, '| الحجم الفعلي:', st2.size);
  if (st2.size !== done2.size) throw new Error('حجم الملف غير مطابق بعد الاستئناف!');
  log('[2] ✅ الإيقاف/الاستئناف يعمل');

  console.log('ALL-TESTS-PASSED');
  process.exit(0);
}

main().catch(e => {
  console.error('TEST-FAILED:', e.message);
  process.exit(1);
});
