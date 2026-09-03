'use strict';

class DomainIntelligence {
  /**
   * @param {object} db كائن قاعدة البيانات لحفظ الإحصائيات
   */
  constructor(db) {
    this.db = db;
    this.stats = new Map(); // domain -> { attempts, throttles, avgSpeed, optimalConnections }
    this._load();
  }

  _load() {
    if (!this.db) return;
    try {
      const s = this.db.getSettings();
      if (s.domainIntelligence && typeof s.domainIntelligence === 'object') {
        for (const [k, v] of Object.entries(s.domainIntelligence)) {
          this.stats.set(k, v);
        }
      }
    } catch (_e) {}
  }

  _persist() {
    if (!this.db) return;
    try {
      const obj = Object.fromEntries(this.stats);
      this.db.updateSettings({ domainIntelligence: obj });
    } catch (_e) {}
  }

  getOptimalConnections(domain, fallback = 16) {
    if (!domain) return fallback;
    const d = String(domain).toLowerCase().trim();
    const entry = this.stats.get(d);
    if (!entry) return fallback;
    return entry.optimalConnections || fallback;
  }

  recordAttempt(domain, { statusCode, speed = 0, connections = 16 }) {
    if (!domain) return;
    const d = String(domain).toLowerCase().trim();
    const cur = this.stats.get(d) || {
      attempts: 0,
      throttles: 0,
      avgSpeed: 0,
      optimalConnections: connections
    };

    cur.attempts++;

    // خوادم تعيد 429 (Too Many Requests) أو 503 عند زيادة عدد الاتصالات
    if (statusCode === 429 || statusCode === 503) {
      cur.throttles++;
      // خفض عدد الاتصالات الآمنة للنطاق للنصف فوراً
      cur.optimalConnections = Math.max(1, Math.floor(cur.optimalConnections / 2));
    } else if (statusCode >= 200 && statusCode < 300) {
      // اتصال ناجح: إذا كان مستقراً تماماً يمكن التدرج للأعلى تدريجياً حتى 16
      if (cur.throttles === 0 && cur.optimalConnections < 16) {
        cur.optimalConnections = Math.min(16, cur.optimalConnections + 1);
      }
      if (speed > 0) {
        cur.avgSpeed = cur.avgSpeed === 0 ? speed : Math.round((cur.avgSpeed * 0.8) + (speed * 0.2));
      }
    }

    this.stats.set(d, cur);
    this._persist();
    return cur;
  }

  getAllStats() {
    return Object.fromEntries(this.stats);
  }
}

module.exports = DomainIntelligence;
