'use strict';

const { EventEmitter } = require('events');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 PremiumDM/1.0';
const MIN_SEGMENT = 1024 * 1024; // أقل حجم لجزء واحد (1MB)
const MAX_RETRIES = 5;

class DownloadTask extends EventEmitter {
  constructor(opts) {
    super();
    this.id = opts.id;
    this.url = opts.url;
    this.finalUrl = opts.finalUrl || null;
    this.filename = opts.filename || '';
    this.dir = opts.dir;
    this.filePath = this.filename ? path.join(this.dir, this.filename) : '';
    this.category = opts.category || 'other';
    this.headers = opts.headers || {};
    this.maxConnections = opts.maxConnections || 8;
    this.limiter = opts.limiter || null;
    this.mirrors = Array.isArray(opts.mirrors) ? opts.mirrors.filter(Boolean) : [];
    this._mirrorIdx = 0;        // 0 = الرابط الأساسي، 1..n = البدائل
    this._needsReprobe = false; // بعد التبديل لمصدر بديل
    this.status = opts.status || 'queued';
    this.size = opts.size || null;
    this.received = opts.received || 0;
    this.speed = 0;
    this.error = opts.error || null;
    this.createdAt = opts.createdAt || Date.now();
    this.completedAt = opts.completedAt || null;
    this.supportsRanges = !!opts.supportsRanges;
    this.segments = [];
    if (Array.isArray(opts.segments)) {
      for (const s of opts.segments) {
        this.segments.push({ start: s.start, end: s.end, received: s.received || 0, done: !!s.done });
      }
      this.received = this.segments.reduce((a, s) => a + s.received, 0);
    }
    this.fd = null;
    this.aborted = false;
    this.paused = false;
    this._controllers = new Set();
    this._timer = null;
    this._last = { t: Date.now(), b: this.received };
    this._retries = 0;
    this._fileReady = false;
    this._deleteOnStop = false;
  }

  snapshot() {
    return {
      id: this.id,
      url: this.url,
      filename: this.filename,
      dir: this.dir,
      filePath: this.filePath,
      category: this.category,
      status: this.status,
      size: this.size,
      received: this.received,
      speed: this.speed,
      error: this.error,
      createdAt: this.createdAt,
      completedAt: this.completedAt,
      supportsRanges: this.supportsRanges,
      mirrors: this.mirrors,
      connections: this._controllers.size,
      segments: this.segments.map(s => ({ start: s.start, end: s.end, received: s.received, done: !!s.done }))
    };
  }

  resumeState() {
    if (!this.segments.length) return null;
    return {
      url: this.url,
      finalUrl: this.finalUrl,
      filename: this.filename,
      dir: this.dir,
      size: this.size,
      supportsRanges: this.supportsRanges,
      headers: this.headers,
      mirrors: this.mirrors,
      segments: this.segments.map(s => ({ start: s.start, end: s.end, received: s.received, done: !!s.done }))
    };
  }

  async start(savedState) {
    this.paused = false;
    this.aborted = false;
    this.error = null;
    this.status = 'downloading';
    this._emit();
    if (savedState) this._restore(savedState);
    else if (this._needsReprobe) {
      await this._probe();
      this._needsReprobe = false;
    }
    try {
      if (!this.segments.length) await this._initialize();
      await this._openFd();
      this._startTimer();
      await this._runAll();
      if (this.size && this.received < this.size) throw new Error('الملف غير مكتمل');
      this.status = 'completed';
      this.completedAt = Date.now();
      this.speed = 0;
    } catch (err) {
      this._handleError(err);
    } finally {
      this._stopTimer();
      await this._closeFd();
      this._emit();
    }
  }

  _restore(state) {
    this.finalUrl = state.finalUrl || null;
    this.filename = state.filename || this.filename;
    this.dir = state.dir || this.dir;
    this.filePath = this.filename ? path.join(this.dir, this.filename) : '';
    this.size = state.size || null;
    this.supportsRanges = !!state.supportsRanges;
    this.headers = state.headers || this.headers;
    this.mirrors = Array.isArray(state.mirrors) ? state.mirrors : this.mirrors;
    this.segments = (state.segments || []).map(s => ({ ...s, done: !!s.done }));
    this.received = this.segments.reduce((a, s) => a + s.received, 0);
    this._fileReady = fs.existsSync(this.filePath);
  }

  async _initialize() {
    const info = await this._probe();
    if (info.filename && !this.filename) this.filename = info.filename;
    if (!this.filename) this.filename = this._defaultName(info.contentType);
    this.filePath = path.join(this.dir, this.filename);
    if (!info.size) {
      this.size = null;
      this.supportsRanges = false;
      this.segments = [{ start: 0, end: null, received: 0, done: false }];
      return;
    }
    this.size = info.size;
    this.supportsRanges = info.ranges;
    this._allocSegments();
  }

