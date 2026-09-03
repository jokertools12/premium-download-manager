'use strict';

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('المرحلة 5: فاحص الروابط الذكي والتصنيف التلقائي (Smart Link Inspector & AI Auto-Classifier)', () => {
  it('LinkInspector.parseContentDisposition: يستخرج الأسماء العربية والإنجليزية وفق معايير RFC 5987 / 6266', async () => {
    const LinkInspector = (await import('../../src/main/engine/LinkInspector.js')).default ||
      (await import('../../src/main/engine/LinkInspector.js'));

    // 1. اختبار UTF-8 مع ترميز النسب المئوية (RFC 5987)
    const utf8Header = "attachment; filename*=UTF-8''%D9%85%D8%B3%D8%AA%D9%86%D8%AF%20%D9%85%D9%87%D9%85.pdf";
    expect(LinkInspector.parseContentDisposition(utf8Header)).toBe('مستند مهم.pdf');

    // 2. اختبار الاسم المقتبس العادي
    const quotedHeader = 'attachment; filename="Release-v5.0.0-Setup.exe"';
    expect(LinkInspector.parseContentDisposition(quotedHeader)).toBe('Release-v5.0.0-Setup.exe');

    // 3. اختبار الاسم بدون علامات تنصيص
    const rawHeader = 'inline; filename=archive_2026.zip';
    expect(LinkInspector.parseContentDisposition(rawHeader)).toBe('archive_2026.zip');

    // 4. ترويسة فارغة
    expect(LinkInspector.parseContentDisposition(null)).toBeNull();
  });

  it('LinkInspector.detectCategory: يصنف الملفات بدقة حسب نوع MIME والامتداد', async () => {
    const LinkInspector = (await import('../../src/main/engine/LinkInspector.js')).default ||
      (await import('../../src/main/engine/LinkInspector.js'));

    // تصنيف عبر MIME
    expect(LinkInspector.detectCategory({ filename: 'file', mime: 'video/mp4' })).toBe('video');
    expect(LinkInspector.detectCategory({ filename: 'file', mime: 'audio/mpeg' })).toBe('audio');
    expect(LinkInspector.detectCategory({ filename: 'file', mime: 'application/pdf' })).toBe('document');
    expect(LinkInspector.detectCategory({ filename: 'file', mime: 'application/zip' })).toBe('compressed');
    expect(LinkInspector.detectCategory({ filename: 'file', mime: 'application/x-msdownload' })).toBe('program');

    // تصنيف عبر الامتداد
    expect(LinkInspector.detectCategory({ filename: 'movie.mkv', mime: '' })).toBe('video');
    expect(LinkInspector.detectCategory({ filename: 'song.flac', mime: '' })).toBe('audio');
    expect(LinkInspector.detectCategory({ filename: 'document.epub', mime: '' })).toBe('document');
    expect(LinkInspector.detectCategory({ filename: 'backup.7z', mime: '' })).toBe('compressed');
    expect(LinkInspector.detectCategory({ filename: 'installer.msi', mime: '' })).toBe('program');
    expect(LinkInspector.detectCategory({ filename: 'unknown.xyz', mime: '' })).toBe('other');
  });

  it('LinkInspector.checkSecurity: يكتشف الملفات التنفيذية المحتملة ويضع شارة التحذير المناسبة', async () => {
    const LinkInspector = (await import('../../src/main/engine/LinkInspector.js')).default ||
      (await import('../../src/main/engine/LinkInspector.js'));

    const safeDoc = LinkInspector.checkSecurity('document.pdf');
    expect(safeDoc.isExecutable).toBe(false);
    expect(safeDoc.securityRisk).toBe('safe');
    expect(safeDoc.badge).toContain('آمن');

    const exe = LinkInspector.checkSecurity('setup.exe');
    expect(exe.isExecutable).toBe(true);
    expect(exe.securityRisk).toBe('warning');
    expect(exe.badge).toContain('ملف تنفيذي');

    const script = LinkInspector.checkSecurity('run.bat');
    expect(script.isExecutable).toBe(true);
    expect(script.securityRisk).toBe('warning');
  });

  it('LinkInspector.inspect: يعيد كائناً تحليلياً متكاملاً حتى عند تعذر الاتصال بالخادم', async () => {
    const LinkInspector = (await import('../../src/main/engine/LinkInspector.js')).default ||
      (await import('../../src/main/engine/LinkInspector.js'));

    const insp = new LinkInspector();
    // فحص رابط محلي غير متصل
    const res = await insp.inspect('http://127.0.0.1:59999/download/tutorial_2026.mp4');
    expect(res).toBeDefined();
    expect(res.filename).toBe('tutorial_2026.mp4');
    expect(res.category).toBe('video');
    expect(res.categoryName).toBe('فيديو وسينما');
    expect(res.securityRisk).toBe('safe');
  });

  it('index.html: يحتوي على بطاقة الفحص الذكي والشارات addInspectCard', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/index.html'), 'utf8');
    expect(html).toContain('id="addInspectCard"');
    expect(html).toContain('id="inspCategory"');
    expect(html).toContain('id="inspSize"');
    expect(html).toContain('id="inspResumable"');
    expect(html).toContain('id="inspSecurity"');
    expect(html).toContain('id="inspFilename"');
    expect(html).toContain('id="inspMime"');
  });
});
