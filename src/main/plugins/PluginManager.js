'use strict';

/* مدير الإضافات (6.5): نظام Plugins بسيط وآمن بنيوياً
   - يكتشف الإضافات من مجلدين: plugins-builtin داخل التطبيق + <userData>/plugins للمستخدم
   - كل إضافة ملف JS يصدّر: { name, version, description?, init(ctx) }
   - ctx يمنح واجهة محدودة: addDownload، onTaskCompleted، onTaskFailed، getTasks، log
   ملاحظة أمنية: الإضافات تعمل بامتيازات كاملة داخل main — ثبت ما تثق به فقط */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class PluginManager extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string[]} opts.dirs مجلدات البحث عن الإضافات
   * @param {object} opts.engine محرك التحميل (للواجهة الممنوحة للإضافات)
   * @param {object} opts.stateFile ملف حفظ حالة التفعيل
   */
  constructor({ dirs, engine, stateFile }) {
    super();
    this.dirs = (dirs || []).filter(Boolean);
    this.engine = engine || null;
    this.stateFile = stateFile || null;
    this.plugins = new Map(); // id -> { def, dir, file, enabled }
    this._enabled = this._loadEnabled();
    this._hooks = { completed: [], failed: [] };
  }

  _loadEnabled() {
    try {
      return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    } catch (_e) {
      return {};
    }
  }

  _saveEnabled() {
    try { fs.writeFileSync(this.stateFile, JSON.stringify(this._enabled, null, 2), 'utf8'); } catch (_e) {}
  }

  /* يمسح المجلدات ويفحص الإضافات (بدون تشغيلها) */
  discover() {
    for (const dir of this.dirs) {
      let files = [];
      try { files = fs.readdirSync(dir).filter(f => f.endsWith('.js')); } catch (_e) { continue; }
      for (const f of files) {
        const file = path.join(dir, f);
        const id = path.basename(f, '.js');
        try {
          delete require.cache[require.resolve(file)];
          const def = require(file);
          if (!def || typeof def.init !== 'function' || !def.name) {
            throw new Error('شكل الإضافة غير صالح (يتطلب name و init)');
          }
          this.plugins.set(id, {
            id,
            name: String(def.name),
            version: String(def.version || '1.0.0'),
            description: String(def.description || ''),
            builtin: !this.stateFile || !dir.includes('plugins'),
            dir,
            file,
            def
          });
        } catch (err) {
          this.emit('plugin-error', { id, error: String((err && err.message) || err) });
        }
      }
    }
    return this.list();
  }

  list() {
    return [...this.plugins.values()].map(p => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      enabled: this._enabled[p.id] !== false && !!p.loaded
    }));
  }

  isEnabled(id) { return this._enabled[id] !== false && !!(this.plugins.get(id) || {}).loaded; }

  /* يفعّل الإضافة: يستدعي init مع سياق محدود */
  async enable(id) {
    const p = this.plugins.get(id);
    if (!p) throw new Error('إضافة غير موجودة: ' + id);
    if (p.loaded) return true;
    const engine = this.engine;
    const ctx = {
      id,
      log: (...a) => console.log(`[plugin:${id}]`, ...a),
      addDownload: (url, opts) => {
        if (!engine) throw new Error('المحرك غير متاح');
        return engine.addTask({ url, ...(opts || {}) });
      },
      getTasks: () => (engine ? engine.list() : []),
      onTaskCompleted: (fn) => { if (typeof fn === 'function') this._hooks.completed.push({ id, fn }); },
      onTaskFailed: (fn) => { if (typeof fn === 'function') this._hooks.failed.push({ id, fn }); }
    };
    await p.def.init(ctx);
    p.loaded = true;
    this._enabled[id] = true;
    this._saveEnabled();
    this.emit('plugins-changed');
    return true;
  }

  disable(id) {
    const p = this.plugins.get(id);
    if (!p) return false;
    // إزالة خطافات الإضافة فقط (لا نلمس الإضافات الأخرى)
    this._hooks.completed = this._hooks.completed.filter(h => h.id !== id);
    this._hooks.failed = this._hooks.failed.filter(h => h.id !== id);
    p.loaded = false;
    this._enabled[id] = false;
    this._saveEnabled();
    this.emit('plugins-changed');
    return true;
  }

  /* يفعّل كل الإضافات المفعّلة (يُستدعى عند الإقلاع بعد توفر المحرك) */
  async enableEnabled() {
    this.discover();
    for (const p of this.plugins.values()) {
      if (this._enabled[p.id] !== false) {
        try { await this.enable(p.id); } catch (err) {
          this.emit('plugin-error', { id: p.id, error: String((err && err.message) || err) });
        }
      }
    }
    return this.list();
  }

  /* خطافات يستدعيها المحرك عبر bridge */
  emitTaskCompleted(snapshot) {
    for (const h of [...this._hooks.completed]) {
      try { h.fn(snapshot); } catch (err) {
        this.emit('plugin-error', { id: h.id, error: String((err && err.message) || err) });
      }
    }
  }

  emitTaskFailed(snapshot) {
    for (const h of [...this._hooks.failed]) {
      try { h.fn(snapshot); } catch (err) {
        this.emit('plugin-error', { id: h.id, error: String((err && err.message) || err) });
      }
    }
  }
}

module.exports = { PluginManager };