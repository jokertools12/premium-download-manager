'use strict';

const http = require('http');

// خادم محلي يستقبل الروابط من إضافة المتصفح عبر Native Messaging
class LocalServer {
  constructor({ port, engine, video, videoDir, onFocus }) {
    this.port = port;
    this.engine = engine;
    this.video = video || null;
    this.videoDir = videoDir || (() => engine.settings.downloadDir);
    this.onFocus = onFocus || (() => {});
    this.server = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
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
                if (this.video && this.video.isStreamUrl(url)) {
                  // بث HLS/M3U8: يوجه لمسار الفيديو بأفضل جودة
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
          res.end(JSON.stringify({ ok: true, app: 'PremiumDM', version: '1.0.0' }));
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
