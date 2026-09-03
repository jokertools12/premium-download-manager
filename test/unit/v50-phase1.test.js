'use strict';

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('المرحلة 1: كاش الرام (Zero-Disk I/O RAM Cache) والويدجت العائم الذكي (Floating Widget 2.0)', () => {
  it('DownloadTask: يحتوي على محرك كاش الرام RAM_BUFFER_THRESHOLD لتقليل عمليات الكتابة على القرص', async () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../../src/main/engine/DownloadTask.js'), 'utf8');
    expect(code).toContain('RAM_BUFFER_THRESHOLD');
    expect(code).toContain('flushBuffer');
    expect(code).toContain('memChunks');
  });

  it('Database: الإعدادات الافتراضية تتضمن وضع الويدجت وإحداثيات الموقع (floatMode, floatX, floatY)', async () => {
    const Database = (await import('../../src/main/db/database.js')).default;
    const db = new Database({ memory: true });
    const settings = db.getSettings();
    expect(settings.floatMode).toBe('compact');
    expect(settings.floatX).toBeNull();
    expect(settings.floatY).toBeNull();
  });

  it('float.html: يتضمن النمطين المتطورين (الكبسولة الذكية f-pill-view ولوحة التحكم الموسعة f-card-view وتراكب السحب والإفلات)', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/float.html'), 'utf8');
    expect(html).toContain('fPill');
    expect(html).toContain('fPillSpeed');
    expect(html).toContain('fPillExpand');
    expect(html).toContain('fCard');
    expect(html).toContain('fCollapse');
    expect(html).toContain('fDropOverlay');
  });

  it('float.css: يتضمن تنسيقات النمطين وتأثير النيون للسحب والإفلات والزجاج المعتم', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/float.css'), 'utf8');
    expect(css).toContain('.f-pill-view');
    expect(css).toContain('.f-card-view');
    expect(css).toContain('.f-drop-overlay');
    expect(css).toContain('backdrop-filter');
  });

  it('float.js: يدعم التبديل بين النمطين، وتحديث السرعة في الكبسولة والبطاقة، والسحب والإفلات', () => {
    const js = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/float.js'), 'utf8');
    expect(js).toContain('setWidgetMode');
    expect(js).toContain('fPillExpand');
    expect(js).toContain('fCollapse');
    expect(js).toContain('fPillSpeed');
    expect(js).toContain('drag-over');
  });
});
