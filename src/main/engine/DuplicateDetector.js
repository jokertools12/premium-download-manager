'use strict';

class DuplicateDetector {
  /**
   * @param {object} db كائن قاعدة البيانات
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * فحص ما إذا كان الرابط أو الملف قد حُمّل سابقاً (المرحلة 8.5)
   */
  check({ url, filename, size, checksum }) {
    if (!this.db) return { isDuplicate: false };

    const res = this.db.findDuplicate({ url, filename, size });
    if (!res.isDuplicate || !res.item) {
      return { isDuplicate: false };
    }

    const item = res.item;
    const dateStr = item.ts || item.createdAt
      ? new Date(item.ts || item.createdAt).toLocaleDateString()
      : '';

    return {
      isDuplicate: true,
      source: res.source, // 'history' | 'tasks'
      existingId: item.id,
      filename: item.filename,
      filePath: item.filePath || '',
      size: item.size || 0,
      date: dateStr,
      status: item.status || 'completed',
      message: `تم تحميل هذا الملف مسبقاً (${item.filename}) بتاريخ ${dateStr || 'سابق'}.`
    };
  }
}

module.exports = DuplicateDetector;
