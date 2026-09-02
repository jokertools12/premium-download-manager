'use strict';

/* مسجل مضيف Native Messaging: يكتب ملفات التعريف ويسجلها
   لكل متصفح (Chrome / Edge / Firefox) — متعدد المنصات (6.1):
   - ويندوز: مفتاح السجل (reg add)
   - ماك/لينكس: كتابة ملف التعريف في مجلد المتصفح المخصص */

const { spawnSync } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { nativeMessagingDir } = require('../platforms');

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
    this.platform = process.platform;
  }

  /* مجلد ملفات التعريف — دائماً في userData (قابل للكتابة بدون صلاحيات مدير) */
  manifestDir() {
    return path.join(this.userDataDir, 'native-host');
  }

  _hostPath() {
    if (this.platform === 'win32') {
      if (this.isPackaged) {
        // النسخة المثبتة: جسر (bat) يشغّل البرنامج نفسه بوضع --native-host
        const bat = path.join(this.manifestDir(), 'pdm-host.bat');
        try {
          fs.writeFileSync(bat, `@echo off\r\n""${this.exePath}"" --native-host\r\n`, 'utf8');
        } catch (_e) { /* تجاهل */ }
        return bat;
      }
      return path.join(this.extensionDir, 'native-host.bat');
    }
    // ماك/لينكس: جسر شل نصي
    const sh = path.join(this.manifestDir(), 'pdm-host.sh');
    try {
      fs.writeFileSync(sh, `#!/bin/sh\nexec "${this.exePath || 'pdm'}" --native-host\n`, 'utf8');
      try { fs.chmodSync(sh, 0o755); } catch (_e) {}
    } catch (_e) { /* تجاهل */ }
    return sh;
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
    if (this.isPackaged) this._hostPath();
    const file = path.join(dir, `${browser}-host.json`);
    await fsp.writeFile(file, this._manifestContent(browser), 'utf8');

    if (this.platform === 'win32') {
      const r = spawnSync('reg', ['add', BROWSERS[browser].key, '/ve', '/t', 'REG_SZ', '/d', file, '/f'], { windowsHide: true });
      if (r.status !== 0) throw new Error('فشل كتابة السجل (reg add)');
      return { ok: true, manifest: file };
    }

    // ماك/لينكس: انسخ ملف التعريف إلى مجلد المتصفح المتوقع
    const targetDir = nativeMessagingDir(this.platform, browser);
    if (!targetDir) throw new Error('منصة غير مدعومة للتسجيل: ' + this.platform);
    await fsp.mkdir(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, `${HOST_NAME}.json`);
    await fsp.writeFile(targetFile, this._manifestContent(browser), 'utf8');
    return { ok: true, manifest: targetFile };
  }

  async unregister(browser) {
    if (this.platform === 'win32') {
      spawnSync('reg', ['delete', BROWSERS[browser].key, '/f'], { windowsHide: true });
      return { ok: true };
    }
    const targetDir = nativeMessagingDir(this.platform, browser);
    if (targetDir) {
      try { await fsp.unlink(path.join(targetDir, `${HOST_NAME}.json`)); } catch (_e) {}
    }
    return { ok: true };
  }

  status(browser) {
    if (this.platform === 'win32') {
      try {
        const r = spawnSync('reg', ['query', BROWSERS[browser].key], { windowsHide: true });
        return r.status === 0 ? 'registered' : 'none';
      } catch (_e) { return 'none'; }
    }
    const dir = nativeMessagingDir(this.platform, browser);
    try {
      return fs.existsSync(path.join(dir, `${HOST_NAME}.json`)) ? 'registered' : 'none';
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
