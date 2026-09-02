'use strict';

/* محدد السرعة العام (Token Bucket):
   يوزع ميزانية بايتات موحدة على كل مقاطع كل التحميلات النشطة.
   rate = 0 يعني بلا حدود. */
class SpeedLimiter {
  constructor() {
    this.rate = 0;        // بايت/ثانية
    this.tokens = 0;      // الميزانية المتاحة
    this._last = Date.now();
  }

  setRate(bytesPerSec) {
    const r = Math.max(0, Number(bytesPerSec) || 0);
    if (r === this.rate) return;
    this.rate = r;
    this.tokens = 0;
    this._last = Date.now();
  }

  /* ينتظر حتى يتوفر حجم n من الميزانية ثم يخصمه.
     يتحقق من إلغاء المهمة حتى لا تبقى معلقة عند الإيقاف.
     ملاحظة: إذا طُلب n أكبر من المعدل نفسه نقيّده بالمعدل
     (ميزانية الثانية الكاملة) حتى لا يعلق الحساب للأبد. */
  async take(n, task) {
    if (!this.rate || this.rate <= 0) return;
    if (n > this.rate) n = this.rate;
    for (;;) {
      if (task && task.aborted) throw new Error('aborted');
      const now = Date.now();
      if (now > this._last) {
        this.tokens = Math.min(this.rate, this.tokens + ((now - this._last) / 1000) * this.rate);
        this._last = now;
      }
      if (this.tokens >= n) {
        this.tokens -= n;
        return;
      }
      const waitMs = Math.min(200, Math.max(15, ((n - this.tokens) / this.rate) * 1000));
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
}

module.exports = SpeedLimiter;
