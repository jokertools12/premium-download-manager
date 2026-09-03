'use strict';

const fs = require('fs');
const { ipcMain, dialog, shell, clipboard } = require('electron');
const { scanPage } = require('./integrations/grabber');
const ArchivePreview = require('./engine/ArchivePreview');
const RuleEngine = require('./engine/RuleEngine');
const SmartClassifier = require('./ai/SmartClassifier');
const RuleParser = require('./ai/RuleParser');
const DomainIntelligence = require('./ai/DomainIntelligence');
const SmartCleanup = require('./ai/SmartCleanup');
const DuplicateDetector = require('./engine/DuplicateDetector');
const CommunityRegistry = require('./plugins/CommunityRegistry');

function setupIpc({
  getWindow, db, engine, video, torrent, updater, host, plugins,
  floatApi, showMain, telemetry, mobileCompanion, rssFeedManager, webhooks,
  linkInspector, networkBonding, threatShield, mediaTranscoder, telegramCompanion, contentSummarizer
}) {
  const linkInsp = linkInspector || new (require('./engine/LinkInspector'))();
  const smartClassifier = new SmartClassifier();
  const domainIntelligence = new DomainIntelligence(db);
  const smartCleanup = new SmartCleanup({ db });
  const duplicateDetector = new DuplicateDetector(db);
  const communityRegistry = new CommunityRegistry({
    pluginsDir: plugins && plugins.dirs ? plugins.dirs.find(d => d.includes('plugins') && !d.includes('plugins-builtin')) : null
  });

  // دوال التحقق من صحة الحمولات (Validation Layer - 7.2)
  function validate(schema, payload) {
    if (!schema) return true;
    for (const [key, rules] of Object.entries(schema)) {
      const val = payload ? payload[key] : undefined;
      if (rules.required && (val === undefined || val === null || val === '')) {
        throw new Error(`حقل إلزامي مفقود: ${key}`);
      }
      if (val !== undefined && rules.type && typeof val !== rules.type) {
        throw new Error(`نوع الحقل غير صالح (${key}): المتوقع ${rules.type} ولكن تم استلام ${typeof val}`);
      }
    }
    return true;
  }

  /* =========================================================================
     قنوات IPC النمطية الموثقة (Modular Typed Channels - 7.2)
     ========================================================================= */

  // 1. قنوات المهام (tasks:*)
  ipcMain.handle('tasks:list', async () => engine.list());

  ipcMain.handle('tasks:query', async (_e, payload) => {
    return db.queryTasks(payload || {});
  });

  ipcMain.handle('tasks:add', async (_e, payload) => {
    validate({ url: { required: true, type: 'string' } }, payload);
    const p = { ...(payload || {}) };

    // فحص التكرار (المرحلة 8.5)
    if (!p.forceDuplicate) {
      const dup = duplicateDetector.check({ url: p.url, filename: p.filename });
      if (dup.isDuplicate) {
        return { isDuplicate: true, duplicateInfo: dup };
      }
    }

    // تصنيف ذكي تلقائي إذا لم يُحدد التصنيف (المرحلة 9.1)
    if (!p.category || p.category === 'other') {
      const cl = smartClassifier.classify(p.url, p.headers);
      if (cl.confidence >= 0.7) {
        p.category = cl.category;
      }
    }

    // تطبيق قواعد التوجيه المركبة (المرحلة 8.3)
    const settings = db.getSettings();
    const routed = RuleEngine.applyRules(p, settings.rules || []);

    const task = engine.addTask(routed);

    // تسجيل محاولة النطاق لذكاء الخوادم (المرحلة 9.3)
    try {
      const domain = new URL(p.url).hostname;
      domainIntelligence.recordAttempt(domain, { statusCode: 200, connections: settings.maxConnections });
    } catch (_e) {}

    // بث حدث Webhook إن وجد (المرحلة 10.4)
    if (webhooks) webhooks.dispatch('task:created', { id: task.id, url: task.url, filename: task.filename });

    return task;
  });

  ipcMain.handle('tasks:pause', async (_e, id) => {
    validate({ id: { required: true } }, typeof id === 'object' ? id : { id });
    const taskId = typeof id === 'object' ? id.id : id;
    engine.pause(taskId);
    return true;
  });

  ipcMain.handle('tasks:resume', async (_e, id) => {
    validate({ id: { required: true } }, typeof id === 'object' ? id : { id });
    const taskId = typeof id === 'object' ? id.id : id;
    engine.resume(taskId);
    return true;
  });

  ipcMain.handle('tasks:pauseAll', async () => { engine.pauseAll(); return true; });
  ipcMain.handle('tasks:resumeAll', async () => { engine.resumeAll(); return true; });
  ipcMain.handle('tasks:cancel', async (_e, p) => { engine.cancel(p); return true; });
  ipcMain.handle('tasks:remove', async (_e, p) => { await engine.removeTask(p || {}); return true; });
  ipcMain.handle('tasks:restart', async (_e, p) => { engine.restart(p); return true; });
  ipcMain.handle('tasks:refreshUrl', async (_e, payload) => {
    validate({ id: { required: true, type: 'string' }, url: { required: true, type: 'string' } }, payload);
    return engine.refreshTaskUrl(payload.id, payload.url);
  });
  ipcMain.handle('tasks:clearCompleted', async () => {
    engine.clearCompleted();
    if (video) video.clearFinished();
    if (torrent) torrent.clearFinished();
    return true;
  });

  // 2. قنوات الإعدادات (settings:*)
  ipcMain.handle('settings:get', async () => db.getSettings());
  ipcMain.handle('settings:set', async (_e, patch) => {
    const s = db.updateSettings(patch || {});
    engine.applySettings(s);
    return s;
  });
  ipcMain.handle('settings:chooseDir', async () => {
    const win = getWindow();
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  // 3. قنوات السجل والإحصائيات (history:*)
  ipcMain.handle('history:get', async () => db.getHistory());
  ipcMain.handle('history:clear', async () => { db.clearHistory(); return true; });
  ipcMain.handle('history:remove', async (_e, payload) => {
    db.removeHistory((payload || {}).id);
    return true;
  });
  ipcMain.handle('stats:get', async () => engine.getDashboardStats());

  // 4. قنوات معاينة الأرشيف (archive:*) - المرحلة 8.1
  ipcMain.handle('archive:preview', async (_e, payload) => {
    validate({ url: { required: true, type: 'string' } }, payload);
    return ArchivePreview.inspectZip(payload.url, payload.headers);
  });

  // 5. قنوات الذكاء الاصطناعي (ai:*) - المرحلة 9
  ipcMain.handle('ai:categorize', async (_e, payload) => {
    validate({ url: { required: true, type: 'string' } }, payload);
    return smartClassifier.classify(payload.url, payload.headers);
  });

  ipcMain.handle('ai:parseRule', async (_e, payload) => {
    validate({ text: { required: true, type: 'string' } }, payload);
    return RuleParser.parse(payload.text);
  });

  ipcMain.handle('ai:suggestCleanup', async (_e, payload) => {
    const days = (payload && payload.olderThanDays) ? Number(payload.olderThanDays) : 30;
    return smartCleanup.analyze(days);
  });

  ipcMain.handle('ai:executeCleanup', async (_e, payload) => {
    validate({ filePaths: { required: true } }, payload);
    return smartCleanup.executeCleanup(payload.filePaths);
  });

  ipcMain.handle('ai:domainStats', async () => {
    return domainIntelligence.getAllStats();
  });

  // 6. قنوات الموبايل وإقران QR (mobile:*) - المرحلة 10.1
  ipcMain.handle('mobile:status', async () => {
    if (!mobileCompanion) return { available: false };
    return {
      available: true,
      pairingUrl: mobileCompanion.getPairingUrl(),
      token: mobileCompanion.token,
      localIp: mobileCompanion.getLocalIp(),
      port: mobileCompanion.port
    };
  });

  ipcMain.handle('mobile:qrCode', async () => {
    if (!mobileCompanion) return null;
    return {
      svg: mobileCompanion.generateQrSvg(),
      url: mobileCompanion.getPairingUrl()
    };
  });

  ipcMain.handle('mobile:rotateToken', async () => {
    if (!mobileCompanion) return null;
    return mobileCompanion.rotateToken();
  });

  // 7. قنوات خلاصات RSS (rss:*) - المرحلة 8.4
  ipcMain.handle('rss:list', async () => {
    return rssFeedManager ? rssFeedManager.getFeeds() : [];
  });

  ipcMain.handle('rss:add', async (_e, payload) => {
    validate({ url: { required: true, type: 'string' } }, payload);
    if (!rssFeedManager) throw new Error('مدير الخلاصات غير مفعل');
    return rssFeedManager.addFeed(payload);
  });

  ipcMain.handle('rss:remove', async (_e, payload) => {
    validate({ id: { required: true } }, payload);
    return rssFeedManager ? rssFeedManager.removeFeed(payload.id) : false;
  });

  ipcMain.handle('rss:check', async (_e, payload) => {
    validate({ id: { required: true } }, payload);
    return rssFeedManager ? rssFeedManager.checkFeed(payload.id) : null;
  });

  // 8. قنوات الإضافات والمتجر المجتمعي (plugins:*) - المراحل 7.6 و 12.1
  ipcMain.handle('plugins:list', async () => plugins ? plugins.list() : []);
  ipcMain.handle('plugins:toggle', async (_e, payload) => {
    if (!plugins) throw new Error('الإضافات غير متاحة');
    return (payload || {}).enabled ? plugins.enable(payload.id, !!payload.forceUntrusted) : plugins.disable(payload.id);
  });
  ipcMain.handle('plugins:verify', async (_e, payload) => {
    validate({ id: { required: true } }, payload);
    return plugins ? plugins.verifyPlugin(payload.id) : null;
  });
  ipcMain.handle('plugins:community', async () => communityRegistry.getCatalogue());
  ipcMain.handle('plugins:install', async (_e, payload) => {
    validate({ id: { required: true } }, payload);
    const r = await communityRegistry.install(payload.id);
    if (plugins) plugins.discover();
    return r;
  });
  ipcMain.handle('plugins:uninstall', async (_e, payload) => {
    validate({ id: { required: true } }, payload);
    const r = communityRegistry.uninstall(payload.id);
    if (plugins) plugins.discover();
    return r;
  });

  // 9. قنوات التيليمتري والأمان (telemetry:*) - المرحلة 7.5
  ipcMain.handle('telemetry:status', async () => {
    if (!telemetry) return { available: false, optedIn: false, needsPrompt: false };
    return {
      available: true,
      optedIn: telemetry.isOptedIn(),
      needsPrompt: telemetry.needsPrompt()
    };
  });
  ipcMain.handle('telemetry:setOptIn', async (_e, payload) => {
    if (telemetry) telemetry.setOptIn(!!payload.enabled);
    return true;
  });
  ipcMain.handle('telemetry:logs', async () => telemetry ? telemetry.getLogs() : []);

  // 10. قنوات النظام والملفات (system:*)
  ipcMain.handle('system:openFile', async (_e, payload) => {
    const id = (payload || {}).id;
    const t = engine.get(id) || (video && video.get(id)) || (torrent && torrent.get(id));
    if (t && t.filePath) shell.openPath(t.filePath);
    return true;
  });
  ipcMain.handle('system:showInFolder', async (_e, payload) => {
    const id = (payload || {}).id;
    const t = engine.get(id) || (video && video.get(id)) || (torrent && torrent.get(id));
    if (t && t.filePath) shell.showItemInFolder(t.filePath);
    return true;
  });
  ipcMain.handle('system:openPath', async (_e, payload) => {
    if (payload && payload.path) shell.openPath(payload.path);
    return true;
  });
  ipcMain.handle('system:revealPath', async (_e, payload) => {
    if (payload && payload.path) shell.showItemInFolder(payload.path);
    return true;
  });
  ipcMain.handle('system:copyText', async (_e, payload) => {
    clipboard.writeText(String((payload || {}).text || ''));
    return true;
  });
  ipcMain.handle('system:openDownloadsFolder', async () => {
    const s = db.getSettings();
    shell.openPath(s.downloadDir);
    return true;
  });

  // 11. قنوات الفيديو والتورنت
  ipcMain.handle('video:probe', async (_e, p) => video.probe(String((p || {}).url || '')));
  ipcMain.handle('video:download', async (_e, p) => video.start(p || {}));
  ipcMain.handle('video:cancel', async (_e, p) => { video.cancel((p || {}).id); return true; });
  ipcMain.handle('video:extractAudio', async (_e, p) => video.extractAudio((p || {}).id));
  ipcMain.handle('video:remove', async (_e, p) => { video.remove((p || {}).id, !!(p || {}).deleteFile); return true; });

  ipcMain.handle('torrent:probe', async (_e, p) => torrent.probe(String((p || {}).magnet || '')));
  ipcMain.handle('torrent:download', async (_e, p) => torrent.start(p || {}));
  ipcMain.handle('torrent:pause', async (_e, p) => { torrent.pause((p || {}).id); return true; });
  ipcMain.handle('torrent:resume', async (_e, p) => { torrent.resume((p || {}).id); return true; });
  ipcMain.handle('torrent:streamUrl', async (_e, p) => torrent.getStreamUrl((p || {}).id, (p || {}).fileIndex));
  ipcMain.handle('torrent:cancel', async (_e, p) => { torrent.cancel((p || {}).id); return true; });
  ipcMain.handle('torrent:remove', async (_e, p) => { torrent.remove((p || {}).id, !!(p || {}).deleteFile); return true; });

  // 12. قنوات النافذة العائمة
  ipcMain.handle('float:toggle', async () => { if (floatApi && floatApi.toggle) floatApi.toggle(); return true; });
  ipcMain.handle('float:close', async () => { if (floatApi && floatApi.hide) floatApi.hide(); return true; });
  ipcMain.handle('float:openMain', async () => { if (showMain) showMain(); return true; });
  ipcMain.handle('float:setMode', async (_e, mode) => { if (floatApi && floatApi.setMode) floatApi.setMode(mode); return true; });
  ipcMain.handle('float:getMode', async () => { return floatApi && floatApi.getMode ? floatApi.getMode() : 'compact'; });
  ipcMain.handle('float:dropUrl', async (_e, payload) => {
    const url = String((payload || {}).url || '');
    if (url && showMain) showMain();
    const win = getWindow();
    if (url && win && !win.isDestroyed()) {
      win.webContents.send('pdm:event', { type: 'clipboard', url });
    }
    return true;
  });

  // فحص الروابط الذكي والتصنيف التلقائي (المرحلة 5)
  ipcMain.handle('link:inspect', async (_e, p) => linkInsp.inspect(p ? p.url : '', p || {}));

  // 13. التحكم بالنوافذ الأساسية
  ipcMain.handle('win:minimize', async () => { const w = getWindow(); if (w) w.minimize(); return true; });
  ipcMain.handle('win:maximize', async () => {
    const w = getWindow();
    if (w) {
      if (w.isMaximized()) w.unmaximize();
      else w.maximize();
    }
    return true;
  });
  ipcMain.handle('win:close', async () => { const w = getWindow(); if (w) w.hide(); return true; });

  /* =========================================================================
     طبقة التوافق العكسي (Compatibility Adapter Layer - 7.2)
     تضمن استمرار عمل كافة استدعاءات pdm السابقة للإضافات والواجهة القديمة
     ========================================================================= */
  ipcMain.handle('pdm', async (event, cmd, payload) => {
    const win = getWindow();
    switch (cmd) {
      case 'list': return engine.list();
      case 'summary': return engine.summary();
      case 'add': return engine.addTask(payload || {});
      case 'pause': engine.pause(payload); return true;
      case 'resume': engine.resume(payload); return true;
      case 'pauseAll': engine.pauseAll(); return true;
      case 'resumeAll': engine.resumeAll(); return true;
      case 'cancel': engine.cancel(payload); return true;
      case 'remove': await engine.removeTask(payload || {}); return true;
      case 'restart': engine.restart(payload); return true;
      case 'clearCompleted':
        engine.clearCompleted();
        if (video) video.clearFinished();
        if (torrent) torrent.clearFinished();
        return true;
      case 'moveUp': engine.moveUp(payload); return true;
      case 'moveDown': engine.moveDown(payload); return true;
      case 'downloadNow': engine.downloadNow(payload); return true;
      case 'getStats': return engine.getDashboardStats();
      case 'getHistory': return db.getHistory();
      case 'clearHistory': db.clearHistory(); return true;
      case 'removeHistory': db.removeHistory((payload || {}).id); return true;
      case 'plugins:list': return plugins ? plugins.list() : [];
      case 'plugins:toggle':
        if (!plugins) throw new Error('الإضافات غير متاحة');
        return (payload || {}).enabled ? plugins.enable((payload || {}).id) : plugins.disable((payload || {}).id);
      case 'link:inspect': return linkInsp.inspect(payload ? payload.url : '', payload || {});
      case 'grab:scan': return scanPage(String((payload || {}).url || ''));
      case 'exportData': {
        const sv = await dialog.showSaveDialog(win, {
          defaultPath: `PremiumDM-backup-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (sv.canceled || !sv.filePath) return null;
        const data = {
          app: 'PremiumDM', schema: 2, exportedAt: new Date().toISOString(),
          settings: db.getSettings(),
          tasks: db.getTasks(),
          history: db.getHistory(),
          stats: db.getStatsData()
        };
        fs.writeFileSync(sv.filePath, JSON.stringify(data, null, 2), 'utf8');
        return { path: sv.filePath };
      }
      case 'importData': {
        const op = await dialog.showOpenDialog(win, {
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (op.canceled || !op.filePaths.length) return null;
        const raw = JSON.parse(fs.readFileSync(op.filePaths[0], 'utf8'));
        if (raw.app !== 'PremiumDM' || typeof raw !== 'object') {
          throw new Error('ملف نسخة احتياطية غير صالح');
        }
        if (raw.settings && typeof raw.settings === 'object') db.updateSettings(raw.settings);
        let imported = 0;
        if (Array.isArray(raw.tasks)) {
          for (const t of raw.tasks) {
            if (t && t.id && t.url) {
              db.upsertTask({ ...t, status: t.status === 'downloading' ? 'paused' : (t.status || 'paused') });
              imported++;
            }
          }
        }
        if (Array.isArray(raw.history)) {
          for (const h of raw.history) if (h && h.url) db.addHistory(h);
        }
        if (raw.stats && typeof raw.stats === 'object') {
          for (const [k, v] of Object.entries(raw.stats)) {
            if (v && (v.bytes || v.files)) db.addStats(k, v);
          }
        }
        engine.applySettings(db.getSettings());
        engine.reloadFromDb();
        return { imported };
      }
      case 'float:dropUrl': {
        const url = String((payload || {}).url || '');
        if (url && showMain) showMain();
        if (url && win && !win.isDestroyed()) {
          win.webContents.send('pdm:event', { type: 'clipboard', url });
        }
        return true;
      }
      case 'importUrls': return engine.addBulk((payload || {}).urls || []);
      case 'refreshUrl': return engine.refreshTaskUrl((payload || {}).id, (payload || {}).url);
      case 'readTextFile': {
        const r = await dialog.showOpenDialog(win, {
          properties: ['openFile'],
          filters: [
            { name: 'ملف نصي', extensions: ['txt', 'csv', 'list', 'json'] },
            { name: 'كل الملفات', extensions: ['*'] }
          ]
        });
        if (r.canceled || !r.filePaths.length) return null;
        return { content: fs.readFileSync(r.filePaths[0], 'utf8'), path: r.filePaths[0] };
      }
      case 'float:toggle': if (floatApi && floatApi.toggle) floatApi.toggle(); return true;
      case 'float:close': if (floatApi && floatApi.hide) floatApi.hide(); return true;
      case 'float:openMain': if (showMain) showMain(); return true;
      case 'video:probe': return video.probe(String((payload || {}).url || ''));
      case 'video:download': return video.start(payload || {});
      case 'video:cancel': video.cancel((payload || {}).id); return true;
      case 'video:extractAudio': return video.extractAudio((payload || {}).id);
      case 'video:remove': video.remove((payload || {}).id, !!(payload || {}).deleteFile); return true;
      case 'torrent:probe': return torrent.probe(String((payload || {}).magnet || ''));
      case 'torrent:download': return torrent.start(payload || {});
      case 'torrent:cancel': torrent.cancel((payload || {}).id); return true;
      case 'torrent:remove': torrent.remove((payload || {}).id, !!(payload || {}).deleteFile); return true;
      case 'dbInfo': return { mode: db.getMode() };
      case 'update:state': return updater ? { ...updater.state, currentVersion: updater.currentVersion() } : { status: 'idle' };
      case 'update:check': if (!updater) throw new Error('التحديث غير متاح'); return updater.check();
      case 'update:install': if (updater) updater.install(); return true;
      case 'ext:status': return host ? host.statusAll() : {};
      case 'ext:register': if (!host) throw new Error('غير متاح'); return host.register((payload || {}).browser);
      case 'ext:unregister': if (!host) throw new Error('غير متاح'); return host.unregister((payload || {}).browser);
      case 'ext:openFolder': if (host) shell.openPath(host.extensionDir); return true;
      case 'copyText': clipboard.writeText(String((payload || {}).text || '')); return true;
      case 'openDownloadsFolder': { const s = db.getSettings(); shell.openPath(s.downloadDir); return true; }
      case 'getSettings': return db.getSettings();
      case 'setSettings': {
        const s = db.updateSettings(payload || {});
        engine.applySettings(s);
        return s;
      }
      case 'chooseDir': {
        const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
        return r.canceled ? null : r.filePaths[0];
      }
      case 'chooseFile': {
        const r = await dialog.showOpenDialog(win, {
          properties: ['openFile'],
          filters: (payload && payload.filters) || undefined
        });
        return r.canceled ? null : r.filePaths[0];
      }
      case 'showInFolder': {
        const id1 = (payload || {}).id;
        const t1 = engine.get(id1) || (video && video.get(id1)) || (torrent && torrent.get(id1));
        if (t1 && t1.filePath) shell.showItemInFolder(t1.filePath);
        return true;
      }
      case 'openFile': {
        const id2 = (payload || {}).id;
        const t2 = engine.get(id2) || (video && video.get(id2)) || (torrent && torrent.get(id2));
        if (t2 && t2.filePath) shell.openPath(t2.filePath);
        return true;
      }
      case 'openPath': { const p1 = (payload || {}).path; if (p1) shell.openPath(p1); return true; }
      case 'revealPath': { const p2 = (payload || {}).path; if (p2) shell.showItemInFolder(p2); return true; }
      case 'win:minimize': win.minimize(); return true;
      case 'win:maximize': if (win.isMaximized()) win.unmaximize(); else win.maximize(); return true;
      case 'win:close': win.hide(); return true;

      // ===== قنوات v6.0 Ultra Ecosystem المتقدمة =====
      case 'network:getStatus': return networkBonding ? networkBonding.getStatus() : { enabled: false, adapterCount: 0 };
      case 'network:setBonding': {
        const en = !!(payload && payload.enabled);
        if (networkBonding) networkBonding.enabled = en;
        return { ok: true, enabled: en };
      }
      case 'security:scan': {
        const fp = (payload || {}).filePath;
        if (!threatShield || !fp) throw new Error('مسار الملف مطلوب');
        return threatShield.scanFile(fp);
      }
      case 'security:quarantine': {
        const fp = (payload || {}).filePath;
        if (!threatShield || !fp) throw new Error('مسار الملف مطلوب');
        return threatShield.quarantineFile(fp);
      }
      case 'security:restore': {
        const qp = (payload || {}).quarantinePath;
        const op = (payload || {}).originalPath;
        if (!threatShield || !qp) throw new Error('مسار الحجر الصحي مطلوب');
        return threatShield.restoreFile(qp, op);
      }
      case 'transcode:convert': {
        if (!mediaTranscoder) throw new Error('محرك التحويل غير متاح');
        const { source, target, opts } = payload || {};
        return mediaTranscoder.transcodeAudio(source, target, opts);
      }
      case 'transcode:compress': {
        if (!mediaTranscoder) throw new Error('محرك الضغط غير متاح');
        const { source, target, opts } = payload || {};
        return mediaTranscoder.compressVideo(source, target, opts);
      }
      case 'transcode:makeGif': {
        if (!mediaTranscoder) throw new Error('محرك الصور المتحركة غير متاح');
        const { source, target, opts } = payload || {};
        return mediaTranscoder.makeGif(source, target, opts);
      }
      case 'telegram:test': {
        const token = (payload || {}).token;
        const TelegramCompanion = require('./integrations/TelegramCompanion');
        const testBot = new TelegramCompanion({ botToken: token });
        return testBot.testConnection();
      }
      case 'telegram:save': {
        const st = payload || {};
        if (telegramCompanion) {
          telegramCompanion.botToken = st.botToken || '';
          telegramCompanion.chatId = st.chatId || '';
          telegramCompanion.enabled = !!st.enabled;
        }
        db.updateSettings({ telegram: st });
        return { ok: true };
      }
      case 'ai:summarizeFile': {
        const fp = (payload || {}).filePath;
        const maxPoints = (payload || {}).maxPoints || 5;
        if (!contentSummarizer || !fp) throw new Error('مسار الملف مطلوب للتلخيص');
        return contentSummarizer.summarizeFile(fp, maxPoints);
      }
      default:
        throw new Error('أمر غير معروف: ' + cmd);
    }
  });
}

module.exports = { setupIpc };
