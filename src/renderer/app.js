/* Premium Download Manager — نقطة الإقلاع (المرحلة 7-12) */

import { $ } from './lib/dom.js';
import { state } from './state.js';
import { applyTheme } from './lib/dom.js';
import { render } from './ui/render.js';
import { drawSpeedChart } from './ui/dashboard.js';
import { wireMainUI, wireIpc } from './events.js';
import { wireModals, wireExtUI, wirePluginsUI, openAdd, openSettings } from './ui/modals.js';
import { wireVideoUI } from './ui/video.js';
import { wireTorrentUI } from './ui/torrent.js';
import { wireContextMenus } from './ui/contextmenu.js';
import { openArchivePreview } from './ui/archive.js';
import { wireAiUI } from './ui/ai.js';
import { wireMobileUI } from './ui/mobile.js';
import { wireRssUI } from './ui/rss.js';

(async function init() {
  wireMainUI();
  wireModals();
  wireExtUI();
  wirePluginsUI();
  wireVideoUI();
  wireTorrentUI();
  wireContextMenus();
  wireAiUI();
  wireMobileUI();
  wireRssUI();
  wireIpc();

  // ربط زر معاينة الأرشيف في نافذة التحميل الجديد (8.1)
  const btnPrevArc = $('#btnPreviewArchive');
  if (btnPrevArc) {
    btnPrevArc.addEventListener('click', () => {
      const u = ($('#addUrl') && $('#addUrl').value.trim()) || '';
      if (u) openArchivePreview(u);
    });
  }

  // دعم اختصارات لوحة المفاتيح وإمكانية الوصول a11y (المرحلة 11.5)
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      openAdd();
    } else if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      const s = $('#search');
      if (s) { s.focus(); s.select(); }
    } else if (e.ctrlKey && e.key === ',') {
      e.preventDefault();
      openSettings();
    } else if (e.key === 'Escape') {
      document.querySelectorAll('.modal:not([hidden])').forEach(m => m.hidden = true);
    }
  });

  state.settings = await window.pdm.invoke('getSettings');
  window.setLang(state.settings.language || 'ar');
  applyTheme(state.settings.theme, state.settings.accentColor, state.settings.density);
  state.tasks = new Map((await window.pdm.invoke('list')).map(t => [t.id, t]));
  state.summary = await window.pdm.invoke('summary');
  window.addEventListener('resize', () => { if (state.view === 'dashboard') drawSpeedChart(); });
  render();
  window.__bootOk = true;
})();
