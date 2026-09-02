'use strict';
/* اختبارات أدوات الترميز الآمن (XSS) */

import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeAttr, escapeUrl } from '../../src/renderer/lib/sanitize.js';

describe('escapeHtml', () => {
  it('يرمّز كل المحارف الخطرة', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('يتعامل مع null/undefined بأمان', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(123)).toBe('123');
  });

  it('يحيد هجوم XSS كلاسيكي داخل قالب innerHTML', () => {
    const evil = '<script>alert("pwned")</script>';
    const html = `<div>${escapeHtml(evil)}</div>`;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('escapeAttr', () => {
  it('يرمّز السمات مع backtick', () => {
    expect(escapeAttr('a"b`c\'d')).toBe('a&quot;b&#96;c&#39;d');
  });
});

describe('escapeUrl', () => {
  it('يرمّز URL بأمان', () => {
    expect(escapeUrl('https://x.com/a b?c=1')).toBe('https://x.com/a%20b?c=1');
    expect(escapeUrl('https://x.com/"q\'')).toBe('https://x.com/%22q%27');
  });
});
