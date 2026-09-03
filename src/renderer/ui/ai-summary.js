'use strict';

import { $, toast, openModal, closeModal } from '../../lib/dom.js';

export async function openAiSummaryModal(task) {
  if (!task || !task.filePath) return;
  const modal = $('#aiSummaryModal');
  if (!modal) return;

  $('#aiSummaryTitle').textContent = task.filename || task.title || 'ملخص المحتوى';
  $('#aiSummaryLoading').hidden = false;
  $('#aiSummaryContent').hidden = true;
  openModal('#aiSummaryModal');

  try {
    const res = await window.pdm.invoke('ai:summarizeFile', { filePath: task.filePath, maxPoints: 5 });
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
    copyBtn.onclick = () => {
      const overview = $('#aiSummaryOverview').textContent;
      const points = [...$('#aiSummaryPoints').querySelectorAll('li')].map(li => '• ' + li.textContent).join('\n');
      const text = `ملخص الذكاء الاصطناعي:\n${overview}\n\nالنقاط الرئيسية:\n${points}`;
      navigator.clipboard.writeText(text);
      toast('✓ تم نسخ ملخص الذكاء الاصطناعي إلى الحافظة', 'ok');
    };
  }
}
