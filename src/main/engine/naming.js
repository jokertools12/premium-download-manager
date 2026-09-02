'use strict';
/* التسمية الذكية (2.5):
   - expandTemplate: قوالب {date} {time} {site} {name} {ext} {category} {index}
   - uniquifyPath: حل تعارض الأسماء بإلحاق (1) (2)... قبل الامتداد
   وحدة نقية (عدا فحص وجود الملف) وقابلة للاختبار. */

const path = require('path');
const fsp = require('fs/promises');

const TOKEN_RE = /\{(date|time|site|name|ext|category|index)\}/g;

const pad = n => String(n).padStart(2, '0');

/* يوسّع قالب الاسم. الرموز غير المعروفة تُحذف، والمحارف الممنوعة تُستبدل بـ _
   إن لم ينتهِ الاسم بالامتداد تُضاف تلقائياً. */
function expandTemplate(tpl, ctx = {}) {
  const now = ctx.now || new Date();
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  let site = '';
  try { site = new URL(ctx.url || '').hostname.replace(/^www\./, ''); } catch (_e) { /* رابط غير قياسي */ }
  const name = String(ctx.name || '');
  const ext = String(ctx.ext != null ? ctx.ext : (path.extname(name) || '').replace(/^\./, ''));
  const base = ext && name.toLowerCase().endsWith('.' + ext.toLowerCase())
    ? name.slice(0, name.length - ext.length - 1)
    : name;
  const out = String(tpl || '')
    .replace(TOKEN_RE, (_m, tok) => {
      switch (tok) {
        case 'date': return date;
        case 'time': return time;
        case 'site': return site;
        case 'name': return base;
        case 'ext': return ext;
        case 'category': return ctx.category || 'other';
        case 'index': return ctx.index != null ? String(ctx.index) : '';
        default: return '';
      }
    })
    .replace(/\{[a-zA-Z_]+\}/g, '') // رموز غير معروفة تُحذف
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  const withExt = (ext && out && !out.toLowerCase().endsWith('.' + ext.toLowerCase()))
    ? `${out}.${ext}`
    : out;
  return withExt || name;
}

/* يعيد اسم ملف فريداً داخل dir: name.ext → name (1).ext → name (2).ext …
   يُستخدم عند بدء مهمة جديدة هدفها ملف موجود مسبقاً (بدون كسر الاستئناف). */
async function uniquifyPath(dir, filename) {
  const target = path.join(dir, filename);
  try {
    await fsp.access(target);
  } catch (_e) {
    return filename; // غير موجود — الاسم حر
  }
  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);
  for (let i = 1; i < 1000; i++) {
    const cand = `${base} (${i})${ext}`;
    try { await fsp.access(path.join(dir, cand)); } catch (_e) { return cand; }
  }
  return `${base} (${Date.now()})${ext}`;
}

module.exports = { expandTemplate, uniquifyPath, TOKEN_RE };