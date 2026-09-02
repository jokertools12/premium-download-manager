'use strict';
/* التحقق من سلامة الملفات (2.2) — حساب ومطابقة المجموع الاختباري.
   وحدة نقية قابلة للاختبار. الإدخال النصي المقبول:
     "sha256:abc..." | "md5 abc..." | "SHA-256=..." | "sha512:..." */

const crypto = require('crypto');
const fs = require('fs');

const ALGOS = new Set(['md5', 'sha1', 'sha256', 'sha512']);

/* يحلل نص المجموع الاختباري إلى { algo, hash } أو null إن كان غير صالح */
function parseChecksum(str) {
  const s = String(str || '').trim();
  if (!s) return null;
  const m = /^(md5|sha-?1|sha-?256|sha-?512)\s*[:=\s]?\s*([a-fA-F0-9]{8,128})\s*$/i.exec(s);
  if (!m) return null;
  const algo = m[1].toLowerCase().replace(/-/g, '');
  return { algo, hash: m[2].toLowerCase() };
}

/* يقبل نصاً أو كائناً ويوحدّه إلى { algo, hash } أو null */
function normalizeChecksum(input) {
  if (!input) return null;
  if (typeof input === 'string') return parseChecksum(input);
  const algo = String(input.algo || '').toLowerCase().replace(/-/g, '');
  const hash = String(input.hash || '').toLowerCase().trim();
  if (ALGOS.has(algo) && /^[a-f0-9]{8,128}$/.test(hash)) return { algo, hash };
  return null;
}

/* حساب هاش ملف بقراءة متدفقة (يدعم الملفات الضخمة بدون تحميلها في الذاكرة) */
async function computeFileHash(filePath, algo = 'sha256') {
  const h = crypto.createHash(algo);
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) h.update(chunk);
  return h.digest('hex');
}

async function verifyFile(filePath, algo, expectedHash) {
  try {
    const actual = await computeFileHash(filePath, algo);
    return actual === String(expectedHash || '').toLowerCase();
  } catch (_e) {
    return false;
  }
}

module.exports = { ALGOS, parseChecksum, normalizeChecksum, computeFileHash, verifyFile };