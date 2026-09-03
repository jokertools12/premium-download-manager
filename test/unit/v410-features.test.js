'use strict';

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

describe('ميزات وتحسينات الإصدار v4.1.0 (v4.1.0 Features & Resilience)', () => {
  it('التحقق من رقم الإصدار ووجود الصلاحيات في package.json و manifest.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
    expect(pkg.version).toBeDefined();

    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/extension/manifest.json'), 'utf8'));
    expect(manifest.version).toBeDefined();
    expect(manifest.permissions).toContain('cookies');
  });

  it('بناء وسائط yt-dlp مع دمج ffmpeg ووضع --ffmpeg-location قبل الرابط', async () => {
    const { buildYtDlpArgs } = await import('../../src/main/integrations/ytdlp-args.js');
    const task = {
      url: 'https://www.youtube.com/watch?v=sample123',
      dir: 'C:\\Downloads',
      formatId: '137+bestaudio/best',
      mergeOutput: 'mp4',
      ffmpegDir: 'C:\\bin\\ffmpeg'
    };

    const built = buildYtDlpArgs(task);
    expect(built.needsMerge).toBe(true);

    const ffLocIdx = built.args.indexOf('--ffmpeg-location');
    expect(ffLocIdx).toBeGreaterThan(-1);
    expect(built.args[ffLocIdx + 1]).toBe('C:\\bin\\ffmpeg');

    // الرابط يجب أن يكون آخر عنصر دائماً
    expect(built.args[built.args.length - 1]).toBe(task.url);
    expect(ffLocIdx).toBeLessThan(built.args.length - 1);
  });

  it('VideoManager: تطبيع صيغ يوتيوب بحيث تدمج الصوت والصورة تلقائياً', async () => {
    const VideoManager = (await import('../../src/main/integrations/VideoManager.js')).default ||
      (await import('../../src/main/integrations/VideoManager.js'));

    const vm = new VideoManager('C:\\fake-bin');
    const mockInfo = {
      formats: [
        { format_id: '137', vcodec: 'avc1', acodec: 'none', height: 1080, fps: 30, ext: 'mp4', filesize: 50000000 },
        { format_id: '22', vcodec: 'avc1', acodec: 'mp4a', height: 720, fps: 30, ext: 'mp4', filesize: 25000000 },
        { format_id: '140', vcodec: 'none', acodec: 'mp4a', abr: 128, ext: 'm4a', filesize: 5000000 }
      ]
    };

    const normalized = vm._normalizeFormats(mockInfo);
    expect(normalized.length).toBeGreaterThan(1);

    // الصيغة 1080p كانت فيديو فقط بدون صوت -> يجب أن تتحول إلى دمج بالصوت
    const f1080 = normalized.find(f => f.label.includes('1080p'));
    expect(f1080).toBeDefined();
    expect(f1080.id).toBe('137+bestaudio/best');
    expect(f1080.merge).toBe(true);
    expect(f1080.label).toContain('مدمج');
  });

  it('DownloadTask: أخطاء HTTP 404 و 401 تفشل فوراً برسالة تشخيصية واضحة دون إعادة محاولة وتجميد', async () => {
    const DownloadTask = (await import('../../src/main/engine/DownloadTask.js')).default ||
      (await import('../../src/main/engine/DownloadTask.js'));

    const task = new DownloadTask({
      id: 'test-404-task',
      url: 'https://example.com/not-found-file.zip',
      dir: 'C:\\Downloads'
    });

    task._handleError(new Error('HTTP 404'));
    expect(task.status).toBe('failed');
    expect(task.error).toContain('404');
    expect(task.error).toContain('الملف غير موجود');
    expect(task._retries).toBe(0); // لا يُعاد المحاولة لـ 404
  });

  it('DownloadTask: أخطاء HTTP 401 تفشل فوراً برسالة مصادقة', async () => {
    const DownloadTask = (await import('../../src/main/engine/DownloadTask.js')).default ||
      (await import('../../src/main/engine/DownloadTask.js'));

    const task = new DownloadTask({
      id: 'test-401-task',
      url: 'https://example.com/protected-file.zip',
      dir: 'C:\\Downloads'
    });

    task._handleError(new Error('HTTP 401'));
    expect(task.status).toBe('failed');
    expect(task.error).toContain('401');
    expect(task.error).toContain('تسجيل الدخول');
    expect(task._retries).toBe(0);
  });
});
