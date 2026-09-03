/* نافذة معاينة الوسائط (3.3): صور / فيديو / صوت — مشغل داخلي */

import { $, openModal } from '../lib/dom.js';
import { fmtBytes } from '../lib/format.js';
import { isImage, isPlayable, mediaUrl } from '../lib/media.js';

let currentFile = '';

export function openPreview(t) {
  if (!t || !t.filePath) return;
  currentFile = t.filePath;
  const url = mediaUrl(t.filePath);
  $('#pvTitle').textContent = '👁 ' + (t.filename || '');
  $('#pvInfo').textContent = fmtBytes(t.size || 0) + (t.url ? ' • ' + t.url : '');
  $('#pvBody').innerHTML = isImage(t.filePath)
    ? `<img class="pv-media" src="${url}" alt="">`
    : isPlayable(t.filePath)
      ? `<video class="pv-media" src="${url}" controls autoplay></video>`
      : `<audio class="pv-audio" src="${url}" controls autoplay></audio>`;
  $('#pvOpen').onclick = () => window.pdm.invoke('openPath', { path: currentFile });
  $('#pvFolder').onclick = () => window.pdm.invoke('revealPath', { path: currentFile });
  openModal('previewModal');
}

export function openStreamPreview({ url, title, size }) {
  if (!url) return;
  currentFile = '';
  $('#pvTitle').textContent = '▶ بث مباشر: ' + (title || 'فيديو التورنت');
  $('#pvInfo').textContent = (size ? fmtBytes(size) + ' • ' : '') + 'بث متسلسل لحظي أثناء التحميل';
  $('#pvBody').innerHTML = `<video class="pv-media" src="${url}" controls autoplay></video>`;
  $('#pvOpen').onclick = () => window.open(url, '_blank');
  $('#pvFolder').onclick = () => {};
  openModal('previewModal');
}