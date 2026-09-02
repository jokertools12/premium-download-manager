'use strict';

const http = require('http');

// خادم محلي يستقبل الروابط من إضافة المتصفح عبر Native Messaging
class LocalServer {
  constructor({ port, engine, video, videoDir, version, onFocus }) {
    this.port = port;
    this.engine = engine;
    this.video = video || null;
    this.videoDir = videoDir || (() => engine.settings.downloadDir);
    this.version = version || '';
    this.onFocus = onFocus || (() => {});
    this.server = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        // ترويسات CORS: تسمح لإضافة المتصفح بالتواصل المباشر عبر HTTP (MV3)
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        if (req.method === 'POST' && req.url === '/add') {
          let body = '';
          req.on('data', c => { body += c; if (body.length > 1024 * 512) req.destroy(); });
          req.on('end', () => {
            let ok = false;
            try {
              const msg = JSON.parse(body || '{}');
              const url = String(msg.url || '').trim();
              if (/^https?:\/\//i.test(url)) {
                const headers = {};
                if (msg.referrer) headers.referer = msg.referrer;
                if (this.video && (msg.video || this.video.isStreamUrl(url))) {
                  // فيديو (كليك يمين في المتصفح) أو بث HLS/M3U8: يوجه لمستخرج الفيديوهات بأفضل جودة
                  this.video.autoDownload(url, this.videoDir());
                } else {
                  this.engine.addTask({
                    url,
                    filename: msg.filename || undefined,
                    headers
                  });
                }
                ok = true;
                this.onFocus();
              }
            } catch (_e) { /* رسالة تالفة */ }
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok }));
          });
        } else if (req.url === '/ping') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true, running: true, app: 'PremiumDM', version: this.version || '1.5.0' }));
        } else if (req.url === '/status') {
          /* API للمطورين (5.7): نظرة عامة على الحالة بدون مصادقة (محلي 127.0.0.1 فقط) */
          let summary = { speed: 0, downloading: 0, queued: 0, paused: 0, completed: 0, failed: 0, total: 0 };
          try { summary = { ...summary, ...this.engine.summary() }; } catch (_e) {}
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            ok: true, running: true, app: 'PremiumDM',
            version: this.version || '1.5.0',
            summary
          }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      this.server.once('error', reject);
      this.server.listen(this.port, '127.0.0.1', () => resolve());
    });
  }

  stop() {
    if (this.server) this.server.close();
  }
}

module.exports = LocalServer;
