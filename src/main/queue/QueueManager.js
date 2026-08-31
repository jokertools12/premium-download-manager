'use strict';

// مدير الطوابير + الجدولة الزمنية (بدء/إيقاف التحميلات في وقت محدد)
class QueueManager {
  constructor(engine, db) {
    this.engine = engine;
    this.db = db;
    this._lastTick = '';
    this.timer = setInterval(() => this.tick(), 20000);
  }

  tick() {
    const s = this.db.getSettings();
    if (!s.scheduler || !s.scheduler.enabled) return;
    const now = new Date();
    const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (cur === this._lastTick) return; // ننفذ مرة واحدة لكل دقيقة
    this._lastTick = cur;
    try {
      if (s.scheduler.startAt && cur === s.scheduler.startAt) this.engine.resumeAll();
      if (s.scheduler.stopAt && cur === s.scheduler.stopAt) this.engine.pauseAll();
    } catch (_e) { /* تجاهل */ }
  }

  dispose() {
    clearInterval(this.timer);
  }
}

module.exports = QueueManager;
