'use strict';

/* Premium Download Manager - منطق الواجهة */

const $ = s => document.querySelector(s);

const FILTERS = [
  { id: 'all', key: 'filter.all', icon: '📥' },
  { id: 'downloading', key: 'filter.downloading', icon: '⬇️' },
  { id: 'queued', key: 'filter.queued', icon: '⏳' },
  { id: 'paused', key: 'filter.paused', icon: '⏸' },
  { id: 'completed', key: 'filter.completed', icon: '✅' },
  { id: 'failed', key: 'filter.failed', icon: '⚠️' }
];

const CATEGORIES = [
  { id: 'video', key: 'cat.video', icon: '🎬' },
  { id: 'audio', key: 'cat.audio', icon: '🎵' },
  { id: 'image', key: 'cat.image', icon: '🖼️' },
  { id: 'document', key: 'cat.document', icon: '📄' },
  { id: 'compressed', key: 'cat.compressed', icon: '🗜️' },
  { id: 'program', key: 'cat.program', icon: '⚙️' },
  { id: 'other', key: 'cat.other', icon: '📦' }
];

const statusLabel = s => window.t('status.' + s);
const CAT_ICON = Object.fromEntries(CATEGORIES.map(c => [c.id, c.icon]));

const state = {
  tasks: new Map(),
  filter: 'all',
  view: 'tasks',
  search: '',
  settings: null,
  summary: {},
  speedSamples: [],
  dashboardStats: null,
  rulesDraft: [],
  renderPending: false
};

/* ===== أدوات التنسيق ===== */
function fmtBytes(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i === 0 ? Math.round(v) : v.toFixed(v >= 100 ? 0 : 1)) + ' ' + u[i];
}
const fmtSpeed = n => fmtBytes(n) + '/ث';

