'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

class RemoteNode {
  /**
   * العميل للتكامل مع جهاز NAS أو سيرفر بعيد يشغل خادم PremiumDM (المرحلة 10.3)
   * @param {object} opts
   * @param {string} opts.serverUrl عنوان السيرفر أو الـ NAS (مثلاً http://192.168.1.50:45762)
   * @param {string} opts.token رمز المصادقة
   */
  constructor({ serverUrl, token }) {
    this.serverUrl = serverUrl;
    this.token = token;
  }

  async sendTask({ url, filename, category }) {
    if (!this.serverUrl) throw new Error('عنوان السيرفر البعيد غير محدد');
    const u = new URL('/api/v1/tasks', this.serverUrl);
    const client = u.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const data = JSON.stringify({ url, filename, category });
      const req = client.request(u, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token ? `Bearer ${this.token}` : ''
        },
        timeout: 8000
      }, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body || '{}');
            resolve(parsed);
          } catch (_e) {
            resolve({ ok: res.statusCode === 200 });
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  async getRemoteStatus() {
    if (!this.serverUrl) return null;
    const u = new URL('/status', this.serverUrl);
    const client = u.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const req = client.get(u, { timeout: 4000 }, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body || '{}')); } catch (_e) { resolve(null); }
        });
      });
      req.on('error', reject);
    });
  }
}

module.exports = RemoteNode;
