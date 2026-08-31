'use strict';

const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const YT_DLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const FFMPEG_URL = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip';

const once = (em, ev) => new Promise(r => em.once(ev, r));

function fmtSize(n) {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i ? v.toFixed(1) : v) + ' ' + u[i];
}

/* مدير تحميل الفيديوهات: يعتمد yt-dlp (تنزيل تلقائي) و ffmpeg (تنزيل تلقائي عند الحاجة للدمج) */
class VideoManager extends EventEmitter {
  constructor(binDir) {
    super();
    this.binDir = binDir;
    this.ytDlpPath = path.join(binDir, 'yt-dlp.exe');
    this.tasks = new Map();
    this._ensuringYtDlp = null;
    this._ensuringFfmpeg = null;
    this._lastProgEmit = 0;
  }

  hasYtDlp() { return fs.existsSync(this.ytDlpPath); }

  ffmpegDir() {
    return fs.existsSync(path.join(this.binDir, 'ffmpeg.exe')) ? this.binDir : null;
  }

  totalSpeed() {
    let s = 0;
    for (const t of this.tasks.values()) if (t.status === 'downloading') s += t.speed || 0;
    return s;
  }

  activeCount() {
    let c = 0;
    for (const t of this.tasks.values()) if (t.status === 'downloading') c++;
    return c;
  }

  list() {
    return [...this.tasks.values()].map(t => ({ ...t })).sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id) { return this.tasks.get(id) || null; }

  clearFinished() {
    let changed = false;
    for (const [id, t] of [...this.tasks]) {
      if (['completed', 'failed', 'canceled'].includes(t.status)) {
        this.tasks.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit('updated', null);
  }

  _emit(t) { this.emit('updated', t); }

  /* ===== تنزيل الأدوات ===== */
  async ensureYtDlp(onProgress) {
    if (this.hasYtDlp()) return true;
    if (this._ensuringYtDlp) return this._ensuringYtDlp;
    this._ensuringYtDlp = (async () => {
      await fsp.mkdir(this.binDir, { recursive: true });
      await this._downloadFile(YT_DLP_URL, this.ytDlpPath, onProgress);
      return true;
    })();
    try { return await this._ensuringYtDlp; }
    finally { this._ensuringYtDlp = null; }
  }

  async ensureFfmpeg(onProgress) {
    if (this.ffmpegDir()) return this.binDir;
    if (this._ensuringFfmpeg) return this._ensuringFfmpeg;
    this._ensuringFfmpeg = (async () => {
      await fsp.mkdir(this.binDir, { recursive: true });
      const zipPath = path.join(this.binDir, 'ffmpeg.zip');
      const tmpDir = path.join(this.binDir, 'ffmpeg-tmp');
      await this._downloadFile(FFMPEG_URL, zipPath, onProgress);
      // فك الضغط عبر PowerShell (متوفر في ويندوز افتراضياً)
      await new Promise((resolve, reject) => {
        const p = spawn('powershell.exe', ['-NoProfile', '-Command',
          `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${tmpDir}' -Force`], { windowsHide: true });
        p.on('exit', code => code === 0 ? resolve() : reject(new Error('فشل فك ضغط ffmpeg (كود ' + code + ')')));
        p.on('error', reject);
      });
      const found = await this._findFile(tmpDir, 'ffmpeg.exe');
      if (!found) throw new Error('ffmpeg.exe غير موجود داخل الملف المضغوط');
      await fsp.copyFile(found, path.join(this.binDir, 'ffmpeg.exe'));
      try {
        const ff2 = await this._findFile(tmpDir, 'ffprobe.exe');
        if (ff2) await fsp.copyFile(ff2, path.join(this.binDir, 'ffprobe.exe'));
      } catch (_e) { /* اختياري */ }
      try { await fsp.unlink(zipPath); await fsp.rm(tmpDir, { recursive: true, force: true }); } catch (_e) {}
      return this.binDir;
    })();
    try { return await this._ensuringFfmpeg; }
    finally { this._ensuringFfmpeg = null; }
  }

  async _downloadFile(url, dest, onProgress) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' أثناء تنزيل ' + url);
    const total = parseInt(res.headers.get('content-length') || '0', 10) || 0;
    const ws = fs.createWriteStream(dest);
    let done = 0;
    for await (const chunk of res.body) {
      done += chunk.length;
      if (!ws.write(chunk)) await once(ws, 'drain');
      if (onProgress) onProgress(done, total);
    }
    ws.end();
    await once(ws, 'finish');
    return dest;
  }