  _allocSegments() {
    if (this.supportsRanges && this.size) {
      const n = Math.max(1, Math.min(this.maxConnections, Math.floor(this.size / MIN_SEGMENT) || 1));
      const per = Math.floor(this.size / n);
      let start = 0;
      for (let i = 0; i < n; i++) {
        const end = i === n - 1 ? this.size - 1 : start + per - 1;
        this.segments.push({ start, end, received: 0, done: false });
        start = end + 1;
      }
    } else {
      this.segments.push({ start: 0, end: this.size || null, received: 0, done: false });
    }
  }

  async _openFd() {
    if (this.fd) return;
    await fsp.mkdir(this.dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      if (this.segments.length) {
        this.segments = [];
        this.received = 0;
        await this._initialize();
      }
      this.fd = await fsp.open(this.filePath, 'w');
    } else {
      this.fd = await fsp.open(this.filePath, 'r+');
    }
    if (this.size && !this._fileReady) {
      await this.fd.truncate(this.size);
      this._fileReady = true;
    }
  }

  _currentUrl() {
    if (!this.mirrors.length || this._mirrorIdx === 0) return this.url;
    return this.mirrors[(this._mirrorIdx - 1) % this.mirrors.length];
  }

  async _probe() {
    // جرّب المصدر الحالي ثم دوّر على البدائل عند الفشل
    const total = this.mirrors.length + 1;
    let lastErr = null;
    for (let attempt = 0; attempt < total; attempt++) {
      try {
        return await this._probeUrl(this._currentUrl());
      } catch (err) {
        lastErr = err;
        if (this.mirrors.length) this._mirrorIdx = (this._mirrorIdx + 1) % total;
      }
    }
    throw lastErr;
  }

