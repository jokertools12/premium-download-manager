'use strict';

/* Premium DM Extension v8.0.1 — Professional Download Interception:
   1) Startup Guard: Block unwanted auto-downloads on browser launch.
   2) Exclude internal browser extensions (pak, bin, dat, dll).
   3) Exclude official update domains for Chrome, Edge, and Firefox.
   4) Smart Interception: Intercept downloads only when desktop app is open.
   5) Cancel & Erase browser download so files are never downloaded twice.
   6) Sniffer & Floating Widget: Capture video/HLS/M3U8 streams.
   7) Right-click: Context menu quick options.
   8) Cookie & Session Forwarding: Authenticated downloads support.
   9) Daily Stats: Track download count and size per day. */

const HOST = 'com.premiumdm.host';
const EXT_BOOT_TIME = Date.now();

const DEFAULTS = {
  enabled: true,
  minSizeMB: 0,
  ignoredSites: [],
  startupGuard: true,
  showVideoWidget: true
};

let settings = { ...DEFAULTS };

/* عناوين تم استعادتها لتنزيلها في المتصفح بأمان */
const restoredDownloads = new Set();

chrome.storage.sync.get(DEFAULTS, s => { settings = { ...DEFAULTS, ...s }; });
chrome.storage.onChanged.addListener(ch => {
  if (ch.pdmSettings) settings = { ...DEFAULTS, ...ch.pdmSettings.newValue };
});

/* نطاقات داخلية وتحديثات المتصفح التي لا يجوز اعتراضها أبدًا */
const INTERNAL_DOMAINS = [
  'google.com', 'googleapis.com', 'gvt1.com', 'gvt2.com', 'gstatic.com',
  'microsoft.com', 'live.com', 'windowsupdate.com', 'msftconnecttest.com',
  'mozilla.org', 'mozilla.net', 'firefox.com', 'services.mozilla.com',
  'edge.activity.windows.com', 'edge.microsoft.com', 'brave.com'
];

/* امتدادات ملفات التحديث وحزم الإضافات المستبعدة نهائياً من الاعتراض */
const EXCLUDED_EXT_RE = /\.(crx|xpi|pak|bin|dat|dll)$/i;

/* ===== أدوات مساعدة وفحص حالة تشغيل البرنامج المكتبي ===== */
let appConnected = false;
let lastAppCheck = 0;

function updateBadge(_isOpen) {
  try {
    // إزالة شارة ON الخارجية تماماً وفق رغبة المستخدم وحصر المؤشر داخل واجهة الـ Popup فقط
    chrome.action.setBadgeText({ text: '' });
  } catch (_e) {}
}

async function checkAppOpen(forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && (now - lastAppCheck) < 2000) {
    return appConnected;
  }
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 600);
    const res = await fetch('http://127.0.0.1:45762/ping', { method: 'GET', signal: ctl.signal });
    clearTimeout(timer);
    const data = await res.json().catch(() => null);
    appConnected = !!(data && data.ok);
  } catch (_e) {
    appConnected = false;
  }
  lastAppCheck = now;
  updateBadge(appConnected);
  return appConnected;
}

// فحص دوري كل 3 ثوانٍ لمعرفة هل البرنامج مفتوح أم لا
checkAppOpen(true);
setInterval(() => { checkAppOpen(true); }, 3000);

function isIgnored(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (INTERNAL_DOMAINS.some(d => host === d || host.endsWith('.' + d))) {
      return true;
    }
    return (settings.ignoredSites || []).some(s => host.includes(String(s).toLowerCase()));
  } catch (_e) { return false; }
}

function badge(_text, _color = '#4f8cff') {
  // تم إلغاء الشارة الخارجية لتظل أيقونة المتصفح نظيفة دائماً
  try { chrome.action.setBadgeText({ text: '' }); } catch (_e) {}
}

async function getCookiesForUrl(url) {
  try {
    if (!chrome.cookies || !chrome.cookies.getAll) return '';
    const cookies = await chrome.cookies.getAll({ url });
    if (!cookies || !cookies.length) return '';
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  } catch (_e) {
    return '';
  }
}

async function httpSend(endpoint, body = null, method = 'POST') {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1800);
    const opts = {
      method,
      headers: { 'content-type': 'application/json' },
      signal: ctl.signal
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`http://127.0.0.1:45762${endpoint}`, opts);
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json().catch(() => ({ ok: true }));
  } catch (_e) { return null; }
}

