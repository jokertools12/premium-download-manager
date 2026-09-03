'use strict';

import { $, toast, openModal } from '../lib/dom.js';

let currentPairingUrl = '';

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

  const btnCopy = $('#btnCopyMobileUrl');
  if (btnCopy) {
    btnCopy.addEventListener('click', async () => {
      if (!currentPairingUrl) return;
      try {
        await navigator.clipboard.writeText(currentPairingUrl);
        toast('تم نسخ رابط إقران الموبايل إلى الحافظة!', 'ok');
      } catch (_e) {
        toast('تعذر نسخ الرابط تلقائياً', 'err');
      }
    });
  }

  const btnOpen = $('#btnOpenMobileBrowser');
  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      if (!currentPairingUrl) return;
      window.open(currentPairingUrl, '_blank');
    });
  }
}

export async function openMobileModal() {
  const modal = $('#mobileModal');
  const qrContainer = $('#mobileQr');
  const linkText = $('#mobileUrl');
  if (!modal || !qrContainer) return;

  qrContainer.innerHTML = '<div style="color:#64748b; padding:20px;">⏳ جاري توليد كود الإقران الحقيقي...</div>';
  openModal(modal);

  try {
    const res = await window.pdm.mobile.qrCode();
    if (res && res.svg) {
      qrContainer.innerHTML = res.svg;
      currentPairingUrl = res.url || '';
      if (linkText) linkText.textContent = currentPairingUrl;
    }
  } catch (err) {
    qrContainer.innerHTML = `<div style="color:#f87171;">تعذر توليد كود الإقران: ${String((err && err.message) || err)}</div>`;
  }
}
