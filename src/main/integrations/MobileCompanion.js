'use strict';

const os = require('os');
const crypto = require('crypto');
const { generateQrSvg } = require('./qr');

class MobileCompanion {
  /**
   * @param {object} opts
   * @param {number} opts.port منفذ الخادم
   * @param {object} opts.engine محرك التحميل
   * @param {function} opts.onIncomingUrl دالة معالجة الروابط الواردة
   */
  constructor({ port = 45762, engine, onIncomingUrl }) {
    this.port = port;
    this.engine = engine;
    this.onIncomingUrl = onIncomingUrl || (() => {});
    this.token = this._generateToken();
  }

  _generateToken() {
    return crypto.randomBytes(12).toString('hex');
  }

  rotateToken() {
    this.token = this._generateToken();
    return this.token;
  }

  validateToken(tok) {
    if (!tok || !this.token) return false;
    return tok.trim() === this.token;
  }

  getLocalIp() {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const net of ifaces[name]) {
        // البحث عن IPv4 محلي غير داخلي (192.168.x.x أو 10.x.x.x)
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    return '127.0.0.1';
  }

  getPairingUrl() {
    const ip = this.getLocalIp();
    return `http://${ip}:${this.port}/mobile?token=${this.token}`;
  }

  /**
   * توليد رمز QR حقيقي ومقروء بنسبة 100% بكاميرات الهواتف
   */
  generateQrSvg(text) {
    const url = text || this.getPairingUrl();
    return generateQrSvg(url, { size: 210, margin: 2, fg: '#0b0f1a', bg: '#ffffff' });
  }

  /**
   * توليد تطبيق الويب التقدمي الفاخر للموبايل (Mobile Remote PWA 2.0)
   */
  getMobileHtml(token) {
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Premium DM • Mobile Remote</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #131b2e;
      --card-border: rgba(56, 189, 248, 0.2);
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.35);
      --success: #34d399;
      --danger: #f87171;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }
    body { background: var(--bg); color: var(--text); padding: 14px; min-height: 100vh; display: flex; flex-direction: column; gap: 14px; }
    
    /* الهيدر وشريط الحالة */
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    }
    .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 1.05rem; }
    .logo-glow { color: var(--accent); filter: drop-shadow(0 0 6px var(--accent)); font-size: 1.2rem; }
    .status-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--success);
      background: rgba(52, 211, 153, 0.12);
      border: 1px solid rgba(52, 211, 153, 0.3);
      padding: 3px 10px;
      border-radius: 20px;
    }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); box-shadow: 0 0 6px var(--success); animation: pulse 1.5s infinite; }
    @keyframes pulse { 0% { opacity: 0.5; } 100% { opacity: 1; } }

    /* لوحة المؤشرات السريعة (Speed & Stats) */
    .stats-card {
      background: linear-gradient(135deg, rgba(19, 27, 46, 0.95), rgba(15, 23, 42, 0.98));
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 16px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    }
    .stats-row { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 10px; }
    .speed-box { display: flex; flex-direction: column; gap: 2px; }
    .speed-lbl { font-size: 0.78rem; color: var(--text-muted); font-weight: 600; }
    .speed-val { font-size: 1.7rem; font-weight: 800; color: var(--success); font-variant-numeric: tabular-nums; }
    .count-badge { font-size: 0.85rem; font-weight: 700; color: var(--accent); background: rgba(56, 189, 248, 0.12); padding: 4px 10px; border-radius: 10px; border: 1px solid var(--card-border); }
    .overall-bar { width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 6px; overflow: hidden; }
    .overall-bar-fill { height: 100%; width: 0%; background: linear-gradient(90deg, var(--accent), #818cf8); transition: width 0.3s ease; }

    /* أزرار التحكم عن بعد (Remote Controls) */
    .controls-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .ctrl-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.05);
      color: var(--text);
      font-size: 0.92rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }
    .ctrl-btn:active { transform: scale(0.97); background: rgba(56, 189, 248, 0.2); border-color: var(--accent); }
    .ctrl-btn.pause { color: #f59e0b; }
    .ctrl-btn.resume { color: var(--success); }

    /* بطاقة إضافة الرابط */
    .card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.35);
    }
    .card-title { font-size: 1rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .input-wrap { position: relative; margin-bottom: 10px; }
    input[type="url"], input[type="text"] {
      width: 100%;
      padding: 12px 14px;
      background: #0b0f1a;
      border: 1px solid #243250;
      border-radius: 12px;
      color: #fff;
      font-size: 0.95rem;
      direction: ltr;
      outline: none;
      transition: border 0.2s;
    }
    input:focus { border-color: var(--accent); box-shadow: 0 0 10px var(--accent-glow); }
    .input-actions { display: flex; gap: 8px; margin-bottom: 8px; }
    .paste-btn {
      flex: 1;
      padding: 10px;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid var(--card-border);
      color: var(--accent);
      border-radius: 10px;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
    }
    .submit-btn {
      width: 100%;
      padding: 13px;
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #fff;
      border: none;
      border-radius: 12px;
      font-size: 0.98rem;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4);
      transition: 0.2s;
    }
    .submit-btn:active { transform: scale(0.98); }
    .alert-msg { padding: 9px 12px; border-radius: 10px; font-size: 0.85rem; font-weight: 600; margin-top: 10px; display: none; text-align: center; }
    .alert-msg.ok { background: rgba(52, 211, 153, 0.15); border: 1px solid var(--success); color: var(--success); display: block; }
    .alert-msg.err { background: rgba(248, 113, 113, 0.15); border: 1px solid var(--danger); color: var(--danger); display: block; }

    /* قائمة التحميلات الجارية */
    .task-list { display: flex; flex-direction: column; gap: 8px; max-height: 40vh; overflow-y: auto; }
    .task-item {
      background: #0b0f1a;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 12px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .task-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .task-name { font-size: 0.88rem; font-weight: 700; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; direction: auto; }
    .task-cancel {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      border: 1px solid rgba(248, 113, 113, 0.3);
      background: rgba(248, 113, 113, 0.1);
      color: var(--danger);
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .t-bar { height: 5px; background: rgba(255,255,255,0.08); border-radius: 5px; overflow: hidden; }
    .t-bar-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--success)); width: 0%; transition: width 0.3s; }
    .task-info { display: flex; justify-content: space-between; font-size: 0.76rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }

    /* خيار الإغلاق الذكي */
    .opt-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      font-size: 0.88rem;
      font-weight: 600;
    }
    .opt-row input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; }
  </style>
