'use strict';

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

describe('المرحلة 3: التحكم عن بعد بالهاتف وإقران QR (Mobile Remote & PWA Hub 2.0)', () => {
  it('qr.js: يولد مصفوفة QR ورمز SVG مقروء بكاميرات الهواتف', async () => {
    const { encodeToQrMatrix, generateQrSvg } = await import('../../src/main/integrations/qr.js');
    const matrix = encodeToQrMatrix('http://192.168.1.100:45762/mobile?token=abcdef123456');
    expect(Array.isArray(matrix)).toBe(true);
    expect(matrix.length).toBeGreaterThanOrEqual(33);

    const svg = generateQrSvg('http://192.168.1.100:45762/mobile?token=abcdef123456');
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('shape-rendering="crispEdges"');
  });

  it('MobileCompanion: يولد رابط اقتران حقيقي ورمز QR متصل بمولد الـ SVG', async () => {
    const MobileCompanion = (await import('../../src/main/integrations/MobileCompanion.js')).default ||
      (await import('../../src/main/integrations/MobileCompanion.js'));
    const mc = new MobileCompanion({ port: 45762 });
    const url = mc.getPairingUrl();
    expect(url).toContain(':45762/mobile?token=');

    const svg = mc.generateQrSvg();
    expect(svg).toContain('<svg');
    expect(svg).toContain('shape-rendering="crispEdges"');

    const html = mc.getMobileHtml(mc.token);
    expect(html).toContain('Premium DM • Mobile Remote');
    expect(html).toContain('remoteAction');
    expect(html).toContain('autoShutdownChk');
  });

  it('LocalServer: يدعم مسارات التحكم عن بعد (pause-all, resume-all, cancel, auto-shutdown)', async () => {
    const LocalServer = (await import('../../src/main/integrations/LocalServer.js')).default ||
      (await import('../../src/main/integrations/LocalServer.js'));

    let paused = false, resumed = false, cancelledId = null, autoShutdownVal = null;
    const mockEngine = {
      pauseAll: () => { paused = true; },
      resumeAll: () => { resumed = true; },
      cancel: (id) => { cancelledId = id; },
      list: () => [],
      summary: () => ({ speed: 0, downloading: 0 }),
      settings: { downloadDir: '' }
    };
    const mockQm = {
      setAutoShutdown: (act) => { autoShutdownVal = act; }
    };
    const mockMobileCompanion = {
      validateToken: () => true,
      getMobileHtml: () => '<html><body>PWA</body></html>'
    };

    const server = new LocalServer({
      port: 0,
      engine: mockEngine,
      mobileCompanion: mockMobileCompanion,
      qm: mockQm
    });

    await server.start();
    const port = server.server.address().port;

    const postJson = (pathname, body) => new Promise((resolve, reject) => {
      const data = JSON.stringify(body || {});
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      }, (res) => {
        let text = '';
        res.on('data', c => { text += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text || '{}') }));
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });

    // 1. Pause All
    const r1 = await postJson('/api/v1/pause-all');
    expect(r1.body.ok).toBe(true);
    expect(paused).toBe(true);

    // 2. Resume All
    const r2 = await postJson('/api/v1/resume-all');
    expect(r2.body.ok).toBe(true);
    expect(resumed).toBe(true);

    // 3. Cancel Task
    const r3 = await postJson('/api/v1/tasks/task-999/cancel');
    expect(r3.body.ok).toBe(true);
    expect(cancelledId).toBe('task-999');

    // 4. Auto Shutdown
    const r4 = await postJson('/api/v1/system/auto-shutdown', { enabled: true });
    expect(r4.body.ok).toBe(true);
    expect(autoShutdownVal).toBe('shutdown');

    await new Promise(r => server.server.close(r));
  });

  it('index.html: يحتوي على أزرار نسخ الرابط وفتح المتصفح وتجديد الرمز في mobileModal', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/index.html'), 'utf8');
    expect(html).toContain('id="mobileModal"');
    expect(html).toContain('id="mobileQr"');
    expect(html).toContain('id="btnCopyMobileUrl"');
    expect(html).toContain('id="btnOpenMobileBrowser"');
    expect(html).toContain('id="btnRotateToken"');
  });
});
