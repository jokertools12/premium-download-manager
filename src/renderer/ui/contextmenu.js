/* قائمة كليك يمين: قائمة المهام + قائمة البرنامج العامة */

import { $, toast } from '../lib/dom.js';
import { state, STREAM_RE } from '../state.js';
import { render } from './render.js';
import { removeCardEl } from './taskcard.js';
import { openAdd, openImport, openSettings } from './modals.js';
import { openVideoModal } from './video.js';
import { openTorrentModal } from './torrent.js';

let ctxMenuEl = null;

export function closeContextMenu() {
  if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
  document.removeEventListener('click', closeContextMenu, true);
  window.removeEventListener('blur', closeContextMenu, true);
  document.removeEventListener('contextmenu', closeContextMenu, true);
}

export function showContextMenu(items, x, y) {
  closeContextMenu();
  ctxMenuEl = document.createElement('div');
  ctxMenuEl.className = 'ctx-menu';
  ctxMenuEl.innerHTML = items.map(i => {
    if (i === '-') return '<div class="ctx-sep"></div>';
    return `<div class="ctx-item" data-ctx="${i.id}"><span class="ci-icon">${i.icon || ''}</span><span>${i.label}</span></div>`;
  }).join('');
  document.body.appendChild(ctxMenuEl);
  const r = ctxMenuEl.getBoundingClientRect();
  ctxMenuEl.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
  ctxMenuEl.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
  ctxMenuEl.addEventListener('click', async e => {
    const item = e.target.closest('.ctx-item');
    if (!item) return;
    const id = item.dataset.ctx;
    closeContextMenu();
    await handleContextAction(id);
  });
  setTimeout(() => {
    document.addEventListener('click', closeContextMenu, true);
    window.addEventListener('blur', closeContextMenu, true);
    document.addEventListener('contextmenu', closeContextMenu, true);
  }, 0);
}

async function handleContextAction(id) {
  const t = state.ctxTask;
  try {
    if (id.startsWith('task:')) {
      const action = id.slice(5);
      switch (action) {
        case 'open': return void window.pdm.invoke('openFile', { id: t.id });
        case 'folder': return void window.pdm.invoke('showInFolder', { id: t.id });
        case 'copy': return void window.pdm.invoke('copyText', { text: t.url });
        case 'pause': return void window.pdm.invoke('pause', t.id);
        case 'resume': return void window.pdm.invoke('resume', t.id);
        case 'restart': return void window.pdm.invoke('restart', t.id);
        case 'remove':
          state.tasks.delete(t.id);
          removeCardEl(t.id);
          render();
          window.pdm.invoke('remove', { id: t.id, deleteFile: false });
          return;
        case 'removeFile':
          if (window.confirm(window.t('ctx.confirmDeleteFile'))) {
            state.tasks.delete(t.id);
            removeCardEl(t.id);
            render();
            window.pdm.invoke('remove', { id: t.id, deleteFile: true });
          }
          return;
        case 'vcancel': return void window.pdm.invoke('video:cancel', { id: t.id });
        case 'vremove':
          state.tasks.delete(t.id);
          removeCardEl(t.id);
          render();
          window.pdm.invoke('video:remove', { id: t.id, deleteFile: false });
          return;
        case 'vremoveFile':
          if (window.confirm(window.t('ctx.confirmDeleteFile'))) {
            state.tasks.delete(t.id);
            removeCardEl(t.id);
            render();
            window.pdm.invoke('video:remove', { id: t.id, deleteFile: true });
          }
          return;
        case 'tcancel': return void window.pdm.invoke('torrent:cancel', { id: t.id });
        case 'tremove':
          state.tasks.delete(t.id);
          removeCardEl(t.id);
          render();
          window.pdm.invoke('torrent:remove', { id: t.id, deleteFile: false });
          return;
        case 'tremoveFile':
          if (window.confirm(window.t('ctx.confirmDeleteFile'))) {
            state.tasks.delete(t.id);
            removeCardEl(t.id);
            render();
            window.pdm.invoke('torrent:remove', { id: t.id, deleteFile: true });
          }
          return;
      }
    } else if (id.startsWith('app:')) {
      await handleAppAction(id.slice(4));
    }
  } catch (err) {
    toast('⚠️ ' + (err.message || err), 'err');
  }
}

