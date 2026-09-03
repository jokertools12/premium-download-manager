'use strict';

const os = require('os');
const http = require('http');
const https = require('https');

/**
 * ⚡ Multi-WAN & Dual-Network Bonding 6.0 Engine
 * يكتشف كافة كروت الشبكة المتصلة بالإنترنت (Wi-Fi, Ethernet, 4G/5G Hotspot)
 * ويقوم بدمجها وتوزيع مقاطع التحميل عبرها بالتوازي لمضاعفة السرعة حتى 200%.
 */
class NetworkBonding {
  constructor(opts = {}) {
    this.enabled = !!opts.enabled;
    this._adapters = [];
    this._currentIndex = 0;
    this._httpAgents = new Map(); // ip -> http.Agent
    this._httpsAgents = new Map(); // ip -> https.Agent
    this.refreshAdapters();
  }

  /**
   * فحص واكتشاف كروت الشبكة المتاحة في النظام
   */
  refreshAdapters() {
    const interfaces = os.networkInterfaces();
    const list = [];

    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        // نختار فقط عناوين IPv4 الحقيقية والنشطة وغير المحلية (loopback)
        if (addr.family === 'IPv4' && !addr.internal && addr.address && addr.address !== '127.0.0.1') {
          list.push({
            name,
            address: addr.address,
            netmask: addr.netmask,
            mac: addr.mac,
            type: this._classifyAdapter(name)
          });
        }
      }
    }

    this._adapters = list;
    return this._adapters;
  }

  _classifyAdapter(name) {
    const lower = name.toLowerCase();
    if (lower.includes('wi-fi') || lower.includes('wlan') || lower.includes('wireless')) return 'wifi';
    if (lower.includes('ethernet') || lower.includes('eth') || lower.includes('lan')) return 'ethernet';
    if (lower.includes('cellular') || lower.includes('mobile') || lower.includes('broadband')) return 'cellular';
    return 'adapter';
  }

  getAdapters() {
    return this._adapters;
  }

  getAdapterCount() {
    return this._adapters.length;
  }

  isBondingAvailable() {
    return this._adapters.length >= 2;
  }

  /**
   * اختيار المحول التالي بالتناوب لتخصيص مقطع التحميل (Round-Robin)
   */
  getNextAdapter() {
    if (!this._adapters.length) return null;
    const adapter = this._adapters[this._currentIndex % this._adapters.length];
    this._currentIndex = (this._currentIndex + 1) % this._adapters.length;
    return adapter;
  }

  /**
   * الحصول على وكيل HTTP مخصص مربوط بعنوان IP الخاص بكرت الشبكة (localAddress)
   */
  getHttpAgent(ip) {
    if (!ip) return undefined;
    if (!this._httpAgents.has(ip)) {
      this._httpAgents.set(ip, new http.Agent({
        keepAlive: true,
        localAddress: ip,
        maxSockets: 32
      }));
    }
    return this._httpAgents.get(ip);
  }

  /**
   * الحصول على وكيل HTTPS مخصص مربوط بعنوان IP الخاص بكرت الشبكة (localAddress)
   */
  getHttpsAgent(ip) {
    if (!ip) return undefined;
    if (!this._httpsAgents.has(ip)) {
      this._httpsAgents.set(ip, new https.Agent({
        keepAlive: true,
        localAddress: ip,
        maxSockets: 32
      }));
    }
    return this._httpsAgents.get(ip);
  }

  /**
   * تقرير مفصل عن حالة الكروت والدمج
   */
  getStatus() {
    return {
      enabled: this.enabled,
      available: this.isBondingAvailable(),
      adapterCount: this._adapters.length,
      adapters: this._adapters.map(a => ({
        name: a.name,
        address: a.address,
        type: a.type
      }))
    };
  }
}

module.exports = NetworkBonding;
