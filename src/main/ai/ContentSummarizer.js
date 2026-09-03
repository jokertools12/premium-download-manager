'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

/**
 * 💡 AI Video & Document Summarizer 6.0
 * محرك ذكاء اصطناعي مدمج لتلخيص الفيديوهات والمحاضرات والمستندات
 * واستخراج النقاط الأساسية باللغة العربية فور انتهاء التحميل.
 */
class ContentSummarizer {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || '';
    this.model = opts.model || 'local'; // 'local' أو 'gemini'
  }

  /**
   * تنظيف وتجريد ملفات الترجمة (.srt / .vtt) من الطوابع الزمنية والأكواد
   */
  cleanSubtitles(content) {
    if (!content) return '';
    return content
      // إزالة علامة WEBVTT
      .replace(/^WEBVTT[^\n]*/i, '')
      // إزالة أرقام الأسطر والطوابع الزمنية (00:01:20.000 --> 00:01:25.000)
      .replace(/\d+\s*\r?\n\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}[^\n]*/g, '')
      // إزالة وسوم HTML مثل <c> <i>
      .replace(/<[^>]+>/g, '')
      // إزالة الفراغات والأسطر المتكررة
      .replace(/\r?\n+/g, ' ')
      .trim();
  }

  /**
   * محرك التلخيص الذكي المستخرج (Extractive Text & Subtitle Summarizer)
   * يعمل محلياً 100% بدون الحاجة لإنترنت أو مفاتيح API
   */
  summarizeText(text, maxPoints = 5) {
    if (!text || typeof text !== 'string') {
      return { summary: '', keyPoints: [], wordCount: 0 };
    }

    const clean = text.trim();
    const words = clean.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    if (wordCount < 15) {
      return {
        summary: clean,
        keyPoints: [clean],
        wordCount
      };
    }

    // تقسيم النص إلى جُمل بناءً على علامات الترقيم
    const rawSentences = clean
      .split(/[.?!؟\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 15);

    if (!rawSentences.length) {
      return { summary: clean.slice(0, 300), keyPoints: [clean.slice(0, 150)], wordCount };
    }

    // حساب تكرار الكلمات الأكثر دلالة (Term Frequency)
    const stopWords = new Set([
      'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'تم', 'كان', 'هو', 'هي', 'أن', 'إن',
      'the', 'is', 'at', 'which', 'on', 'in', 'and', 'or', 'to', 'a', 'an', 'of', 'for'
    ]);

    const wordFreq = {};
    for (const w of words) {
      const low = w.toLowerCase().replace(/[^\w\u0600-\u06FF]/g, '');
      if (low.length > 2 && !stopWords.has(low)) {
        wordFreq[low] = (wordFreq[low] || 0) + 1;
      }
    }

    // وزن وتقييم أهمية كل جملة
    const scored = rawSentences.map((sentence, idx) => {
      const sWords = sentence.toLowerCase().split(/\s+/);
      let score = 0;
      for (const sw of sWords) {
        const cleanW = sw.replace(/[^\w\u0600-\u06FF]/g, '');
        score += wordFreq[cleanW] || 0;
      }
      // إعطاء أفضلية للجمل الأولى في المحتوى
      if (idx === 0) score *= 1.3;
      return { sentence, score: score / Math.max(1, sWords.length) };
    });

    // اختيار الجمل ذات الوزن الأعلى
    scored.sort((a, b) => b.score - a.score);
    const topSentences = scored.slice(0, maxPoints).map(s => s.sentence);

    const summary = topSentences.slice(0, 2).join(' — ');

    return {
      summary,
      keyPoints: topSentences,
      wordCount
    };
  }

  /**
   * تلخيص محتوى ملف على القرص (نص / ترجمة فيديو)
   */
  async summarizeFile(filePath, maxPoints = 5) {
    if (!fs.existsSync(filePath)) throw new Error('الملف غير موجود');
    const ext = path.extname(filePath).toLowerCase();
    let content = await fsp.readFile(filePath, 'utf8');

    if (ext === '.srt' || ext === '.vtt') {
      content = this.cleanSubtitles(content);
    }

    const result = this.summarizeText(content, maxPoints);
    return {
      filename: path.basename(filePath),
      filePath,
      ...result
    };
  }
}

module.exports = ContentSummarizer;
