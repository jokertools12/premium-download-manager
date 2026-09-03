/* بطاقة التحميل: بناء + تحديث تزايدي (patch) + معاينة الوسائط (3.3) */

import { fmtBytes, fmtSpeed, fmtEta } from '../lib/format.js';
import { isImage, isPlayable, mediaUrl } from '../lib/media.js';
import { statusLabel, CAT_ICON, state } from '../state.js';

export function taskPct(t) {
  return t.size
    ? Math.min(100, (t.received / t.size) * 100)
    : (t.kind === 'video' && t.percent != null ? Math.min(100, t.percent)
      : (t.kind === 'torrent' && t.percent != null ? Math.min(100, t.percent)
        : (t.status === 'completed' ? 100 : 0)));
}

export function segsHtml(t) {
  if (t.status !== 'downloading' || !t.segments || t.segments.length <= 1) return '';
  return `<div class="segstrip">${t.segments.map(s => {
    const len = (s.end === null ? 1 : s.end - s.start + 1);
    const p = Math.min(100, (s.received / len) * 100);
    return `<div><div style="width:${p}%"></div></div>`;
  }).join('')}</div>`;
}

export function cardMetaInner(t, pct, isVideo, isTorrent) {
  return `
        <span class="badge ${t.status}">${statusLabel(t.status)}</span>
        <span>${fmtBytes(t.received)}${t.size ? ' / ' + fmtBytes(t.size) : ''} (${pct.toFixed(0)}%)</span>
        ${t.status === 'downloading' ? `<span class="speed">▲ ${fmtSpeed(t.speed)}</span>` : ''}
        ${t.status === 'downloading' && !isVideo && !isTorrent ? `<span>${fmtEta(t)}</span>` : ''}
        ${isVideo && t.status === 'downloading' && t.phase ? `<span>${escapeHtml(t.phase)}</span>` : ''}
        ${isVideo && t.isPlaylist && t.itemsTotal ? `<span>${t.itemsDone || 0} / ${t.itemsTotal}</span>` : ''}
        ${isTorrent && t.status === 'downloading' && t.peers != null ? `<span>${window.t('torrent.peers', { n: t.peers })}</span>` : ''}
        ${!isVideo && !isTorrent && t.status === 'downloading' && t.connections ? `<span>${window.t('conn.count', { n: t.connections })}</span>` : ''}
        ${t.error ? `<span class="err">${escapeHtml(t.error)}</span>` : ''}`;
}

export function taskCard(t) {
  const isVideo = t.kind === 'video';
  const isTorrent = t.kind === 'torrent';
  const pct = taskPct(t);
  const segs = segsHtml(t);
  const actions = cardActions(t, isVideo, isTorrent);
  const selected = state.selectedId === t.id ? ' selected' : '';
  /* مصغرة الصورة (3.3): للمهام العادية المكتملة ذات ملف صورة */
  const isImg = !isVideo && !isTorrent && t.status === 'completed' && t.filePath && isImage(t.filePath);
  const icon = isImg
    ? `<img class="thumb" loading="lazy" src="${mediaUrl(t.filePath)}" alt="">`
    : `${isTorrent ? '🧲' : (isVideo ? '🎬' : (CAT_ICON[t.category] || '📦'))}`;

  return `
  <div class="task${selected}" data-id="${t.id}" data-status="${t.status}">
    <div class="t-icon">${icon}</div>
    <div class="t-main">
      <div class="t-name" dir="auto" title="${escapeAttr(t.filename || t.title || t.url || '')}">${escapeHtml(t.filename || t.title || t.url || '...')}</div>
      <div class="bar"><div style="width:${pct.toFixed(1)}%"></div></div>
      ${segs}
      <div class="t-meta">${cardMetaInner(t, pct, isVideo, isTorrent)}</div>
    </div>
    <div class="t-actions">${actions.join('')}</div>
  </div>`;
}

export function cardActions(t, isVideo, isTorrent) {
  const actions = [];
  if (isVideo) {
    if (t.status === 'downloading') {
      actions.push(`<button class="btn mini" data-act="vcancel" data-id="${t.id}" title="${window.t('act.vcancel')}">✕</button>`);
    }
    if (t.status === 'completed' && t.filePath) {
      actions.push(`<button class="btn mini" data-act="open" data-id="${t.id}" title="${window.t('act.open')}">📂</button>`);
      actions.push(`<button class="btn mini" data-act="folder" data-id="${t.id}" title="${window.t('act.folder')}">🗂️</button>`);
      /* استخراج MP3 (4.3): لكل فيديو مكتمل قابل للفك */
      if (!String(t.filePath).toLowerCase().endsWith('.mp3')) {
        actions.push(`<button class="btn mini" data-act="vmp3" data-id="${t.id}" title="${window.t('act.toMp3')}">🎵</button>`);
      }
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
    /* زر معاينة الوسائط (3.3): صور أو فيديو/صوت قابل للتشغيل داخلياً */
    if (t.status === 'completed' && t.filePath && (isImage(t.filePath) || isPlayable(t.filePath))) {
      actions.push(`<button class="btn mini" data-act="preview" data-id="${t.id}" title="${window.t('act.preview')}">👁</button>`);
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
export function patchTaskCard(t) {
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

export function removeCardEl(id) {
  const el = document.querySelector(`.task[data-id="${id}"]`);
  if (el) el.remove();
}