'use strict';

/* نافذة الإضافة المنبثقة: إعدادات + آخر الالتقاطات + حالة البرنامج */

const DEFAULTS = { enabled: true, minSizeMB: 1, ignoredSites: [] };

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

// حالة البرنامج (via native messaging ping)
(async () => {
  try {
    const res = await chrome.runtime.sendNativeMessage('com.premiumdm.host', { ping: true });
    $('#appStatus').innerHTML = res && res.running
      ? '<span class="on">● البرنامج يعمل الآن</span>'
      : '<span class="off">● البرنامج غير متصل — سيُستخدم المتصفح للتحميل</span>';
  } catch (_e) {
    $('#appStatus').innerHTML = '<span class="off">● تعذر الاتصال بالبرنامج (ثبّت الإضافة من إعدادات البرنامج)</span>';
  }
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
