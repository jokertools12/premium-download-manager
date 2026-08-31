'use strict';
/* فحص مباشر لمرحلة probe في محرك التحميل */
const DownloadTask = require('../src/main/engine/DownloadTask');
const os = require('os');
const path = require('path');
const fs = require('fs');

const DIR = path.join(os.tmpdir(), 'pdm-probe-test');
fs.mkdirSync(DIR, { recursive: true });

async function main() {
  const t = new DownloadTask({
    id: 'probe-test',
    url: 'https://speed.cloudflare.com/__down?bytes=8000000',
    dir: DIR,
    maxConnections: 8,
    status: 'queued'
  });
  console.log('call _probe...');
  const info = await t._probe();
  console.log('probe result:', JSON.stringify(info));
  console.log('finalUrl:', t.finalUrl);

  console.log('alloc segments...');
  t._allocSegments();
  console.log('segments:', JSON.stringify(t.segments));

  console.log('open fd...');
  await t._openFd();
  console.log('fd open ok');

  console.log('run all segments...');
  t.on('updated', s => console.log('progress:', s.received, '/', s.size, s.speed));
  await t._runAll();
  console.log('received:', t.received, 'expected:', t.size);
  await t._closeFd();
  console.log('PROBE-OK');
  process.exit(0);
}

main().catch(e => { console.error('PROBE-FAIL:', e); process.exit(1); });
