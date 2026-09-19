'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, screen, protocol, session } = require('electron');
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
const Telemetry = require('./stats/Telemetry');
const ClipboardMonitor = require('./integrations/ClipboardMonitor');
const LocalServer = require('./integrations/LocalServer');
const VideoManager = require('./integrations/VideoManager');
const TorrentManager = require('./integrations/TorrentManager');
const LinkInspector = require('./engine/LinkInspector');
const MobileCompanion = require('./integrations/MobileCompanion');
const RssFeedManager = require('./integrations/RssFeedManager');
const Webhooks = require('./integrations/Webhooks');
const Updater = require('./updater');
const { parseCliArgs } = require('./cli');
const { setupIpc } = require('./ipc');
const { PluginManager } = require('./plugins/PluginManager');
const { HostRegistrar } = require('./integrations/HostRegistrar');
const NetworkBonding = require('./engine/NetworkBonding');
const ThreatShield = require('./engine/ThreatShield');
const MediaTranscoder = require('./integrations/MediaTranscoder');
const TelegramCompanion = require('./integrations/TelegramCompanion');
const ContentSummarizer = require('./ai/ContentSummarizer');

// وضع مضيف Native Messaging: المتصفح يشغّل البرنامج نفسه كمضيف
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
let telemetry = null;
let mobileCompanion = null;
let rssFeedManager = null;
let webhooks = null;
let networkBonding = null;
let threatShield = null;
let mediaTranscoder = null;
let telegramCompanion = null;
let contentSummarizer = null;
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

/* ===== القطعة العائمة لسطح المكتب 2.0 (Desktop Floating Mini-Drop Widget) ===== */
function getFloatDimensions(mode) {
  const isCompact = mode === 'compact';
  return {
    width: isCompact ? 172 : 340,
    height: isCompact ? 54 : 148
  };
}

function setFloatMode(mode) {
  if (!floatWin || floatWin.isDestroyed()) return;
  const targetMode = mode === 'expanded' ? 'expanded' : 'compact';
  const { width, height } = getFloatDimensions(targetMode);
  const [curX, curY] = floatWin.getPosition();
  const [curW] = floatWin.getSize();
  const newX = targetMode === 'compact' ? curX + (curW - width) : curX - (width - curW);
  floatWin.setBounds({ x: Math.max(10, newX), y: Math.max(10, curY), width, height });
  db.updateSettings({ floatMode: targetMode });
  floatWin.webContents.send('pdm:event', { type: 'floatMode', mode: targetMode });
}

