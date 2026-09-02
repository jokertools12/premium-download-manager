/* أدوات DOM مشتركة بين جميع وحدات الواجهة */

export const $ = s => document.querySelector(s);

export function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export function openModal(id) { $('#' + id).hidden = false; }
export function closeModal(id) { $('#' + id).hidden = true; }

export function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
}