'use strict';

class RuleParser {
  /**
   * تحليل جملة المستخدم باللغة الطبيعية (عربي / إنجليزي) وتحويلها لقاعدة منظمة (المرحلة 9.2)
   * @param {string} text النص
   */
  static parse(text) {
    if (!text || typeof text !== 'string') return null;
    const str = text.trim();
    const lower = str.toLowerCase();

    const rule = {
      name: str.slice(0, 40),
      enabled: true,
      operator: 'AND',
      conditions: []
    };

    // 1. كشف النطاق (Domain / Site)
    const domainMatch = lower.match(/(?:موقع|نطاق|من|from|site|domain)\s+([a-z0-9.-]+\.[a-z]{2,})/i) ||
                        lower.match(/(youtube|github|mega|drive|soundcloud)\.com/i);
    if (domainMatch) {
      const d = domainMatch[1].toLowerCase();
      rule.conditions.push({ domain: d });
    }

    // 2. كشف الامتداد (Extensions)
    const extDirect = lower.match(/\b(zip|rar|7z|pdf|mp4|mkv|avi|mp3|wav|iso|apk|exe|dmg)\b/i);
    const extSuffix = lower.match(/([a-z0-9]{2,5})\s+(?:files?|ملفات)/i);
    const extPrefix = lower.match(/(?:امتداد|ملفات|صيغة|extension)\s+(?:الـ|ال)?([a-z0-9, ]+)/i);

    let detectedExt = null;
    if (extDirect) {
      detectedExt = extDirect[1];
    } else if (extSuffix) {
      detectedExt = extSuffix[1];
    } else if (extPrefix) {
      detectedExt = extPrefix[1].trim().split(/[\s,]+/)[0];
    }

    if (detectedExt && /^[a-z0-9]{2,5}$/i.test(detectedExt)) {
      rule.conditions.push({ ext: detectedExt.toLowerCase() });
    }

    // 3. كشف الحد الأدنى أو الأقصى للحجم
    const sizeMatch = lower.match(/(?:أكبر من|أكثر من|larger than|greater than|more than)\s+(\d+(?:\.\d+)?)\s*(جيجا|ميجا|كيلو|gb|mb|kb)/i);
    if (sizeMatch) {
      const val = parseFloat(sizeMatch[1]);
      const unit = sizeMatch[2].toLowerCase();
      let bytes = val;
      if (unit.includes('جيجا') || unit === 'gb') bytes *= 1024 * 1024 * 1024;
      else if (unit.includes('ميجا') || unit === 'mb') bytes *= 1024 * 1024;
      else if (unit.includes('كيلو') || unit === 'kb') bytes *= 1024;
      rule.conditions.push({ minSize: Math.round(bytes) });
    }

    const maxMatch = lower.match(/(?:أصغر من|أقل من|smaller than|less than)\s+(\d+(?:\.\d+)?)\s*(جيجا|ميجا|كيلو|gb|mb|kb)/i);
    if (maxMatch) {
      const val = parseFloat(maxMatch[1]);
      const unit = maxMatch[2].toLowerCase();
      let bytes = val;
      if (unit.includes('جيجا') || unit === 'gb') bytes *= 1024 * 1024 * 1024;
      else if (unit.includes('ميجا') || unit === 'mb') bytes *= 1024 * 1024;
      else if (unit.includes('كيلو') || unit === 'kb') bytes *= 1024;
      rule.conditions.push({ maxSize: Math.round(bytes) });
    }

    // 4. كشف مجلد الوجهة المستهدف (Action: Target Directory)
    const dirMatch = str.match(/(?:إلى\s+مجلد|في\s+مجلد|مجلد|to\s+folder|save\s+to|into|to)\s+["']?([^"'\s,]+)["']?/i);
    if (dirMatch && !['ملفات', 'أكبر', 'أقل', 'files', 'larger', 'smaller', 'مجلد'].includes(dirMatch[1])) {
      rule.subDir = dirMatch[1];
    }

    // 5. كشف التصنيف (Category)
    if (lower.includes('فيديو') || lower.includes('video') || lower.includes('أفلام')) rule.category = 'video';
    else if (lower.includes('صوت') || lower.includes('audio') || lower.includes('موسيقى')) rule.category = 'audio';
    else if (lower.includes('كتاب') || lower.includes('كتب') || lower.includes('مستند') || lower.includes('document')) rule.category = 'document';
    else if (lower.includes('برنامج') || lower.includes('برامج') || lower.includes('program')) rule.category = 'program';
    else if (lower.includes('مضغوط') || lower.includes('أرشيف') || lower.includes('archive')) rule.category = 'compressed';

    // 6. كشف حد السرعة (Speed limit action)
    const speedMatch = lower.match(/(?:حد السرعة|سرعة|limit speed to)\s+(\d+(?:\.\d+)?)\s*(ميجابايت|كيلوبايت|mb|kb)/i);
    if (speedMatch) {
      const val = parseFloat(speedMatch[1]);
      const unit = speedMatch[2].toLowerCase();
      let kb = val;
      if (unit.includes('ميجا') || unit === 'mb') kb *= 1024;
      rule.maxSpeedKB = Math.round(kb);
    }

    if (rule.conditions.length === 0 && !rule.category && !rule.subDir) {
      return null;
    }

    return rule;
  }
}

module.exports = RuleParser;