async function sendToApp(msg) {
  if (msg && msg.url) {
    if (!msg.cookies) {
      msg.cookies = await getCookiesForUrl(msg.url);
    }
    if (!msg.userAgent && typeof navigator !== 'undefined') {
      msg.userAgent = navigator.userAgent;
    }
  }

  let ok = false;
  try {
    const r = await httpSend('/add', msg);
    ok = !!(r && (r.ok || r.id));
  } catch (_e) { ok = false; }

  if (!ok) {
    try {
      const res = await chrome.runtime.sendNativeMessage(HOST, msg);
      ok = !!(res && (res.ok || res.launched));
    } catch (_e) { ok = false; }
  }

  if (ok) {
    appConnected = true;
    lastAppCheck = Date.now();
    badge('✓');
    // Track daily stats
    const today = new Date().toISOString().slice(0, 10);
    chrome.storage.local.get({ dailyStats: {}, recent: [] }, d => {
      const stats = d.dailyStats || {};
      if (!stats[today]) stats[today] = { count: 0, bytes: 0 };
      stats[today].count++;
      if (msg.size && msg.size > 0) stats[today].bytes += msg.size;
      const recent = [{ url: msg.url, name: msg.filename || '', time: Date.now() }, ...(d.recent || [])].slice(0, 15);
      chrome.storage.local.set({ dailyStats: stats, recent });
    });
  } else {
    badge('!', '#f87171');
  }
  return ok;
}

/* قائمة الروابط التي تم تسليمها بنجاح للتطبيق لمنع التكرار نهائياً */
const handledByAppUrls = new Set();

/* إعادة التحميل في المتصفح بأمان عند تعذر الاتصال بالبرنامج */
function restoreBrowserDownload(url, filename) {
  try {
    restoredDownloads.add(url);
    setTimeout(() => restoredDownloads.delete(url), 30000);
    const dl = { url, conflictAction: 'uniquify' };
    if (filename) dl.filename = filename;
    chrome.downloads.download(dl, () => {});
  } catch (_e) {}
}

/* إلغاء التحميل ومسحه فوراً من شريط تنزيلات المتصفح لعدم التكرار */
function cancelAndErase(downloadId, retries = 5) {
  try {
    chrome.downloads.cancel(downloadId, () => {
      const err = chrome.runtime.lastError;
      if (err && retries > 0) {
        setTimeout(() => cancelAndErase(downloadId, retries - 1), 40);
        return;
      }
      try {
        chrome.downloads.erase({ id: downloadId }, () => {});
      } catch (_e) {}
    });
  } catch (_e) {
    if (retries > 0) {
      setTimeout(() => cancelAndErase(downloadId, retries - 1), 40);
    }
  }
}

/* ===== قائمة كليك يمين ===== */
chrome.runtime.onInstalled.addListener(() => {
  try { chrome.action.setBadgeText({ text: '' }); } catch (_e) {}
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'pdm-download-link', title: '⚡ تحميل مع Premium DM', contexts: ['link'] });
    chrome.contextMenus.create({ id: 'pdm-download-media', title: '⚡ تحميل الوسائط مع Premium DM', contexts: ['video', 'audio'] });
    chrome.contextMenus.create({ id: 'pdm-download-page-video', title: '🎬 تحميل فيديو هذه الصفحة (أفضل جودة)', contexts: ['page'] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || info.srcUrl || info.pageUrl;
  if (!url) return;
  if (info.menuItemId === 'pdm-download-page-video') {
    sendToApp({ url, referrer: tab && tab.url, force: true, video: true });
    return;
  }
  sendToApp({ url, referrer: tab && tab.url, force: true });
});

