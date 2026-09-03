/* النوافذ الحوارية: إضافة رابط، الإعدادات، القواعد التلقائية، الاستيراد الجماعي، إضافة المتصفح */

import { $, toast, openModal, closeModal, applyTheme } from '../lib/dom.js';
import { fmtBytes } from '../lib/format.js';
import { state, STREAM_RE } from '../state.js';
import { render } from './render.js';
import { openVideoModal } from './video.js';

let inspectTimer = null;

export async function inspectAddUrl(url) {
  const target = String(url || '').trim();
  const card = $('#addInspectCard');
  if (!card) return;
  if (!/^https?:\/\//i.test(target)) {
    card.hidden = true;
    return;
  }

  const spinner = $('#inspSpinner');
  if (spinner) spinner.hidden = false;
  card.hidden = false;

  try {
    const info = await window.pdm.invoke('link:inspect', { url: target });
    if (spinner) spinner.hidden = true;
    if (!info) return;

    const catBadge = $('#inspCategory');
    if (catBadge) catBadge.textContent = (info.categoryName || 'عام');

    const sizeBadge = $('#inspSize');
    if (sizeBadge) sizeBadge.textContent = info.size ? fmtBytes(info.size) : 'حجم غير محدد';

    const resBadge = $('#inspResumable');
    if (resBadge) {
      resBadge.textContent = info.resumable ? '🟢 يدعم الاستئناف' : '🟡 تحميل مفرد';
    }

    const secBadge = $('#inspSecurity');
    if (secBadge) {
      secBadge.textContent = info.badge || '🛡️ آمن';
      secBadge.className = 'insp-badge sec' + (info.isExecutable ? ' warning' : '');
    }

    const fnVal = $('#inspFilename');
    if (fnVal) fnVal.textContent = info.filename || '—';

    const mimeVal = $('#inspMime');
    if (mimeVal) mimeVal.textContent = info.contentType || '—';

    // تعبئة تلقائية لاسم الملف إذا لم يُدخل يدوياً
    if (!$('#addName').value.trim() && info.filename) {
      $('#addName').value = info.filename;
    }

    // تصنيف تلقائي لمجلد الحفظ المناسب
    const s = state.settings || {};
    if (s.organizeByCategory && s.downloadDir && info.category && s.categoryDirs && s.categoryDirs[info.category]) {
      const sep = (window.pdm && window.pdm.platform === 'win32') ? '\\' : '/';
      const catSub = s.categoryDirs[info.category];
      const targetDir = String(s.downloadDir).replace(/[\\/]+$/, '') + sep + catSub;
      $('#addDir').value = targetDir;
    }
  } catch (_e) {
    if (spinner) spinner.hidden = true;
  }
}

/* ===== إضافة رابط ===== */
export async function openAdd(url) {
  $('#addUrl').value = url || '';
  $('#addName').value = '';
  $('#addChecksum').value = '';
  $('#addDir').value = (state.settings && state.settings.downloadDir) || '';
  const card = $('#addInspectCard');
  if (card) card.hidden = true;
  openModal('addModal');
  if (url) {
    inspectAddUrl(url);
  } else {
    $('#addUrl').focus();
  }
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
  // المكوّنات الإضافية (6.5)
  renderPluginsList();
  $('#stLang').value = s.language || 'ar';
  $('#stTheme').value = s.theme || 'dark';
  $('#stAccent').value = s.accentColor || '#4f8cff';
  $('#stDensity').value = s.density || 'cozy';
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

  // v6.0 Ultra: إعدادات التليجرام والشبكات
  const tg = s.telegram || {};
  const tgOn = $('#stTelegramOn');
  if (tgOn) tgOn.checked = !!tg.enabled;
  const tgToken = $('#stTelegramToken');
  if (tgToken) tgToken.value = tg.botToken || '';
  const tgChat = $('#stTelegramChatId');
  if (tgChat) tgChat.value = tg.chatId || '';
  const tgNotify = $('#stTelegramNotify');
  if (tgNotify) tgNotify.checked = tg.notifyOnComplete !== false;

  try {
    const netStatus = await window.pdm.invoke('network:getStatus');
    const netBond = $('#stNetworkBonding');
    if (netBond) netBond.checked = !!(netStatus && netStatus.enabled);
    const count = (netStatus && netStatus.adapterCount) || 0;
    const adList = (netStatus && netStatus.adapters || []).map(a => `${a.name} (${a.address})`).join(', ');
    const statText = $('#bondingStatusText');
    if (statText) {
      statText.textContent = count >= 2
        ? `✓ تم اكتشاف ${count} كروت شبكة نشطة متاحة للدمج: ${adList}`
        : `ℹ️ الكروت النشطة: ${adList || 'كرت افتراضي واحد'}. يمكنك تشغيل واي فاي وكابل معاً للمضاعفة.`;
    }
  } catch (_e) {}
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
    accentColor: $('#stAccent').value,
    density: $('#stDensity').value,
    language: $('#stLang').value,
    scheduler: {
      enabled: $('#stSched').checked,
      startAt: $('#stStartAt').value,
      stopAt: $('#stStopAt').value
    }
  };

  const tgOn = $('#stTelegramOn');
  if (tgOn) {
    const tgPatch = {
      enabled: $('#stTelegramOn').checked,
      botToken: $('#stTelegramToken').value.trim(),
      chatId: $('#stTelegramChatId').value.trim(),
      notifyOnComplete: $('#stTelegramNotify').checked
    };
    await window.pdm.invoke('telegram:save', tgPatch).catch(() => {});
  }
  const netBond = $('#stNetworkBonding');
  if (netBond) {
    await window.pdm.invoke('network:setBonding', { enabled: netBond.checked }).catch(() => {});
  }

  state.settings = await window.pdm.invoke('setSettings', patch);
  applyTheme(state.settings.theme, state.settings.accentColor, state.settings.density);
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

