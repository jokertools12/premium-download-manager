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
  'add':            { desc: 'إضافة رابط تحميل جديد (HTTP/S أو FTP/FTPS)', args: ['url', 'filename?', 'headers?', 'mirrors?', 'category?', 'referer?', 'checksum? ("sha256:..." | "md5:...")'] },
  'pause':          { desc: 'إيقاف مهمة مؤقتاً', args: ['id'] },
  'resume':         { desc: 'استئناف مهمة', args: ['id'] },
  'cancel':         { desc: 'إلغاء مهمة (مع خيار حذف الملف)', args: ['id', 'deleteFile?'] },
  'pauseAll':       { desc: 'إيقاف كل المهام النشطة' },
  'resumeAll':      { desc: 'استئناف كل المهام الموقوفة' },
  'clearFinished':  { desc: 'مسح المهام المكتملة والفاشلة من القائمة' },
  'removeTask':     { desc: 'إزالة مهمة من القائمة نهائياً', args: ['id'] },
  'openFile':       { desc: 'فتح الملف الناتج بالتطبيق الافتراضي', args: ['id'] },
  'showInFolder':   { desc: 'إظهار الملف في مجلده (Explorer)', args: ['id'] },
  'openPath':       { desc: 'فتح ملف بمساره المباشر (من المعاينة/السجل)', args: ['path'] },
  'revealPath':     { desc: 'إظهار ملف بمساره المباشر في المجلد', args: ['path'] },
  'getHistory':     { desc: 'سجل التحميل الكامل (آخر 1000 عملية)', args: [] },
  'clearHistory':   { desc: 'مسح سجل التحميل بالكامل', args: [] },
  'removeHistory':  { desc: 'حذف مدخلة واحدة من السجل', args: ['id'] },
  'float:dropUrl':  { desc: 'سحب رابط إلى النافذة العائمة — يفتح الرئيسية ويقترح الرابط', args: ['url'] },

  /* --- الفيديو والتورنت --- */
  'video:probe':       { desc: 'فحص رابط فيديو/قائمة تشغيل عبر yt-dlp', args: ['url'] },
  'video:download':    { desc: 'تنزيل فيديو — يدعم: formatId، audioOnly (MP3)، subtitles، clipStart/clipEnd (قص)، mergeOutput (mp4/mkv)، playlist/items', args: ['url', 'formatId?', 'audioOnly?', 'subtitles?', 'clipStart?', 'clipEnd?', 'mergeOutput?', 'playlist?', 'items?'] },
  'video:cancel':      { desc: 'إلغاء مهمة فيديو/قائمة تشغيل', args: ['id'] },
  'video:extractAudio': { desc: 'استخراج صوت MP3 من فيديو مكتمل (ffmpeg — عملية خلفية ببطاقة تقدم)', args: ['id'] },
  'grab:scan':      { desc: 'Site Grabber: جلب صفحة واستخراج صور/فيديوهات/ملفات', args: ['url'] },
  'exportData':     { desc: 'تصدير نسخة احتياطية JSON (إعدادات + مهام + سجل + إحصاء)', args: [] },
  'importData':     { desc: 'استيراد نسخة احتياطية JSON ودمجها', args: [] },
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