function fmtEta(t) {
  if (!t.size || !t.speed) return '—';
  const s = Math.max(0, Math.round((t.size - t.received) / t.speed));
  if (s > 3600) return '≈ ' + Math.round(s / 3600) + ' ' + window.t('eta.h');
  if (s > 60) return '≈ ' + Math.round(s / 60) + ' ' + window.t('eta.m');
  return '≈ ' + s + ' ' + window.t('eta.s');
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ===== القائمة الجانبية ===== */
function renderSidebar() {
  const count = f => {
    if (f === 'all') return state.tasks.size;
    if (f === 'downloading') return [...state.tasks.values()].filter(t => ['downloading', 'queued'].includes(t.status)).length;
    return [...state.tasks.values()].filter(t => t.status === f).length;
  };
  $('#sideFilters').innerHTML = FILTERS.map(f => `
    <button class="side-item ${state.filter === f.id ? 'active' : ''}" data-filter="${f.id}">
      <span>${f.icon}</span><span>${window.t(f.key)}</span><span class="count">${count(f.id)}</span>
    </button>`).join('');

  const catCount = c => [...state.tasks.values()].filter(t => t.category === c).length;
  $('#sideCats').innerHTML = CATEGORIES.map(c => `
    <button class="side-item ${state.filter === 'cat:' + c.id ? 'active' : ''}" data-filter="cat:${c.id}">
      <span>${c.icon}</span><span>${window.t(c.key)}</span><span class="count">${catCount(c.id)}</span>
    </button>`).join('');
}

function filteredTasks() {
  let arr = [...state.tasks.values()];
  if (state.filter === 'downloading') arr = arr.filter(t => ['downloading', 'queued'].includes(t.status));
  else if (state.filter.startsWith('cat:')) arr = arr.filter(t => t.category === state.filter.slice(4));
  else if (state.filter !== 'all') arr = arr.filter(t => t.status === state.filter);
  if (state.search) {
    const q = state.search.toLowerCase();
    arr = arr.filter(t => (t.filename || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q));
  }
  return arr.sort((a, b) => b.createdAt - a.createdAt);
}

/* ===== عرض التحميلات ===== */
function taskPct(t) {
  return t.size
    ? Math.min(100, (t.received / t.size) * 100)
    : (t.kind === 'video' && t.percent != null ? Math.min(100, t.percent)
      : (t.kind === 'torrent' && t.percent != null ? Math.min(100, t.percent)
        : (t.status === 'completed' ? 100 : 0)));
}

function segsHtml(t) {
  if (t.status !== 'downloading' || !t.segments || t.segments.length <= 1) return '';
  return `<div class="segstrip">${t.segments.map(s => {
    const len = (s.end === null ? 1 : s.end - s.start + 1);
    const p = Math.min(100, (s.received / len) * 100);
    return `<div><div style="width:${p}%"></div></div>`;
  }).join('')}</div>`;
}

function cardMetaInner(t, pct, isVideo, isTorrent) {
  return `
        <span class="badge ${t.status}">${statusLabel(t.status)}</span>
        <span>${fmtBytes(t.received)}${t.size ? ' / ' + fmtBytes(t.size) : ''} (${pct.toFixed(0)}%)</span>
        ${t.status === 'downloading' ? `<span class="speed">▲ ${fmtSpeed(t.speed)}</span>` : ''}
        ${t.status === 'downloading' && !isVideo && !isTorrent ? `<span>${fmtEta(t)}</span>` : ''}
        ${isVideo && t.status === 'downloading' && t.phase ? `<span>${t.phase}</span>` : ''}
        ${isVideo && t.isPlaylist && t.itemsTotal ? `<span>${t.itemsDone || 0} / ${t.itemsTotal}</span>` : ''}
        ${isTorrent && t.status === 'downloading' && t.peers != null ? `<span>${window.t('torrent.peers', { n: t.peers })}</span>` : ''}
        ${!isVideo && !isTorrent && t.status === 'downloading' && t.connections ? `<span>${window.t('conn.count', { n: t.connections })}</span>` : ''}
        ${t.error ? `<span class="err">${t.error}</span>` : ''}`;
}

function taskCard(t) {
  const isVideo = t.kind === 'video';
  const isTorrent = t.kind === 'torrent';
  const pct = taskPct(t);
  const segs = segsHtml(t);
  const actions = cardActions(t, isVideo, isTorrent);

  return `
  <div class="task" data-id="${t.id}" data-status="${t.status}">
    <div class="t-icon">${isTorrent ? '🧲' : (isVideo ? '🎬' : (CAT_ICON[t.category] || '📦'))}</div>
    <div class="t-main">
      <div class="t-name" title="${(t.filename || t.title || t.url || '').replace(/"/g, '&quot;')}">${t.filename || t.title || t.url || '...'}</div>
      <div class="bar"><div style="width:${pct.toFixed(1)}%"></div></div>
      ${segs}
      <div class="t-meta">${cardMetaInner(t, pct, isVideo, isTorrent)}</div>
    </div>
    <div class="t-actions">${actions.join('')}</div>
  </div>`;
}

function cardActions(t, isVideo, isTorrent) {
  const actions = [];
  if (isVideo) {
    if (t.status === 'downloading') {
      actions.push(`<button class="btn mini" data-act="vcancel" data-id="${t.id}" title="${window.t('act.vcancel')}">✕</button>`);
    }
    if (t.status === 'completed' && t.filePath) {
      actions.push(`<button class="btn mini" data-act="open" data-id="${t.id}" title="${window.t('act.open')}">📂</button>`);
      actions.push(`<button class="btn mini" data-act="folder" data-id="${t.id}" title="${window.t('act.folder')}">🗂️</button>`);
    }
    actions.push(`<button class="btn mini" data-act="vremove" data-id="${t.id}" title="${window.t('act.vremove')}">🗑️</button>`);
  } else if (isTorrent) {
    if (t.status === 'downloading') {
      actions.push(`<button class="btn mini" data-act="tcancel" data-id="${t.id}" title="${window.t('act.vcancel')}">✕</button>`);
    }
    if (t.status === 'completed' && t.filePath) {
      actions.push(`<button class="btn mini" data-act="folder" data-id="${t.id}" title="${window.t('act.folder')}">🗂️</button>`);
    }
    actions.push(`<button class="btn mini" data-act="tremove" data-id="${t.id}" title="${window.t('act.vremove')}">🗑️</button>`);
  } else {
    if (['downloading', 'queued'].includes(t.status)) {
      actions.push(`<button class="btn mini" data-act="pause" data-id="${t.id}" title="${window.t('act.pause')}">⏸</button>`);
    }
    if (['paused', 'failed', 'canceled'].includes(t.status)) {
      actions.push(`<button class="btn mini" data-act="resume" data-id="${t.id}" title="${window.t('act.resume')}">▶</button>`);
    }
    if (['queued', 'paused'].includes(t.status)) {
      actions.push(`<button class="btn mini" data-act="up" data-id="${t.id}" title="${window.t('act.up')}">▲</button>`);
      actions.push(`<button class="btn mini" data-act="down" data-id="${t.id}" title="${window.t('act.down')}">▼</button>`);
      actions.push(`<button class="btn mini" data-act="now" data-id="${t.id}" title="${window.t('act.now')}">⚡</button>`);
    }
    if (['completed', 'failed', 'paused'].includes(t.status)) {
      actions.push(`<button class="btn mini" data-act="restart" data-id="${t.id}" title="${window.t('act.restart')}">🔄</button>`);
    }
    if (t.status === 'completed') {
      actions.push(`<button class="btn mini" data-act="open" data-id="${t.id}" title="${window.t('act.open')}">📂</button>`);
    }
    if (t.filePath) {
      actions.push(`<button class="btn mini" data-act="folder" data-id="${t.id}" title="${window.t('act.folder')}">🗂️</button>`);
    }
    actions.push(`<button class="btn mini" data-act="remove" data-id="${t.id}" title="${window.t('act.remove')}">🗑️</button>`);
  }
  return actions;
}

/* تحديث متزايد: يحدّث شريط التقدم والبيانات داخل البطاقة الحالية
   بدون إعادة بناء القائمة — يمنع تجمد الواجهة أثناء التحميل */
function patchTaskCard(t) {
  const el = document.querySelector(`.task[data-id="${t.id}"]`);
  if (!el) return false;
  const isVideo = t.kind === 'video';
  const isTorrent = t.kind === 'torrent';
  const pct = taskPct(t);

  const bar = el.querySelector('.bar > div');
  if (bar) bar.style.width = pct.toFixed(1) + '%';

  const segs = segsHtml(t);
  const oldSegs = el.querySelector('.segstrip');
  if (segs) {
    if (oldSegs) oldSegs.outerHTML = segs;
    else {
      const barEl = el.querySelector('.bar');
      if (barEl) barEl.insertAdjacentHTML('afterend', segs);
    }
  } else if (oldSegs) {
    oldSegs.remove();
  }

  const meta = el.querySelector('.t-meta');
  if (meta) meta.innerHTML = cardMetaInner(t, pct, isVideo, isTorrent);
  return true;
}

function render() {
  state.renderPending = false;
  renderSidebar();
  const dash = state.view === 'dashboard';
  $('#toolbar').style.display = dash ? 'none' : 'flex';
  $('#list').style.display = dash ? 'none' : 'flex';
  $('#dashboard').style.display = dash ? 'block' : 'none';
  $('#btnDashboard').classList.toggle('active', dash);
  $('#totalSpeed').innerHTML = `<span>▲</span> ${fmtSpeed((state.summary && state.summary.speed) || 0)}`;
  if (dash) {
    renderDashboard();
    $('#empty').style.display = 'none';
    return;
  }
  const arr = filteredTasks();
  $('#list').innerHTML = arr.map(taskCard).join('');
  $('#empty').style.display = arr.length ? 'none' : 'flex';
}

function renderSoon() {
  if (state.renderPending) return;
  state.renderPending = true;
  setTimeout(render, 300);
}

/* ===== لوحة الإحصائيات ===== */
function renderDashboard() {
  const s = state.dashboardStats || {};
  const today = s.today || {}, week = s.week || {}, total = s.total || {};
  const act = state.summary || {};
  const cards = [
    ['📥', fmtBytes(today.bytes || 0), `${window.t('dash.today')} • ${window.t('files.count', { n: today.files || 0 })}`],
    ['📅', fmtBytes(week.bytes || 0), `${window.t('dash.week')} • ${window.t('files.count', { n: week.files || 0 })}`],
    ['🌍', fmtBytes(total.bytes || 0), `${window.t('dash.total')} • ${window.t('files.count', { n: total.files || 0 })}`],
    ['⚡', fmtSpeed(act.speed || 0), `${window.t('dash.speedNow')} • ${act.downloading || 0} ${window.t('dash.active')}`]
  ];
  $('#statCards').innerHTML = cards.map(([ic, v, l]) =>
    `<div class="stat-card"><div class="ic">${ic}</div><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');

  drawSpeedChart();

  const cats = Object.entries(s.byCategory || {}).sort((a, b) => b[1].bytes - a[1].bytes);
  const maxB = Math.max(1, ...cats.map(c => c[1].bytes));
  $('#catDist').innerHTML = cats.length ? cats.map(([id, d]) => {
    const info = CATEGORIES.find(c => c.id === id);
    return `<div class="cat-row">
      <div class="lbl">${(info && info.icon) || '📦'} ${info ? window.t(info.key) : id}</div>
      <div class="track"><div style="width:${(d.bytes / maxB * 100).toFixed(1)}%"></div></div>
      <div class="val">${fmtBytes(d.bytes)} • ${window.t('files.count', { n: d.count })}</div>
    </div>`;
  }).join('') : `<div class="empty-sub">${window.t('dash.noData')}</div>`;
}

function drawSpeedChart() {
  const cv = $('#speedChart');
  if (!cv || !cv.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr;
  cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.body);
  const border = css.getPropertyValue('--border').trim() || '#333';
  const muted = css.getPropertyValue('--muted').trim() || '#888';
  const accent = css.getPropertyValue('--accent').trim() || '#4f8cff';
  const padB = 22;

  ctx.clearRect(0, 0, w, h);
  const samples = state.speedSamples || [];
  const max = Math.max(1024, ...samples) * 1.15;

  // الشبكة + تسميات المحور
  ctx.font = '10px Segoe UI';
  ctx.strokeStyle = border;
  ctx.fillStyle = muted;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = 4 + ((h - padB - 4) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillText(fmtBytes((max * (4 - i)) / 4) + '/ث', 4, y - 3);
  }
  if (samples.length < 2) {
    ctx.fillStyle = muted;
    ctx.font = '12px Segoe UI';
    ctx.fillText('في انتظار بيانات السرعة...', w / 2 - 70, h / 2);
    return;
  }

  const step = w / 59;
  const pt = i => [
    w - (samples.length - 1 - i) * step,
    (h - padB) - (samples[i] / max) * (h - padB - 6)
  ];

  // المنطقة المعبأة
  ctx.beginPath();
  samples.forEach((v, i) => { const [x, y] = pt(i); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  const lastPt = pt(samples.length - 1);
  ctx.lineTo(lastPt[0], h - padB);
  ctx.lineTo(pt(0)[0], h - padB);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(79, 140, 255, 0.35)');
  g.addColorStop(1, 'rgba(79, 140, 255, 0)');
  ctx.fillStyle = g;
  ctx.fill();

  // الخط
  ctx.beginPath();
  samples.forEach((v, i) => { const [x, y] = pt(i); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  // نقطة القيمة الحالية
  ctx.beginPath();
  ctx.arc(lastPt[0], lastPt[1], 3.5, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.fillStyle = muted;
  ctx.font = '10px Segoe UI';
  ctx.fillText('-60ث', 4, h - 6);
  ctx.fillText('الآن', w - 26, h - 6);
}

/* ===== النوافذ ===== */
function openModal(id) { $('#' + id).hidden = false; }
function closeModal(id) { $('#' + id).hidden = true; }

async function openAdd(url) {
  $('#addUrl').value = url || '';
  $('#addName').value = '';
  $('#addDir').value = (state.settings && state.settings.downloadDir) || '';
  openModal('addModal');
  if (!url) $('#addUrl').focus();
}

async function openSettings() {
  const s = state.settings || await window.pdm.invoke('getSettings');
  state.settings = s;
  $('#stDir').value = s.downloadDir;
  $('#stConcurrent').value = s.maxConcurrent;
  $('#stConnections').value = s.maxConnections;
  const kb = s.maxSpeedKB || 0;
  if (kb >= 1024) {
    $('#stMaxSpeed').value = Math.round((kb / 1024) * 10) / 10;
    $('#stSpeedUnit').value = 'mb';
  } else {
    $('#stMaxSpeed').value = kb;
    $('#stSpeedUnit').value = 'kb';
  }
  $('#stOrganize').checked = !!s.organizeByCategory;
  $('#stClipboard').checked = !!s.clipboardMonitor;
  $('#stAutoFloat').checked = !!s.autoFloat;
  $('#stLang').value = s.language || 'ar';
  $('#stTheme').value = s.theme || 'dark';
  $('#stSched').checked = !!(s.scheduler && s.scheduler.enabled);
  $('#stStartAt').value = (s.scheduler && s.scheduler.startAt) || '';
  $('#stStopAt').value = (s.scheduler && s.scheduler.stopAt) || '';
  openModal('settingsModal');
  renderExtRows();
  // عرض نوع قاعدة البيانات المستخدمة
  window.pdm.invoke('dbInfo').then(info => {
    $('#stStorage').textContent = window.t('set.storage') + ': ' +
      (info && info.mode === 'sqlite' ? window.t('set.storageSqlite') : window.t('set.storageJson'));
  }).catch(() => {});
  // عرض الإصدار الحالي
  window.pdm.invoke('update:state').then(st => {
    $('#updVersion').textContent = window.t('update.current', { v: (st && st.currentVersion) || '?' });
  }).catch(() => {});
}

async function saveSettings() {
  const spd = parseFloat($('#stMaxSpeed').value) || 0;
  const maxSpeedKB = Math.max(0, Math.round($('#stSpeedUnit').value === 'mb' ? spd * 1024 : spd));
  const patch = {
    downloadDir: $('#stDir').value.trim(),
    maxConcurrent: Math.max(1, Math.min(10, parseInt($('#stConcurrent').value, 10) || 3)),
    maxConnections: Math.max(1, Math.min(32, parseInt($('#stConnections').value, 10) || 16)),
    maxSpeedKB,
    organizeByCategory: $('#stOrganize').checked,
    clipboardMonitor: $('#stClipboard').checked,
    autoFloat: $('#stAutoFloat').checked,
    theme: $('#stTheme').value,
    language: $('#stLang').value,
    scheduler: {
      enabled: $('#stSched').checked,
      startAt: $('#stStartAt').value,
      stopAt: $('#stStopAt').value
    }
  };
  state.settings = await window.pdm.invoke('setSettings', patch);
  applyTheme(state.settings.theme);
  const langChanged = state.settings.language !== window.getLang();
  if (langChanged) {
    window.setLang(state.settings.language);
    render(); // إعادة رسم النصوص الديناميكية باللغة الجديدة
  }
  closeModal('settingsModal');
  toast(window.t('set.saved'), 'ok');
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
}

/* ===== القواعد التلقائية ===== */
async function openRules() {
  if (!state.settings) state.settings = await window.pdm.invoke('getSettings');
  state.rulesDraft = JSON.parse(JSON.stringify(state.settings.rules || []));
  if (!state.rulesDraft.length) state.rulesDraft.push({ pattern: '', folder: '' });
  renderRules();
  openModal('rulesModal');
}

function renderRules() {
  $('#rulesList').innerHTML = state.rulesDraft.map((r, i) => `
    <div class="rules-row" data-i="${i}">
      <input class="r-pattern" type="text" placeholder="كلمة مفتاحية في الرابط، مثال: github.com" value="${String(r.pattern || '').replace(/"/g, '&quot;')}">
      <span class="r-arrow">←</span>
      <input class="r-folder" type="text" dir="ltr" placeholder="C:\\Downloads\\..." value="${String(r.folder || '').replace(/"/g, '&quot;')}">
      <button class="btn mini r-browse" title="تصفح مجلد">📂</button>
      <button class="btn mini r-del" title="حذف القاعدة">🗑️</button>
    </div>`).join('') || '<div class="empty-sub">لا توجد قواعد — أضف قاعدة بالزر أدناه</div>';
}

async function saveRules() {
  const rules = state.rulesDraft
    .map(r => ({ pattern: String(r.pattern || '').trim(), folder: String(r.folder || '').trim() }))
    .filter(r => r.pattern && r.folder);
  state.settings = await window.pdm.invoke('setSettings', { rules });
  closeModal('rulesModal');
  toast(`تم حفظ ${rules.length} قاعدة`, 'ok');
}

/* ===== الاستيراد الجماعي ===== */
function openImport() {
  $('#importText').value = '';
  $('#importFileHint').textContent = '';
  openModal('importModal');
  $('#importText').focus();
}

async function doImport() {
  const urls = $('#importText').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!urls.length) { toast('الصق رابطاً واحداً على الأقل', 'err'); return; }
  try {
    const r = await window.pdm.invoke('importUrls', { urls });
    closeModal('importModal');
    let msg = window.t('import.done', { added: r.added });
    if (r.existed) msg += ' • ' + window.t('import.dup', { n: r.existed });
    if (r.invalid) msg += ' • ' + window.t('import.bad', { n: r.invalid });
    toast(msg, 'ok');
  } catch (err) {
    toast(window.t('import.fail', { msg: err.message || err }), 'err');
  }
}

/* ===== تحميل الفيديو (yt-dlp) ===== */
const STREAM_RE = /\.m3u8($|[?#])|\.mpd($|[?#])/i;
let videoProbeResult = null;

function videoDefaultDir() {
  const s = state.settings || {};
  return String(s.downloadDir || '').replace(/[\\/]+$/, '') + '\\Videos';
}

function openVideoModal(url) {
  videoProbeResult = null;
  $('#vidUrl').value = url || '';
  $('#vidInfo').hidden = true;
  $('#vidFormatsWrap').hidden = true;
  $('#vidEntriesWrap').hidden = true;
  $('#btnVidAll').hidden = true;
  $('#btnVideoDownload').hidden = false;
  $('#btnVideoDownload').textContent = window.t('video.start');
  $('#btnVideoDownload').disabled = true;
  $('#vidStatus').textContent = url ? '' : window.t('video.hint');
  $('#vidDir').value = videoDefaultDir();
  openModal('videoModal');
  if (url) probeVideo();
  else $('#vidUrl').focus();
}

function fmtDur(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
           : `${m}:${String(s).padStart(2, '0')}`;
}

async function probeVideo() {
  const url = $('#vidUrl').value.trim();
  if (!/^https?:\/\//i.test(url)) { toast(window.t('video.badUrl'), 'err'); return; }
  $('#vidInfo').hidden = true;
  $('#vidFormatsWrap').hidden = true;
  $('#vidEntriesWrap').hidden = true;
  $('#btnVidAll').hidden = true;
  $('#btnVideoDownload').hidden = false;
  $('#btnVideoDownload').disabled = true;
  $('#vidStatus').textContent = window.t('video.probing');
  $('#btnProbe').disabled = true;
  try {
    videoProbeResult = await window.pdm.invoke('video:probe', { url });
    $('#vidInfo').hidden = false;
    $('#vidTitle').textContent = '🎬 ' + videoProbeResult.title;
    $('#vidMeta').textContent = [
      videoProbeResult.uploader,
      videoProbeResult.duration ? window.t('video.duration') + ' ' + fmtDur(videoProbeResult.duration) : '',
      videoProbeResult.type === 'playlist' ? `${window.t('video.playlist')} • ${window.t('files.count', { n: videoProbeResult.count })}` : '',
      videoProbeResult.isStream ? window.t('video.stream') : ''
    ].filter(Boolean).join(' • ');

    if (videoProbeResult.type === 'playlist') {
      // قائمة تشغيل: عناصر قابلة للاختيار
      $('#vidEntries').innerHTML = videoProbeResult.entries.map(e => `
        <label class="chk tor-file">
          <input type="checkbox" data-idx="${e.index}" checked>
          <span class="tor-name" title="${String(e.title).replace(/"/g, '&quot;')}">${e.index}. ${e.title}</span>
          ${e.duration ? `<span class="val">${fmtDur(e.duration)}</span>` : ''}
        </label>`).join('');
      $('#vidEntriesWrap').hidden = false;
      $('#btnVidAll').hidden = false;
      $('#btnVideoDownload').disabled = false;
      $('#btnVideoDownload').textContent = window.t('video.selected', { n: videoProbeResult.count });
    } else {
      const sel = $('#vidFormats');
      sel.innerHTML = videoProbeResult.formats.map((f, i) => {
        const sizeTxt = f.size ? ' • ' + fmtBytes(f.size) : '';
        return `<option value="${f.id}" ${i === 0 ? 'selected' : ''}>${f.label}${sizeTxt}</option>`;
      }).join('');
      $('#vidFormatsWrap').hidden = false;
      $('#btnVideoDownload').disabled = false;
    }
    $('#vidStatus').textContent = '';
  } catch (err) {
    $('#vidStatus').textContent = '⚠️ ' + (err.message || err);
  } finally {
    $('#btnProbe').disabled = false;
  }
}

async function startVideoDownload(allEntries) {
  if (!videoProbeResult) return;
  const dir = $('#vidDir').value.trim() || videoDefaultDir();
  try {
    let payload;
    if (videoProbeResult.type === 'playlist') {
      payload = { url: videoProbeResult.url, dir, title: videoProbeResult.title, playlist: true };
      if (!allEntries) {
        const idxs = [...$('#vidEntries').querySelectorAll('input:checked')]
          .map(el => +el.dataset.idx);
        if (!idxs.length) { toast(window.t('import.empty'), 'err'); return; }
        payload.items = idxs.join(',');
      }
    } else {
      payload = {
        url: videoProbeResult.url,
        formatId: $('#vidFormats').value || 'best',
        dir,
        title: videoProbeResult.title
      };
    }
    await window.pdm.invoke('video:download', payload);
    closeModal('videoModal');
    toast(window.t('video.added'), 'ok');
  } catch (err) {
    toast(window.t('video.fail', { msg: err.message || err }), 'err');
  }
}

/* ===== التورنت (ماغنت) ===== */
let torrentProbeResult = null;

function openTorrentModal() {
  torrentProbeResult = null;
  $('#torMagnet').value = '';
  $('#torInfo').hidden = true;
  $('#torFilesWrap').hidden = true;
  $('#torStatus').textContent = '';
  $('#btnTorAll').hidden = true;
  $('#btnTorSelected').hidden = true;
  $('#torDir').value = (state.settings && state.settings.downloadDir) || '';
  openModal('torrentModal');
  $('#torMagnet').focus();
}

async function probeTorrent() {
  const magnet = $('#torMagnet').value.trim();
  if (!magnet) return;
  $('#torInfo').hidden = true;
  $('#torFilesWrap').hidden = true;
  $('#btnTorAll').hidden = true;
  $('#btnTorSelected').hidden = true;
  $('#torStatus').textContent = window.t('torrent.probing');
  $('#btnTorProbe').disabled = true;
  try {
    torrentProbeResult = await window.pdm.invoke('torrent:probe', { magnet });
    $('#torInfo').hidden = false;
    $('#torTitle').textContent = '🧲 ' + torrentProbeResult.name;
    $('#torMeta').textContent = fmtBytes(torrentProbeResult.length) + ' • ' + window.t('files.count', { n: torrentProbeResult.files.length });
    // قائمة الملفات مع مربعات اختيار
    $('#torFiles').innerHTML = torrentProbeResult.files.map((f, i) => `
      <label class="chk tor-file">
        <input type="checkbox" data-idx="${i}" checked>
        <span class="tor-name" title="${f.path.replace(/"/g, '&quot;')}">${f.name}</span>
        <span class="val">${fmtBytes(f.length)}</span>
      </label>`).join('');
    $('#torFilesWrap').hidden = false;
    $('#torStatus').textContent = '';
    $('#btnTorAll').hidden = false;
    $('#btnTorSelected').hidden = false;
  } catch (err) {
    $('#torStatus').textContent = '⚠️ ' + (err.message || err);
  } finally {
    $('#btnTorProbe').disabled = false;
  }
}

async function startTorrentDownload(selectedOnly) {
  if (!torrentProbeResult) return;
  const payload = {
    magnet: torrentProbeResult.magnet || $('#torMagnet').value.trim(),
    dir: $('#torDir').value.trim() || (state.settings && state.settings.downloadDir) || undefined,
    title: torrentProbeResult.name
  };
  if (selectedOnly) {
    const idxs = [...$('#torFiles').querySelectorAll('input:checked')]
      .map(el => +el.dataset.idx);
    payload.files = idxs;
  }
  try {
    const r = await window.pdm.invoke('torrent:download', payload);
    closeModal('torrentModal');
    if (r && r.existed) toast(window.t('torrent.existed'));
    else toast(window.t('torrent.added'), 'ok');
  } catch (err) {
    toast(window.t('torrent.fail', { msg: err.message || err }), 'err');
  }
}

/* ===== الأحداث ===== */
function wireEvents() {
  $('#btnMin').onclick = () => window.pdm.invoke('win:minimize');
  $('#btnMax').onclick = () => window.pdm.invoke('win:maximize');
  $('#btnClose').onclick = () => window.pdm.invoke('win:close');

  $('#btnAdd').onclick = () => openAdd('');
  $('#btnPauseAll').onclick = () => window.pdm.invoke('pauseAll');
  $('#btnResumeAll').onclick = () => window.pdm.invoke('resumeAll');
  $('#btnClear').onclick = () => window.pdm.invoke('clearCompleted');
  $('#btnFloat').onclick = () => window.pdm.invoke('float:toggle');
  $('#btnImport').onclick = openImport;
  $('#btnRules').onclick = openRules;
  $('#btnVideo').onclick = () => openVideoModal('');
  $('#btnTorrent').onclick = openTorrentModal;
  wireExtUI();

  // نافذة التورنت
  $('#btnTorProbe').onclick = probeTorrent;
  $('#torMagnet').addEventListener('keydown', e => { if (e.key === 'Enter') probeTorrent(); });
  $('#torBrowse').onclick = async () => {
    const d = await window.pdm.invoke('chooseDir');
    if (d) $('#torDir').value = d;
  };
  $('#btnTorAll').onclick = () => startTorrentDownload(false);
  $('#btnTorSelected').onclick = () => startTorrentDownload(true);

  // نافذة الفيديو
  $('#btnProbe').onclick = probeVideo;
  $('#vidUrl').addEventListener('keydown', e => { if (e.key === 'Enter') probeVideo(); });
  $('#vidBrowse').onclick = async () => {
    const d = await window.pdm.invoke('chooseDir');
    if (d) $('#vidDir').value = d;
  };
  $('#btnVideoDownload').onclick = () => startVideoDownload(false);
  $('#btnVidAll').onclick = () => startVideoDownload(true);
  $('#search').oninput = e => { state.search = e.target.value.trim(); render(); };
  $('#btnSettings').onclick = openSettings;

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

  // إضافة رابط
  $('#btnBrowse').onclick = async () => {
    const d = await window.pdm.invoke('chooseDir');
    if (d) $('#addDir').value = d;
  };
  $('#btnStartDownload').onclick = async () => {
    const url = $('#addUrl').value.trim();
    if (!/^https?:\/\//i.test(url)) { toast(window.t('add.badUrl'), 'err'); return; }
    // روابط البث M3U8/MPD توجّه لنافذة الفيديو
    if (STREAM_RE.test(url)) {
      closeModal('addModal');
      openVideoModal(url);
      return;
    }
    try {
      const r = await window.pdm.invoke('add', {
        url,
        filename: $('#addName').value.trim() || undefined,
        dir: $('#addDir').value.trim() || undefined,
        referer: $('#addReferer').value.trim() || undefined,
        mirrors: $('#addMirrors').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
      });
      closeModal('addModal');
      toast(r && r.existed ? window.t('add.existed') : window.t('add.added'), 'ok');
    } catch (err) {
      toast('⚠️ ' + (err.message || err), 'err');
    }
  };
  $('#addUrl').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnStartDownload').click(); });

  // الإعدادات
  $('#stBrowse').onclick = async () => {
    const d = await window.pdm.invoke('chooseDir');
    if (d) $('#stDir').value = d;
  };
  $('#btnSaveSettings').onclick = saveSettings;
  $('#btnOpenRules').onclick = openRules;

  // التحديث التلقائي
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

  // نافذة القواعد
  $('#btnAddRule').onclick = () => { state.rulesDraft.push({ pattern: '', folder: '' }); renderRules(); };
  $('#btnSaveRules').onclick = saveRules;
  $('#rulesList').addEventListener('click', async e => {
    const row = e.target.closest('.rules-row');
    if (!row) return;
    const i = +row.dataset.i;
    if (e.target.closest('.r-del')) {
      state.rulesDraft.splice(i, 1);
      renderRules();
    } else if (e.target.closest('.r-browse')) {
      const d = await window.pdm.invoke('chooseDir');
      if (d) { state.rulesDraft[i].folder = d; renderRules(); }
    }
  });
  $('#rulesList').addEventListener('input', e => {
    const row = e.target.closest('.rules-row');
    if (!row) return;
    const i = +row.dataset.i;
    if (e.target.classList.contains('r-pattern')) state.rulesDraft[i].pattern = e.target.value;
    if (e.target.classList.contains('r-folder')) state.rulesDraft[i].folder = e.target.value;
  });

  // الاستيراد الجماعي
  $('#btnImportFile').onclick = async () => {
    const r = await window.pdm.invoke('readTextFile');
    if (r && r.content != null) {
      $('#importText').value = r.content;
      $('#importFileHint').textContent = r.path;
    }
  };
  $('#btnDoImport').onclick = doImport;

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

/* ===== التحديث التلقائي ===== */
function handleUpdateEvent(u) {
  if (!u) return;
  const banner = $('#updateBanner');
  const text = $('#updateText');
  const barWrap = $('#updateBarWrap');
  const bar = $('#updateBar');
  const installBtn = $('#btnUpdateInstall');
  switch (u.status) {
    case 'available':
      banner.hidden = false;
      barWrap.hidden = true;
      installBtn.hidden = true;
      text.textContent = window.t('update.available', { v: u.version });
      break;
    case 'downloading':
      banner.hidden = false;
      barWrap.hidden = false;
      installBtn.hidden = true;
      bar.style.width = (u.percent || 0) + '%';
      text.textContent = window.t('update.downloading', { p: u.percent || 0 });
      break;
    case 'downloaded':
      banner.hidden = false;
      barWrap.hidden = true;
      installBtn.hidden = false;
      text.textContent = window.t('update.downloaded', { v: u.version });
      break;
    case 'none':
      banner.hidden = true;
      toast(window.t('update.none'), 'ok');
      break;
    case 'error':
      banner.hidden = false;
      barWrap.hidden = true;
      installBtn.hidden = true;
      text.textContent = window.t('update.error', { msg: u.error || '' });
      break;
    case 'dev':
      banner.hidden = true;
      toast(window.t('update.dev'));
      break;
  }
}

/* ===== إضافة المتصفح ===== */
const EXT_BROWSERS = [
  { id: 'chrome', label: 'Chrome', icon: '🌐' },
  { id: 'edge', label: 'Edge', icon: '🌊' },
  { id: 'firefox', label: 'Firefox', icon: '🦊' }
];

async function renderExtRows() {
  const st = await window.pdm.invoke('ext:status').catch(() => ({}));
  $('#extRows').innerHTML = EXT_BROWSERS.map(b => {
    const reg = st[b.id] === 'registered';
    return `<div class="row" style="padding:6px 0;">
      <span style="flex:1">${b.icon} ${b.label}</span>
      <span class="badge ${reg ? 'completed' : 'queued'}">${reg ? window.t('ext.registered') : window.t('ext.notRegistered')}</span>
      <button class="btn mini" data-ext-reg="${b.id}">${reg ? '↻' : '＋'}</button>
      ${reg ? `<button class="btn mini" data-ext-unreg="${b.id}" title="${window.t('ext.uninstall')}">✕</button>` : ''}
    </div>`;
  }).join('');
}

function wireExtUI() {
  $('#btnExtFolder').onclick = () => window.pdm.invoke('ext:openFolder');
  $('#extRows').addEventListener('click', async e => {
    const reg = e.target.closest('[data-ext-reg]');
    const unreg = e.target.closest('[data-ext-unreg]');
    try {
      if (reg) {
        await window.pdm.invoke('ext:register', { browser: reg.dataset.extReg });
        toast(window.t('ext.done', { b: reg.dataset.extReg }), 'ok');
      } else if (unreg) {
        await window.pdm.invoke('ext:unregister', { browser: unreg.dataset.extUnreg });
        toast(window.t('ext.removed'), 'ok');
      }
      renderExtRows();
    } catch (err) {
      toast('⚠️ ' + (err.message || err), 'err');
    }
  });
}

/* ===== قائمة كليك يمين ===== */
let ctxMenuEl = null;

function closeContextMenu() {
  if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
  document.removeEventListener('click', closeContextMenu, true);
  window.removeEventListener('blur', closeContextMenu, true);
  document.removeEventListener('contextmenu', closeContextMenu, true);
}

function showContextMenu(items, x, y) {
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
      switch (id.slice(4)) {
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
  } catch (err) {
    toast('⚠️ ' + (err.message || err), 'err');
  }
}
function removeCardEl(id) {
  const el = document.querySelector(`.task[data-id="${id}"]`);
  if (el) el.remove();
}

/* ===== ربط قوائم كليك يمين ===== */
function wireContextMenus() {
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

function wireIpc() {
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
      // مزامنة مهام الفيديو: حذف المحذوف ثم دمج (مع تحديث متزايد للنشطة)
      let structural = false;
      const ids = new Set((data.videos || []).map(v => v.id));
      for (const id of [...state.tasks.keys()]) {
        if (state.tasks.get(id).kind === 'video' && !ids.has(id)) {
          state.tasks.delete(id);
          structural = true;
        }
      }
      for (const v of data.videos || []) {
        const prev = state.tasks.get(v.id);
        state.tasks.set(v.id, v);
        if (prev && prev.status === v.status && v.status === 'downloading' && state.view === 'tasks') {
          if (!patchTaskCard(v)) structural = true;
        } else if (!prev || prev.status !== v.status) {
          structural = true;
        }
      }
      state.summary = data.summary;
      $('#totalSpeed').innerHTML = `<span>▲</span> ${fmtSpeed((state.summary && state.summary.speed) || 0)}`;
      renderSidebar();
      if (structural) renderSoon();
    } else if (data.type === 'torrents') {
      let structural = false;
      const ids = new Set((data.torrents || []).map(v => v.id));
      for (const id of [...state.tasks.keys()]) {
        if (state.tasks.get(id).kind === 'torrent' && !ids.has(id)) {
          state.tasks.delete(id);
          structural = true;
        }
      }
      for (const v of data.torrents || []) {
        const prev = state.tasks.get(v.id);
        state.tasks.set(v.id, v);
        if (prev && prev.status === v.status && v.status === 'downloading' && state.view === 'tasks') {
          if (!patchTaskCard(v)) structural = true;
        } else if (!prev || prev.status !== v.status) {
          structural = true;
        }
      }
      state.summary = data.summary;
      $('#totalSpeed').innerHTML = `<span>▲</span> ${fmtSpeed((state.summary && state.summary.speed) || 0)}`;
      renderSidebar();
      if (structural) renderSoon();
    } else if (data.type === 'update') {
      handleUpdateEvent(data.update);
    } else if (data.type === 'win') {
      $('#btnMax').textContent = data.maximized ? '❐' : '□';
    }
  });
}

/* ===== الإقلاع ===== */
(async function init() {
  wireEvents();
  wireContextMenus();
  wireIpc();
  state.settings = await window.pdm.invoke('getSettings');
  window.setLang(state.settings.language || 'ar');
  applyTheme(state.settings.theme);
  state.tasks = new Map((await window.pdm.invoke('list')).map(t => [t.id, t]));
  state.summary = await window.pdm.invoke('summary');
  window.addEventListener('resize', () => { if (state.view === 'dashboard') drawSpeedChart(); });
  render();
})();
