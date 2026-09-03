'use strict';

import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

describe('ميزات وتحسينات الإصدار v4.3.0 (v4.3.0 Features & Resilience)', () => {
  it('التحقق من صحة وتطابق أرقام الإصدارات في package.json و manifest.json و background.js', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/extension/manifest.json'), 'utf8'));
    const bgContent = fs.readFileSync(path.resolve(__dirname, '../../src/extension/background.js'), 'utf8');

    expect(manifest.version).toBe(pkg.version);
    expect(bgContent).toContain(`v${pkg.version}`);
  });

  it('buildYtDlpArgs: يتضمن --windows-filenames و --no-mtime وقالب التسمية بدون اقتطاع مكسور .80s', async () => {
    const { buildYtDlpArgs } = await import('../../src/main/integrations/ytdlp-args.js');
    const task = {
      url: 'https://www.youtube.com/watch?v=sampleArabic',
      dir: 'C:\\Downloads',
      formatId: 'bestvideo[height<=1080]+bestaudio/best',
      mergeOutput: 'mp4'
    };

    const built = buildYtDlpArgs(task);
    expect(built.args).toContain('--windows-filenames');
    expect(built.args).toContain('--no-mtime');
    expect(built.args.some(a => a.includes('.80s'))).toBe(false);
    expect(built.args.some(a => a.includes('%(title)s.%(ext)s'))).toBe(true);
  });

  it('LocalServer: مسار /summary يستجيب بالسرعة والحالة والاتصال لـ popup الإضافة', async () => {
    const LocalServer = (await import('../../src/main/integrations/LocalServer.js')).default ||
      (await import('../../src/main/integrations/LocalServer.js'));

    const mockEngine = {
      summary: () => ({ speed: 1048576, downloading: 2, queued: 0, paused: 0, completed: 5, failed: 0, total: 7 }),
      addTask: vi.fn(),
      list: () => []
    };
    const mockVideo = {
      totalSpeed: () => 524288,
      activeCount: () => 1,
      autoDownload: vi.fn()
    };

    const server = new LocalServer({
      port: 0,
      engine: mockEngine,
      video: mockVideo,
      videoDir: () => 'C:\\Downloads',
      version: '4.3.0'
    });
    // اختبار دالة مسار /summary
    await server.start();
    const port = server.server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/summary`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.connected).toBe(true);
      expect(data.speed).toBe(1048576 + 524288);
      expect(data.activeCount).toBe(3);
      expect(data.version).toBe('4.3.0');
    } finally {
      server.stop();
    }
  });

  it('LocalServer: مسار /add يمرر formatId و audioOnly لـ video.autoDownload', async () => {
    const LocalServer = (await import('../../src/main/integrations/LocalServer.js')).default ||
      (await import('../../src/main/integrations/LocalServer.js'));

    const mockEngine = {
      summary: () => ({ speed: 0, downloading: 0, queued: 0, paused: 0, completed: 0, failed: 0, total: 0 }),
      addTask: vi.fn()
    };
    const mockVideo = {
      isStreamUrl: () => false,
      autoDownload: vi.fn()
    };

    const server = new LocalServer({
      port: 0,
      engine: mockEngine,
      video: mockVideo,
      videoDir: () => 'C:\\Downloads',
      version: '4.2.0'
    });
    await server.start();
    const port = server.server.address().port;

    try {
      const payload = {
        url: 'https://www.youtube.com/watch?v=test1234',
        video: true,
        formatId: 'bestvideo[height<=720]+bestaudio/best',
        audioOnly: false,
        mergeOutput: 'mp4'
      };
      const res = await fetch(`http://127.0.0.1:${port}/add`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      expect(res.ok).toBe(true);
      expect(mockVideo.autoDownload).toHaveBeenCalled();
      const callArgs = mockVideo.autoDownload.mock.calls[0];
      expect(callArgs[0]).toBe(payload.url);
      expect(callArgs[2]).toEqual({
        formatId: payload.formatId,
        audioOnly: false,
        mergeOutput: 'mp4'
      });
    } finally {
      server.stop();
    }
  });

  it('VideoManager: autoDownload يمرر الخيارات المحددة (formatId, audioOnly) إلى start', async () => {
    const VideoManager = (await import('../../src/main/integrations/VideoManager.js')).default ||
      (await import('../../src/main/integrations/VideoManager.js'));

    const vm = new VideoManager('C:\\fake-bin');
    vm.probe = vi.fn().mockResolvedValue({ title: 'فيديو تجريبي عالي الدقة' });
    vm.start = vi.fn().mockResolvedValue({ id: 'vid-mock-123', status: 'downloading' });

    const result = await vm.autoDownload('https://youtube.com/watch?v=sample', 'C:\\Downloads', {
      formatId: 'bestvideo[height<=1080]+bestaudio/best',
      audioOnly: false,
      mergeOutput: 'mp4'
    });

    expect(vm.start).toHaveBeenCalledWith({
      url: 'https://youtube.com/watch?v=sample',
      formatId: 'bestvideo[height<=1080]+bestaudio/best',
      audioOnly: false,
      mergeOutput: 'mp4',
      dir: 'C:\\Downloads',
      title: 'فيديو تجريبي عالي الدقة'
    });
    expect(result.id).toBe('vid-mock-123');
  });
});
