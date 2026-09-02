/* سجل التحميل الكامل (3.2) — عرض شهري + إعادة تحميل بنقرة */

import { $ } from '../lib/dom.js';
import { fmtBytes } from '../lib/format.js';
import { state, statusLabel, CAT_ICON } from '../state.js';

/* يجمع السجل حسب الشهر: Map('2026-02' → entries) — نقية وقابلة للاختبار */
export function groupByMonth(items) {
  const map = new Map();
  for (const it of (items || [])) {
    const d = new Date(it.ts || 0);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  }
  return map;
}

/* اسم الشهر باللغة الحالية — نقية (تعتمد على window.t للتبعية الوحيدة) */
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  try {
    return d.toLocaleDateString(window.t('locale.tag') || 'ar', { month: 'long', year: 'numeric' });
  } catch (_e) {
    return key;
  }
}

export function renderHistory() {
  const items = state.history || [];
  $('#histEmpty').hidden = !!items.length;
  const groups = groupByMonth(items);
  const html = [];
  for (const [key, rows] of groups) {
    html.push(`<div class="hist-month" data-i18n-skip>${monthLabel(key)}</div>`);
    for (const r of rows) {
      const ok = r.status === 'completed';
      html.push(`
        <div class="hist-row" data-id="${r.id}">
          <div class="t-icon">${CAT_ICON[r.category] || '📦'}</div>
          <div class="h-main">
            <div class="t-name" title="${r.filename || r.url}">${r.filename || r.url || '—'}</div>
            <div class="h-meta">
              <span class="badge ${r.status}">${statusLabel(r.status)}</span>
              <span>${fmtBytes(r.received || 0)}${r.size ? ' / ' + fmtBytes(r.size) : ''}</span>
              <span dir="ltr">${new Date(r.ts).toLocaleString()}</span>
            </div>
          </div>
          <div class="t-actions">
            ${ok ? `<button class="btn mini" data-hact="open" data-id="${r.id}" title="${window.t('act.open')}">📂</button>` : ''}
            ${ok && r.filePath ? `<button class="btn mini" data-hact="folder" data-id="${r.id}" title="${window.t('act.folder')}">🗂️</button>` : ''}
            <button class="btn mini" data-hact="redownload" data-id="${r.id}" title="${window.t('hist.redownload')}">⤓</button>
            <button class="btn mini" data-hact="del" data-id="${r.id}" title="${window.t('hist.remove')}">🗑️</button>
          </div>
        </div>`);
    }
  }
  $('#histList').innerHTML = html.join('');
}

export function findHistory(id) {
  return (state.history || []).find(h => h.id === id) || null;
}