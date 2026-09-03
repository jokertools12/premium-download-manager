'use strict';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

let tmpDir;
let MediaStreamer;
let DownloadTask;
let DownloadEngine;
let QueueManager;
let Database;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-p4-test-'));
  process.env.APPDATA = tmpDir;

  const msMod = await import('../../src/main/engine/MediaStreamer.js');
  MediaStreamer = msMod.default || msMod;

  const dtMod = await import('../../src/main/engine/DownloadTask.js');
  DownloadTask = dtMod.default || dtMod;

  const deMod = await import('../../src/main/engine/DownloadEngine.js');
  DownloadEngine = deMod.DownloadEngine;

  const qmMod = await import('../../src/main/queue/QueueManager.js');
  QueueManager = qmMod.default || qmMod;

  const dbMod = await import('../../src/main/db/database.js');
  Database = dbMod.default || dbMod;
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) {}
});

describe('المرحلة 14.1 — بث ومشاهدة الوسائط أثناء التحميل (MediaStreamer)', () => {
  it('يكتشف نوع MIME المناسب لكل امتداد فيديو أو صوت', () => {
    expect(MediaStreamer.getMimeType('movie.mp4')).toBe('video/mp4');
    expect(MediaStreamer.getMimeType('track.mp3')).toBe('audio/mpeg');
    expect(MediaStreamer.getMimeType('stream.mkv')).toBe('video/x-matroska');
    expect(MediaStreamer.getMimeType('unknown.xyz')).toBe('application/octet-stream');
  });

  it('يستجيب بـ HTTP 206 Partial Content لنطاقات Range للملفات قيد التنزيل', async () => {
    const testFile = path.join(tmpDir, 'stream-test.mp4');
    fs.writeFileSync(testFile, Buffer.alloc(1000, 77));

    const mockTask = {
      filePath: testFile,
      size: 5000,
      category: 'video'
    };

    let statusCode = null;
    const headers = {};

    const mockReq = {
      headers: { range: 'bytes=0-99' },
      on: () => {}
    };

    const mockRes = new PassThrough();
    mockRes.setHeader = (k, v) => { headers[k.toLowerCase()] = v; };
    mockRes.writeHead = (code, hdrs) => {
      statusCode = code;
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) {
          headers[k.toLowerCase()] = v;
        }
      }
    };

    MediaStreamer.serveTaskStream(mockTask, mockReq, mockRes);

    expect(statusCode).toBe(206);
    expect(headers['accept-ranges']).toBe('bytes');
    expect(headers['content-type']).toBe('video/mp4');
    expect(headers['content-range']).toBe('bytes 0-99/5000');
  });
});

describe('المرحلة 13.2 — تجديد الروابط المنتهية واستئناف البايتات (Refresh Expired Links)', () => {
  it('يقوم DownloadTask بتحديث الرابط دون فقدان البايتات أو المقاطع المحملة', () => {
    const task = new DownloadTask({
      url: 'https://cdn.example.com/expired_token_123/large.iso',
      dir: tmpDir,
      filename: 'large.iso'
    });

    task.received = 10485760; // 10MB
    task.size = 52428800; // 50MB
    task.status = 'failed';
    task.error = 'HTTP 403 Forbidden: Token Expired';

    const newUrl = 'https://cdn.example.com/fresh_token_999/large.iso';
    task.refreshUrl(newUrl);

    expect(task.url).toBe(newUrl);
    expect(task.finalUrl).toBe(newUrl);
    expect(task.received).toBe(10485760); // الحفاظ التام على البايتات السابقة
    expect(task.status).toBe('queued');
    expect(task.error).toBeNull();
  });

  it('يقوم DownloadEngine بتحديث الرابط وحفظه واستئنافه', () => {
    const db = new Database();
    const engine = new DownloadEngine(db);

    const res = engine.addTask({
      url: 'https://example.com/old.zip',
      filename: 'file.zip'
    });

    const taskId = res.task.id;
    const updated = engine.refreshTaskUrl(taskId, 'https://example.com/new.zip');
    expect(updated.url).toBe('https://example.com/new.zip');
    expect(engine.getTask(taskId).url).toBe('https://example.com/new.zip');
  });
});

describe('المرحلة 14.3 — إدارة الطوابير وإيقاف التشغيل التلقائي (Queue & Auto Shutdown)', () => {
  it('QueueManager يحفظ ويضبط إجراء ما بعد اكتمال التحميل', () => {
    const db = new Database();
    const engine = new DownloadEngine(db);
    const qm = new QueueManager(engine, db);

    expect(qm.autoShutdownAction).toBe('none');
    qm.setAutoShutdown('shutdown');
    expect(qm.autoShutdownAction).toBe('shutdown');

    qm.setAutoShutdown('sleep');
    expect(qm.autoShutdownAction).toBe('sleep');

    qm.dispose();
  });
});
