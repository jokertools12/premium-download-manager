/* أدوات DOM مشتركة بين جميع وحدات الواجهة */

export const $ = s => document.querySelector(s);

/* إشعار Toast (3.4): يدعم أزرار إجراء — مثال:
   toast('اكتمل', 'ok', [{ label: '📂', onClick: () => ... }]) */
export function toast(msg, kind = '', actions = []) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  const span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(span);
  for (const a of (actions || [])) {
    const b = document.createElement('button');
    b.className = 'toast-btn';
    b.textContent = a.label;
    b.onclick = () => { el.remove(); if (a.onClick) a.onClick(); };
    el.appendChild(b);
  }
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), actions && actions.length ? 8000 : 3500);
}

export function openModal(id) { $('#' + id).hidden = false; }
export function closeModal(id) { $('#' + id).hidden = true; }

/* Theming متقدم (3.8): الوضع + لون التمييز المخصص + كثافة العرض */
export function applyTheme(theme, accentColor, density) {
  document.body.classList.toggle('light', theme === 'light');
  document.body.classList.toggle('compact', density === 'compact');
  if (accentColor && /^#[0-9a-f]{3,8}$/i.test(accentColor)) {
    document.body.style.setProperty('--accent', accentColor);
  } else {
    document.body.style.removeProperty('--accent');
  }
}