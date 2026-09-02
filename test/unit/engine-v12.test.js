'use strict';
/* اختبارات المرحلة v1.2 «محرك من فئة عالمية»:
   2.1 الاتصالات التكيفية  2.2 المجموع الاختباري + إصلاح المقاطع
   2.4 FTP + Basic Auth  2.5 التسمية الذكية  2.6 التخصيص المسبق */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import DownloadTask from '../../src/main/engine/DownloadTask.js';
import { parseChecksum, normalizeChecksum, computeFileHash, verifyFile } from '../../src/main/engine/checksum.js';
import { expandTemplate, uniquifyPath } from '../../src/main/engine/naming.js';
import { FtpTask, isFtpUrl, parseFtpUrl } from '../../src/main/protocols/ftp.js';
import { findTool, EXTRACTABLE } from '../../src/main/engine/extract.js';

/* ---------- أدوات ---------- */
function makeBuf(size) {
  const b = Buffer.alloc(size);
  let seed = 987654321;
  for (let i = 0; i < size; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    b[i] = seed & 0xff;
  }
  return b;
}

function waitFor(task, statuses, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const check = snap => { if (statuses.includes(snap.status)) { cleanup(); resolve(snap); } };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`مهلة انتظار ${statuses.join('/')} — الحالة: ${task.snapshot().status} خطأ: ${task.snapshot().error}`));
    }, timeoutMs);
    const cleanup = () => { clearTimeout(timer); task.off('updated', check); };
    task.on('updated', check);
    check(task.snapshot());
  });
}

const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const sha256File = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

/* ---------- خادم محلي ---------- */
const DATA = makeBuf(6 * 1024 * 1024); // 6MB → 6 مقاطع
const DATA_SHA = sha256(DATA);
let server, BASE, TMP;
let corruptNext = false; // إتلاف أول طلب بيانات (لاختبار الإصلاح)

