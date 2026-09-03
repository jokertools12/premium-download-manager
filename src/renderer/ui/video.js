/* نافذة تحميل الفيديو وقوائم التشغيل (yt-dlp): فحص الرابط + لوحة تحكم القوائم والقنوات 2.0 */

import { $, toast, openModal, closeModal } from '../lib/dom.js';
import { fmtBytes, fmtDur } from '../lib/format.js';
import { state } from '../state.js';

/* ملاحظة: escapeHtml/escapeAttr تُعرَّف كـ globals بواسطة lib/sanitize.js */

let videoProbeResult = null;
let currentPlaylistData = null;

export function videoDefaultDir() {
  const s = state.settings || {};
  const sep = (window.pdm && window.pdm.platform === 'win32') ? '\\' : '/';
  return String(s.downloadDir || '').replace(/[\\/]+$/, '') + sep + 'Videos';
}

export function openVideoModal(url) {
  videoProbeResult = null;
  $('#vidUrl').value = url || '';
  $('#vidInfo').hidden = true;
  $('#vidFormatsWrap').hidden = true;
  $('#vidEntriesWrap').hidden = true;
  $('#vidClipWrap').hidden = true;
  $('#vidCookies').value = '';
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

/* ==========================================================================
   لوحة تحميل القوائم والقنوات الكاملة (Batch Playlist Dashboard 2.0)
   ========================================================================== */
export function openPlaylistDashboard(data) {
  currentPlaylistData = data;
  $('#plModalTitle').textContent = data.title || 'قائمة التشغيل';
  $('#plAuthor').textContent = data.uploader ? ('📺 ' + data.uploader) : '';
  $('#plAuthor').style.display = data.uploader ? 'inline-block' : 'none';
  $('#plCount').textContent = `${data.count || (data.entries || []).length} فيديو`;
  $('#plDuration').textContent = data.totalDuration ? ('⏱ ' + fmtDur(data.totalDuration)) : '';
  $('#plDuration').style.display = data.totalDuration ? 'inline-block' : 'none';

  $('#plSearch').value = '';
  $('#plDir').value = videoDefaultDir();

  renderPlaylistGrid(data.entries || []);
  updatePlaylistCounter();
  openModal('playlistModal');
}

function renderPlaylistGrid(entries) {
  const grid = $('#plGrid');
  grid.innerHTML = entries.map(e => `
    <div class="pl-card selected" data-idx="${e.index}" data-title="${escapeAttr((e.title || '').toLowerCase())}">
      <input type="checkbox" data-idx="${e.index}" checked>
      <div class="pl-thumb-wrap">
        ${e.thumbnail ? `<img src="${escapeAttr(e.thumbnail)}" loading="lazy" alt="" onerror="this.style.display='none'">` : ''}
        ${e.duration ? `<span class="pl-thumb-dur">${fmtDur(e.duration)}</span>` : ''}
      </div>
      <div class="pl-card-info">
        <span class="pl-card-num">#${e.index}</span>
        <span class="pl-card-title" title="${escapeAttr(e.title || '')}">${escapeHtml(e.title || '')}</span>
      </div>
    </div>
  `).join('');
}

function updatePlaylistCounter() {
  if (!currentPlaylistData) return;
  const cards = [...$('#plGrid').querySelectorAll('.pl-card')];
  const checked = cards.filter(c => {
    const input = c.querySelector('input[type="checkbox"]');
    return input && input.checked;
  });
  const total = cards.length;
  const count = checked.length;

  $('#plSelectedCount').textContent = `تم تحديد ${count} من أصل ${total} فيديو`;
  const btn = $('#btnStartPlaylistDownload');
  btn.textContent = `⚡ بدء تنزيل الفيديوهات المحددة (${count})`;
  btn.disabled = count === 0;
}

function filterPlaylistEntries(query) {
  const q = String(query || '').trim().toLowerCase();
  for (const card of $('#plGrid').querySelectorAll('.pl-card')) {
    const title = card.dataset.title || '';
    const match = !q || title.includes(q);
    card.style.display = match ? 'flex' : 'none';
  }
}

function setPlaylistSelection(mode) {
  for (const card of $('#plGrid').querySelectorAll('.pl-card')) {
    if (card.style.display === 'none') continue;
    const input = card.querySelector('input[type="checkbox"]');
    if (!input) continue;
    if (mode === 'all') input.checked = true;
    else if (mode === 'none') input.checked = false;
    else if (mode === 'invert') input.checked = !input.checked;
    card.classList.toggle('selected', input.checked);
  }
  updatePlaylistCounter();
}

async function startPlaylistDownload() {
  if (!currentPlaylistData) return;
  const checkedInputs = [...$('#plGrid').querySelectorAll('input[type="checkbox"]:checked')];
  if (!checkedInputs.length) {
    toast('يرجى تحديد فيديو واحد على الأقل للتحميل!', 'err');
    return;
  }
  const idxs = checkedInputs.map(el => +el.dataset.idx);
  const dir = $('#plDir').value.trim() || videoDefaultDir();
  const formatId = $('#plQualitySelect').value || 'bestvideo+bestaudio/best';
  const audioOnly = formatId === 'bestaudio/best';
  const subfolder = $('#plSubfolder').checked;

  const payload = {
    url: currentPlaylistData.url,
    title: currentPlaylistData.title,
    dir,
    playlist: true,
    items: idxs.length === currentPlaylistData.count ? undefined : idxs.join(','),
    formatId,
    audioOnly,
    mergeOutput: 'mp4',
    subfolder
  };

  try {
    await window.pdm.invoke('video:download', payload);
    closeModal('playlistModal');
    toast(`تمت جدولة تنزيل ${idxs.length} فيديو بنجاح!`, 'ok');
  } catch (err) {
    toast('فشل بدء تحميل القائمة: ' + (err.message || err), 'err');
  }
}

export async function probeVideo() {
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

    // إذا كان الرابط قائمة تشغيل أو قناة كاملة: افتح لوحة تحكم القوائم المتقدمة فوراً!
    if (videoProbeResult.type === 'playlist') {
      closeModal('videoModal');
      openPlaylistDashboard(videoProbeResult);
      return;
    }

    $('#vidInfo').hidden = false;
    $('#vidTitle').textContent = '🎬 ' + videoProbeResult.title;
    $('#vidMeta').textContent = [
      videoProbeResult.uploader,
      videoProbeResult.duration ? window.t('video.duration') + ' ' + fmtDur(videoProbeResult.duration) : '',
      videoProbeResult.isStream ? window.t('video.stream') : ''
    ].filter(Boolean).join(' • ');

    const sel = $('#vidFormats');
    sel.innerHTML = videoProbeResult.formats.map((f, i) => {
      const sizeTxt = f.size ? ' • ' + fmtBytes(f.size) : '';
      return `<option value="${f.id}" ${i === 0 ? 'selected' : ''}>${f.label}${sizeTxt}</option>`;
    }).join('');
    $('#vidFormatsWrap').hidden = false;
    $('#btnVideoDownload').disabled = false;
    $('#vidStatus').textContent = '';
    $('#vidClipWrap').hidden = false;
  } catch (err) {
    $('#vidStatus').textContent = '⚠️ ' + (err.message || err);
  } finally {
    $('#btnProbe').disabled = false;
  }
}

