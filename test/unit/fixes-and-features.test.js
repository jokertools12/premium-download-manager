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
