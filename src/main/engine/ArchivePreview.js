'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

class ArchivePreview {
  /**
   * طلب ترويسة أو مقطع عبر HTTP/HTTPS
   */
  static _fetchRange(targetUrl, headers = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(targetUrl);
      const isHttps = u.protocol === 'https:';
      const client = isHttps ? https : http;

      const opts = {
        method: headers.Range ? 'GET' : 'HEAD',
        headers: {
          'User-Agent': 'PremiumDM/2.1 (ArchivePreview)',
          ...headers
        },
        timeout: 10000
      };

      const req = client.request(u, opts, (res) => {
        // دعم التحويل 301/302
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          return resolve(ArchivePreview._fetchRange(new URL(res.headers.location, u).href, headers));
        }

        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
      });

      req.on('timeout', () => { req.destroy(new Error('انتهت مهلة الاتصال')); });
      req.on('error', reject);
      req.end();
    });
  }

  /**
   * فحص ملف ZIP عن بعد واستخراج هيكليته دون تنزيل كامل (المرحلة 8.1)
   * @param {string} url رابط الملف
   * @param {object} customHeaders ترويسات اختيارية (كوكيز / referer)
   */
  static async inspectZip(url, customHeaders = {}) {
    try {
      // 1. فحص الحجم ودعم Range
      const head = await ArchivePreview._fetchRange(url, customHeaders);
      const totalSize = parseInt(head.headers['content-length'] || '0', 10);
      const acceptRanges = head.headers['accept-ranges'] || '';

      if (!totalSize || totalSize < 22) {
        return { supported: false, reason: 'حجم الملف غير معروف أو صغير جداً' };
      }

      // 2. طلب آخر 65 كيلوبايت (مكان وجود Central Directory و EOCD)
      const fetchSize = Math.min(totalSize, 65536);
      const rangeStart = totalSize - fetchSize;
      const rangeRes = await ArchivePreview._fetchRange(url, {
        ...customHeaders,
        Range: `bytes=${rangeStart}-${totalSize - 1}`
      });

      if (rangeRes.statusCode !== 206 && rangeRes.statusCode !== 200) {
        return { supported: false, reason: 'الخادم لا يدعم تجزئة النطاق (HTTP Range Requests)' };
      }

      const buf = rangeRes.body;
      const parsed = ArchivePreview.parseCentralDirectory(buf, rangeStart, totalSize);
      return {
        supported: true,
        totalSize,
        fileCount: parsed.length,
        files: parsed
      };
    } catch (err) {
      return { supported: false, reason: String((err && err.message) || err) };
    }
  }

  /**
   * تفكيك سجلات Central Directory من بافر النهاية
   */
  static parseCentralDirectory(buf, bufferStartOffset, totalFileSize) {
    // البحث عن EOCD Signature (0x06054b50)
    let eocdOffset = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new Error('لم يتم العثور على سجل نهاية الأرشيف (ليس ملف ZIP سليم)');
    }

    const totalEntries = buf.readUInt16LE(eocdOffset + 10);
    const cdSize = buf.readUInt32LE(eocdOffset + 12);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);

    // حساب موضع Central Directory داخل البافر الحالي
    let currentPos = cdOffset - bufferStartOffset;
    if (currentPos < 0 || currentPos >= buf.length) {
      // يقع خارج النافذة المجلوبة
      return [];
    }

    const entries = [];
    while (currentPos < buf.length && entries.length < totalEntries) {
      const sig = buf.readUInt32LE(currentPos);
      if (sig !== 0x02014b50) break; // Central File Header Signature

      const method = buf.readUInt16LE(currentPos + 10);
      const compressedSize = buf.readUInt32LE(currentPos + 20);
      const uncompressedSize = buf.readUInt32LE(currentPos + 24);
      const nameLen = buf.readUInt16LE(currentPos + 28);
      const extraLen = buf.readUInt16LE(currentPos + 30);
      const commentLen = buf.readUInt16LE(currentPos + 32);

      const nameStart = currentPos + 46;
      const filename = buf.toString('utf8', nameStart, nameStart + nameLen);
      const isDir = filename.endsWith('/') || (uncompressedSize === 0 && filename.endsWith('\\'));

      entries.push({
        filename,
        isDir,
        size: uncompressedSize,
        compressedSize,
        method: method === 0 ? 'stored' : method === 8 ? 'deflated' : `method_${method}`
      });

      currentPos = nameStart + nameLen + extraLen + commentLen;
    }

    return entries;
  }
}

module.exports = ArchivePreview;
