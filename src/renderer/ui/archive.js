'use strict';

import { $, toast, openModal, closeModal } from '../lib/dom.js';
import { fmtBytes } from '../lib/format.js';

export function openArchivePreview(url) {
  if (!url) return;
  const modal = $('#archiveModal');
  const body = $('#archiveBody');
  const status = $('#archiveStatus');

  body.innerHTML = '';
  status.textContent = '⏳ جاري فحص ملف الأرشيف عن بعد عبر طلبات Range...';
  status.style.display = 'block';
  openModal(modal);

  window.pdm.archive.preview(url).then(res => {
    if (!res || !res.supported) {
      status.textContent = `❌ ${res ? res.reason : 'تعذر فحص الأرشيف عن بعد'}`;
      return;
    }

    status.style.display = 'none';
    const files = res.files || [];
    body.innerHTML = `
      <div style="margin-bottom:10px; display:flex; justify-content:space-between; font-size:0.9rem; color:#94a3b8;">
        <span>📁 إجمالي الملفات: <b>${files.length}</b></span>
        <span>📦 الحجم الإجمالي: <b>${fmtBytes(res.totalSize || 0)}</b></span>
      </div>
      <div class="archive-tree" style="max-height:360px; overflow-y:auto; border:1px solid #1e2942; border-radius:8px; background:#0b0f1a;">
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:right;">
          <thead>
            <tr style="background:#151d2f; color:#94a3b8; border-bottom:1px solid #1e2942;">
              <th style="padding:8px 12px;">اسم الملف داخل الأرشيف</th>
              <th style="padding:8px 12px; width:110px;">الحجم الفعلي</th>
              <th style="padding:8px 12px; width:100px;">المضغوط</th>
            </tr>
          </thead>
          <tbody>
            ${files.map(f => `
              <tr style="border-bottom:1px solid #131a2a;">
                <td style="padding:8px 12px; font-family:monospace; direction:ltr; text-align:right;">
                  ${f.isDir ? '📁' : '📄'} ${f.filename}
                </td>
                <td style="padding:8px 12px; color:#cbd5e1;">${fmtBytes(f.size || 0)}</td>
                <td style="padding:8px 12px; color:#64748b;">${fmtBytes(f.compressedSize || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }).catch(err => {
    status.textContent = `❌ خطأ أثناء الفحص: ${String((err && err.message) || err)}`;
  });
}
