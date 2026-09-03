'use strict';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir;
let Database;
let RuleEngine;
let ArchivePreview;
let SmartClassifier;
let RuleParser;
let DomainIntelligence;
let SmartCleanup;
let DuplicateDetector;
let MobileCompanion;
let RssFeedManager;
let CommunityRegistry;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-p2-test-'));
  process.env.APPDATA = tmpDir;

  ({ default: Database } = await import('../../src/main/db/database.js'));
  ({ default: RuleEngine } = await import('../../src/main/engine/RuleEngine.js'));
  ({ default: ArchivePreview } = await import('../../src/main/engine/ArchivePreview.js'));
  ({ default: SmartClassifier } = await import('../../src/main/ai/SmartClassifier.js'));
  ({ default: RuleParser } = await import('../../src/main/ai/RuleParser.js'));
  ({ default: DomainIntelligence } = await import('../../src/main/ai/DomainIntelligence.js'));
  ({ default: SmartCleanup } = await import('../../src/main/ai/SmartCleanup.js'));
  ({ default: DuplicateDetector } = await import('../../src/main/engine/DuplicateDetector.js'));
  ({ default: MobileCompanion } = await import('../../src/main/integrations/MobileCompanion.js'));
  ({ default: RssFeedManager } = await import('../../src/main/integrations/RssFeedManager.js'));
  ({ default: CommunityRegistry } = await import('../../src/main/plugins/CommunityRegistry.js'));
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) {}
});

describe('المرحلة 7.1 — المخطط العلائقي والاستعلامات المفهرسة', () => {
  it('إنشاء وحفظ المهام بأعمدة صريحة واستعلام مفهرس سريع', () => {
    const db = new Database();
    db.upsertTask({
      id: 't-rel-1',
      url: 'https://example.com/movie.mp4',
      filename: 'movie.mp4',
      status: 'downloading',
      category: 'video',
      size: 1048576,
      received: 524288,
      speed_avg: 120000
    });

    db.upsertTask({
      id: 't-rel-2',
      url: 'https://example.com/archive.zip',
      filename: 'archive.zip',
      status: 'completed',
      category: 'compressed',
      size: 204800,
      received: 204800
    });

    const videos = db.queryTasks({ category: 'video' });
    expect(videos.length).toBe(1);
    expect(videos[0].id).toBe('t-rel-1');
    expect(videos[0].category).toBe('video');

    const downloading = db.queryTasks({ status: 'downloading' });
    expect(downloading.length).toBe(1);
    expect(downloading[0].id).toBe('t-rel-1');

    const searchRes = db.queryTasks({ search: 'archive' });
    expect(searchRes.length).toBe(1);
    expect(searchRes[0].filename).toBe('archive.zip');
  });
});

describe('المرحلة 8.1 — معاينة الأرشيف عن بعد عبر ترويسات Central Directory', () => {
  it('تفكيك ترويسة Central Directory بشكل صحيح', () => {
    // بناء بافر ZIP مصغر حقيقي يحتوي على ملف واحد و EOCD
    const filename = 'test.txt';
    const nameBuf = Buffer.from(filename, 'utf8');

    // Central Directory File Header (46 bytes + name)
    const cdHeader = Buffer.alloc(46 + nameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0); // Signature
    cdHeader.writeUInt16LE(20, 4); // Version made by
    cdHeader.writeUInt16LE(20, 6); // Version needed
    cdHeader.writeUInt16LE(0, 8); // Flags
    cdHeader.writeUInt16LE(0, 10); // Method 0 (stored)
    cdHeader.writeUInt32LE(0, 12); // Time
    cdHeader.writeUInt32LE(0x12345678, 16); // CRC32
    cdHeader.writeUInt32LE(12, 20); // Compressed size
    cdHeader.writeUInt32LE(12, 24); // Uncompressed size
    cdHeader.writeUInt16LE(nameBuf.length, 28); // Name length
    cdHeader.writeUInt16LE(0, 30); // Extra field len
    cdHeader.writeUInt16LE(0, 32); // Comment len
    nameBuf.copy(cdHeader, 46);

    // EOCD (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // EOCD Signature
    eocd.writeUInt16LE(0, 4); // Disk number
    eocd.writeUInt16LE(0, 6); // Start disk
    eocd.writeUInt16LE(1, 8); // Total entries on disk
    eocd.writeUInt16LE(1, 10); // Total entries
    eocd.writeUInt32LE(cdHeader.length, 12); // CD size
    eocd.writeUInt32LE(100, 16); // CD offset (100)
    eocd.writeUInt16LE(0, 20); // Comment len

    const combined = Buffer.concat([cdHeader, eocd]);
    // نفترض أن bufferStartOffset هو 100
    const entries = ArchivePreview.parseCentralDirectory(combined, 100, 100 + combined.length);
    expect(entries.length).toBe(1);
    expect(entries[0].filename).toBe('test.txt');
    expect(entries[0].size).toBe(12);
    expect(entries[0].method).toBe('stored');
  });
});

