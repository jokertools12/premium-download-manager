'use strict';
/* اختبار محدد السرعة: تحميل 1MB بحد 200KB/s يجب أن يستغرق ~5 ثوانٍ على الأقل */
const DownloadTask = require('../src/main/engine/DownloadTask');
const SpeedLimiter = require('../src/main/engine/SpeedLimiter');
const os = require('os');
const path = require('path');
const fs = require('fs');

const DIR = path.join(os.tmpdir(), 'pdm-limit-test');

async function main() {
  fs.rmSync(DIR, { recursive: true, force: true });
  const limiter = new SpeedLimiter();
  limiter.setRate(200 * 1024); // 200KB/s

  const t = new DownloadTask({
    id: 'limit-test',
    url: 'https://proof.ovh.net/files/1Mb.dat',
    dir: DIR,
    maxConnections: 8,
    status: 'queued',
    limiter
  });
  const start = Date.now();
  await t.start(null);
  const secs = (Date.now() - start) / 1000;
  console.log(`completed: received=${t.received} bytes in ${secs.toFixed(1)}s (limit=200KB/s, expected >= ~4.5s)`);
  if (t.status !== 'completed') throw new Error('status=' + t.status + ' err=' + t.error);
  if (secs < 4.5) throw new Error('المحدد لا يعمل! التحميل أسرع من الحد المسموح');
  if (t.received !== t.size) throw new Error('حجم غير مطابق');
  console.log('LIMITER-OK');
  process.exit(0);
}

main().catch(e => { console.error('LIMIT-FAIL:', e.message); process.exit(1); });
