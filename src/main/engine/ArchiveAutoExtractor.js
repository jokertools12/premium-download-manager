'use strict';

const { extractArchive } = require('./extract');

/* ArchiveAutoExtractor — إدارة فك الضغط التلقائي للملفات المضغوطة بعد اكتمال التحميل */
class ArchiveAutoExtractor {
  constructor(engine, db) {
    this.engine = engine;
    this.db = db;
    if (this.engine) {
      this.engine.on('task:completed', async (task) => {
        await this.handleTask(task);
      });
    }
  }

  async handleTask(task) {
    if (!task || !task.filePath) return null;
    const settings = (this.db && typeof this.db.getSettings === 'function')
      ? this.db.getSettings()
      : {};

    if (!settings.autoExtract) return null;
    if (task.category !== 'compressed') return null;

    try {
      const res = await extractArchive(task.filePath);
      return res;
    } catch (_e) {
      return null;
    }
  }
}

module.exports = ArchiveAutoExtractor;
