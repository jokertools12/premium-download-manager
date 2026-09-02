'use strict';
/* =====================================================================
   خريطة أوامر IPC المركزية — المرجع الموثّق الوحيد لقناة `pdm`
   =====================================================================
   التوثيق:
   - العملية الرئيسية (main.js) تستقبل رسائل بنمط { cmd: 'اسم-الأمر', ...args }
     عبر ipcMain.on('pdm') وتردّ عبر event.sender.send('pdm', { cmd, ...payload }).
   - الهدف من هذا الملف: مرجع مركزي واحد (Single Source of Truth) لكل الأوامر،
     بحيث يُستخدم لاحقاً لتحويل الـ switch اليدوي إلى توجيه آلي (command map)
     دون تغيير بروتوكول القناة، مع JSDoc لكل أمر.
   - أي أمر جديد يُضاف هنا أولاً ثم في main.js.

   المخطط:    main  ←→  renderer (app.js / floating.js)
   القناة:    'pdm'
   شكل الرسالة: { cmd: string, ... }  والردود تتبع نفس الأمر مع حقول نتيجة.
   ===================================================================== */

/** @typedef {'queued'|'downloading'|'paused'|'completed'|'failed'|'canceled'} TaskStatus */

/**
 * أوامر يرسلها الـ Renderer إلى الـ Main
 * @type {Record<string, {desc: string, args?: string[], reply?: string}>}
 */
const RENDERER_COMMANDS = {
  /* --- التحكم بالمهام --- */
  'add':            { desc: 'إضافة رابط تحميل جديد', args: ['url', 'filename?', 'headers?', 'mirrors?', 'category?'] },
  'pause':          { desc: 'إيقاف مهمة مؤقتاً', args: ['id'] },
  'resume':         { desc: 'استئناف مهمة', args: ['id'] },
  'cancel':         { desc: 'إلغاء مهمة (مع خيار حذف الملف)', args: ['id', 'deleteFile?'] },
  'pauseAll':       { desc: 'إيقاف كل المهام النشطة' },
  'resumeAll':      { desc: 'استئناف كل المهام الموقوفة' },
  'clearFinished':  { desc: 'مسح المهام المكتملة والفاشلة من القائمة' },
  'removeTask':     { desc: 'إزالة مهمة من القائمة نهائياً', args: ['id'] },
  'openFile':       { desc: 'فتح الملف الناتج بالتطبيق الافتراضي', args: ['id'] },
  'showInFolder':   { desc: 'إظهار الملف في مجلده (Explorer)', args: ['id'] },

  /* --- الفيديو والتورنت --- */
  'videoInfo':      { desc: 'جلب معلومات فيديو عبر yt-dlp', args: ['url'] },
  'videoDownload':  { desc: 'تنزيل فيديو بجودة محددة', args: ['url', 'formatId?'] },
  'torrentAdd':     { desc: 'إضافة ماغنت/ملف تورنت عبر WebTorrent', args: ['magnet'] },
  'torrentFiles':   { desc: 'قائمة ملفات التورنت لاختيارها', args: ['infoHash'] },
  'torrentSelect':  { desc: 'تنزيل ملفات محددة من التورنت', args: ['infoHash', 'indexes'] },

  /* --- الإعدادات والبيانات --- */
  'getSettings':    { desc: 'قراءة كل الإعدادات', reply: 'settings' },
  'saveSettings':   { desc: 'حفظ تعديلات الإعدادات', args: ['patch'] },
  'pickFolder':     { desc: 'فتح حوار اختيار مجلد', reply: 'folder' },
  'exportData':     { desc: 'تصدير المهام/الإعدادات JSON', reply: 'json' },
  'importData':     { desc: 'استيراد نسخة JSON', args: ['json'] },

  /* --- النافذة والواجهة --- */
  'float':          { desc: 'إظهار/إخفاء النافذة العائمة' },
  'floatUpdate':    { desc: 'تحديث بيانات النافذة العائمة (سرعة/تقدم)', args: ['snapshot'] },
  'minimize':       { desc: 'تصغير النافذة' },
  'setTheme':       { desc: 'تطبيق الوضع الداكن/الفاتح', args: ['theme'] },
  'setLang':        { desc: 'تغيير لغة الواجهة', args: ['lang'] }
};

/**
 * أوامر ترسلها الـ Main إلى الـ Renderer (أحداث دفع)
 * @type {Record<string, {desc: string, payload?: string}>}
 */
const MAIN_EVENTS = {
  'init':       { desc: 'الحالة الأولية بعد التشغيل', payload: 'tasks[], settings, version' },
  'update':     { desc: 'تحديث لقطة مهمة (تقدم/سرعة/حالة)', payload: 'task snapshot' },
  'done':       { desc: 'اكتمال مهمة', payload: 'id' },
  'error':      { desc: 'خطأ عام يعرض للمستخدم', payload: 'message' },
  'clipboard':  { desc: 'رابط مكتشف في الحافظة (اقتراح إضافة)', payload: 'url' },
  'videoInfo':  { desc: 'نتيجة فحص الفيديو', payload: 'formats[]' },
  'torrentAdd': { desc: 'نتيجة إضافة تورنت + قائمة ملفاته', payload: 'infoHash, files[]' },
  'updateAvail':{ desc: 'توفر تحديث جديد للتطبيق', payload: 'version, url' }
};

/** الأوامر المجمعة حسب الفئة — للتوثيق والأدوات المستقبلية */
const IPC_MAP = { commands: RENDERER_COMMANDS, events: MAIN_EVENTS, channel: 'pdm' };

module.exports = IPC_MAP;
