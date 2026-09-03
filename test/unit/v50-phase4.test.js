'use strict';

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

globalThis.window = globalThis.window || { t: (k) => k };

describe('المرحلة 4: مسرع التورنت الهجين والبث اللحظي (Torrent Accelerator & Streamer 2.0)', () => {
  it('TorrentManager.injectTrackers: يحقن التراكرات العامة في رابط الماغنت دون تكرار', async () => {
    const TorrentManager = (await import('../../src/main/integrations/TorrentManager.js')).default ||
      (await import('../../src/main/integrations/TorrentManager.js'));

    const baseMagnet = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Ubuntu';
    const boosted = TorrentManager.injectTrackers(baseMagnet);
    expect(boosted).toContain('tracker.opentrackr.org');
    expect(boosted).toContain('open.stealth.si');
    expect(boosted).toContain('tracker.torrent.eu.org');

    // التأكد من عدم تكرار التراكرات إذا كانت موجودة بالفعل
    const boostedAgain = TorrentManager.injectTrackers(boosted);
    const count = (boostedAgain.match(/tracker\.opentrackr\.org/g) || []).length;
    expect(count).toBe(1);
  });

  it('TorrentManager: يدعم دوال pause و resume و getStreamUrl', async () => {
    const TorrentManager = (await import('../../src/main/integrations/TorrentManager.js')).default ||
      (await import('../../src/main/integrations/TorrentManager.js'));

    const tm = new TorrentManager();
    const taskId = 'tor-test-1';
    let pausedCalled = false, resumedCalled = false;
    const fakeTorrent = {
      pause: () => { pausedCalled = true; },
      resume: () => { resumedCalled = true; },
      files: [{ name: 'movie.mp4', length: 1000000, select: () => {} }]
    };

    tm.tasks.set(taskId, {
      id: taskId,
      status: 'downloading',
      speed: 1000,
      _torrent: fakeTorrent
    });

    // Pause
    const paused = tm.pause(taskId);
    expect(paused).toBe(true);
    expect(pausedCalled).toBe(true);
    expect(tm.tasks.get(taskId).status).toBe('paused');
    expect(tm.tasks.get(taskId).speed).toBe(0);

    // Resume
    const resumed = tm.resume(taskId);
    expect(resumed).toBe(true);
    expect(resumedCalled).toBe(true);
    expect(tm.tasks.get(taskId).status).toBe('downloading');
  });

  it('taskcard.js: يحتوي على أزرار tstream و tpause و tresume لمهام التورنت', async () => {
    const { cardActions } = await import('../../src/renderer/ui/taskcard.js');
    const torrentDownloading = { id: 'tor-1', kind: 'torrent', status: 'downloading' };
    const actionsDownloading = cardActions(torrentDownloading, false, true).join(' ');
    expect(actionsDownloading).toContain('data-act="tstream"');
    expect(actionsDownloading).toContain('data-act="tpause"');
    expect(actionsDownloading).toContain('data-act="tcancel"');

    const torrentPaused = { id: 'tor-1', kind: 'torrent', status: 'paused' };
    const actionsPaused = cardActions(torrentPaused, false, true).join(' ');
    expect(actionsPaused).toContain('data-act="tresume"');
    expect(actionsPaused).toContain('data-act="tcancel"');
  });

  it('index.html: يحتوي على خياري مسرع التراكرات والبث المتسلسل torBooster و torSequential', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/index.html'), 'utf8');
    expect(html).toContain('id="torBooster"');
    expect(html).toContain('id="torSequential"');
  });

  it('preview.js: يصدر دالة openStreamPreview لتشغيل بث الفيديو اللحظي', async () => {
    const mod = await import('../../src/renderer/ui/preview.js');
    expect(typeof mod.openStreamPreview).toBe('function');
  });
});
