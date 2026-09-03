'use strict';

import { $, toast, openModal, closeModal } from '../../lib/dom.js';

let currentTask = null;

export function openTranscodeModal(task = {}) {
  currentTask = task || {};
  const fp = (task && task.filePath) || '';
  $('#transcodeSource').value = fp;
  $('#transcodeSourceDisplay').textContent = (task && (task.filename || fp)) || '(لم يتم اختيار ملف — اضغط استعراض)';
  $('#transcodeProgress').hidden = true;
  $('#btnStartTranscode').disabled = false;
  openModal('#transcodeModal');
}

export function wireTranscodeModal() {
  const modal = $('#transcodeModal');
  if (!modal) return;

  $('#btnTranscodeClose').onclick = () => closeModal('#transcodeModal');

  const browseBtn = $('#btnBrowseTranscode');
  if (browseBtn) {
    browseBtn.onclick = async () => {
      const picked = await window.pdm.invoke('chooseFile', {
        filters: [{ name: 'Media Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'mp3', 'wav', 'flac', 'aac', 'm4a'] }]
      });
      if (picked) {
        currentTask = { filePath: picked, filename: picked.split(/[\\/]/).pop() };
        $('#transcodeSource').value = picked;
        $('#transcodeSourceDisplay').textContent = currentTask.filename;
      }
    };
  }

  $('#transcodeType').onchange = e => {
    const val = e.target.value;
    $('#transcodeFormatGroup').hidden = val !== 'audio';
    $('#compressGroup').hidden = val !== 'compress';
    $('#gifGroup').hidden = val !== 'gif';
  };

  $('#btnStartTranscode').onclick = async () => {
    if (!currentTask || !currentTask.filePath) {
      toast('يرجى اختيار ملف أولاً بالضغط على زر استعراض', 'warn');
      return;
    }
    const type = $('#transcodeType').value;
    const source = currentTask.filePath;
    const dir = source.replace(/[/\\][^/\\]+$/, '');
    const baseName = (currentTask.filename || 'media').replace(/\.[^.]+$/, '');

    let target = '';
    let method = '';
    let opts = {};

    if (type === 'audio') {
      const fmt = $('#transcodeAudioFmt').value || 'mp3';
      target = `${dir}/${baseName}_converted.${fmt}`;
      method = 'transcode:convert';
      opts = { format: fmt, bitrate: $('#transcodeBitrate').value || '320k' };
    } else if (type === 'compress') {
      target = `${dir}/${baseName}_compressed.mp4`;
      method = 'transcode:compress';
      opts = {
        hevc: $('#compressCodec').value === 'hevc',
        crf: parseInt($('#compressCrf').value || '28', 10),
        scale: $('#compressScale').value || undefined
      };
    } else if (type === 'gif') {
      target = `${dir}/${baseName}_animated.gif`;
      method = 'transcode:makeGif';
      opts = {
        start: $('#gifStart').value || '00:00:00',
        duration: parseInt($('#gifDuration').value || '5', 10),
        fps: parseInt($('#gifFps').value || '12', 10),
        scale: '480:-1'
      };
    }

    try {
      $('#btnStartTranscode').disabled = true;
      $('#transcodeProgress').hidden = false;
      $('#transcodeProgressText').textContent = 'جاري المعالجة بواسطة استوديو الوسائط... ⏳';

      await window.pdm.invoke(method, { source, target, opts });
      closeModal('#transcodeModal');
      toast(`✓ اكتملت المعالجة بنجاح! تم الحفظ في: ${target}`, 'ok');
    } catch (err) {
      $('#transcodeProgressText').textContent = 'فشل: ' + (err.message || err);
      toast('فشلت معالجة الوسائط: ' + (err.message || err), 'err');
    } finally {
      $('#btnStartTranscode').disabled = false;
    }
  };
}
