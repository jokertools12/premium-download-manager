'use strict';

const fs = require('fs');
const path = require('path');

class SmartCleanup {
  /**
   * @param {object} opts
   * @param {object} opts.db قاعدة البيانات
   */
  constructor({ db }) {
    this.db = db;
  }

  /**
   * تحليل الملفات واقتراح خطة تنظيف ذكية غير تدميرية (المرحلة 9.4)
   * @param {number} olderThanDays عدد الأيام لاعتبار الملف قديماً (الافتراضي 30 يوماً)
   */
  analyze(olderThanDays = 30) {
    if (!this.db) return { suggestions: [], totalReclaimableBytes: 0 };

    const tasks = this.db.getTasks() || [];
    const history = this.db.getHistory() || [];
    const now = Date.now();
    const cutoff = now - (olderThanDays * 24 * 60 * 60 * 1000);

    const suggestions = [];
    const seenNamesAndSizes = new Map();

    // 1. فحص الملفات المكتملة في السجل
    for (const item of history) {
      if (!item.filePath) continue;
      const fp = item.filePath;
      let exists = false;
      let stat = null;
      try {
        if (fs.existsSync(fp)) {
          stat = fs.statSync(fp);
          exists = true;
        }
      } catch (_e) {}

      if (!exists) continue;

      const size = stat ? stat.size : (item.size || 0);
      const nameKey = `${(item.filename || '').toLowerCase()}:${size}`;

      // كشف التكرار
      if (seenNamesAndSizes.has(nameKey)) {
        suggestions.push({
          id: item.id,
          filename: item.filename,
          filePath: fp,
          size,
          reason: 'duplicate_file',
          message: 'ملف مكرر يحمل نفس الاسم والحجم',
          ageDays: Math.round((now - (item.ts || stat.mtimeMs)) / (24 * 3600 * 1000))
        });
      } else {
        seenNamesAndSizes.set(nameKey, item);

        // كشف الملفات القديمة التي مضى عليها وقت طويل
        if (item.ts && item.ts < cutoff) {
          suggestions.push({
            id: item.id,
            filename: item.filename,
            filePath: fp,
            size,
            reason: 'old_completed',
            message: `ملف مكتمل قديم منذ أكثر من ${olderThanDays} يوماً`,
            ageDays: Math.round((now - item.ts) / (24 * 3600 * 1000))
          });
        }
      }
    }

    // 2. كشف بقايا ملفات التحميل المؤقتة (.part) لمهام محذوفة أو فاشلة
    const downloadDir = this.db.getSettings().downloadDir;
    if (downloadDir && fs.existsSync(downloadDir)) {
      try {
        const files = fs.readdirSync(downloadDir);
        for (const f of files) {
          if (f.endsWith('.pdm-part') || f.endsWith('.tmp')) {
            const p = path.join(downloadDir, f);
            try {
              const s = fs.statSync(p);
              suggestions.push({
                id: `part-${f}`,
                filename: f,
                filePath: p,
                size: s.size,
                reason: 'temp_leftover',
                message: 'ملف مؤقت غير مكتمل',
                ageDays: Math.round((now - s.mtimeMs) / (24 * 3600 * 1000))
              });
            } catch (_e) {}
          }
        }
      } catch (_e) {}
    }

    const totalReclaimableBytes = suggestions.reduce((acc, cur) => acc + (cur.size || 0), 0);
    return { suggestions, totalReclaimableBytes };
  }

  /**
   * تنفيذ التنظيف المعتمد يدوياً من المستخدم للملفات المحددة فقط
   * @param {string[]} filePaths قائمة مسارات الملفات التي وافق المستخدم على حذفها
   */
  executeCleanup(filePaths = []) {
    let deletedCount = 0;
    let freedBytes = 0;

    for (const fp of filePaths) {
      try {
        if (fs.existsSync(fp)) {
          const s = fs.statSync(fp);
          freedBytes += s.size;
          fs.unlinkSync(fp);
          deletedCount++;
        }
      } catch (_e) {}
    }

    return { deletedCount, freedBytes };
  }
}

module.exports = SmartCleanup;
