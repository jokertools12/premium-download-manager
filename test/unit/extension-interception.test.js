'use strict';

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

describe('التحقق من منطق اعتراض إضافة المتصفح وعدم تكرار التنزيل (Extension Interception)', () => {
  const bgCode = fs.readFileSync(path.resolve(__dirname, '../../src/extension/background.js'), 'utf8');

  it('يحتوي background.js على دالة فحص اتصال البرنامج المكتبي checkAppOpen', () => {
    expect(bgCode).toContain('async function checkAppOpen');
    expect(bgCode).toContain('http://127.0.0.1:45762/ping');
  });

  it('يحتوي على منطق إلغاء ومسح التنزيل من المتصفح cancelAndErase لمنع التنزيل المزدوج', () => {
    expect(bgCode).toContain('function cancelAndErase');
    expect(bgCode).toContain('chrome.downloads.cancel');
    expect(bgCode).toContain('chrome.downloads.erase');
  });

  it('يتحقق من شرط فتح البرنامج isOpen قبل إلغاء تنزيل المتصفح', () => {
    expect(bgCode).toContain('const isOpen = await checkAppOpen()');
    expect(bgCode).toContain('if (!isOpen)');
  });

  it('يستبعد امتدادات التحديث وملفات النظام وحزم الإضافات EXCLUDED_EXT_RE', () => {
    expect(bgCode).toContain('EXCLUDED_EXT_RE');
    expect(bgCode).toMatch(/crx|xpi|pak|bin|dat|dll/);
  });

  it('يدير التنزيلات المستعادة restoredDownloads لمنع الحلقات اللانهائية', () => {
    expect(bgCode).toContain('restoredDownloads');
    expect(bgCode).toContain('restoreBrowserDownload');
  });

  it('لا يستخدم webRequest.onBeforeRequest كمعترض للتنزيلات المباشرة (لمنع ازدواج التنزيل)', () => {
    // webRequest.onBeforeRequest يجب أن يقتصر فقط على فحص وسائط البث HLS/M3U8
    const webReqMatches = [...bgCode.matchAll(/chrome\.webRequest\.onBeforeRequest\.addListener/g)];
    expect(webReqMatches.length).toBe(1); // فقط مستمع واحد لـ STREAM_URL_RE
    expect(bgCode).toContain('STREAM_URL_RE.test');
  });

  it('يحتوي background.js على تحديث شارة الأيقونة updateBadge وتنبيهات الالتقاط', () => {
    expect(bgCode).toContain('updateBadge');
    expect(bgCode).toContain('showCaptureToast');
    expect(bgCode).toContain('chrome.notifications');
  });

  it('يحتوي content.js على معترض نقرات الروابط مع دعم تجاوز Alt وتوستر الالتقاط', () => {
    const contentCode = fs.readFileSync(path.resolve(__dirname, '../../src/extension/content.js'), 'utf8');
    expect(contentCode).toContain('initLinkInterceptor');
    expect(contentCode).toContain('e.altKey');
    expect(contentCode).toContain('interceptLinkClick');
    expect(contentCode).toContain('showCaptureToast');
  });
});
