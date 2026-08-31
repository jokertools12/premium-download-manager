'use strict';

/* نظام التحديث التلقائي (electron-updater)
   - يفحص عند التشغيل + كل 6 ساعات + يدوياً من الإعدادات
   - ينزّل التحديث تلقائياً ثم يطلب من المستخدم إعادة التشغيل للتثبيت
   - المصدر: GitHub Releases (أو أي خادم عبر PDM_UPDATE_URL) */

const { autoUpdater } = require('electron-updater');
const { app } = require('electron');

class Updater {
  constructor({ send, appVersion }) {
    this.send = send;
    this.appVersion = appVersion;
    this.state = { status: 'idle', percent: 0, version: null, error: null };
    this._wired = false;
    this.timer = null;
  }

  currentVersion() { return this.appVersion; }

  _wire() {
    if (this._wired) return;
    this._wired = true;

    // ملاحظة: إذا كان المستخدم يريد سيرفر خاص بدل GitHub:
    // شغّل البرنامج بمتغير البيئة PDM_UPDATE_URL=https://your-server.com/updates
    if (process.env.PDM_UPDATE_URL) {
      autoUpdater.setFeedURL({ provider: 'generic', url: process.env.PDM_UPDATE_URL });
    }

    autoUpdater.autoDownload = true;           // تنزيل تلقائي عند توفر تحديث
    autoUpdater.autoInstallOnAppQuit = true;   // تثبيت عند إغلاق التطبيق إن لم ضغط المستخدم

    autoUpdater.on('checking-for-update', () => this._set({ status: 'checking' }));
    autoUpdater.on('update-available', info => this._set({ status: 'available', version: info.version }));
    autoUpdater.on('update-not-available', info => this._set({ status: 'none', version: info.version }));
    autoUpdater.on('download-progress', p => this._set({ status: 'downloading', percent: Math.round(p.percent || 0) }));
    autoUpdater.on('update-downloaded', info => this._set({ status: 'downloaded', version: info.version }));
    autoUpdater.on('error', e => {
      this._set({ status: 'error', error: String((e && e.message) || e).slice(0, 200) });
    });
  }

  _set(patch) {
    this.state = { ...this.state, ...patch };
    if (this.send) this.send({ type: 'update', update: { ...this.state, currentVersion: this.appVersion } });
  }

  /* فحص دوري تلقائي — يعمل في النسخة المثبتة فقط */
  startAutoCheck() {
    if (!app.isPackaged) return; // وضع التطوير: لا تحقق
    this._wire();
    setTimeout(() => this.check(true), 6000);
    this.timer = setInterval(() => this.check(true), 6 * 60 * 60 * 1000);
  }

  /* فحص يدوي (زر الإعدادات) */
  async check() {
    this._wire();
    if (!app.isPackaged) {
      this._set({ status: 'dev', error: 'dev' });
      return { ...this.state, currentVersion: this.appVersion };
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      this._set({ status: 'error', error: String((e && e.message) || e).slice(0, 200) });
    }
    return { ...this.state, currentVersion: this.appVersion };
  }

  /* تثبيت التحديث المنزّل (إعادة تشغيل) */
  install() {
    if (this.state.status === 'downloaded') {
      autoUpdater.quitAndInstall(false, true);
    }
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
  }
}

module.exports = Updater;
