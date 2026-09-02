'use strict';
/* اختبارات طبقة البيانات — تعيد توجيه APPDATA إلى مجلد مؤقت قبل التحميل */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpAppData;
let Database;

beforeAll(async () => {
  // يجب ضبط APPDATA قبل تحميل الوحدة (تُقرأ مرة واحدة عند الاستيراد)
  tmpAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-db-'));
  process.env.APPDATA = tmpAppData;
  ({ default: Database } = await import('../../src/main/db/database.js'));
});

afterAll(() => {
  // قد يبقى مقبض SQLite مفتوحاً على ويندوز — نتجاهل فشل التنظيف
  try { fs.rmSync(tmpAppData, { recursive: true, force: true }); } catch (_e) {}
});

describe('Database', () => {
  it('يعمل بصيغة SQLite أو JSON على الأقل', () => {
    const db = new Database();
    expect(['sqlite', 'json']).toContain(db.getMode());
  });

  it('حفظ/قراءة/حذف مهمة', () => {
    const db = new Database();
    db.upsertTask({ id: 'task-1', url: 'https://example.com/f.zip', filename: 'f.zip', status: 'completed', received: 100, size: 100 });
    let tasks = db.getTasks();
    expect(tasks.find(t => t.id === 'task-1')).toBeTruthy();
    expect(tasks.find(t => t.id === 'task-1').filename).toBe('f.zip');

    db.removeTask('task-1');
    tasks = db.getTasks();
    expect(tasks.find(t => t.id === 'task-1')).toBeFalsy();
  });

  it('الإعدادات الافتراضية ثم التحديث', () => {
    const db = new Database();
    const s = db.getSettings();
    expect(typeof s.maxConcurrent).toBe('number');
    expect(s.maxConcurrent).toBeGreaterThan(0);
    db.updateSettings({ maxSpeedKB: 500 });
    expect(db.getSettings().maxSpeedKB).toBe(500);
  });

  it('الإحصائيات اليومية تتراكم', () => {
    const db = new Database();
    db.addStats('2026-02-09', { bytes: 100, files: 1 });
    db.addStats('2026-02-09', { bytes: 50, files: 1 });
    const st = db.getStatsData()['2026-02-09'];
    expect(st.bytes).toBe(150);
    expect(st.files).toBe(2);
  });

  it('حالة الاستئناف تُحفظ وتُمسح', () => {
    const db = new Database();
    const state = { url: 'https://example.com/x.bin', segments: [{ start: 0, end: 9, received: 5, done: false }] };
    db.saveResumeState('res-1', state);
    expect(db.getResumeState('res-1')).toEqual(state);
    db.clearResumeState('res-1');
    expect(db.getResumeState('res-1')).toBeNull();
  });
});
