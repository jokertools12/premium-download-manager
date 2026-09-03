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

    const tasks = (typeof this.db.getTasks === 'function' ? this.db.getTasks() : this.db.data?.tasks) || [];
    const history = (typeof this.db.getHistory === 'function' ? this.db.getHistory() : this.db.data?.history) || [];
    const settings = (typeof this.db.getSettings === 'function' ? this.db.getSettings() : this.db.data?.settings) || {};
    const now = Date.now();
    const cutoff = now - (olderThanDays * 24 * 60 * 60 * 1000);

    const suggestions = [];
    const seenNamesAndSizes = new Map();
    const seenPaths = new Set();

    // دمج المهام المكتملة وسجل التنزيلات
    const allItems = [...history, ...tasks.filter(t => t.status === 'completed' || t.status === 'failed')];

    for (const item of allItems) {
      if (!item.filePath) continue;
      const fp = item.filePath;
      if (seenPaths.has(fp)) continue;
      seenPaths.add(fp);

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
      const nameKey = `${(item.filename || path.basename(fp)).toLowerCase()}:${size}`;

      // كشف التكرار
      if (seenNamesAndSizes.has(nameKey)) {
        suggestions.push({
          id: item.id || fp,
          filename: item.filename || path.basename(fp),
          filePath: fp,
          size,
          reason: 'duplicate_file',
          message: 'ملف مكرر يحمل نفس الاسم والحجم',
          ageDays: Math.round((now - (item.ts || stat.mtimeMs)) / (24 * 3600 * 1000))
        });
      } else {
        seenNamesAndSizes.set(nameKey, item);

        // كشف الملفات القديمة التي تجاوزت الحد الزمني المحدد
        const itemTime = item.ts || (stat ? stat.mtimeMs : 0);
        if (itemTime && itemTime < cutoff) {
          suggestions.push({
            id: item.id || fp,
            filename: item.filename || path.basename(fp),
            filePath: fp,
            size,
            reason: 'old_completed',
            message: `ملف مكتمل قديم منذ أكثر من ${olderThanDays} يوماً`,
            ageDays: Math.round((now - itemTime) / (24 * 3600 * 1000))
          });
        }
      }
    }

    // فحص مجلد التنزيل ومجلدات التصنيف لبقايا الملفات المؤقتة والملفات الفارغة 0-byte
    const downloadDir = settings.downloadDir;
    const dirsToScan = [downloadDir];
    if (settings.categoryDirs && downloadDir) {
      Object.values(settings.categoryDirs).forEach(sub => {
        dirsToScan.push(path.join(downloadDir, sub));
      });
    }

    for (const dir of dirsToScan) {
      if (!dir || !fs.existsSync(dir)) continue;
      try {
        const files = fs.readdirSync(dir);
        for (const f of files) {
          const p = path.join(dir, f);
          try {
            const s = fs.statSync(p);
            if (s.isDirectory()) continue;
            if (seenPaths.has(p)) continue;

            const isTemp = f.endsWith('.pdm-part') || f.endsWith('.tmp') || f.endsWith('.part') || f.endsWith('.crdownload');
            const isZeroByte = s.size === 0 && (now - s.mtimeMs > 3600 * 1000);

            if (isTemp || isZeroByte) {
              seenPaths.add(p);
              suggestions.push({
                id: `part-${f}`,
                filename: f,
                filePath: p,
                size: s.size,
                reason: isZeroByte ? 'zero_byte' : 'temp_leftover',
                message: isZeroByte ? 'ملف فارغ تالف (0 بايت)' : 'ملف مؤقت غير مكتمل',
                ageDays: Math.round((now - s.mtimeMs) / (24 * 3600 * 1000))
              });
            }
          } catch (_e) {}
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
