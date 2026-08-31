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
