'use strict';

import { $, toast, openModal } from '../lib/dom.js';

export function wireRssUI() {
  const btnRss = $('#btnRssFeeds');
  if (btnRss) {
    btnRss.addEventListener('click', openRssModal);
  }

  const btnAdd = $('#btnRssAdd');
  if (btnAdd) {
    btnAdd.addEventListener('click', async () => {
      const url = ($('#rssInputUrl') && $('#rssInputUrl').value.trim()) || '';
      const filter = ($('#rssInputFilter') && $('#rssInputFilter').value.trim()) || '';
      const category = ($('#rssInputCat') && $('#rssInputCat').value) || 'other';
      if (!url) {
        toast('أدخل رابط خلاصة RSS صحيح', 'warn');
        return;
      }
      try {
        await window.pdm.rss.add({ url, filterRegex: filter, category });
        toast('✓ تم الاشتراك في الخلاصة بنجاح!', 'ok');
        if ($('#rssInputUrl')) $('#rssInputUrl').value = '';
        renderRssList();
      } catch (err) {
        toast('فشل إضافة الخلاصة: ' + String((err && err.message) || err), 'err');
      }
    });
  }
}

export async function openRssModal() {
  const modal = $('#rssModal');
  if (!modal) return;
  openModal(modal);
  renderRssList();
}

async function renderRssList() {
  const list = $('#rssList');
  if (!list) return;

  try {
    const feeds = await window.pdm.rss.list();
    if (!feeds || feeds.length === 0) {
      list.innerHTML = '<div style="color:#64748b; text-align:center; padding:20px;">لا توجد خلاصات RSS مشتركة حالياً</div>';
      return;
    }

    list.innerHTML = feeds.map(f => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:10px; background:#0b0f1a; border:1px solid #1e2942; border-radius:8px; margin-bottom:8px;">
        <div style="flex:1; overflow:hidden;">
          <div style="font-weight:600; font-size:0.9rem; color:#f0f4fc;">${f.title || f.url}</div>
          <div style="font-size:0.8rem; color:#94a3b8; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
            ${f.url} ${f.filterRegex ? `• فلتر: "${f.filterRegex}"` : ''}
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn ghost btn-rss-check" data-id="${f.id}" title="فحص الآن">🔄</button>
          <button class="btn ghost btn-rss-del" data-id="${f.id}" title="إلغاء الاشتراك" style="color:#f87171;">✕</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.btn-rss-check').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.getAttribute('data-id');
        toast('جاري فحص الخلاصة وتنزيل جديدها...', 'info');
        try {
          const res = await window.pdm.rss.check(id);
          toast(`✓ تم فحص الخلاصة (أُضيف ${res ? res.count : 0} تحميلاً جديداً)`, 'ok');
        } catch (_e) {
          toast('فشل فحص الخلاصة', 'err');
        }
      });
    });

    list.querySelectorAll('.btn-rss-del').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.getAttribute('data-id');
        await window.pdm.rss.remove(id);
        toast('تم إلغاء الاشتراك في الخلاصة', 'ok');
        renderRssList();
      });
    });
  } catch (_e) {}
}
