'use strict';

import { describe, it, expect, vi } from 'vitest';
import TelegramCompanion from '../../src/main/integrations/TelegramCompanion.js';

describe('المرحلة 4: المزامنة السحابية وتكامل بوت التليجرام (Cloud Vault & Telegram Companion 6.0)', () => {
  it('يقوم بتحليل واستخراج روابط التحميل المباشرة وأمر /download من رسائل البوت', () => {
    const tg = new TelegramCompanion();

    // 1. أمر صريح /download
    const p1 = tg.parseMessage('/download https://example.com/movie.mp4');
    expect(p1).toEqual({ type: 'download', url: 'https://example.com/movie.mp4' });

    // 2. رابط ماغنت تورنت مباشر
    const magnetUrl = 'magnet:?xt=urn:btih:d2474e86c95b19b8bcfdbb17e4f9b88cf73663b6';
    const p2 = tg.parseMessage(magnetUrl);
    expect(p2).toEqual({ type: 'download', url: magnetUrl });

    // 3. رابط HTTP مباشر
    const p3 = tg.parseMessage('https://cdn.files.com/setup.exe');
    expect(p3).toEqual({ type: 'download', url: 'https://cdn.files.com/setup.exe' });

    // 4. أمر /status
    const p4 = tg.parseMessage('/status');
    expect(p4).toEqual({ type: 'status' });
  });

  it('يرفض الإرسال إذا لم يتم تحديد botToken أو chatId', async () => {
    const tg = new TelegramCompanion({ botToken: '', chatId: '' });
    await expect(tg.sendMessage('test')).rejects.toThrow('معرف المحادثة');

    const tg2 = new TelegramCompanion({ botToken: '', chatId: '123456' });
    await expect(tg2.sendMessage('test')).rejects.toThrow('مفتاح Telegram Bot Token');
  });

  it('يبني إشعار اكتمال التحميل بصيغة منسقة وأنيقة', async () => {
    const tg = new TelegramCompanion({
      botToken: 'fake_token',
      chatId: '987654',
      enabled: true,
      notifyOnComplete: true
    });

    const mockCall = vi.fn().mockResolvedValue({ message_id: 101 });
    tg._callApi = mockCall;

    const task = {
      filename: 'Tutorial_Full_HD.mp4',
      size: 150 * 1024 * 1024
    };

    const res = await tg.notifyDownloadComplete(task);
    expect(res).toEqual({ message_id: 101 });
    expect(mockCall).toHaveBeenCalledTimes(1);

    const callArgs = mockCall.mock.calls[0];
    expect(callArgs[0]).toBe('sendMessage');
    expect(callArgs[1].chat_id).toBe('987654');
    expect(callArgs[1].text).toContain('Tutorial_Full_HD.mp4');
    expect(callArgs[1].text).toContain('150.0 MB');
  });
});
