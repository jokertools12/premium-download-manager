'use strict';
/* اختبارات المرحلة v2.0 «الانطلاقة الكبرى»:
   6.1 المنصات الثلاث  6.5 نظام الإضافات */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { binaries, ffmpegAsset, needsChmod, dataDir, nativeMessagingDir } from '../../src/main/platforms.js';
import { PluginManager } from '../../src/main/plugins/PluginManager.js';

describe('platforms.js — المنصات الثلاث (6.1)', () => {
  it('win32: ثنائيات .exe بلا chmod', () => {
    const b = binaries('win32', 'x64');
    expect(b.ytDlp.file).toBe('yt-dlp.exe');
    expect(b.ytDlp.url).toMatch(/yt-dlp\.exe$/);
    expect(b.ffmpeg.file).toBe('ffmpeg.exe');
    expect(needsChmod('win32')).toBe(false);
  });

  it('darwin: yt-dlp_macos + ffmpeg حسب المعالج', () => {
    const b1 = binaries('darwin', 'arm64');
    expect(b1.ytDlp.file).toBe('yt-dlp');
    expect(b1.ytDlp.url).toMatch(/yt-dlp_macos$/);
    expect(b1.ffmpeg.url).toMatch(/ffmpeg-(darwin|macos)-arm64/);
    const b2 = binaries('darwin', 'x64');
    expect(b2.ffmpeg.url).toMatch(/ffmpeg-(darwin|macos)-x64/);
    expect(needsChmod('darwin')).toBe(true);
  });

  it('linux: yt-dlp_linux + ffmpeg حسب المعالج', () => {
    const b1 = binaries('linux', 'x64');
    expect(b1.ytDlp.url).toMatch(/yt-dlp_linux$/);
    expect(b1.ffmpeg.url).toContain('ffmpeg-linux-x64');
    const b2 = binaries('linux', 'arm64');
    expect(b2.ffmpeg.url).toContain('ffmpeg-linux-arm64');
    expect(needsChmod('linux')).toBe(true);
  });

  it('nativeMessagingDir يعيد مسارات صحيحة لماك/لينكس وnull لويندوز', () => {
    expect(nativeMessagingDir('darwin', 'firefox')).toContain('Mozilla');
    expect(nativeMessagingDir('darwin', 'chrome')).toContain('Chrome');
    expect(nativeMessagingDir('linux', 'edge')).toContain('microsoft-edge');
    expect(nativeMessagingDir('win32', 'chrome')).toBeNull();
  });

  it('dataDir حسب المنصة', () => {
    const saved = process.env.APPDATA;
    process.env.APPDATA = 'C:\\Users\\t\\AppData\\Roaming';
    expect(dataDir('win32')).toContain('PremiumDownloadManager');
    expect(dataDir('darwin')).toContain('Application Support');
    expect(dataDir('linux')).toContain('.local');
    process.env.APPDATA = saved;
  });
});

describe('PluginManager — نظام الإضافات (6.5)', () => {
  let tmp;
  let pm;

  const makePlugin = (code) => {
    const file = path.join(tmp, 'plugins', 'test-plugin.js');
    fs.writeFileSync(file, code, 'utf8');
    return file;
  };

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-plugins-'));
    fs.mkdirSync(path.join(tmp, 'plugins'), { recursive: true });
    /* الإضافة تكتب في globalThis — لأنها وحدة منفصلة لا ترى متغيرات الاختبار */
    globalThis.__plugDone = [];
    globalThis.__plugFail = [];
    makePlugin(`
      module.exports = {
        name: 'اختبار', version: '1.0.0', description: 'إضافة اختبار',
        init(ctx) {
          ctx.onTaskCompleted(t => globalThis.__plugDone.push(t));
          ctx.onTaskFailed(t => globalThis.__plugFail.push(t));
        }
      };`);
    const { PluginManager: PM } = await import('../../src/main/plugins/PluginManager.js');
    pm = new PM({
      dirs: [path.join(tmp, 'plugins')],
      engine: null,
      stateFile: path.join(tmp, 'state.json')
    });
    await pm.enableEnabled();
  });

  afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('يكتشف الإضافة ويعرضها في القائمة', () => {
    const list = pm.list();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('اختبار');
    expect(list[0].enabled).toBe(true);
  });

  it('خطاف الاكتمال والفشل يعملان', () => {
    const snap = { id: '1', status: 'completed', filename: 'a.zip' };
    pm.emitTaskCompleted(snap);
    expect(globalThis.__plugDone.length).toBe(1);
    expect(globalThis.__plugDone[0].filename).toBe('a.zip');
    pm.emitTaskFailed({ id: '2', status: 'failed', error: 'x' });
    expect(globalThis.__plugFail.length).toBe(1);
  });

  it('التعطيل يزيل الخطافات فقط', async () => {
    expect(pm.disable('test-plugin')).toBe(true);
    pm.emitTaskCompleted({ id: '3', status: 'completed' });
    expect(globalThis.__plugDone.length).toBe(1); // لم تُضاف جديدة
    expect(pm.list()[0].enabled).toBe(false);
    // إعادة التفعيل
    await pm.enable('test-plugin');
    expect(pm.list()[0].enabled).toBe(true);
    pm.emitTaskCompleted({ id: '4', status: 'completed' });
    expect(globalThis.__plugDone.length).toBe(2);
  });

  it('إضافة تالفة لا تُسقط النظام', async () => {
    fs.writeFileSync(path.join(tmp, 'plugins', 'broken.js'), 'throw new Error("broken")', 'utf8');
    const errs = [];
    pm.on('plugin-error', e => errs.push(e));
    pm.discover();
    expect(errs.some(e => e.id === 'broken')).toBe(true);
    // القائمة ما زالت تعمل
    expect(pm.list().length).toBeGreaterThanOrEqual(1);
  });
});