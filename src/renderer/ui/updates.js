/* شريط التحديث التلقائي: عرض حالات التحديث القادمة من النواة */

import { $, toast } from '../lib/dom.js';

export function handleUpdateEvent(u) {
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