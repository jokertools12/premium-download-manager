'use strict';
/* اختبارات الترجمة: تكافؤ المفاتيح بين اللغات الثلاث + تغطية index.html */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

let i18n;
let html;

beforeAll(async () => {
  // i18n.js مصمم للـ renderer — نوفّر داعية document خفيفة قبل الاستيراد
  globalThis.document = { documentElement: {}, querySelectorAll: () => [] };
  i18n = await import('../../src/renderer/i18n.js');
  html = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/index.html'), 'utf8');
});

const AR = () => i18n.I18N.ar;
const EN = () => i18n.I18N.en;
const TR = () => i18n.I18N.tr;

describe('i18n', () => {
  it('اللغات الثلاث تحمل نفس المجموعة من المفاتيح', () => {
    const keys = Object.keys(AR()).sort();
    expect(Object.keys(EN()).sort()).toEqual(keys);
    expect(Object.keys(TR()).sort()).toEqual(keys);
  });

  it('كل مفتاح له قيمة نصية غير فارغة في اللغات الثلاث', () => {
    for (const [k, v] of Object.entries(AR())) {
      expect(typeof EN()[k]).toBe('string');
      expect(typeof TR()[k]).toBe('string');
      expect(String(v).trim().length, `ar:${k}`).toBeGreaterThan(0);
      expect(String(EN()[k]).trim().length, `en:${k}`).toBeGreaterThan(0);
      expect(String(TR()[k]).trim().length, `tr:${k}`).toBeGreaterThan(0);
    }
  });

  it('كل مفاتيح index.html (data-i18n*) موجودة في جدول الترجمة', () => {
    const used = new Set();
    for (const m of html.matchAll(/data-i18n(?:-ph|-title)?="([^"]+)"/g)) used.add(m[1]);
    expect(used.size).toBeGreaterThan(10);
    const missing = [...used].filter(k => AR()[k] === undefined);
    expect(missing, 'مفاتيح ناقصة في i18n').toEqual([]);
  });

  it('t() يعيد النص بلغة محددة ومفتاحاً مفقوداً كما هو', () => {
    i18n.setLang('en');
    expect(i18n.getLang()).toBe('en');
    expect(i18n.t('side.settings')).toContain('Settings');
    expect(i18n.t('__missing_key__')).toBe('__missing_key__');
    i18n.setLang('ar');
    expect(i18n.getLang()).toBe('ar');
  });
});
