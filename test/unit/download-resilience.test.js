'use strict';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let DownloadTask;
let tmpDir;
let server;
let serverPort;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-resilience-'));
  ({ default: DownloadTask } = await import('../../src/main/engine/DownloadTask.js'));

  // إنشاء خادم HTTP تجريبي يحاكي استجابات الخوادم المتنوعة
  server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${serverPort}`);

    if (url.pathname === '/no-range') {
      // خادم بدون Accept-Ranges يعيد 200 فقط
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': '1024'
      });
      res.end(Buffer.alloc(1024, 'A'));
      return;
    }

    if (url.pathname === '/reject-range') {
      // خادم يرفض طلبات النطاق بـ 416 لكن يقبل GET العادي بـ 200
      if (req.headers.range) {
        res.writeHead(416, { 'content-range': 'bytes */100' });
        res.end();
        return;
      }
      res.writeHead(200, {
        'content-type': 'application/zip',
        'content-length': '512'
      });
      res.end(Buffer.alloc(512, 'Z'));
      return;
    }

    if (url.pathname === '/utf8-name') {
      // خادم يعيد اسم ملف مشفر بـ RFC 5987
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-disposition': "attachment; filename*=UTF-8''%D9%83%D8%AA%D8%A7%D8%A8.pdf",
        'content-length': '256'
      });
      res.end(Buffer.alloc(256, 'P'));
      return;
    }

    if (url.pathname === '/hotlink-protected') {
      // خادم يطلب Referer مطابق
      const ref = req.headers.referer || '';
      if (!ref.includes('127.0.0.1') && !ref.includes('localhost')) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('Forbidden: Hotlink protection');
        return;
      }
      res.writeHead(200, {
        'content-type': 'application/zip',
        'content-length': '128'
      });
      res.end(Buffer.alloc(128, 'H'));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) {}
});

describe('اختبارات متانة محرك التنزيل (Download Engine Resilience)', () => {
  it('الارتداد التلقائي للاتصال الفردي عند غياب Accept-Ranges', async () => {
    const task = new DownloadTask({
      url: `http://127.0.0.1:${serverPort}/no-range`,
      dir: tmpDir,
      filename: 'test-no-range.bin'
    });

    const info = await task._probe();
    expect(info.size).toBe(1024);
    expect(info.ranges).toBe(false);
  });

  it('الارتداد الذكي عند رفض الخادم طلب النطاق برمز 416', async () => {
    const task = new DownloadTask({
      url: `http://127.0.0.1:${serverPort}/reject-range`,
      dir: tmpDir,
      filename: 'test-reject.zip'
    });

    const info = await task._probe();
    expect(info.size).toBe(512);
    expect(info.ranges).toBe(false);
  });

  it('فك تشفير أسماء الملفات العربية المشفرة بـ RFC 5987', async () => {
    const task = new DownloadTask({
      url: `http://127.0.0.1:${serverPort}/utf8-name`,
      dir: tmpDir
    });

    const info = await task._probe();
    expect(info.filename).toBe('كتاب.pdf');
  });

  it('التجاوز التلقائي لحماية Hotlink 403 عبر اشتقاق Referer تلقائياً', async () => {
    const task = new DownloadTask({
      url: `http://127.0.0.1:${serverPort}/hotlink-protected`,
      dir: tmpDir
    });

    const info = await task._probe();
    expect(info.size).toBe(128);
    expect(task.headers.referer).toBeTruthy();
  });
});