export async function startVideoDownload() {
  if (!videoProbeResult) return;
  const dir = $('#vidDir').value.trim() || videoDefaultDir();
  const mediaOpts = {
    audioOnly: $('#vidMp3').checked,
    subtitles: $('#vidSubs').checked,
    mergeOutput: $('#vidMerge').value,
    clipStart: $('#vidClipStart').value.trim(),
    clipEnd: $('#vidClipEnd').value.trim(),
    cookiesFrom: $('#vidCookies').value || null
  };
  try {
    const payload = {
      url: videoProbeResult.url,
      formatId: $('#vidFormats').value || 'best',
      dir,
      title: videoProbeResult.title,
      ...mediaOpts
    };
    await window.pdm.invoke('video:download', payload);
    closeModal('videoModal');
    toast(window.t('video.added'), 'ok');
  } catch (err) {
    toast(window.t('video.fail', { msg: err.message || err }), 'err');
  }
}

function wirePlaylistUI() {
  $('#plSearch').addEventListener('input', e => filterPlaylistEntries(e.target.value));
  $('#btnPlSelectAll').onclick = () => setPlaylistSelection('all');
  $('#btnPlSelectNone').onclick = () => setPlaylistSelection('none');
  $('#btnPlInvert').onclick = () => setPlaylistSelection('invert');

  $('#plGrid').addEventListener('click', e => {
    const card = e.target.closest('.pl-card');
    if (!card) return;
    const chk = card.querySelector('input[type="checkbox"]');
    if (e.target !== chk) chk.checked = !chk.checked;
    card.classList.toggle('selected', chk.checked);
    updatePlaylistCounter();
  });

  $('#plBrowse').onclick = async () => {
    const d = await window.pdm.invoke('chooseDir');
    if (d) $('#plDir').value = d;
  };

  $('#btnStartPlaylistDownload').onclick = startPlaylistDownload;
}

export function wireVideoUI() {
  $('#btnProbe').onclick = probeVideo;
  $('#vidUrl').addEventListener('keydown', e => { if (e.key === 'Enter') probeVideo(); });
  $('#vidBrowse').onclick = async () => {
    const d = await window.pdm.invoke('chooseDir');
    if (d) $('#vidDir').value = d;
  };
  $('#btnVideoDownload').onclick = () => startVideoDownload();

  wirePlaylistUI();
}