  async _findFile(dir, name) {
    let result = null;
    const walk = async d => {
      if (result) return;
      let entries;
      try { entries = await fsp.readdir(d, { withFileTypes: true }); } catch (_e) { return; }
      for (const ent of entries) {
        const full = path.join(d, ent.name);
        if (ent.isDirectory()) await walk(full);
        else if (ent.name.toLowerCase() === name) { result = full; return; }
      }
    };
    await walk(dir);
    return result;
  }

  /* تشغيل أمر والتقاط الناتج (للفحص) */
  _runCapture(bin, args, timeoutMs) {
    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args, { windowsHide: true });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => {
        try { proc.kill(); } catch (_e) {}
        reject(new Error('انتهت مهلة الفحص'));
      }, timeoutMs || 120000);
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('error', e => { clearTimeout(timer); reject(e); });
      proc.on('exit', code => {
        clearTimeout(timer);
        if (code === 0) return resolve({ stdout, stderr });
        const tail = stderr.split('\n').filter(l => l.includes('ERROR')).pop()
          || stderr.split('\n').filter(Boolean).pop() || ('كود الخروج ' + code);
        reject(new Error(tail.replace(/^ERROR:\s*/i, '').slice(0, 250)));
      });
    });
  }

  /* ===== فحص فيديو: جلب المعلومات والجودات (يدعم قوائم التشغيل) ===== */
  async probe(url) {
    await this.ensureYtDlp();
    // المحاولة الأولى: فحص سريع هل الرابط قائمة تشغيل؟
    try {
      const flat = await this._runCapture(this.ytDlpPath, ['-J', '--flat-playlist', '--no-warnings', url], 180000);
      let info = null;
      try { info = JSON.parse(flat.stdout); } catch (_e) {}
      if (info && (info._type === 'playlist' || Array.isArray(info.entries))) {
        const entries = (info.entries || [])
          .map((e, i) => ({
            index: i + 1,
            title: e.title || ('#' + (i + 1)),
            duration: e.duration || null
          }))
          .filter(e => e.title);
        if (entries.length) {
          return {
            type: 'playlist',
            url,
            title: info.title || info.id || 'قائمة تشغيل',
            uploader: info.uploader || info.channel || '',
            count: entries.length,
            entries
          };
        }
      }
    } catch (_e) { /* ليس قائمة تشغيل أو فشل الفحص السريع - نتابع كفيديو مفرد */ }

    // فيديو مفرد: فحص كامل
    const { stdout } = await this._runCapture(this.ytDlpPath, ['-J', '--no-playlist', '--no-warnings', url], 180000);
    let info2;
    try { info2 = JSON.parse(stdout); }
    catch (_e) { throw new Error('تعذر تحليل معلومات الرابط'); }
    return {
      type: 'video',
      url,
      title: info2.title || 'فيديو',
      uploader: info2.uploader || info2.channel || '',
      duration: info2.duration || null,
      extractor: info2.extractor_key || '',
      isStream: this.isStreamUrl(url) || String(info2.extractor_key || '').toLowerCase().includes('hls'),
      formats: this._normalizeFormats(info2)
    };
  }

  _normalizeFormats(info) {
    const out = [];
    const seen = new Set();
    const list = (info.formats || []).filter(f => f && f.format_id &&
      (f.vcodec !== 'none' || f.acodec !== 'none'));

    out.push({
      id: 'bestvideo+bestaudio/best',
      label: '⭐ الأفضل جودة متاحة (دمج تلقائي)',
      size: null, merge: true, kind: 'best'
    });

    const vids = list
      .filter(f => f.vcodec !== 'none' && f.height)
      .sort((a, b) => (b.height - a.height) || ((b.fps || 0) - (a.fps || 0)));
    for (const f of vids) {
      const key = f.height + '|' + f.ext;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: f.format_id,
        label: `${f.height}p${f.fps && f.fps > 30 ? f.fps : ''} ${f.ext}${f.acodec === 'none' ? ' — فيديو فقط (دمج)' : ' — فيديو+صوت'}`,
        size: f.filesize || f.filesize_approx || null,
        merge: f.acodec === 'none',
        kind: 'video'
      });
      if (out.length >= 16) break;
    }

    const auds = list
      .filter(f => f.vcodec === 'none' && f.acodec !== 'none' && (f.abr || f.tbr))
      .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
    for (const f of auds.slice(0, 4)) {
      out.push({
        id: f.format_id,
        label: `🎵 صوت ${Math.round(f.abr || f.tbr || 0)}kbps ${f.ext}`,
        size: f.filesize || f.filesize_approx || null,
        merge: false,
        kind: 'audio'
      });
    }

    // روابط مباشرة بلا تقسيم صوت/صورة: أعرض الصيغ الأصلية
    if (out.length === 1) {
      for (const f of list.slice(0, 8)) {
        out.push({
          id: f.format_id,
          label: `${f.height ? f.height + 'p ' : ''}${f.ext}${f.filesize ? ' • ' + fmtSize(f.filesize) : ''}`,
          size: f.filesize || null, merge: false, kind: 'video'
        });
      }
    }
    return out;
  }

  /* ===== بدء تحميل فيديو / قائمة تشغيل ===== */
  async start({ url, formatId, dir, title, playlist, items }) {
    const id = 'vid-' + crypto.randomUUID();
    const task = {
      id, kind: 'video', category: 'video', url,
      formatId: formatId || 'best', dir,
      filename: '', filePath: null,
      title: title || url,
      isPlaylist: !!playlist,
      items: items || null,
      itemsDone: 0, itemsTotal: null,
      status: 'downloading', received: 0, size: null, speed: 0, percent: null,
      error: null, createdAt: Date.now(), completedAt: null, phase: 'تهيئة...'
    };
    this.tasks.set(id, task);
    this._emit(task);
    this._run(task).catch(() => {});
    return { ...task };
  }

  async _run(task) {
    try {
      if (!this.hasYtDlp()) {
        task.phase = 'تنزيل أداة التحميل yt-dlp (مرة واحدة فقط)...';
        this._emit(task);
        await this.ensureYtDlp((done, total) => {
          task.received = done;
          task.size = total || null;
          task.percent = total ? (done / total) * 100 : null;
          this._emit(task);
        });
        task.received = 0; task.size = null; task.percent = null;
      }

      const needsMerge = (task.formatId || '').includes('+') || this.isStreamUrl(task.url);
      if (needsMerge && !this.ffmpegDir()) {
        task.phase = 'تنزيل أداة الدمج ffmpeg (مرة واحدة فقط)...';
        this._emit(task);
        await this.ensureFfmpeg((done, total) => {
          task.received = done;
          task.size = total || null;
          task.percent = total ? (done / total) * 100 : null;
          this._emit(task);
        });
        task.received = 0; task.size = null; task.percent = null;
      }

      await fsp.mkdir(task.dir, { recursive: true });
      const args = ['--newline', '--no-warnings'];
      if (task.isPlaylist) {
        args.push(
          '--yes-playlist',
          '-o', path.join(task.dir, '%(playlist_title|Playlist).60s/%(title).80s.%(ext)s')
        );
        if (task.items) args.push('--playlist-items', task.items);
      } else {
        args.push(
          '-f', task.formatId || 'best',
          '--no-playlist',
          '-o', path.join(task.dir, '%(title).80s.%(ext)s')
        );
      }
      args.push(
        '--progress-template', 'download:PROG|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.speed)s|%(progress._percent_str)s',
        '--print', 'after_move:DONE|%(filepath)s'
      );
      const ffDir = this.ffmpegDir();
      if (ffDir) args.push('--ffmpeg-location', ffDir);
      args.push(task.url);

      await new Promise((resolve, reject) => {
        const proc = spawn(this.ytDlpPath, args, { windowsHide: true });
        task._proc = proc;
        let stdoutBuf = '';
        const handleLine = line => {
          const l = line.trim();
          if (l.startsWith('PROG|')) {
            const [, rec, tot, spd, pct] = l.split('|');
            task.received = parseInt(rec, 10) || 0;
            if (tot && tot !== 'NA') task.size = parseInt(tot, 10) || null;
            task.speed = Math.max(0, Math.round(parseFloat(spd) || 0));
            const p = parseFloat(pct);
            if (!isNaN(p)) {
              if (task.isPlaylist && task.itemsTotal) {
                const doneCount = task.itemsDone || 0;
                task.percent = Math.min(100, ((doneCount + p / 100) / task.itemsTotal) * 100);
              } else {
                task.percent = p;
              }
            }
            task.phase = 'جاري التحميل';
            // تقييد الإرسال: كل 600ms فقط (yt-dlp يرسل أسطراً متكررة جداً)
            const now = Date.now();
            if (!this._lastProgEmit || now - this._lastProgEmit > 600) {
              this._lastProgEmit = now;
              this._emit(task);
            }
          } else if (l.startsWith('[download] Downloading item ')) {
            const m = /Downloading item (\d+) of (\d+)/i.exec(l);
            if (m) {
              task.itemsTotal = parseInt(m[2], 10) || task.itemsTotal;
              task.itemsDone = (parseInt(m[1], 10) || 1) - 1;
              task.phase = `العنصر ${m[1]} / ${m[2]}`;
              this._emit(task);
            }
          } else if (l.startsWith('[download] Destination:') || l.startsWith('[Merger]') || l.startsWith('[ExtractAudio]')) {
            const m = /"(.+)"$/.exec(l) || /Destination:\s*(.+)$/.exec(l);
            if (m) { task.filename = path.basename(m[1]); task.filePath = m[1]; }
          } else if (l.startsWith('DONE|')) {
            task.filePath = l.slice(5).trim();
            task.filename = path.basename(task.filePath);
            if (task.isPlaylist) {
              task.itemsDone = (task.itemsDone || 0) + 1;
              if (task.itemsTotal) {
                task.percent = Math.min(100, (task.itemsDone / task.itemsTotal) * 100);
              }
              this._emit(task);
            }
          }
        };
        proc.stdout.on('data', d => {
          stdoutBuf += d.toString();
          let idx;
          while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
            handleLine(stdoutBuf.slice(0, idx));
            stdoutBuf = stdoutBuf.slice(idx + 1);
          }
        });
        let stderrBuf = '';
        proc.stderr.on('data', d => { stderrBuf += d.toString(); });
        proc.on('error', reject);
        proc.on('exit', code => {
          task._proc = null;
          if (task.status === 'canceled') return resolve();
          if (code === 0 && task.filePath) {
            task.status = 'completed';
            task.completedAt = Date.now();
            task.speed = 0;
            task.percent = 100;
            task.phase = '';
            this._emit(task);
            return resolve();
          }
          const tail = stderrBuf.split('\n').filter(l => l.includes('ERROR')).pop()
            || stderrBuf.split('\n').filter(Boolean).pop();
          reject(new Error((tail || ('yt-dlp خرج بكود ' + code)).replace(/^ERROR:\s*/i, '').slice(0, 250)));
        });
      });
    } catch (err) {
      if (task.status !== 'canceled') {
        task.status = 'failed';
        task.error = String((err && err.message) || err).slice(0, 300);
        this._emit(task);
      }
    }
  }

  cancel(id) {
    const t = this.tasks.get(id);
    if (!t || t.status !== 'downloading') return;
    t.status = 'canceled';
    t.speed = 0;
    if (t._proc) {
      try { spawn('taskkill', ['/pid', String(t._proc.pid), '/T', '/F'], { windowsHide: true }); } catch (_e) {}
      t._proc = null;
    }
    this._emit(t);
  }

  remove(id) {
    const t = this.tasks.get(id);
    if (!t) return;
    if (t.status === 'downloading') this.cancel(id);
    this.tasks.delete(id);
    this.emit('updated', t);
  }

  isStreamUrl(url) {
    return /\.m3u8($|[?#])|\.mpd($|[?#])/i.test(String(url || ''));
  }

  /* تحميل تلقائي بأفضل جودة (للروابط القادمة من المتصفح/الحافظة) */
  async autoDownload(url, defaultDir) {
    try {
      const info = await this.probe(url);
      return await this.start({ url, formatId: 'bestvideo+bestaudio/best', dir: defaultDir, title: info.title });
    } catch (err) {
      const id = 'vid-' + crypto.randomUUID();
      const task = {
        id, kind: 'video', category: 'video', url, dir: defaultDir, title: url,
        status: 'failed', received: 0, size: null, speed: 0, percent: null,
        error: String((err && err.message) || err).slice(0, 300),
        createdAt: Date.now(), completedAt: null, filename: '', filePath: null,
        formatId: 'best', phase: ''
      };
      this.tasks.set(id, task);
      this._emit(task);
      return { ...task };
    }
  }
}

module.exports = VideoManager;
