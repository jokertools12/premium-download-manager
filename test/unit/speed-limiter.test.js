'use strict';
/* اختبارات محدد السرعة (Token Bucket) */

import { describe, it, expect } from 'vitest';
import SpeedLimiter from '../../src/main/engine/SpeedLimiter.js';

describe('SpeedLimiter', () => {
  it('بدون تحديد سرعة (rate=0) يمرر فوراً', async () => {
    const lim = new SpeedLimiter();
    lim.setRate(0);
    const t0 = Date.now();
    await lim.take(10_000_000);
    expect(Date.now() - t0).toBeLessThan(100);
  });

  it('يتجاهل القيم غير الصالحة', () => {
    const lim = new SpeedLimiter();
    lim.setRate(-5);
    expect(lim.rate).toBe(0);
    lim.setRate('abc');
    expect(lim.rate).toBe(0);
    lim.setRate(1000);
    expect(lim.rate).toBe(1000);
  });

  it('يرفض المهمة الملغاة فوراً بدلاً من تعليقها', async () => {
    const lim = new SpeedLimiter();
    lim.setRate(1024);
    const fakeTask = { aborted: true };
    await expect(lim.take(1024, fakeTask)).rejects.toThrow('aborted');
  });

  it('يؤجّل فعلياً عند تجاوز الميزانية', async () => {
    const lim = new SpeedLimiter();
    lim.setRate(200_000); // 200KB/ثانية
    const t0 = Date.now();
    await lim.take(400_000); // يقيد إلى 200KB ≈ ثانية واحدة
    const dt = Date.now() - t0;
    expect(dt).toBeGreaterThanOrEqual(800);
    expect(dt).toBeLessThan(6000);
  }, 15000);
});
