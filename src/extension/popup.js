'use strict';

/* Premium DM — Extension Popup Controller v4.0.0 */

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

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function showToast(text) {
  const old = document.querySelector('.ext-toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'ext-toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
  // 1. Load and apply settings
  chrome.storage.sync.get(DEFAULTS, s => {
    settings = { ...DEFAULTS, ...s };
    document.getElementById('enabled').checked = !!settings.enabled;
    document.getElementById('startupGuard').checked = !!settings.startupGuard;
    document.getElementById('showVideoWidget').checked = !!settings.showVideoWidget;
    document.getElementById('minSize').value = settings.minSizeMB || 0;
    renderSites();
  });

  // 2. Save Settings Button
  document.getElementById('btnSaveSettings').addEventListener('click', () => {
    settings.enabled = document.getElementById('enabled').checked;
    settings.startupGuard = document.getElementById('startupGuard').checked;
    settings.showVideoWidget = document.getElementById('showVideoWidget').checked;
    settings.minSizeMB = Math.max(0, parseInt(document.getElementById('minSize').value, 10) || 0);

    chrome.storage.sync.set(settings, () => {
      const btn = document.getElementById('btnSaveSettings');
      btn.classList.add('saved');
      btn.innerHTML = '<span>✓</span> Saved!';
      showToast('Settings saved successfully!');
      setTimeout(() => {
        btn.classList.remove('saved');
        btn.innerHTML = '<span>💾</span> Save Changes';
      }, 2000);
    });
  });

  // 3. Connection status & live speed
  function checkStatus() {
    chrome.runtime.sendMessage({ type: 'getAppStatus' }, res => {
      const dot = document.getElementById('dotStatus');
      const txt = document.getElementById('txtConnStatus');
      const spd = document.getElementById('txtLiveSpeed');

      if (res && res.connected) {
        dot.className = 'status-dot';
        txt.textContent = `Connected (${res.active || 0} active)`;
        txt.style.color = '#f0f4fc';
        spd.textContent = fmtBytes(res.speed || 0) + '/s';
      } else {
        dot.className = 'status-dot offline';
        txt.textContent = 'Disconnected (start the app)';
        txt.style.color = '#f87171';
        spd.textContent = '0 B/s';
      }
    });
  }

  checkStatus();
  setInterval(checkStatus, 2000);

  // 4. Quick controls & dynamic version
  const verEl = document.getElementById('ver');
  if (verEl && chrome.runtime && chrome.runtime.getManifest) {
    verEl.textContent = 'v' + chrome.runtime.getManifest().version;
  }

  document.getElementById('btnResumeAll').onclick = () => {
    chrome.runtime.sendMessage({ type: 'controlAll', action: 'resumeAll' });
    showToast('Resumed all downloads');
  };
  document.getElementById('btnPauseAll').onclick = () => {
    chrome.runtime.sendMessage({ type: 'controlAll', action: 'pauseAll' });
    showToast('Paused all downloads');
  };

  const btnLaunch = document.getElementById('btnLaunchApp');
  if (btnLaunch) {
    btnLaunch.onclick = () => {
      chrome.runtime.sendMessage({ type: 'launchApp' }, res => {
        if (res && res.ok) showToast('App brought to focus');
        else showToast('Please start the Premium DM app on your PC');
      });
    };
  }

  const btnFloat = document.getElementById('btnToggleFloat');
  if (btnFloat) {
    btnFloat.onclick = () => {
      chrome.runtime.sendMessage({ type: 'toggleFloat' }, res => {
        if (res && res.ok) showToast('Toggled Floating Widget');
        else showToast('Please start Premium DM');
      });
    };
  }

  // 5. Tab media streams
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
          <button class="m-btn" data-idx="${idx}">⬇ Download</button>
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
            btn.textContent = '✓ Sent';
            btn.style.background = '#10b981';
            btn.style.color = '#fff';
          });
        };
      });
    });
  });

  // 6. Recent downloads
  function renderRecent() {
    chrome.storage.local.get({ recent: [] }, data => {
      const list = document.getElementById('recentList');
      const items = (data.recent || []).slice(0, 5);
      if (!items.length) {
        list.innerHTML = '<div class="empty-hint">No recent downloads sent via extension</div>';
        return;
      }
      list.innerHTML = items.map(r => {
        const name = r.name || r.url.split('?')[0].split('/').pop() || r.url;
        return `
          <div class="recent-item">
            <span class="r-icon">📥</span>
            <span class="r-name" title="${r.url}">${name}</span>
            <span class="r-time">${timeAgo(r.time)}</span>
          </div>
        `;
      }).join('');
    });
  }
  renderRecent();

  // 7. Daily stats
  function renderStats() {
    chrome.storage.local.get({ dailyStats: {} }, data => {
      const today = new Date().toISOString().slice(0, 10);
      const stats = (data.dailyStats && data.dailyStats[today]) || { count: 0, bytes: 0 };
      document.getElementById('statCount').textContent = stats.count || 0;
      document.getElementById('statSize').textContent = fmtBytes(stats.bytes || 0);
    });
  }
  renderStats();

  // 8. Ignored sites management
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
        chrome.storage.sync.set(settings);
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
      chrome.storage.sync.set(settings);
      renderSites();
      showToast(`Added ${val} to whitelist`);
    }
    input.value = '';
  };
});
