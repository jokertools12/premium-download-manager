'use strict';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

let tmpDir;
let Database;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-load-test-'));
  process.env.APPDATA = tmpDir;
  ({ default: Database } = await import('../../src/main/db/database.js'));
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) {}
});

describe('المرحلة 11.2 — اختبار الحمل والأداء مع 50,000 مهمة (Benchmark < 50ms)', () => {
  it('استعلامات المهام المفلترة والمفهرسة تنفذ في أقل من 50ms مع 50,000 مهمة', () => {
    const db = new Database();
    const COUNT = 50000;
    const categories = ['video', 'audio', 'document', 'compressed', 'program', 'other'];
    const statuses = ['queued', 'downloading', 'completed', 'paused', 'failed'];

    console.log(`\n⏳ توليد وإدراج ${COUNT.toLocaleString()} مهمة لاختبار الحمل...`);
    const insertStart = performance.now();

    // إدراج 50,000 مهمة داخل معاملة سريعة
    if (db._sqlite) {
      const stmt = db._sqlite.prepare(`
        INSERT INTO tasks 
        (id, url, filename, status, category, size, received, speed_avg, retry_count, created_at, updated_at, meta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const tx = db._sqlite.transaction(n => {
        for (let i = 0; i < n; i++) {
          const cat = categories[i % categories.length];
          const st = statuses[i % statuses.length];
          stmt.run(
            `task-load-${i}`,
            `https://cdn${i % 10}.example.com/files/asset_${i}.dat`,
            `file_${i}_document.pdf`,
            st,
            cat,
            1024 * (i + 1),
            st === 'completed' ? 1024 * (i + 1) : 512,
            st === 'downloading' ? 250000 : 0,
            0,
            Date.now() - (i * 1000),
            Date.now(),
            '{}'
          );
        }
      });
      tx(COUNT);
    } else {
      // In-memory fallback
      for (let i = 0; i < COUNT; i++) {
        db.data.tasks.push({
          id: `task-load-${i}`,
          url: `https://cdn${i % 10}.example.com/files/asset_${i}.dat`,
          filename: `file_${i}_document.pdf`,
          status: statuses[i % statuses.length],
          category: categories[i % categories.length],
          size: 1024 * (i + 1),
          received: 512,
          createdAt: Date.now() - (i * 1000)
        });
      }
    }

    const insertTime = performance.now() - insertStart;
    console.log(`✓ اكتمل الإدراج في ${insertTime.toFixed(1)}ms`);

    // 1. فحص استعلام التصفية حسب الحالة (status = downloading)
    const t1 = performance.now();
    const downloading = db.queryTasks({ status: 'downloading', limit: 50 });
    const dur1 = performance.now() - t1;
    console.log(`- استعلام الحالة (Status Filter): ${dur1.toFixed(2)}ms (المطلوب < 50ms)`);
    expect(dur1).toBeLessThan(50);
    expect(downloading.length).toBeGreaterThan(0);

    // 2. فحص استعلام التصنيف (category = video)
    const t2 = performance.now();
    const videos = db.queryTasks({ category: 'video', limit: 50 });
    const dur2 = performance.now() - t2;
    console.log(`- استعلام التصنيف (Category Filter): ${dur2.toFixed(2)}ms (المطلوب < 50ms)`);
    expect(dur2).toBeLessThan(50);
    expect(videos.length).toBeGreaterThan(0);

    // 3. فحص استعلام البحث والفرز (search = file_4999)
    const t3 = performance.now();
    const searchRes = db.queryTasks({ search: 'file_4999', limit: 10 });
    const dur3 = performance.now() - t3;
    console.log(`- استعلام البحث والفرز (Search Query): ${dur3.toFixed(2)}ms (المطلوب < 50ms)`);
    expect(dur3).toBeLessThan(50);
    expect(searchRes.length).toBeGreaterThan(0);
  });
});
