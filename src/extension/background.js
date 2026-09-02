'use strict';

/* Premium DM Extension v2.0.2 — اعتراض احترافي:
   1) webRequest Blocking: يمنع التحميل قبل أن يبدأ في المتصفح أصلاً
      (الروابط بامتداد ملف — المتصفح لا يشعر بأي تحميل إطلاقاً)
   2) downloads.onCreated: احتياط فوري — يوقف ويلغي أي تحميل يبدأ
      (بدون انتظار شبكة — المتصفح لا يلاحظ تقريباً)
   3) كليك يمين: تحميل مع Premium DM / فيديو / صوت
   4) إن لم يكن البرنامج يعمل: يُعاد التحميل في المتصفح (لا فقدان للملف) */

const HOST = 'com.premiumdm.host';
const DEFAULTS = { enabled: true, minSizeMB: 0, ignoredSites: [] };
let settings = { ...DEFAULTS };

/* عناوين نعالجها حالياً (لتفادي حلقات إعادة التحميل) */
const handling = new Map(); // url -> expiry timestamp

chrome.storage.sync.get(DEFAULTS, s => { settings = { ...DEFAULTS, ...s }; });
chrome.storage.onChanged.addListener(ch => {
  if (ch.pdmSettings) settings = { ...DEFAULTS, ...ch.pdmSettings.newValue };
});

/* ===== أدوات مساعدة ===== */
function isIgnored(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (settings.ignoredSites || []).some(s => host.includes(String(s).toLowerCase()));
  } catch (_e) { return false; }
}

function badge(text, color = '#4f8cff') {
  try {
    chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setBadgeText({ text });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
  } catch (_e) {}
}

async function httpSend(msg) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    const res = await fetch('http://127.0.0.1:45762/add', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(msg),
      signal: ctl.signal
    });
    clearTimeout(t);
    if (!res.ok) return false;
    const d = await res.json().catch(() => ({}));
    return !!(d && d.ok);
  } catch (_e) { return false; }
}

async function sendToApp(msg) {
  let ok = false;
  try { ok = await httpSend(msg); } catch (_e) { ok = false; }
  if (!ok) {
    try { await chrome.runtime.sendNativeMessage(HOST, msg); ok = true; } catch (_e) { ok = false; }
  }
  if (ok) {
    badge('✓');
    chrome.storage.local.get({ recent: [] }, d => {
      const recent = [{ url: msg.url, name: msg.filename || '', time: Date.now() }, ...(d.recent || [])].slice(0, 10);
      chrome.storage.local.set({ recent });
    });
  } else {
    badge('!', '#f87171');
  }
  return ok;
}

/* إعادة التحميل في المتصفح بأمان إن لم يستقبل البرنامج (لا يسبب حلقة) */
function restoreBrowserDownload(url, filename) {
  try {
    const dl = { url, conflictAction: 'uniquify' };
    if (filename) dl.filename = filename;
    chrome.downloads.download(dl, () => {});
  } catch (_e) {}
}

function markHandling(url) { handling.set(url, Date.now() + 15000); }
function isHandling(url) { return handling.has(url) && handling.get(url) > Date.now(); }
/* ===== قائمة كليك يمين ===== */
chrome.runtime.onInstalled.addListener(() => {
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
  markHandling(url);
  sendToApp({ url, referrer: tab && tab.url, force: true });
});

/* ===== (1) منع التحميل قبل أن يبدأ في المتصفح =====
   webRequest Blocking يعمل بشكل متزامن (يُمنع فوراً) ثم نرسل الرابط للبرنامج. */
const DOWNLOAD_EXT_RE = /\.(zip|rar|7z|tar|gz|bz2|xz|iso|exe|msi|apk|dmg|deb|rpm|mp4|mkv|webm|avi|mov|wmv|flv|m4v|mp3|m4a|aac|wav|flac|ogg|oga|pdf|epub|torrent|pak|bin|dat|dll|jar|msu|cab)$/i;

chrome.webRequest.onBeforeRequest.addListener(details => {
  if (!settings.enabled) return {};
  const url = details.url;
  if (!/^https?:\/\//i.test(url)) return {};
  if (isIgnored(url)) return {};
  if (isHandling(url)) return {};
  // نمتنع عن كسر تصفح المواقع: لا نمنع HTML ولا الطلبات الثانوية (صور/سكربتات/ميديا داخل الصفحة)
  if (details.type !== 'main_frame' && details.type !== 'other') return {};
  if (!DOWNLOAD_EXT_RE.test(url.split('?')[0])) return {};

  markHandling(url);
  const referrer = details.initiator || details.documentUrl || '';
  const filename = (url.split('/').pop() || '').split('?')[0] || undefined;

  sendToApp({ url, referrer, force: true, filename }).then(ok => {
    if (!ok) restoreBrowserDownload(url, filename); // البرنامج غير متاح → المتصفح يحمّل
  }).catch(() => restoreBrowserDownload(url, filename));

  return { cancel: true }; // المتصفح لا يبدأ أي تحميل إطلاقاً
}, { urls: ['<all_urls>'] }, ['blocking']);

/* ===== (5.1) إضافة v2: التقاط روابط البث HLS/DASH لكل تبويب ===== */
const STREAM_URL_RE = /\.m3u8($|[?#])|\.mpd($|[?#])/i;
const streamHits = new Map(); // tabId -> Map(url -> { url, tabUrl, time })

chrome.webRequest.onBeforeRequest.addListener(details => {
  if (!STREAM_URL_RE.test(details.url)) return {};
  if (details.tabId < 0) return {};
  if (!streamHits.has(details.tabId)) streamHits.set(details.tabId, new Map());
  const m = streamHits.get(details.tabId);
  if (!m.has(details.url)) m.set(details.url, { url: details.url, tabUrl: '', time: Date.now() });
  // حافظ على آخر 30 رابطاً لكل تبويب فقط
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

/* جسر الـ popup: قائمة البث + إرسال للبرنامج */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'getHls') {
    const tabId = msg.tabId;
    const list = streamHits.has(tabId) ? [...streamHits.get(tabId).values()].slice(-20) : [];
    sendResponse({ ok: true, streams: list });
    return;
  }
  if (msg.type === 'send') {
    sendToApp(msg.payload || {}).then(ok => sendResponse({ ok }));
    return true; // استجابة غير متزامنة
  }
});

/* ===== (2) احتياط: أي تحميل يبدأ فعلاً نلغيه فوراً (بدون أي انتظار شبكة) ===== */
chrome.downloads.onCreated.addListener(item => {
  if (!item || !item.url) return;
  if (!settings.enabled) return;
  if (/^(blob:|data:|about:)/i.test(item.url)) return;
  const url = item.finalUrl || item.url;
  if (!/^https?:\/\//i.test(url)) return;
  if (isIgnored(url)) return;
  if (isHandling(url)) return;
  if (item.totalBytes > 0 && item.totalBytes < (settings.minSizeMB || 0) * 1024 * 1024) return;

  const filename = (item.filename || '').split(/[\\/]/).pop() || undefined;
  markHandling(url);

  // إلغاء فوري أولاً: pause ثم cancel — المتصفح لا يلاحظ التحميل تقريباً
  try { chrome.downloads.pause(item.id, () => {}); } catch (_e) {}
  try { chrome.downloads.cancel(item.id, () => {}); } catch (_e) {}

  sendToApp({
    url,
    filename,
    referrer: item.referrer || undefined,
    size: item.totalBytes > 0 ? item.totalBytes : undefined
  }).then(ok => {
    if (!ok) restoreBrowserDownload(url, filename);
  }).catch(() => restoreBrowserDownload(url, filename));
});