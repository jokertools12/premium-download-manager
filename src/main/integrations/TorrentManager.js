'use strict';

const { EventEmitter } = require('events');
const path = require('path');
const crypto = require('crypto');

/* مدير التورنت: يعتمد WebTorrent (ماغنت + ملفات .torrent)
   اختيار ملفات محددة، تقدم حي، سرعة، عدد المصادر (peers) */
class TorrentManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
    this._client = null;
    this._probes = new Map(); // infoHash → torrent (بيانات جاهزة)
    this.available = true;    // يتأكد فعلياً عند التحميل الكسول (ESM)
    this._WT = null;
    this._loadPromise = null;
    this._unavailableReason = '';
  }

  /* تحميل كسول لمكتبة webtorrent (وحدة ESM) */
  async ensureLoaded() {
    if (this._WT) return true;
    if (!this._loadPromise) {
      this._loadPromise = (async () => {
        try {
          const m = await import('webtorrent');
          this._WT = m.default || m;
          this.available = true;
          return true;
        } catch (e) {
          this.available = false;
          this._unavailableReason = String((e && e.message) || e);
          return false;
        }
      })();
    }
    return this._loadPromise;
  }

  async _requireAvailable() {
    const ok = await this.ensureLoaded();
    if (!ok) throw new Error('مكتبة التورنت غير مثبتة: ' + this._unavailableReason);
  }

  _clientGet() {
    if (!this._client) this._client = new this._WT();
    return this._client;
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
    return [...this.tasks.values()]
      .map(t => { const c = { ...t }; delete c._torrent; return c; })
      .sort((a, b) => b.createdAt - a.createdAt);
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

  /* إزالة مهمة تورنت مع إمكانية حذف مجلد الملفات */
  remove(id, deleteFile) {
    const t = this.tasks.get(id);
    if (!t) return;
    if (t.status === 'downloading') this.cancel(id);
    if (deleteFile && t._torrent && t._torrent.path && t._torrent.name) {
      try { fs.rmSync(path.join(t._torrent.path, t._torrent.name), { recursive: true, force: true }); } catch (_e) {}
    }
    this.tasks.delete(id);
    this.emit('updated', t);
  }

  _emit(t) { this.emit('updated', t); }

  /* فحص ماغنت: جلب اسم التورنت وقائمة ملفاته (دون تحميل) */
  async probe(magnet) {
    await this._requireAvailable();
    const client = this._clientGet();
    return new Promise((resolve, reject) => {
      let settled = false;
      let torrent = null;
      const onError = err => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        client.removeListener('error', onError);
        reject(new Error(String((err && err.message) || err)));
      };
      const onTorrent = t => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        client.removeListener('error', onError);
        try { t.pause(); } catch (_e) {} // بيانات فقط دون تحميل
        this._probes.set(t.infoHash, t);
        resolve(this._probeResult(t));
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        client.removeListener('error', onError);
        try { if (torrent) torrent.destroy(); } catch (_e) {}
        reject(new Error('انتهت مهلة جلب بيانات التورنت — لا توجد مصادر متاحة'));
      }, 90000);
      client.on('error', onError);
      client.add(magnet, t => { torrent = t; onTorrent(t); });
    });
  }

  _probeResult(t) {
    return {
      infoHash: t.infoHash,
      magnet: t.magnetUri,
      name: t.name || t.infoHash,
      length: t.length || 0,
      files: (t.files || []).map((f, i) => ({
        index: i, name: f.name, path: f.path, length: f.length
      }))
    };
  }

  /* بدء التحميل: files = فهارس الملفات المختارة أو null لكل الملفات */
  async start({ magnet, files, dir, title }) {
    await this._requireAvailable();
    if (!magnet || !/^(magnet:|https?:\/\/)/i.test(String(magnet).trim())) {
      throw new Error('رابط ماغنت/تورنت غير صالح');
    }
    dir = dir || this._defaultDir();

    // منع التكرار: نفس التورنت قيد التحميل حالياً
    const ih = this._extractInfoHash(magnet);
    for (const t of this.tasks.values()) {
      if (t.status === 'downloading' && t._torrent && t._torrent.infoHash &&
          String(t._torrent.infoHash).toLowerCase() === ih) {
        return { existed: true, task: { ...t, _torrent: undefined } };
      }
    }

    const id = 'tor-' + crypto.randomUUID();
    const task = {
      id, kind: 'torrent', category: 'video', magnet, dir,
      title: title || String(magnet).slice(0, 60),
      filename: '', filePath: null,
      status: 'downloading', received: 0, size: null, speed: 0, percent: null,
      peers: 0, error: null, createdAt: Date.now(), completedAt: null
    };
    this.tasks.set(id, task);
    this._emit(task);
    this._run(task, files).catch(() => {});
    return { existed: false, task: { ...task, _torrent: undefined } };
  }

  async _run(task, fileIndexes) {
    try {
      const client = this._clientGet();
      let torrent = this._probes.get(this._extractInfoHash(task.magnet));
      if (!torrent) {
        torrent = await new Promise((resolve, reject) => {
          const onError = err => { cleanup(); reject(err); };
          const timer = setTimeout(() => { cleanup(); reject(new Error('انتهت مهلة جلب بيانات التورنت')); }, 90000);
          const cleanup = () => { clearTimeout(timer); client.removeListener('error', onError); };
          client.on('error', onError);
          client.add(task.magnet, { path: task.dir }, t => { cleanup(); resolve(t); });
        });
      }
      this._probes.delete(torrent.infoHash); // أصبح تحميلاً فعلياً الآن

      try { torrent.path = task.dir; } catch (_e) {}
      task._torrent = torrent;
      task.title = torrent.name || task.title;
      task.size = torrent.length || null;
      this._emit(task);

      // اختيار الملفات المطلوبة فقط
      torrent.files.forEach(f => f.deselect());
      if (Array.isArray(fileIndexes) && fileIndexes.length) {
        fileIndexes.forEach(i => { try { torrent.files[i].select(); } catch (_e) {} });
      } else {
        torrent.files.forEach(f => f.select());
      }
      torrent.resume();

      const progressTimer = setInterval(() => {
        if (task.status !== 'downloading') { clearInterval(progressTimer); return; }
        task.received = torrent.downloaded || 0;
        task.size = torrent.length || null;
        task.percent = torrent.progress != null ? torrent.progress * 100 : null;
        task.speed = Math.round(torrent.downloadSpeed || 0);
        task.peers = torrent.numPeers || 0;
        this._emit(task);
      }, 700);

      torrent.on('done', () => {
        clearInterval(progressTimer);
        if (task.status !== 'downloading') return;
        task.status = 'completed';
        task.completedAt = Date.now();
        task.speed = 0;
        task.percent = 100;
        task.received = torrent.downloaded || task.received;
        try { task.filename = torrent.name; task.filePath = path.join(torrent.path, torrent.name); } catch (_e) {}
        this._emit(task);
      });
    } catch (err) {
      if (task.status !== 'canceled') {
        task.status = 'failed';
        task.error = String((err && err.message) || err).slice(0, 300);
        this._emit(task);
      }
    }
  }

  _extractInfoHash(magnet) {
    const m = /xt=urn:btih:([a-z0-9]+)/i.exec(String(magnet || ''));
    return m ? m[1].toLowerCase() : null;
  }

  _defaultDir() { return 'C:\\'; }

  cancel(id) {
    const t = this.tasks.get(id);
    if (!t || t.status !== 'downloading') return;
    t.status = 'canceled';
    t.speed = 0;
    try { if (t._torrent) t._torrent.destroy(); } catch (_e) {}
    t._torrent = null;
    this._emit(t);
  }

  remove(id) {
    const t = this.tasks.get(id);
    if (!t) return;
    if (t.status === 'downloading') this.cancel(id);
    this.tasks.delete(id);
    this._emit(t);
  }

  destroy() {
    try { if (this._client) this._client.destroy(); } catch (_e) {}
  }
}

module.exports = TorrentManager;
