'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');

class Webhooks {
  /**
   * @param {object} opts
   * @param {object} opts.db قاعدة البيانات
   */
  constructor({ db }) {
    this.db = db;
  }

  getWebhooks() {
    if (!this.db) return [];
    const s = this.db.getSettings();
    return Array.isArray(s.webhooks) ? s.webhooks : [];
  }

  saveWebhooks(webhooks) {
    if (this.db) this.db.updateSettings({ webhooks });
  }

  addWebhook({ url, events = ['task:completed', 'task:failed'], secret = '' }) {
    const list = this.getWebhooks();
    const item = {
      id: `wh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      url: String(url).trim(),
      events: Array.isArray(events) ? events : ['task:completed'],
      secret: String(secret || '').trim(),
      enabled: true,
      lastTriggered: 0,
      successCount: 0,
      failCount: 0
    };
    list.push(item);
    this.saveWebhooks(list);
    return item;
  }

  removeWebhook(id) {
    const list = this.getWebhooks().filter(w => w.id !== id);
    this.saveWebhooks(list);
    return true;
  }

  /**
   * بث حدث إلى كل الـ Webhooks المشتركة (المرحلة 10.4)
   * @param {string} eventName اسم الحدث ('task:completed', 'task:failed')
   * @param {object} payload البيانات المرفقة
   */
  async dispatch(eventName, payload) {
    const webhooks = this.getWebhooks();
    const matching = webhooks.filter(w => w.enabled && (w.events.includes(eventName) || w.events.includes('*')));

    for (const hook of matching) {
      this._send(hook, eventName, payload).catch(() => {});
    }
  }

  async _send(hook, event, payload) {
    return new Promise((resolve, reject) => {
      try {
        const u = new URL(hook.url);
        const client = u.protocol === 'https:' ? https : http;
        const body = JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          data: payload
        });

        const headers = {
          'Content-Type': 'application/json',
          'User-Agent': 'PremiumDM/2.1 (Webhook-Dispatcher)'
        };

        if (hook.secret) {
          const sig = crypto.createHmac('sha256', hook.secret).update(body).digest('hex');
          headers['X-Hub-Signature-256'] = `sha256=${sig}`;
        }

        const req = client.request(u, {
          method: 'POST',
          headers,
          timeout: 6000
        }, res => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            hook.successCount = (hook.successCount || 0) + 1;
            resolve(true);
          } else {
            hook.failCount = (hook.failCount || 0) + 1;
            resolve(false);
          }
          hook.lastTriggered = Date.now();
          this.saveWebhooks(this.getWebhooks());
        });

        req.on('error', err => {
          hook.failCount = (hook.failCount || 0) + 1;
          hook.lastTriggered = Date.now();
          this.saveWebhooks(this.getWebhooks());
          reject(err);
        });

        req.write(body);
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = Webhooks;
