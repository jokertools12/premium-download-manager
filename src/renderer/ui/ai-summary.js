'use strict';

import { $, toast, openModal, closeModal } from '../../lib/dom.js';

export async function openAiSummaryModal(task = {}) {
  const modal = $('#aiSummaryModal');
  if (!modal) return;

  const fp = (task && task.filePath) || '';
  $('#aiSummaryTitle').textContent = (task && (task.filename || task.title)) || 'مساعد الذكاء الاصطناعي لتلخيص المحتوى';
  openModal('#aiSummaryModal');

  if (!fp) {
    $('#aiSummaryLoading').hidden = true;
    $('#aiSummaryContent').hidden = false;
    $('#aiSummaryOverview').textContent = '💡 مرحباً بك في مساعد الذكاء الاصطناعي! يمكنك تلخيص أي ملف وسائط أو ترجمة أو مستند موجود على جهازك، أو الضغط على زر التلخيص المباشر 💡 في بطاقة أي تحميل مكتمل.';
    const pointsList = $('#aiSummaryPoints');
    pointsList.innerHTML = `
      <li>اضغط على زر <strong>"📂 اختيار ملف آخر..."</strong> في الأعلى لاختيار أي ملف من جهازك.</li>
      <li>يدعم التحليل والتلخيص لملفات الترجمة (.srt / .vtt) والنصوص والمستندات (.txt / .md / .pdf).</li>
      <li>بالنسبة للفيديوهات، يقوم المساعد بالبحث عن الترجمة المرفقة وتلخيص كامل الحوارات بدقة.</li>
    `;
    $('#aiSummaryStats').textContent = 'في انتظار اختيار ملف...';
    return;
  }

  $('#aiSummaryLoading').hidden = false;
  $('#aiSummaryContent').hidden = true;

  try {
    const res = await window.pdm.invoke('ai:summarizeFile', { filePath: fp, maxPoints: 5 });
    $('#aiSummaryLoading').hidden = true;
    $('#aiSummaryContent').hidden = false;

    $('#aiSummaryOverview').textContent = res.summary || 'تم استخراج الأفكار الرئيسية بنجاح.';

    const pointsList = $('#aiSummaryPoints');
    pointsList.innerHTML = '';
    if (res.keyPoints && res.keyPoints.length) {
      for (const p of res.keyPoints) {
        const li = document.createElement('li');
        li.textContent = p;
        pointsList.appendChild(li);
      }
    } else {
      const li = document.createElement('li');
      li.textContent = 'لا توجد تفاصيل إضافية مستخرجة.';
      pointsList.appendChild(li);
    }

    $('#aiSummaryStats').textContent = `عدد الكلمات المعالجة: ${res.wordCount || 0}`;
  } catch (err) {
    $('#aiSummaryLoading').hidden = true;
    $('#aiSummaryContent').hidden = false;
    $('#aiSummaryOverview').textContent = 'تعذر استخراج ملخص المحتوى: ' + (err.message || err);
    $('#aiSummaryPoints').innerHTML = '';
  }
}

export function wireAiSummaryModal() {
  const closeBtn = $('#btnAiSummaryClose');
  if (closeBtn) closeBtn.onclick = () => closeModal('#aiSummaryModal');

  const browseBtn = $('#btnBrowseAi');
  if (browseBtn) {
    browseBtn.onclick = async () => {
      const picked = await window.pdm.invoke('chooseFile', {
        filters: [{ name: 'Text & Media', extensions: ['srt', 'vtt', 'txt', 'md', 'pdf', 'mp4', 'mkv', 'webm', 'mp3'] }]
      });
      if (picked) {
        openAiSummaryModal({ filePath: picked, filename: picked.split(/[\\/]/).pop() });
      }
    };
  }

  const copyBtn = $('#btnCopyAiSummary');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const overview = $('#aiSummaryOverview').textContent;
      const points = [...$('#aiSummaryPoints').querySelectorAll('li')].map(li => '• ' + li.textContent).join('\n');
      const text = `ملخص المحتوى:\n${overview}\n\nالنقاط الرئيسية:\n${points}`;
      try {
        await window.pdm.invoke('clipboard:write', { text });
      } catch (_e) {}
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text);
        }
      } catch (_e) {}
      toast('✓ تم نسخ نص الملخص بنجاح إلى الحافظة', 'ok');
    };
  }
}
