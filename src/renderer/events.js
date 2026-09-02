/* ربط الأحداث: قناة الأحداث من النواة (IPC) + أزرار الشريط الرئيسي */

import { $, toast, closeModal } from '../lib/dom.js';
import { fmtSpeed } from '../lib/format.js';
import { state, STREAM_RE } from '../state.js';
import { render, renderSoon } from './ui/render.js';
import { patchTaskCard, removeCardEl } from './ui/taskcard.js';
import { renderSidebar } from './ui/sidebar.js';
import { drawSpeedChart } from './ui/dashboard.js';
import { handleUpdateEvent } from './ui/updates.js';
import { openAdd, openImport, openRules, openSettings } from './ui/modals.js';
import { openVideoModal } from './ui/video.js';
import { openTorrentModal } from './ui/torrent.js';

/* ===== أحداث النواة ===== */
export function wireIpc() {
  window.pdm.onEvent(data => {
    if (!data) return;
    if (data.type === 'tasks') {
      let structural = false;
      // القائمة الكاملة: مزامنة الحذف (مهام محذوفة من النواة تُزال من الواجهة)
      if (data.full) {
        const allIds = new Set(data.tasks.map(t => t.id));
        for (const id of [...state.tasks.keys()]) {
          const k = state.tasks.get(id).kind;
          if (k === undefined && !allIds.has(id)) { state.tasks.delete(id); structural = true; }
        }
      }
      for (const t of data.tasks) {
        const prev = state.tasks.get(t.id);
        // تجاهل التحديثات التفاضلية لمهام غير معروفة (أحداث قديمة بعد الحذف)
        if (!prev && !data.full) continue;
        state.tasks.set(t.id, t);
        // أثناء التحميل: تحديث متزايد للبطاقة فقط (بدون إعادة بناء القائمة)
        if (prev && prev.status === t.status && t.status === 'downloading' && state.view === 'tasks') {
          if (!patchTaskCard(t)) structural = true;
        } else {
          structural = true;
        }
      }
      state.summary = data.summary;
      // تحديث عداد السرعة فوراً (بدون تأخير العرض)
      $('#totalSpeed').innerHTML = `<span>▲</span> ${fmtSpeed((state.summary && state.summary.speed) || 0)}`;
      renderSidebar();
      if (structural) renderSoon();
    } else if (data.type === 'clipboard') {
      if (STREAM_RE.test(data.url)) openVideoModal(data.url);
      else openAdd(data.url);
      toast(window.t('clip.captured'));
    } else if (data.type === 'speedHistory') {
      state.speedSamples = data.samples || [];
      if (state.view === 'dashboard') drawSpeedChart();
    } else if (data.type === 'videos') {
      syncKindTasks(data.videos || [], 'video', data.summary);
    } else if (data.type === 'torrents') {
      syncKindTasks(data.torrents || [], 'torrent', data.summary);
    } else if (data.type === 'update') {
      handleUpdateEvent(data.update);
    } else if (data.type === 'extracted') {
      // فك الأرشيف التلقائي (2.3)
      toast(data.ok ? window.t('extract.done') : window.t('extract.failed'), data.ok ? 'ok' : 'err');
    } else if (data.type === 'win') {
      $('#btnMax').textContent = data.maximized ? '❐' : '□';
    }
  });
}

/* مزامنة مهام الفيديو/التورنت: حذف المحذوف ثم دمج (مع تحديث متزايد للنشطة) */
function syncKindTasks(items, kind, summary) {
  let structural = false;
  const ids = new Set(items.map(v => v.id));
  for (const id of [...state.tasks.keys()]) {
    if (state.tasks.get(id).kind === kind && !ids.has(id)) {
      state.tasks.delete(id);
      structural = true;
    }
  }
  for (const v of items) {
    const prev = state.tasks.get(v.id);
    state.tasks.set(v.id, v);
    if (prev && prev.status === v.status && v.status === 'downloading' && state.view === 'tasks') {
      if (!patchTaskCard(v)) structural = true;
    } else if (!prev || prev.status !== v.status) {
      structural = true;
    }
  }
  state.summary = summary;
  $('#totalSpeed').innerHTML = `<span>▲</span> ${fmtSpeed((state.summary && state.summary.speed) || 0)}`;
  renderSidebar();
  if (structural) renderSoon();
}

