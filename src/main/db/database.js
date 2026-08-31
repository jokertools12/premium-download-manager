'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_DIR = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'PremiumDownloadManager'
);

const DEFAULT_SETTINGS = {
  downloadDir: path.join(os.homedir(), 'Downloads', 'PremiumDM'),
  maxConcurrent: 3,
  maxConnections: 16,
  maxSpeedKB: 0,
  organizeByCategory: true,
  theme: 'dark',
  clipboardMonitor: true,
  autoFloat: false,
  rules: [],
  language: 'ar',
  scheduler: { enabled: false, startAt: '', stopAt: '' },
  categoryDirs: {
    video: 'Videos',
    audio: 'Music',
    image: 'Pictures',
    document: 'Documents',
    compressed: 'Archives',
    program: 'Programs',
    other: 'Other'
  }
};

class Database {
  constructor() {
    fs.mkdirSync(APP_DIR, { recursive: true });
    this.file = path.join(APP_DIR, 'data.json');
    this.resumeFile = path.join(APP_DIR, 'resume.json');
    this.data = { tasks: [], settings: { ...DEFAULT_SETTINGS }, stats: {} };
    this.resume = {};
    this._saveTimer = null;
    this._mode = 'json';
    this._sqlite = null;

    // محاولة فتح SQLite؛ عند الفشل نتراجع تلقائياً إلى JSON
    // ملاحظة: وحدة better-sqlite3 المبنية لـ Node تقبع العملية في Electron
    // (ABI مختلف)، لذا لا نحاول تحميلها داخل Electron إلا بعد إعادة بنائها
    // له (أنشئ الملف sqlite-electron-ok في مجلد البيانات بعد الترجمة).
    try {
      const inElectron = !!process.versions.electron;
      const electronOk = fs.existsSync(path.join(APP_DIR, 'sqlite-electron-ok'));
      const allowSqlite = !inElectron || electronOk;
      if (allowSqlite) {
        const BetterSqlite3 = require('better-sqlite3');
        this._sqlite = new BetterSqlite3(path.join(APP_DIR, 'data.db'));
        this._sqlite.pragma('journal_mode = WAL');
        this._sqlite.exec(`
          CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
          CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, v TEXT);
          CREATE TABLE IF NOT EXISTS resume (id TEXT PRIMARY KEY, v TEXT);
          CREATE TABLE IF NOT EXISTS stats (d TEXT PRIMARY KEY, bytes INTEGER DEFAULT 0, files INTEGER DEFAULT 0);
        `);
        this._mode = 'sqlite';
      }
    } catch (_e) {
      this._sqlite = null;
      this._mode = 'json';
    }

    this._load();
  }

  getMode() { return this._mode; }

