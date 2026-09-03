'use strict';

import { describe, it, expect } from 'vitest';
import MediaTranscoder from '../../src/main/integrations/MediaTranscoder.js';

describe('المرحلة 3: استوديو تحويل الوسائط وضغط الملفات المدمج (Built-in Media Transcoder 6.0)', () => {
  it('يبني وسائط استخراج وتحويل الصوت إلى MP3 بمعدل البت المطلوب', () => {
    const transcoder = new MediaTranscoder();
    const args = transcoder.buildArgs('transcode_audio', 'input.mp4', 'output.mp3', { format: 'mp3', bitrate: '320k' });

    expect(args).toContain('-i');
    expect(args).toContain('input.mp4');
    expect(args).toContain('-c:a');
    expect(args).toContain('libmp3lame');
    expect(args).toContain('-b:a');
    expect(args).toContain('320k');
    expect(args[args.length - 1]).toBe('output.mp3');
  });

  it('يبني وسائط استخراج الصوت بدون فقدان جودة (FLAC)', () => {
    const transcoder = new MediaTranscoder();
    const args = transcoder.buildArgs('transcode_audio', 'input.mkv', 'output.flac', { format: 'flac' });

    expect(args).not.toContain('libx264');
    expect(args).toContain('-c:a');
    expect(args).toContain('flac');
    expect(args[args.length - 1]).toBe('output.flac');
  });

  it('يبني وسائط ضغط الفيديو الفائق مع كوديك H.265 (HEVC) وضبط الـ Scale', () => {
    const transcoder = new MediaTranscoder();
    const args = transcoder.buildArgs('compress_video', 'raw_4k.mp4', 'compressed.mp4', {
      hevc: true,
      crf: 28,
      scale: '1920:1080'
    });

    expect(args).toContain('-c:v');
    expect(args).toContain('libx265');
    expect(args).toContain('-crf');
    expect(args).toContain('28');
    expect(args).toContain('-vf');
    expect(args).toContain('scale=1920:1080');
    expect(args[args.length - 1]).toBe('compressed.mp4');
  });

  it('يبني وسائط توليد صور متحركة GIF فائقة الوضوح مع لوحة ألوان palettegen', () => {
    const transcoder = new MediaTranscoder();
    const args = transcoder.buildArgs('generate_gif', 'video.mp4', 'animation.gif', {
      start: '00:01:20',
      duration: 6,
      fps: 15,
      scale: '320:-1'
    });

    expect(args).toContain('-ss');
    expect(args).toContain('00:01:20');
    expect(args).toContain('-t');
    expect(args).toContain('6');
    expect(args.some(a => a.includes('palettegen') && a.includes('paletteuse'))).toBe(true);
    expect(args[args.length - 1]).toBe('animation.gif');
  });
});
