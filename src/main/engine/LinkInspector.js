'use strict';

const path = require('path');

/* خريطة امتدادات الملفات حسب التصنيف */
const CATEGORY_EXTS = {
  video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp', 'ts', 'vob'],
  audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus', 'mid', 'amr'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'raw', 'heic'],
  document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'epub', 'mobi', 'csv', 'md'],
  compressed: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'cab', 'tgz'],
  program: ['exe', 'msi', 'apk', 'dmg', 'pkg', 'deb', 'rpm', 'appx', 'jar', 'bat', 'cmd', 'vbs', 'scr']
};

/* خريطة أنواع MIME المباشرة */
const MIME_CATEGORIES = [
  { prefix: 'video/', category: 'video' },
  { prefix: 'audio/', category: 'audio' },
  { prefix: 'image/', category: 'image' },
  { prefix: 'application/pdf', category: 'document' },
  { prefix: 'application/msword', category: 'document' },
  { prefix: 'application/vnd.openxmlformats', category: 'document' },
  { prefix: 'application/zip', category: 'compressed' },
  { prefix: 'application/x-rar', category: 'compressed' },
  { prefix: 'application/x-7z', category: 'compressed' },
  { prefix: 'application/x-tar', category: 'compressed' },
  { prefix: 'application/gzip', category: 'compressed' },
  { prefix: 'application/x-msdownload', category: 'program' },
  { prefix: 'application/x-executable', category: 'program' }
];

const CATEGORY_NAMES_AR = {
  video: 'فيديو وسينما',
  audio: 'صوتيات وموسيقى',
  image: 'صور وتصاميم',
  document: 'مستندات وكتب',
  compressed: 'أرشيف مضغوط',
  program: 'برامج وتطبيقات',
  other: 'ملفات عامة'
};

