'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * 🎬 Built-in Media Transcoder & Universal Compressor 6.0
 * استوديو متكامل لتحويل الفيديو والصوت وضغط المقاطع وتوليد صور GIF
 * معتمد على محرك ffmpeg المدمج.
 */
class MediaTranscoder {
  constructor(ffmpegDir = null) {
    this.ffmpegDir = ffmpegDir;
  }

  getFfmpegPath() {
    if (this.ffmpegDir) {
      const p = path.join(this.ffmpegDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      if (fs.existsSync(p)) return p;
    }
    return 'ffmpeg';
  }

  /**
   * بناء وسائط ffmpeg لكل عملية تحويل / ضغط / توليد GIF
   */
  buildArgs(type, sourcePath, targetPath, opts = {}) {
    const args = ['-y', '-i', sourcePath];

    if (type === 'transcode_audio') {
      const fmt = opts.format || 'mp3';
      if (fmt === 'mp3') {
        const br = opts.bitrate || '320k';
        args.push('-vn', '-c:a', 'libmp3lame', '-b:a', br);
      } else if (fmt === 'flac') {
        args.push('-vn', '-c:a', 'flac');
      } else if (fmt === 'aac' || fmt === 'm4a') {
        args.push('-vn', '-c:a', 'aac', '-b:a', opts.bitrate || '256k');
      } else if (fmt === 'wav') {
        args.push('-vn', '-c:a', 'pcm_s16le');
      }
    } else if (type === 'compress_video') {
      const codec = opts.hevc ? 'libx265' : 'libx264';
      const crf = opts.crf != null ? String(opts.crf) : (opts.hevc ? '28' : '26');
      const preset = opts.preset || 'medium';
      args.push('-c:v', codec, '-crf', crf, '-preset', preset, '-c:a', 'aac', '-b:a', '128k');
      if (opts.scale) {
        args.push('-vf', `scale=${opts.scale}`);
      }
    } else if (type === 'generate_gif') {
      const start = opts.start || '00:00:00';
      const duration = opts.duration != null ? String(opts.duration) : '5';
      const fps = opts.fps || 12;
      const scale = opts.scale || '480:-1';
      // فلتر لوحة ألوان عالية الجودة لتفادي تحبب الـ GIF
      const vf = `fps=${fps},scale=${scale}:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
      args.splice(1, 0, '-ss', start, '-t', duration);
      args.push('-vf', vf);
    } else {
      // تحويل فيديو عادي (MP4 / MKV / WebM)
      args.push('-c:v', 'libx264', '-c:a', 'aac');
    }

    args.push(targetPath);
    return args;
  }

  /**
   * تنفيذ أمر ffmpeg ومتابعة التقدم
   */
  async runFfmpeg(args, onProgress = null) {
    const ffmpegPath = this.getFfmpegPath();
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, args, { windowsHide: true });
      let stderrBuf = '';

      proc.stderr.on('data', d => {
        const str = d.toString('utf8');
        stderrBuf += str;
        if (onProgress) {
          const timeMatch = /time=(\d{2}:\d{2}:\d{2}\.\d{2})/i.exec(str);
          if (timeMatch) onProgress({ time: timeMatch[1], raw: str });
        }
      });

      proc.on('error', reject);
      proc.on('exit', code => {
        if (code === 0) resolve({ ok: true });
        else reject(new Error('فشل معالجة الوسائط (كود ' + code + '): ' + stderrBuf.slice(-250)));
      });
    });
  }

  async transcodeAudio(source, target, opts = {}, onProgress = null) {
    const args = this.buildArgs('transcode_audio', source, target, opts);
    return this.runFfmpeg(args, onProgress);
  }

  async compressVideo(source, target, opts = {}, onProgress = null) {
    const args = this.buildArgs('compress_video', source, target, opts);
    return this.runFfmpeg(args, onProgress);
  }

  async makeGif(source, target, opts = {}, onProgress = null) {
    const args = this.buildArgs('generate_gif', source, target, opts);
    return this.runFfmpeg(args, onProgress);
  }
}

module.exports = MediaTranscoder;
