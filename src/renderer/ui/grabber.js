/* Site Grabber (5.3): فحص صفحة واستخراج صور/فيديوهات/ملفات واختيار ما يُحمَّل */

import { $, toast, openModal, closeModal } from '../lib/dom.js';
import { state, STREAM_RE } from '../state.js';

/* escapeHtml/escapeAttr globals من lib/sanitize.js (سكربت كلاسيكي) */

let grabData = null;

export function openGrabber(url) {
  $('#grabUrl').value = url || '';
  $('#grabResults').hidden = true;
  $('#btnGrabDownload').hidden = true;
  $('#grabStatus').textContent = url ? '' : window.t('grab.hint');
  openModal('grabModal');
  if (url) scanGrab();
  else $('#grabUrl').focus();
}

export async function scanGrab() {
  const url = $('#grabUrl').value.trim();
  if (!/^https?:\/\//i.test(url)) { toast(window.t('video.badUrl'), 'err'); return; }
  $('#grabResults').hidden = true;
  $('#btnGrabDownload').hidden = true;
  $('#grabStatus').textContent = window.t('grab.scanning');
  $('#btnGrabScan').disabled = true;
  try {
    grabData = await window.pdm.invoke('grab:scan', { url });
    $('#grabStatus').textContent = `${grabData.title} — ` + window.t('grab.found', {
      v: grabData.videos.length, i: grabData.images.length, f: grabData.files.length
    });
    const row = item => `<label class="chk grab-row" title="${escapeAttr(item.url)}">
      <input type="checkbox" data-gurl="${escapeAttr(item.url)}" checked>
      <span class="grab-name">${escapeHtml(item.name || item.url)}</span></label>`;
    const empty = `<div class="hint">${window.t('grab.none')}</div>`;
    $('#grabVideos').innerHTML = grabData.videos.map(row).join('') || empty;
    $('#grabImages').innerHTML = grabData.images.map(row).join('') || empty;
    $('#grabFiles').innerHTML = grabData.files.map(row).join('') || empty;
    $('#grabResults').hidden = false;
    $('#btnGrabDownload').hidden = false;
  } catch (err) {
    $('#grabStatus').textContent = '⚠️ ' + (err.message || err);
  } finally {
    $('#btnGrabScan').disabled = false;
  }
}

/* تحميل العناصر المحددة: بث M3U8 → نافذة الفيديو، البقية → محرك التحميل */
export function grabDownloadSelected() {
  if (!grabData) return;
  const urls = [...document.querySelectorAll('#grabResults input:checked')].map(el => el.dataset.gurl);
  if (!urls.length) { toast(window.t('import.empty'), 'err'); return; }
  const s = state.settings || {};
  const vidDir = String(s.downloadDir || '').replace(/[\\/]+$/, '') + '\\Videos';
  let queued = 0;
  for (const u of urls) {
    try {
      if (STREAM_RE.test(u)) {
        window.pdm.invoke('video:download', { url: u, dir: vidDir });
      } else {
        window.pdm.invoke('add', { url: u });
      }
      queued++;
    } catch (_e) { /* تخطى الفاشل */ }
  }
  closeModal('grabModal');
  toast(window.t('grab.queued', { n: queued }), 'ok');
}