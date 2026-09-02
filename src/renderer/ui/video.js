/* نافذة تحميل الفيديو (yt-dlp): فحص الرابط + اختيار الجودة/عناصر قائمة التشغيل */

import { $, toast, openModal, closeModal } from '../lib/dom.js';
import { fmtBytes, fmtDur } from '../lib/format.js';
import { state } from '../state.js';

/* ملاحظة: escapeHtml/escapeAttr تُعرَّف كـ globals بواسطة lib/sanitize.js
   (سكربت كلاسيكي يُحمَّل قبل الوحدات) */

let videoProbeResult = null;

export function videoDefaultDir() {
  const s = state.settings || {};
  return String(s.downloadDir || '').replace(/[\\/]+$/, '') + '\\Videos';
}

export function openVideoModal(url) {
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
          <span class="tor-name" title="${escapeAttr(String(e.title))}">${e.index}. ${escapeHtml(e.title)}</span>
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

export async function startVideoDownload(allEntries) {
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

export function wireVideoUI() {
  $('#btnProbe').onclick = probeVideo;
  $('#vidUrl').addEventListener('keydown', e => { if (e.key === 'Enter') probeVideo(); });
  $('#vidBrowse').onclick = async () => {
    const d = await window.pdm.invoke('chooseDir');
    if (d) $('#vidDir').value = d;
  };
  $('#btnVideoDownload').onclick = () => startVideoDownload(false);
  $('#btnVidAll').onclick = () => startVideoDownload(true);
}