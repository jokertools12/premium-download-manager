'use strict';

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

describe('التحقق الشامل من منطق اعتراض الإضافة ومنع التنزيل المزدوج نهائياً (v8.0.0 Interception)', () => {
  const bgCode = fs.readFileSync(path.resolve(__dirname, '../../src/extension/background.js'), 'utf8');
  const contentCode = fs.readFileSync(path.resolve(__dirname, '../../src/extension/content.js'), 'utf8');
  const serverCode = fs.readFileSync(path.resolve(__dirname, '../../src/main/integrations/LocalServer.js'), 'utf8');

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

  it('يدير قائمة handledByAppUrls و restoredDownloads لمنع التكرار بأمان', () => {
    expect(bgCode).toContain('handledByAppUrls');
    expect(bgCode).toContain('restoredDownloads');
    expect(bgCode).toContain('restoreBrowserDownload');
  });

  it('يلغي شارة ON الخارجية من على أيقونة الإضافة لتظل نظيفة وفق رغبة المستخدم', () => {
    expect(bgCode).toContain("chrome.action.setBadgeText({ text: '' })");
    expect(bgCode).not.toContain("chrome.action.setBadgeText({ text: 'ON' })");
  });

  it('يحتوي content.js على منع التنزيل المزدوج e.preventDefault() ودعم تجاوز Alt وتوستر الإشعار', () => {
    expect(contentCode).toContain('initLinkInterceptor');
    expect(contentCode).toContain('e.preventDefault()');
    expect(contentCode).toContain('e.stopPropagation()');
    expect(contentCode).toContain('e.altKey');
    expect(contentCode).toContain('data-pdm-bypass');
    expect(contentCode).toContain('showPageToast');
  });

  it('يدعم LocalServer خيار نافذة تأكيد التحميل onAddPrompt وخيار autoStartFromBrowser', () => {
    expect(serverCode).toContain('onAddPrompt');
    expect(serverCode).toContain('autoStartFromBrowser');
    expect(serverCode).toContain('this.onFocus()');
  });
});