/* ===== أزرار الشريط الرئيسي والقائمة والأحداث العامة ===== */
export function wireMainUI() {
  // شريط العنوان
  $('#btnMin').onclick = () => window.pdm.invoke('win:minimize');
  $('#btnMax').onclick = () => window.pdm.invoke('win:maximize');
  $('#btnClose').onclick = () => window.pdm.invoke('win:close');

  // شريط الأدوات
  $('#btnAdd').onclick = () => openAdd('');
  $('#btnPauseAll').onclick = () => window.pdm.invoke('pauseAll');
  $('#btnResumeAll').onclick = () => window.pdm.invoke('resumeAll');
  $('#btnClear').onclick = () => window.pdm.invoke('clearCompleted');
  $('#btnFloat').onclick = () => window.pdm.invoke('float:toggle');
  $('#btnImport').onclick = openImport;
  $('#btnRules').onclick = openRules;
  $('#btnVideo').onclick = () => openVideoModal('');
  $('#btnTorrent').onclick = openTorrentModal;
  $('#btnSettings').onclick = openSettings;

  // القائمة الجانبية
  $('#sidebar').addEventListener('click', e => {
    const b = e.target.closest('[data-filter]');
    if (b) { state.filter = b.dataset.filter; state.view = 'tasks'; render(); }
  });

  // لوحة الإحصائيات
  $('#btnDashboard').onclick = async () => {
    state.view = 'dashboard';
    state.dashboardStats = await window.pdm.invoke('getStats');
    render();
  };

  // أزرار التحميلات (تفويض الأحداث)
  $('#list').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const { act, id } = b.dataset;
    if (act === 'pause') window.pdm.invoke('pause', id);
    else if (act === 'resume') window.pdm.invoke('resume', id);
    else if (act === 'restart') window.pdm.invoke('restart', id);
    else if (act === 'up') window.pdm.invoke('moveUp', id);
    else if (act === 'down') window.pdm.invoke('moveDown', id);
    else if (act === 'now') window.pdm.invoke('downloadNow', id);
    else if (act === 'open') window.pdm.invoke('openFile', { id });
    else if (act === 'folder') window.pdm.invoke('showInFolder', { id });
    else if (act === 'remove') {
      // حذف فوري من الواجهة (تفاؤلي) ثم تأكيد من النواة
      state.tasks.delete(id);
      const el = document.querySelector(`.task[data-id="${id}"]`);
      if (el) el.remove();
      render();
      window.pdm.invoke('remove', { id, deleteFile: false });
    }
    else if (act === 'vcancel') window.pdm.invoke('video:cancel', { id });
    else if (act === 'vremove') {
      state.tasks.delete(id);
      removeCardEl(id);
      render();
      window.pdm.invoke('video:remove', { id, deleteFile: false });
    }
    else if (act === 'tcancel') window.pdm.invoke('torrent:cancel', { id });
    else if (act === 'tremove') {
      state.tasks.delete(id);
      removeCardEl(id);
      render();
      window.pdm.invoke('torrent:remove', { id, deleteFile: false });
    }
  });

  // إغلاق النوافذ
  document.querySelectorAll('[data-close]').forEach(b => {
    b.onclick = () => closeModal(b.dataset.close);
  });

  // البحث
  $('#search').oninput = e => { state.search = e.target.value.trim(); render(); };

  // أزرار التحديث التلقائي
  $('#btnUpdateInstall').onclick = () => window.pdm.invoke('update:install');
  $('#btnUpdateClose').onclick = () => { $('#updateBanner').hidden = true; };
  $('#btnCheckUpdate').onclick = async () => {
    toast(window.t('update.checking'));
    try {
      const st = await window.pdm.invoke('update:check');
      if (st.status === 'none') toast(window.t('update.none'), 'ok');
      else if (st.status === 'dev') toast(window.t('update.dev'));
      else if (st.status === 'error') toast(window.t('update.error', { msg: st.error }), 'err');
      // باقي الحالات يعرضها شريط التحديث تلقائياً
    } catch (err) {
      toast(window.t('update.error', { msg: err.message || err }), 'err');
    }
  };

  // سحب وإفلات الروابط
  document.body.addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
  document.body.addEventListener('dragleave', e => {
    if (e.target === document.body) document.body.classList.remove('dragging');
  });
  document.body.addEventListener('drop', e => {
    e.preventDefault();
    document.body.classList.remove('dragging');
    const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '';
    const m = text.match(/https?:\/\/[^\s]+/i);
    if (m) {
      if (STREAM_RE.test(m[0])) openVideoModal(m[0]);
      else openAdd(m[0]);
    }
  });
}