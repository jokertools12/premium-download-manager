'use strict';

const { EventEmitter } = require('events');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const DownloadTask = require('./DownloadTask');
const SpeedLimiter = require('./SpeedLimiter');
const { FtpTask, isFtpUrl } = require('../protocols/ftp');
const { normalizeChecksum } = require('./checksum');
const { extractArchive } = require('./extract');
const { dailySeries } = require('../stats/daily');

const CATEGORY_EXTS = {
  video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp', 'ts', 'vob'],
  audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus', 'mid', 'amr'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'raw', 'heic'],
  document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'epub', 'mobi', 'csv', 'md'],
  compressed: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'cab', 'tgz'],
  program: ['exe', 'msi', 'apk', 'dmg', 'pkg', 'deb', 'rpm', 'appx', 'jar', 'bat', 'cmd']
};

function sanitize(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|\r\n]+/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 180);
}

function guessFilename(url) {
  try {
    const u = new URL(url);
    let name = decodeURIComponent(u.pathname.split('/').pop() || '');
    if (name && /\.[a-z0-9]{1,8}$/i.test(name)) return sanitize(name);
  } catch (_e) { /* رابط غير قياسي */ }
  return '';
}

function detectCategory(filename) {
  const ext = (path.extname(filename || '') || '').toLowerCase().replace('.', '');
  for (const [cat, exts] of Object.entries(CATEGORY_EXTS)) {
    if (exts.includes(ext)) return cat;
  }
  return 'other';
}

class DownloadEngine extends EventEmitter {
  constructor(db, stats) {
    super();
    this.db = db;
    this.stats = stats || null;
    this.limiter = new SpeedLimiter();
    this.settings = db.getSettings();
    this.limiter.setRate((this.settings.maxSpeedKB || 0) * 1024);
    this.tasks = new Map();
    this.queue = [];
    this._dirty = new Set();
    for (const rec of db.getTasks()) {
      const t = this._create(rec);
      if (t.status === 'downloading' || t.status === 'queued') t.status = 'paused';
    }
    setInterval(() => this.flush(), 2500);
  }

  _create(rec) {
    const opts = { ...rec, maxConnections: this.settings.maxConnections, limiter: this.limiter };
    /* توجيه حسب البروتوكول: FTP/FTPS عبر وحدة protocols/ftp (2.4) */
    const t = isFtpUrl(rec.url) ? new FtpTask(opts) : new DownloadTask(opts);
    t.on('updated', () => this._onUpdated(t));
    this.tasks.set(t.id, t);
    return t;
  }

