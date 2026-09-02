'use strict';
/* أدوات الترميز الآمن للـ HTML — إلزامية قبل أي إقحام نص خارجي في innerHTML.
   الاستخدام:
     el.innerHTML = `<b>${escapeHtml(task.filename)}</b>`;
   أي نص قادم من: أسماء ملفات، روابط، إدخال مستخدم، بيانات شبكة → يجب تمريره هنا. */

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* لحقن نص داخل سمة HTML (attribute) — ترميز أشد يشمل backtick */
function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, '&#96;');
}

/* ترميز نص سيوضع داخل رابط URL في سمة href/src */
function escapeUrl(s) {
  try {
    return encodeURI(String(s == null ? '' : s)).replace(/"/g, '%22').replace(/'/g, '%27');
  } catch (_e) {
    return '';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { escapeHtml, escapeAttr, escapeUrl };
}
