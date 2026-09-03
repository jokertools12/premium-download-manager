'use strict';

import { describe, it, expect } from 'vitest';
import NetworkBonding from '../../src/main/engine/NetworkBonding.js';

describe('المرحلة 1: محرك التسريع التوربيني المزدوج وموزع الشبكات (Multi-WAN & Network Bonding 6.0)', () => {
  it('يكتشف كروت الشبكة الحقيقية في النظام ويصنف أنواعها (Wi-Fi, Ethernet, Cellular)', () => {
    const bonding = new NetworkBonding({ enabled: true });
    const adapters = bonding.getAdapters();

    expect(Array.isArray(adapters)).toBe(true);
    // تأكد أن جميع المحولات المكتشفة عناوين IPv4 غير محلية
    for (const a of adapters) {
      expect(a.address).toBeDefined();
      expect(a.address).not.toBe('127.0.0.1');
      expect(['wifi', 'ethernet', 'cellular', 'adapter']).toContain(a.type);
    }
  });

  it('يقوم بتدوير المقاطع عبر المحولات المتاحة بالتناوب (Round-Robin Balancing)', () => {
    const bonding = new NetworkBonding({ enabled: true });
    // اختبار سلوك التدوير بمحاكاة كرتين
    bonding._adapters = [
      { name: 'Wi-Fi 6', address: '192.168.1.10', type: 'wifi' },
      { name: 'Ethernet Gigabit', address: '192.168.1.20', type: 'ethernet' }
    ];

    expect(bonding.isBondingAvailable()).toBe(true);
    expect(bonding.getAdapterCount()).toBe(2);

    const a1 = bonding.getNextAdapter();
    const a2 = bonding.getNextAdapter();
    const a3 = bonding.getNextAdapter();

    expect(a1.address).toBe('192.168.1.10');
    expect(a2.address).toBe('192.168.1.20');
    expect(a3.address).toBe('192.168.1.10'); // عاد للكرت الأول
  });

  it('ينشئ وكلاء HTTP/HTTPS مخصصين مربوطين بالعنوان المحلي localAddress', () => {
    const bonding = new NetworkBonding({ enabled: true });
    const ip = '192.168.1.55';

    const httpAgent = bonding.getHttpAgent(ip);
    expect(httpAgent).toBeDefined();
    expect(httpAgent.options.localAddress).toBe(ip);

    const httpsAgent = bonding.getHttpsAgent(ip);
    expect(httpsAgent).toBeDefined();
    expect(httpsAgent.options.localAddress).toBe(ip);

    // التحقق من إعادة استخدام نفس الوكيل المخزن في الكاش
    expect(bonding.getHttpAgent(ip)).toBe(httpAgent);
  });

  it('يقدم تقريراً شاملاً لحالة الدمج والكروت', () => {
    const bonding = new NetworkBonding({ enabled: true });
    bonding._adapters = [
      { name: 'Wi-Fi', address: '10.0.0.2', type: 'wifi' }
    ];

    const status = bonding.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.adapterCount).toBe(1);
    expect(status.available).toBe(false); // كرت واحد فقط فلا يتاح الدمج المزدوج
    expect(status.adapters[0].address).toBe('10.0.0.2');
  });
});
