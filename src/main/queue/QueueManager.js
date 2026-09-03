'use strict';

// مدير الطوابير + الجدولة الزمنية + جدولة النطاق الترددي بالوقت (8.2)
class QueueManager {
  constructor(engine, db) {
    this.engine = engine;
    this.db = db;
    this._lastTick = '';
    this._scheduledBandwidthActive = false;
    this.timer = setInterval(() => this.tick(), 15000);
    this.autoShutdownAction = 'none';

    if (this.engine) {
      this.engine.on('task:completed', () => {
        this.checkQueueCompletion();
      });
    }
  }

  /* تحديد إجراء ما بعد اكتمال التحميل (المرحلة 14.3) */
  setAutoShutdown(action) {
    this.autoShutdownAction = action || 'none';
    return this.autoShutdownAction;
  }

  executePowerAction(action) {
    const { exec } = require('child_process');
    if (action === 'shutdown') {
      if (process.platform === 'win32') exec('shutdown /s /t 30');
      else if (process.platform === 'darwin') exec("osascript -e 'tell app \"System Events\" to shut down'");
      else exec('systemctl poweroff || shutdown -h +1');
    } else if (action === 'sleep') {
      if (process.platform === 'win32') exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
      else if (process.platform === 'darwin') exec("osascript -e 'tell app \"System Events\" to sleep'");
      else exec('systemctl suspend');
    }
  }

  checkQueueCompletion() {
    if (!this.autoShutdownAction || this.autoShutdownAction === 'none') return null;
    if (!this.engine) return null;
    const summary = this.engine.summary();
    if (summary.downloading === 0 && summary.queued === 0) {
      const act = this.autoShutdownAction;
      this.autoShutdownAction = 'none';
      this.executePowerAction(act);
      return act;
    }
    return null;
  }

  tick() {
    const s = this.db.getSettings();
    if (!s.scheduler || !s.scheduler.enabled) {
      if (this._scheduledBandwidthActive) {
        this._restoreDefaultSpeed();
      }
      return;
    }

    const now = new Date();
    const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 1. جدولة البدء والإيقاف التلقائي
    if (cur !== this._lastTick) {
      this._lastTick = cur;
      try {
        if (s.scheduler.startAt && cur === s.scheduler.startAt) this.engine.resumeAll();
        if (s.scheduler.stopAt && cur === s.scheduler.stopAt) this.engine.pauseAll();
      } catch (_e) {}
    }

    // 2. جدولة النطاق الترددي بالوقت (8.2)
    this._checkBandwidthSchedule(cur, s);
  }

  _checkBandwidthSchedule(curTime, settings) {
    const rules = (settings.scheduler && Array.isArray(settings.scheduler.bandwidthRules))
      ? settings.scheduler.bandwidthRules
      : [];

    let activeRule = null;
    for (const r of rules) {
      if (!r.enabled) continue;
      if (this._isTimeInRange(curTime, r.startAt, r.stopAt)) {
        activeRule = r;
        break;
      }
    }

    if (activeRule) {
      this._scheduledBandwidthActive = true;
      if (this.engine && this.engine.speedLimiter) {
        const limitBytes = (activeRule.maxSpeedKB || 0) * 1024;
        this.engine.speedLimiter.setLimit(limitBytes);
      }
    } else if (this._scheduledBandwidthActive) {
      this._restoreDefaultSpeed();
    }
  }

  _restoreDefaultSpeed() {
    this._scheduledBandwidthActive = false;
    if (this.engine && this.engine.speedLimiter) {
      const defaultLimit = (this.db.getSettings().maxSpeedKB || 0) * 1024;
      this.engine.speedLimiter.setLimit(defaultLimit);
    }
  }

  _isTimeInRange(cur, start, stop) {
    if (!start || !stop) return false;
    if (start <= stop) {
      return cur >= start && cur <= stop;
    } else {
      // يمتد بعد منتصف الليل (مثلاً 22:00 إلى 06:00)
      return cur >= start || cur <= stop;
    }
  }

  dispose() {
    clearInterval(this.timer);
  }
}

module.exports = QueueManager;
