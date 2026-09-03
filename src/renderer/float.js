'use strict';

/* منطق النافذة العائمة: يعرض أسرع تحميل نشط (مع دعم اللغات) */
const $ = s => document.querySelector(s);

const FL = {
  ar: { active: 'نشط', none: 'لا توجد تحميلات نشطة' },
  en: { active: 'active', none: 'No active downloads' },
  tr: { active: 'aktif', none: 'Etkin indirme yok' }
};
let L = FL.ar;

function fmt(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i ? v.toFixed(1) : Math.round(v)) + ' ' + u[i];
}

document.getElementById('fPause').onclick = () => window.pdm.invoke('pauseAll');
document.getElementById('fOpen').onclick = () => window.pdm.invoke('float:openMain');
document.getElementById('fClose').onclick = () => window.pdm.invoke('float:close');

window.pdm.invoke('getSettings').then(s => {
  L = FL[(s && s.language) || 'ar'] || FL.ar;
}).catch(() => {});

/* 3.7: سحب رابط إلى النافذة العائمة → افتح النافذة الرئيسية واقترح الرابط */
const fcard = document.getElementById('fcard');
document.body.addEventListener('dragover', e => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'link';
  if (fcard) fcard.classList.add('drag-over');
});
document.body.addEventListener('dragleave', e => {
  if (fcard && e.target === document.body) fcard.classList.remove('drag-over');
});
document.body.addEventListener('drop', e => {
  e.preventDefault();
  if (fcard) fcard.classList.remove('drag-over');
  const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '';
  const m = String(text).match(/https?:\/\/[^\s]+/i);
  if (m) window.pdm.invoke('float:dropUrl', { url: m[0] });
});

window.pdm.onEvent(data => {
  if (!data || data.type !== 'tasks') return;
  const s = data.summary || {};
  const active = (data.tasks || []).filter(t => t.status === 'downloading');

  $('#fCount').textContent = `${s.downloading || 0} ${L.active}`;
  $('#fSpeed').textContent = '▲ ' + fmt(s.speed || 0) + '/s';

  if (!active.length) {
    $('#fName').textContent = L.none;
    $('#fBar').style.width = '0%';
    $('#fPct').textContent = '0%';
    return;
  }

  // عرض أسرع تحميل نشط
  const top = [...active].sort((a, b) => b.speed - a.speed)[0];
  const name = top.filename || top.title || top.url || '';
  $('#fName').textContent = name;
  $('#fName').title = name;
  const pct = top.size ? Math.min(100, (top.received / top.size) * 100)
    : (top.percent != null ? top.percent : 0);
  $('#fBar').style.width = pct.toFixed(1) + '%';
  $('#fPct').textContent = pct.toFixed(0) + '%';
});
