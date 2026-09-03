'use strict';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import ContentSummarizer from '../../src/main/ai/ContentSummarizer.js';

describe('المرحلة 5: مساعد الذكاء الاصطناعي لتلخيص المحتوى (AI Video & Document Summarizer 6.0)', () => {
  const tmpDir = path.join(process.cwd(), 'scratch', 'ai_test');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) {}
  });

  it('ينظف ملفات الترجمة (.srt / .vtt) من الطوابع الزمنية والأكواد بدقة', () => {
    const ai = new ContentSummarizer();
    const rawVtt = `WEBVTT
1
00:00:01.000 --> 00:00:04.500
مرحباً بكم في شرح <i>الذكاء الاصطناعي</i> اليوم.

2
00:00:05.000 --> 00:00:09.000
سنتعلم كيفية بناء محركات سريعة ومتقدمة.
`;

    const cleaned = ai.cleanSubtitles(rawVtt);
    expect(cleaned).not.toContain('WEBVTT');
    expect(cleaned).not.toContain('00:00:01.000');
    expect(cleaned).not.toContain('<i>');
    expect(cleaned).toContain('مرحباً بكم في شرح الذكاء الاصطناعي اليوم');
    expect(cleaned).toContain('سنتعلم كيفية بناء محركات سريعة ومتقدمة');
  });

  it('يستخرج النقاط والملخص التنفيذي بنجاح من النص', () => {
    const ai = new ContentSummarizer();
    const article = `
      الذكاء الاصطناعي هو ثورة العصر التقني الحديث في معالجة البيانات الضخمة.
      يساعد الذكاء الاصطناعي المطورين في كتابة أكواد برمجية أسرع وأكثر أماناً.
      يعتمد التعلم العميق على الشبكات العصبية الاصطناعية لمحاكاة العقل البشري.
      تطبيقات الذكاء الاصطناعي تشمل الطب والتعليم والهندسة وتحليل الصور والفيديوهات.
      المستقبل يتجه نحو دمج النماذج اللغوية في كافة الأنظمة المدمجة والتطبيقات.
    `;

    const res = ai.summarizeText(article, 3);
    expect(res.wordCount).toBeGreaterThan(20);
    expect(res.keyPoints.length).toBeLessThanOrEqual(3);
    expect(typeof res.summary).toBe('string');
    expect(res.summary.length).toBeGreaterThan(10);
  });

  it('يلخص ملف ترجمة محفوظ على القرص مباشرة', async () => {
    const ai = new ContentSummarizer();
    const srtFile = path.join(tmpDir, 'lecture.srt');
    const srtContent = `1
00:01:00,000 --> 00:01:10,000
محاضرة اليوم تتناول علوم الفضاء والفيزياء الفلكية واستكشاف الكواكب البعيدة.

2
00:01:12,000 --> 00:01:25,000
تلسكوب جيمس ويب يقدم صوراً غير مسبوقة للكون المبكر والمجرات الأولى.
`;
    fs.writeFileSync(srtFile, srtContent, 'utf8');

    const result = await ai.summarizeFile(srtFile, 2);
    expect(result.filename).toBe('lecture.srt');
    expect(result.keyPoints.length).toBeGreaterThan(0);
    expect(result.summary).toContain('جيمس ويب');
  });
});
