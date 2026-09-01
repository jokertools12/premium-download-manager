'use strict';

/* Premium DM Extension v2
   - اعتراض تحميلات المتصفح وإرسالها للبرنامج
   - فلاتر: تشغيل/إيقاف، حد أدنى للحجم، مواقع متجاهلة
   - قائمة كليك يمين: "تحميل مع Premium DM"
   - شارة إشعار على الأيقونة عند الالتقاط */

const HOST = 'com.premiumdm.host';
const DEFAULTS = { enabled: true, minSizeMB: 0, ignoredSites: [] };
let settings = { ...DEFAULTS };

/* ===== الإعدادات ===== */
chrome.storage.sync.get(DEFAULTS, s => { settings = { ...DEFAULTS, ...s }; });
chrome.storage.onChanged.addListener(ch => {
  if (ch.pdmSettings) settings = { ...DEFAULTS, ...ch.pdmSettings.newValue };
});
function saveSettings(patch) {
  settings = { ...settings, ...patch };
  chrome.storage.sync.set({ pdmSettings: settings });
}

/* ===== قائمة كليك يمين ===== */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'pdm-download-link',
    title: 'تحميل مع Premium DM',
    contexts: ['link']
  });
  chrome.contextMenus.create({
    id: 'pdm-download-media',
    title: 'تحميل الوسائط مع Premium DM',
    contexts: ['video', 'audio']
  });
  chrome.contextMenus.create({
    id: 'pdm-download-page-video',
    title: '🎬 تحميل فيديو هذه الصفحة مع Premium DM',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || info.srcUrl || info.pageUrl;
  if (!url) return;
  if (info.menuItemId === 'pdm-download-page-video') {
    // إرسال الصفحة لمستخرج الفيديوهات (yt-dlp) لأفضل جودة
    sendToApp({ url, referrer: tab && tab.url, force: true, video: true });
    return;
  }
  sendToApp({
    url,
    referrer: tab && tab.url,
    force: true // القائمة تتجاوز فلاتر الحجم
  });
});

/* ===== الاعتراض ===== */
function isIgnored(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (settings.ignoredSites || []).some(s => host.includes(String(s).toLowerCase()));
  } catch (_e) { return false; }
}

function badge(text) {
  try {
    chrome.action.setBadgeBackgroundColor({ color: '#4f8cff' });
    chrome.action.setBadgeText({ text });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
  } catch (_e) {}
}

/* إرسال مباشر عبر HTTP إلى الخادم المحلي للبرنامج (بديل موثوق حتى لو
   لم يُسجّل مضيف Native Messaging في السجل) — يعمل دائماً ما دام البرنامج يعمل */
async function httpSend(msg) {
  try {
    const res = await fetch('http://127.0.0.1:45762/add', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(msg)
    });
    if (!res.ok) return false;
    const d = await res.json().catch(() => ({}));
    return !!(d && d.ok);
  } catch (_e) { return false; }
}

async function sendToApp(msg) {
  let ok = false;
  try {
    await chrome.runtime.sendNativeMessage(HOST, msg);
    ok = true;
  } catch (_e) {
    // Native Messaging غير مسجل — نجرّب الاتصال المباشر بخادم البرنامج
  }
  if (!ok) {
    try { ok = await httpSend(msg); } catch (_e) { ok = false; }
  }
  if (ok) {
    badge('✓');
    chrome.storage.local.get({ recent: [] }, d => {
      const recent = [{ url: msg.url, name: msg.filename || '', time: Date.now() }, ...(d.recent || [])].slice(0, 10);
      chrome.storage.local.set({ recent });
    });
  } else {
    badge('!');
  }
  return ok;
}

chrome.downloads.onCreated.addListener(async item => {
  if (!item || !item.url) return;
  if (!settings.enabled) return;
  if (/^(blob:|data:|about:)/i.test(item.url)) return;

  const url = item.finalUrl || item.url;
  if (!/^https?:\/\//i.test(url)) return;
  if (isIgnored(url)) return;

  // فلتر الحجم الأدنى (الملفات غير معروفة الحجم تُعتبر مؤهلة)
  if (item.totalBytes > 0 && item.totalBytes < (settings.minSizeMB || 0) * 1024 * 1024) return;

  const msg = {
    url,
    filename: (item.filename || '').split(/[\\/]/).pop() || undefined,
    referrer: item.referrer || undefined,
    size: item.totalBytes > 0 ? item.totalBytes : undefined
  };

  // نحاول الإرسال أولاً؛ فقط إذا نجح نلغي تحميل المتصفح
  const ok = await sendToApp(msg);
  if (ok && item.state && item.state !== 'interrupted' && !item.paused) {
    try { chrome.downloads.cancel(item.id, () => {}); } catch (_e) {}
  }
});
