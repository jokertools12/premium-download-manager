'use strict';

/* مسجل مضيف Native Messaging: يكتب ملفات التعريف ومفاتيح السجل
   لكل متصفح (Chrome / Edge / Firefox) — يستخدم من الإعدادات وأول تشغيل */

const { spawnSync } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const HOST_NAME = 'com.premiumdm.host';
const EXT_ID = 'omiblbfhcglchohlnedfiamiejhgjojh';

const BROWSERS = {
  chrome: { key: `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`, kind: 'chromium' },
  edge: { key: `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`, kind: 'chromium' },
  firefox: { key: `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}`, kind: 'firefox' }
};

class HostRegistrar {
  constructor({ userDataDir, exePath, isPackaged, extensionDir }) {
    this.userDataDir = userDataDir;
    this.exePath = exePath;
    this.isPackaged = isPackaged;
    this.extensionDir = extensionDir;
  }

  /* مجلد ملفات التعريف — دائماً في userData (قابل للكتابة بدون صلاحيات مدير) */
  manifestDir() {
    return path.join(this.userDataDir, 'native-host');
  }

  _hostPath() {
    if (this.isPackaged) return this.exePath; // البرنامج نفسه هو المضيف (وضع --native-host)
    return path.join(this.extensionDir, 'native-host.bat');
  }

  _manifestContent(browser) {
    const base = {
      name: HOST_NAME,
      description: 'Premium Download Manager',
      path: this._hostPath(),
      type: 'stdio'
    };
    if (BROWSERS[browser].kind === 'firefox') {
      return JSON.stringify({ ...base, allowed_extensions: ['premiumdm@premiumdm.org'] }, null, 2);
    }
    return JSON.stringify({ ...base, allowed_origins: [`chrome-extension://${EXT_ID}/`] }, null, 2);
  }

  async register(browser) {
    if (!BROWSERS[browser]) throw new Error('متصفح غير معروف: ' + browser);
    const dir = this.manifestDir();
    await fsp.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${browser}-host.json`);
    await fsp.writeFile(file, this._manifestContent(browser), 'utf8');
    const r = spawnSync('reg', ['add', BROWSERS[browser].key, '/ve', '/t', 'REG_SZ', '/d', file, '/f'], { windowsHide: true });
    if (r.status !== 0) throw new Error('فشل كتابة السجل (reg add)');
    return { ok: true, manifest: file };
  }

  async unregister(browser) {
    spawnSync('reg', ['delete', BROWSERS[browser].key, '/f'], { windowsHide: true });
    return { ok: true };
  }

  status(browser) {
    try {
      const r = spawnSync('reg', ['query', BROWSERS[browser].key], { windowsHide: true });
      return r.status === 0 ? 'registered' : 'none';
    } catch (_e) { return 'none'; }
  }

  statusAll() {
    return {
      chrome: this.status('chrome'),
      edge: this.status('edge'),
      firefox: this.status('firefox'),
      extensionDir: this.extensionDir,
      currentVersion: null
    };
  }

  /* تسجيل تلقائي لـ Chrome و Edge عند أول تشغيل للنسخة المثبتة */
  autoRegisterDefaults() {
    const results = {};
    for (const b of ['chrome', 'edge']) {
      try { results[b] = this.register(b).ok; } catch (_e) { results[b] = false; }
    }
    return results;
  }
}

module.exports = { HostRegistrar, HOST_NAME, EXT_ID, BROWSERS };