/* ===== المكوّنات الإضافية (6.5 و 7.6) ===== */
export async function renderPluginsList() {
  const el = $('#pluginsList');
  if (!el) return;
  const plugs = await window.pdm.invoke('plugins:list').catch(() => []);
  el.innerHTML = plugs.length ? plugs.map(p => `
    <div class="row" style="padding:6px 0; align-items:center;">
      <span style="flex:1" title="${p.description || ''}">🧩 ${p.name} <span class="hint">v${p.version}</span>
        ${!p.trusted ? '<span class="badge" style="background:#f59e0b; color:#000; font-size:0.7rem; padding:1px 5px; border-radius:4px; margin-right:4px;">غير موثق</span>' : '<span class="badge" style="background:#10b981; color:#fff; font-size:0.7rem; padding:1px 5px; border-radius:4px; margin-right:4px;">موثق ✓</span>'}
      </span>
      <label class="chk" style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" data-plugid="${p.id}" ${p.enabled ? 'checked' : ''}>
        <span class="hint">${p.enabled ? window.t('plug.on') : window.t('plug.off')}</span>
      </label>
    </div>`).join('') : `<div class="hint">${window.t('plug.none')}</div>`;
}

export function wirePluginsUI() {
  $('#pluginsList').addEventListener('change', async e => {
    const cb = e.target.closest('input[data-plugid]');
    if (!cb) return;
    try {
      await window.pdm.invoke('plugins:toggle', { id: cb.dataset.plugid, enabled: cb.checked, forceUntrusted: true });
      renderPluginsList();
    } catch (err) {
      toast('⚠️ ' + (err.message || err), 'err');
      renderPluginsList();
    }
  });
}

/* ===== ربط أزرار النوافذ ===== */
export function wireModals() {
  const btnTestTg = $('#btnTestTelegram');
  if (btnTestTg) {
    btnTestTg.onclick = async () => {
      const token = $('#stTelegramToken').value.trim();
      if (!token) return toast('يرجى كتابة Bot Token أولاً', 'err');
      $('#tgTestResult').textContent = 'جاري الاختبار... ⏳';
      try {
        const res = await window.pdm.invoke('telegram:test', { token });
        $('#tgTestResult').textContent = `✓ متصل بنجاح: @${res.username}`;
        toast(`✓ نجح الاتصال ببوت التليجرام: @${res.username}`, 'ok');
      } catch (err) {
        $('#tgTestResult').textContent = 'فشل: ' + (err.message || err);
        toast('فشل الاتصال بالبوت: ' + (err.message || err), 'err');
      }
    };
  }

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
      const payload = {
        url,
        filename: $('#addName').value.trim() || undefined,
        dir: $('#addDir').value.trim() || undefined,
        referer: $('#addReferer').value.trim() || undefined,
        checksum: $('#addChecksum').value.trim() || undefined,
        mirrors: $('#addMirrors').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
      };

      const r = await window.pdm.invoke('tasks:add', payload);

      // كشف التكرار (المرحلة 8.5)
      if (r && r.isDuplicate) {
        const dup = r.duplicateInfo || {};
        const proceed = confirm(`⚠️ كشف التكرار عبر السجل:\n${dup.message || 'تم تنزيل هذا الملف مسبقاً!'}\n\nهل ترغب في إعادة تنزيله على أي حال؟`);
        if (!proceed) return;
        await window.pdm.invoke('tasks:add', { ...payload, forceDuplicate: true });
      }

      closeModal('addModal');
      toast(window.t('add.added'), 'ok');
    } catch (err) {
      toast(err.message || String(err), 'err');
    }
  };
  $('#addUrl').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnStartDownload').click(); });
  $('#addUrl').addEventListener('input', e => {
    clearTimeout(inspectTimer);
    inspectTimer = setTimeout(() => {
      inspectAddUrl(e.target.value);
    }, 350);
  });

  const inspFilename = $('#inspFilename');
  if (inspFilename) {
    inspFilename.onclick = () => {
      if (inspFilename.textContent && inspFilename.textContent !== '—') {
        $('#addName').value = inspFilename.textContent;
        toast('تم اعتماد اسم الملف المستخرج', 'ok');
      }
    };
  }

  // الإعدادات
  $('#stBrowse').onclick = async () => {
    const d = await window.pdm.invoke('chooseDir');
    if (d) $('#stDir').value = d;
  };
  $('#btnSaveSettings').onclick = saveSettings;
  $('#btnOpenRules').onclick = openRules;

  // مزامنة البيانات (5.4)
  $('#btnExportData').onclick = async () => {
    try {
      const r = await window.pdm.invoke('exportData');
      if (r && r.path) toast(window.t('data.exported', { p: r.path }), 'ok');
    } catch (err) {
      toast('⚠️ ' + (err.message || err), 'err');
    }
  };
  $('#btnImportData').onclick = async () => {
    try {
      const r = await window.pdm.invoke('importData');
      if (r) {
        applyTheme(state.settings.theme, state.settings.accentColor, state.settings.density);
        render();
        toast(window.t('data.imported', { n: r.imported }), 'ok');
      }
    } catch (err) {
      toast('⚠️ ' + (err.message || err), 'err');
    }
  };

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