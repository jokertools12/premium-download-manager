'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, screen, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

/* مخطط app:// يجب تسجيله قبل جاهزية التطبيق — انظر protocol.handle في whenReady */
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);
const { buildPng } = require('./icon');
const Database = require('./db/database');
const { DownloadEngine } = require('./engine/DownloadEngine');
const QueueManager = require('./queue/QueueManager');
const Statistics = require('./stats/Statistics');
const ClipboardMonitor = require('./integrations/ClipboardMonitor');
const LocalServer = require('./integrations/LocalServer');
const VideoManager = require('./integrations/VideoManager');
const TorrentManager = require('./integrations/TorrentManager');
const Updater = require('./updater');
const { setupIpc } = require('./ipc');
const { HostRegistrar } = require('./integrations/HostRegistrar');

// وضع مضيف Native Messaging: المتصفح يشغّل البرنامج نفسه كمضيف
// (نتعرف عليه من وسيط chrome-extension:// — يجب معالجته قبل قفل النسخة الواحدة)
const HOST_MODE = process.argv.some(a => /^chrome-extension:\/\//i.test(a)) || process.argv.includes('--native-host');

let win = null;
let floatWin = null;
let tray = null;
let video = null;
let torrent = null;
let updater = null;
let db = null;
let engine = null;
let qm = null;
let clip = null;
let quitting = false;

const gotLock = app.requestSingleInstanceLock();

function send(data) {
  if (win && !win.isDestroyed()) win.webContents.send('pdm:event', data);
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/* ===== النافذة العائمة (Mini Float) ===== */
function createFloatWindow() {
  floatWin = new BrowserWindow({
    width: 390,
    height: 128,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  floatWin.setAlwaysOnTop(true, 'screen-saver');
  // الموضع الابتدائي: أسفل يمين مساحة العمل
  try {
    const wa = screen.getPrimaryDisplay().workArea;
    floatWin.setPosition(wa.x + wa.width - 406, wa.y + wa.height - 146);
  } catch (_e) { /* موضع افتراضي */ }
  floatWin.loadFile(path.join(__dirname, '..', 'renderer', 'float.html'));
  floatWin.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      floatWin.hide();
    }
  });
}

function showFloat() {
  if (!floatWin) createFloatWindow();
  if (!floatWin.isVisible()) floatWin.show();
}

function toggleFloat() {
  if (!floatWin) { createFloatWindow(); floatWin.show(); return; }
  if (floatWin.isVisible()) floatWin.hide();
  else floatWin.show();
}

/* الوضع التلقائي: تظهر عند بدء أي تحميل وتختفي عند انتهائها */
function applyAutoFloat() {
  try {
    if (!db.getSettings().autoFloat) return;
    const sum = combinedSummary();
    if (sum.downloading > 0) showFloat();
    else if (floatWin && floatWin.isVisible()) floatWin.hide();
  } catch (_e) { /* تجاهل */ }
}

/* ملخص موحد: التحميلات العادية + الفيديوهات */
function combinedSummary() {
  const s = engine.summary();
  if (video) {
    s.speed += video.totalSpeed();
    s.downloading += video.activeCount();
  }
  if (torrent) {
    s.speed += torrent.totalSpeed();
    s.downloading += torrent.activeCount();
  }
  return s;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    frame: false,
    show: false,
    backgroundColor: '#0b0f1a',
    icon: nativeImage.createFromBuffer(buildPng(128)),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadURL('app://local/index.html');
  win.once('ready-to-show', () => showWindow());
  win.on('maximize', () => send({ type: 'win', maximized: true }));
  win.on('unmaximize', () => send({ type: 'win', maximized: false }));
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide(); // يبقى يعمل في شريط المهام
    }
  });
}

function createTray() {
  tray = new Tray(nativeImage.createFromBuffer(buildPng(32)));
  tray.setToolTip('Premium Download Manager');
  const lang = (db && db.getSettings().language) || 'ar';
  const L = {
    ar: { open: 'فتح البرنامج', resume: 'استئناف كل التحميلات', pause: 'إيقاف كل التحميلات', quit: 'إنهاء' },
    en: { open: 'Open', resume: 'Resume all', pause: 'Pause all', quit: 'Quit' },
    tr: { open: 'Aç', resume: 'Tümünü sürdür', pause: 'Tümünü duraklat', quit: 'Çıkış' }
  }[lang] || {};
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: L.open || 'فتح البرنامج', click: () => showWindow() },
    { type: 'separator' },
    { label: L.resume || 'استئناف كل التحميلات', click: () => engine.resumeAll() },
    { label: L.pause || 'إيقاف كل التحميلات', click: () => engine.pauseAll() },
    { type: 'separator' },
    { label: L.quit || 'إنهاء', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', () => showWindow());
}

