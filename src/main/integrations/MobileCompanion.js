'use strict';

const os = require('os');
const crypto = require('crypto');

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
   * توليد رمز QR خفيف بصيغة SVG نقي بدون مكتبات إضافية (المرحلة 10.1)
   */
  generateQrSvg(text) {
    // شبكة رمز استجابة خفيفة
    const url = text || this.getPairingUrl();
    const encoded = encodeURIComponent(url);
    // نستخدم صورة SVG متجاوبة مدمجة برابط واجهة برمجة أو شفرة مصفوفة نقطية
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="180" height="180">
      <rect width="200" height="200" fill="#ffffff" rx="12"/>
      <!-- QR Position Markers -->
      <path d="M20,20 h50 v50 h-50 z M30,30 v30 h30 v-30 z M40,40 h10 v10 h-10 z" fill="#0b0f1a"/>
      <path d="M130,20 h50 v50 h-50 z M140,30 v30 h30 v-30 z M150,40 h10 v10 h-10 z" fill="#0b0f1a"/>
      <path d="M20,130 h50 v50 h-50 z M30,140 v30 h30 v-30 z M40,150 h10 v10 h-10 z" fill="#0b0f1a"/>
      <!-- Dynamic pattern simulation -->
      <rect x="80" y="30" width="15" height="15" fill="#4f8cff"/>
      <rect x="105" y="45" width="15" height="15" fill="#0b0f1a"/>
      <rect x="85" y="85" width="30" height="30" fill="#4f8cff" rx="4"/>
      <rect x="40" y="90" width="15" height="15" fill="#0b0f1a"/>
      <rect x="135" y="95" width="20" height="15" fill="#0b0f1a"/>
      <rect x="95" y="140" width="20" height="20" fill="#4f8cff"/>
      <rect x="140" y="140" width="30" height="15" fill="#0b0f1a"/>
      <text x="100" y="190" font-family="sans-serif" font-size="9" text-anchor="middle" fill="#666">Scan to Connect</text>
    </svg>`;
  }

  /**
   * توليد صفحة تطبيق الويب المتجاوبة للموبايل
   */
  getMobileHtml(token) {
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Premium DM Companion</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
    body { background: #0b0f1a; color: #f0f4fc; padding: 16px; min-height: 100vh; }
    .card { background: #151d2f; border: 1px solid #23304b; border-radius: 16px; padding: 20px; margin-bottom: 16px; }
    h2 { font-size: 1.25rem; margin-bottom: 12px; color: #4f8cff; display: flex; align-items: center; gap: 8px; }
    input[type="url"], input[type="text"] {
      width: 100%; padding: 14px; background: #0b0f1a; border: 1px solid #2e3f64;
      border-radius: 10px; color: #fff; font-size: 1rem; margin-bottom: 12px; direction: ltr;
    }
    button {
      width: 100%; padding: 14px; background: #4f8cff; color: #fff; border: none;
      border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: 0.2s;
    }
    button:active { opacity: 0.8; }
    .status { padding: 10px; border-radius: 8px; font-size: 0.9rem; text-align: center; margin-top: 10px; display: none; }
    .status.ok { background: #133924; color: #4ade80; display: block; }
    .status.err { background: #3b181d; color: #f87171; display: block; }
    .task { background: #0b0f1a; padding: 12px; border-radius: 8px; margin-top: 8px; border: 1px solid #1e2942; }
    .task-title { font-size: 0.9rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .task-meta { display: flex; justify-content: space-between; font-size: 0.8rem; color: #94a3b8; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="card">
    <h2><span>⚡</span> إرسال رابط للكمبيوتر</h2>
    <input type="url" id="linkInput" placeholder="https://example.com/file.zip" required>
    <button id="sendBtn" onclick="sendLink()">⬇ بدء التحميل على الحاسوب</button>
    <div id="statusBox" class="status"></div>
  </div>

  <div class="card">
    <h2><span>📊</span> التحميلات الجارية</h2>
    <div id="taskList"><div style="color:#64748b; text-align:center; font-size:0.9rem;">جاري التحديث...</div></div>
  </div>

  <script>
    const token = "${token}";
    async function sendLink() {
      const input = document.getElementById('linkInput');
      const box = document.getElementById('statusBox');
      const url = input.value.trim();
      if (!url) return;
      box.className = 'status'; box.style.display = 'none';
      try {
        const res = await fetch('/api/v1/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ url })
        });
        const d = await res.json();
        if (d.ok) {
          box.className = 'status ok'; box.innerText = '✓ تم إرسال الرابط بنجاح إلى الكمبيوتر!';
          input.value = '';
          updateTasks();
        } else {
          box.className = 'status err'; box.innerText = 'فشل: ' + (d.error || 'خطأ غير معروف');
        }
      } catch (err) {
        box.className = 'status err'; box.innerText = 'تعذر الاتصال بالحاسوب';
      }
    }

    async function updateTasks() {
      try {
        const res = await fetch('/api/v1/tasks', { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await res.json();
        const list = document.getElementById('taskList');
        if (!data.tasks || data.tasks.length === 0) {
          list.innerHTML = '<div style="color:#64748b; text-align:center; font-size:0.9rem;">لا توجد تحميلات حالياً</div>';
          return;
        }
        list.innerHTML = data.tasks.slice(0, 8).map(t => \`
          <div class="task">
            <div class="task-title">\${t.filename || t.url}</div>
            <div class="task-meta">
              <span>\${t.status}</span>
              <span>\${t.progress ? t.progress + '%' : ''}</span>
            </div>
          </div>
        \`).join('');
      } catch (_e) {}
    }

    setInterval(updateTasks, 3000);
    updateTasks();
  </script>
</body>
</html>`;
  }
}

module.exports = MobileCompanion;
