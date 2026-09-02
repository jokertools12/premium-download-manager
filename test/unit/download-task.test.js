'use strict';
/* اختبارات تكامل محرك التحميل DownloadTask ضد خادم HTTP محلي حقيقي.
   يغطي: تحميل كامل، تقسيم Segments، استئناف من حالة محفوظة،
   المصادر البديلة (Mirrors)، حماية 403 مع Referer تلقائي،
   واستخراج اسم الملف من Content-Disposition. */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import DownloadTask from '../../src/main/engine/DownloadTask.js';

/* ---------- أدوات ---------- */

function makeBuf(size) {
  const b = Buffer.alloc(size);
  let seed = 123456789;
  for (let i = 0; i < size; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    b[i] = seed & 0xff;
  }
  return b;
}

const SMALL = makeBuf(300 * 1024);          // 300KB
const BIG = makeBuf(2621440);               // 2.5MB — ينتج جزأين مع MIN_SEGMENT=1MB
const BIG_SHA = crypto.createHash('sha256').update(BIG).digest('hex');
const SMALL_SHA = crypto.createHash('sha256').update(SMALL).digest('hex');

let server, BASE, TMP;

beforeAll(async () => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-engine-'));
  server = http.createServer((req, res) => {
    const p = req.url.split('?')[0];

    if (p === '/bad') { res.writeHead(404, { 'content-length': 9 }); return res.end('not found'); }

    if (p === '/protected') {
      const ref = req.headers.referer || '';
      if (!ref.startsWith('http://' + (req.headers.host || '') + '/')) {
        res.writeHead(403, { 'content-length': 7 });
        return res.end('hotlink');
      }
    }

    const buf = p === '/small.bin' || p === '/nofile.bin' ? SMALL : BIG;
    const cd = p === '/cd'
      ? { 'content-disposition': 'attachment; filename="renamed file.bin"' }
      : {};
    const range = req.headers.range;

    // /nofile.bin لا يعلن دعم Range إطلاقاً (خادم بسيط)
    if (range && p !== '/nofile.bin') {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = m ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : buf.length - 1;
      const slice = buf.subarray(start, end + 1);
      res.writeHead(206, {
        'content-type': 'application/octet-stream',
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${buf.length}`,
        'content-length': slice.length,
        ...cd
      });
      return res.end(slice);
    }

    const headers = {
      'content-type': 'application/octet-stream',
      'content-length': buf.length,
      ...cd
    };
    if (p !== '/nofile.bin') headers['accept-ranges'] = 'bytes';
    res.writeHead(200, headers);
    res.end(buf);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(r => server.close(r));
  fs.rmSync(TMP, { recursive: true, force: true });
});

function waitFor(task, statuses, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const check = snap => { if (statuses.includes(snap.status)) { cleanup(); resolve(snap); } };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`مهلة انتظار ${statuses.join('/')} — آخر حالة: ${task.snapshot().status}`));
    }, timeoutMs);
    const cleanup = () => { clearTimeout(timer); task.off('updated', check); };
    task.on('updated', check);
    check(task.snapshot());
  });
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

/* ---------- الاختبارات ---------- */

describe('DownloadTask (خادم HTTP محلي)', () => {
  it('يحمّل ملفاً كاملاً باتصال واحد بدون دعم Range', async () => {
    const task = new DownloadTask({
      id: 't1', url: `${BASE}/nofile.bin`, dir: TMP, filename: 'single.bin'
    });
    task.start();
    const snap = await waitFor(task, ['completed', 'failed']);
    expect(snap.status).toBe('completed');
    expect(snap.size).toBe(SMALL.length);
    expect(sha256File(snap.filePath)).toBe(SMALL_SHA);
  });

  it('يقسّم الملف الكبير إلى مقاطع ويدعم Range', async () => {
    const task = new DownloadTask({
      id: 't2', url: `${BASE}/file.bin`, dir: TMP, filename: 'multi.bin', maxConnections: 2
    });
    task.start();
    const snap = await waitFor(task, ['completed', 'failed']);
    expect(snap.status).toBe('completed');
    expect(snap.segments.length).toBe(2);
    expect(snap.segments.every(s => s.done)).toBe(true);
    expect(sha256File(snap.filePath)).toBe(BIG_SHA);
  });

  it('يستأنف من حالة محفوظة (نصف الملف موجود مسبقاً)', async () => {
    const filename = 'resume.bin';
    const half = Math.floor(BIG.length / 2);
    const partial = path.join(TMP, filename);
    fs.writeFileSync(partial, BIG.subarray(0, half));

    const savedState = {
      url: `${BASE}/file.bin`,
      finalUrl: `${BASE}/file.bin`,
      filename,
      dir: TMP,
      size: BIG.length,
      supportsRanges: true,
      headers: {},
      mirrors: [],
      segments: [{ start: 0, end: BIG.length - 1, received: half, done: false }]
    };

    const task = new DownloadTask({
      id: 't3', url: `${BASE}/file.bin`, dir: TMP, filename, maxConnections: 2
    });
    task.start(savedState);
    const snap = await waitFor(task, ['completed', 'failed']);
    expect(snap.status).toBe('completed');
    expect(snap.received).toBe(BIG.length);
    expect(sha256File(partial)).toBe(BIG_SHA);
  });

  it('يتجاوز المصدر الميت تلقائياً إلى Mirror', async () => {
    const task = new DownloadTask({
      id: 't4', url: `${BASE}/bad`, dir: TMP, filename: 'mirror.bin',
      mirrors: [`${BASE}/file.bin`]
    });
    task.start();
    const snap = await waitFor(task, ['completed', 'failed']);
    expect(snap.status).toBe('completed');
    expect(sha256File(snap.filePath)).toBe(BIG_SHA);
  });

  it('يتعامل مع حماية 403 عبر Referer تلقائي مشتق', async () => {
    const task = new DownloadTask({
      id: 't5', url: `${BASE}/protected`, dir: TMP, filename: 'protected.bin'
    });
    task.start();
    const snap = await waitFor(task, ['completed', 'failed']);
    expect(snap.status).toBe('completed');
    expect(sha256File(snap.filePath)).toBe(BIG_SHA);
  });

  it('يستخرج اسم الملف من Content-Disposition', async () => {
    const task = new DownloadTask({ id: 't6', url: `${BASE}/cd`, dir: TMP });
    task.start();
    const snap = await waitFor(task, ['completed', 'failed']);
    expect(snap.status).toBe('completed');
    expect(snap.filename).toBe('renamed file.bin');
    expect(snap.received).toBe(BIG.length);
  });

  it('resumeState يحفظ كل المقاطع ويستعيدها بدقة', () => {
    const task = new DownloadTask({
      id: 't7', url: `${BASE}/file.bin`, dir: TMP, filename: 'state.bin',
      maxConnections: 2
    });
    // محاكاة توزيع مقاطع يدوياً
    task.size = BIG.length;
    task.supportsRanges = true;
    task.segments = [
      { start: 0, end: 1048575, received: 4096, done: false },
      { start: 1048576, end: BIG.length - 1, received: BIG.length - 1048576, done: true }
    ];
    task.received = task.segments.reduce((a, s) => a + s.received, 0);
    const st = task.resumeState();
    expect(st.size).toBe(BIG.length);
    expect(st.supportsRanges).toBe(true);
    expect(st.segments.length).toBe(2);
    expect(st.segments[0].received).toBe(4096);
    expect(st.segments[1].done).toBe(true);
    // snapshot يطابق
    const snap = task.snapshot();
    expect(snap.received).toBe(4096 + (BIG.length - 1048576));
    expect(snap.segments[1].done).toBe(true);
  });
});