async function handleAppAction(action) {
  switch (action) {
    case 'add': return openAdd('');
    case 'video': return openVideoModal('');
    case 'torrent': return openTorrentModal();
    case 'import': return openImport();
    case 'pauseAll': return window.pdm.invoke('pauseAll');
    case 'resumeAll': return window.pdm.invoke('resumeAll');
    case 'clear': return window.pdm.invoke('clearCompleted');
    case 'folder': return window.pdm.invoke('openDownloadsFolder');
    case 'float': return window.pdm.invoke('float:toggle');
    case 'dashboard':
      state.view = 'dashboard';
      state.dashboardStats = await window.pdm.invoke('getStats');
      return render();
    case 'settings': return openSettings();
    case 'paste': {
      const text = await navigator.clipboard.readText().catch(() => '');
      const m = String(text).match(/https?:\/\/[^\s]+/i);
      if (m) {
        if (STREAM_RE.test(m[0])) openVideoModal(m[0]);
        else openAdd(m[0]);
      } else toast(window.t('ctx.noLink'), 'err');
      return;
    }
  }
}

/* ===== ربط قوائم كليك يمين ===== */
export function wireContextMenus() {
  // قائمة المهام: كليك يمين على بطاقة تحميل
  $('#list').addEventListener('contextmenu', e => {
    const card = e.target.closest('.task');
    if (!card) return;
    e.preventDefault();
    const t = state.tasks.get(card.dataset.id);
    if (!t) return;
    state.ctxTask = t;
    const isVideo = t.kind === 'video';
    const isTorrent = t.kind === 'torrent';
    const items = [];
    if (t.status === 'completed' && t.filePath) {
      items.push({ id: 'task:open', icon: '📂', label: window.t('act.open') });
      items.push({ id: 'task:folder', icon: '🗂️', label: window.t('act.folder') });
      items.push('-');
    }
    if (isVideo || isTorrent) {
      if (t.status === 'downloading') {
        items.push({ id: isTorrent ? 'task:tcancel' : 'task:vcancel', icon: '✕', label: window.t('act.vcancel') });
      }
      items.push({ id: isTorrent ? 'task:tremove' : 'task:vremove', icon: '🗑️', label: window.t('ctx.removeTask') });
      items.push({ id: isTorrent ? 'task:tremoveFile' : 'task:vremoveFile', icon: '💥', label: window.t('ctx.removeWithFile') });
    } else {
      if (['downloading', 'queued'].includes(t.status)) items.push({ id: 'task:pause', icon: '⏸', label: window.t('act.pause') });
      if (['paused', 'failed', 'canceled'].includes(t.status)) items.push({ id: 'task:resume', icon: '▶', label: window.t('act.resume') });
    }
    items.push({ id: 'task:copy', icon: '🔗', label: window.t('ctx.copyLink') });
    if (!isVideo && !isTorrent && ['completed', 'failed', 'paused', 'downloading'].includes(t.status)) {
      items.push({ id: 'task:restart', icon: '🔄', label: window.t('act.restart') });
    }
    items.push('-');
    items.push({ id: 'task:remove', icon: '🗑️', label: window.t('ctx.removeTask') });
    if (!isVideo && !isTorrent) {
      items.push({ id: 'task:removeFile', icon: '💥', label: window.t('ctx.removeWithFile') });
    }
    showContextMenu(items, e.clientX, e.clientY);
  });

  // قائمة البرنامج: كليك يمين على الخلفية/الفراغ
  $('#main').addEventListener('contextmenu', e => {
    if (e.target.closest('.task') || e.target.closest('#toolbar')) return;
    if (state.view === 'dashboard') return;
    e.preventDefault();
    showContextMenu([
      { id: 'app:add', icon: '＋', label: window.t('toolbar.add') },
      { id: 'app:video', icon: '🎬', label: window.t('toolbar.video') },
      { id: 'app:torrent', icon: '🧲', label: window.t('toolbar.torrent') },
      { id: 'app:import', icon: '📄', label: window.t('import.title') },
      { id: 'app:paste', icon: '📋', label: window.t('ctx.paste') },
      '-',
      { id: 'app:pauseAll', icon: '⏸', label: window.t('toolbar.pauseAllTitle') },
      { id: 'app:resumeAll', icon: '▶', label: window.t('toolbar.resumeAllTitle') },
      { id: 'app:clear', icon: '🧹', label: window.t('toolbar.clearTitle') },
      '-',
      { id: 'app:folder', icon: '📂', label: window.t('ctx.downloadsFolder') },
      { id: 'app:float', icon: '📌', label: window.t('toolbar.floatTitle') },
      { id: 'app:dashboard', icon: '📊', label: window.t('side.dashboard') },
      { id: 'app:settings', icon: '⚙️', label: window.t('side.settings') }
    ], e.clientX, e.clientY);
  });
}