if (HOST_MODE) {
  // المتصفح شغّلنا كمضيف: نعالج الرسالة ونخرج دون فتح أي نوافذ أو أقفال
  require('./native-host-mode')();
} else if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const url = (argv || []).find(a => /^https?:\/\//i.test(a));
    if (url) {
      try { engine.addTask({ url }); } catch (_e) {}
    }
    showWindow();
  });

  app.whenReady().then(() => {
    /* بروتوكول app:// لخدمة ملفات الواجهة: ضروري لأن وحدات ES Modules
       تفشل عبر file:// عندما يحتوي مسار التثبيت على مسافات (مثل "downloader manager") */
    const RENDERER_ROOT = path.join(__dirname, '..', 'renderer');
    const MIME = {
      '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
      '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
      '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
      '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json'
    };
    protocol.handle('app', (req) => {
      try {
        const u = new URL(req.url);
        if (u.host !== 'local') return new Response('not found', { status: 404 });
        const rel = path.normalize(decodeURIComponent(u.pathname)).replace(/^([\\/])+/, '');
        const fp = path.join(RENDERER_ROOT, rel);
        if (!fp.startsWith(RENDERER_ROOT)) return new Response('forbidden', { status: 403 });
        const data = fs.readFileSync(fp);
        return new Response(data, {
          headers: { 'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' }
        });
      } catch (err) {
        return new Response('not found', { status: 404 });
      }
    });
    db = new Database();
    const stats = new Statistics(db);
    engine = new DownloadEngine(db, stats);
    qm = new QueueManager(engine, db);

    engine.on('updated', (snap) => {
      const summary = combinedSummary();
      // النافذة الرئيسية: تحديثات تفاضلية خفيفة (full عند تغييرات هيكلية كالحذف)
      if (win && !win.isDestroyed()) {
        win.webContents.send('pdm:event', snap === null
          ? { type: 'tasks', full: true, tasks: engine.list(), summary }
          : { type: 'tasks', tasks: [snap], summary });
      }
      // النافذة العائمة: تحتاج القائمة الكاملة دائماً
      if (floatWin && !floatWin.isDestroyed()) {
        floatWin.webContents.send('pdm:event', { type: 'tasks', full: true, tasks: engine.list(), summary });
      }
      applyAutoFloat();
    });

    // مدير الفيديوهات (yt-dlp)
    video = new VideoManager(path.join(app.getPath('userData'), 'bin'));
    video.on('updated', () => {
      const payload = { type: 'videos', videos: video.list(), summary: combinedSummary() };
      if (win && !win.isDestroyed()) win.webContents.send('pdm:event', payload);
      if (floatWin && !floatWin.isDestroyed()) floatWin.webContents.send('pdm:event', payload);
      applyAutoFloat();
    });

    // مدير التورنت (WebTorrent)
    torrent = new TorrentManager();
    torrent.on('updated', () => {
      const payload = { type: 'torrents', torrents: torrent.list(), summary: combinedSummary() };
      if (win && !win.isDestroyed()) win.webContents.send('pdm:event', payload);
      if (floatWin && !floatWin.isDestroyed()) floatWin.webContents.send('pdm:event', payload);
      applyAutoFloat();
    });

    // نظام التحديث التلقائي (يعمل في النسخة المثبتة فقط)
    updater = new Updater({ send, appVersion: app.getVersion() });
    updater.startAutoCheck();

    // مسجل مضيف Native Messaging + تسجيل تلقائي لأول تشغيل للنسخة المثبتة
    const extensionDir = app.isPackaged
      ? path.join(process.resourcesPath, 'extension')
      : path.join(app.getAppPath(), 'src', 'extension');
    const host = new HostRegistrar({
      userDataDir: app.getPath('userData'),
      exePath: app.isPackaged ? app.getPath('exe') : '',
      isPackaged: app.isPackaged,
      extensionDir
    });
    if (app.isPackaged) {
      // أعد تسجيل Chrome و Edge دائماً لتحديث الجسر (pdm-host.bat) وملفات المضيف
      // — مهم بعد الترقية من v1.0.0 كي يعمل وضع --native-host الصحيح.
      host.autoRegisterDefaults();
      db.updateSettings({ hostsRegistered: true });
    }

    setupIpc({
      getWindow: () => win,
      db,
      engine,
      video,
      torrent,
      updater,
      host,
      floatApi: {
        toggle: toggleFloat,
        hide: () => { if (floatWin) floatWin.hide(); }
      },
      showMain: showWindow
    });

    createWindow();
    createTray();

    clip = new ClipboardMonitor({ enabled: db.getSettings().clipboardMonitor });
    clip.on('url', (url) => {
      showWindow();
      send({ type: 'clipboard', url });
    });

    // خادم محلي لاستقبال الروابط من إضافة المتصفح
    const server = new LocalServer({
      port: 45762,
      engine,
      video,
      videoDir: () => path.join(engine.settings.downloadDir, (engine.settings.categoryDirs || {}).video || 'Videos'),
      onFocus: showWindow
    });
    server.start().catch(() => {});

    // عيّنات السرعة (آخر 60 ثانية) للرسم البياني الحي في لوحة الإحصائيات
    const speedHist = [];
    setInterval(() => {
      const s = combinedSummary();
      speedHist.push(s.speed);
      if (speedHist.length > 60) speedHist.shift();
      send({ type: 'speedHistory', samples: [...speedHist], speed: s.speed });
    }, 1000);
  });

  app.on('before-quit', () => {
    quitting = true;
    try {
      if (engine) engine.pauseAll();
      if (qm) qm.dispose();
      if (torrent) torrent.destroy();
      if (db) db.save();
    } catch (_e) { /* تجاهل */ }
  });

  app.on('window-all-closed', () => {
    /* يبقى يعمل في شريط المهام */
  });
}