function createFloatWindow() {
  const st = db.getSettings();
  const currentMode = st.floatMode || 'compact';
  const { width, height } = getFloatDimensions(currentMode);

  floatWin = new BrowserWindow({
    width,
    height,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  floatWin.setAlwaysOnTop(true, 'screen-saver');
  floatWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  try {
    const wa = screen.getPrimaryDisplay().workArea;
    let x = st.floatX;
    let y = st.floatY;
    if (typeof x !== 'number' || typeof y !== 'number') {
      x = wa.x + wa.width - width - 28;
      y = wa.y + wa.height - height - 36;
    }
    floatWin.setBounds({ x: Math.max(0, x), y: Math.max(0, y), width, height });
  } catch (_e) {}

  floatWin.on('moved', () => {
    try {
      if (!floatWin.isDestroyed()) {
        const [x, y] = floatWin.getPosition();
        db.updateSettings({ floatX: x, floatY: y });
      }
    } catch (_e) {}
  });

  floatWin.loadURL('app://local/float.html');
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
  } catch (_e) {}
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
      nodeIntegration: false,
      sandbox: true
    }
  });

  // تدقيق Electron Hardening (المرحلة 7.3): منع أي فتح لنوافذ جديدة غير مرخص بها
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.loadURL('app://local/index.html');
  win.once('ready-to-show', () => showWindow());
  win.on('maximize', () => send({ type: 'win', maximized: true }));
  win.on('unmaximize', () => send({ type: 'win', maximized: false }));
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
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
  require('./native-host-mode')();
} else if (!gotLock) {
  app.quit();
} else {
  try {
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('pdm', process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient('pdm');
    }
  } catch (_e) {}

  function handleIncomingUrl(url, extra = {}) {
    try {
      if (!/^https?:\/\//i.test(String(url || ''))) return false;
      if (video && video.isStreamUrl(url)) {
        video.autoDownload(url, path.join(
          engine.settings.downloadDir,
          (engine.settings.categoryDirs || {}).video || 'Videos'
        ));
      } else if (engine) {
        const autoStart = !!(engine.settings && engine.settings.autoStartFromBrowser);
        if (autoStart) {
          engine.addTask({ url, ...extra });
        } else {
          showWindow();
          send({ type: 'openAddModalWithData', url, ...extra });
          return true;
        }
      } else {
        return false;
      }
      showWindow();
      return true;
    } catch (_e) {
      return false;
    }
  }

  app.on('second-instance', (_e, argv) => {
    const r = parseCliArgs(argv);
    if (r.cmd === 'add' && r.url) handleIncomingUrl(r.url);
    showWindow();
  });

  app.whenReady().then(() => {
    // تقييد أذونات الأجهزة (كاميرا، ميكروفون، إلخ) - المرحلة 7.3
    if (session.defaultSession) {
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
      });
    }

    const RENDERER_ROOT = path.join(__dirname, '..', 'renderer');
    const MIME = {
      '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
      '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
      '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
      '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json'
    };
    const MEDIA_MIME = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
      '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
      '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4v': 'video/mp4',
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg'
    };

    const CSP_HEADER = "default-src 'self' app:; script-src 'self' 'unsafe-inline' app:; style-src 'self' 'unsafe-inline' app:; img-src 'self' app: data:; media-src 'self' app:; connect-src 'self' app: http: https: ws:;";

    protocol.handle('app', (req) => {
      try {
        const u = new URL(req.url);
        if (u.host === 'media') {
          const fp = path.normalize(decodeURIComponent(u.pathname.replace(/^\/+/, '')));
          const ext = path.extname(fp).toLowerCase();
          if (!MEDIA_MIME[ext]) return new Response('forbidden', { status: 403 });
          const data = fs.readFileSync(fp);
          return new Response(data, {
            headers: { 'content-type': MEDIA_MIME[ext], 'content-security-policy': CSP_HEADER }
          });
        }
        if (u.host !== 'local') return new Response('not found', { status: 404 });
        const rel = path.normalize(decodeURIComponent(u.pathname)).replace(/^([\\/])+/, '');
        const fp = path.join(RENDERER_ROOT, rel);
        if (!fp.startsWith(RENDERER_ROOT)) return new Response('forbidden', { status: 403 });
        const data = fs.readFileSync(fp);
        return new Response(data, {
          headers: {
            'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
            'content-security-policy': CSP_HEADER
          }
        });
      } catch (err) {
        return new Response('not found', { status: 404 });
      }
    });

    db = new Database();
    const stats = new Statistics(db);
    engine = new DownloadEngine(db, stats);
    qm = new QueueManager(engine, db);

    // التيليمتري خفيف للأخطاء بموافقة صريحة Opt-In (المرحلة 7.5)
    telemetry = new Telemetry({
      appVersion: app.getVersion(),
      storageDir: app.getPath('userData'),
      getSettings: () => db.getSettings(),
      updateSettings: (p) => db.updateSettings(p)
    });

    // موزع الـ Webhooks (المرحلة 10.4)
    webhooks = new Webhooks({ db });

    // مرافق الموبايل عبر الواي فاي المحلي (المرحلة 10.1)
    mobileCompanion = new MobileCompanion({
      port: 45762,
      engine,
      onIncomingUrl: handleIncomingUrl
    });

    // مدير خلاصات RSS (المرحلة 8.4)
    rssFeedManager = new RssFeedManager({ engine, db });
    rssFeedManager.start();

    // منظومة v6.0 Ultra Ecosystem المتقدمة
    networkBonding = new NetworkBonding({ enabled: false });
    threatShield = new ThreatShield({
      quarantineDir: path.join(app.getPath('userData'), 'quarantine')
    });
    mediaTranscoder = new MediaTranscoder(path.join(app.getPath('userData'), 'bin'));
    telegramCompanion = new TelegramCompanion(db.getSettings().telegram || {});
    contentSummarizer = new ContentSummarizer();

    engine.on('updated', (snap) => {
      const summary = combinedSummary();
      if (win && !win.isDestroyed()) {
        win.webContents.send('pdm:event', snap === null
          ? { type: 'tasks', full: true, tasks: engine.list(), summary }
          : { type: 'tasks', tasks: [snap], summary });
      }
      if (floatWin && !floatWin.isDestroyed()) {
        floatWin.webContents.send('pdm:event', { type: 'tasks', full: true, tasks: engine.list(), summary });
      }
      applyAutoFloat();
    });

    engine.on('extracted', (info) => {
      if (win && !win.isDestroyed()) win.webContents.send('pdm:event', { type: 'extracted', ...info });
    });

    // نظام الإضافات (6.5 و 7.6 و 12.1)
    const pluginManager = new PluginManager({
      dirs: [
        path.join(app.getAppPath(), 'plugins-builtin'),
        path.join(app.getPath('userData'), 'plugins')
      ],
      engine,
      stateFile: path.join(app.getPath('userData'), 'plugins-state.json')
    });

    const _lastStatus = new Map();
    engine.on('updated', (snap) => {
      if (!snap || !snap.id) return;
      const prev = _lastStatus.get(snap.id);
      _lastStatus.set(snap.id, snap.status);
      if (prev && prev !== snap.status) {
        if (snap.status === 'completed') {
          pluginManager.emitTaskCompleted(snap);
          webhooks.dispatch('task:completed', snap);
          if (telegramCompanion) telegramCompanion.notifyDownloadComplete(snap).catch(() => {});
        } else if (snap.status === 'failed') {
          pluginManager.emitTaskFailed(snap);
          webhooks.dispatch('task:failed', snap);
          telemetry.recordError(snap.error || 'Download failed', `Task: ${snap.filename}`);
        }
      }
    });

    pluginManager.on('plugins-changed', () => send({ type: 'plugins', plugins: pluginManager.list() }));
    pluginManager.on('plugin-error', (e) => send({ type: 'plugin-error', ...e }));
    pluginManager.enableEnabled().catch(() => {});

    // مدير الفيديوهات
    video = new VideoManager(path.join(app.getPath('userData'), 'bin'));
    video.on('updated', () => {
      const payload = { type: 'videos', videos: video.list(), summary: combinedSummary() };
      if (win && !win.isDestroyed()) win.webContents.send('pdm:event', payload);
      if (floatWin && !floatWin.isDestroyed()) floatWin.webContents.send('pdm:event', payload);
      applyAutoFloat();
    });

    video.on('audio-extracted', (info) => {
      if (win && !win.isDestroyed()) win.webContents.send('pdm:event', { type: 'mp3', ...info });
    });

    // مدير التورنت
    torrent = new TorrentManager();
    torrent.on('updated', () => {
      const payload = { type: 'torrents', torrents: torrent.list(), summary: combinedSummary() };
      if (win && !win.isDestroyed()) win.webContents.send('pdm:event', payload);
      if (floatWin && !floatWin.isDestroyed()) floatWin.webContents.send('pdm:event', payload);
      applyAutoFloat();
    });

    // التحديث التلقائي
    updater = new Updater({ send, appVersion: app.getVersion() });
    updater.startAutoCheck();

    // مسجل مضيف Native Messaging
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
      host.autoRegisterDefaults();
      db.updateSettings({ hostsRegistered: true });
    }

    // تهيئة قنوات IPC النمطية
    setupIpc({
      getWindow: () => win,
      db,
      engine,
      video,
      torrent,
      updater,
      host,
      plugins: pluginManager,
      floatApi: {
        toggle: toggleFloat,
        hide: () => { if (floatWin) floatWin.hide(); },
        setMode: setFloatMode,
        getMode: () => (db.getSettings().floatMode || 'compact')
      },
      showMain: showWindow,
      telemetry,
      mobileCompanion,
      rssFeedManager,
      webhooks,
      linkInspector: new LinkInspector(),
      networkBonding,
      threatShield,
      mediaTranscoder,
      telegramCompanion,
      contentSummarizer
    });

    createWindow();
    createTray();

    clip = new ClipboardMonitor({ enabled: db.getSettings().clipboardMonitor });
    clip.on('url', (url) => {
      showWindow();
      send({ type: 'clipboard', url });
    });

    // خادم محلي + REST API v1 + مرافق الموبايل
    const server = new LocalServer({
      port: 45762,
      engine,
      video,
      version: app.getVersion(),
      videoDir: () => path.join(engine.settings.downloadDir, (engine.settings.categoryDirs || {}).video || 'Videos'),
      onFocus: showWindow,
      onFloatToggle: toggleFloat,
      onAddPrompt: (data) => {
        showWindow();
        send({ type: 'openAddModalWithData', ...data });
      },
      mobileCompanion,
      qm
    });
    server.start().catch(() => {});

    const incoming = parseCliArgs(process.argv);
    if (incoming.cmd === 'add' && incoming.url) handleIncomingUrl(incoming.url);

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
      if (rssFeedManager) rssFeedManager.stop();
      if (torrent) torrent.destroy();
      if (db) db.save();
    } catch (_e) {}
  });

  app.on('window-all-closed', () => {});
}
