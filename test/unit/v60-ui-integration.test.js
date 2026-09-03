import { describe, it, expect } from 'vitest';
import { buildYtDlpArgs } from '../../src/main/integrations/ytdlp-args.js';
import VideoManager from '../../src/main/integrations/VideoManager.js';

describe('v6.0 Ultra — YouTube Audio Integration & Feature Verification', () => {
  const vm = new VideoManager('C:\\dummy\\bin');

  it('يضمن دمج الصوت تلقائياً عند تحميل فيديو من يوتيوب بدون تحديد جودة صوت', () => {
    const task = {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      dir: 'C:\\Downloads',
      mergeOutput: 'mp4',
      ffmpegDir: 'C:\\bin'
    };
    const { args, needsMerge } = buildYtDlpArgs(task);
    expect(args).toContain('-f');
    const fIdx = args.indexOf('-f');
    expect(args[fIdx + 1]).toBe('bestvideo+bestaudio/best');
    expect(args).toContain('--merge-output-format');
    expect(args).toContain('mp4');
    expect(args).toContain('--ffmpeg-location');
    expect(needsMerge).toBe(true);
  });

  it('يضيف +bestaudio/best إلى أي جودة رقمية محددة (مثل 1080p) لضمان الصوت', () => {
    const task = {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      formatId: 'bestvideo[height<=1080]',
      dir: 'C:\\Downloads',
      mergeOutput: 'mp4'
    };
    const { args } = buildYtDlpArgs(task);
    const fIdx = args.indexOf('-f');
    expect(args[fIdx + 1]).toBe('bestvideo[height<=1080]+bestaudio/best');
  });

  it('يتعرف بدقة على روابط يوتيوب ومنصات الفيديو المختلفة عبر isStreamUrl', () => {
    expect(vm.isStreamUrl('https://www.youtube.com/watch?v=123')).toBe(true);
    expect(vm.isStreamUrl('https://youtu.be/123')).toBe(true);
    expect(vm.isStreamUrl('https://www.tiktok.com/@user/video/123')).toBe(true);
    expect(vm.isStreamUrl('https://facebook.com/watch?v=123')).toBe(true);
    expect(vm.isStreamUrl('https://stream.example.com/live.m3u8')).toBe(true);
    expect(vm.isStreamUrl('https://example.com/file.zip')).toBe(false);
  });

  it('يضيف وسيطة ترميز AAC الستيريو لضمان تشغيل الصوت في مشغلات ويندوز', () => {
    const task = {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      dir: 'C:\\Downloads',
      mergeOutput: 'mp4'
    };
    const { args } = buildYtDlpArgs(task);
    expect(args).toContain('--postprocessor-args');
    const pIdx = args.indexOf('--postprocessor-args');
    expect(args[pIdx + 1]).toContain('Merger:-c:v copy -c:a aac -b:a 192k');
  });

  it('يلخص ملفات الوسائط الرقمية بدون أحرف باينري مشوهة (Mojibake-free)', async () => {
    const ContentSummarizer = (await import('../../src/main/ai/ContentSummarizer.js')).default || (await import('../../src/main/ai/ContentSummarizer.js'));
    const cs = new ContentSummarizer();
    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs');
    const tmpFile = path.join(os.tmpdir(), 'pdm_test_video_sample.mp4');
    fs.writeFileSync(tmpFile, Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]));

    try {
      const res = await cs.summarizeFile(tmpFile);
      expect(res.summary).toContain('تحليل ملف الوسائط');
      expect(res.keyPoints.length).toBeGreaterThan(0);
      expect(res.summary).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F]/);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});
