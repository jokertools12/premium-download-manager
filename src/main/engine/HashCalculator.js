'use strict';

const fs = require('fs');
const crypto = require('crypto');

/* HashCalculator — أداة سريعة لحساب والتحقق من بصمات وتجزئة الملفات (MD5, SHA-1, SHA-256) */
class HashCalculator {
  static compute(filePath, algorithms = ['md5', 'sha1', 'sha256']) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        return reject(new Error('الملف غير موجود'));
      }

      const hashes = {};
      algorithms.forEach(algo => {
        hashes[algo] = crypto.createHash(algo);
      });

      const stream = fs.createReadStream(filePath);
      let totalBytes = 0;

      stream.on('data', chunk => {
        totalBytes += chunk.length;
        algorithms.forEach(algo => {
          hashes[algo].update(chunk);
        });
      });

      stream.on('error', reject);

      stream.on('end', () => {
        const result = { size: totalBytes };
        algorithms.forEach(algo => {
          result[algo] = hashes[algo].digest('hex');
        });
        resolve(result);
      });
    });
  }

  static async verify(filePath, expectedHash, algo = 'sha256') {
    const normExpected = String(expectedHash || '').trim().toLowerCase();
    const cleanAlgo = algo.toLowerCase().replace(/[^a-z0-9]/g, '');
    const res = await this.compute(filePath, [cleanAlgo]);
    const computed = res[cleanAlgo];
    return {
      match: computed === normExpected,
      computed,
      expected: normExpected,
      algo: cleanAlgo
    };
  }
}

module.exports = HashCalculator;
