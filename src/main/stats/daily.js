'use strict';

/* سلسلة النشاط اليومي للرسم البياني (3.6) — نقية وقابلة للاختبار */

/* مفتاح اليوم بصيغة YYYY-MM-DD (مطابق لـ Statistics.key) */
function dayKey(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* يعيد آخر n يوم: [{ key, bytes, files }] مع تعبئة الأيام الفارغة بصفر */
function dailySeries(statsMap, n = 14, now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = dayKey(d);
    const rec = (statsMap && statsMap[k]) || {};
    out.push({ key: k, bytes: rec.bytes || 0, files: rec.files || 0 });
  }
  return out;
}

module.exports = { dayKey, dailySeries };