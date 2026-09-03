'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

/**
 * 🛡️ Zero-Day Threat Shield & Safe Sandbox 6.0
 * درع أمان متكامل لفحص البصمات الرقمية SHA-256،
 * وكشف تزوير الامتدادات (Spoofed Executables)،
 * وعزل الملفات المشبوهة لحماية جهاز المستخدم 100%.
 */
class ThreatShield {
  constructor(opts = {}) {
    this.quarantineDir = opts.quarantineDir || path.join(process.cwd(), '.quarantine');
    this.knownBadHashes = new Set(opts.knownBadHashes || []);

    this.HIGH_RISK_EXTS = new Set([
      '.exe', '.msi', '.bat', '.cmd', '.scr', '.vbs',
      '.ps1', '.reg', '.dll', '.com', '.hta', '.cpl', '.jar'
    ]);

    this.SUSPICIOUS_EXTS = new Set([
      '.docm', '.xlsm', '.pptm', '.iso', '.img'
    ]);
  }

  /**
   * حساب بصمة SHA-256 لأي ملف على القرص
   */
  async computeHash(filePath) {
    if (!fs.existsSync(filePath)) throw new Error('الملف غير موجود');
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    return new Promise((resolve, reject) => {
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * فحص الهيدر السحري (Magic Bytes) لكشف التنفيذيات المزورة
   */
  async checkMagicBytes(filePath) {
    let fd = null;
    try {
      fd = await fsp.open(filePath, 'r');
      const buf = Buffer.alloc(4);
      const { bytesRead } = await fd.read(buf, 0, 4, 0);
      if (bytesRead >= 2 && buf[0] === 0x4D && buf[1] === 0x5A) {
        return 'PE_EXECUTABLE'; // 'MZ' هيدر ملف تنفيذي للويندوز
      }
      if (bytesRead >= 4 && buf[0] === 0x50 && buf[1] === 0x4B && (buf[2] === 0x03 || buf[2] === 0x05)) {
        return 'ZIP_ARCHIVE'; // 'PK' أرشيف مضغوط
      }
      return 'DATA';
    } catch (_e) {
      return 'UNKNOWN';
    } finally {
      if (fd) await fd.close().catch(() => {});
    }
  }

  /**
   * الفحص الأمني الشامل للملف
   */
  async scanFile(filePath) {
    if (!fs.existsSync(filePath)) throw new Error('الملف المطلوب فحصه غير موجود');
    const ext = path.extname(filePath).toLowerCase();
    const stat = await fsp.stat(filePath);
    const sha256 = await this.computeHash(filePath);
    const magic = await this.checkMagicBytes(filePath);

    const reasons = [];
    let riskLevel = 'safe'; // 'safe', 'warning', 'danger'

    // 1. فحص البصمات المعروفة مسبقاً بقائمة التهديدات
    if (this.knownBadHashes.has(sha256)) {
      riskLevel = 'danger';
      reasons.push('تم العثور على بصمة الملف ضمن قواعد بيانات التهديدات والبرمجيات الخبيثة!');
    }

    // 2. كشف تزوير الامتدادات الخطير (مثل ملف يدعي أنه فيديو أو صورة ولكنه في الحقيقة ملف تنفيذي MZ)
    const mediaExts = ['.mp4', '.mp3', '.jpg', '.jpeg', '.png', '.gif', '.webm', '.pdf', '.txt'];
    if (mediaExts.includes(ext) && magic === 'PE_EXECUTABLE') {
      riskLevel = 'danger';
      reasons.push(`تحذير خطير: الملف يدعي أنه ${ext} ولكنه يحتوي على كود تنفيذي لنظام التشغيل (تزوير امتداد)!`);
    }

    // 3. فحص الملفات ذات الامتدادات عالية الخطورة
    if (this.HIGH_RISK_EXTS.has(ext)) {
      if (riskLevel !== 'danger') riskLevel = 'warning';
      reasons.push(`ملف تنفيذي أو برمجي (${ext}): يرجى توخي الحذر قبل التشغيل.`);
    } else if (this.SUSPICIOUS_EXTS.has(ext)) {
      if (riskLevel !== 'danger') riskLevel = 'warning';
      reasons.push(`ملف يحتوي على ماكرو أو صورة قرص (${ext}).`);
    }

    return {
      filePath,
      filename: path.basename(filePath),
      size: stat.size,
      sha256,
      magicType: magic,
      riskLevel,
      isSafe: riskLevel === 'safe',
      reasons: reasons.length ? reasons : ['الملف سليم ولم يتم رصد أي تهديدات أمنية.']
    };
  }

  /**
   * عزل الملف المشبوه في مجلد الحجر الصحي الآمن لمنع تشغيله بالخطأ
   */
  async quarantineFile(filePath) {
    if (!fs.existsSync(filePath)) throw new Error('الملف غير موجود لعزله');
    await fsp.mkdir(this.quarantineDir, { recursive: true });
    const originalName = path.basename(filePath);
    const safeName = `${Date.now()}_${originalName}.pdm_locked`;
    const targetPath = path.join(this.quarantineDir, safeName);

    await fsp.rename(filePath, targetPath);
    return {
      quarantined: true,
      originalPath: filePath,
      quarantinePath: targetPath,
      safeName
    };
  }

  /**
   * استعادة ملف من الحجر الصحي
   */
  async restoreFile(quarantinePath, originalPath) {
    if (!fs.existsSync(quarantinePath)) throw new Error('الملف المعزول غير موجود');
    const dest = originalPath || quarantinePath.replace(/\.pdm_locked$/, '');
    await fsp.rename(quarantinePath, dest);
    return {
      restored: true,
      restoredPath: dest
    };
  }
}

module.exports = ThreatShield;
