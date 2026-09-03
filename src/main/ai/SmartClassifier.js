'use strict';

class SmartClassifier {
  constructor() {
    this.extMap = {
      video: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', '3gp', 'ts'],
      audio: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma', 'opus'],
      image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif', 'tiff'],
      document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'epub', 'mobi', 'csv'],
      compressed: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg'],
      program: ['exe', 'msi', 'apk', 'deb', 'rpm', 'appimage', 'pkg', 'jar']
    };

    this.domainPatterns = [
      { pattern: /youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|tiktok\.com/i, category: 'video', confidence: 0.95 },
      { pattern: /soundcloud\.com|spotify\.com|bandcamp\.com/i, category: 'audio', confidence: 0.95 },
      { pattern: /github\.com\/.*\/releases\/download\/.*(\.exe|\.zip|\.tar\.gz|\.AppImage)/i, category: 'program', confidence: 0.9 }
    ];
  }

  /**
   * تصنيف ذكي محلي خفيف للرابط (المرحلة 9.1)
   * @param {string} url الرابط
   * @param {object} headers ترويسات الاستجابة إن وجدت (اختياري)
   */
  classify(url, headers = {}) {
    const rawUrl = String(url || '').trim();
    if (!rawUrl) return { category: 'other', confidence: 0.5, reason: 'empty_url' };

    // 1. فحص Content-Type من الترويسات أولاً إذا تواجدت
    const ct = String(headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
    if (ct) {
      if (ct.includes('video/')) return { category: 'video', confidence: 0.98, reason: 'content_type' };
      if (ct.includes('audio/')) return { category: 'audio', confidence: 0.98, reason: 'content_type' };
      if (ct.includes('image/')) return { category: 'image', confidence: 0.98, reason: 'content_type' };
      if (ct.includes('application/pdf')) return { category: 'document', confidence: 0.98, reason: 'content_type' };
      if (ct.includes('application/zip') || ct.includes('compressed') || ct.includes('tar') || ct.includes('archive')) {
        return { category: 'compressed', confidence: 0.95, reason: 'content_type' };
      }
    }

    // 2. فحص النطاقات المعروفة
    for (const dp of this.domainPatterns) {
      if (dp.pattern.test(rawUrl)) {
        return { category: dp.category, confidence: dp.confidence, reason: 'domain_pattern' };
      }
    }

    // 3. استخراج الامتداد من المسار
    let pathname = '';
    let search = '';
    try {
      const u = new URL(rawUrl);
      pathname = u.pathname;
      search = u.search;
    } catch (_e) {
      pathname = rawUrl;
    }

    const lastSegment = pathname.split('/').filter(Boolean).pop() || '';
    let ext = '';
    if (lastSegment.includes('.')) {
      ext = lastSegment.split('.').pop().toLowerCase();
    }

    // فحص البارامترات مثل ?format=mp4 أو ?ext=pdf
    if (!ext && search) {
      const pMatch = search.match(/(?:format|ext|type)=([a-z0-9]{2,5})/i);
      if (pMatch) ext = pMatch[1].toLowerCase();
    }

    if (ext) {
      for (const [cat, list] of Object.entries(this.extMap)) {
        if (list.includes(ext)) {
          return { category: cat, confidence: 0.9, reason: `extension_${ext}` };
        }
      }
    }

    // 4. فحص كلمات دلالية في الرابط (video, photo, podcast, doc, setup)
    const lower = rawUrl.toLowerCase();
    if (lower.includes('video') || lower.includes('movie') || lower.includes('film') || lower.includes('stream')) {
      return { category: 'video', confidence: 0.7, reason: 'keyword_url' };
    }
    if (lower.includes('audio') || lower.includes('music') || lower.includes('podcast') || lower.includes('song')) {
      return { category: 'audio', confidence: 0.7, reason: 'keyword_url' };
    }
    if (lower.includes('setup') || lower.includes('installer') || lower.includes('download-client')) {
      return { category: 'program', confidence: 0.75, reason: 'keyword_url' };
    }

    return { category: 'other', confidence: 0.4, reason: 'default_fallback' };
  }
}

module.exports = SmartClassifier;
