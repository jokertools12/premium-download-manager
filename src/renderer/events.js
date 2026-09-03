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
import { openPreview, openStreamPreview } from './ui/preview.js';
import { findHistory } from './ui/history.js';
import { openGrabber, scanGrab, grabDownloadSelected } from './ui/grabber.js';
import { openTranscodeModal, wireTranscodeModal } from './ui/transcode.js';
import { openAiSummaryModal, wireAiSummaryModal } from './ui/ai-summary.js';

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
        // إشعارات الإكمال/الفشل بأزرار إجراء (3.4) — للمهام العادية فقط
        if (!t.kind && prev && prev.status !== t.status) {
          if (t.status === 'completed') {
            toast(window.t('notif.done', { name: t.filename || '' }), 'ok', [
              { label: '📂', onClick: () => window.pdm.invoke('openFile', { id: t.id }) },
              { label: '🗂️', onClick: () => window.pdm.invoke('showInFolder', { id: t.id }) }
            ]);
          } else if (t.status === 'failed') {
            toast(window.t('notif.failed', { name: t.filename || '' }), 'err', [
              { label: '▶', onClick: () => window.pdm.invoke('resume', t.id) }
            ]);
          }
        }
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
    } else if (data.type === 'mp3') {
      // استخراج MP3 (4.3)
      toast(data.ok ? window.t('mp3.done', { name: data.name || '' }) : window.t('mp3.failed'), data.ok ? 'ok' : 'err');
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
  const btnToggleSidebar = $('#btnToggleSidebar');
  if (btnToggleSidebar) {
    btnToggleSidebar.onclick = () => {
      const sb = $('#sidebar');
      if (sb) sb.classList.toggle('sidebar-hidden');
    };
  }

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
  $('#btnGrab').onclick = () => openGrabber('');
  $('#btnGrabScan').onclick = scanGrab;
  $('#grabUrl').addEventListener('keydown', e => { if (e.key === 'Enter') scanGrab(); });
  $('#btnGrabDownload').onclick = grabDownloadSelected;
  $('#btnSettings').onclick = openSettings;

  wireTranscodeModal();
  wireAiSummaryModal();

  const openTranscodeHandler = () => openTranscodeModal({ filePath: '', filename: '' });
  const openAiHandler = () => openAiSummaryModal({ filePath: '', filename: '' });

  const btnOpenTranscodeSide = $('#btnOpenTranscodeSide');
  if (btnOpenTranscodeSide) btnOpenTranscodeSide.onclick = openTranscodeHandler;
  const btnTbTranscode = $('#btnTbTranscode');
  if (btnTbTranscode) btnTbTranscode.onclick = openTranscodeHandler;

  const btnOpenAiSummarySide = $('#btnOpenAiSummarySide');
  if (btnOpenAiSummarySide) btnOpenAiSummarySide.onclick = openAiHandler;
  const btnTbAi = $('#btnTbAi');
  if (btnTbAi) btnTbAi.onclick = openAiHandler;

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

  // السجل الكامل (3.2)
  $('#btnHistory').onclick = async () => {
    state.view = 'history';
    state.history = await window.pdm.invoke('getHistory');
    render();
  };
  $('#btnClearHistory').onclick = async () => {
    await window.pdm.invoke('clearHistory');
    state.history = [];
    render();
    toast(window.t('hist.cleared'), 'ok');
  };
  $('#histList').addEventListener('click', e => {
    const b = e.target.closest('[data-hact]');
    if (!b) return;
    const rec = findHistory(b.dataset.id);
    if (!rec) return;
    const act = b.dataset.hact;
    if (act === 'open') window.pdm.invoke('openPath', { path: rec.filePath });
    else if (act === 'folder') window.pdm.invoke('revealPath', { path: rec.filePath });
    else if (act === 'redownload') {
      window.pdm.invoke('add', { url: rec.url, filename: rec.filename || undefined });
      state.view = 'tasks';
      render();
    } else if (act === 'del') {
      state.history = state.history.filter(h => h.id !== rec.id);
      window.pdm.invoke('removeHistory', { id: rec.id });
      render();
    }
  });

  // الفرز الفوري (3.1) والقائمة المنسدلة المخصصة
  const sortDropdown = $('#sortDropdown');
  const sortDropdownBtn = $('#sortDropdownBtn');
  const sortDropdownLabel = $('#sortDropdownLabel');

  if (sortDropdown && sortDropdownBtn) {
    sortDropdownBtn.onclick = e => {
      e.stopPropagation();
      const isOpen = sortDropdown.classList.contains('open');
      sortDropdown.classList.toggle('open', !isOpen);
      sortDropdown.setAttribute('aria-expanded', String(!isOpen));
    };

    sortDropdown.addEventListener('click', e => {
      const item = e.target.closest('.dropdown-item');
      if (!item) return;
      e.stopPropagation();
      const val = item.dataset.val;
      if (!val) return;
      state.sort.key = val;
      const nativeSelect = $('#sortKey');
      if (nativeSelect) nativeSelect.value = val;
      const labelEl = item.querySelector('.item-label');
      if (labelEl && sortDropdownLabel) sortDropdownLabel.textContent = labelEl.textContent;
      for (const it of sortDropdown.querySelectorAll('.dropdown-item')) {
        const isAct = it === item;
        it.classList.toggle('active', isAct);
        it.setAttribute('aria-selected', String(isAct));
      }
      sortDropdown.classList.remove('open');
      sortDropdown.setAttribute('aria-expanded', 'false');
      render();
    });

    document.addEventListener('click', e => {
      if (!sortDropdown.contains(e.target)) {
        sortDropdown.classList.remove('open');
        sortDropdown.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && sortDropdown.classList.contains('open')) {
        sortDropdown.classList.remove('open');
        sortDropdown.setAttribute('aria-expanded', 'false');
      }
    });
  }

  $('#sortKey').onchange = e => { state.sort.key = e.target.value; render(); };
  $('#btnSortDir').onclick = () => {
    state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    $('#btnSortDir').textContent = state.sort.dir === 'asc' ? '↑' : '↓';
    render();
  };

  // أزرار التحميلات (تفويض الأحداث) + تحديد البطاقة
  $('#list').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) {
      // تحديد بالنقر (3.5) — مساحة/حذف يعملان على المحدد
      const card = e.target.closest('.task');
      if (card) selectTask(card.dataset.id);
      return;
    }
    const { act, id } = b.dataset;
    if (act === 'pause') window.pdm.invoke('pause', id);
    else if (act === 'resume') window.pdm.invoke('resume', id);
    else if (act === 'restart') window.pdm.invoke('restart', id);
    else if (act === 'up') window.pdm.invoke('moveUp', id);
    else if (act === 'down') window.pdm.invoke('moveDown', id);
    else if (act === 'now') window.pdm.invoke('downloadNow', id);
    else if (act === 'open') window.pdm.invoke('openPath', { path: (state.tasks.get(id) || {}).filePath || '' });
    else if (act === 'preview') openPreview(state.tasks.get(id));
    else if (act === 'folder') window.pdm.invoke('revealPath', { path: (state.tasks.get(id) || {}).filePath || '' });
    else if (act === 'shield-scan') {
      const t = state.tasks.get(id);
      if (!t || !t.filePath) return toast('مسار الملف غير متوفر', 'err');
      try {
        toast('🛡️ جاري الفحص الأمني للبصمة الرقمية...', 'ok');
        const res = await window.pdm.invoke('security:scan', { filePath: t.filePath });
        if (res.isSafe) {
          toast(`🛡️ فحص الأمان: الملف آمن 100% (SHA-256: ${res.sha256.slice(0, 12)}...)`, 'ok');
        } else if (res.riskLevel === 'danger') {
          toast(`⚠️ خطر أمني: ${res.reasons.join(' | ')}`, 'err');
        } else {
          toast(`ℹ️ تنبيه أمني: ${res.reasons.join(' | ')}`, 'warn');
        }
      } catch (err) {
        toast('فشل الفحص الأمني: ' + (err.message || err), 'err');
      }
    }
    else if (act === 'transcode') {
      const t = state.tasks.get(id);
      if (!t || !t.filePath) return toast('مسار الملف غير متوفر', 'err');
      openTranscodeModal(t);
    }
    else if (act === 'ai-summary') {
      const t = state.tasks.get(id);
      if (!t || !t.filePath) return toast('مسار الملف غير متوفر', 'err');
      openAiSummaryModal(t);
    }
    else if (act === 'remove') {
      // حذف فوري من الواجهة (تفاؤلي) ثم تأكيد من النواة
      state.tasks.delete(id);
      const el = document.querySelector(`.task[data-id="${id}"]`);
      if (el) el.remove();
      render();
      window.pdm.invoke('remove', { id, deleteFile: false });
    }
    else if (act === 'vcancel') window.pdm.invoke('video:cancel', { id });
    else if (act === 'vmp3') {
      try {
        await window.pdm.invoke('video:extractAudio', { id });
        toast(window.t('mp3.started'), 'ok');
      } catch (err) {
        toast(window.t('mp3.failed') + ': ' + (err.message || err), 'err');
      }
    }
    else if (act === 'vremove') {
      state.tasks.delete(id);
      removeCardEl(id);
      render();
      window.pdm.invoke('video:remove', { id, deleteFile: false });
    }
    else if (act === 'tcancel') window.pdm.invoke('torrent:cancel', { id });
    else if (act === 'tpause') window.pdm.invoke('torrent:pause', { id });
    else if (act === 'tresume') window.pdm.invoke('torrent:resume', { id });
    else if (act === 'tstream') {
      try {
        const res = await window.pdm.invoke('torrent:streamUrl', { id });
        if (res && res.streamUrl) {
          openStreamPreview({ url: res.streamUrl, title: res.fileName, size: res.length });
        }
      } catch (err) {
        toast('تعذر بدء البث المباشر: ' + (err.message || err), 'err');
      }
    }
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

  wireShortcuts();
}

