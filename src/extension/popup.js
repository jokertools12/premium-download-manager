'use strict';

/* Premium DM — Extension Popup Controller v2.2.0 */

const DEFAULTS = {
  enabled: true,
  minSizeMB: 0,
  ignoredSites: [],
  startupGuard: true,
  showVideoWidget: true
};

let settings = { ...DEFAULTS };

function fmtBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + units[i];
}

document.addEventListener('DOMContentLoaded', () => {
  // 1. استرجاع وتحديث الإعدادات
  chrome.storage.sync.get(DEFAULTS, s => {
    settings = { ...DEFAULTS, ...s };
    document.getElementById('enabled').checked = !!settings.enabled;
    document.getElementById('startupGuard').checked = !!settings.startupGuard;
    document.getElementById('showVideoWidget').checked = !!settings.showVideoWidget;
    document.getElementById('minSize').value = settings.minSizeMB || 0;
    renderSites();
  });

  function saveSettings() {
    chrome.storage.sync.set(settings);
  }

  document.getElementById('enabled').onchange = e => {
    settings.enabled = e.target.checked;
    saveSettings();
  };

  document.getElementById('startupGuard').onchange = e => {
    settings.startupGuard = e.target.checked;
    saveSettings();
  };

  document.getElementById('showVideoWidget').onchange = e => {
    settings.showVideoWidget = e.target.checked;
    saveSettings();
  };

  document.getElementById('minSize').onchange = e => {
    settings.minSizeMB = Math.max(0, parseInt(e.target.value, 10) || 0);
    saveSettings();
  };

  // 2. فحص حالة البرنامج المكتبي وسرعة النقل
  function checkStatus() {
    chrome.runtime.sendMessage({ type: 'getAppStatus' }, res => {
      const dot = document.getElementById('dotStatus');
      const txt = document.getElementById('txtConnStatus');
      const spd = document.getElementById('txtLiveSpeed');

      if (res && res.connected) {
        dot.className = 'status-dot';
        txt.textContent = `متصل (${res.active || 0} نشط)`;
        txt.style.color = '#f0f4fc';
        spd.textContent = fmtBytes(res.speed || 0) + '/s';
      } else {
        dot.className = 'status-dot offline';
        txt.textContent = 'غير متصل (شغّل البرنامج)';
        txt.style.color = '#f87171';
        spd.textContent = '0 B/s';
      }
    });
  }

  checkStatus();
  setInterval(checkStatus, 2000);

  // 3. أزرار التحكم السريع (استئناف/إيقاف الكل)
  document.getElementById('btnResumeAll').onclick = () => {
    chrome.runtime.sendMessage({ type: 'controlAll', action: 'resumeAll' });
  };
  document.getElementById('btnPauseAll').onclick = () => {
    chrome.runtime.sendMessage({ type: 'controlAll', action: 'pauseAll' });
  };

  // 4. استعراض وسائط التبويب الحالي
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs.length) return;
    const tab = tabs[0];
    chrome.runtime.sendMessage({ type: 'getHls', tabId: tab.id }, res => {
      const list = document.getElementById('streamsList');
      const streams = (res && res.streams) || [];
      if (!streams.length) return;

      list.innerHTML = streams.map((s, idx) => `
        <div class="media-item">
          <span class="m-url" title="${s.url}">${s.url.split('?')[0].split('/').pop() || s.url}</span>
          <button class="m-btn" data-idx="${idx}">⬇ تحميل</button>
        </div>
      `).join('');

      list.querySelectorAll('.m-btn').forEach(btn => {
        btn.onclick = () => {
          const idx = parseInt(btn.dataset.idx, 10);
          const item = streams[idx];
          if (!item) return;
          chrome.runtime.sendMessage({
            type: 'send',
            payload: { url: item.url, referrer: tab.url, video: true, force: true }
          }, () => {
            btn.textContent = '✓ أُرسل';
            btn.style.background = '#10b981';
          });
        };
      });
    });
  });

  // 5. إدارة المواقع المتجاهلة
  function renderSites() {
    const el = document.getElementById('sitesList');
    const sites = settings.ignoredSites || [];
    el.innerHTML = sites.map((s, i) => `
      <span class="tag">
        ${s} <span class="tag-del" data-i="${i}">✕</span>
      </span>
    `).join('');

    el.querySelectorAll('.tag-del').forEach(d => {
      d.onclick = () => {
        const i = parseInt(d.dataset.i, 10);
        settings.ignoredSites.splice(i, 1);
        saveSettings();
        renderSites();
      };
    });
  }

  document.getElementById('btnAddSite').onclick = () => {
    const input = document.getElementById('newSite');
    const val = input.value.trim().toLowerCase();
    if (!val) return;
    if (!settings.ignoredSites.includes(val)) {
      settings.ignoredSites.push(val);
      saveSettings();
      renderSites();
    }
    input.value = '';
  };
});