  addTask({ url, filename, dir, headers, mirrors, referer, checksum } = {}) {
    url = String(url || '').trim();
    // HTTP/S + FTP/FTPS (2.4)
    if (!/^(https?|ftps?):\/\//i.test(url)) throw new Error('رابط غير صالح');
    for (const t of this.tasks.values()) {
      if (t.url === url && ['queued', 'downloading', 'paused'].includes(t.status)) {
        return { existed: true, task: t.snapshot() };
      }
    }
    const allHeaders = { ...(headers || {}) };
    if (referer) allHeaders.referer = String(referer).trim();
    const altMirrors = Array.isArray(mirrors)
      ? mirrors.map(u => String(u || '').trim()).filter(u => /^https?:\/\//i.test(u) && u !== url)
      : [];
    const fname = sanitize(filename || guessFilename(url));
    const category = fname ? detectCategory(fname) : 'other';

    // ترتيب الأولوية: مجلد يدوي > قاعدة مطابقة > تصنيف تلقائي > المجلد الافتراضي
    let d = dir || null;
    if (!d) {
      const rules = Array.isArray(this.settings.rules) ? this.settings.rules : [];
      const needle = url.toLowerCase();
      const rule = rules.find(r => r && r.pattern && r.folder &&
        needle.includes(String(r.pattern).toLowerCase()));
      if (rule) d = rule.folder;
    }
    if (!d && this.settings.organizeByCategory) {
      d = path.join(this.settings.downloadDir, (this.settings.categoryDirs || {})[category] || category);
    }
    if (!d) d = this.settings.downloadDir;
    const id = crypto.randomUUID();
    const t = this._create({
      id, url, filename: fname, dir: d, category, headers: allHeaders, mirrors: altMirrors,
      checksum: normalizeChecksum(checksum),
      nameTemplate: String(this.settings.nameTemplate || ''),
      status: 'queued', createdAt: Date.now()
    });
    this.db.upsertTask(t.snapshot());
    this.queue.push(id);
    this._processQueue();
    this._emitAll();
    return { existed: false, task: t.snapshot() };
  }

  /* استيراد جماعي: قائمة روابط دفعة واحدة */
  addBulk(urls = []) {
    let added = 0, existed = 0, invalid = 0;
    const seen = new Set();
    for (const raw of urls) {
      const url = String(raw || '').trim();
      if (!url) continue;
      if (!/^(https?|ftps?):\/\//i.test(url)) { invalid++; continue; }
      if (seen.has(url)) { existed++; continue; }
      seen.add(url);
      try {
        const r = this.addTask({ url });
        if (r.existed) existed++; else added++;
      } catch (_e) { invalid++; }
    }
    return { added, existed, invalid };
  }

  _onUpdated(t) {
    this._dirty.add(t.id);
    if (t.status === 'downloading') {
      this.db.saveResumeState(t.id, t.resumeState());
      if (this.stats) this.stats.observe(t.snapshot());
    }
    if (t.status === 'completed' && this.stats) this.stats.onCompleted(t.id);
    /* سجل التحميل (3.2): تدوين الاكتمال والفشل مرة واحدة لكل مهمة */
    if ((t.status === 'completed' || t.status === 'failed') && !t._histSaved) {
      t._histSaved = true;
      this.db.addHistory({
        id: t.id, url: t.url, filename: t.filename, category: t.category,
        size: t.size, received: t.received, status: t.status,
        filePath: t.filePath || '', ts: Date.now()
      });
    }
    /* فك الأرشيف تلقائياً (2.3) — بعد الاكتمال إذا فعّل المستخدم الخيار */
    if (t.status === 'completed' && this.settings.autoExtract && t.filePath && !t._extractDone) {
      t._extractDone = true;
      extractArchive(t.filePath)
        .then(r => {
          if (r) this.emit('extracted', { ok: !!r.ok, filePath: t.filePath, dest: r.dest, files: r.files, reason: r.reason });
        })
        .catch(() => {});
    }
    if (['completed', 'failed', 'canceled'].includes(t.status)) this.db.clearResumeState(t.id);
    if (['completed', 'failed', 'canceled', 'paused'].includes(t.status)) this._processQueue();
    this.emit('updated', t.snapshot());
  }

  flush() {
    if (!this._dirty.size) return;
    for (const id of this._dirty) {
      const t = this.tasks.get(id);
      if (t) this.db.upsertTask(t.snapshot());
    }
    this._dirty.clear();
    this.db.save();
  }

  _processQueue() {
    let running = 0;
    for (const t of this.tasks.values()) {
      if (t.status === 'downloading') running++;
    }
    let slots = Math.max(0, this.settings.maxConcurrent - running);
    const stillQueued = [];
    while (this.queue.length) {
      const id = this.queue.shift();
      const t = this.tasks.get(id);
      if (!t || t.status !== 'queued') continue;
      if (slots > 0) {
        slots--;
        this._start(t);
      } else {
        stillQueued.push(id);
      }
    }
    this.queue = stillQueued;
  }

  _start(t) {
    t.start(this.db.getResumeState(t.id)).catch(err => {
      t.status = 'failed';
      t.error = String((err && err.message) || err);
    });
  }

  get(id) { return this.tasks.get(id); }

  list() {
    return [...this.tasks.values()]
      .map(t => t.snapshot())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  summary() {
    let speed = 0, downloading = 0, queued = 0, paused = 0, completed = 0, failed = 0;
    for (const t of this.tasks.values()) {
      if (t.status === 'downloading') { downloading++; speed += t.speed; }
      else if (t.status === 'queued') queued++;
      else if (t.status === 'paused') paused++;
      else if (t.status === 'completed') completed++;
      else if (t.status === 'failed') failed++;
    }
    return { speed, downloading, queued, paused, completed, failed, total: this.tasks.size };
  }

  pause(id) {
    const t = this.tasks.get(id);
    if (t) { t.pause(); this._emitAll(); }
  }

  resume(id) {
    const t = this.tasks.get(id);
    if (!t) return;
    t.paused = false;
    t.aborted = false;
    if (['paused', 'failed', 'canceled'].includes(t.status)) {
      t.status = 'queued';
      this.queue.push(id);
      this._processQueue();
      this._emitAll();
    }
  }

  resumeAll() {
    for (const t of this.tasks.values()) {
      if (['paused', 'failed'].includes(t.status)) this.resume(t.id);
    }
  }

  pauseAll() {
    for (const t of this.tasks.values()) {
      if (['downloading', 'queued'].includes(t.status)) this.pause(t.id);
    }
  }

  cancel(payload) {
    const id = typeof payload === 'string' ? payload : (payload || {}).id;
    const t = this.tasks.get(id);
    if (t) { t.cancel(false); this._emitAll(); }
  }

  async removeTask(payload) {
    const { id, deleteFile } = payload || {};
    const t = this.tasks.get(id);
    if (!t) return;
    if (['downloading', 'queued'].includes(t.status)) await t.ensureStopped();
    if (deleteFile && t.filePath && fs.existsSync(t.filePath)) {
      try { fs.unlinkSync(t.filePath); } catch (_e) {}
    }
    this.db.removeTask(id);
    this.db.clearResumeState(id);
    this.tasks.delete(id);
    this._emitAll();
  }

  async restart(id) {
    const t = this.tasks.get(id);
    if (!t) return;
    if (['downloading', 'queued'].includes(t.status)) await t.ensureStopped();
    t.segments = [];
    t.received = 0;
    t._fileReady = false;
    t.error = null;
    t._retries = 0;
    if (t.filePath && fs.existsSync(t.filePath)) {
      try { fs.unlinkSync(t.filePath); } catch (_e) {}
    }
    t.status = 'queued';
    this.db.clearResumeState(id);
    this.queue.push(id);
    this._processQueue();
    this._emitAll();
  }

  clearCompleted() {
    for (const [id, t] of [...this.tasks]) {
      if (['completed', 'canceled', 'failed'].includes(t.status)) {
        this.db.removeTask(id);
        this.db.clearResumeState(id);
        this.tasks.delete(id);
      }
    }
    this._emitAll();
  }

  /* استيراد مهام من قاعدة البيانات (5.4) — أنشئ ما هو غير موجود في الذاكرة */
  reloadFromDb() {
    const known = new Set([...this.tasks.keys()]);
    for (const rec of this.db.getTasks()) {
      if (!rec || !rec.id || known.has(rec.id)) continue;
      const t = this._create(rec);
      if (t.status === 'downloading' || t.status === 'queued') t.status = 'paused';
    }
    this._emitAll();
  }

  applySettings(s) {
    this.settings = s;
    this.limiter.setRate((s.maxSpeedKB || 0) * 1024);
    this._processQueue();
  }

  /* ===== أولويات الطابور ===== */
  moveUp(id) { this._moveInQueue(id, -1); }

  moveDown(id) { this._moveInQueue(id, 1); }

  _moveInQueue(id, dir) {
    const i = this.queue.indexOf(id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= this.queue.length) return;
    [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    this._emitAll();
  }

  /* تحميل فوري: يتخطى الطابور ويبدأ حتى لو اكتمل العدد المتزامن */
  downloadNow(id) {
    const t = this.tasks.get(id);
    if (!t || !['queued', 'paused'].includes(t.status)) return;
    this.queue = this.queue.filter(x => x !== id);
    t.paused = false;
    t.aborted = false;
    this._start(t);
    this._emitAll();
  }

  /* بيانات لوحة الإحصائيات */
  getDashboardStats() {
    const byCategory = {};
    for (const t of this.tasks.values()) {
      const c = (byCategory[t.category] = byCategory[t.category] || { bytes: 0, count: 0 });
      c.bytes += t.received || 0;
      c.count += 1;
    }
    const base = this.stats
      ? this.stats.getSummary()
      : { today: { bytes: 0, files: 0 }, week: { bytes: 0, files: 0 }, total: { bytes: 0, files: 0 } };
    /* السلسلة اليومية للمخطط البياني (3.6) */
    const daily = dailySeries(this.db.getStatsData(), 14);
    return { ...base, byCategory, active: this.summary(), daily };
  }

  getTask(id) {
    return this.tasks.get(id) || null;
  }

  /* استئناف الرابط المنتهي وتحديثه (المرحلة 13.2) */
  refreshTaskUrl(id, newUrl) {
    const t = this.tasks.get(id);
    if (!t) throw new Error('المهمة غير موجودة');
    t.refreshUrl(newUrl);
    if (this.db && typeof this.db.upsertTask === 'function') {
      this.db.upsertTask(t.snapshot());
    }
    this.resume(id);
    this._emitAll();
    return t.snapshot();
  }

  _emitAll() {
    this.emit('updated', null);
  }
}

module.exports = { DownloadEngine, detectCategory, guessFilename, sanitize };
