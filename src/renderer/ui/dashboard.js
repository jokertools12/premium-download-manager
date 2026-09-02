/* لوحة الإحصائيات: بطاقات الأرقام + مخطط السرعة (canvas) + توزيع الفئات */

import { $ } from '../lib/dom.js';
import { fmtBytes, fmtSpeed } from '../lib/format.js';
import { state, CATEGORIES } from '../state.js';

export function renderDashboard() {
  const s = state.dashboardStats || {};
  const today = s.today || {}, week = s.week || {}, total = s.total || {};
  const act = state.summary || {};
  const cards = [
    ['📥', fmtBytes(today.bytes || 0), `${window.t('dash.today')} • ${window.t('files.count', { n: today.files || 0 })}`],
    ['📅', fmtBytes(week.bytes || 0), `${window.t('dash.week')} • ${window.t('files.count', { n: week.files || 0 })}`],
    ['🌍', fmtBytes(total.bytes || 0), `${window.t('dash.total')} • ${window.t('files.count', { n: total.files || 0 })}`],
    ['⚡', fmtSpeed(act.speed || 0), `${window.t('dash.speedNow')} • ${act.downloading || 0} ${window.t('dash.active')}`]
  ];
  $('#statCards').innerHTML = cards.map(([ic, v, l]) =>
    `<div class="stat-card"><div class="ic">${ic}</div><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');

  drawSpeedChart();

  const cats = Object.entries(s.byCategory || {}).sort((a, b) => b[1].bytes - a[1].bytes);
  const maxB = Math.max(1, ...cats.map(c => c[1].bytes));
  $('#catDist').innerHTML = cats.length ? cats.map(([id, d]) => {
    const info = CATEGORIES.find(c => c.id === id);
    return `<div class="cat-row">
      <div class="lbl">${(info && info.icon) || '📦'} ${info ? window.t(info.key) : id}</div>
      <div class="track"><div style="width:${(d.bytes / maxB * 100).toFixed(1)}%"></div></div>
      <div class="val">${fmtBytes(d.bytes)} • ${window.t('files.count', { n: d.count })}</div>
    </div>`;
  }).join('') : `<div class="empty-sub">${window.t('dash.noData')}</div>`;
}

export function drawSpeedChart() {
  const cv = $('#speedChart');
  if (!cv || !cv.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr;
  cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.body);
  const border = css.getPropertyValue('--border').trim() || '#333';
  const muted = css.getPropertyValue('--muted').trim() || '#888';
  const accent = css.getPropertyValue('--accent').trim() || '#4f8cff';
  const padB = 22;

  ctx.clearRect(0, 0, w, h);
  const samples = state.speedSamples || [];
  const max = Math.max(1024, ...samples) * 1.15;

  // الشبكة + تسميات المحور
  ctx.font = '10px Segoe UI';
  ctx.strokeStyle = border;
  ctx.fillStyle = muted;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = 4 + ((h - padB - 4) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillText(fmtBytes((max * (4 - i)) / 4) + '/ث', 4, y - 3);
  }
  if (samples.length < 2) {
    ctx.fillStyle = muted;
    ctx.font = '12px Segoe UI';
    ctx.fillText('في انتظار بيانات السرعة...', w / 2 - 70, h / 2);
    return;
  }

  const step = w / 59;
  const pt = i => [
    w - (samples.length - 1 - i) * step,
    (h - padB) - (samples[i] / max) * (h - padB - 6)
  ];

  // المنطقة المعبأة
  ctx.beginPath();
  samples.forEach((v, i) => { const [x, y] = pt(i); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  const lastPt = pt(samples.length - 1);
  ctx.lineTo(lastPt[0], h - padB);
  ctx.lineTo(pt(0)[0], h - padB);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(79, 140, 255, 0.35)');
  g.addColorStop(1, 'rgba(79, 140, 255, 0)');
  ctx.fillStyle = g;
  ctx.fill();

  // الخط
  ctx.beginPath();
  samples.forEach((v, i) => { const [x, y] = pt(i); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  // نقطة القيمة الحالية
  ctx.beginPath();
  ctx.arc(lastPt[0], lastPt[1], 3.5, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.fillStyle = muted;
  ctx.font = '10px Segoe UI';
  ctx.fillText('-60ث', 4, h - 6);
  ctx.fillText('الآن', w - 26, h - 6);
}