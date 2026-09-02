'use strict';
/* دعم بروتوكولات FTP/FTPS (2.4) — وحدة مستقلة تحاكي واجهة DownloadTask
   (EventEmitter: start/pause/cancel/snapshot/resumeState/ensureStopped)
   حتى يتعامل معها المدير والواجهة بلا أي تغيير. يدعم:
   - ftp:// و ftps:// (TLS)
   - بيانات دخول من الرابط: ftp://user:pass@host/path
   - استئناف من نقطة (REST) للمهام المحفوظة
   - محدد السرعة المشترك (limiter) */

const { EventEmitter } = require('events');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { Transform } = require('stream');
const { Client } = require('basic-ftp');

const isFtpUrl = url => /^ftps?:\/\//i.test(String(url || ''));

function parseFtpUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : (u.protocol === 'ftps:' ? 990 : 21),
    user: u.username ? decodeURIComponent(u.username) : 'anonymous',
    password: u.password ? decodeURIComponent(u.password) : 'anonymous',
    secure: u.protocol === 'ftps:',
    remotePath: decodeURIComponent(u.pathname || '/')
  };
}

class FtpTask extends EventEmitter {
  constructor(opts) {
    super();
    this.id = opts.id;
    this.url = opts.url;
    this.kind = 'ftp';
    this._parsed = parseFtpUrl(this.url);
    this.filename = opts.filename || this._parsed.remotePath.split('/').pop() || '';
    this.dir = opts.dir;
    this.filePath = this.filename ? path.join(this.dir, this.filename) : '';
    this.category = opts.category || 'other';
    this.status = opts.status || 'queued';
    this.size = opts.size || null;
    this.received = opts.received || 0;
    this.speed = 0;
    this.error = opts.error || null;
    this.createdAt = opts.createdAt || Date.now();
    this.completedAt = opts.completedAt || null;
    this.limiter = opts.limiter || null;
    this.supportsRanges = false;
    this.segments = [];
    this.paused = false;
    this.aborted = false;
    this._client = null;
    this._stream = null;
    this._timer = null;
    this._last = { t: Date.now(), b: this.received };
  }

  snapshot() {
    return {
      id: this.id,
      url: this.url,
      kind: 'ftp',
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
      supportsRanges: false,
      connections: this._client ? 1 : 0,
      segments: []
    };
  }

  resumeState() {
    if (!this.received) return null;
    return {
      url: this.url, filename: this.filename, dir: this.dir,
      size: this.size, received: this.received, ftp: true
    };
  }

  _restore(s) {
    this.filename = s.filename || this.filename;
    this.dir = s.dir || this.dir;
    this.filePath = this.filename ? path.join(this.dir, this.filename) : '';
    this.size = s.size || null;
    this.received = s.received || 0;
  }

  async start(savedState) {
    this.paused = false;
    this.aborted = false;
    this.error = null;
    this.status = 'downloading';
    this._emit();
    if (savedState) this._restore(savedState);
    return this._run();
  }

  async _run() {
    const client = new Client(5000);
    this._client = client;
    let ws = null;
    try {
      await fsp.mkdir(this.dir, { recursive: true });
      const exists = fs.existsSync(this.filePath);
      const startAt = (exists && this.received) ? this.received : 0;
      if (!this.size) {
        try { this.size = await client.size(this._parsed.remotePath); } catch (_e) { this.size = null; }
      }
      ws = fs.createWriteStream(this.filePath, { flags: startAt ? 'r+' : 'w', start: startAt });
      this._stream = ws;
      let bytes = 0;
      const task = this;
      const counter = new Transform({
        transform(chunk, _enc, cb) {
          bytes += chunk.length;
          task.received = startAt + bytes;
          Promise.resolve(task.limiter ? task.limiter.take(chunk.length, task) : null)
            .then(() => cb(null, chunk), cb);
        }
      });
      this._startTimer();
      await client.downloadTo(counter, this._parsed.remotePath, startAt);
      await new Promise(resolve => {
        if (!ws.writableEnded) ws.end(resolve);
        else resolve();
      });
      if (this.size && this.received < this.size) throw new Error('انقطع التحميل قبل اكتمال الملف');
      this.status = 'completed';
      this.completedAt = Date.now();
      this.speed = 0;
    } catch (err) {
      if (this.paused || this.aborted) {
        this.status = 'paused';
      } else {
        this.status = 'failed';
        this.error = String((err && err.message) || err);
      }
      this.speed = 0;
    } finally {
      this._stopTimer();
      try { if (ws && !ws.destroyed && ws.writable) ws.end(); } catch (_e) {}
      try { client.close(); } catch (_e) {}
      this._client = null;
      this._stream = null;
      this._emit();
    }
  }

  async ensureStopped(timeoutMs = 5000) {
    this.pause();
    const t0 = Date.now();
    while (this._client && Date.now() - t0 < timeoutMs) {
      await new Promise(r => setTimeout(r, 60));
    }
  }

  pause() {
    this.paused = true;
    this.aborted = true;
    this._teardown();
    if (this.status === 'downloading') this.status = 'paused';
    this.speed = 0;
    this._emit();
  }

  cancel() {
    this.paused = true;
    this.aborted = true;
    this._teardown();
    this.status = 'canceled';
    this.speed = 0;
    this._emit();
  }

  _teardown() {
    try { if (this._client) this._client.close(); } catch (_e) {}
    this._client = null;
    try { if (this._stream) this._stream.destroy(); } catch (_e) {}
    this._stream = null;
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
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this.speed = 0;
  }

  _emit() {
    this.emit('updated', this.snapshot());
  }
}

module.exports = { FtpTask, isFtpUrl, parseFtpUrl };