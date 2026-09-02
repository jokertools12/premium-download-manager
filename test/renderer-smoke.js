/* فحص دخاني مؤقت (الخطوة 1.3): يشغّل index.html في نافذة مخفية مع معالجات IPC وهمية
   مطابقة للعقد الحقيقي، ويتحقق من إقلاع الوحدات وبناء الواجهة دون أخطاء */
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, protocol } = require('electron');

/* تسجيل مخطط app:// كما في main.js — وحدات ESM لا تعمل عبر file:// مع مسافات في المسار */
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

ipcMain.handle('pdm', (_e, cmd) => {
  const settings = {
    language: 'ar', theme: 'dark', downloadDir: 'C:\\Downloads',
    maxConcurrent: 3, maxConnections: 16, maxSpeedKB: 0,
    organizeByCategory: false, clipboardMonitor: false, autoFloat: false,
    scheduler: {}, rules: []
  };
  switch (cmd) {
    case 'getSettings': return settings;
    case 'list': return [];
    case 'summary': return { speed: 0 };
    case 'update:state': return { currentVersion: '0.0.0-test' };
    case 'dbInfo': return { mode: 'json' };
    case 'ext:status': return {};
    default: return {};
  }
});

app.whenReady().then(async () => {
  const RENDERER_ROOT = path.join(__dirname, '..', 'src', 'renderer');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
  protocol.handle('app', (req) => {
    try {
      const u = new URL(req.url);
      const rel = path.normalize(decodeURIComponent(u.pathname)).replace(/^([\\/])+/, '');
      const fp = path.join(RENDERER_ROOT, rel);
      if (!fp.startsWith(RENDERER_ROOT)) return new Response('forbidden', { status: 403 });
      return new Response(fs.readFileSync(fp), {
        headers: { 'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' }
      });
    } catch (_e) {
      return new Response('not found', { status: 404 });
    }
  });
  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload.js') }
  });
  const logs = [];
  win.webContents.on('console-message', (_e, _level, message) => logs.push(String(message)));
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.log('FAIL-LOAD:', code, desc);
    app.exit(1);
  });
  try {
    await win.loadURL('app://local/index.html');
  } catch (err) {
    console.log('LOAD-ERROR:', err.message);
    app.exit(1);
  }
  await new Promise(r => setTimeout(r, 2500));
  const check = await win.webContents.executeJavaScript(`({
    boot: !!window.__bootOk,
    sideItems: document.querySelectorAll('.side-item').length,
    taskCards: document.querySelectorAll('.task').length,
    emptyVisible: document.getElementById('empty') && document.getElementById('empty').style.display !== 'none',
    toastsEl: !!document.getElementById('toasts')
  })`);
  console.log('CHECK:', JSON.stringify(check));
  console.log('CONSOLE-LOGS:', JSON.stringify(logs));
  const bad = logs.filter(l => /Uncaught|not defined|Cannot read/.test(l));
  if (bad.length) console.log('BAD-LOGS:', JSON.stringify(bad));
  app.exit(check.boot && check.sideItems > 0 && check.taskCards === 0 && bad.length === 0 ? 0 : 2);
});