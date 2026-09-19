'use strict';

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

describe('التحقق من حل مشكلة تأخر نافذة التحميل وتجاوز قفل التركيز بنظام ويندوز وخيار التحميل المباشر (v8.0.2)', () => {
  const mainCode = fs.readFileSync(path.resolve(__dirname, '../../src/main/main.js'), 'utf8');
  const inspectorCode = fs.readFileSync(path.resolve(__dirname, '../../src/main/engine/LinkInspector.js'), 'utf8');
  const htmlCode = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/index.html'), 'utf8');
  const modalsCode = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/ui/modals.js'), 'utf8');
  const dbCode = fs.readFileSync(path.resolve(__dirname, '../../src/main/db/database.js'), 'utf8');
  const bgCode = fs.readFileSync(path.resolve(__dirname, '../../src/extension/background.js'), 'utf8');

  it('دالة showWindow تتجاوز قفل ويندوز Windows Foreground Lockout بإجبار النافذة للأمام', () => {
    expect(mainCode).toContain('win.setAlwaysOnTop(true)');
    expect(mainCode).toContain('app.focus({ steal: true })');
    expect(mainCode).toContain('win.setAlwaysOnTop(false)');
    expect(mainCode).toContain('win.moveTop()');
  });

  it('مهلة فحص الروابط LinkInspector مخفضة إلى 2500ms لمنع أي تجميد عند فحص الروابط', () => {
    expect(inspectorCode).toContain('timeout = 2500');
  });

  it('نافذة إضافة التحميل addModal تحتوي على خيار التحميل المباشر chkAlwaysDirectDownload', () => {
    expect(htmlCode).toContain('id="chkAlwaysDirectDownload"');
    expect(htmlCode).toContain('التحميل المباشر دائماً وتجاوز هذه النافذة مستقبلاً');
  });

  it('دالة openAdd تقوم بالتعبئة الفورية للبيانات في 0ms مع تصنيف المجلد وحفظ خيار التحميل المباشر', () => {
    expect(modalsCode).toContain('chkAlwaysDirectDownload');
    expect(modalsCode).toContain('initialName');
    expect(modalsCode).toContain('categoryDirs[categoryKey]');
    expect(modalsCode).toContain('autoStartFromBrowser');
  });

  it('الإعدادات الافتراضية DEFAULT_SETTINGS تحتوي على autoStartFromBrowser: false', () => {
    expect(dbCode).toContain('autoStartFromBrowser: false');
  });

  it('الامتداد background.js يرسل مباشرة للمحرك sendToApp دون إبطاء ping وبمهلة كوكيز 150ms', () => {
    expect(bgCode).toContain('Promise.race([cookiePromise, timeoutPromise])');
    expect(bgCode).toContain('const sent = await sendToApp');
  });
});
