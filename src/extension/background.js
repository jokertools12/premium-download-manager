'use strict';

// يعترض تحميلات المتصفح ويرسلها إلى Premium Download Manager
const HOST = 'com.premiumdm.host';

chrome.downloads.onCreated.addListener(async item => {
  if (!item || !item.url) return;
  // نتجاهل روابط الحزم الداخلية والصفحات الفارغة
  if (/^(blob:|data:|about:)/i.test(item.url)) return;

  const msg = {
    url: item.finalUrl || item.url,
    filename: (item.filename || '').split(/[\\/]/).pop() || undefined,
    referrer: item.referrer || undefined,
    size: item.totalBytes > 0 ? item.totalBytes : undefined
  };

  // نحاول الإرسال أولاً؛ فقط إذا نجح نلغي تحميل المتصفح
  let ok = false;
  try {
    await chrome.runtime.sendNativeMessage(HOST, msg);
    ok = true;
  } catch (_e) {
    // البرنامج غير مثبت/غير مسجل — نترك المتصفح يكمل تحميله بشكل طبيعي
  }
  if (ok && item.state && item.state !== 'interrupted' && !item.paused) {
    try { chrome.downloads.cancel(item.id, () => {}); } catch (_e) {}
  }
});
