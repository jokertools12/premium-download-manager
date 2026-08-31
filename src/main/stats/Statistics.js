'use strict';

/* الإحصائيات: تجميع يومي لحجم وعدد التحميلات (يُخزن في قاعدة البيانات) */
class Statistics {
  constructor(db) {
    this.db = db;
    this._last = new Map();   // آخر قيمة received لكل مهمة (لحساب الفرق)
    this._counted = new Set(); // المهام التي عُدّت مكتملة في هذه الجلسة
  }

  static key(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /* تُستدعى مع كل تحديث لمهمة قيد التحميل: يسجل الفرق عن آخر قراءة */
  observe(snap) {
    const cur = snap.received || 0;
    const prev = this._last.get(snap.id);
    this._last.set(snap.id, cur);
    if (prev === undefined || cur <= prev) return;
    this.db.addStats(Statistics.key(), { bytes: cur - prev });
  }

  /* عدّ الملف المكتمل مرة واحدة (فقط للمهام النشطة في هذه الجلسة) */
  onCompleted(id) {
    if (this._last.has(id) && !this._counted.has(id)) {
      this._counted.add(id);
      this.db.addStats(Statistics.key(), { files: 1 });
    }
    this._last.delete(id);
  }

  /* ملخص: اليوم + آخر 7 أيام + الإجمالي */
  getSummary() {
    const all = this.db.getStatsData();
    const today = Object.assign({ bytes: 0, files: 0 }, all[Statistics.key()] || {});
    const weekStart = Statistics.key(new Date(Date.now() - 6 * 86400000));
    const week = { bytes: 0, files: 0 };
    const total = { bytes: 0, files: 0 };
    for (const [k, v] of Object.entries(all)) {
      total.bytes += v.bytes || 0;
      total.files += v.files || 0;
      if (k >= weekStart) {
        week.bytes += v.bytes || 0;
        week.files += v.files || 0;
      }
    }
    return { today, week, total };
  }
}

module.exports = Statistics;
