'use strict';

const fs = require('fs');
const path = require('path');

/* MediaStreamer — بث وتشغيل ملفات الوسائط أثناء التحميل قبل الاكتمال (المرحلة 14.1)
   يدعم استجابات HTTP 206 Partial Content لتشغيل الفيديو والصوت مباشرة
   في مشغلات HTML5 أو المتصفح أو مشغلات خارجية مثل VLC/mpv */

class MediaStreamer {
  static getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
      '.mp4': 'video/mp4',
      '.mkv': 'video/x-matroska',
      '.webm': 'video/webm',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.flac': 'audio/flac',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac'
    };
    return map[ext] || 'application/octet-stream';
  }

  static serveTaskStream(task, req, res) {
    if (!task || !task.filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }

    const filePath = task.filePath;
    if (!fs.existsSync(filePath)) {
      res.writeHead(425, { 'Content-Type': 'text/plain' });
      res.end('الملف لم يبدأ كتابته على القرص بعد');
      return;
    }

    const stat = fs.statSync(filePath);
    // إجمالي حجم الملف المستهدف (أو الحجم المكتوب حالياً إن كان الحجم الإجمالي غير معروف)
    const totalSize = task.size || stat.size;
    const availableSize = stat.size;

    const mime = this.getMimeType(filePath);
    const rangeHeader = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mime);
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (!rangeHeader) {
      // إرسال البيانات المتاحة حتى الآن
      res.writeHead(200, {
        'Content-Length': availableSize,
        'Content-Type': mime
      });
      const stream = fs.createReadStream(filePath, { start: 0, end: Math.max(0, availableSize - 1) });
      stream.pipe(res);
      return;
    }

    // تحليل Range: bytes=start-end
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10) || 0;
    let end = parts[1] ? parseInt(parts[1], 10) : availableSize - 1;

    // التأكد من أن النطاق لا يتجاوز الحجم المتوفر فعلياً على القرص
    if (start >= availableSize) {
      // إذا طلب المشغل بايتات لم تُحمّل بعد، نطلب من المهمة تقديم أولوية هذا المقطع
      if (typeof task.prioritizeOffset === 'function') {
        task.prioritizeOffset(start);
      }

      res.writeHead(416, {
        'Content-Range': `bytes */${totalSize}`
      });
      res.end();
      return;
    }

    end = Math.min(end, availableSize - 1);
    const chunkSize = (end - start) + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Content-Length': chunkSize,
      'Content-Type': mime
    });

    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);

    stream.on('error', (_err) => {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    });

    req.on('close', () => {
      stream.destroy();
    });
  }
}

module.exports = MediaStreamer;
