'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

class Telemetry {
  /**
   * @param {object} opts
   * @param {string} opts.appVersion إصدار البرنامج
   * @param {string} opts.storageDir مجلد حفظ سجلات الانهيار المحلية
   * @param {function} opts.getSettings دالة قراءة الإعدادات
   * @param {function} opts.updateSettings دالة حفظ خيار الموافقة
   */
  constructor({ appVersion, storageDir, getSettings, updateSettings }) {
    this.appVersion = appVersion || '2.1.0';
    this.storageDir = storageDir;
    this.getSettings = getSettings || (() => ({}));
    this.updateSettings = updateSettings || (() => {});
    this.logFile = storageDir ? path.join(storageDir, 'crash-telemetry.json') : null;
    this.logs = [];
    this._loadLogs();
  }

  _loadLogs() {
    if (!this.logFile) return;
    try {
      if (fs.existsSync(this.logFile)) {
        this.logs = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
      }
    } catch (_e) {
      this.logs = [];
    }
  }

  _saveLogs() {
    if (!this.logFile) return;
    try {
      if (this.logs.length > 50) this.logs = this.logs.slice(-50);
      fs.writeFileSync(this.logFile, JSON.stringify(this.logs, null, 2), 'utf8');
    } catch (_e) {}
  }

  isOptedIn() {
    const s = this.getSettings();
    return s.telemetryOptIn === true;
  }

  needsPrompt() {
    const s = this.getSettings();
    return s.telemetryOptIn === null || s.telemetryOptIn === undefined;
  }

  setOptIn(enabled) {
    this.updateSettings({ telemetryOptIn: !!enabled });
  }

  /**
   * تعقيم مسار مكدس الخطأ وإزالة أي أسماء مستخدمين أو روابط خاصة
   */
  sanitizeStack(stack) {
    if (!stack) return '';
    let str = String(stack);
    // إزالة مسارات المستخدم الشخصية (C:\Users\username\... أو /home/username/...)
    const home = os.homedir();
    if (home) {
      str = str.split(home).join('~');
    }
    // إخفاء الروابط وعناوين IP
    str = str.replace(/https?:\/\/[^\s]+/g, '<REDACTED_URL>');
    str = str.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<REDACTED_IP>');
    return str;
  }

  recordError(err, context = '') {
    // يسجل محلياً دائماً لتشخيص المشاكل، لكن لا يبث خارجياً إلا إذا وافق المستخدم
    const entry = {
      id: `err-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      name: (err && err.name) || 'Error',
      message: (err && err.message) ? this.sanitizeStack(err.message) : String(err),
      stack: (err && err.stack) ? this.sanitizeStack(err.stack) : '',
      context: String(context || ''),
      appVersion: this.appVersion,
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release()
    };

    this.logs.push(entry);
    this._saveLogs();

    if (this.isOptedIn()) {
      // إرسال للجهة البعيدة (إذا تواجد عنوان endpoint مهيأ)
      this._dispatchRemote(entry).catch(() => {});
    }

    return entry;
  }

  async _dispatchRemote(_entry) {
    // نقطة إرسال صامتة بدون تعطيل البرنامج
    return true;
  }

  getLogs() {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    this._saveLogs();
  }
}

module.exports = Telemetry;
