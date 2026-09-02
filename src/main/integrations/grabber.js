'use strict';
/* Site Grabber (5.3): فحص وسائط وملفات صفحة ويب — النقية قابلة للاختبار
   extractMediaLinks(html, baseUrl) → { images, videos, files }
   scanPage(url) → يجلب الصفحة ويستخرج (يستخدم fetch) */

const path = require('path');

const IMG_RE = /\.(jpe?g|png|gif|webp|bmp|svg|avif)(\?|#|$)/i;
const VID_RE = /\.(mp4|webm|mkv|avi|mov|wmv|flv|m4v|ts|m3u8|mpd)(\?|#|$)/i;
const FILE_RE = /\.(zip|rar|7z|tar|gz|bz2|xz|iso|exe|msi|apk|dmg|deb|rpm|pdf|docx?|xlsx?|pptx?|mp3|m4a|aac|wav|flac|ogg|torrent|epub|apk)(\?|#|$)/i;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 PremiumDM/1.0';

/* يحوّل رابطاً نسبياً إلى مطلق ويتجاهل غير الروابط */
function absolutize(href, baseUrl) {
  try {
    const u = new URL(href, baseUrl);
    if (!/^https?:$/i.test(u.protocol)) return null;
    return u.href;
  } catch (_e) {
    return null;
  }
}

/* يستخرج وسائط وملفات صفحة من HTML خام — نقية */
function extractMediaLinks(html, baseUrl) {
  const h = String(html || '');
  const images = new Map();
  const videos = new Map();
  const files = new Map();

  const push = (map, raw, name) => {
    const abs = absolutize(raw, baseUrl);
    if (!abs) return;
    if (!map.has(abs)) map.set(abs, { url: abs, name: name || decodeURIComponent(abs.split('/').pop().split('?')[0]) || abs });
  };

  // وسوم img/source/video/audio + روابط ملفات
  const tagRe = /<(?:img|source|video|audio|embed)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = tagRe.exec(h))) {
    const src = m[1];
    if (IMG_RE.test(src)) push(images, src);
    else if (VID_RE.test(src)) push(videos, src);
    else if (FILE_RE.test(src)) push(files, src);
  }
  // data-src لكسر التحميل الكسول
  const lazyRe = /\bdata-(?:src|original)\s*=\s*["']([^"']+\.(?:jpe?g|png|gif|webp|mp4|webm))["']/gi;
  while ((m = lazyRe.exec(h))) push(VID_RE.test(m[1]) ? videos : images, m[1]);

  // روابط <a> بامتدادات ملفات
  const aRe = /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi;
  while ((m = aRe.exec(h))) {
    const href = m[1];
    if (FILE_RE.test(href)) push(files, href);
    else if (VID_RE.test(href)) push(videos, href);
  }

  const toArr = map => [...map.values()].slice(0, 200);
  return { images: toArr(images), videos: toArr(videos), files: toArr(files) };
}

/* يجلب صفحة ويب ويستخرج وسائطها (يُستدعى من ipc) */
async function scanPage(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('رابط غير صالح');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
    const lists = extractMediaLinks(html, res.url || url);
    return {
      url: res.url || url,
      title: (titleMatch ? titleMatch[1] : '').trim().slice(0, 120) || url,
      ...lists
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { extractMediaLinks, scanPage, absolutize, IMG_RE, VID_RE, FILE_RE };