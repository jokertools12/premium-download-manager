'use strict';

/* ⚡ Premium DM — Desktop Floating Widget 2.0 Logic */
const $ = s => document.querySelector(s);

const FL = {
  ar: { active: 'نشط', none: 'لا توجد تحميلات نشطة', drop: 'أفلت الرابط هنا للتحميل الفوري' },
  en: { active: 'active', none: 'No active downloads', drop: 'Drop URL here to download' },
  tr: { active: 'aktif', none: 'Etkin indirme yok', drop: 'Bağlantıyı buraya bırakın' }
};
let L = FL.ar;

function fmt(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i ? v.toFixed(1) : Math.round(v)) + ' ' + u[i];
}

const fContainer = $('#fContainer');

function setWidgetMode(mode) {
  if (mode === 'expanded') {
    fContainer.classList.remove('compact');
    fContainer.classList.add('expanded');
  } else {
    fContainer.classList.remove('expanded');
    fContainer.classList.add('compact');
  }
}

// تبديل النمط
$('#fPillExpand').onclick = (e) => {
  e.stopPropagation();
  setWidgetMode('expanded');
  window.pdm.invoke('float:setMode', 'expanded');
};

$('#fCollapse').onclick = (e) => {
  e.stopPropagation();
  setWidgetMode('compact');
  window.pdm.invoke('float:setMode', 'compact');
};

// النقر المزدوج على الكبسولة لفتح البرنامج الرئيسي
$('#fPill').ondblclick = () => window.pdm.invoke('float:openMain');

$('#fPause').onclick = () => window.pdm.invoke('pauseAll');
$('#fOpen').onclick = () => window.pdm.invoke('float:openMain');
$('#fClose').onclick = () => window.pdm.invoke('float:close');

// قراءة الإعدادات والنمط الأولي
window.pdm.invoke('getSettings').then(s => {
  L = FL[(s && s.language) || 'ar'] || FL.ar;
  $('.f-drop-text').textContent = L.drop;
}).catch(() => {});

window.pdm.invoke('float:getMode').then(mode => {
  if (mode) setWidgetMode(mode);
}).catch(() => {});

// السحب والإفلات (Drag & Drop)
let dragCounter = 0;

document.body.addEventListener('dragenter', e => {
  e.preventDefault();
  dragCounter++;
  fContainer.classList.add('drag-over');
});

document.body.addEventListener('dragover', e => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

document.body.addEventListener('dragleave', () => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    fContainer.classList.remove('drag-over');
  }
});

document.body.addEventListener('drop', e => {
  e.preventDefault();
  dragCounter = 0;
  fContainer.classList.remove('drag-over');
  const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '';
  const m = String(text).match(/https?:\/\/[^\s"'<>]+/i);
  if (m) {
    window.pdm.invoke('float:dropUrl', { url: m[0] });
  }
});

// استقبال الأحداث والتحديث اللحظي للبيانات
window.pdm.onEvent(data => {
  if (!data) return;

  if (data.type === 'floatMode') {
    setWidgetMode(data.mode);
    return;
  }

  if (data.type !== 'tasks') return;

  const s = data.summary || {};
  const active = (data.tasks || []).filter(t => t.status === 'downloading');
  const activeCount = s.downloading || active.length || 0;
  const speedStr = fmt(s.speed || 0) + '/s';

  // تحديث النمط المصغر (Compact Pill)
  $('#fPillBadge').textContent = String(activeCount);
  $('#fPillSpeed').textContent = activeCount > 0 ? ('▲ ' + speedStr) : '0 B/s';

  // تحديث النمط الموسع (Expanded Card)
  $('#fCount').textContent = `${activeCount} ${L.active}`;
  $('#fSpeed').textContent = '▲ ' + speedStr;

  if (!active.length) {
    $('#fName').textContent = L.none;
    $('#fBar').style.width = '0%';
    $('#fPillBar').style.width = '0%';
    $('#fPct').textContent = '0%';
    return;
  }

  // فرز أسرع تنزيل نشط وعرض بياناته
  const top = [...active].sort((a, b) => (b.speed || 0) - (a.speed || 0))[0];
  const name = top.filename || top.title || top.url || '';
  $('#fName').textContent = name;
  $('#fName').title = name;

  const pct = top.size ? Math.min(100, (top.received / top.size) * 100)
    : (top.percent != null ? top.percent : 0);
  const pctStr = pct.toFixed(0) + '%';

  $('#fBar').style.width = pct.toFixed(1) + '%';
  $('#fPillBar').style.width = pct.toFixed(1) + '%';
  $('#fPct').textContent = pctStr;
});