</head>
<body>
  <!-- الهيدر وشارة الاتصال -->
  <header class="head">
    <div class="brand"><span class="logo-glow">⚡</span> Premium DM Remote</div>
    <div class="status-badge"><span class="status-dot"></span> متصل</div>
  </header>

  <!-- بطاقة المؤشرات والسرعة اللحظية -->
  <section class="stats-card">
    <div class="stats-row">
      <div class="speed-box">
        <span class="speed-lbl">سرعة التحميل اللحظية</span>
        <span id="speedVal" class="speed-val">▲ 0 B/s</span>
      </div>
      <span id="activeCount" class="count-badge">0 تنزيلات نشطة</span>
    </div>
    <div class="overall-bar"><div id="overallBarFill" class="overall-bar-fill"></div></div>
  </section>

  <!-- أزرار التحكم عن بعد -->
  <section class="controls-grid">
    <button class="ctrl-btn pause" onclick="remoteAction('pause-all')">⏸ إيقاف الكل</button>
    <button class="ctrl-btn resume" onclick="remoteAction('resume-all')">▶ استئناف الكل</button>
  </section>

  <!-- إرسال رابط للكمبيوتر -->
  <section class="card">
    <h3 class="card-title"><span>📥</span> إرسال رابط للتحميل فوراً</h3>
    <div class="input-actions">
      <button class="paste-btn" onclick="pasteClipboard()">📋 لصق الرابط من الحافظة</button>
    </div>
    <input type="url" id="linkInput" placeholder="https://example.com/file.zip" required>
    <button id="sendBtn" class="submit-btn" onclick="sendLink()">⬇ بدء التحميل على الكمبيوتر</button>
    <div id="statusBox" class="alert-msg"></div>
  </section>

  <!-- التحميلات الجارية -->
  <section class="card">
    <h3 class="card-title"><span>📊</span> التنزيلات النشطة على الكمبيوتر</h3>
    <div id="taskList" class="task-list">
      <div style="color:#64748b; text-align:center; font-size:0.85rem; padding:12px;">جاري تحديث البيانات...</div>
    </div>
  </section>

  <!-- خيار إغلاق الكمبيوتر عند الانتهاء -->
  <section class="opt-row">
    <label for="autoShutdownChk" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
      <span>🛑 إيقاف تشغيل الحاسوب عند اكتمال الكل</span>
    </label>
    <input type="checkbox" id="autoShutdownChk" onchange="toggleAutoShutdown(this.checked)">
  </section>

  <script>
    const token = "${token}";

    function fmtBytes(b) {
      if (!b) return '0 B';
      const u = ['B', 'KB', 'MB', 'GB'];
      let i = 0, v = b;
      while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
      return (i ? v.toFixed(1) : Math.round(v)) + ' ' + u[i];
    }

    async function pasteClipboard() {
      try {
        const text = await navigator.clipboard.readText();
        if (text && /^https?:\\/\\//i.test(text.trim())) {
          document.getElementById('linkInput').value = text.trim();
          showStatus('تم لصق الرابط بنجاح!', 'ok');
        } else {
          showStatus('الحافظة لا تحتوي على رابط ويب صالح', 'err');
        }
      } catch (_e) {
        showStatus('يرجى لصق الرابط يدوياً في الحقل', 'err');
      }
    }

    function showStatus(msg, type) {
      const b = document.getElementById('statusBox');
      b.className = 'alert-msg ' + type;
      b.textContent = msg;
      b.style.display = 'block';
      setTimeout(() => { b.style.display = 'none'; }, 4000);
    }

    async function sendLink() {
      const input = document.getElementById('linkInput');
      const url = input.value.trim();
      if (!url) return;
      try {
        const res = await fetch('/api/v1/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ url })
        });
        const d = await res.json();
        if (d.ok) {
          showStatus('✓ تم إرسال الرابط وبدأ التحميل على الحاسوب!', 'ok');
          input.value = '';
          updateTasks();
        } else {
          showStatus('فشل: ' + (d.error || 'خطأ غير معروف'), 'err');
        }
      } catch (_err) {
        showStatus('تعذر الاتصال بالحاسوب', 'err');
      }
    }

    async function remoteAction(act) {
      try {
        const res = await fetch('/api/v1/' + act, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const d = await res.json();
        if (d.ok) {
          showStatus(d.message || 'تم تنفيذ الأمر', 'ok');
          updateTasks();
        }
      } catch (_e) {
        showStatus('تعذر الاتصال بالحاسوب', 'err');
      }
    }

    async function cancelTask(id) {
      if (!confirm('هل تريد بالتأكيد إلغاء هذا التحميل؟')) return;
      try {
        await fetch('/api/v1/tasks/' + id + '/cancel', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        updateTasks();
      } catch (_e) {}
    }

    async function toggleAutoShutdown(enabled) {
      try {
        await fetch('/api/v1/system/auto-shutdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ enabled })
        });
        showStatus(enabled ? 'سيتم إيقاف تشغيل الحاسوب عند اكتمال الكل' : 'تم إلغاء الإغلاق التلقائي', 'ok');
      } catch (_e) {}
    }

    async function updateTasks() {
      try {
        const res = await fetch('/api/v1/tasks', { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await res.json();
        const tasks = data.tasks || [];
        const active = tasks.filter(t => t.status === 'downloading');
        
        let totalSpeed = 0;
        let totalPct = 0;
        active.forEach(t => {
          totalSpeed += (t.speed || 0);
          const p = t.size ? (t.received / t.size) * 100 : (t.percent || 0);
          totalPct += p;
        });

        document.getElementById('speedVal').textContent = '▲ ' + fmtBytes(totalSpeed) + '/s';
        document.getElementById('activeCount').textContent = active.length + ' تنزيلات نشطة';
        const avgPct = active.length ? (totalPct / active.length) : 0;
        document.getElementById('overallBarFill').style.width = avgPct.toFixed(0) + '%';

        const list = document.getElementById('taskList');
        if (!tasks.length) {
          list.innerHTML = '<div style="color:#64748b; text-align:center; font-size:0.85rem; padding:12px;">لا توجد مهام حالياً</div>';
          return;
        }

        list.innerHTML = tasks.slice(0, 10).map(t => {
          const pct = t.size ? Math.min(100, (t.received / t.size) * 100) : (t.percent || 0);
          return \`
            <div class="task-item">
              <div class="task-top">
                <span class="task-name" title="\${t.filename || t.url}">\${t.filename || t.title || t.url}</span>
                <button class="task-cancel" title="إلغاء" onclick="cancelTask('\${t.id}')">✕</button>
              </div>
              <div class="t-bar"><div class="t-bar-fill" style="width:\${pct.toFixed(1)}%"></div></div>
              <div class="task-info">
                <span>\${pct.toFixed(0)}% • \${t.speed ? fmtBytes(t.speed) + '/s' : t.status}</span>
                <span>\${fmtBytes(t.received || 0)} / \${fmtBytes(t.size || 0)}</span>
              </div>
            </div>
          \`;
        }).join('');
      } catch (_e) {}
    }

    setInterval(updateTasks, 2000);
    updateTasks();
  </script>
</body>
</html>`;
  }
}

module.exports = MobileCompanion;
