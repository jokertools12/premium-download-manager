'use strict';
/* اختبار المرحلة 3 الحي: yt-dlp + فحص + تحميل فيديو + M3U8 + ffmpeg */
const VideoManager = require('../src/main/integrations/VideoManager');
const os = require('os');
const path = require('path');
const fs = require('fs');

const binDir = path.join(os.tmpdir(), 'pdm-phase3-bin');
const outDir = path.join(os.tmpdir(), 'pdm-phase3-out');
const vm = new VideoManager(binDir);

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

function waitStatus(id, statuses, timeoutMs) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      const t = vm.tasks.get(id);
      if (!t) return;
      if (statuses.includes(t.status)) { clearInterval(timer); resolve(t); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(timer); reject(new Error('timeout')); }
    }, 500);
  });
}

(async () => {
  fs.rmSync(outDir, { recursive: true, force: true });

  log('1) تنزيل أداة yt-dlp (~17MB، مرة واحدة)...');
  await vm.ensureYtDlp((d, t) => {
    if (t) process.stdout.write(`\r   ${Math.round(d / 1024)}KB / ${Math.round(t / 1024)}KB   `);
  });
  console.log('');
  if (!vm.hasYtDlp()) throw new Error('yt-dlp غير موجود');
  log('   yt-dlp جاهزة ✅');

  log('2) فحص رابط فيديو مباشر (mp4 تجريبي)...');
  const info = await vm.probe('https://www.w3schools.com/html/mov_bbb.mp4');
  log('   العنوان:', info.title, '| عدد الصيغ:', info.formats.length);

  log('3) تحميل الفيديو عبر yt-dlp مع تقدم حي...');
  const fmt = info.formats.find(f => f.kind === 'video') || info.formats[info.formats.length - 1];
  const dl = await vm.start({ url: info.url, formatId: fmt.id, dir: outDir, title: info.title });
  const done = await waitStatus(dl.id, ['completed', 'failed'], 300000);
  if (done.status === 'failed') throw new Error(done.error);
  if (!done.filePath || !fs.existsSync(done.filePath)) throw new Error('الملف غير موجود بعد التحميل');
  log(`   اكتمل ✅ ${path.basename(done.filePath)} (${fs.statSync(done.filePath).size} bytes)`);

  log('4) فحص بث HLS/M3U8 (اكتشاف البثوث)...');
  const hls = await vm.probe('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
  log(`   العنوان: ${hls.title} | الصيغ: ${hls.formats.length} | isStream: ${hls.isStream}`);

  log('5) تنزيل ffmpeg (~40MB مرة واحدة، للدمج والبثوث)...');
  await vm.ensureFfmpeg((d, t) => {
    if (t) process.stdout.write(`\r   ${Math.round(d / 1048576)}MB / ${Math.round(t / 1048576)}MB   `);
  });
  console.log('');
  if (!vm.ffmpegDir()) throw new Error('ffmpeg لم يُثبت');
  log('   ffmpeg جاهز ✅ →', vm.ffmpegDir());

  console.log('PHASE3-OK');
  process.exit(0);
})().catch(e => { console.error('PHASE3-FAIL:', e.message); process.exit(1); });
