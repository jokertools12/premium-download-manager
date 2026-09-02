/* Premium Download Manager — نقطة الإقلاع
   المنطق مقسّم إلى وحدات:
     lib/format.js  lib/dom.js  state.js
     ui/{sidebar,taskcard,dashboard,render,modals,video,torrent,contextmenu,updates}.js
     events.js
   ملاحظة: escapeHtml/escapeAttr/t تُعرَّف بواسطة سكربتات كلاسيكية (lib/sanitize.js، i18n.js)
   تُحمَّل في index.html قبل هذه الوحدة. */

import { state } from './state.js';
import { applyTheme } from './lib/dom.js';
import { render } from './ui/render.js';
import { drawSpeedChart } from './ui/dashboard.js';
import { wireMainUI, wireIpc } from './events.js';
import { wireModals, wireExtUI } from './ui/modals.js';
import { wireVideoUI } from './ui/video.js';
import { wireTorrentUI } from './ui/torrent.js';
import { wireContextMenus } from './ui/contextmenu.js';

(async function init() {
  wireMainUI();
  wireModals();
  wireExtUI();
  wireVideoUI();
  wireTorrentUI();
  wireContextMenus();
  wireIpc();
  state.settings = await window.pdm.invoke('getSettings');
  window.setLang(state.settings.language || 'ar');
  applyTheme(state.settings.theme, state.settings.accentColor, state.settings.density);
  state.tasks = new Map((await window.pdm.invoke('list')).map(t => [t.id, t]));
  state.summary = await window.pdm.invoke('summary');
  window.addEventListener('resize', () => { if (state.view === 'dashboard') drawSpeedChart(); });
  render();
  window.__bootOk = true; // علامة فحص مؤقتة
})();
