'use strict';
/* اختبارات المرحلة v1.3 «واجهة تنافس متطورة»:
   3.1 الفرز  3.2 السجل (تجميع شهري + قاعدة البيانات)  3.6 السلسلة اليومية
   3.3 أدوات الوسائط */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { sortTasks, SORT_KEYS } from '../../src/renderer/ui/sidebar.js';
import { groupByMonth } from '../../src/renderer/ui/history.js';
import { extOf, isImage, isPlayable, isMedia, mediaUrl } from '../../src/renderer/lib/media.js';
import { dayKey, dailySeries } from '../../src/main/stats/daily.js';

/* ---------- 3.1 الفرز ---------- */
describe('sidebar.js — sortTasks (3.1)', () => {
  const mk = (id, name, size, speed, status, createdAt) => ({
    id, filename: name, size, speed, status, createdAt
  });
  const data = [
    mk('a', 'beta.zip', 500, 10, 'paused', 100),
    mk('b', 'alpha.exe', 900, 50, 'downloading', 300),
    mk('c', 'gamma.mp4', 100, 30, 'completed', 200)
  ];

  it('كل مفاتيح الفرز معرفة في SORT_KEYS', () => {
    expect(SORT_KEYS).toEqual(['createdAt', 'name', 'size', 'speed', 'status']);
  });

  it('الفرز بالتاريخ: desc الأحدث أولاً', () => {
    expect(sortTasks(data, { key: 'createdAt', dir: 'desc' }).map(t => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('الفرز بالاسم والاتجاهين', () => {
    expect(sortTasks(data, { key: 'name', dir: 'asc' }).map(t => t.id)).toEqual(['b', 'a', 'c']);
    expect(sortTasks(data, { key: 'name', dir: 'desc' }).map(t => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('الفرز بالحجم والسرعة', () => {
    expect(sortTasks(data, { key: 'size', dir: 'desc' }).map(t => t.id)).toEqual(['b', 'a', 'c']);
    expect(sortTasks(data, { key: 'speed', dir: 'desc' }).map(t => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('الفرز بالحالة: الجارية أولاً', () => {
    const out = sortTasks(data, { key: 'status', dir: 'asc' }).map(t => t.id);
    expect(out[0]).toBe('b'); // downloading
    expect(out[1]).toBe('a'); // paused
    expect(out[2]).toBe('c'); // completed
  });

  it('لا يعدل المصدر الأصلي', () => {
    const copy = [...data];
    sortTasks(data, { key: 'name', dir: 'asc' });
    expect(data.map(t => t.id)).toEqual(copy.map(t => t.id));
  });
});

/* ---------- 3.2 تجميع السجل شهرياً ---------- */
describe('history.js — groupByMonth (3.2)', () => {
  it('يجمع المدخلات حسب شهر ts', () => {
    const items = [
      { id: '1', ts: new Date(2026, 1, 10).getTime() },
      { id: '2', ts: new Date(2026, 0, 5).getTime() },
      { id: '3', ts: new Date(2026, 1, 20).getTime() }
    ];
    const g = groupByMonth(items);
    expect([...g.keys()]).toEqual(['2026-02', '2026-01']);
    expect(g.get('2026-02').map(x => x.id)).toEqual(['1', '3']);
    expect(g.get('2026-01').map(x => x.id)).toEqual(['2']);
  });

  it('قائمة فارغة وخالية', () => {
    expect(groupByMonth([]).size).toBe(0);
    expect(groupByMonth(null).size).toBe(0);
  });
});

/* ---------- 3.2 السجل في قاعدة البيانات ---------- */
describe('Database — history (3.2)', () => {
  let db;
  let Database;
  let tmpAppData;

  beforeAll(async () => {
    // عزل مجلد بيانات التطبيق قبل الاستيراد الديناميكي
    tmpAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-hist-'));
    process.env.APPDATA = tmpAppData;
    ({ default: Database } = await import('../../src/main/db/database.js'));
    db = new Database();
  });

  afterAll(() => {
    try { if (db && db._sqlite) db._sqlite.close(); } catch (_e) {}
    try { fs.rmSync(tmpAppData, { recursive: true, force: true }); } catch (_e) {}
  });

  it('addHistory يضيف في المقدمة بمعرف تلقائي', () => {
    const a = db.addHistory({ url: 'https://x.com/a.zip', filename: 'a.zip', status: 'completed', ts: 1000 });
    const b = db.addHistory({ url: 'https://x.com/b.zip', filename: 'b.zip', status: 'failed', ts: 2000 });
    expect(a.id).toBeTruthy();
    expect(db.getHistory()[0].id).toBe(b.id); // الأحدث أولاً
    expect(db.getHistory()[1].id).toBe(a.id);
  });

  it('يحفظ كل الحقول', () => {
    const e = db.addHistory({
      url: 'https://x.com/c.bin', filename: 'c.bin', category: 'program',
      size: 100, received: 100, status: 'completed', filePath: 'C:\\x\\c.bin', ts: 3000
    });
    expect(e).toMatchObject({
      filename: 'c.bin', category: 'program', size: 100,
      received: 100, status: 'completed', filePath: 'C:\\x\\c.bin'
    });
  });

  it('removeHistory يحذف واحداً فقط', () => {
    const e = db.addHistory({ url: 'u', filename: 'd', ts: 4000 });
    const n = db.getHistory().length;
    db.removeHistory(e.id);
    expect(db.getHistory().length).toBe(n - 1);
    expect(db.getHistory().find(h => h.id === e.id)).toBeUndefined();
  });

  it('clearHistory يمسح الكل', () => {
    db.clearHistory();
    expect(db.getHistory()).toEqual([]);
  });

  it('السقف 1000 سجل', () => {
    for (let i = 0; i < 1005; i++) db.addHistory({ url: 'u' + i, filename: 'f' + i, ts: Date.now() + i });
    expect(db.getHistory().length).toBeLessThanOrEqual(1000);
    db.clearHistory();
  });
});

/* ---------- 3.6 السلسلة اليومية ---------- */
describe('stats/daily.js — dailySeries (3.6)', () => {
  it('dayKey بصيغة YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 1, 9))).toBe('2026-02-09');
  });

  it('يعيد n يوماً تصاعدياً', () => {
    const s = dailySeries({}, 14, new Date(2026, 1, 9));
    expect(s.length).toBe(14);
    expect(s[0].key).toBe('2026-01-27');
    expect(s[13].key).toBe('2026-02-09');
  });

  it('يملأ الفراغ بصفر ويقرأ الموجود', () => {
    const stats = { '2026-02-09': { bytes: 5000, files: 2 } };
    const s = dailySeries(stats, 3, new Date(2026, 1, 9));
    expect(s[0].bytes).toBe(0);
    expect(s[2]).toEqual({ key: '2026-02-09', bytes: 5000, files: 2 });
  });

  it('statsMap خالية لا تكسر شيئاً', () => {
    const s = dailySeries(null, 5, new Date(2026, 1, 9));
    expect(s.length).toBe(5);
    expect(s.every(d => d.bytes === 0 && d.files === 0)).toBe(true);
  });
});

/* ---------- 3.3 أدوات الوسائط ---------- */
describe('lib/media.js — المعاينة (3.3)', () => {
  it('extOf يستخرج الامتداد', () => {
    expect(extOf('C:\\x\\file.MP4')).toBe('mp4');
    expect(extOf('/a/b/pic.PNG')).toBe('png');
    expect(extOf('noext')).toBe('');
  });

  it('isImage/isPlayable/isMedia بالقوائم البيضاء', () => {
    expect(isImage('a.jpg')).toBe(true);
    expect(isImage('a.png')).toBe(true);
    expect(isImage('a.mp4')).toBe(false);
    expect(isPlayable('a.mp4')).toBe(true);
    expect(isPlayable('a.mp3')).toBe(true);
    expect(isPlayable('a.exe')).toBe(false);
    expect(isMedia('a.webm')).toBe(true);
    expect(isMedia('a.zip')).toBe(false);
    expect(isMedia('')).toBe(false);
  });

  it('mediaUrl يرمّز المسار داخل app://media', () => {
    const url = mediaUrl('C:\\Users\\Ali\\image 1.jpg');
    expect(url.startsWith('app://media/')).toBe(true);
    expect(url).toContain('%20');
    expect(decodeURIComponent(url.replace('app://media/', ''))).toBe('C:\\Users\\Ali\\image 1.jpg');
  });
});