/* ===== (1) اعتراض التنزيلات الصارم (إلغاء تنزيل المتصفح وتحويله للبرنامج فقط طالما البرنامج مفتوح) ===== */
chrome.downloads.onCreated.addListener(async item => {
  if (!item || !item.url) return;
  if (!settings.enabled) return;

  const url = item.finalUrl || item.url;

  // إذا تم استعادة هذا الرابط مسبقاً للتنزيل في المتصفح، دعه يكمل بدون اعتراض
  if (restoredDownloads.has(url) || restoredDownloads.has(item.url)) {
    restoredDownloads.delete(url);
    restoredDownloads.delete(item.url);
    return;
  }

  // حارس بدء التشغيل: حل مشكلة التحميلات التلقائية عند فتح المتصفح (Startup Guard)
  if (settings.startupGuard) {
    const elapsed = Date.now() - EXT_BOOT_TIME;
    if (elapsed < 8000) {
      if (item.startTime && new Date(item.startTime).getTime() < EXT_BOOT_TIME) return;
      if (item.state && item.state !== 'in_progress') return;
    }
  }

  // استبعاد الروابط الداخلية للمتصفح
  if (/^(blob:|data:|about:|chrome:|edge:|chrome-extension:)/i.test(item.url)) return;
  if (!/^https?:\/\//i.test(url)) return;
  if (isIgnored(url)) return;

  const rawFilename = (item.filename || '').split(/[\\/]/).pop() || '';
  const cleanUrl = url.split('?')[0];

  // استبعاد ملفات المتصفح الداخلية وحزم الإضافات
  if (EXCLUDED_EXT_RE.test(cleanUrl) || EXCLUDED_EXT_RE.test(rawFilename)) return;

  // الحد الأدنى لحجم الملف إن وجد
  if (item.totalBytes > 0 && item.totalBytes < (settings.minSizeMB || 0) * 1024 * 1024) return;

  // شرط المستخدم الأساسي: التحميل من البرنامج فقط طالما البرنامج مفتوح
  const isOpen = await checkAppOpen();
  if (!isOpen) {
    // البرنامج مغلق: لا نعترض شيئاً، المتصفح يحمل الملف بشكل طبيعي تماماً
    return;
  }

  // إذا تم اعتراض الرابط مسبقاً عبر Content Script، نلغي ومسح تنزيل المتصفح فوراً
  if (handledByAppUrls.has(url) || handledByAppUrls.has(item.url)) {
    cancelAndErase(item.id);
    return;
  }

  // البرنامج مفتوح: نلغي التحميل في المتصفح فوراً ونمسحه لمنع التنزيل المزدوج نهائياً
  cancelAndErase(item.id);

  // إرسال الرابط والمعلومات لمحرك التنزيل في البرنامج
  const filename = rawFilename || cleanUrl.split('/').pop() || undefined;
  handledByAppUrls.add(url);
  setTimeout(() => handledByAppUrls.delete(url), 30000);

  const sent = await sendToApp({
    url,
    filename,
    referrer: item.referrer || undefined,
    size: item.totalBytes > 0 ? item.totalBytes : undefined
  });

  if (sent) {
    // إشعار فوري داخل صفحة المتصفح الحالية
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'showCaptureToast',
          filename: filename || 'ملف جديد'
        }).catch(() => {});
      }
    });
  } else {
    // في حالة استثنائية إذا تعذر تسليم الرابط للبرنامج، نعيد التنزيل في المتصفح
    handledByAppUrls.delete(url);
    restoreBrowserDownload(url, filename);
  }
});

/* ===== (2) رصد وسائط البث HLS/DASH والفيديو (Sniffer) ===== */
const STREAM_URL_RE = /\.m3u8($|[?#])|\.mpd($|[?#])/i;
const streamHits = new Map(); // tabId -> Map(url -> { url, tabUrl, time })

chrome.webRequest.onBeforeRequest.addListener(details => {
  if (!STREAM_URL_RE.test(details.url)) return {};
  if (details.tabId < 0) return {};
  if (!streamHits.has(details.tabId)) streamHits.set(details.tabId, new Map());
  const m = streamHits.get(details.tabId);
  if (!m.has(details.url)) m.set(details.url, { url: details.url, tabUrl: '', time: Date.now() });
  while (m.size > 30) {
    const oldest = [...m.keys()].sort((a, b) => m.get(a).time - m.get(b).time)[0];
    m.delete(oldest);
  }
  return {};
}, { urls: ['<all_urls>'] }, []);

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url && streamHits.has(tabId)) {
    for (const v of streamHits.get(tabId).values()) v.tabUrl = info.url;
  }
});
chrome.tabs.onRemoved.addListener(tabId => streamHits.delete(tabId));