  _load() {
    if (this._sqlite) {
      try {
        const row = this._sqlite.prepare('SELECT v FROM kv WHERE k = ?').get('settings');
        if (row) this.data.settings = JSON.parse(row.v);
      } catch (_e) {}
      try {
        this.data.tasks = this._sqlite.prepare('SELECT v FROM tasks').all()
          .map(r => { try { return JSON.parse(r.v); } catch (_e) { return null; } })
          .filter(Boolean);
      } catch (_e) {}
      try {
        for (const r of this._sqlite.prepare('SELECT d, bytes, files FROM stats').all()) {
          this.data.stats[r.d] = { bytes: r.bytes || 0, files: r.files || 0 };
        }
      } catch (_e) {}
      try {
        for (const r of this._sqlite.prepare('SELECT id, v FROM resume').all()) {
          try { this.resume[r.id] = JSON.parse(r.v); } catch (_e) {}
        }
      } catch (_e) {}
      this._normalize();
      this._migrateFromJson();
      return;
    }
    // وضع JSON
    try {
      if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (_e) { /* ملف تالف - نبدأ من جديد */ }
    try {
      if (fs.existsSync(this.resumeFile)) this.resume = JSON.parse(fs.readFileSync(this.resumeFile, 'utf8'));
    } catch (_e) { this.resume = {}; }
    this._normalize();
  }

  _normalize() {
    const s = this.data.settings || {};
    this.data.settings = {
      ...DEFAULT_SETTINGS,
      ...s,
      scheduler: { ...DEFAULT_SETTINGS.scheduler, ...(s.scheduler || {}) },
      categoryDirs: { ...DEFAULT_SETTINGS.categoryDirs, ...(s.categoryDirs || {}) },
      rules: Array.isArray(s.rules) ? s.rules : []
    };
    if (!Array.isArray(this.data.tasks)) this.data.tasks = [];
    if (!this.resume || typeof this.resume !== 'object') this.resume = {};
    if (!this.data.stats || typeof this.data.stats !== 'object') this.data.stats = {};
  }

  _migrateFromJson() {
    try {
      if (!fs.existsSync(this.file)) return;
      const old = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (old.settings) {
        this.data.settings = { ...this.data.settings, ...old.settings };
        this._persistSettings();
      }
      if (Array.isArray(old.tasks) && old.tasks.length) {
        const stmt = this._sqlite.prepare('INSERT OR REPLACE INTO tasks (id, v) VALUES (?, ?)');
        const tx = this._sqlite.transaction(rows => { for (const t of rows) stmt.run(t.id, JSON.stringify(t)); });
        tx(old.tasks);
        this.data.tasks = old.tasks;
      }
      if (old.stats && Object.keys(old.stats).length) {
        const stmt = this._sqlite.prepare(`
          INSERT INTO stats (d, bytes, files) VALUES (?, ?, ?)
          ON CONFLICT(d) DO UPDATE SET bytes = bytes + excluded.bytes, files = files + excluded.files
        `);
        const tx = this._sqlite.transaction(rows => {
          for (const [d, v] of rows) stmt.run(d, v.bytes || 0, v.files || 0);
        });
        tx(Object.entries(old.stats));
        for (const [d, v] of Object.entries(old.stats)) {
          this.data.stats[d] = {
            bytes: (this.data.stats[d] ? this.data.stats[d].bytes : 0) + (v.bytes || 0),
            files: (this.data.stats[d] ? this.data.stats[d].files : 0) + (v.files || 0)
          };
        }
      }
      if (old.resume && typeof old.resume === 'object') {
        const stmt = this._sqlite.prepare('INSERT OR REPLACE INTO resume (id, v) VALUES (?, ?)');
        for (const [id, st] of Object.entries(old.resume)) {
          stmt.run(id, JSON.stringify(st));
          this.resume[id] = st;
        }
      }
      fs.renameSync(this.file, this.file + '.migrated');
      try { if (fs.existsSync(this.resumeFile)) fs.renameSync(this.resumeFile, this.resumeFile + '.migrated'); } catch (_e) {}
    } catch (_e) { /* فشل الترحيل لا يعطل البرنامج */ }
  }

  getTasks() { return this.data.tasks; }

  upsertTask(snap) {
    const rec = { ...snap };
    delete rec.segments;
    delete rec.connections;
    delete rec.speed;
    const i = this.data.tasks.findIndex(t => t.id === snap.id);
    if (i >= 0) this.data.tasks[i] = rec;
    else this.data.tasks.push(rec);
    if (this._sqlite) {
      try { this._sqlite.prepare('INSERT OR REPLACE INTO tasks (id, v) VALUES (?, ?)').run(rec.id, JSON.stringify(rec)); } catch (_e) {}
    } else this._scheduleSave();
  }

  removeTask(id) {
    this.data.tasks = this.data.tasks.filter(t => t.id !== id);
    if (this._sqlite) {
      try { this._sqlite.prepare('DELETE FROM tasks WHERE id = ?').run(id); } catch (_e) {}
    } else this._scheduleSave();
  }

  getSettings() { return this.data.settings; }

  updateSettings(patch) {
    this.data.settings = { ...this.data.settings, ...patch };
    if (patch.scheduler) {
      this.data.settings.scheduler = { ...this.data.settings.scheduler, ...patch.scheduler };
    }
    this._persistSettings();
    return this.data.settings;
  }

  addStats(dateKey, patch) {
    const s = this.data.stats[dateKey] || { bytes: 0, files: 0 };
    s.bytes = (s.bytes || 0) + (patch.bytes || 0);
    s.files = (s.files || 0) + (patch.files || 0);
    this.data.stats[dateKey] = s;
    if (this._sqlite) {
      try {
        this._sqlite.prepare(`
          INSERT INTO stats (d, bytes, files) VALUES (?, ?, ?)
          ON CONFLICT(d) DO UPDATE SET bytes = bytes + excluded.bytes, files = files + excluded.files
        `).run(dateKey, patch.bytes || 0, patch.files || 0);
      } catch (_e) {}
    } else this._scheduleSave();
  }

  getStatsData() { return this.data.stats || {}; }

  saveResumeState(id, state) {
    if (!state) return;
    this.resume[id] = state;
    if (this._sqlite) {
      try { this._sqlite.prepare('INSERT OR REPLACE INTO resume (id, v) VALUES (?, ?)').run(id, JSON.stringify(state)); } catch (_e) {}
    } else this._scheduleSave();
  }

  getResumeState(id) { return this.resume[id] || null; }

  clearResumeState(id) {
    if (this.resume[id]) {
      delete this.resume[id];
      if (this._sqlite) {
        try { this._sqlite.prepare('DELETE FROM resume WHERE id = ?').run(id); } catch (_e) {}
      } else this._scheduleSave();
    }
  }

  _persistSettings() {
    if (this._sqlite) {
      try {
        this._sqlite.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)')
          .run('settings', JSON.stringify(this.data.settings));
      } catch (_e) {}
    } else this._scheduleSave();
  }

  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.save();
    }, 800);
  }

  save() {
    if (this._sqlite) {
      this._persistSettings();
      return;
    }
    try { fs.writeFileSync(this.file, JSON.stringify(this.data)); } catch (_e) {}
    try { fs.writeFileSync(this.resumeFile, JSON.stringify(this.resume)); } catch (_e) {}
  }
}

module.exports = Database;
