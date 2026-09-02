'use strict';

/* إضافة مثال مدمجة: تسجيل اكتمال وفشل التحميلات في سجل console
   نموذج لفهم نظام الإضافات — انظر docs/PLUGINS.md */

module.exports = {
  name: 'مسجّل الأحداث',
  version: '1.0.0',
  description: 'يسجل اكتمال وفشل التحميلات في سجل التطبيق (مثال تعليمي)',

  init(ctx) {
    ctx.log('الإضافة المثال تعمل ✓');
    ctx.onTaskCompleted(t => ctx.log('✓ اكتمل:', t.filename || t.url));
    ctx.onTaskFailed(t => ctx.log('✗ فشل:', t.filename || t.url, '-', t.error || ''));
  }
};