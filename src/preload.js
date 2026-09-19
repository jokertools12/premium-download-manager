'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// كشف قنوات IPC النمطية الموثقة مع الحفاظ الكامل على التوافق العكسي (المرحلة 7.2)
contextBridge.exposeInMainWorld('pdm', {
  // 1. التوافق العكسي
  invoke: async (cmd, payload) => {
    if (typeof cmd === 'string' && cmd.includes(':')) {
      try {
        return await ipcRenderer.invoke(cmd, payload);
      } catch (err) {
        if (err && err.message && (err.message.includes('No handler registered') || err.message.includes('No handler found'))) {
          return await ipcRenderer.invoke('pdm', cmd, payload);
        }
        throw err;
      }
    }
    return ipcRenderer.invoke('pdm', cmd, payload);
  },
  onEvent: (cb) => ipcRenderer.on('pdm:event', (_e, data) => cb(data)),
  platform: process.platform,

  // 2. قنوات المهام المباشرة (tasks)
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    query: (opts) => ipcRenderer.invoke('tasks:query', opts),
    add: (payload) => ipcRenderer.invoke('tasks:add', payload),
    pause: (id) => ipcRenderer.invoke('tasks:pause', id),
    resume: (id) => ipcRenderer.invoke('tasks:resume', id),
    pauseAll: () => ipcRenderer.invoke('tasks:pauseAll'),
    resumeAll: () => ipcRenderer.invoke('tasks:resumeAll'),
    cancel: (id) => ipcRenderer.invoke('tasks:cancel', id),
    remove: (opts) => ipcRenderer.invoke('tasks:remove', opts),
    restart: (id) => ipcRenderer.invoke('tasks:restart', id),
    clearCompleted: () => ipcRenderer.invoke('tasks:clearCompleted')
  },

  // 3. قنوات الإعدادات والسجل
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    chooseDir: () => ipcRenderer.invoke('settings:chooseDir')
  },
  history: {
    get: () => ipcRenderer.invoke('history:get'),
    clear: () => ipcRenderer.invoke('history:clear'),
    remove: (id) => ipcRenderer.invoke('history:remove', { id })
  },

  // 4. معاينة الأرشيف عن بعد (8.1)
  archive: {
    preview: (url, headers) => ipcRenderer.invoke('archive:preview', { url, headers })
  },

  // 5. قدرات الذكاء الاصطناعي Offline-first (9.1 - 9.4)
  ai: {
    categorize: (url, headers) => ipcRenderer.invoke('ai:categorize', { url, headers }),
    parseRule: (text) => ipcRenderer.invoke('ai:parseRule', { text }),
    suggestCleanup: (olderThanDays) => ipcRenderer.invoke('ai:suggestCleanup', { olderThanDays }),
    executeCleanup: (filePaths) => ipcRenderer.invoke('ai:executeCleanup', { filePaths }),
    domainStats: () => ipcRenderer.invoke('ai:domainStats')
  },

  // 6. إقران الموبايل والشبكة المحلية (10.1)
  mobile: {
    status: () => ipcRenderer.invoke('mobile:status'),
    qrCode: () => ipcRenderer.invoke('mobile:qrCode'),
    rotateToken: () => ipcRenderer.invoke('mobile:rotateToken')
  },

  // 7. خلاصات RSS (8.4)
  rss: {
    list: () => ipcRenderer.invoke('rss:list'),
    add: (payload) => ipcRenderer.invoke('rss:add', payload),
    remove: (id) => ipcRenderer.invoke('rss:remove', { id }),
    check: (id) => ipcRenderer.invoke('rss:check', { id })
  },

  // 8. الإضافات والمتجر المجتمعي (7.6 و 12.1)
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    toggle: (id, enabled, forceUntrusted) => ipcRenderer.invoke('plugins:toggle', { id, enabled, forceUntrusted }),
    verify: (id) => ipcRenderer.invoke('plugins:verify', { id }),
    community: () => ipcRenderer.invoke('plugins:community'),
    install: (id) => ipcRenderer.invoke('plugins:install', { id }),
    uninstall: (id) => ipcRenderer.invoke('plugins:uninstall', { id })
  },

  // 9. التيليمتري
  telemetry: {
    status: () => ipcRenderer.invoke('telemetry:status'),
    setOptIn: (enabled) => ipcRenderer.invoke('telemetry:setOptIn', { enabled }),
    logs: () => ipcRenderer.invoke('telemetry:logs')
  }
});
