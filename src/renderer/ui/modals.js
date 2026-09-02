/* النوافذ الحوارية: إضافة رابط، الإعدادات، القواعد التلقائية، الاستيراد الجماعي، إضافة المتصفح */

import { $, toast, openModal, closeModal, applyTheme } from '../lib/dom.js';
import { state, STREAM_RE } from '../state.js';
import { render } from './render.js';
import { openVideoModal } from './video.js';

/* ===== إضافة رابط ===== */
export async function openAdd(url) {
  $('#addUrl').value = url || '';
  $('#addName').value = '';
  $('#addChecksum').value = '';
  $('#addDir').value = (state.settings && state.settings.downloadDir) || '';
  openModal('addModal');
  if (!url) $('#addUrl').focus();
}

/* ===== الإعدادات ===== */
export async function openSettings() {
  const s = state.settings || await window.pdm.invoke('getSettings');
  state.settings = s;
  $('#stDir').value = s.downloadDir;
  $('#stConcurrent').value = s.maxConcurrent;
  $('#stConnections').value = s.maxConnections;
  const kb = s.maxSpeedKB || 0;
  if (kb >= 1024) {
    $('#stMaxSpeed').value = Math.round((kb / 1024) * 10) / 10;
    $('#stSpeedUnit').value = 'mb';
  } else {
    $('#stMaxSpeed').value = kb;
    $('#stSpeedUnit').value = 'kb';
  }
  $('#stOrganize').checked = !!s.organizeByCategory;
  $('#stClipboard').checked = !!s.clipboardMonitor;
  $('#stAutoFloat').checked = !!s.autoFloat;
  $('#stAutoExtract').checked = !!s.autoExtract;
  $('#stNameTemplate').value = s.nameTemplate || '';
  $('#stLang').value = s.language || 'ar';
  $('#stTheme').value = s.theme || 'dark';
  $('#stSched').checked = !!(s.scheduler && s.scheduler.enabled);
  $('#stStartAt').value = (s.scheduler && s.scheduler.startAt) || '';
  $('#stStopAt').value = (s.scheduler && s.scheduler.stopAt) || '';
  openModal('settingsModal');
  renderExtRows();
  // عرض نوع قاعدة البيانات المستخدمة
  window.pdm.invoke('dbInfo').then(info => {
    $('#stStorage').textContent = window.t('set.storage') + ': ' +
      (info && info.mode === 'sqlite' ? window.t('set.storageSqlite') : window.t('set.storageJson'));
  }).catch(() => {});
  // عرض الإصدار الحالي
  window.pdm.invoke('update:state').then(st => {
    $('#updVersion').textContent = window.t('update.current', { v: (st && st.currentVersion) || '?' });
  }).catch(() => {});
}

export async function saveSettings() {
  const spd = parseFloat($('#stMaxSpeed').value) || 0;
  const maxSpeedKB = Math.max(0, Math.round($('#stSpeedUnit').value === 'mb' ? spd * 1024 : spd));
  const patch = {
    downloadDir: $('#stDir').value.trim(),
    maxConcurrent: Math.max(1, Math.min(10, parseInt($('#stConcurrent').value, 10) || 3)),
    maxConnections: Math.max(1, Math.min(32, parseInt($('#stConnections').value, 10) || 16)),
    maxSpeedKB,
    organizeByCategory: $('#stOrganize').checked,
    clipboardMonitor: $('#stClipboard').checked,
    autoFloat: $('#stAutoFloat').checked,
    autoExtract: $('#stAutoExtract').checked,
    nameTemplate: $('#stNameTemplate').value.trim(),
    theme: $('#stTheme').value,
    language: $('#stLang').value,
    scheduler: {
      enabled: $('#stSched').checked,
      startAt: $('#stStartAt').value,
      stopAt: $('#stStopAt').value
    }
  };
  state.settings = await window.pdm.invoke('setSettings', patch);
  applyTheme(state.settings.theme);
  const langChanged = state.settings.language !== window.getLang();
  if (langChanged) {
    window.setLang(state.settings.language);
    render(); // إعادة رسم النصوص الديناميكية باللغة الجديدة
  }
  closeModal('settingsModal');
  toast(window.t('set.saved'), 'ok');
}

/* ===== القواعد التلقائية ===== */
export async function openRules() {
  if (!state.settings) state.settings = await window.pdm.invoke('getSettings');
  state.rulesDraft = JSON.parse(JSON.stringify(state.settings.rules || []));
  if (!state.rulesDraft.length) state.rulesDraft.push({ pattern: '', folder: '' });
  renderRules();
  openModal('rulesModal');
}

export function renderRules() {
  $('#rulesList').innerHTML = state.rulesDraft.map((r, i) => `
    <div class="rules-row" data-i="${i}">
      <input class="r-pattern" type="text" placeholder="كلمة مفتاحية في الرابط، مثال: github.com" value="${String(r.pattern || '').replace(/"/g, '&quot;')}">
      <span class="r-arrow">←</span>
      <input class="r-folder" type="text" dir="ltr" placeholder="C:\\Downloads\\..." value="${String(r.folder || '').replace(/"/g, '&quot;')}">
      <button class="btn mini r-browse" title="تصفح مجلد">📂</button>
      <button class="btn mini r-del" title="حذف القاعدة">🗑️</button>
    </div>`).join('') || '<div class="empty-sub">لا توجد قواعد — أضف قاعدة بالزر أدناه</div>';
}

export async function saveRules() {
  const rules = state.rulesDraft
    .map(r => ({ pattern: String(r.pattern || '').trim(), folder: String(r.folder || '').trim() }))
    .filter(r => r.pattern && r.folder);
  state.settings = await window.pdm.invoke('setSettings', { rules });
  closeModal('rulesModal');
  toast(`تم حفظ ${rules.length} قاعدة`, 'ok');
}

