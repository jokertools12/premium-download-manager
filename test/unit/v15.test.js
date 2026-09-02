'use strict';
/* اختبارات المرحلة v1.5 «النظام البيئي»:
   5.2 كوكيز المتصفح  5.3 Site Grabber  5.5 CLI + pdm:// */

import { describe, it, expect } from 'vitest';
import { parseCliArgs, parsePdmUrl } from '../../src/main/cli.js';
import { extractMediaLinks, absolutize } from '../../src/main/integrations/grabber.js';
import { buildYtDlpArgs } from '../../src/main/integrations/ytdlp-args.js';

describe('cli.js — parseCliArgs (5.5)', () => {
  it('أمر add صريح', () => {
    expect(parseCliArgs(['app.exe', 'add', 'https://x.com/f.zip']))
      .toEqual({ cmd: 'add', url: 'https://x.com/f.zip' });
  });

  it('رابط مباشر بلا أمر', () => {
    expect(parseCliArgs(['app.exe', 'https://x.com/f.zip']))
      .toEqual({ cmd: 'add', url: 'https://x.com/f.zip' });
  });

  it('pdm:// يمر عبر نفس المسار', () => {
    expect(parseCliArgs(['app.exe', 'pdm://add?url=https%3A%2F%2Fx.com%2Ff.zip']).cmd).toBe('add');
  });

  it('يتجاهل أعلام التطبيق والوسائط الفارغة', () => {
    expect(parseCliArgs(['app.exe', '--hidden'])).toEqual({ cmd: null, url: null });
    expect(parseCliArgs(['app.exe', 'add'])).toEqual({ cmd: 'add', url: null });
    expect(parseCliArgs([])).toEqual({ cmd: null, url: null });
  });
});

describe('cli.js — parsePdmUrl (5.5)', () => {
  it('pdm://add?url=مشفر', () => {
    expect(parsePdmUrl('pdm://add?url=https%3A%2F%2Fx.com%2Ff.zip'))
      .toEqual({ cmd: 'add', url: 'https://x.com/f.zip' });
  });

  it('pdm://open يعيد أمر فتح', () => {
    expect(parsePdmUrl('pdm://open').cmd).toBe('open');
  });

  it('رابط غير صالح داخل add', () => {
    expect(parsePdmUrl('pdm://add?url=not-a-url')).toEqual({ cmd: 'add', url: null });
    expect(parsePdmUrl('pdm://unknown').cmd).toBeNull();
  });
});

describe('grabber.js — extractMediaLinks (5.3)', () => {
  const html = `
    <html><head><title>Gallery</title></head><body>
      <img src="/img/pic1.jpg" data-src="/img/lazy.webp">
      <img src="https://cdn.example.com/pic2.png">
      <video src="/media/clip.mp4"></video>
      <source src="/media/hls/index.m3u8">
      <a href="/files/setup.exe">Download</a>
      <a href="/docs/manual.pdf">Manual</a>
      <a href="/page2.html">Just a page</a>
      <img src="javascript:void(0)">
    </body></html>`;

  it('يستخرج الصور بالروابط المطلقة', () => {
    const r = extractMediaLinks(html, 'https://example.com/gallery/page.html');
    const urls = r.images.map(x => x.url);
    expect(urls).toContain('https://example.com/img/pic1.jpg');
    expect(urls).toContain('https://example.com/img/lazy.webp');
    expect(urls).toContain('https://cdn.example.com/pic2.png');
    expect(urls.every(u => u.startsWith('https://'))).toBe(true);
  });

  it('يستخرج الفيديوهات وروابط البث', () => {
    const r = extractMediaLinks(html, 'https://example.com/');
    const urls = r.videos.map(x => x.url);
    expect(urls).toContain('https://example.com/media/clip.mp4');
    expect(urls).toContain('https://example.com/media/hls/index.m3u8');
  });

  it('يستخرج الملفات ويتجاهل صفحات HTML وjavascript', () => {
    const r = extractMediaLinks(html, 'https://example.com/');
    const urls = r.files.map(x => x.url);
    expect(urls).toContain('https://example.com/files/setup.exe');
    expect(urls).toContain('https://example.com/docs/manual.pdf');
    expect(urls.every(u => !u.endsWith('.html'))).toBe(true);
    expect(r.images.every(x => !x.url.startsWith('javascript'))).toBe(true);
  });

  it('يمنع التكرار ويعطي أسماء مقروءة', () => {
    const r = extractMediaLinks(
      '<img src="/a.jpg"><img src="/a.jpg">', 'https://example.com/'
    );
    expect(r.images.length).toBe(1);
    expect(r.images[0].name).toContain('a.jpg');
  });

  it('absolutize يرفض البروتوكولات غير الويب', () => {
    expect(absolutize('ftp://x.com/f', 'https://e.com/')).toBeNull();
    expect(absolutize('data:image/png;base64,xx', 'https://e.com/')).toBeNull();
  });
});

describe('ytdlp-args.js — cookiesFrom (5.2)', () => {
  it('يضيف --cookies-from-browser عند التحديد', () => {
    const { args } = buildYtDlpArgs({ url: 'u', dir: 'd', formatId: 'best', cookiesFrom: 'chrome' });
    expect(args).toContain('--cookies-from-browser');
    expect(args[args.indexOf('--cookies-from-browser') + 1]).toBe('chrome');
  });

  it('بلا تحديد: لا وسائط كوكيز', () => {
    expect(buildYtDlpArgs({ url: 'u', dir: 'd' }).args).not.toContain('--cookies-from-browser');
  });
});