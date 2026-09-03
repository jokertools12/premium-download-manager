'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { EventEmitter } = require('events');

class RssFeedManager extends EventEmitter {
  /**
   * @param {object} opts
   * @param {object} opts.engine محرك التحميل
   * @param {object} opts.db قاعدة البيانات
   */
  constructor({ engine, db }) {
    super();
    this.engine = engine;
    this.db = db;
    this.timer = null;
    this.seenIds = new Set();
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    // فحص دوري كل 15 دقيقة
    this.timer = setInterval(() => this.checkAll(), 15 * 60 * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getFeeds() {
    const s = this.db.getSettings();
    return Array.isArray(s.rssFeeds) ? s.rssFeeds : [];
  }

  _saveFeeds(feeds) {
    this.db.updateSettings({ rssFeeds: feeds });
  }

  addFeed({ url, title, filterRegex, category = 'other', checkIntervalMin = 30 }) {
    const feeds = this.getFeeds();
    const id = `rss-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const feed = {
      id,
      url: String(url).trim(),
      title: title || url,
      filterRegex: filterRegex || '',
      category,
      enabled: true,
      checkIntervalMin: Math.max(5, checkIntervalMin),
      lastChecked: 0,
      itemCount: 0
    };
    feeds.push(feed);
    this._saveFeeds(feeds);
    this.checkFeed(id).catch(() => {});
    return feed;
  }

  removeFeed(id) {
    const feeds = this.getFeeds().filter(f => f.id !== id);
    this._saveFeeds(feeds);
    return true;
  }

  updateFeed(id, patch) {
    const feeds = this.getFeeds().map(f => f.id === id ? { ...f, ...patch } : f);
    this._saveFeeds(feeds);
    return true;
  }

  async checkAll() {
    const feeds = this.getFeeds();
    for (const f of feeds) {
      if (f.enabled) {
        try { await this.checkFeed(f.id); } catch (_e) {}
      }
    }
  }

  async checkFeed(id) {
    const feeds = this.getFeeds();
    const feed = feeds.find(f => f.id === id);
    if (!feed) return { count: 0 };

    try {
      const xml = await this._fetchUrl(feed.url);
      const items = this.parseFeedXml(xml);
      let added = 0;

      for (const item of items) {
        const itemKey = `${feed.id}:${item.id || item.link}`;
        if (this.seenIds.has(itemKey)) continue;
        this.seenIds.add(itemKey);

        // مطابقة الفلتر (Regex أو كلمة مفتاحية)
        if (feed.filterRegex) {
          try {
            const re = new RegExp(feed.filterRegex, 'i');
            if (!re.test(item.title) && !re.test(item.link)) continue;
          } catch (_e) {
            continue;
          }
        }

        // إضافة للتحميل تلقائياً
        if (this.engine && item.link) {
          this.engine.addTask({
            url: item.link,
            filename: item.filename || undefined,
            category: feed.category || 'other'
          });
          added++;
        }
      }

      this.updateFeed(id, { lastChecked: Date.now(), itemCount: items.length });
      this.emit('feed-updated', { id, added, total: items.length });
      return { count: added, total: items.length };
    } catch (err) {
      this.emit('feed-error', { id, error: String((err && err.message) || err) });
      throw err;
    }
  }

  /**
   * محلل XML خفيف لملخصات RSS و Atom
   */
  parseFeedXml(xml) {
    const items = [];
    if (!xml) return items;

    // نمط RSS <item>
    const itemRegex = /<item[\s\S]*?<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[0];
      const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const linkMatch = block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
      const encMatch = block.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
      const guidMatch = block.match(/<guid[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/guid>/i);

      const title = titleMatch ? titleMatch[1].trim() : '';
      const link = (encMatch ? encMatch[1] : (linkMatch ? linkMatch[1] : '')).trim();
      const id = guidMatch ? guidMatch[1].trim() : link;

      if (link) {
        items.push({ id, title, link });
      }
    }

    // نمط Atom <entry>
    if (items.length === 0) {
      const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
      while ((match = entryRegex.exec(xml)) !== null) {
        const block = match[0];
        const titleMatch = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const linkMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
        const idMatch = block.match(/<id>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/id>/i);

        const title = titleMatch ? titleMatch[1].trim() : '';
        const link = linkMatch ? linkMatch[1].trim() : '';
        const id = idMatch ? idMatch[1].trim() : link;

        if (link) {
          items.push({ id, title, link });
        }
      }
    }

    return items;
  }

  _fetchUrl(targetUrl) {
    return new Promise((resolve, reject) => {
      const u = new URL(targetUrl);
      const client = u.protocol === 'https:' ? https : http;
      const req = client.get(u, { headers: { 'User-Agent': 'PremiumDM/2.1 (RSS Reader)' } }, res => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          return resolve(this._fetchUrl(new URL(res.headers.location, u).href));
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(12000, () => req.destroy(new Error('انتهت مهلة قراءة الخلاصة')));
    });
  }
}

module.exports = RssFeedManager;
