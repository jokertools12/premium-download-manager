'use strict';

const { EventEmitter } = require('events');
const { clipboard } = require('electron');

// مراقبة الحافظة: عند نسخ رابط تحميل يعرض البرنامج تنبيهاً لإضافته
class ClipboardMonitor extends EventEmitter {
  constructor({ enabled }) {
    super();
    this.enabled = !!enabled;
    this.last = clipboard.readText().trim();
    this.timer = setInterval(() => this.tick(), 1200);
  }

  tick() {
    if (!this.enabled) return;
    let text = '';
    try { text = clipboard.readText().trim(); } catch (_e) { return; }
    if (!text || text === this.last) return;
    this.last = text;
    const m = text.match(/https?:\/\/[^\s"'<>]+/i);
    if (m) this.emit('url', m[0].replace(/[.,;]+$/, ''));
  }

  setEnabled(v) {
    this.enabled = !!v;
    if (this.enabled) {
      try { this.last = clipboard.readText().trim(); } catch (_e) {}
    }
  }

  dispose() {
    clearInterval(this.timer);
  }
}

module.exports = ClipboardMonitor;