/* ===== (3) قنوات الرسائل والتواصل مع الـ Popup وسكربت المحتوى Content Script ===== */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  // اعتراض النقر المباشر على روابط التنزيل داخل صفحات الويب (Content Script)
  if (msg.type === 'interceptLinkClick') {
    checkAppOpen().then(isOpen => {
      if (!isOpen) {
        sendResponse({ handled: false, open: false });
        return;
      }
      const url = msg.url;
      const filename = msg.filename;
      handledByAppUrls.add(url);
      setTimeout(() => handledByAppUrls.delete(url), 30000);

      sendToApp({
        url,
        filename,
        referrer: msg.referrer || (sender.tab && sender.tab.url)
      }).then(ok => {
        if (ok) {
          sendResponse({ handled: true, filename });
        } else {
          handledByAppUrls.delete(url);
          sendResponse({ handled: false });
        }
      });
    });
    return true; // استجابة غير متزامنة
  }

  // استعلام البثوث الملتقطة في التبويب الحالي
  if (msg.type === 'getHls') {
    const tabId = msg.tabId || (sender.tab && sender.tab.id);
    const list = streamHits.has(tabId) ? [...streamHits.get(tabId).values()].slice(-20) : [];
    sendResponse({ ok: true, streams: list });
    return;
  }

  // استعلام الجودات الحقيقية المتاحة للفيديو ديناميكياً
  if (msg.type === 'getVideoFormats') {
    const targetUrl = msg.url || (sender.tab && sender.tab.url);
    if (!targetUrl) {
      sendResponse({ ok: false, error: 'no url' });
      return;
    }
    httpSend(`/formats?url=${encodeURIComponent(targetUrl)}`, null, 'GET')
      .then(res => sendResponse(res || { ok: false }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  // استعلام حالة البرنامج المكتبي (السرعة والمهام النشطة)
  if (msg.type === 'getAppStatus') {
    httpSend('/summary', null, 'GET').then(summary => {
      if (summary && (summary.ok || summary.running || summary.connected)) {
        appConnected = true;
        lastAppCheck = Date.now();
        sendResponse({
          connected: true,
          speed: summary.totalSpeed || summary.speed || 0,
          active: summary.activeCount || summary.active || summary.downloading || 0,
          total: summary.totalTasks || 0
        });
      } else {
        httpSend('/ping', null, 'GET').then(p => {
          const isAlive = !!(p && p.ok);
          appConnected = isAlive;
          lastAppCheck = Date.now();
          sendResponse({ connected: isAlive, speed: 0, active: 0, total: 0 });
        }).catch(() => {
          appConnected = false;
          lastAppCheck = Date.now();
          sendResponse({ connected: false });
        });
      }
    }).catch(() => {
      httpSend('/ping', null, 'GET').then(p => {
        const isAlive = !!(p && p.ok);
        appConnected = isAlive;
        lastAppCheck = Date.now();
        sendResponse({ connected: isAlive, speed: 0, active: 0, total: 0 });
      }).catch(() => {
        appConnected = false;
        lastAppCheck = Date.now();
        sendResponse({ connected: false });
      });
    });
    return true; // استجابة غير متزامنة
  }

  // استئناف أو إيقاف الكل من الـ Popup
  if (msg.type === 'controlAll') {
    const action = msg.action; // 'pauseAll' أو 'resumeAll'
    httpSend(`/${action}`, {}, 'POST').then(res => {
      sendResponse({ ok: !!res });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }

  // فتح وتشغيل البرنامج أو إظهاره
  if (msg.type === 'launchApp') {
    httpSend('/launch', {}, 'POST').then(res => {
      sendResponse({ ok: !!res });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }

  // تبديل النافذة العائمة
  if (msg.type === 'toggleFloat') {
    httpSend('/float/toggle', {}, 'POST').then(res => {
      sendResponse({ ok: !!res });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }

  // إرسال تنزيل من زر الفيديو العائم أو الـ Popup
  if (msg.type === 'send') {
    const payload = msg.payload || {};
    if (sender.tab && !payload.referrer) payload.referrer = sender.tab.url;
    sendToApp(payload).then(ok => sendResponse({ ok }));
    return true;
  }

  // استعلام الإعدادات لـ content.js
  if (msg.type === 'getSettings') {
    sendResponse({ settings });
    return;
  }
});