'use strict';

const fs = require('fs');
const { ipcMain, dialog, shell } = require('electron');

function setupIpc({ getWindow, db, engine, video, torrent, updater, host, floatApi, showMain }) {
  ipcMain.handle('pdm', async (_e, cmd, payload) => {
    const win = getWindow();
    switch (cmd) {
      case 'list':
        return engine.list();
      case 'summary':
        return engine.summary();
      case 'add':
        return engine.addTask(payload || {});
      case 'pause':
        engine.pause(payload);
        return true;
      case 'resume':
        engine.resume(payload);
        return true;
      case 'pauseAll':
        engine.pauseAll();
        return true;
      case 'resumeAll':
        engine.resumeAll();
        return true;
      case 'cancel':
        engine.cancel(payload);
        return true;
      case 'remove':
        await engine.removeTask(payload || {});
        return true;
      case 'restart':
        engine.restart(payload);
        return true;
      case 'clearCompleted':
        engine.clearCompleted();
        if (video) video.clearFinished();
        if (torrent) torrent.clearFinished();
        return true;
      case 'moveUp':
        engine.moveUp(payload);
        return true;
      case 'moveDown':
        engine.moveDown(payload);
        return true;
      case 'downloadNow':
        engine.downloadNow(payload);
        return true;
      case 'getStats':
        return engine.getDashboardStats();
      case 'getHistory':
        return db.getHistory();
      case 'clearHistory':
        db.clearHistory();
        return true;
      case 'removeHistory':
        db.removeHistory((payload || {}).id);
        return true;
      case 'float:dropUrl': {
        // سحب رابط إلى النافذة العائمة (3.7): افتح الرئيسية واقترح الرابط
        const url = String((payload || {}).url || '');
        if (url && showMain) showMain();
        if (url && win && !win.isDestroyed()) {
          win.webContents.send('pdm:event', { type: 'clipboard', url });
        }
        return true;
      }
      case 'importUrls':
        return engine.addBulk((payload || {}).urls || []);
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
      case 'float:toggle':
        if (floatApi && floatApi.toggle) floatApi.toggle();
        return true;
      case 'float:close':
        if (floatApi && floatApi.hide) floatApi.hide();
        return true;
      case 'float:openMain':
        if (showMain) showMain();
        return true;
      case 'video:probe':
        return video.probe(String((payload || {}).url || ''));
      case 'video:download':
        return video.start(payload || {});
      case 'video:cancel':
        video.cancel((payload || {}).id);
        return true;
      case 'video:extractAudio':
        return video.extractAudio((payload || {}).id);
      case 'video:remove': {
        const pv = payload || {};
        video.remove(pv.id, !!pv.deleteFile);
        return true;
      }
      case 'torrent:probe':
        return torrent.probe(String((payload || {}).magnet || ''));
      case 'torrent:download':
        return torrent.start(payload || {});
      case 'torrent:cancel':
        torrent.cancel((payload || {}).id);
        return true;
      case 'torrent:remove': {
        const pt = payload || {};
        torrent.remove(pt.id, !!pt.deleteFile);
        return true;
      }
      case 'dbInfo':
        return { mode: db.getMode() };
      case 'update:state':
        return updater ? { ...updater.state, currentVersion: updater.currentVersion() } : { status: 'idle' };
      case 'update:check':
        if (!updater) throw new Error('التحديث غير متاح');
        return updater.check();
      case 'update:install':
        if (updater) updater.install();
        return true;
      case 'ext:status':
        return host ? host.statusAll() : {};
      case 'ext:register':
        if (!host) throw new Error('غير متاح');
        return host.register((payload || {}).browser);
      case 'ext:unregister':
        if (!host) throw new Error('غير متاح');
        return host.unregister((payload || {}).browser);
      case 'ext:openFolder': {
        if (host) shell.openPath(host.extensionDir);
        return true;
      }
      case 'copyText': {
        const { clipboard } = require('electron');
        clipboard.writeText(String((payload || {}).text || ''));
        return true;
      }
      case 'openDownloadsFolder': {
        const s = db.getSettings();
        shell.openPath(s.downloadDir);
        return true;
      }
      case 'getSettings':
        return db.getSettings();
      case 'setSettings': {
        const s = db.updateSettings(payload || {});
        engine.applySettings(s);
        return s;
      }
      case 'chooseDir': {
        const r = await dialog.showOpenDialog(win, {
          properties: ['openDirectory', 'createDirectory']
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
      case 'openPath': { // فتح ملف بمساره المباشر (معاينة/سجل 3.2-3.3)
        const p1 = (payload || {}).path;
        if (p1) shell.openPath(p1);
        return true;
      }
      case 'revealPath': {
        const p2 = (payload || {}).path;
        if (p2) shell.showItemInFolder(p2);
        return true;
      }
      case 'win:minimize':
        win.minimize();
        return true;
      case 'win:maximize':
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        return true;
      case 'win:close':
        win.hide(); // يبقى يعمل في شريط المهام
        return true;
      default:
        throw new Error('أمر غير معروف: ' + cmd);
    }
  });
}

module.exports = { setupIpc };
