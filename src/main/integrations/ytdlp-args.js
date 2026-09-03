'use strict';
/* بناء وسائط yt-dlp لمرحلة «ملك الوسائط» (4.1–4.6) — نقية وقابلة للاختبار
   يدعم: صوت MP3 فقط (4.1/4.3)، صيغة الدمج mp4/mkv (4.2)،
   قوائم التشغيل (4.4)، قص مقطع بزمن بداية/نهاية (4.5)، الترجمات (4.6) */

const path = require('path');

const DEFAULT_SUBS = 'ar,en.*,en';
/* صيغة الزمن المدعومة: 'ثوانٍ' | 'د:ث' | 'س:د:ث' — تُفسَّر حسب عدد المقاطع */
const TIME_RE = /^(?:(\d{1,4}):(\d{1,2}):(\d{1,2})|(\d{1,3}):(\d{1,2})|(\d+))$/;

/* يحلل '90' → 90 | '2:15' → 135 | '1:02:03' → 3723 | '0:00' → 0
   يرفض الدقائق/الثواني > 59 داخل الصيغ المركبة — أو null إن كان غير صالح */
function parseTimecode(str) {
  const s = String(str || '').trim();
  if (!s) return null;
  const m = TIME_RE.exec(s);
  if (!m) return null;
  if (m[6] !== undefined) return parseInt(m[6], 10); // ثوانٍ فقط (حرة)
  if (m[4] !== undefined) {                           // د:ث
    const mm = parseInt(m[4], 10);
    const ss = parseInt(m[5], 10);
    if (mm > 59 || ss > 59) return null;
    return mm * 60 + ss;
  }
  const hh = parseInt(m[1], 10);                      // س:د:ث
  const mm = parseInt(m[2], 10);
  const ss = parseInt(m[3], 10);
  if (mm > 59 || ss > 59) return null;
  return hh * 3600 + mm * 60 + ss;
}

/* يبني وسائط yt-dlp كاملة من كائن المهمة — الرابط دائماً آخر وسيطة
   task: { url, dir, formatId, isPlaylist, items, audioOnly, subtitles,
           subsLangs, clipStart, clipEnd, mergeOutput }
   يعيد { args, needsMerge } */
function buildYtDlpArgs(task) {
  const args = ['--newline', '--no-warnings', '--windows-filenames', '--no-mtime'];
  const audio = !!task.audioOnly;
  const t0 = parseTimecode(task.clipStart);
  const t1 = parseTimecode(task.clipEnd);
  const hasClip = t0 !== null && t1 !== null && t1 > t0 && !task.isPlaylist;

  if (task.isPlaylist) {
    args.push('--yes-playlist');
    if (audio) args.push('-f', 'bestaudio/best');
    args.push('-o', path.join(task.dir, '%(playlist_title|Playlist)s/%(title)s.%(ext)s'));
    if (task.items) args.push('--playlist-items', String(task.items));
  } else {
    const fmt = audio ? 'bestaudio/best' : (task.formatId || 'best');
    args.push('-f', fmt, '--no-playlist');
    args.push('-o', path.join(task.dir, '%(title)s.%(ext)s'));
  }

  /* استخراج صوت MP3 (4.1/4.3) — يتطلب ffmpeg */
  if (audio) args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');

  /* الترجمات التلقائية (4.6) */
  if (task.subtitles) {
    args.push('--write-subs', '--write-auto-subs', '--sub-langs', task.subsLangs || DEFAULT_SUBS);
  }

  /* تسجيل دخول المواقع (5.2): قراءة كوكيز المتصفح مباشرة */
  if (task.cookiesFrom) args.push('--cookies-from-browser', task.cookiesFrom);

  /* قص المقطع (4.5) — فيديو مفرد فقط، والنهاية يجب أن تتجاوز البداية */
  if (hasClip) args.push('--download-sections', `*${t0}-${t1}`);

  /* صيغة الدمج (4.2) */
  const merge = task.mergeOutput;
  if (merge === 'mp4' || merge === 'mkv') args.push('--merge-output-format', merge);

  args.push(
    '--progress-template', 'download:PROG|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.speed)s|%(progress._percent_str)s',
    '--print', 'after_move:DONE|%(filepath)s'
  );

  /* مسار أداة الدمج ffmpeg إن وُجد (يوضع دائماً قبل الرابط) */
  if (task.ffmpegDir) {
    args.push('--ffmpeg-location', task.ffmpegDir);
  }

  const needsMerge = (task.formatId || '').includes('+') ||
    merge === 'mp4' || merge === 'mkv' || audio || hasClip;

  args.push(task.url); // الرابط دائماً أخيراً
  return { args, needsMerge };
}

module.exports = { parseTimecode, buildYtDlpArgs, DEFAULT_SUBS };