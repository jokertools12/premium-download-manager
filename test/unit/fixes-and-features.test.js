'use strict';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir;
let sanitize;
let HashCalculator;
let ArchiveAutoExtractor;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-fixes-test-'));

  const namingMod = await import('../../src/main/engine/naming.js');
  sanitize = namingMod.sanitize;

  const hcMod = await import('../../src/main/engine/HashCalculator.js');
  HashCalculator = hcMod.default || hcMod;

  const aaeMod = await import('../../src/main/engine/ArchiveAutoExtractor.js');
  ArchiveAutoExtractor = aaeMod.default || aaeMod;
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) {}
});

describe('إصلاحات تعقيم أسماء الملفات (File Name Sanitization)', () => {
  it('يعقم محارف ويندوز غير المسموحة ويستبدلها بـ _', () => {
    expect(sanitize('report:2026/01*final?.pdf')).toBe('report_2026_01_final_.pdf');
    expect(sanitize('../../dangerous<script>.exe')).toBe('dangerous_script_.exe');
    expect(sanitize('valid-file_name.zip')).toBe('valid-file_name.zip');
  });
});

describe('أداة حساب ومطابقة التجزئة (HashCalculator)', () => {
  it('يحسب MD5 و SHA-1 و SHA-256 لملف بنجاح', async () => {
    const testFile = path.join(tmpDir, 'hash-sample.txt');
    fs.writeFileSync(testFile, 'Premium Download Manager Test Content');

    const hashes = await HashCalculator.compute(testFile);
    expect(hashes.size).toBe(37);
    expect(hashes.sha256).toBeTypeOf('string');
    expect(hashes.sha256.length).toBe(64);
    expect(hashes.md5).toBeTypeOf('string');
    expect(hashes.md5.length).toBe(32);

    const verified = await HashCalculator.verify(testFile, hashes.sha256, 'sha256');
    expect(verified.match).toBe(true);

    const badVerify = await HashCalculator.verify(testFile, 'wronghash123', 'sha256');
    expect(badVerify.match).toBe(false);
  });
});

describe('فك الضغط التلقائي (ArchiveAutoExtractor)', () => {
  it('يتجاهل الملفات غير المضغوطة أو عند تعطيل الإعداد', async () => {
    const mockDb = {
      getSettings: () => ({ autoExtract: false })
    };
    const extractor = new ArchiveAutoExtractor(null, mockDb);

    const resDisabled = await extractor.handleTask({
      filePath: path.join(tmpDir, 'file.zip'),
      category: 'compressed'
    });
    expect(resDisabled).toBeNull();

    mockDb.getSettings = () => ({ autoExtract: true });
    const resNotArchive = await extractor.handleTask({
      filePath: path.join(tmpDir, 'video.mp4'),
      category: 'video'
    });
    expect(resNotArchive).toBeNull();
  });
});

describe('التنظيف الذكي وخلاصات RSS (SmartCleanup & RSS)', () => {
  it('يكتشف الملفات المكررة والمؤقتة بنجاح عبر SmartCleanup', async () => {
    const scMod = await import('../../src/main/ai/SmartCleanup.js');
    const SmartCleanup = scMod.default || scMod;

    const fileA = path.join(tmpDir, 'duplicate-target.mp4');
    fs.writeFileSync(fileA, '1234567890');
    const tempFile = path.join(tmpDir, 'broken-stream.pdm-part');
    fs.writeFileSync(tempFile, 'partial data');

    const mockDb = {
      getTasks: () => [
        { id: 't1', filename: 'duplicate-target.mp4', filePath: fileA, status: 'completed', size: 10, ts: Date.now() - (40 * 86400000) },
        { id: 't2', filename: 'duplicate-target.mp4', filePath: fileA, status: 'completed', size: 10, ts: Date.now() }
      ],
      getHistory: () => [],
      getSettings: () => ({ downloadDir: tmpDir })
    };

    const sc = new SmartCleanup({ db: mockDb });
    const res = sc.analyze(30);
    expect(res.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(res.suggestions.some(s => s.reason === 'temp_leftover')).toBe(true);
  });

  it('يدير خلاصات RSS بنجاح دون أخطاء', async () => {
    const rssMod = await import('../../src/main/integrations/RssFeedManager.js');
    const RssFeedManager = rssMod.default || rssMod;

    const settingsData = { rssFeeds: [] };
    const mockDb = {
      getSettings: () => settingsData,
      updateSettings: (p) => { Object.assign(settingsData, p); return settingsData; }
    };

    const rss = new RssFeedManager({ engine: null, db: mockDb });
    expect(rss.getFeeds()).toEqual([]);

    const feed = rss.addFeed({ url: 'https://example.com/rss.xml', title: 'Test Feed' });
    expect(feed.id).toBeTypeOf('string');
    expect(rss.getFeeds().length).toBe(1);

    rss.removeFeed(feed.id);
    expect(rss.getFeeds().length).toBe(0);
  });
});