  async _probeUrl(url) {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, ...this.headers, range: 'bytes=0-0' },
      redirect: 'follow'
    });
    if (!res.ok) {
      if (res.body) { try { res.body.cancel(); } catch (_e) {} }
      throw new Error('HTTP ' + res.status);
    }
    this.finalUrl = res.url || url;
    const cd = res.headers.get('content-disposition') || '';
    let filename = '';
    let m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    if (m) { try { filename = decodeURIComponent(m[1]); } catch (_e) {} }
    if (!filename) {
      m = /filename\s*=\s*"?([^";]+)"?/i.exec(cd);
      if (m) filename = m[1].trim();
    }
    let size = null;
    let ranges = false;
    const contentType = res.headers.get('content-type') || '';
    const cr = res.headers.get('content-range');
    if (res.status === 206 && cr) {
      const total = cr.split('/')[1];
      if (total && total !== '*') size = parseInt(total, 10);
      ranges = true;
    } else {
      const cl = res.headers.get('content-length');
      if (cl) size = parseInt(cl, 10);
    }
    if (res.body) { try { res.body.cancel(); } catch (_e) {} }
    return { size, ranges, filename, contentType };
  }

  _defaultName(contentType) {
    const MIME_EXT = {
      'video/mp4': '.mp4', 'video/x-matroska': '.mkv', 'video/webm': '.webm',
      'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/wav': '.wav',
      'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
      'application/pdf': '.pdf', 'application/zip': '.zip',
      'application/x-rar-compressed': '.rar', 'application/x-7z-compressed': '.7z',
      'application/x-msdownload': '.exe', 'application/x-msi': '.msi',
      'application/json': '.json', 'text/plain': '.txt', 'text/html': '.html',
      'application/octet-stream': ''
    };
    const ext = MIME_EXT[(contentType || '').split(';')[0].trim().toLowerCase()] ?? '.bin';
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `download-${stamp}-${Math.floor(Math.random() * 9000 + 1000)}${ext}`;
  }

  async _runAll() {
    const active = this.segments.filter(s => !s.done);
    if (!active.length) return;
    try {
      await Promise.all(active.map(s => this._runSegment(s)));
    } catch (err) {
      this._abortControllers();
      throw err;
    }
  }

  async _runSegment(seg) {
    const controller = new AbortController();
    this._controllers.add(controller);
    try {
      const headers = { 'user-agent': UA, ...this.headers };
      const useRange = this.supportsRanges && this.size && seg.end !== null;
      if (useRange) {
        headers.range = `bytes=${seg.start + seg.received}-${seg.end}`;
      } else if (seg.received) {
        this.received -= seg.received;
        seg.received = 0;
      }
      const res = await fetch(this.finalUrl || this.url, {
        headers,
        signal: controller.signal,
        redirect: 'follow'
      });
      if (res.status === 416) { seg.done = true; return; }
      if (headers.range && res.status === 200) {
        if (this.segments.length > 1) throw new Error('ERR_NO_RANGE');
        this.received -= seg.received;
        seg.received = 0;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (!res.body) throw new Error('لا توجد بيانات من الخادم');
      for await (const chunk of res.body) {
        if (this.aborted) throw new Error('aborted');
        if (this.limiter) await this.limiter.take(chunk.length, this);
        // كتابة كاملة مع معالجة الكتابات الجزئية
        let toWrite = chunk;
        let pos = seg.start + seg.received;
        while (toWrite.length) {
          const w = await this.fd.write(toWrite, 0, toWrite.length, pos);
          if (!w.bytesWritten) throw new Error('فشل كتابة البيانات على القرص');
          pos += w.bytesWritten;
          toWrite = toWrite.subarray(w.bytesWritten);
        }
        seg.received += chunk.length;
        this.received += chunk.length;
      }
      seg.done = true;
    } finally {
      this._controllers.delete(controller);
      this._emit();
    }
  }

  _handleError(err) {
    if (this.paused || this.aborted) {
      this.status = 'paused';
      this.speed = 0;
      return;
    }
    let msg = String((err && err.message) || err);
    // رسالة أوضح لحماية الروابط (403)
    if (/HTTP 403/.test(msg)) {
      msg = 'HTTP 403 — الرابط محمي (يتطلب مصدر إحالة Referer). أضف حقل Referer عند الإضافة أو استخدم الإضافة من المتصفح';
    }
    // تراجع تلقائي: الخادم رفض التجزئة → اتصال واحد
    if (msg.includes('ERR_NO_RANGE') && this.supportsRanges) {
      this.supportsRanges = false;
      this.segments = this.size
        ? [{ start: 0, end: this.size - 1, received: 0, done: false }]
        : [{ start: 0, end: null, received: 0, done: false }];
      this.received = 0;
      this._retries = 0;
      this._fileReady = false;
      this._last = { t: Date.now(), b: 0 };
      this.status = 'queued';
      this._emit();
      setTimeout(() => {
        if (!this.paused && !this.aborted && this.status === 'queued') this._resumeInternal();
      }, 800);
      return;
    }
    if (this._retries < MAX_RETRIES && msg !== 'aborted') {
      this._retries += 1;
      this.status = 'queued';
      this._emit();
      setTimeout(() => {
        if (!this.paused && !this.aborted && this.status === 'queued') this._resumeInternal();
      }, 1500 * this._retries);
    } else if (this.mirrors.length && this._mirrorIdx < this.mirrors.length) {
      // المصدر الأساسي فشل نهائياً — انتقل تلقائياً للمصدر البديل التالي
      this._mirrorIdx += 1;
      this._retries = 0;
      this._needsReprobe = true;
      this.status = 'queued';
      this._emit();
      setTimeout(() => {
        if (!this.paused && !this.aborted && this.status === 'queued') this._resumeInternal();
      }, 1000);
    } else {
      this.status = 'failed';
      this.error = msg;
      this.speed = 0;
      // لا نترك ملفاً فارغاً بحجم كامل إذا لم يُكتب أي بايت
      if (!this.received) this._deleteOnStop = true;
    }
  }

  async _resumeInternal() {
    this.status = 'downloading';
    this._emit();
    try {
      if (this._needsReprobe) {
        // مصدر بديل: حدّث الرابط النهائي وواصل من نفس النقطة
        await this._probe();
        this._needsReprobe = false;
      }
      // إعادة المحاولة بعد فشل الفحص الأول: يجب تخصيص المقاطع أولاً
      if (!this.segments.length) await this._initialize();
      await this._openFd();
      this._startTimer();
      await this._runAll();
      if (this.size && this.received < this.size) throw new Error('الملف غير مكتمل');
      this.status = 'completed';
      this.completedAt = Date.now();
      this.speed = 0;
    } catch (err) {
      this._handleError(err);
    } finally {
      this._stopTimer();
      await this._closeFd();
      this._emit();
    }
  }

  pause() {
    this.paused = true;
    this.aborted = true;
    this._abortControllers();
    if (this.status !== 'downloading') this.status = 'paused';
    this.speed = 0;
    this._emit();
  }

  cancel(deleteFile) {
    this.paused = true;
    this.aborted = true;
    this._abortControllers();
    this.status = 'canceled';
    this.speed = 0;
    if (deleteFile) this._deleteOnStop = true;
    this._emit();
  }

  _abortControllers() {
    for (const c of this._controllers) {
      try { c.abort(); } catch (_e) {}
    }
  }

  async _closeFd() {
    if (this.fd) {
      const fd = this.fd;
      this.fd = null;
      try { await fd.close(); } catch (_e) {}
    }
    if (this._deleteOnStop && this.filePath && fs.existsSync(this.filePath)) {
      try { await fsp.unlink(this.filePath); } catch (_e) {}
      this._deleteOnStop = false;
    }
  }

  _startTimer() {
    if (this._timer) return;
    this._last = { t: Date.now(), b: this.received };
    this._timer = setInterval(() => {
      const now = Date.now();
      const dt = (now - this._last.t) / 1000;
      if (dt >= 0.4) {
        this.speed = Math.max(0, Math.round((this.received - this._last.b) / dt));
        this._last = { t: now, b: this.received };
      }
      this._emit();
    }, 600);
  }

  _stopTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this.speed = 0;
  }

  _emit() {
    this.emit('updated', this.snapshot());
  }
}

module.exports = DownloadTask;
