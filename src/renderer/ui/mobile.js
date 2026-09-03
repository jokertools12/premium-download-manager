'use strict';

import { $, toast, openModal } from '../lib/dom.js';

export function wireMobileUI() {
  const btnMobile = $('#btnMobilePair');
  if (btnMobile) {
    btnMobile.addEventListener('click', openMobileModal);
  }

  const btnRotate = $('#btnRotateToken');
  if (btnRotate) {
    btnRotate.addEventListener('click', async () => {
      await window.pdm.mobile.rotateToken();
      toast('تم تجديد رمز الأمان وإلغاء الجلسات السابقة', 'ok');
      openMobileModal();
    });
  }
}

export async function openMobileModal() {
  const modal = $('#mobileModal');
  const qrContainer = $('#mobileQr');
  const linkText = $('#mobileUrl');
  if (!modal || !qrContainer) return;

  qrContainer.innerHTML = '<div style="color:#64748b; padding:20px;">⏳ جاري توليد كود الإقران...</div>';
  openModal(modal);

  try {
    const res = await window.pdm.mobile.qrCode();
    if (res && res.svg) {
      qrContainer.innerHTML = res.svg;
      if (linkText) linkText.textContent = res.url || '';
    }
  } catch (err) {
    qrContainer.innerHTML = `<div style="color:#f87171;">تعذر توليد كود الإقران: ${String((err && err.message) || err)}</div>`;
  }
}