/* تحديد بطاقة (3.5) — يحدّث الصنف مباشرة دون إعادة بناء القائمة */
function selectTask(id) {
  state.selectedId = state.selectedId === id ? null : id;
  for (const el of document.querySelectorAll('#list .task')) {
    el.classList.toggle('selected', el.dataset.id === state.selectedId);
  }
}

/* اختصارات لوحة المفاتيح (3.5): Ctrl+N جديد، Ctrl+F بحث، أسهم تحديد،
   Space إيقاف/استئناف، Delete حذف، Escape إغلاق/إلغاء تحديد */
function wireShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      let closed = false;
      for (const m of document.querySelectorAll('.modal')) {
        if (!m.hidden) { m.hidden = true; closed = true; }
      }
      if (closed) {
        const pv = document.querySelector('#pvBody');
        if (pv) pv.innerHTML = ''; // أوقف التشغيل
      } else if (state.selectedId) {
        state.selectedId = null;
        selectTask(state.selectedId);
      }
      return;
    }
    const ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); openAdd(''); return; }
    if (mod && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); $('#search').focus(); return; }
    if (state.view !== 'tasks') return;
    const cards = [...document.querySelectorAll('#list .task')];
    if (!cards.length) return;
    const idx = cards.findIndex(c => c.dataset.id === state.selectedId);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectTask(cards[Math.min(cards.length - 1, idx + 1)].dataset.id);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectTask(cards[Math.max(0, idx - 1)].dataset.id);
    } else if (e.key === 'Delete' && state.selectedId) {
      e.preventDefault();
      window.pdm.invoke('remove', { id: state.selectedId, deleteFile: false });
      state.selectedId = null;
      render();
    } else if (e.key === ' ' && state.selectedId) {
      e.preventDefault();
      const t = state.tasks.get(state.selectedId);
      if (!t) return;
      if (t.status === 'downloading' || t.status === 'queued') window.pdm.invoke('pause', t.id);
      else window.pdm.invoke('resume', t.id);
    }
  });
}