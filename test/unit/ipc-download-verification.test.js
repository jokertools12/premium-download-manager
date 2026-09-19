'use strict';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handlers = new Map();

// Mock electron CommonJS module cache for Node environment
const electronMock = {
  ipcMain: {
    handle: (channel, fn) => {
      handlers.set(channel, fn);
    }
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn()
  },
  shell: {
    openPath: vi.fn(),
    showItemInFolder: vi.fn()
  },
  clipboard: {
    writeText: vi.fn(),
    readText: vi.fn()
  }
};

const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: electronMock
};

describe('فحص تكاملي شامل لجميع مسارات وقنوات التحميل (IPC Download & Modal Verification)', () => {
  let tmpDir;
  let db;
  let engine;
  let setupIpc;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-ipc-test-'));
    process.env.APPDATA = tmpDir;

    const dbMod = await import('../../src/main/db/database.js');
    const Database = dbMod.default || dbMod;
    db = new Database();

    const deMod = await import('../../src/main/engine/DownloadEngine.js');
    const DownloadEngine = deMod.DownloadEngine;
    engine = new DownloadEngine(db);

    const ipcMod = require('../../src/main/ipc.js');
    setupIpc = ipcMod.setupIpc;

    setupIpc({
      getWindow: () => null,
      db,
      engine,
      video: null,
      torrent: null,
      updater: null,
      host: null,
      plugins: null,
      floatApi: null,
      showMain: null,
      telemetry: null,
      mobileCompanion: null,
      rssFeedManager: null,
      webhooks: null,
      networkBonding: null,
      threatShield: null,
      mediaTranscoder: null,
      telegramCompanion: null,
      contentSummarizer: null
    });
  });

  afterAll(() => {
    try {
      if (engine) engine.pauseAll();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_e) {}
  });

  it('تسجيل قنوات IPC النمطية المباشرة وقناة pdm للتوافق', () => {
    expect(handlers.has('tasks:add')).toBe(true);
    expect(handlers.has('tasks:list')).toBe(true);
    expect(handlers.has('tasks:pause')).toBe(true);
    expect(handlers.has('tasks:resume')).toBe(true);
    expect(handlers.has('settings:get')).toBe(true);
    expect(handlers.has('pdm')).toBe(true);
  });

  it('حل مشكلة tasks:add بنجاح عند الاستدعاء عبر قناة pdm (المستخدمة في نافذة إضافة التحميل)', async () => {
    const pdmHandler = handlers.get('pdm');
    expect(pdmHandler).toBeDefined();

    const payload = {
      url: 'https://example.com/direct-file.zip',
      filename: 'direct-file.zip',
      paused: false
    };

    const res = await pdmHandler(null, 'tasks:add', payload);
    expect(res).toBeDefined();
    expect(res.existed).toBe(false);
    expect(res.task).toBeDefined();
    expect(res.task.url).toBe('https://example.com/direct-file.zip');
    expect(res.task.filename).toBe('direct-file.zip');
    expect(['queued', 'downloading']).toContain(res.task.status);
  });

  it('دعم خيار تحميل لاحقاً (paused: true) بنجاح عبر نافذة إضافة التحميل', async () => {
    const pdmHandler = handlers.get('pdm');
    const payload = {
      url: 'https://example.com/later-file.pdf',
      filename: 'later-file.pdf',
      paused: true
    };

    const res = await pdmHandler(null, 'tasks:add', payload);
    expect(res).toBeDefined();
    expect(res.existed).toBe(false);
    expect(res.task).toBeDefined();
    expect(res.task.status).toBe('paused');
  });

  it('التحقق من عمل tasks:add عبر القناة النمطية المباشرة مباشرة', async () => {
    const directAdd = handlers.get('tasks:add');
    expect(directAdd).toBeDefined();

    const payload = {
      url: 'https://example.com/direct-channel-file.tar.gz',
      filename: 'direct-channel-file.tar.gz'
    };

    const res = await directAdd(null, payload);
    expect(res).toBeDefined();
    expect(res.existed).toBe(false);
    expect(res.task.filename).toBe('direct-channel-file.tar.gz');
  });

  it('التحقق من عمل الأمر القديم add عبر قناة pdm للتوافق الكامل', async () => {
    const pdmHandler = handlers.get('pdm');
    const res = await pdmHandler(null, 'add', {
      url: 'https://example.com/legacy-add.iso',
      filename: 'legacy-add.iso'
    });
    expect(res).toBeDefined();
    expect(res.task.filename).toBe('legacy-add.iso');
  });

  it('التحقق من كشف التكرار في tasks:add وطلب التأكيد forceDuplicate', async () => {
    const pdmHandler = handlers.get('pdm');
    const dupUrl = 'https://example.com/duplicate-test.mp4';

    // أول إضافة
    const first = await pdmHandler(null, 'tasks:add', { url: dupUrl, filename: 'dup.mp4' });
    expect(first.task).toBeDefined();

    // محاولة إضافة نفس الرابط بدون forceDuplicate
    const dupCheck = await pdmHandler(null, 'tasks:add', { url: dupUrl, filename: 'dup.mp4' });
    expect(dupCheck.isDuplicate).toBe(true);
    expect(dupCheck.duplicateInfo).toBeDefined();

    // إضافة مع forceDuplicate
    const forced = await pdmHandler(null, 'tasks:add', { url: dupUrl, filename: 'dup.mp4', forceDuplicate: true });
    expect(forced.existed).toBe(true);
  });

  it('التحقق من عمل جميع أوامر إدارة التحميلات (pause, resume, list, settings)', async () => {
    const pdmHandler = handlers.get('pdm');

    const list = await pdmHandler(null, 'tasks:list');
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);

    const taskId = list[0].id;
    const pauseRes = await pdmHandler(null, 'tasks:pause', taskId);
    expect(pauseRes).toBe(true);

    const resumeRes = await pdmHandler(null, 'tasks:resume', taskId);
    expect(resumeRes).toBe(true);

    const settings = await pdmHandler(null, 'settings:get');
    expect(settings).toBeDefined();
    expect(settings.downloadDir).toBeDefined();

    const history = await pdmHandler(null, 'history:get');
    expect(Array.isArray(history)).toBe(true);
  });
});
