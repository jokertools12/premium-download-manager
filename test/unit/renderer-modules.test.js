'use strict';
/* اختبارات وحدات الـ renderer المقسّمة (الخطوة 1.3):
   أدوات التنسيق النقية + منطق تصفية المهام + الثوابت */

import { describe, it, expect, beforeEach } from 'vitest';
import { fmtBytes, fmtSpeed, fmtDur } from '../../src/renderer/lib/format.js';
import { filteredTasks } from '../../src/renderer/ui/sidebar.js';
import { state, STREAM_RE, CAT_ICON, CATEGORIES, FILTERS } from '../../src/renderer/state.js';

describe('lib/format.js', () => {
  it('fmtBytes ينسّق البايتات وحجمها الصفري والفارغ', () => {
    expect(fmtBytes(0)).toBe('0 B');
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(1024)).toBe('1 KB');
    expect(fmtBytes(1536)).toBe('1.5 KB');
    expect(fmtBytes(1024 * 1024)).toBe('1 MB');
    expect(fmtBytes(1536 * 1024 * 1024)).toBe('1.5 GB');
  });

  it('fmtBytes يتعامل مع المدخلات غير الصالحة', () => {
    expect(fmtBytes(null)).toBe('—');
    expect(fmtBytes(undefined)).toBe('—');
    expect(fmtBytes(NaN)).toBe('—');
  });

  it('fmtSpeed يضيف وحدة السرعة', () => {
    expect(fmtSpeed(2048)).toBe(fmtBytes(2048) + '/ث');
    expect(fmtSpeed(0)).toBe('0 B/ث');
  });

  it('fmtDur ينسّق المدد الزمنية', () => {
    expect(fmtDur(59)).toBe('0:59');
    expect(fmtDur(65)).toBe('1:05');
    expect(fmtDur(3661)).toBe('1:01:01');
    expect(fmtDur(undefined)).toBe('0:00');
  });
});

describe('state.js — الثوابت', () => {
  it('معرفات الفلاتر والتصنيفات فريدة', () => {
    const fIds = FILTERS.map(f => f.id);
    const cIds = CATEGORIES.map(c => c.id);
    expect(new Set(fIds).size).toBe(fIds.length);
    expect(new Set(cIds).size).toBe(cIds.length);
    expect(fIds).toContain('all');
  });

  it('CAT_ICON يغطي كل التصنيفات', () => {
    for (const c of CATEGORIES) expect(CAT_ICON[c.id]).toBeTruthy();
  });

  it('STREAM_RE يكتشف روابط البث M3U8/MPD فقط', () => {
    expect(STREAM_RE.test('https://x.com/live/index.m3u8?tok=1')).toBe(true);
    expect(STREAM_RE.test('https://x.com/video.M3U8')).toBe(true);
    expect(STREAM_RE.test('https://x.com/manifest.mpd')).toBe(true);
    expect(STREAM_RE.test('https://x.com/file.m3u8x')).toBe(false);
    expect(STREAM_RE.test('https://x.com/video.mp4')).toBe(false);
    expect(STREAM_RE.test('https://x.com/setup.exe')).toBe(false);
  });
});

describe('ui/sidebar.js — filteredTasks', () => {
  beforeEach(() => {
    state.tasks = new Map();
    state.filter = 'all';
    state.search = '';
  });

  const seed = () => {
    const tasks = [
      { id: 'a', status: 'downloading', category: 'video', filename: 'movie.mp4', url: 'https://x.com/movie.mp4', createdAt: 3 },
      { id: 'b', status: 'completed', category: 'program', filename: 'setup.exe', url: 'https://y.com/setup.exe', createdAt: 2 },
      { id: 'c', status: 'failed', category: 'other', filename: 'song.mp3', url: 'https://z.com/song.mp3', createdAt: 1 },
      { id: 'd', status: 'queued', category: 'video', filename: 'clip.mkv', url: 'https://x.com/clip.mkv', createdAt: 4 }
    ];
    for (const t of tasks) state.tasks.set(t.id, t);
  };

  it('الفلتر الافتراضي يعيد كل المهام مرتبة بالأحدث أولاً', () => {
    seed();
    const ids = filteredTasks().map(t => t.id);
    expect(ids).toEqual(['d', 'a', 'b', 'c']);
  });

  it('فلتر downloading يشمل downloading و queued', () => {
    seed();
    state.filter = 'downloading';
    expect(filteredTasks().map(t => t.id).sort()).toEqual(['a', 'd']);
  });

  it('فلتر التصنيف cat:video', () => {
    seed();
    state.filter = 'cat:video';
    expect(filteredTasks().map(t => t.id).sort()).toEqual(['a', 'd']);
  });

  it('فلتر الحالة المفردة failed', () => {
    seed();
    state.filter = 'failed';
    expect(filteredTasks().map(t => t.id)).toEqual(['c']);
  });

  it('البحث في اسم الملف والرابط (غير حساس لحالة الأحرف)', () => {
    seed();
    state.search = 'SETUP';
    expect(filteredTasks().map(t => t.id)).toEqual(['b']);
    state.search = 'z.com';
    expect(filteredTasks().map(t => t.id)).toEqual(['c']);
    state.search = 'غير_موجود';
    expect(filteredTasks()).toEqual([]);
  });

  it('البحث يعمل مع الفلاتر مجتمعة', () => {
    seed();
    state.filter = 'cat:video';
    state.search = 'clip';
    expect(filteredTasks().map(t => t.id)).toEqual(['d']);
  });
});