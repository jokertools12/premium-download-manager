'use strict';

import { $, toast, openModal, closeModal } from '../lib/dom.js';
import { fmtBytes } from '../lib/format.js';

export function wireAiUI() {
  // 1. توليد القواعد باللغة الطبيعية
  const btnAiRule = $('#btnAiParseRule');
  const txtAiRule = $('#aiRuleInput');
  if (btnAiRule && txtAiRule) {
    btnAiRule.addEventListener('click', async () => {
      const text = txtAiRule.value.trim();
      if (!text) return;
      try {
        const rule = await window.pdm.ai.parseRule(text);
        if (!rule) {
          toast('لم يتم استخراج قاعدة صالحة، جرب صياغة مثل: "ضع ملفات pdf في مجلد الكتب"', 'warn');
          return;
        }

        // إضافة القاعدة المستخرجة لقائمة القواعد
        const row = document.createElement('div');
        row.className = 'rule-row';
        row.innerHTML = `
          <input type="text" class="rule-pattern" value="${(rule.conditions && rule.conditions[0] && (rule.conditions[0].ext || rule.conditions[0].domain)) || ''}" placeholder="كلمة مفتاحية أو نطاق">
          <input type="text" class="rule-folder" value="${rule.subDir || ''}" placeholder="مجلد الوجهة">
          <button class="btn ghost rule-del">✕</button>
        `;
        row.querySelector('.rule-del').addEventListener('click', () => row.remove());
        const list = $('#rulesList');
        if (list) list.prepend(row);
        txtAiRule.value = '';
        toast('✨ تم استخراج القاعدة بنجاح بواسطة الذكاء الاصطناعي!', 'ok');
      } catch (_e) {
        toast('تعذر تحليل القاعدة', 'err');
      }
    });
  }

  // 2. زر فتح نافذة التنظيف الذكي
  const btnCleanup = $('#btnOpenCleanup');
  if (btnCleanup) {
    btnCleanup.addEventListener('click', () => openCleanupModal());
  }

  const btnDoCleanup = $('#btnDoCleanup');
  if (btnDoCleanup) {
    btnDoCleanup.addEventListener('click', executeSelectedCleanup);
  }

  const daysSelect = $('#cleanupDays');
  if (daysSelect) {
    daysSelect.addEventListener('change', () => openCleanupModal(Number(daysSelect.value)));
  }

  const btnRefresh = $('#btnRefreshCleanup');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      const d = ($('#cleanupDays') && Number($('#cleanupDays').value)) || 30;
      openCleanupModal(d);
    });
  }
}

export async function openCleanupModal(days = null) {
  const modal = $('#cleanupModal');
  const list = $('#cleanupList');
  const summary = $('#cleanupSummary');
  if (!modal || !list) return;

  const targetDays = days !== null ? days : (($('#cleanupDays') && Number($('#cleanupDays').value)) || 30);
  list.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">⏳ جاري فحص الملفات القديمة والمؤقتة والمكررة...</div>';
  openModal('cleanupModal');

  try {
    const res = await window.pdm.ai.suggestCleanup(targetDays);
    const suggestions = (res && res.suggestions) || [];
    if (summary) {
      summary.textContent = `المساحة المقترح تحريرها: ${fmtBytes(res.totalReclaimableBytes || 0)} (${suggestions.length} ملف)`;
    }

    if (suggestions.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding:20px; color:#4ade80;">✨ ممتاز! لا توجد ملفات مهملة أو مكررة في هذه الفترة.</div>';
      if ($('#btnDoCleanup')) $('#btnDoCleanup').disabled = true;
      return;
    }

    if ($('#btnDoCleanup')) $('#btnDoCleanup').disabled = false;

    list.innerHTML = suggestions.map((item, idx) => `
      <div style="display:flex; align-items:center; gap:10px; padding:10px; background:#0b0f1a; border:1px solid #1e2942; border-radius:8px; margin-bottom:8px;">
        <input type="checkbox" class="cleanup-check" data-path="${encodeURIComponent(item.filePath)}" checked id="cl_${idx}">
        <label for="cl_${idx}" style="flex:1; cursor:pointer;">
          <div style="font-weight:500; font-size:0.9rem; color:#f0f4fc;">${item.filename}</div>
          <div style="font-size:0.8rem; color:#94a3b8;">${item.message} • ${fmtBytes(item.size)}</div>
        </label>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div style="color:#f87171; padding:20px;">خطأ: ${String((err && err.message) || err)}</div>`;
  }
}

async function executeSelectedCleanup() {
  const checks = document.querySelectorAll('.cleanup-check:checked');
  const paths = Array.from(checks).map(c => decodeURIComponent(c.getAttribute('data-path'))).filter(Boolean);
  if (paths.length === 0) {
    toast('لم تحدد أي ملفات للحذف', 'warn');
    return;
  }

  try {
    const res = await window.pdm.ai.executeCleanup(paths);
    toast(`✓ تم تنظيف ${res.deletedCount} ملف وتحرير ${fmtBytes(res.freedBytes)} بنجاح!`, 'ok');
    closeModal('cleanupModal');
  } catch (err) {
    toast('حدث خطأ أثناء التنظيف: ' + String((err && err.message) || err), 'err');
  }
}