describe('المرحلة 8.3 — محرك القواعد المركبة و Regex', () => {
  it('تطابق شروط مركبة AND للنطاق والامتداد والحجم', () => {
    const rule = {
      name: 'GitHub Releases Rule',
      enabled: true,
      operator: 'AND',
      conditions: [
        { domain: 'github.com' },
        { ext: 'zip,tar.gz' },
        { minSize: 1000000 }
      ],
      category: 'program',
      subDir: 'DevTools'
    };

    const task1 = { url: 'https://github.com/org/repo/release.zip', filename: 'release.zip', size: 5000000 };
    const task2 = { url: 'https://other.com/release.zip', filename: 'release.zip', size: 5000000 };
    const task3 = { url: 'https://github.com/org/repo/small.zip', filename: 'small.zip', size: 500 };

    const ctx1 = RuleEngine.extractContext(task1);
    const ctx2 = RuleEngine.extractContext(task2);
    const ctx3 = RuleEngine.extractContext(task3);

    expect(RuleEngine.matchesRule(rule, ctx1)).toBe(true);
    expect(RuleEngine.matchesRule(rule, ctx2)).toBe(false); // نطاق مختلف
    expect(RuleEngine.matchesRule(rule, ctx3)).toBe(false); // حجم أقل

    const applied = RuleEngine.applyRules(task1, [rule]);
    expect(applied.category).toBe('program');
    expect(applied.subDir).toBe('DevTools');
  });
});

describe('المرحلة 8.5 — كشف التكرار عبر السجل الكامل', () => {
  it('يكتشف الملف المكرر بالرابط أو بالاسم والحجم', () => {
    const db = new Database();
    db.addHistory({
      id: 'h-101',
      url: 'https://example.com/setup.exe',
      filename: 'setup.exe',
      size: 45000000,
      filePath: 'C:\\Downloads\\setup.exe',
      ts: Date.now() - 3600000
    });

    const detector = new DuplicateDetector(db);
    const dupUrl = detector.check({ url: 'https://example.com/setup.exe' });
    expect(dupUrl.isDuplicate).toBe(true);
    expect(dupUrl.filename).toBe('setup.exe');

    const dupName = detector.check({ url: 'https://mirror2.com/setup.exe', filename: 'setup.exe', size: 45000000 });
    expect(dupName.isDuplicate).toBe(true);

    const noDup = detector.check({ url: 'https://example.com/brand-new.iso', filename: 'brand-new.iso', size: 100 });
    expect(noDup.isDuplicate).toBe(false);
  });
});

describe('المرحلة 9.1 و 9.2 — الذكاء الاصطناعي Offline-first', () => {
  it('SmartClassifier يصنف الروابط بدون شبكة', () => {
    const classifier = new SmartClassifier();
    expect(classifier.classify('https://youtube.com/watch?v=123').category).toBe('video');
    expect(classifier.classify('https://cdn.example.com/song.opus').category).toBe('audio');
    expect(classifier.classify('https://files.com/book.pdf?token=abc').category).toBe('document');
    expect(classifier.classify('https://example.com/data.tar.gz').category).toBe('compressed');
  });

  it('RuleParser يترجم أوامر اللغة الطبيعية بالعربية والإنجليزية', () => {
    const r1 = RuleParser.parse('حوّل ملفات zip إلى مجلد الأرشيف');
    expect(r1).toBeTruthy();
    expect(r1.conditions[0].ext).toBe('zip');
    expect(r1.subDir).toBe('الأرشيف');

    const r2 = RuleParser.parse('save mp4 files larger than 500mb to Movies');
    expect(r2).toBeTruthy();
    expect(r2.conditions.some(c => c.ext === 'mp4')).toBe(true);
    expect(r2.conditions.some(c => c.minSize > 500000000)).toBe(true);
    expect(r2.subDir).toBe('Movies');
  });

  it('DomainIntelligence يتعلم الاتصالات المثلى عند حدوث 429', () => {
    const db = new Database();
    const di = new DomainIntelligence(db);
    const d = 'strict-server.com';

    // افتراضياً 16
    expect(di.getOptimalConnections(d)).toBe(16);

    // الخادم أرجع 429 (Throttle)
    di.recordAttempt(d, { statusCode: 429 });
    expect(di.getOptimalConnections(d)).toBeLessThan(16);
  });

  it('SmartCleanup يحلل الملفات القديمة والمؤقتة دون حذف تلقائي', () => {
    const db = new Database();
    const cleanup = new SmartCleanup({ db });
    const res = cleanup.analyze(30);
    expect(Array.isArray(res.suggestions)).toBe(true);
    expect(typeof res.totalReclaimableBytes).toBe('number');
  });
});

describe('المرحلة 10 — بيئة الموبايل والسحابة', () => {
  it('MobileCompanion يولد رمز أمان محلي ورابط إقران صحيح', () => {
    const mc = new MobileCompanion({ port: 45762 });
    expect(mc.token).toBeTruthy();
    expect(mc.validateToken(mc.token)).toBe(true);
    expect(mc.validateToken('wrong-token')).toBe(false);

    const url = mc.getPairingUrl();
    expect(url).toContain('http://');
    expect(url).toContain(':45762/mobile?token=');

    const svg = mc.generateQrSvg();
    expect(svg).toContain('<svg');
  });
});

describe('المرحلة 12 — متجر الإضافات المجتمعية', () => {
  it('CommunityRegistry يوفر قائمة إضافات موثقة بالـ SHA-256', async () => {
    const reg = new CommunityRegistry({ pluginsDir: path.join(tmpDir, 'community-test') });
    const catalogue = await reg.getCatalogue();
    expect(catalogue.length).toBeGreaterThan(0);
    expect(catalogue[0].sha256).toBeTruthy();
  });
});
