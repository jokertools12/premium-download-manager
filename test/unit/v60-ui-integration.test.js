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
});
