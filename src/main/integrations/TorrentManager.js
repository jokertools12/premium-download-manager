'use strict';

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/* خوادم التتبع العامة فائقة السرعة لمضاعفة المصادر (Trackers Booster) */
const GLOBAL_BOOSTER_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.cyberia.is:6969/announce',
  'udp://9.rarbg.to:2920/announce',
  'http://tracker.openbittorrent.com:80/announce'
];

function injectTrackers(magnetUri) {
  let uri = String(magnetUri || '').trim();
  if (!uri.startsWith('magnet:?')) return uri;
  for (const tr of GLOBAL_BOOSTER_TRACKERS) {
    const enc = encodeURIComponent(tr);
    if (!uri.includes(enc) && !uri.includes(tr)) {
      uri += '&tr=' + enc;
    }
  }
  return uri;
}

/* مدير التورنت الهجين 2.0: WebTorrent + مسرع التراكرات + البث المتسلسل اللحظي */
class TorrentManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
    this._client = null;
    this._probes = new Map(); // infoHash → torrent (بيانات جاهزة)
    this._servers = new Map(); // taskId → { server, port }
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
    if (!this._client) {
      this._client = new this._WT({
        maxConns: 120
      });
    }
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
        this._closeStreamServer(id);
        this.tasks.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit('updated', null);
  }

  _emit(t) { this.emit('updated', t); }

  /* فحص ماغنت: جلب اسم التورنت وقائمة ملفاته */
  async probe(magnet) {
    await this._requireAvailable();
    magnet = injectTrackers(magnet);
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
        try { t.pause(); } catch (_e) {}
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

  /* بدء التحميل: دعم مسرع التراكرات والتنزيل المتسلسل للبث */
  async start({ magnet, files, dir, title, booster = true, sequential = true }) {
    await this._requireAvailable();
    if (!magnet || !/^(magnet:|https?:\/\/)/i.test(String(magnet).trim())) {
      throw new Error('رابط ماغنت/تورنت غير صالح');
    }
    dir = dir || this._defaultDir();

    if (booster) {
      magnet = injectTrackers(magnet);
    }

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
      sequential: !!sequential,
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
      this._probes.delete(torrent.infoHash);

      try { torrent.path = task.dir; } catch (_e) {}
      task._torrent = torrent;
      task.title = torrent.name || task.title;
      task.size = torrent.length || null;
      this._emit(task);

      torrent.files.forEach(f => f.deselect());
      if (Array.isArray(fileIndexes) && fileIndexes.length) {
        fileIndexes.forEach(i => { try { torrent.files[i].select(); } catch (_e) {} });
      } else {
        torrent.files.forEach(f => f.select());
      }

      // إذا كان التنزيل المتسلسل مفعلاً: أعطِ أولوية القطع الأولى لملفات الفيديو
      if (task.sequential) {
        const vidFile = torrent.files.find(f => /\.(mp4|mkv|avi|webm|mov|m4v)$/i.test(f.name));
        if (vidFile) {
          try { vidFile.select(0); } catch (_e) {}
        }
      }

      torrent.resume();

      const progressTimer = setInterval(() => {
        if (task.status !== 'downloading' && task.status !== 'paused') {
          clearInterval(progressTimer);
          return;
        }
        if (task.status === 'downloading') {
          task.received = torrent.downloaded || 0;
          task.size = torrent.length || null;
          task.percent = torrent.progress != null ? torrent.progress * 100 : null;
          task.speed = Math.round(torrent.downloadSpeed || 0);
          task.peers = torrent.numPeers || 0;
          this._emit(task);
        }
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

  /* إيقاف واستئناف التورنت */
  pause(id) {
    const t = this.tasks.get(id);
    if (!t || t.status !== 'downloading') return false;
    t.status = 'paused';
    t.speed = 0;
    try { if (t._torrent) t._torrent.pause(); } catch (_e) {}
    this._emit(t);
    return true;
  }

  resume(id) {
    const t = this.tasks.get(id);
    if (!t || t.status !== 'paused') return false;
    t.status = 'downloading';
    try { if (t._torrent) t._torrent.resume(); } catch (_e) {}
    this._emit(t);
    return true;
  }

  /* خادم البث المتسلسل اللحظي لمشاهدة الفيديو أثناء التحميل */
  async getStreamUrl(id, fileIndex) {
    const task = this.tasks.get(id);
    if (!task || !task._torrent) {
      throw new Error('مهمة التورنت لم تبدأ بعد أو غير متاحة للبث');
    }
    const torrent = task._torrent;
    if (!torrent.files || !torrent.files.length) {
      throw new Error('لا توجد ملفات في هذا التورنت');
    }

    let targetIdx = fileIndex;
    if (targetIdx == null || targetIdx < 0 || targetIdx >= torrent.files.length) {
      let maxLen = -1;
      torrent.files.forEach((f, idx) => {
        const isVid = /\.(mp4|mkv|avi|webm|mov|m4v)$/i.test(f.name);
        if (isVid && f.length > maxLen) {
          maxLen = f.length;
          targetIdx = idx;
        }
      });
      if (targetIdx == null || targetIdx < 0) targetIdx = 0;
    }

    const file = torrent.files[targetIdx];
    try { file.select(0); } catch (_e) {}

    let serverInfo = this._servers.get(id);
    if (!serverInfo) {
      const srv = torrent.createServer();
      await new Promise((resolve, reject) => {
        srv.listen(0, '127.0.0.1', () => resolve());
        srv.on('error', reject);
      });
      const port = srv.address().port;
      serverInfo = { server: srv, port };
      this._servers.set(id, serverInfo);
    }

    return {
      ok: true,
      streamUrl: `http://127.0.0.1:${serverInfo.port}/${targetIdx}`,
      fileName: file.name,
      length: file.length,
      index: targetIdx
    };
  }

  _closeStreamServer(id) {
    const s = this._servers.get(id);
    if (s && s.server) {
      try { s.server.close(); } catch (_e) {}
    }
    this._servers.delete(id);
  }

  _extractInfoHash(magnet) {
    const m = /xt=urn:btih:([a-z0-9]+)/i.exec(String(magnet || ''));
    return m ? m[1].toLowerCase() : null;
  }

  _defaultDir() { return 'C:\\'; }

  cancel(id) {
    this._closeStreamServer(id);
    const t = this.tasks.get(id);
    if (!t || t.status !== 'downloading') return;
    t.status = 'canceled';
    t.speed = 0;
    try { if (t._torrent) t._torrent.destroy(); } catch (_e) {}
    t._torrent = null;
    this._emit(t);
  }

  remove(id, deleteFile) {
    this._closeStreamServer(id);
    const t = this.tasks.get(id);
    if (!t) return;
    if (t.status === 'downloading') this.cancel(id);
    if (deleteFile && t._torrent && t._torrent.path && t._torrent.name) {
      try { fs.rmSync(path.join(t._torrent.path, t._torrent.name), { recursive: true, force: true }); } catch (_e) {}
    }
    this.tasks.delete(id);
    this._emit(t);
  }

  destroy() {
    for (const id of this._servers.keys()) this._closeStreamServer(id);
    try { if (this._client) this._client.destroy(); } catch (_e) {}
  }
}

TorrentManager.GLOBAL_BOOSTER_TRACKERS = GLOBAL_BOOSTER_TRACKERS;
TorrentManager.injectTrackers = injectTrackers;

module.exports = TorrentManager;