/* ===== الاستيراد الجماعي ===== */
export function openImport() {
  $('#importText').value = '';
  $('#importFileHint').textContent = '';
  openModal('importModal');
  $('#importText').focus();
}

export async function doImport() {
  const urls = $('#importText').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!urls.length) { toast('الصق رابطاً واحداً على الأقل', 'err'); return; }
  try {
    const r = await window.pdm.invoke('importUrls', { urls });
    closeModal('importModal');
    let msg = window.t('import.done', { added: r.added });
    if (r.existed) msg += ' • ' + window.t('import.dup', { n: r.existed });
    if (r.invalid) msg += ' • ' + window.t('import.bad', { n: r.invalid });
    toast(msg, 'ok');
  } catch (err) {
    toast(window.t('import.fail', { msg: err.message || err }), 'err');
  }
}

/* ===== إضافة المتصفح ===== */
const EXT_BROWSERS = [
  { id: 'chrome', label: 'Chrome', icon: '🌐' },
  { id: 'edge', label: 'Edge', icon: '🌊' },
  { id: 'firefox', label: 'Firefox', icon: '🦊' }
];

export async function renderExtRows() {
  const st = await window.pdm.invoke('ext:status').catch(() => ({}));
  $('#extRows').innerHTML = EXT_BROWSERS.map(b => {
    const reg = st[b.id] === 'registered';
    return `<div class="row" style="padding:6px 0;">
      <span style="flex:1">${b.icon} ${b.label}</span>
      <span class="badge ${reg ? 'completed' : 'queued'}">${reg ? window.t('ext.registered') : window.t('ext.notRegistered')}</span>
      <button class="btn mini" data-ext-reg="${b.id}">${reg ? '↻' : '＋'}</button>
      ${reg ? `<button class="btn mini" data-ext-unreg="${b.id}" title="${window.t('ext.uninstall')}">✕</button>` : ''}
    </div>`;
  }).join('');
}

export function wireExtUI() {
  $('#btnExtFolder').onclick = () => window.pdm.invoke('ext:openFolder');
  $('#extRows').addEventListener('click', async e => {
    const reg = e.target.closest('[data-ext-reg]');
    const unreg = e.target.closest('[data-ext-unreg]');
    try {
      if (reg) {
        await window.pdm.invoke('ext:register', { browser: reg.dataset.extReg });
        toast(window.t('ext.done', { b: reg.dataset.extReg }), 'ok');
      } else if (unreg) {
        await window.pdm.invoke('ext:unregister', { browser: unreg.dataset.extUnreg });
        toast(window.t('ext.removed'), 'ok');
      }
      renderExtRows();
    } catch (err) {
      toast('⚠️ ' + (err.message || err), 'err');
    }
  });
}

/* ===== ربط أزرار النوافذ ===== */
export function wireModals() {
  // إضافة رابط
  $('#btnBrowse').onclick = async () => {
    const d = await window.pdm.invoke('chooseDir');
    if (d) $('#addDir').value = d;
  };
  $('#btnStartDownload').onclick = async () => {
    const url = $('#addUrl').value.trim();
    if (!/^https?:\/\//i.test(url)) { toast(window.t('add.badUrl'), 'err'); return; }
    // روابط البث M3U8/MPD توجّه لنافذة الفيديو
    if (STREAM_RE.test(url)) {
      closeModal('addModal');
      openVideoModal(url);
      return;
    }
    try {
      const r = await window.pdm.invoke('add', {
        url,
        filename: $('#addName').value.trim() || undefined,
        dir: $('#addDir').value.trim() || undefined,
        referer: $('#addReferer').value.trim() || undefined,
        checksum: $('#addChecksum').value.trim() || undefined,
        mirrors: $('#addMirrors').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
      });
      closeModal('addModal');
      toast(r && r.existed ? window.t('add.existed') : window.t('add.added'), 'ok');
    } catch (err) {
      toast('⚠️ ' + (err.message || err), 'err');
    }
  };
  $('#addUrl').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnStartDownload').click(); });

  // الإعدادات
  $('#stBrowse').onclick = async () => {
    const d = await window.pdm.invoke('chooseDir');
    if (d) $('#stDir').value = d;
  };
  $('#btnSaveSettings').onclick = saveSettings;
  $('#btnOpenRules').onclick = openRules;

  // نافذة القواعد
  $('#btnAddRule').onclick = () => { state.rulesDraft.push({ pattern: '', folder: '' }); renderRules(); };
  $('#btnSaveRules').onclick = saveRules;
  $('#rulesList').addEventListener('click', async e => {
    const row = e.target.closest('.rules-row');
    if (!row) return;
    const i = +row.dataset.i;
    if (e.target.closest('.r-del')) {
      state.rulesDraft.splice(i, 1);
      renderRules();
    } else if (e.target.closest('.r-browse')) {
      const d = await window.pdm.invoke('chooseDir');
      if (d) { state.rulesDraft[i].folder = d; renderRules(); }
    }
  });
  $('#rulesList').addEventListener('input', e => {
    const row = e.target.closest('.rules-row');
    if (!row) return;
    const i = +row.dataset.i;
    if (e.target.classList.contains('r-pattern')) state.rulesDraft[i].pattern = e.target.value;
    if (e.target.classList.contains('r-folder')) state.rulesDraft[i].folder = e.target.value;
  });

  // الاستيراد الجماعي
  $('#btnImportFile').onclick = async () => {
    const r = await window.pdm.invoke('readTextFile');
    if (r && r.content != null) {
      $('#importText').value = r.content;
      $('#importFileHint').textContent = r.path;
    }
  };
  $('#btnDoImport').onclick = doImport;
}