beforeAll(async () => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-v12-'));
  server = http.createServer((req, res) => {
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = m ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : DATA.length - 1;
      let slice = DATA.subarray(start, end + 1);
      const isProbe = start === 0 && end === 0;
      if (!isProbe && corruptNext) {
        corruptNext = false;
        slice = Buffer.from(slice);
        slice[0] ^= 0xff;
        slice[slice.length - 1] ^= 0xff;
      }
      res.writeHead(206, {
        'content-type': 'application/octet-stream',
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${DATA.length}`,
        'content-length': slice.length
      });
      return res.end(slice);
    }
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': DATA.length,
      'accept-ranges': 'bytes'
    });
    res.end(DATA);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(r => server.close(r));
  fs.rmSync(TMP, { recursive: true, force: true });
});

/* ---------- 2.2 وحدوياً: checksum.js ---------- */
describe('checksum.js — تحليل المجموع الاختباري (2.2)', () => {
  it('parseChecksum يقبل الصيغ الشائعة ويرفض الرديئة', () => {
    expect(parseChecksum('sha256:abcdef1234567890')).toEqual({ algo: 'sha256', hash: 'abcdef1234567890' });
    expect(parseChecksum('md5 abcdef1234567890abcdef1234567890')).toEqual({ algo: 'md5', hash: 'abcdef1234567890abcdef1234567890' });
    expect(parseChecksum('SHA-512=' + 'ab'.repeat(64))).toEqual({ algo: 'sha512', hash: 'ab'.repeat(64) });
    expect(parseChecksum('sha1:too_short')).toBeNull();
    expect(parseChecksum('not-a-checksum')).toBeNull();
    expect(parseChecksum('')).toBeNull();
  });

  it('normalizeChecksum يوحّد النص والكائن', () => {
    expect(normalizeChecksum('sha256:' + 'ab'.repeat(32))).toEqual({ algo: 'sha256', hash: 'ab'.repeat(32) });
    expect(normalizeChecksum({ algo: 'SHA-1', hash: 'AB'.repeat(20) })).toEqual({ algo: 'sha1', hash: 'ab'.repeat(20) });
    expect(normalizeChecksum({ algo: 'crc32', hash: 'abcdef12' })).toBeNull();
    expect(normalizeChecksum(null)).toBeNull();
  });

  it('computeFileHash و verifyFile على ملف حقيقي', async () => {
    const p = path.join(TMP, 'hash-test.bin');
    const content = makeBuf(65432);
    fs.writeFileSync(p, content);
    const expected = sha256(content);
    expect(await computeFileHash(p, 'sha256')).toBe(expected);
    expect(await verifyFile(p, 'sha256', expected.toUpperCase())).toBe(true); // غير حساس لحالة الأحرف
    expect(await verifyFile(p, 'sha256', '0'.repeat(64))).toBe(false);
    expect(await verifyFile(p + '.nonexistent', 'sha256', expected)).toBe(false);
  });
});

/* ---------- 2.5 التسمية الذكية ---------- */
describe('naming.js — قوالب التسمية (2.5)', () => {
  const now = new Date(2026, 1, 9, 14, 5, 9); // 2026-02-09 14:05:09
  const ctx = {
    now, url: 'https://www.example.com/files/setup.exe',
    name: 'setup.exe', ext: 'exe', category: 'program'
  };

  it('يوسّع كل الرموز المدعومة', () => {
    expect(expandTemplate('{date}_{site}_{name}.{ext}', ctx)).toBe('20260209_example.com_setup.exe');
    expect(expandTemplate('{category}_{date}_{time}_{name}', ctx)).toBe('program_20260209_140509_setup.exe');
    expect(expandTemplate('{index}-{name}', { ...ctx, index: 7 })).toBe('7-setup.exe');
  });

  it('يتعامل مع الاسم بلا امتداد والرموز المجهولة والقالب الفارغ', () => {
    expect(expandTemplate('{name}_x{unknown}', { ...ctx, name: 'file', ext: '' })).toBe('file_x');
    expect(expandTemplate('', ctx)).toBe('setup.exe');
    expect(expandTemplate('{name}', { url: 'not a url', name: 'a.zip', ext: 'zip' })).toBe('a.zip');
  });

  it('uniquifyPath يحل تعارض الأسماء', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-name-'));
    try {
      fs.writeFileSync(path.join(dir, 'f.bin'), 'x');
      expect(await uniquifyPath(dir, 'new.bin')).toBe('new.bin'); // غير موجود
      expect(await uniquifyPath(dir, 'f.bin')).toBe('f (1).bin');
      fs.writeFileSync(path.join(dir, 'f (1).bin'), 'x');
      expect(await uniquifyPath(dir, 'f.bin')).toBe('f (2).bin');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ---------- 2.1 الاتصالات التكيفية ---------- */
describe('DownloadTask — الاتصالات التكيفية (2.1)', () => {
  it('_splitLargest يقسم الأكبر مع تغطية كاملة بلا فجوات ولا تداخل', () => {
    const t = new DownloadTask({ id: 'x', url: `${BASE}/data.bin`, dir: TMP, filename: 's.bin', maxConnections: 4 });
    t.segments = [{ start: 0, end: 3 * 1024 * 1024 - 1, received: 0, done: false }];
    expect(t._splitLargest()).toBe(true);
    expect(t.segments.length).toBe(2);
    const [a, b] = t.segments;
    expect(a.start).toBe(0);
    expect(b.end).toBe(3 * 1024 * 1024 - 1);
    expect(b.start).toBe(a.end + 1); // لا فجوة ولا تداخل
    expect(a.end - a.start + 1).toBeGreaterThanOrEqual(1024 * 1024);
    expect(b.end - b.start + 1).toBeGreaterThanOrEqual(1024 * 1024);
    // مقطع صغير لا يُقسم
    t.segments = [{ start: 0, end: 1000, received: 0, done: false }];
    expect(t._splitLargest()).toBe(false);
    // مقطع مشغول لا يُقسم (حماية الطلب الجاري)
    t.segments = [{ start: 0, end: 3 * 1024 * 1024 - 1, received: 0, done: false, _busy: true }];
    expect(t._splitLargest()).toBe(false);
  });

  it('_pickSegment يختار الأكبر متبقياً ولا يكرر المقاطع المشغولة', () => {
    const t = new DownloadTask({ id: 'y', url: `${BASE}/data.bin`, dir: TMP, filename: 'p.bin' });
    t.segments = [
      { start: 0, end: 100, received: 0, done: false },
      { start: 101, end: 500, received: 0, done: false },
      { start: 501, end: 600, received: 0, done: true }
    ];
    const first = t._pickSegment();
    expect(first.start).toBe(101);
    expect(first._busy).toBe(true);
    const second = t._pickSegment();
    expect(second.start).toBe(0);
    expect(t._pickSegment()).toBeNull();
  });

  it('_adapt يوسّع عند أداء ممتاز ويخفض عند اختناق', () => {
    const t = new DownloadTask({ id: 'z', url: `${BASE}/data.bin`, dir: TMP, filename: 'a.bin', maxConnections: 8 });
    t.size = 8 * 1024 * 1024;
    t.supportsRanges = true;
    t.segments = [{ start: 0, end: t.size - 1, received: 0, done: false }];
    t._workerCount = 2;
    t._desiredConns = 2;
    let spawned = 0;
    const spawn = () => { spawned++; };

    // أداء ممتاز لكل اتصال → توسيع (تقسيم + spawn)
    t._adaptHist = [3 * 1024 * 1024, 3 * 1024 * 1024];
    t.speed = 3 * 1024 * 1024;
    t._adapt(spawn);
    expect(t._desiredConns).toBe(3);
    expect(spawned).toBe(1);
    expect(t.segments.length).toBe(2);

    // اختناق: سرعة/اتصال متدنية وثابتة → خفض
    t._adaptHist = [40 * 1024, 40 * 1024];
    t.speed = 40 * 1024;
    t._desiredConns = 4;
    t._workerCount = 4;
    t._controllers.add(new AbortController());
    t._adapt(spawn);
    expect(t._desiredConns).toBe(3);
  });

  it('تحميل تكاملي صحيح عبر محرك العمال الجديد (سلامة البايتات)', async () => {
    const task = new DownloadTask({
      id: 'adapt-int', url: `${BASE}/data.bin`, dir: TMP,
      filename: 'adapt.bin', maxConnections: 8
    });
    task.start();
    const snap = await waitFor(task, ['completed', 'failed']);
    expect(snap.status).toBe('completed');
    expect(sha256File(path.join(TMP, 'adapt.bin'))).toBe(DATA_SHA);
  });
});

/* ---------- 2.2 تكاملياً: التحقق والإصلاح ---------- */
describe('DownloadTask — المجموع الاختباري تكاملياً (2.2)', () => {
  it('مجموع صحيح → يكتمل ويُحفظ في الحالة', async () => {
    const task = new DownloadTask({
      id: 'ck-ok', url: `${BASE}/data.bin`, dir: TMP, filename: 'ck-ok.bin',
      checksum: `sha256:${DATA_SHA}`, maxConnections: 2
    });
    task.start();
    const snap = await waitFor(task, ['completed', 'failed']);
    expect(snap.status).toBe('completed');
    expect(snap.checksum).toEqual({ algo: 'sha256', hash: DATA_SHA });
  });

  it('محتوى تالف على القرص → يُصلح المقطع المتأثر فقط ويكتمل', async () => {
    corruptNext = true;
    const task = new DownloadTask({
      id: 'ck-fix', url: `${BASE}/data.bin`, dir: TMP, filename: 'ck-fix.bin',
      checksum: { algo: 'sha256', hash: DATA_SHA }, maxConnections: 2
    });
    task.start();
    const snap = await waitFor(task, ['completed', 'failed'], 45000);
    expect(snap.status).toBe('completed');
    expect(sha256File(path.join(TMP, 'ck-fix.bin'))).toBe(DATA_SHA);
  });

  it('مجموع خاطئ → فشل فوري برسالة واضحة بلا إعادة محاولات', async () => {
    const task = new DownloadTask({
      id: 'ck-bad', url: `${BASE}/data.bin`, dir: TMP, filename: 'ck-bad.bin',
      checksum: `sha256:${'0'.repeat(64)}`, maxConnections: 2
    });
    task.start();
    const snap = await waitFor(task, ['completed', 'failed']);
    expect(snap.status).toBe('failed');
    expect(snap.error).toContain('المجموع الاختباري');
  });
});

/* ---------- 2.6 التخصيص المسبق ---------- */
describe('DownloadTask — التخصيص المسبق للحجم (2.6)', () => {
  it('الملف يشغل حجمة الكامل على القرص منذ بدء التحميل', async () => {
    const task = new DownloadTask({
      id: 'prealloc', url: `${BASE}/data.bin`, dir: TMP,
      filename: 'prealloc.bin', maxConnections: 2
    });
    // انتظر تقدماً فعلياً في الكتابة
    await new Promise((resolve, reject) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (task.received > 512 * 1024) { clearInterval(iv); resolve(); }
        else if (Date.now() - t0 > 20000) { clearInterval(iv); reject(new Error('لا تقدم في التحميل')); }
      }, 100);
      task.start();
    });
    const filePath = path.join(TMP, 'prealloc.bin');
    expect(fs.statSync(filePath).size).toBe(DATA.length); // حجز كامل الحجم مسبقاً
    const snap = await waitFor(task, ['completed', 'failed']);
    expect(snap.status).toBe('completed');
    expect(fs.statSync(filePath).size).toBe(DATA.length);
    expect(sha256File(filePath)).toBe(DATA_SHA);
  });
});

/* ---------- 2.4 FTP ---------- */
describe('protocols/ftp.js — تحليل الروابط (2.4)', () => {
  it('isFtpUrl يميز FTP/FTPS فقط', () => {
    expect(isFtpUrl('ftp://host/file.bin')).toBe(true);
    expect(isFtpUrl('FTPS://host/file.bin')).toBe(true);
    expect(isFtpUrl('https://host/file.bin')).toBe(false);
  });

  it('parseFtpUrl يستخرج المضيف والمنفذ وبيانات الدخول والمسار', () => {
    const p = parseFtpUrl('ftp://user:p%40ss@files.example.com:2121/pub/dir/file.zip');
    expect(p.host).toBe('files.example.com');
    expect(p.port).toBe(2121);
    expect(p.user).toBe('user');
    expect(p.password).toBe('p@ss');
    expect(p.secure).toBe(false);
    expect(p.remotePath).toBe('/pub/dir/file.zip');
    const s = parseFtpUrl('ftps://host/f.bin');
    expect(s.secure).toBe(true);
    expect(s.port).toBe(990);
  });

  it('FtpTask: دخول مجهول افتراضياً وواجهة موحدة مع بقية المهام', () => {
    const t = new FtpTask({ id: 'ftp1', url: 'ftp://host/pub/data.bin', dir: TMP });
    expect(t._parsed.user).toBe('anonymous');
    expect(t.snapshot().kind).toBe('ftp');
    expect(t.resumeState()).toBeNull();
    t.received = 100;
    expect(t.resumeState()).toEqual({
      url: 'ftp://host/pub/data.bin', filename: 'data.bin',
      dir: TMP, size: null, received: 100, ftp: true
    });
  });
});

/* ---------- 2.4 WebDAV/HTTP Basic Auth ---------- */
describe('DownloadTask — Basic Auth من الرابط (2.4)', () => {
  it('يشتق ترويسة Authorization من user:pass@', () => {
    const t = new DownloadTask({
      id: 'ba', url: 'http://john:secret@dav.example.com/file.bin', dir: TMP, filename: 'ba.bin'
    });
    expect(t.headers.authorization).toBe('Basic ' + Buffer.from('john:secret').toString('base64'));
  });

  it('يحترم ترويسة يدوية موجودة', () => {
    const t = new DownloadTask({
      id: 'ba2', url: 'http://john:secret@dav.example.com/f.bin', dir: TMP, filename: 'ba2.bin',
      headers: { authorization: 'Bearer token123' }
    });
    expect(t.headers.authorization).toBe('Bearer token123');
  });
});

/* ---------- 2.3 فك الأرشيف ---------- */
describe('extract.js — كشف الأدوات (2.3)', () => {
  it('الامتدادات القابلة للفك صحيحة', () => {
    expect(EXTRACTABLE.has('.zip')).toBe(true);
    expect(EXTRACTABLE.has('.rar')).toBe(true);
    expect(EXTRACTABLE.has('.7z')).toBe(true);
    expect(EXTRACTABLE.has('.exe')).toBe(false);
  });

  it('findTool يعمل حتى بلا أدوات مثبتة (بيئة CI)', () => {
    const tool = findTool('.7z');
    if (tool) expect(['7z', 'winrar']).toContain(tool.kind);
    else expect(tool).toBeNull();
  });
});