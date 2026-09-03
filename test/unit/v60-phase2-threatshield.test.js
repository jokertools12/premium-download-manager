'use strict';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import ThreatShield from '../../src/main/engine/ThreatShield.js';

describe('المرحلة 2: درع الأمان التلقائي ومكافحة التهديدات الفورية (Zero-Day Threat Shield & Safe Sandbox 6.0)', () => {
  const tmpDir = path.join(process.cwd(), 'scratch', 'threat_test');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) {}
  });

  it('يحسب بصمة SHA-256 بدقة للملفات', async () => {
    const shield = new ThreatShield();
    const testFile = path.join(tmpDir, 'sample.txt');
    fs.writeFileSync(testFile, 'Hello Premium DM Security Shield');

    const hash = await shield.computeHash(testFile);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(64); // SHA-256 = 64 hex characters
  });

  it('يكتشف الملفات السليمة ويصنفها كـ Safe', async () => {
    const shield = new ThreatShield();
    const safeDoc = path.join(tmpDir, 'document.txt');
    fs.writeFileSync(safeDoc, 'Clean and safe content');

    const scan = await shield.scanFile(safeDoc);
    expect(scan.isSafe).toBe(true);
    expect(scan.riskLevel).toBe('safe');
  });

  it('يكتشف الملفات التنفيذية (.exe) ويطلق تحذيراً أمنياً للمستخدم', async () => {
    const shield = new ThreatShield();
    const exeFile = path.join(tmpDir, 'installer.exe');
    fs.writeFileSync(exeFile, 'Fake executable payload');

    const scan = await shield.scanFile(exeFile);
    expect(scan.riskLevel).toBe('warning');
    expect(scan.isSafe).toBe(false);
    expect(scan.reasons.some(r => r.includes('ملف تنفيذي'))).toBe(true);
  });

  it('يكتشف التهديدات الحرجة وتزوير الامتدادات (Spoofed Executable disguised as MP4)', async () => {
    const shield = new ThreatShield();
    const spoofedFile = path.join(tmpDir, 'movie.mp4');
    // هيدر MZ الخاص بملفات الويندوز التنفيذية
    const buf = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00]);
    fs.writeFileSync(spoofedFile, buf);

    const scan = await shield.scanFile(spoofedFile);
    expect(scan.riskLevel).toBe('danger');
    expect(scan.isSafe).toBe(false);
    expect(scan.magicType).toBe('PE_EXECUTABLE');
    expect(scan.reasons.some(r => r.includes('تزوير امتداد'))).toBe(true);
  });

  it('يعزل الملف المشبوه في الحجر الصحي ويستعيده عند الطلب', async () => {
    const quarantineDir = path.join(tmpDir, 'quarantine');
    const shield = new ThreatShield({ quarantineDir });
    const malwareFile = path.join(tmpDir, 'bad_script.bat');
    fs.writeFileSync(malwareFile, '@echo off\necho dangerous');

    // 1. العزل
    const qRes = await shield.quarantineFile(malwareFile);
    expect(qRes.quarantined).toBe(true);
    expect(fs.existsSync(malwareFile)).toBe(false);
    expect(fs.existsSync(qRes.quarantinePath)).toBe(true);

    // 2. الاستعادة
    const rRes = await shield.restoreFile(qRes.quarantinePath, malwareFile);
    expect(rRes.restored).toBe(true);
    expect(fs.existsSync(malwareFile)).toBe(true);
    expect(fs.existsSync(qRes.quarantinePath)).toBe(false);
  });
});
