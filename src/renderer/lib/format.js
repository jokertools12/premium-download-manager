/* أدوات تنسيق النصوص والأرقام — نقية (بدون DOM) وقابلة للاختبار مباشرة */
export function fmtBytes(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  let s = i === 0 ? String(Math.round(v)) : v.toFixed(v >= 100 ? 0 : 1);
  if (s.endsWith('.0')) s = s.slice(0, -2);
  return s + ' ' + u[i];
}

export const fmtSpeed = n => fmtBytes(n) + '/ث';

export function fmtEta(t) {
  if (!t.size || !t.speed) return '—';
  const s = Math.max(0, Math.round((t.size - t.received) / t.speed));
  if (s > 3600) return '≈ ' + Math.round(s / 3600) + ' ' + window.t('eta.h');
  if (s > 60) return '≈ ' + Math.round(s / 60) + ' ' + window.t('eta.m');
  return '≈ ' + s + ' ' + window.t('eta.s');
}

export function fmtDur(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
           : `${m}:${String(s).padStart(2, '0')}`;
}