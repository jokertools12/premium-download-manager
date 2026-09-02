'use strict';

/* نافذة الإضافة المنبثقة: إعدادات + آخر الالتقاطات + حالة البرنامج */

const DEFAULTS = { enabled: true, minSizeMB: 0, ignoredSites: [] };

const $ = s => document.querySelector(s);

function renderSites(sites) {
  $('#sites').innerHTML = (sites || []).length
    ? sites.map(s => `<div class="row"><span class="hint" style="flex:1">${s}</span><button class="del" data-site="${s}">✕</button></div>`).join('')
    : '<div class="hint">لا مواقع متجاهلة</div>';
}

function renderRecent(recent) {
  $('#recent').innerHTML = (recent || []).length
    ? recent.map(r => `<div class="item" title="${r.url}">${r.name || r.url} <span style="color:#4f8cff">✓</span></div>`).join('')
    : '<div class="hint">لا شيء بعد</div>';
}

// تحميل الإعدادات والحالة
chrome.storage.sync.get(DEFAULTS, s => {
  $('#enabled').checked = s.enabled;
  $('#minSize').value = s.minSizeMB;
  renderSites(s.ignoredSites);
});
chrome.storage.local.get({ recent: [] }, d => renderRecent(d.recent));
$('#ver').textContent = 'v' + chrome.runtime.getManifest().version;

// حالة البرنامج: نجرّب Native Messaging ثم الاتصال المباشر بخادم البرنامج
async function checkAppRunning() {
  try {
    const res = await chrome.runtime.sendNativeMessage('com.premiumdm.host', { ping: true });
    if (res && res.running) return true;
  } catch (_e) { /* نحاول المسار الثاني */ }
  try {
    const r = await fetch('http://127.0.0.1:45762/ping');
    const d = await r.json().catch(() => ({}));
    return !!(d && d.ok);
  } catch (_e) { return false; }
}

(async () => {
  const running = await checkAppRunning();
  $('#appStatus').innerHTML = running
    ? '<span class="on">● البرنامج يعمل الآن — التحميلات ستُحوَّل إليه</span>'
    : '<span class="off">● البرنامج غير متصل — شغّل Premium DM أولاً</span>';
})();

$('#enabled').addEventListener('change', e => {
  chrome.storage.sync.get(DEFAULTS, s => chrome.storage.sync.set({ pdmSettings: { ...s, enabled: e.target.checked } }));
});
$('#minSize').addEventListener('change', e => {
  const v = Math.max(0, parseFloat(e.target.value) || 0);
  chrome.storage.sync.get(DEFAULTS, s => chrome.storage.sync.set({ pdmSettings: { ...s, minSizeMB: v } }));
});
$('#addSite').onclick = () => {
  const site = $('#newSite').value.trim().toLowerCase();
  if (!site) return;
  chrome.storage.sync.get(DEFAULTS, s => {
    const sites = [...new Set([...(s.ignoredSites || []), site])];
    chrome.storage.sync.set({ pdmSettings: { ...s, ignoredSites: sites } });
    $('#newSite').value = '';
    renderSites(sites);
  });
};
$('#sites').addEventListener('click', e => {
  const b = e.target.closest('.del');
  if (!b) return;
  chrome.storage.sync.get(DEFAULTS, s => {
    const sites = (s.ignoredSites || []).filter(x => x !== b.dataset.site);
    chrome.storage.sync.set({ pdmSettings: { ...s, ignoredSites: sites } });
    renderSites(sites);
  });
});

/* ===== (5.1) بث HLS/DASH المكتشف في التبويب النشط ===== */
function renderStreams(streams) {
  const el = $('#streams');
  if (!streams || !streams.length) return;
  el.innerHTML = streams.map(s => `
    <div class="stream">
      <span class="surl" title="${s.url}">${s.url}</span>
      <button data-surl="${s.url}" title="تحميل هذا البث">⬇</button>
    </div>`).join('');
}

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  const tabId = tabs && tabs[0] ? tabs[0].id : null;
  if (tabId == null) return;
  chrome.runtime.sendMessage({ type: 'getHls', tabId }, res => {
    if (res && res.ok) renderStreams(res.streams);
  });
});

$('#streams').addEventListener('click', e => {
  const b = e.target.closest('button[data-surl]');
  if (!b) return;
  const url = b.dataset.surl;
  chrome.runtime.sendMessage(
    { type: 'send', payload: { url, video: true, force: true } },
    () => b.textContent = '✓'
  );
});