/* استخراج اسم الملف من ترويسة Content-Disposition بمعايير RFC 5987 / 6266 */
function parseContentDisposition(disposition) {
  if (!disposition) return null;
  const s = String(disposition);

  // 1. فحص ترميز UTF-8 المعياري: filename*=UTF-8''%D9%85...
  const starMatch = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i.exec(s);
  if (starMatch && starMatch[1]) {
    try {
      return decodeURIComponent(starMatch[1].trim().replace(/^['"]|['"]$/g, ''));
    } catch (_e) {}
  }

  // 2. فحص الاسم القياسي: filename="file.ext"
  const quotedMatch = /filename\s*=\s*"([^"]+)"/i.exec(s);
  if (quotedMatch && quotedMatch[1]) {
    try { return decodeURIComponent(escape(quotedMatch[1])); } catch (_e) { return quotedMatch[1]; }
  }

  // 3. فحص الاسم بدون علامات تنصيص
  const rawMatch = /filename\s*=\s*([^;,\s]+)/i.exec(s);
  if (rawMatch && rawMatch[1]) {
    try { return decodeURIComponent(escape(rawMatch[1])); } catch (_e) { return rawMatch[1]; }
  }

  return null;
}

/* استنتاج اسم الملف وتطهيره من الرابط */
function cleanFilenameFromUrl(url) {
  try {
    const u = new URL(url);
    let raw = decodeURIComponent(u.pathname.split('/').pop() || '');
    raw = raw.replace(/[\\/:*?"<>|\r\n]+/g, '_').trim();
    if (raw && /\.[a-z0-9]{1,8}$/i.test(raw)) return raw;
  } catch (_e) {}
  return '';
}

function detectCategory({ filename = '', mime = '' }) {
  const cleanMime = String(mime || '').toLowerCase().trim();
  for (const m of MIME_CATEGORIES) {
    if (cleanMime.startsWith(m.prefix)) return m.category;
  }

  const ext = (path.extname(filename || '') || '').toLowerCase().replace('.', '');
  for (const [cat, exts] of Object.entries(CATEGORY_EXTS)) {
    if (exts.includes(ext)) return cat;
  }

  return 'other';
}

function checkSecurity(filename) {
  const ext = (path.extname(filename || '') || '').toLowerCase().replace('.', '');
  const dangerous = ['exe', 'msi', 'bat', 'cmd', 'vbs', 'scr', 'pif', 'com', 'jar'];
  if (dangerous.includes(ext)) {
    return {
      isExecutable: true,
      securityRisk: 'warning',
      badge: '⚠️ ملف تنفيذي'
    };
  }
  return {
    isExecutable: false,
    securityRisk: 'safe',
    badge: '🛡️ آمن'
  };
}

class LinkInspector {
  /**
   * فحص عميق للرابط قبل البدء: استخراج الاسم الحقيقي، الحجم، الاستئناف، والتصنيف الذكي
   */
  async inspect(url, { headers = {}, timeout = 12000 } = {}) {
    const targetUrl = String(url || '').trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      throw new Error('رابط غير صالح');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const reqHeaders = {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'accept': '*/*',
      ...headers
    };

    let res = null;
    let finalUrl = targetUrl;
    let method = 'HEAD';

    try {
      // 1. محاولة فحص سريع عبر HEAD
      try {
        res = await fetch(targetUrl, {
          method: 'HEAD',
          headers: reqHeaders,
          signal: controller.signal,
          redirect: 'follow'
        });
        if (res.url) finalUrl = res.url;
      } catch (_headErr) {
        // بعض الخوادم ترفض HEAD (405 أو 403)، نتراجع إلى Range GET
        res = null;
      }

      // 2. إذا فشل HEAD أو أعاد خطأ، نجلب أول بايت عبر GET مع Range
      if (!res || !res.ok || res.status === 405 || res.status === 403) {
        method = 'GET';
        res = await fetch(targetUrl, {
          method: 'GET',
          headers: { ...reqHeaders, range: 'bytes=0-0' },
          signal: controller.signal,
          redirect: 'follow'
        });
        if (res.url) finalUrl = res.url;
      }

      clearTimeout(timer);

      // استخراج الترويسات
      const cDisp = res.headers.get('content-disposition');
      const cType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const acceptRanges = res.headers.get('accept-ranges');
      const cRange = res.headers.get('content-range');
      const cLen = res.headers.get('content-length');

      // حساب الحجم الحقيقي
      let size = null;
      if (cRange) {
        const m = /\/(\d+)$/.exec(cRange);
        if (m) size = parseInt(m[1], 10);
      }
      if (!size && cLen && res.status !== 206) {
        size = parseInt(cLen, 10);
      }

      // دعم الاستئناف (Resumability)
      const resumable = (acceptRanges === 'bytes') || (res.status === 206) || Boolean(cRange);

      // استخراج اسم الملف
      let filename = parseContentDisposition(cDisp) || cleanFilenameFromUrl(finalUrl) || cleanFilenameFromUrl(targetUrl) || 'download';
      filename = filename.replace(/[\\/:*?"<>|\r\n]+/g, '_').trim();

      // التصنيف الذكي
      const category = detectCategory({ filename, mime: cType });
      const categoryName = CATEGORY_NAMES_AR[category] || 'عام';

      // فحص الأمان
      const security = checkSecurity(filename);

      return {
        ok: true,
        url: targetUrl,
        finalUrl,
        status: res.status,
        method,
        filename,
        size: (typeof size === 'number' && !isNaN(size) && size > 0) ? size : null,
        resumable,
        contentType: cType || 'application/octet-stream',
        category,
        categoryName,
        ...security
      };
    } catch (err) {
      clearTimeout(timer);
      // في حال تعذر الاتصال بالخادم، نقوم بتخمين ذكي محلي دون تعطيل المستخدم
      const fallbackName = cleanFilenameFromUrl(targetUrl) || 'download';
      const fallbackCategory = detectCategory({ filename: fallbackName });
      return {
        ok: false,
        error: String(err && err.message) || 'تعذر الاتصال بالخادم',
        url: targetUrl,
        finalUrl: targetUrl,
        filename: fallbackName,
        size: null,
        resumable: true,
        contentType: 'unknown',
        category: fallbackCategory,
        categoryName: CATEGORY_NAMES_AR[fallbackCategory] || 'عام',
        ...checkSecurity(fallbackName)
      };
    }
  }
}

LinkInspector.CATEGORY_EXTS = CATEGORY_EXTS;
LinkInspector.CATEGORY_NAMES_AR = CATEGORY_NAMES_AR;
LinkInspector.parseContentDisposition = parseContentDisposition;
LinkInspector.detectCategory = detectCategory;
LinkInspector.checkSecurity = checkSecurity;

module.exports = LinkInspector;
