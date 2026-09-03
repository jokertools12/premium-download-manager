'use strict';

class RuleEngine {
  /**
   * تقييم شرط مفرد مقابل سياق المهمة
   */
  static evalCondition(condition, ctx) {
    if (!condition) return true;

    // مطابقة Regex للرابط
    if (condition.urlRegex) {
      try {
        const re = new RegExp(condition.urlRegex, 'i');
        if (!re.test(ctx.url || '')) return false;
      } catch (_e) {
        return false;
      }
    }

    // مطابقة النطاق (Domain)
    if (condition.domain) {
      const d = String(condition.domain).toLowerCase().trim();
      const ctxDomain = (ctx.domain || '').toLowerCase();
      if (!ctxDomain.includes(d)) return false;
    }

    // مطابقة الامتداد
    if (condition.ext) {
      const targetExt = String(condition.ext).toLowerCase().replace(/^\./, '');
      const ctxExt = String(ctx.ext || '').toLowerCase().replace(/^\./, '');
      if (targetExt.includes(',')) {
        const list = targetExt.split(',').map(s => s.trim());
        if (!list.includes(ctxExt)) return false;
      } else if (targetExt !== '*' && targetExt !== ctxExt) {
        return false;
      }
    }

    // مطابقة الحد الأدنى للحجم
    if (typeof condition.minSize === 'number' && condition.minSize > 0) {
      if ((ctx.size || 0) < condition.minSize) return false;
    }

    // مطابقة الحد الأقصى للحجم
    if (typeof condition.maxSize === 'number' && condition.maxSize > 0) {
      if ((ctx.size || 0) > condition.maxSize) return false;
    }

    return true;
  }

  /**
   * فحص تطابق قاعدة مركبة (AND / OR) (المرحلة 8.3)
   */
  static matchesRule(rule, taskContext) {
    if (!rule || !rule.enabled) return false;

    // دعم البنية القديمة البسيطة (pattern + category/dir)
    if (rule.pattern && !rule.conditions) {
      const p = String(rule.pattern).toLowerCase();
      const u = String(taskContext.url || '').toLowerCase();
      const fn = String(taskContext.filename || '').toLowerCase();
      return u.includes(p) || fn.includes(p);
    }

    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [rule.conditions || {}];
    if (conditions.length === 0) return false;

    const op = (rule.operator || 'AND').toUpperCase();
    if (op === 'OR') {
      return conditions.some(cond => RuleEngine.evalCondition(cond, taskContext));
    } else {
      return conditions.every(cond => RuleEngine.evalCondition(cond, taskContext));
    }
  }

  /**
   * استخراج معلومات الرابط والسياق
   */
  static extractContext(task) {
    const url = String(task.url || '');
    let domain = '';
    try {
      domain = new URL(url).hostname;
    } catch (_e) {}

    const filename = String(task.filename || '');
    const ext = filename.includes('.') ? filename.split('.').pop() : '';
    const size = Number(task.size || 0);

    return { url, domain, filename, ext, size };
  }

  /**
   * تطبيق القواعد على المهمة وتعديل خصائصها حسب أول قاعدة متطابقة
   */
  static applyRules(task, rules = []) {
    if (!Array.isArray(rules) || rules.length === 0) return task;

    const ctx = RuleEngine.extractContext(task);
    for (const rule of rules) {
      if (RuleEngine.matchesRule(rule, ctx)) {
        const res = { ...task };
        if (rule.category) res.category = rule.category;
        if (rule.subDir || rule.dir) res.subDir = rule.subDir || rule.dir;
        if (rule.maxSpeedKB) res.maxSpeedKB = rule.maxSpeedKB;
        if (rule.priority) res.priority = rule.priority;
        return res;
      }
    }

    return task;
  }
}

module.exports = RuleEngine;
