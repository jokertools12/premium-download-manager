/* نافذة التورنت (ماغنت): فحص + اختيار الملفات + بدء التحميل */

import { $, toast, openModal, closeModal } from '../lib/dom.js';
import { fmtBytes } from '../lib/format.js';
import { state } from '../state.js';

/* ملاحظة: escapeHtml/escapeAttr تُعرَّف كـ globals بواسطة lib/sanitize.js */

let torrentProbeResult = null;

export function openTorrentModal() {
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

export async function probeTorrent() {
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
        <span class="tor-name" title="${escapeAttr(f.path)}">${escapeHtml(f.name)}</span>
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

export async function startTorrentDownload(selectedOnly) {
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

export function wireTorrentUI() {
  $('#btnTorProbe').onclick = probeTorrent;
  $('#torMagnet').addEventListener('keydown', e => { if (e.key === 'Enter') probeTorrent(); });
  $('#torBrowse').onclick = async () => {
    const d = await window.pdm.invoke('chooseDir');
    if (d) $('#torDir').value = d;
  };
  $('#btnTorAll').onclick = () => startTorrentDownload(false);
  $('#btnTorSelected').onclick = () => startTorrentDownload(true);
}