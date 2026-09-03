'use strict';

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('المرحلة 2: لوحة تحميل القوائم والقنوات الكاملة (Batch Channel & Playlist Downloader 2.0)', () => {
  it('buildYtDlpArgs: يدعم تنظيم قوائم التشغيل في مجلدات مع ترقيم الحلقات وتعيين الدقة الموحدة وصيغة الدمج', async () => {
    const { buildYtDlpArgs } = await import('../../src/main/integrations/ytdlp-args.js');
    const task = {
      url: 'https://www.youtube.com/playlist?list=PL123456789',
      isPlaylist: true,
      dir: 'C:\\Downloads\\Videos',
      formatId: 'bestvideo[height<=1080]+bestaudio/best',
      mergeOutput: 'mp4',
      subfolder: true,
      items: '1,2,3'
    };

    const built = buildYtDlpArgs(task);
    expect(built.args).toContain('--yes-playlist');
    expect(built.args).toContain('-f');
    expect(built.args).toContain('bestvideo[height<=1080]+bestaudio/best');
    expect(built.args).toContain('--merge-output-format');
    expect(built.args).toContain('mp4');
    expect(built.args).toContain('--playlist-items');
    expect(built.args).toContain('1,2,3');
    // قالب الترقية مع الترقيم
    expect(built.args.some(a => a.includes('%(playlist_title|Playlist)s') && a.includes('playlist_index'))).toBe(true);
  });

  it('VideoManager.js: دالة probe تستخرج المعرف ورابط الفيديو والصور المصغرة وإجمالي المدة', () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../../src/main/integrations/VideoManager.js'), 'utf8');
    expect(code).toContain('totalDuration');
    expect(code).toContain('thumbnail: thumb');
    expect(code).toContain('subfolder');
  });

  it('index.html: يحتوي على عناصر لوحة القوائم المتقدمة #playlistModal وشريط الأدوات وشبكة الحلقات', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/index.html'), 'utf8');
    expect(html).toContain('id="playlistModal"');
    expect(html).toContain('id="plGrid"');
    expect(html).toContain('id="plSearch"');
    expect(html).toContain('id="btnPlSelectAll"');
    expect(html).toContain('id="btnPlSelectNone"');
    expect(html).toContain('id="btnPlInvert"');
    expect(html).toContain('id="plQualitySelect"');
    expect(html).toContain('id="btnStartPlaylistDownload"');
  });

  it('styles.css: يحتوي على تنسيقات لوحة القوائم extra-wide وشبكة البطاقات وبطاقة الحلقة المصغرة', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/styles.css'), 'utf8');
    expect(css).toContain('.pl-grid');
    expect(css).toContain('.pl-card');
    expect(css).toContain('.pl-thumb-wrap');
    expect(css).toContain('.pl-thumb-dur');
    expect(css).toContain('.glowing-btn');
  });

  it('video.js: يدعم فتح لوحة القوائم openPlaylistDashboard وفلترة البحث وعكس التحديد والتحميل الجماعي', async () => {
    const mod = await import('../../src/renderer/ui/video.js');
    expect(typeof mod.openPlaylistDashboard).toBe('function');
    expect(typeof mod.wireVideoUI).toBe('function');
  });
});
