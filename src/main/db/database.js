'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/* مجلد بيانات التطبيق حسب المنصة (6.1: ويندوز / ماك / لينكس) */
function resolveAppDir() {
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'PremiumDownloadManager'
    );
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'PremiumDownloadManager');
  }
  return path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
    'PremiumDownloadManager'
  );
}

const APP_DIR = resolveAppDir();

const DEFAULT_SETTINGS = {
  downloadDir: path.join(os.homedir(), 'Downloads', 'PremiumDM'),
  maxConcurrent: 3,
  maxConnections: 16,
  maxSpeedKB: 0,
  organizeByCategory: true,
  autoExtract: false,
  nameTemplate: '',
  theme: 'dark',
  clipboardMonitor: true,
  autoFloat: false,
  floatMode: 'compact',
  floatX: null,
  floatY: null,
  rules: [],
  language: 'ar',
  scheduler: { enabled: false, startAt: '', stopAt: '', bandwidthRules: [] },
  telemetryOptIn: null, // null = لم يُسأل بعد، true = موافق، false = رافض
  autoStartFromBrowser: false,
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
    this.data = { tasks: [], settings: { ...DEFAULT_SETTINGS }, stats: {}, history: [] };
    this.resume = {};
    this._saveTimer = null;
    this._mode = 'json';
    this._sqlite = null;

    // محاولة فتح SQLite بنمط علائقي حقيقي (المرحلة 7.1)
    try {
      const inElectron = !!process.versions.electron;
      const electronOk = fs.existsSync(path.join(APP_DIR, 'sqlite-electron-ok'));
      const allowSqlite = !inElectron || electronOk;
      if (allowSqlite) {
        const BetterSqlite3 = require('better-sqlite3');
        this._sqlite = new BetterSqlite3(path.join(APP_DIR, 'data.db'));
        this._sqlite.pragma('journal_mode = WAL');
        this._sqlite.pragma('synchronous = NORMAL');
        this._initSqliteSchema();
        this._mode = 'sqlite';
      }
    } catch (_e) {
      this._sqlite = null;
      this._mode = 'json';
    }

    this._load();
  }

  getMode() { return this._mode; }

  /* ===== تهيئة المخطط العلائقي وترقية الجداول القديمة (المرحلة 7.1) ===== */
  _initSqliteSchema() {
    if (!this._sqlite) return;

    this._sqlite.exec(`
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS stats (d TEXT PRIMARY KEY, bytes INTEGER DEFAULT 0, files INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS resume (id TEXT PRIMARY KEY, v TEXT);
    `);

    // فحص جدول tasks الحالي للتحقق من المخطط العلائقي
    let migrateTasks = false;
    try {
      const info = this._sqlite.prepare("PRAGMA table_info('tasks')").all();
      if (info.length > 0 && !info.some(c => c.name === 'category')) {
        migrateTasks = true;
      }
    } catch (_e) {}

    if (migrateTasks) {
      this._migrateTasksTable();
    } else {
      this._sqlite.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          url TEXT,
          filename TEXT,
          status TEXT,
          category TEXT,
          size INTEGER DEFAULT 0,
          received INTEGER DEFAULT 0,
          speed_avg INTEGER DEFAULT 0,
          retry_count INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT 0,
          updated_at INTEGER DEFAULT 0,
          meta TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
        CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
        CREATE INDEX IF NOT EXISTS idx_tasks_filename ON tasks(filename);
      `);
    }

    // فحص جدول history للتحقق من المخطط العلائقي
    let migrateHistory = false;
    try {
      const hInfo = this._sqlite.prepare("PRAGMA table_info('history')").all();
      if (hInfo.length > 0 && !hInfo.some(c => c.name === 'category')) {
        migrateHistory = true;
      }
    } catch (_e) {}

    if (migrateHistory) {
      this._migrateHistoryTable();
    } else {
      this._sqlite.exec(`
        CREATE TABLE IF NOT EXISTS history (
          id TEXT PRIMARY KEY,
          url TEXT,
          filename TEXT,
          category TEXT,
          size INTEGER DEFAULT 0,
          received INTEGER DEFAULT 0,
          status TEXT,
          filePath TEXT,
          ts INTEGER DEFAULT 0,
          meta TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_history_ts ON history(ts);
        CREATE INDEX IF NOT EXISTS idx_history_url ON history(url);
        CREATE INDEX IF NOT EXISTS idx_history_filename ON history(filename);
      `);
    }
  }

  _migrateTasksTable() {
    try {
      const oldRows = this._sqlite.prepare('SELECT id, v FROM tasks').all();
      this._sqlite.exec('DROP TABLE tasks;');
      this._sqlite.exec(`
        CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          url TEXT,
          filename TEXT,
          status TEXT,
          category TEXT,
          size INTEGER DEFAULT 0,
          received INTEGER DEFAULT 0,
          speed_avg INTEGER DEFAULT 0,
          retry_count INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT 0,
          updated_at INTEGER DEFAULT 0,
          meta TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
        CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
        CREATE INDEX IF NOT EXISTS idx_tasks_filename ON tasks(filename);
      `);
      const stmt = this._sqlite.prepare(`
        INSERT OR REPLACE INTO tasks 
        (id, url, filename, status, category, size, received, speed_avg, retry_count, created_at, updated_at, meta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const tx = this._sqlite.transaction(rows => {
        for (const r of rows) {
          try {
            const t = JSON.parse(r.v);
            const meta = { ...t };
            delete meta.id; delete meta.url; delete meta.filename;
            delete meta.status; delete meta.category; delete meta.size;
            delete meta.received; delete meta.speed_avg; delete meta.retry_count;
            delete meta.created_at; delete meta.updated_at;
            stmt.run(
              t.id, t.url || '', t.filename || '', t.status || 'queued',
              t.category || 'other', t.size || 0, t.received || 0,
              t.speed_avg || 0, t.retry_count || 0,
              t.createdAt || t.created_at || Date.now(),
              t.updatedAt || t.updated_at || Date.now(),
              JSON.stringify(meta)
            );
          } catch (_err) {}
        }
      });
      tx(oldRows);
    } catch (_e) {}
  }

  _migrateHistoryTable() {
    try {
      const oldRows = this._sqlite.prepare('SELECT id, v FROM history').all();
      this._sqlite.exec('DROP TABLE history;');
      this._sqlite.exec(`
        CREATE TABLE history (
          id TEXT PRIMARY KEY,
          url TEXT,
          filename TEXT,
          category TEXT,
          size INTEGER DEFAULT 0,
          received INTEGER DEFAULT 0,
          status TEXT,
          filePath TEXT,
          ts INTEGER DEFAULT 0,
          meta TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_history_ts ON history(ts);
        CREATE INDEX IF NOT EXISTS idx_history_url ON history(url);
        CREATE INDEX IF NOT EXISTS idx_history_filename ON history(filename);
      `);
      const stmt = this._sqlite.prepare(`
        INSERT OR REPLACE INTO history 
        (id, url, filename, category, size, received, status, filePath, ts, meta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const tx = this._sqlite.transaction(rows => {
        for (const r of rows) {
          try {
            const h = JSON.parse(r.v);
            stmt.run(
              h.id, h.url || '', h.filename || '', h.category || 'other',
              h.size || 0, h.received || 0, h.status || 'completed',
              h.filePath || '', h.ts || Date.now(), JSON.stringify(h)
            );
          } catch (_err) {}
        }
      });
      tx(oldRows);
    } catch (_e) {}
  }

  _load() {
    if (this._sqlite) {
      try {
        const row = this._sqlite.prepare('SELECT v FROM kv WHERE k = ?').get('settings');
        if (row) this.data.settings = JSON.parse(row.v);
      } catch (_e) {}
      try {
        const rows = this._sqlite.prepare('SELECT * FROM tasks').all();
        this.data.tasks = rows.map(r => this._rowToTask(r)).filter(Boolean);
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
      try {
        const hRows = this._sqlite.prepare('SELECT * FROM history ORDER BY ts DESC LIMIT 1000').all();
        this.data.history = hRows.map(r => this._rowToHistory(r)).filter(Boolean);
      } catch (_e) {}
      this._normalize();
      this._migrateFromJson();
      return;
    }

    // وضع JSON (Fallback)
    try {
      if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (_e) {}
    try {
      if (fs.existsSync(this.resumeFile)) this.resume = JSON.parse(fs.readFileSync(this.resumeFile, 'utf8'));
    } catch (_e) { this.resume = {}; }
    this._normalize();
  }

  _rowToTask(r) {
    if (!r) return null;
    let meta = {};
    try { if (r.meta) meta = JSON.parse(r.meta); } catch (_e) {}
    return {
      id: r.id,
      url: r.url,
      filename: r.filename,
      status: r.status,
      category: r.category,
      size: r.size || 0,
      received: r.received || 0,
      speed_avg: r.speed_avg || 0,
      retry_count: r.retry_count || 0,
      createdAt: r.created_at || meta.createdAt || Date.now(),
      updatedAt: r.updated_at || meta.updatedAt || Date.now(),
      ...meta
    };
  }

  _rowToHistory(r) {
    if (!r) return null;
    let meta = {};
    try { if (r.meta) meta = JSON.parse(r.meta); } catch (_e) {}
    return {
      id: r.id,
      url: r.url,
      filename: r.filename,
      category: r.category,
      size: r.size || 0,
      received: r.received || 0,
      status: r.status,
      filePath: r.filePath,
      ts: r.ts || Date.now(),
      ...meta
    };
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
      if (Array.isArray(old.tasks) && old.tasks.length && this._sqlite) {
        const stmt = this._sqlite.prepare(`
          INSERT OR REPLACE INTO tasks 
          (id, url, filename, status, category, size, received, speed_avg, retry_count, created_at, updated_at, meta)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const tx = this._sqlite.transaction(rows => {
          for (const t of rows) {
            const meta = { ...t };
            delete meta.id; delete meta.url; delete meta.filename;
            delete meta.status; delete meta.category; delete meta.size;
            delete meta.received; delete meta.speed_avg; delete meta.retry_count;
            stmt.run(
              t.id, t.url || '', t.filename || '', t.status || 'paused',
              t.category || 'other', t.size || 0, t.received || 0,
              t.speed_avg || 0, t.retry_count || 0,
              t.createdAt || Date.now(), t.updatedAt || Date.now(),
              JSON.stringify(meta)
            );
          }
        });
        tx(old.tasks);
        this.data.tasks = old.tasks;
      }
      if (old.stats && Object.keys(old.stats).length && this._sqlite) {
        const stmt = this._sqlite.prepare(`
          INSERT INTO stats (d, bytes, files) VALUES (?, ?, ?)
          ON CONFLICT(d) DO UPDATE SET bytes = bytes + excluded.bytes, files = files + excluded.files
        `);
        const tx = this._sqlite.transaction(rows => {
          for (const [d, v] of rows) stmt.run(d, v.bytes || 0, v.files || 0);
        });
        tx(Object.entries(old.stats));
      }
      if (old.resume && typeof old.resume === 'object' && this._sqlite) {
        const stmt = this._sqlite.prepare('INSERT OR REPLACE INTO resume (id, v) VALUES (?, ?)');
        for (const [id, st] of Object.entries(old.resume)) {
          stmt.run(id, JSON.stringify(st));
          this.resume[id] = st;
        }
      }
      fs.renameSync(this.file, this.file + '.migrated');
      try { if (fs.existsSync(this.resumeFile)) fs.renameSync(this.resumeFile, this.resumeFile + '.migrated'); } catch (_e) {}
    } catch (_e) {}
  }

  getTasks() { return this.data.tasks; }

  /* استعلام مهام مفهرس فائق السرعة يدعم التصفية والفرز والبحث والتقسيم (المرحلة 7.1) */
  queryTasks(opts = {}) {
    const { status, category, search, limit = 0, offset = 0, sortBy = 'created_at', sortDir = 'DESC' } = opts;

    if (this._sqlite) {
      let sql = 'SELECT * FROM tasks WHERE 1=1';
      const params = [];
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      if (category && category !== 'all') {
        sql += ' AND category = ?';
        params.push(category);
      }
      if (search && String(search).trim()) {
        sql += ' AND (filename LIKE ? OR url LIKE ?)';
        const term = `%${String(search).trim()}%`;
        params.push(term, term);
      }
      const allowedSort = ['created_at', 'size', 'filename', 'status', 'speed_avg'];
      const col = allowedSort.includes(sortBy) ? sortBy : 'created_at';
      const dir = String(sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      sql += ` ORDER BY ${col} ${dir}`;
      if (limit > 0) {
        sql += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
      }
      try {
        const rows = this._sqlite.prepare(sql).all(...params);
        return rows.map(r => this._rowToTask(r)).filter(Boolean);
      } catch (_e) {}
    }

    // الذاكرة / نمط JSON
    let res = [...this.data.tasks];
    if (status) res = res.filter(t => t.status === status);
    if (category && category !== 'all') res = res.filter(t => t.category === category);
    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      res = res.filter(t => (t.filename && t.filename.toLowerCase().includes(q)) || (t.url && t.url.toLowerCase().includes(q)));
    }
    const dirMul = String(sortDir).toUpperCase() === 'ASC' ? 1 : -1;
    res.sort((a, b) => {
      const va = a[sortBy] ?? a.createdAt ?? 0;
      const vb = b[sortBy] ?? b.createdAt ?? 0;
      return va > vb ? dirMul : va < vb ? -dirMul : 0;
    });
    if (limit > 0) res = res.slice(offset, offset + limit);
    return res;
  }

  upsertTask(snap) {
    const rec = { ...snap };
    delete rec.segments;
    delete rec.connections;
    delete rec.speed;
    const i = this.data.tasks.findIndex(t => t.id === snap.id);
    if (i >= 0) this.data.tasks[i] = rec;
    else this.data.tasks.push(rec);

    if (this._sqlite) {
      try {
        const meta = { ...rec };
        delete meta.id; delete meta.url; delete meta.filename;
        delete meta.status; delete meta.category; delete meta.size;
        delete meta.received; delete meta.speed_avg; delete meta.retry_count;
        delete meta.createdAt; delete meta.updatedAt;

        const stmt = this._sqlite.prepare(`
          INSERT OR REPLACE INTO tasks 
          (id, url, filename, status, category, size, received, speed_avg, retry_count, created_at, updated_at, meta)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          rec.id, rec.url || '', rec.filename || '', rec.status || 'queued',
          rec.category || 'other', rec.size || 0, rec.received || 0,
          rec.speed_avg || 0, rec.retryCount || rec.retry_count || 0,
          rec.createdAt || Date.now(), Date.now(),
          JSON.stringify(meta)
        );
      } catch (_e) {}
    } else {
      this._scheduleSave();
    }
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

  getHistory() {
    if (!Array.isArray(this.data.history)) this.data.history = [];
    return this.data.history;
  }

  addHistory(rec) {
    if (!Array.isArray(this.data.history)) this.data.history = [];
    const entry = {
      id: rec.id || `h-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      url: rec.url || '', filename: rec.filename || '', category: rec.category || 'other',
      size: rec.size || 0, received: rec.received || 0, status: rec.status || 'completed',
      filePath: rec.filePath || '', ts: rec.ts || Date.now()
    };
    this.data.history.unshift(entry);
    if (this.data.history.length > 1000) this.data.history.length = 1000;

    if (this._sqlite) {
      try {
        const meta = { ...entry };
        delete meta.id; delete meta.url; delete meta.filename;
        delete meta.category; delete meta.size; delete meta.received;
        delete meta.status; delete meta.filePath; delete meta.ts;

        this._sqlite.prepare(`
          INSERT OR REPLACE INTO history 
          (id, url, filename, category, size, received, status, filePath, ts, meta)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          entry.id, entry.url, entry.filename, entry.category,
          entry.size, entry.received, entry.status, entry.filePath, entry.ts,
          JSON.stringify(meta)
        );
      } catch (_e) {}
    } else this._scheduleSave();

    return entry;
  }

  removeHistory(id) {
    if (!Array.isArray(this.data.history)) return;
    this.data.history = this.data.history.filter(h => h.id !== id);
    if (this._sqlite) {
      try { this._sqlite.prepare('DELETE FROM history WHERE id = ?').run(id); } catch (_e) {}
    } else this._scheduleSave();
  }

  clearHistory() {
    this.data.history = [];
    if (this._sqlite) {
      try { this._sqlite.prepare('DELETE FROM history').run(); } catch (_e) {}
    } else this._scheduleSave();
  }

  clearResumeState(id) {
    if (this.resume[id]) {
      delete this.resume[id];
      if (this._sqlite) {
        try { this._sqlite.prepare('DELETE FROM resume WHERE id = ?').run(id); } catch (_e) {}
      } else this._scheduleSave();
    }
  }

  /* كشف التكرار عبر السجل الكامل والمهام النشطة (المرحلة 8.5) */
  findDuplicate({ url, filename, size }) {
    const normUrl = url ? String(url).trim().toLowerCase() : null;
    const normName = filename ? String(filename).trim().toLowerCase() : null;

    // فحص التاريخ أولاً
    for (const h of this.data.history) {
      if (normUrl && h.url && h.url.toLowerCase() === normUrl) {
        return { isDuplicate: true, source: 'history', item: h };
      }
      if (normName && size && h.filename && h.filename.toLowerCase() === normName && h.size === size) {
        return { isDuplicate: true, source: 'history', item: h };
      }
    }

    // فحص المهام الحالية
    for (const t of this.data.tasks) {
      if (normUrl && t.url && t.url.toLowerCase() === normUrl) {
        return { isDuplicate: true, source: 'tasks', item: t };
      }
    }

    return { isDuplicate: false, item: null };
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
