'use strict';

const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { buildYtDlpArgs } = require('./ytdlp-args');
const { binaries, needsChmod } = require('../platforms');

const once = (em, ev) => new Promise(r => em.once(ev, r));

function fmtSize(n) {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i ? v.toFixed(1) : v) + ' ' + u[i];
}

/* مدير تحميل الفيديوهات: يعتمد yt-dlp (تنزيل تلقائي) و ffmpeg (تنزيل تلقائي عند الحاجة للدمج)
   متعدد المنصات (6.1): win32 / darwin / linux عبر platforms.js */
class VideoManager extends EventEmitter {
  constructor(binDir) {
    super();
    this.binDir = binDir;
    const bins = binaries(process.platform, process.arch);
    this.ytDlpPath = path.join(binDir, bins.ytDlp.file);
    this._bins = bins;
    this.tasks = new Map();
    this._ensuringYtDlp = null;
    this._ensuringFfmpeg = null;
    this._lastProgEmit = 0;
  }

  hasYtDlp() {
    if (fs.existsSync(this.ytDlpPath)) {
      try {
        const stat = fs.statSync(this.ytDlpPath);
        if (stat.size > 1024 * 512) return true;
        fs.unlinkSync(this.ytDlpPath);
      } catch (_e) {}
    }
    try {
      const { execSync } = require('child_process');
      const cmd = process.platform === 'win32' ? 'where yt-dlp.exe' : 'which yt-dlp';
      const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 }).toString().trim();
      if (out) {
        const first = out.split('\n')[0].trim();
        if (fs.existsSync(first)) {
          this.ytDlpPath = first;
          return true;
        }
      }
    } catch (_e) {}
    return false;
  }

  ffmpegDir() {
    const localFfmpeg = path.join(this.binDir, this._bins.ffmpeg.file);
    if (fs.existsSync(localFfmpeg)) {
      try {
        if (fs.statSync(localFfmpeg).size > 1024 * 512) return this.binDir;
        fs.unlinkSync(localFfmpeg);
      } catch (_e) {}
    }
    try {
      const { execSync } = require('child_process');
      const cmd = process.platform === 'win32' ? 'where ffmpeg.exe' : 'which ffmpeg';
      const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 }).toString().trim();
      if (out) {
        const first = out.split('\n')[0].trim();
        if (fs.existsSync(first)) return path.dirname(first);
      }
    } catch (_e) {}
    return null;
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

  /* إزالة مهمة فيديو، مع إمكانية حذف الملف من القرص */
  remove(id, deleteFile) {
    const t = this.tasks.get(id);
    if (!t) return;
    if (t.status === 'downloading') this.cancel(id);
    if (deleteFile && t.filePath) {
      try {
        const st = fs.statSync(t.filePath);
        if (st.isDirectory()) fs.rmSync(t.filePath, { recursive: true, force: true });
        else fs.unlinkSync(t.filePath);
      } catch (_e) {}
    }
    this.tasks.delete(id);
    this.emit('updated', t);
  }

  _emit(t) { this.emit('updated', t); }

  /* ===== تنزيل الأدوات (6.1: متعدد المنصات) ===== */
  async ensureYtDlp(onProgress) {
    if (this.hasYtDlp()) return true;
    if (this._ensuringYtDlp) return this._ensuringYtDlp;
    this._ensuringYtDlp = (async () => {
      await fsp.mkdir(this.binDir, { recursive: true });
      await this._downloadFile(this._bins.ytDlp.url, this.ytDlpPath, onProgress);
      if (needsChmod(process.platform)) {
        try { await fsp.chmod(this.ytDlpPath, 0o755); } catch (_e) {}
      }
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
      const dest = path.join(this.binDir, this._bins.ffmpeg.file);
      await this._downloadFile(this._bins.ffmpeg.url, dest, onProgress);
      if (needsChmod(process.platform)) {
        try { await fsp.chmod(dest, 0o755); } catch (_e) {}
      }
      return this.binDir;
    })();
    try { return await this._ensuringFfmpeg; }
    finally { this._ensuringFfmpeg = null; }
  }

  async _downloadFile(url, dest, onProgress) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' أثناء تنزيل ' + url);
    const total = parseInt(res.headers.get('content-length') || '0', 10) || 0;
    const tmpDest = `${dest}.tmp.${Date.now()}`;
    const ws = fs.createWriteStream(tmpDest);
    let done = 0;
    try {
      for await (const chunk of res.body) {
        done += chunk.length;
        if (!ws.write(chunk)) await once(ws, 'drain');
        if (onProgress) onProgress(done, total);
      }
      ws.end();
      await once(ws, 'finish');
      await fsp.rename(tmpDest, dest);
      return dest;
    } catch (err) {
      try { ws.destroy(); } catch (_e) {}
      try { if (fs.existsSync(tmpDest)) fs.unlinkSync(tmpDest); } catch (_e) {}
      throw err;
    }
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
        let totalDuration = 0;
        const entries = (info.entries || [])
          .map((e, i) => {
            const id = e.id || '';
            const thumb = (Array.isArray(e.thumbnails) && e.thumbnails.length)
              ? e.thumbnails[e.thumbnails.length - 1].url
              : (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '');
            if (e.duration) totalDuration += e.duration;
            return {
              index: i + 1,
              id,
              url: e.url || (id ? `https://www.youtube.com/watch?v=${id}` : url),
              title: e.title || ('#' + (i + 1)),
              duration: e.duration || null,
              thumbnail: thumb
            };
          })
          .filter(e => e.title);
        if (entries.length) {
          return {
            type: 'playlist',
            url,
            title: info.title || info.id || 'قائمة تشغيل',
            uploader: info.uploader || info.channel || '',
            count: entries.length,
            totalDuration,
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
      label: '⭐ الأفضل جودة تلقائياً (صوت وصورة مدمجان)',
      size: null, merge: true, kind: 'best'
    });

    const vids = list
      .filter(f => f.vcodec !== 'none' && f.height)
      .sort((a, b) => (b.height - a.height) || ((b.fps || 0) - (a.fps || 0)));
    for (const f of vids) {
      const key = f.height + '|' + (f.fps && f.fps > 30 ? f.fps : 30);
      if (seen.has(key)) continue;
      seen.add(key);

      // دمج تلقائي دائماً: إذا كان المسار فيديو فقط (DASH في يوتيوب)، نضيف أفضل مسار صوت تلقائياً
      const formatId = (f.acodec === 'none')
        ? `${f.format_id}+bestaudio/best`
        : f.format_id;

      const heightLabel = f.height >= 2160 ? '4K Ultra HD (2160p)'
        : f.height >= 1440 ? '2K Quad HD (1440p)'
        : f.height >= 1080 ? '1080p Full HD'
        : f.height >= 720 ? '720p HD'
        : `${f.height}p`;
      const fpsLabel = f.fps && f.fps > 30 ? ` ${f.fps}fps` : '';

      out.push({
        id: formatId,
        label: `${heightLabel}${fpsLabel} • فيديو + صوت مدمج (${f.ext || 'mp4'})`,
        size: f.filesize || f.filesize_approx || null,
        merge: true,
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
        label: `🎵 صوت فقط MP3/AAC (${Math.round(f.abr || f.tbr || 0)}kbps)`,
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
  async start({ url, formatId, dir, title, playlist, items,
                audioOnly, subtitles, subsLangs, clipStart, clipEnd, mergeOutput,
                cookiesFrom, subfolder }) {
    const id = 'vid-' + crypto.randomUUID();
    const task = {
      id, kind: 'video', category: 'video', url,
      formatId: formatId || 'bestvideo+bestaudio/best', dir,
      filename: '', filePath: null,
      title: title || url,
      isPlaylist: !!playlist,
      items: items || null,
      itemsDone: 0, itemsTotal: null,
      /* ملك الوسائط (4.x): صوت فقط، ترجمات، قص، صيغة دمج، مجلد فرعي */
      audioOnly: !!audioOnly,
      subtitles: !!subtitles,
      subsLangs: subsLangs || null,
      clipStart: clipStart || null,
      clipEnd: clipEnd || null,
      mergeOutput: mergeOutput || 'mp4',
      cookiesFrom: cookiesFrom || null,
      subfolder: subfolder !== false,
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

      let ffDir = this.ffmpegDir();
      const needsMerge = (task.formatId || '').includes('+') || task.mergeOutput || task.audioOnly || this.isStreamUrl(task.url);
      if (needsMerge && !ffDir) {
        task.phase = 'تنزيل أداة الدمج ffmpeg (مرة واحدة فقط)...';
        this._emit(task);
        await this.ensureFfmpeg((done, total) => {
          task.received = done;
          task.size = total || null;
          task.percent = total ? (done / total) * 100 : null;
          this._emit(task);
        });
        task.received = 0; task.size = null; task.percent = null;
        ffDir = this.ffmpegDir();
      }

      task.ffmpegDir = ffDir;
      const built = buildYtDlpArgs(task);
      await fsp.mkdir(task.dir, { recursive: true });
      const args = built.args;
      await new Promise((resolve, reject) => {
        const env = {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
          LANG: 'en_US.UTF-8'
        };
        const proc = spawn(this.ytDlpPath, args, { env, windowsHide: true });
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
            if (l.startsWith('[Merger]')) {
              task.phase = 'جاري دمج الفيديو والصوت عبر ffmpeg...';
              this._emit(task);
            } else if (l.startsWith('[ExtractAudio]')) {
              task.phase = 'جاري استخراج وتحويل الصوت...';
              this._emit(task);
            }
          } else if (l.startsWith('DONE|')) {
            task.filePath = l.slice(5).trim();
            task.filename = path.basename(task.filePath);
            try {
              if (task.filePath && fs.existsSync(task.filePath)) {
                const st = fs.statSync(task.filePath);
                task.size = st.size;
                task.received = st.size;
              }
            } catch (_e) {}
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
          stdoutBuf += d.toString('utf8');
          let idx;
          while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
            handleLine(stdoutBuf.slice(0, idx));
            stdoutBuf = stdoutBuf.slice(idx + 1);
          }
        });
        let stderrBuf = '';
        proc.stderr.on('data', d => { stderrBuf += d.toString('utf8'); });
        proc.on('error', reject);
        proc.on('exit', code => {
          task._proc = null;
          if (task.status === 'canceled') return resolve();
          if (code === 0) {
            // محاولة ذكية لالتقاط الملف من المجلد إن لم يُلتقط في مسار الطباعة
            if ((!task.filePath || !fs.existsSync(task.filePath)) && task.dir && fs.existsSync(task.dir)) {
              try {
                const files = fs.readdirSync(task.dir).map(f => ({
                  name: f,
                  path: path.join(task.dir, f),
                  mtime: fs.statSync(path.join(task.dir, f)).mtimeMs
                })).filter(f => !f.name.endsWith('.part') && !f.name.endsWith('.ytdl') && !f.name.endsWith('.vtt') && !f.name.endsWith('.srt'));
                files.sort((a, b) => b.mtime - a.mtime);
                if (files.length) {
                  task.filePath = files[0].path;
                  task.filename = files[0].name;
                }
              } catch (_e) {}
            }
            // قراءة الحجم الحقيقي من القرص لمنع ظهور 0 B للملفات المكتملة
            if (task.filePath && fs.existsSync(task.filePath)) {
              try {
                const st = fs.statSync(task.filePath);
                task.size = st.size;
                task.received = st.size;
                if (!task.filename) task.filename = path.basename(task.filePath);
              } catch (_e) {}
            }
            task.status = 'completed';
            task.completedAt = Date.now();
            task.speed = 0;
            task.percent = 100;
            task.phase = '';
            if (!task.filename && task.filePath) task.filename = path.basename(task.filePath);
            if (!task.filename) task.filename = (task.title || 'video') + '.mp4';
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
      /* 6.1: taskkill لقتل شجرة العمليات على ويندوز، إشارة SIGKILL على الأنظمة الأخرى */
      if (process.platform === 'win32') {
        try { spawn('taskkill', ['/pid', String(t._proc.pid), '/T', '/F'], { windowsHide: true }); } catch (_e) {}
      } else {
        try { t._proc.kill('SIGKILL'); } catch (_e) {}
      }
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

  /* ===== استخراج الصوت من فيديو مكتمل إلى MP3 (4.3) =====
     يعمل كعملية خلفية ببطاقة خاصة بها (تقدم مباشر من ffmpeg) */
  async extractAudio(id) {
    const src = this.tasks.get(id);
    if (!src || src.status !== 'completed' || !src.filePath) {
      throw new Error('لا يوجد فيديو مكتمل لاستخراج الصوت');
    }
    const outPath = src.filePath.replace(/\.[^.\\/]+$/, '') + '.mp3';
    if (fs.existsSync(outPath)) throw new Error('الملف الصوتي موجود مسبقاً: ' + path.basename(outPath));

    const taskId = 'aud-' + crypto.randomUUID();
    const task = {
      id: taskId, kind: 'video', category: 'audio', url: src.url,
      formatId: 'audio', dir: path.dirname(src.filePath),
      filename: '', filePath: null,
      title: (src.filename || src.title || 'فيديو') + ' → MP3',
      isPlaylist: false, items: null, itemsDone: 0, itemsTotal: null,
      audioOnly: true, subtitles: false, subsLangs: null,
      clipStart: null, clipEnd: null, mergeOutput: null,
      status: 'downloading', received: 0, size: null, speed: 0, percent: 0,
      error: null, createdAt: Date.now(), completedAt: null, phase: 'استخراج الصوت...'
    };
    this.tasks.set(taskId, task);
    this._emit(task);

    (async () => {
      try {
        if (!this.ffmpegDir()) {
          task.phase = 'تنزيل أداة ffmpeg (مرة واحدة فقط)...';
          this._emit(task);
          await this.ensureFfmpeg((done, total) => {
            task.received = done;
            task.size = total || null;
            task.percent = total ? (done / total) * 100 : null;
            this._emit(task);
          });
          task.received = 0; task.size = null; task.percent = 0;
        }
        const args = ['-y', '-i', src.filePath, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', outPath];
        await new Promise((resolve, reject) => {
          const proc = spawn(path.join(this.ffmpegDir(), 'ffmpeg.exe'), args, { windowsHide: true });
          task._proc = proc;
          let stderr = '';
          proc.stderr.on('data', d => {
            stderr += d.toString();
            if (stderr.length > 4000) stderr = stderr.slice(-2000);
            const tm = /time=(\d+):(\d+):(\d+)/.exec(stderr.slice(-300));
            const dm = /Duration:\s*(\d+):(\d+):(\d+)/.exec(stderr);
            if (tm && dm) {
              const cur = (+tm[1]) * 3600 + (+tm[2]) * 60 + (+tm[3]);
              const tot = (+dm[1]) * 3600 + (+dm[2]) * 60 + (+dm[3]);
              if (tot > 0) task.percent = Math.min(99, (cur / tot) * 100);
            }
            const now = Date.now();
            if (!this._lastProgEmit || now - this._lastProgEmit > 600) {
              this._lastProgEmit = now;
              this._emit(task);
            }
          });
          proc.on('error', reject);
          proc.on('exit', code => {
            task._proc = null;
            if (task.status === 'canceled') return resolve();
            if (code === 0 && fs.existsSync(outPath)) {
              task.status = 'completed';
              task.completedAt = Date.now();
              task.percent = 100;
              task.phase = '';
              task.filePath = outPath;
              task.filename = path.basename(outPath);
              this._emit(task);
              this.emit('audio-extracted', { ok: true, name: task.filename, filePath: outPath });
              return resolve();
            }
            this.emit('audio-extracted', { ok: false, name: src.filename || '' });
            const tail = (stderr.split('\n').filter(Boolean).pop() || '').slice(0, 150);
            reject(new Error('فشل استخراج الصوت (كود ' + code + ') ' + tail));
          });
        });
      } catch (err) {
        if (task.status !== 'canceled') {
          task.status = 'failed';
          task.error = String((err && err.message) || err).slice(0, 300);
          this._emit(task);
        }
      }
    })();

    return { ...task };
  }

  /* تحميل تلقائي بجودة محددة أو الأفضل (للروابط القادمة من المتصفح/الحافظة) */
  async autoDownload(url, defaultDir, opts = {}) {
    try {
      const info = await this.probe(url);
      return await this.start({
        url,
        formatId: opts.formatId || 'bestvideo+bestaudio/best',
        audioOnly: !!opts.audioOnly,
        mergeOutput: opts.mergeOutput || 'mp4',
        dir: defaultDir,
        title: info.title
      });
    } catch (err) {
      const id = 'vid-' + crypto.randomUUID();
      const task = {
        id, kind: 'video', category: 'video', url, dir: defaultDir, title: url,
        status: 'failed', received: 0, size: null, speed: 0, percent: null,
        error: String((err && err.message) || err).slice(0, 300),
        createdAt: Date.now(), completedAt: null, filename: '', filePath: null,
        formatId: opts.formatId || 'best', phase: ''
      };
      this.tasks.set(id, task);
      this._emit(task);
      return { ...task };
    }
  }
}

module.exports = VideoManager;
