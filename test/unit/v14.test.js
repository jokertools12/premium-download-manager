'use strict';
/* اختبارات المرحلة v1.4 «ملك الوسائط»:
   4.1/4.3 صوت MP3  4.2 صيغة الدمج  4.5 قص المقطع  4.6 الترجمات
   عبر الوحدة النقية ytdlp-args.js */

import { describe, it, expect } from 'vitest';
import { parseTimecode, buildYtDlpArgs } from '../../src/main/integrations/ytdlp-args.js';

describe('ytdlp-args.js — parseTimecode (4.5)', () => {
  it('يقبل الثواني والدقائق والساعات', () => {
    expect(parseTimecode('90')).toBe(90);
    expect(parseTimecode('1:30')).toBe(90);
    expect(parseTimecode('1:02:03')).toBe(3723);
    expect(parseTimecode(' 2:05 ')).toBe(125);
  });

  it('يرفض الصيغ الرديئة والقيم غير المنطقية', () => {
    expect(parseTimecode('')).toBeNull();
    expect(parseTimecode('abc')).toBeNull();
    expect(parseTimecode('1:60')).toBeNull();   // دقيقة > 59
    expect(parseTimecode('1:00:60')).toBeNull(); // ثانية > 59
    expect(parseTimecode('0:00')).toBe(0);       // بداية الفيديو — قيمة مشروعة
    expect(parseTimecode('-5')).toBeNull();
    expect(parseTimecode(null)).toBeNull();
  });
});

describe('ytdlp-args.js — buildYtDlpArgs', () => {
  const base = { url: 'https://youtu.be/x', dir: 'C:\\dl' };

  it('فيديو مفرد: -f best + --no-playlist + الرابط أخيراً', () => {
    const { args, needsMerge } = buildYtDlpArgs({ ...base, formatId: 'best' });
    expect(args[0]).toBe('--newline');
    expect(args).toContain('--no-playlist');
    expect(args[args.length - 1]).toBe(base.url);
    expect(needsMerge).toBe(false);
  });

  it('الجودة المدمجة (bestvideo+bestaudio) تتطلب ffmpeg', () => {
    const { needsMerge } = buildYtDlpArgs({ ...base, formatId: 'bestvideo+bestaudio/best' });
    expect(needsMerge).toBe(true);
  });

  it('صوت MP3 فقط (4.1/4.3): -f bestaudio + -x --audio-format mp3', () => {
    const { args, needsMerge } = buildYtDlpArgs({ ...base, audioOnly: true });
    expect(args.join(' ')).toContain('-f bestaudio/best');
    expect(args).toContain('-x');
    expect(args).toContain('--audio-format');
    expect(args).toContain('mp3');
    expect(needsMerge).toBe(true); // ffmpeg مطلوب للاستخراج
  });

  it('صيغة الدمج mp4/mkv (4.2)', () => {
    const a = buildYtDlpArgs({ ...base, formatId: 'bestvideo+bestaudio', mergeOutput: 'mp4' });
    expect(a.args).toContain('--merge-output-format');
    expect(a.args[a.args.indexOf('--merge-output-format') + 1]).toBe('mp4');
    const b = buildYtDlpArgs({ ...base, mergeOutput: 'mkv' });
    expect(b.args).toContain('mkv');
    expect(b.needsMerge).toBe(true);
    // صيغة غير مدعومة تُتجاهل
    const c = buildYtDlpArgs({ ...base, mergeOutput: 'avi' });
    expect(c.args).not.toContain('--merge-output-format');
  });

  it('الترجمات التلقائية (4.6): --write-subs + اللغات', () => {
    const { args } = buildYtDlpArgs({ ...base, subtitles: true, subsLangs: 'ar,en' });
    expect(args).toContain('--write-subs');
    expect(args).toContain('--write-auto-subs');
    expect(args[args.indexOf('--sub-langs') + 1]).toBe('ar,en');
    // بدون تحديد لغات: افتراضي عربي/إنجليزي
    const d = buildYtDlpArgs({ ...base, subtitles: true });
    expect(d.args[d.args.indexOf('--sub-langs') + 1]).toContain('ar');
    // بلا خيار: لا وسائط ترجمة
    expect(buildYtDlpArgs({ ...base }).args).not.toContain('--write-subs');
  });

  it('قص المقطع (4.5): --download-sections *start-end', () => {
    const { args, needsMerge } = buildYtDlpArgs({
      ...base, clipStart: '0:30', clipEnd: '2:15'
    });
    expect(args).toContain('--download-sections');
    expect(args[args.indexOf('--download-sections') + 1]).toBe('*30-135');
    expect(needsMerge).toBe(true);
  });

  it('القص يتطلب نهاية > بداية ويتجاهل لقوائم التشغيل', () => {
    // نهاية قبل البداية → يُتجاهل
    const bad = buildYtDlpArgs({ ...base, clipStart: '2:00', clipEnd: '1:00' });
    expect(bad.args).not.toContain('--download-sections');
    // قائمة تشغيل: القص غير منطبق
    const pl = buildYtDlpArgs({ ...base, isPlaylist: true, clipStart: '0:10', clipEnd: '0:20' });
    expect(pl.args).not.toContain('--download-sections');
  });

  it('قائمة تشغيل (4.4): --yes-playlist + --playlist-items', () => {
    const { args } = buildYtDlpArgs({ ...base, isPlaylist: true, items: '1-3' });
    expect(args).toContain('--yes-playlist');
    expect(args[args.indexOf('--playlist-items') + 1]).toBe('1-3');
    // قائمة تشغيل مع MP3: bestaudio + -x
    const aud = buildYtDlpArgs({ ...base, isPlaylist: true, audioOnly: true });
    expect(aud.args).toContain('-x');
    expect(aud.args.join(' ')).toContain('bestaudio/best');
  });

  it('مسار الإخراج داخل dir دائماً', () => {
    const { args } = buildYtDlpArgs(base);
    const oi = args.indexOf('-o');
    expect(oi).toBeGreaterThan(-1);
    expect(args[oi + 1]).toContain('C:\\dl');
  });
});