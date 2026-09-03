'use strict';
/* =====================================================================
   خريطة أوامر وقنوات IPC المركزية — المرجع الموثّق للقنوات النمطية (المرحلة 7.2)
   ===================================================================== */

const MODULAR_CHANNELS = {
  tasks: {
    'tasks:list': { desc: 'جلب قائمة المهام الحالية', reply: 'Task[]' },
    'tasks:query': { desc: 'استعلام مفهرس فائق السرعة يدعم الفرز والبحث والتقسيم', args: ['status?', 'category?', 'search?', 'limit?', 'offset?', 'sortBy?', 'sortDir?'], reply: 'Task[]' },
    'tasks:add': { desc: 'إضافة رابط تنزيل جديد مع التحقق وكشف التكرار والتصنيف الذكي والقواعد', args: ['url', 'filename?', 'category?', 'headers?', 'mirrors?', 'checksum?'], reply: 'Task | { isDuplicate, duplicateInfo }' },
    'tasks:pause': { desc: 'إيقاف مهمة مؤقتاً', args: ['id'] },
    'tasks:resume': { desc: 'استئناف مهمة موقوفة', args: ['id'] },
    'tasks:pauseAll': { desc: 'إيقاف كل المهام' },
    'tasks:resumeAll': { desc: 'استئناف كل المهام' },
    'tasks:cancel': { desc: 'إلغاء مهمة', args: ['id', 'deleteFile?'] },
    'tasks:remove': { desc: 'حذف مهمة من القائمة', args: ['id'] },
    'tasks:restart': { desc: 'إعادة بدء تحميل من الصفر', args: ['id'] },
    'tasks:clearCompleted': { desc: 'مسح كل المهام المكتملة' }
  },
  settings: {
    'settings:get': { desc: 'قراءة الإعدادات كاملة', reply: 'Settings' },
    'settings:set': { desc: 'تحديث جزئي للإعدادات وتطبيقها فورياً', args: ['patch'], reply: 'Settings' },
    'settings:chooseDir': { desc: 'فتح حوار اختيار مجلد الحفظ', reply: 'string | null' }
  },
  history: {
    'history:get': { desc: 'جلب سجل التحميلات الكامل (آخر 1000 عملية)', reply: 'HistoryEntry[]' },
    'history:clear': { desc: 'مسح سجل التحميلات كاملاً' },
    'history:remove': { desc: 'حذف عنصر محدد من السجل', args: ['id'] }
  },
  archive: {
    'archive:preview': { desc: 'معاينة محتويات أرشيف ZIP عن بعد عبر طلبات Range دون تنزيل كامل', args: ['url', 'headers?'], reply: '{ supported, totalSize, files[] }' }
  },
  ai: {
    'ai:categorize': { desc: 'تصنيف ذكي محلي خفيف للرابط استناداً إلى النطاق والامتداد ومسار URL', args: ['url', 'headers?'], reply: '{ category, confidence, reason }' },
    'ai:parseRule': { desc: 'تحليل جملة باللغة الطبيعية (عربي / إنجليزي) وتحويلها لقاعدة توجيه', args: ['text'], reply: 'Rule' },
    'ai:suggestCleanup': { desc: 'تحليل السجل والملفات واقتراح خطة تنظيف ذكية غير تدميرية', args: ['olderThanDays?'], reply: '{ suggestions[], totalReclaimableBytes }' },
    'ai:executeCleanup': { desc: 'تنفيذ حذف الملفات التي وافق عليها المستخدم صراحة', args: ['filePaths[]'], reply: '{ deletedCount, freedBytes }' },
    'ai:domainStats': { desc: 'إحصائيات سلوك الخوادم وتعلم الاتصالات المثلى', reply: 'Record<domain, Stats>' }
  },
  mobile: {
    'mobile:status': { desc: 'حالة خادم الموبايل المحلي ورابط الإقران', reply: '{ available, pairingUrl, token, localIp }' },
    'mobile:qrCode': { desc: 'توليد كود QR SVG خفيف للإقران الفوري', reply: '{ svg, url }' },
    'mobile:rotateToken': { desc: 'توليد رمز أمان جديد وإلغاء الجلسات السابقة', reply: 'string' }
  },
  rss: {
    'rss:list': { desc: 'قائمة خلاصات RSS/Atom المشترك بها', reply: 'RssFeed[]' },
    'rss:add': { desc: 'إضافة خلاصة جديدة مع فلتر تنزيل تلقائي', args: ['url', 'title?', 'filterRegex?', 'category?'], reply: 'RssFeed' },
    'rss:remove': { desc: 'حذف اشتراك خلاصة', args: ['id'] },
    'rss:check': { desc: 'فحص فوري لخلاصة معينة وتنزيل جديدها', args: ['id'], reply: '{ count, total }' }
  },
  plugins: {
    'plugins:list': { desc: 'عرض الإضافات وحالة تفعيلها ونزاهة توقيعها', reply: 'Plugin[]' },
    'plugins:toggle': { desc: 'تفعيل أو تعطيل إضافة مع فحص الأمان', args: ['id', 'enabled', 'forceUntrusted?'] },
    'plugins:verify': { desc: 'فحص توقيع وسلامة إضافة محددة عبر SHA-256', args: ['id'], reply: 'VerifyResult' },
    'plugins:community': { desc: 'تصفح سجل متجر الإضافات المجتمعية المعتمدة', reply: 'CommunityPlugin[]' },
    'plugins:install': { desc: 'تثبيت إضافة مجتمعية والتحقق من بصمتها', args: ['id'] },
    'plugins:uninstall': { desc: 'إزالة إضافة مجتمعية مثبتة', args: ['id'] }
  },
  telemetry: {
    'telemetry:status': { desc: 'حالة التيليمتري وخيار الموافقة الصريحة للمستخدم', reply: '{ optedIn, needsPrompt }' },
    'telemetry:setOptIn': { desc: 'تعديل خيار الموافقة على التيليمتري', args: ['enabled'] },
    'telemetry:logs': { desc: 'عرض سجلات الأخطاء والانهيارات المحلية المعقمة', reply: 'CrashLog[]' }
  }
};

const LEGACY_CHANNEL = 'pdm';

module.exports = {
  channels: MODULAR_CHANNELS,
  legacyChannel: LEGACY_CHANNEL
};
