'use strict';

const https = require('https');

/**
 * ☁️ Cloud Vault & Telegram Companion 6.0
 * تكامل بوت التليجرام الخاص لإشعار المستخدم لحظياً باكتمال التحميلات
 * والتحكم بالبرنامج عن بعد عبر إرسال الروابط للبوت ليقوم بتحميلها فورياً على الحاسوب.
 */
class TelegramCompanion {
  constructor(opts = {}) {
    this.botToken = opts.botToken || '';
    this.chatId = opts.chatId || '';
    this.enabled = !!opts.enabled;
    this.notifyOnComplete = opts.notifyOnComplete !== false;
    this.allowRemoteDownload = opts.allowRemoteDownload !== false;
    this._pollingTimer = null;
    this._lastUpdateId = 0;
  }

  /**
   * إرسال طلب HTTPS خام إلى Telegram Bot API
   */
  async _callApi(method, body = {}) {
    if (!this.botToken) throw new Error('مفتاح Telegram Bot Token غير محدد');
    const url = `https://api.telegram.org/bot${this.botToken}/${method}`;

    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 10000
      }, res => {
        let respData = '';
        res.on('data', c => { respData += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(respData || '{}');
            if (parsed.ok) resolve(parsed.result);
            else reject(new Error(parsed.description || 'فشل استجابة Telegram API'));
          } catch (e) {
            reject(new Error('خطأ في قراءة استجابة Telegram: ' + e.message));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('انتهت مهلة الاتصال بـ Telegram')); });
      req.write(data);
      req.end();
    });
  }

  /**
   * فحص الاتصال بالبوت والتحقق من صحة التوكن
   */
  async testConnection() {
    return this._callApi('getMe');
  }

  /**
   * إرسال رسالة نصية للمستخدم
   */
  async sendMessage(text, opts = {}) {
    const targetChat = opts.chatId || this.chatId;
    if (!targetChat) throw new Error('معرف المحادثة Chat ID غير محدد');

    return this._callApi('sendMessage', {
      chat_id: targetChat,
      text,
      parse_mode: opts.parseMode || 'HTML',
      disable_web_page_preview: true
    });
  }

  /**
   * إرسال إشعار اكتمال تحميل ملف
   */
  async notifyDownloadComplete(task) {
    if (!this.enabled || !this.notifyOnComplete || !this.botToken || !this.chatId) return null;

    const name = task.filename || task.title || 'ملف';
    const sizeStr = task.size ? `${(task.size / (1024 * 1024)).toFixed(1)} MB` : 'غير محدد';
    const msg = `<b>⚡ تم اكتمال التحميل بنجاح!</b>\n` +
      `<b>📁 الملف:</b> <code>${name}</code>\n` +
      `<b>📦 الحجم:</b> ${sizeStr}\n` +
      `<b>🚀 البرنامج:</b> Premium Download Manager v6.0 Ultra`;

    try {
      return await this.sendMessage(msg);
    } catch (_e) {
      return null;
    }
  }

  /**
   * استخراج الروابط أو الأوامر من رسالة التليجرام
   */
  parseMessage(text) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();

    // 1. أمر /download <url>
    const dlMatch = /^\/download\s+(https?:\/\/\S+|magnet:\?\S+)/i.exec(trimmed);
    if (dlMatch) {
      return { type: 'download', url: dlMatch[1] };
    }

    // 2. أمر /status
    if (/^\/status/i.test(trimmed)) {
      return { type: 'status' };
    }

    // 3. رابط مباشر تم إرساله للمحادثة
    if (/^(https?:\/\/\S+|magnet:\?\S+)/i.test(trimmed)) {
      return { type: 'download', url: trimmed };
    }

    return { type: 'unknown', text: trimmed };
  }
}

module.exports = TelegramCompanion;
