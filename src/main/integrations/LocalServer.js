'use strict';

const http = require('http');
const MediaStreamer = require('../engine/MediaStreamer');

// خادم محلي متقدم يدعم إضافة المتصفح، تطبيق الموبايل، وواجهة REST API العامة (المراحل 10.1 و 12.2)
class LocalServer {
  constructor({ port, engine, video, videoDir, version, onFocus, mobileCompanion }) {
    this.port = port;
    this.engine = engine;
    this.video = video || null;
    this.videoDir = videoDir || (() => engine.settings.downloadDir);
    this.version = version || '';
    this.onFocus = onFocus || (() => {});
    this.mobileCompanion = mobileCompanion || null;
    this.server = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        // ترويسات CORS الكاملة للتطبيقات والموبايل
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const urlObj = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
        const pathname = urlObj.pathname;

        // مسار بث وتشغيل الوسائط أثناء التحميل (المرحلة 14.1)
        if (pathname.startsWith('/stream/')) {
          const taskId = pathname.slice('/stream/'.length).trim();
          const task = this.engine && (this.engine.tasks.get(taskId) || (typeof this.engine.getTask === 'function' && this.engine.getTask(taskId)));
          if (!task) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('المهمة غير موجودة');
            return;
          }
          MediaStreamer.serveTaskStream(task, req, res);
          return;
        }

        // 1. تطبيق الويب للموبايل (10.1)
        if (pathname === '/mobile') {
          const tok = urlObj.searchParams.get('token') || '';
          if (this.mobileCompanion) {
            const html = this.mobileCompanion.getMobileHtml(tok);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
          }
        }

        // 2. فحص ومصادقة الطلبات (Bearer Token) لـ REST API
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim() || urlObj.searchParams.get('token');
        const isLocalHost = req.socket.remoteAddress === '127.0.0.1' || req.socket.remoteAddress === '::1';

        // 3. مسار إضافة رابط من ملحق المتصفح (التوافق القديم /add)
        if (req.method === 'POST' && pathname === '/add') {
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
                if (msg.cookies) headers.cookie = msg.cookies;
                if (msg.userAgent) headers['user-agent'] = msg.userAgent;
                if (msg.headers && typeof msg.headers === 'object') Object.assign(headers, msg.headers);
                if (this.video && (msg.video || this.video.isStreamUrl(url))) {
                  this.video.autoDownload(url, this.videoDir());
                } else {
                  this.engine.addTask({ url, filename: msg.filename || undefined, headers });
                }
                ok = true;
                this.onFocus();
              }
            } catch (_e) {}
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok }));
          });
          return;
        }

        // 4. واجهة برمجة عامة REST API v1 (المرحلة 12.2 ومرافق الموبايل 10.1)
        if (pathname === '/api/v1/tasks') {
          // التحقق من المصادقة إذا كان الاتصال من خارج localhost
          if (!isLocalHost && this.mobileCompanion && !this.mobileCompanion.validateToken(token)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'غير مصرح (مطلوب رمز مصادقة صالح)' }));
            return;
          }

          if (req.method === 'GET') {
            const tasks = this.engine ? this.engine.list() : [];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, tasks }));
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', c => { body += c; if (body.length > 1024 * 512) req.destroy(); });
            req.on('end', () => {
              try {
                const msg = JSON.parse(body || '{}');
                const url = String(msg.url || '').trim();
                if (/^https?:\/\//i.test(url)) {
                  const task = this.engine.addTask({
                    url,
                    filename: msg.filename || undefined,
                    category: msg.category || undefined
                  });
                  this.onFocus();
                  res.writeHead(201, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ ok: true, task }));
                } else {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ ok: false, error: 'رابط غير صالح' }));
                }
              } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(err && err.message) }));
              }
            });
            return;
          }
        }

        // مسار ping & status
        if (pathname === '/ping') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, running: true, app: 'PremiumDM', version: this.version || '2.1.0' }));
          return;
        }

        if (pathname === '/status') {
          let summary = { speed: 0, downloading: 0, queued: 0, paused: 0, completed: 0, failed: 0, total: 0 };
          try { summary = { ...summary, ...this.engine.summary() }; } catch (_e) {}
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true, running: true, app: 'PremiumDM',
            version: this.version || '2.1.0',
            summary
          }));
          return;
        }

        res.writeHead(404);
        res.end();
      });

      this.server.once('error', reject);
      // الاستماع على 0.0.0.0 للسماح باتصال الموبايل عبر الشبكة المحلية (Local Wi-Fi)
      this.server.listen(this.port, '0.0.0.0', () => resolve());
    });
  }

  stop() {
    if (this.server) this.server.close();
  }
}

module.exports = LocalServer;
