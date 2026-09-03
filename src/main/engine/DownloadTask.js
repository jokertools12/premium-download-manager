'use strict';

const { EventEmitter } = require('events');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { normalizeChecksum, verifyFile } = require('./checksum');
const { expandTemplate, uniquifyPath, sanitize } = require('./naming');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 PremiumDM/1.0';
const MIN_SEGMENT = 1024 * 1024; // أقل حجم لجزء واحد (1MB)
const MAX_RETRIES = 5;

/* الاتصالات التكيفية (2.1) */
const ADAPT_CHECK_MS = 3500;       // دورة تقييم التكيف
const ADAPT_MIN_CONNS = 2;         // الحد الأدنى للاتصالات
const ADAPT_GOOD_PER = 256 * 1024; // سرعة/اتصال فوقها → توسيع
const ADAPT_BAD_PER = 32 * 1024;   // سرعة/اتصال تحتها → خفض

class DownloadTask extends EventEmitter {
  constructor(opts) {
    super();
    this.id = opts.id;
    this.url = opts.url;
    this.finalUrl = opts.finalUrl || null;
    this.filename = opts.filename || '';
    this.dir = opts.dir;
    this.filePath = this.filename ? path.join(this.dir, this.filename) : '';
    this.category = opts.category || 'other';
    this.headers = opts.headers || {};
    /* بيانات دخول مدمجة في الرابط user:pass@host — WebDAV/HTTP Basic Auth (2.4) */
    try {
      const u = new URL(this.url);
      if (u.username && !this.headers.authorization) {
        this.headers.authorization = 'Basic ' + Buffer.from(
          `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`
        ).toString('base64');
      }
    } catch (_e) { /* رابط غير قياسي */ }
    this.maxConnections = opts.maxConnections || 8;
    this.limiter = opts.limiter || null;
    this.mirrors = Array.isArray(opts.mirrors) ? opts.mirrors.filter(Boolean) : [];
    this._mirrorIdx = 0;        // 0 = الرابط الأساسي، 1..n = البدائل
    this._needsReprobe = false; // بعد التبديل لمصدر بديل
    this._autoRefererTried = false;
    this.status = opts.status || 'queued';
    this.size = opts.size || null;
    this.received = opts.received || 0;
    this.speed = 0;
    this.error = opts.error || null;
    this.createdAt = opts.createdAt || Date.now();
    this.completedAt = opts.completedAt || null;
    this.supportsRanges = !!opts.supportsRanges;
    this.segments = [];
    if (Array.isArray(opts.segments)) {
      for (const s of opts.segments) {
        this.segments.push({ start: s.start, end: s.end, received: s.received || 0, done: !!s.done });
      }
      this.received = this.segments.reduce((a, s) => a + s.received, 0);
    }
    this.fd = null;
    this.aborted = false;
    this.paused = false;
    this._controllers = new Set();
    this._timer = null;
    this._last = { t: Date.now(), b: this.received };
    this._retries = 0;
    this._fileReady = false;
    this._deleteOnStop = false;
    /* المجموع الاختباري (2.2) وقالب التسمية (2.5) */
    this.checksum = normalizeChecksum(opts.checksum);
    this.nameTemplate = String(opts.nameTemplate || '');
    /* الاتصالات التكيفية (2.1) */
    this._desiredConns = 0;
    this._workerCount = 0;
    this._runError = null;
    this._adaptTimer = null;
    this._adaptHist = [];
  }

  snapshot() {
    return {
      id: this.id,
      url: this.url,
      filename: this.filename,
      dir: this.dir,
      filePath: this.filePath,
      category: this.category,
      status: this.status,
      size: this.size,
      received: this.received,
      speed: this.speed,
      error: this.error,
      createdAt: this.createdAt,
      completedAt: this.completedAt,
      supportsRanges: this.supportsRanges,
      mirrors: this.mirrors,
      checksum: this.checksum,
      connections: this._controllers.size,
      segments: this.segments.map(s => ({ start: s.start, end: s.end, received: s.received, done: !!s.done }))
    };
  }

  resumeState() {
    if (!this.segments.length) return null;
    return {
      url: this.url,
      finalUrl: this.finalUrl,
      filename: this.filename,
      dir: this.dir,
      size: this.size,
      supportsRanges: this.supportsRanges,
      headers: this.headers,
      mirrors: this.mirrors,
      checksum: this.checksum,
      segments: this.segments.map(s => ({ start: s.start, end: s.end, received: s.received, done: !!s.done }))
    };
  }

  async start(savedState) {
    this.paused = false;
    this.aborted = false;
    this.error = null;
    this.status = 'downloading';
    this._emit();
    if (savedState) this._restore(savedState);
    else if (this._needsReprobe) {
      await this._probe();
      this._needsReprobe = false;
    }
    try {
      if (!this.segments.length) await this._initialize();
      await this._openFd();
      this._startTimer();
      await this._runAll();
      if (this.size && this.received < this.size) throw new Error('الملف غير مكتمل');
      await this._verifyIntegrity();
      this.status = 'completed';
      this.completedAt = Date.now();
      this.speed = 0;
    } catch (err) {
      this._handleError(err);
    } finally {
      this._stopTimer();
      await this._closeFd();
      this._emit();
    }
  }

  _restore(state) {
    this.finalUrl = state.finalUrl || null;
    this.filename = state.filename || this.filename;
    this.dir = state.dir || this.dir;
    this.filePath = this.filename ? path.join(this.dir, this.filename) : '';
    this.size = state.size || null;
    this.supportsRanges = !!state.supportsRanges;
    this.headers = state.headers || this.headers;
    this.mirrors = Array.isArray(state.mirrors) ? state.mirrors : this.mirrors;
    this.checksum = normalizeChecksum(state.checksum) || this.checksum;
    this.segments = (state.segments || []).map(s => ({ ...s, done: !!s.done }));
    this.received = this.segments.reduce((a, s) => a + s.received, 0);
    this._fileReady = fs.existsSync(this.filePath);
  }

  async _initialize() {
    const info = await this._probe();
    if (info.filename && !this.filename) this.filename = sanitize(info.filename);
    if (!this.filename) this.filename = sanitize(this._defaultName(info.contentType));
    // قالب التسمية الذكي (2.5): {date} {time} {site} {name} {ext} {category}
    if (this.nameTemplate && this.nameTemplate.includes('{')) {
      const ext = (path.extname(this.filename) || '').replace(/^\./, '');
      const expanded = expandTemplate(this.nameTemplate, {
        url: this.url, name: this.filename, ext, category: this.category
      });
      if (expanded) this.filename = sanitize(expanded);
    }
    this.filename = sanitize(this.filename) || `download-${Date.now()}`;
    this.filePath = path.join(this.dir, this.filename);
    // حل تعارض الأسماء: مهمة جديدة هدفها ملف موجود → اسم فريد
    // (مهام الاستئناف لا تمر هنا أصلاً — لا نكسر استئناف ملف قائم)
    if (fs.existsSync(this.filePath)) {
      this.filename = await uniquifyPath(this.dir, this.filename);
      this.filePath = path.join(this.dir, this.filename);
    }
    if (!info.size) {
      this.size = null;
      this.supportsRanges = false;
      this.segments = [{ start: 0, end: null, received: 0, done: false }];
      return;
    }
    this.size = info.size;
    this.supportsRanges = info.ranges;
    this._allocSegments();
  }

  _allocSegments() {
    if (this.supportsRanges && this.size) {
      const n = Math.max(1, Math.min(this.maxConnections, Math.floor(this.size / MIN_SEGMENT) || 1));
      const per = Math.floor(this.size / n);
      let start = 0;
      for (let i = 0; i < n; i++) {
        const end = i === n - 1 ? this.size - 1 : start + per - 1;
        this.segments.push({ start, end, received: 0, done: false });
        start = end + 1;
      }
    } else {
      this.segments.push({ start: 0, end: this.size ? this.size - 1 : null, received: 0, done: false });
    }
  }

  async _openFd() {
    if (this.fd) return;
    await fsp.mkdir(this.dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      if (this.segments.length) {
        this.segments = [];
        this.received = 0;
        await this._initialize();
      }
      this.fd = await fsp.open(this.filePath, 'w');
    } else {
      this.fd = await fsp.open(this.filePath, 'r+');
    }
    if (this.size && !this._fileReady) {
      await this.fd.truncate(this.size);
      this._fileReady = true;
    }
  }

  _currentUrl() {
    const cands = [this.url, ...this.mirrors];
    return cands[Math.min(this._mirrorIdx, cands.length - 1)];
  }

  async _probe() {
    /* جرّب كل مصدر بالترتيب، وعند 403 (حماية hotlink) جرّب تلقائياً
       مصدر إحالة مشتقاً من نطاق الرابط نفسه — بدون أي إدخال من المستخدم */
    const candidates = [this.url, ...this.mirrors];
    let lastErr = null;
    for (let i = 0; i < candidates.length; i++) {
      try {
        const info = await this._probeUrl(candidates[i]);
        this._mirrorIdx = i;
        return info;
      } catch (err) {
        lastErr = err;
        if (/HTTP 403/.test(err.message) && !this.headers.referer && !this._autoRefererTried) {
          this._autoRefererTried = true;
          try { this.headers.referer = new URL(candidates[i]).origin + '/'; } catch (_e) {}
          try {
            const info = await this._probeUrl(candidates[i]);
            this._mirrorIdx = i;
            return info;
          } catch (e2) { lastErr = e2; }
        }
      }
    }
    throw lastErr;
  }

  async _probeUrl(url) {
    let res = await fetch(url, {
      headers: { 'user-agent': UA, ...this.headers, range: 'bytes=0-0' },
      redirect: 'follow'
    });

    // ارتداد ذكي: بعض الخوادم ترفض طلبات النطاق 0-0 برمز 416 أو 400
    if (!res.ok && (res.status === 416 || res.status === 400)) {
      if (res.body) { try { res.body.cancel(); } catch (_e) {} }
      res = await fetch(url, {
        headers: { 'user-agent': UA, ...this.headers },
        redirect: 'follow'
      });
    }

    if (!res.ok) {
      if (res.body) { try { res.body.cancel(); } catch (_e) {} }
      throw new Error('HTTP ' + res.status);
    }
    this.finalUrl = res.url || url;
    const cd = res.headers.get('content-disposition') || '';
    let filename = '';
    let m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    if (m) { try { filename = decodeURIComponent(m[1]); } catch (_e) {} }
    if (!filename) {
      m = /filename\s*=\s*"?([^";]+)"?/i.exec(cd);
      if (m) filename = m[1].replace(/["']/g, '').trim();
    }
    let size = null;
    let ranges = false;
    const contentType = res.headers.get('content-type') || '';
    const cr = res.headers.get('content-range');
    if (res.status === 206 && cr) {
      const total = cr.split('/')[1];
      if (total && total !== '*') size = parseInt(total, 10);
      ranges = true;
    } else {
      const cl = res.headers.get('content-length');
      if (cl) size = parseInt(cl, 10);
    }
    if (res.body) { try { res.body.cancel(); } catch (_e) {} }
    return { size, ranges, filename, contentType };
  }

  _defaultName(contentType) {
    const MIME_EXT = {
      'video/mp4': '.mp4', 'video/x-matroska': '.mkv', 'video/webm': '.webm',
      'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/wav': '.wav',
      'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
      'application/pdf': '.pdf', 'application/zip': '.zip',
      'application/x-rar-compressed': '.rar', 'application/x-7z-compressed': '.7z',
      'application/x-msdownload': '.exe', 'application/x-msi': '.msi',
      'application/json': '.json', 'text/plain': '.txt', 'text/html': '.html',
      'application/octet-stream': ''
    };
    const ext = MIME_EXT[(contentType || '').split(';')[0].trim().toLowerCase()] ?? '.bin';
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `download-${stamp}-${Math.floor(Math.random() * 9000 + 1000)}${ext}`;
  }

  /* ===== محرك الاتصالات التكيفية (2.1) =====
     بدلاً من N طلبات ثابتة يُدار تجمّع عمال (Workers) حسب الإنتاجية:
     - البدء بعدد اتصالات معتدل (4) وقياس السرعة لكل اتصال دورياً
     - أداء ممتاز → قسّم أكبر مقطع حر وأضف عاملاً (حتى maxConnections)
     - اختناق (سرعة/اتصال متدنية وثابتة) → اخفض اتصالاً واحداً بلطف:
       يُجهض طلب العامل الزائد فقط بعد حفظ تقدمه — دون المساس بالبقية
     - سلامة البيانات محفوظة دائماً: seg.received يُحدَّث مع كل chunk */

  _segRem(seg) {
    return (seg.end === null || seg.end === undefined)
      ? Infinity
      : seg.end - seg.start - seg.received + 1;
  }

  /* يختار المقطع الحر صاحب أكبر بايتات متبقية (الأطول أولاً = توازن أفضل) */
  _pickSegment() {
    let best = null;
    let bestRem = -1;
    for (const s of this.segments) {
      if (s.done || s._busy) continue;
      const rem = this._segRem(s);
      if (rem > bestRem) { best = s; bestRem = rem; }
    }
    if (best) best._busy = true;
    return best;
  }

  /* يقسم أكبر مقطع حر إلى نصفين ليخدم عاملاً إضافياً (مثل IDM) */
  _splitLargest() {
    const cand = this.segments
      .filter(s => !s.done && !s._busy)
      .sort((a, b) => this._segRem(b) - this._segRem(a))[0];
    if (!cand) return false;
    const rem = this._segRem(cand);
    if (rem === Infinity || rem < 2 * MIN_SEGMENT) return false;
    const mid = cand.start + cand.received + Math.floor(rem / 2);
    this.segments.push({ start: mid, end: cand.end, received: 0, done: false });
    cand.end = mid - 1;
    return true;
  }

  async _workerLoop() {
    this._workerCount++;
    try {
      while (!this.paused && !this.aborted) {
        // خفض تكيفي: عامل زائد عن العدد المطلوب → اخرج بهدوء
        if (this._workerCount > this._desiredConns) return;
        const seg = this._pickSegment();
        if (!seg) return; // لا مقاطع حرة — البقية تعمل عليها
        try {
          await this._runSegment(seg);
        } finally {
          seg._busy = false;
        }
      }
    } catch (err) {
      if (this.paused || this.aborted) return; // إيقاف عام — يعالَج في _handleError
      if (String((err && err.message) || '') === 'aborted') return; // خفض تكيفي لهذا العامل فقط
      this._runError = err; // خطأ حقيقي: أوقف بقية العمال وارمِ للمعالج العام
      this._abortControllers();
    } finally {
      this._workerCount--;
    }
  }

  _adapt(spawn) {
    if (this.paused || this.aborted || this._runError) return;
    if (!this.supportsRanges || !this.size) return;
    this._adaptHist.push(this.speed);
    if (this._adaptHist.length > 3) this._adaptHist.shift();
    if (this._adaptHist.length < 2) return;
    const per = this.speed / Math.max(1, this._workerCount);
    const cur = this._adaptHist[this._adaptHist.length - 1];
    const prev = this._adaptHist[this._adaptHist.length - 2];
    // توسيع: إنتاجية ممتازة لكل اتصال وهناك مجال نمو حتى الحد الأقصى
    if (per >= ADAPT_GOOD_PER && this._desiredConns < this.maxConnections) {
      if (this._splitLargest()) {
        this._desiredConns++;
        spawn();
      }
      return;
    }
    // خفض: اختناق — سرعة/اتصال متدنية والإجمالي لا يتحسن
    if (per < ADAPT_BAD_PER && cur <= prev &&
        this._desiredConns > ADAPT_MIN_CONNS && this._workerCount > ADAPT_MIN_CONNS) {
      this._desiredConns--;
      for (const c of this._controllers) { try { c.abort(); } catch (_e) {} break; }
    }
  }

  async _runAll() {
    const active = this.segments.filter(s => !s.done);
    if (!active.length) return;
    this._runError = null;
    this._adaptHist = [];
    const single = !this.supportsRanges || !this.size || active.length === 1;
    this._desiredConns = single
      ? 1
      : Math.max(1, Math.min(4, this.maxConnections, active.length));
    const promises = new Set();
    const spawn = () => {
      const p = this._workerLoop();
      promises.add(p);
      p.finally(() => promises.delete(p));
    };
    for (let i = 0; i < this._desiredConns; i++) spawn();
    if (!single) this._adaptTimer = setInterval(() => this._adapt(spawn), ADAPT_CHECK_MS);
    try {
      await Promise.all(promises);
    } finally {
      if (this._adaptTimer) { clearInterval(this._adaptTimer); this._adaptTimer = null; }
    }
    if (this._runError) throw this._runError;
  }

  async _runSegment(seg) {
    const controller = new AbortController();
    this._controllers.add(controller);
    try {
      const headers = { 'user-agent': UA, ...this.headers };
      const useRange = this.supportsRanges && this.size && seg.end !== null;
      if (useRange) {
        headers.range = `bytes=${seg.start + seg.received}-${seg.end}`;
      } else if (seg.received) {
        this.received -= seg.received;
        seg.received = 0;
      }
      const res = await fetch(this.finalUrl || this.url, {
        headers,
        signal: controller.signal,
        redirect: 'follow'
      });
      if (res.status === 416) { seg.done = true; return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (!res.body) throw new Error('لا توجد بيانات من الخادم');

      /* الخادم تجاهل النطاق وأرسل الملف كاملاً (200)؟
         لا نعيد التحميل من الصفر — نقرأ التدفق كاملاً ونتخطى البايتات
         قبل بداية الجزء، ونكتب حتى نهايته (Skip-Ahead الاحترافي) */
      let skipBytes = 0;
      if (headers.range && res.status === 200) {
        skipBytes = seg.start + seg.received;
        const ctype = (res.headers.get('content-type') || '').toLowerCase();
        if (ctype.includes('text/html')) throw new Error('ERR_RANGE_HTML');
      }

      const segLen = (seg.end === null || seg.end === undefined)
        ? Infinity
        : (seg.end - seg.start + 1);
      let written = seg.received; // بايتات الجزء المكتوبة فعلياً

      for await (const chunk of res.body) {
        if (this.aborted) throw new Error('aborted');
        let data = chunk;
        if (skipBytes > 0) {
          if (data.length <= skipBytes) { skipBytes -= data.length; continue; }
          data = data.subarray(skipBytes);
          skipBytes = 0;
        }
        if (segLen !== Infinity && written + data.length > segLen) {
          data = data.subarray(0, segLen - written);
        }
        if (!data.length) continue;
        if (this.limiter) await this.limiter.take(data.length, this);
        let pos = seg.start + written;
        let toWrite = data;
        while (toWrite.length) {
          const w = await this.fd.write(toWrite, 0, toWrite.length, pos);
          if (!w.bytesWritten) throw new Error('فشل كتابة البيانات على القرص');
          pos += w.bytesWritten;
          toWrite = toWrite.subarray(w.bytesWritten);
        }
        written += data.length;
        seg.received = written;
        this.received = this.segments.reduce((a, s) => a + s.received, 0);
      }

      if (segLen !== Infinity && written < segLen) throw new Error('انقطع اتصال الجزء قبل اكتماله');
      seg.received = (segLen === Infinity) ? written : written;
      seg.done = true;
    } finally {
      this._controllers.delete(controller);
      this._emit();
    }
  }

  /* ===== التحقق من السلامة (2.2) =====
     يحسب مجموع الملف الاختباري بعد الاكتمال؛ إن لم يطابق أعاد جلب كل مقطع
     وقارنه بايت-ببايت مع القرص وأعاد كتابة المتفاوت فقط — إصلاح المقاطع
     التالفة دون إعادة تحميل الملف كاملاً. */
  async _verifyIntegrity() {
    if (!this.checksum || !this.filePath) return;
    this.status = 'verifying';
    this._emit();
    let ok = await verifyFile(this.filePath, this.checksum.algo, this.checksum.hash);
    if (ok) return;
    if (this.supportsRanges && this.size) {
      this.status = 'downloading';
      this._emit();
      try {
        await this._openFd();
        for (const seg of this.segments) {
          if (this.aborted) throw new Error('aborted');
          await this._repairSegment(seg);
        }
        ok = await verifyFile(this.filePath, this.checksum.algo, this.checksum.hash);
      } finally {
        await this._closeFd();
      }
    }
    if (!ok) {
      const e = new Error(`فشل التحقق من المجموع الاختباري (${this.checksum.algo}) — الملف تالف أو المصدر يقدم محتوى مختلفاً`);
      e.code = 'ERR_CHECKSUM';
      throw e;
    }
  }

  /* إعادة جلب نطاق مقطع ومقارنته بالبايتات على القرص؛ كتابة الفرق فقط */
  async _repairSegment(seg) {
    if (seg.end === null || seg.end === undefined || seg.end < seg.start) return;
    const controller = new AbortController();
    this._controllers.add(controller);
    try {
      const res = await fetch(this.finalUrl || this.url, {
        headers: { 'user-agent': UA, ...this.headers, range: `bytes=${seg.start}-${seg.end}` },
        signal: controller.signal,
        redirect: 'follow'
      });
      if (!res.ok || !res.body) return;
      let pos = seg.start;
      for await (const chunk of res.body) {
        if (this.aborted) throw new Error('aborted');
        if (pos + chunk.length > seg.end + 1) break;
        const disk = Buffer.alloc(chunk.length);
        const { bytesRead } = await this.fd.read(disk, 0, chunk.length, pos);
        let differs = bytesRead !== chunk.length;
        if (!differs) {
          for (let i = 0; i < chunk.length; i++) {
            if (disk[i] !== chunk[i]) { differs = true; break; }
          }
        }
        if (differs) await this.fd.write(chunk, 0, chunk.length, pos);
        pos += chunk.length;
      }
    } finally {
      this._controllers.delete(controller);
    }
  }

  _handleError(err) {
    if (this.paused || this.aborted) {
      this.status = 'paused';
      this.speed = 0;
      return;
    }
    let msg = String((err && err.message) || err);
    // مجموع اختباري غير مطابق: إعادة المحاولة عديمة الجدوى — فشل فوري
    if (err && err.code === 'ERR_CHECKSUM') {
      this.status = 'failed';
      this.error = msg;
      this.speed = 0;
      return;
    }
    // رسالة أوضح لحماية الروابط (403)
    if (/HTTP 403/.test(msg)) {
      msg = 'HTTP 403 — الرابط محمي (يتطلب مصدر إحالة Referer). أضف حقل Referer عند الإضافة أو استخدم الإضافة من المتصفح';
    }
    if (msg.includes('ERR_RANGE_HTML')) {
      msg = 'الخادم أعاد صفحة خطأ بدل الملف — قد يكون الرابط منتهياً أو محمياً';
    }
    if (this._retries < MAX_RETRIES && msg !== 'aborted') {
      this._retries += 1;
      this.status = 'queued';
      this._emit();
      setTimeout(() => {
        if (!this.paused && !this.aborted && this.status === 'queued') this._resumeInternal();
      }, 1500 * this._retries);
    } else if (this.mirrors.length && this._mirrorIdx < this.mirrors.length) {
      // المصدر الأساسي فشل نهائياً — انتقل تلقائياً للمصدر البديل التالي
      this._mirrorIdx += 1;
      this._retries = 0;
      this._needsReprobe = true;
      this.status = 'queued';
      this._emit();
      setTimeout(() => {
        if (!this.paused && !this.aborted && this.status === 'queued') this._resumeInternal();
      }, 1000);
    } else {
      this.status = 'failed';
      this.error = msg;
      this.speed = 0;
      // لا نترك ملفاً فارغاً بحجم كامل إذا لم يُكتب أي بايت
      if (!this.received) this._deleteOnStop = true;
    }
  }

  async _resumeInternal() {
    this.status = 'downloading';
    this._emit();
    try {
      if (this._needsReprobe) {
        // مصدر بديل: حدّث الرابط النهائي وواصل من نفس النقطة
        await this._probe();
        this._needsReprobe = false;
      }
      // إعادة المحاولة بعد فشل الفحص الأول: يجب تخصيص المقاطع أولاً
      if (!this.segments.length) await this._initialize();
      await this._openFd();
      this._startTimer();
      await this._runAll();
      if (this.size && this.received < this.size) throw new Error('الملف غير مكتمل');
      await this._verifyIntegrity();
      this.status = 'completed';
      this.completedAt = Date.now();
      this.speed = 0;
    } catch (err) {
      this._handleError(err);
    } finally {
      this._stopTimer();
      await this._closeFd();
      this._emit();
    }
  }

  /* إيقاف كامل مع انتظار تحرير مقبض الملف (ضروري قبل حذف الملف على ويندوز) */
  async ensureStopped(timeoutMs = 5000) {
    this.pause();
    const t0 = Date.now();
    while ((this.fd || this._controllers.size) && Date.now() - t0 < timeoutMs) {
      await new Promise(r => setTimeout(r, 60));
    }
    await this._closeFd();
  }

  pause() {
    this.paused = true;
    this.aborted = true;
    this._abortControllers();
    if (this.status !== 'downloading') this.status = 'paused';
    this.speed = 0;
    this._emit();
  }

  cancel(deleteFile) {
    this.paused = true;
    this.aborted = true;
    this._abortControllers();
    this.status = 'canceled';
    this.speed = 0;
    if (deleteFile) this._deleteOnStop = true;
    this._emit();
  }

  _abortControllers() {
    for (const c of this._controllers) {
      try { c.abort(); } catch (_e) {}
    }
  }

  async _closeFd() {
    if (this.fd) {
      const fd = this.fd;
      this.fd = null;
      try { await fd.close(); } catch (_e) {}
    }
    if (this._deleteOnStop && this.filePath && fs.existsSync(this.filePath)) {
      try { await fsp.unlink(this.filePath); } catch (_e) {}
      this._deleteOnStop = false;
    }
  }

  _startTimer() {
    if (this._timer) return;
    this._last = { t: Date.now(), b: this.received };
    this._timer = setInterval(() => {
      const now = Date.now();
      const dt = (now - this._last.t) / 1000;
      if (dt >= 0.4) {
        this.speed = Math.max(0, Math.round((this.received - this._last.b) / dt));
        this._last = { t: now, b: this.received };
      }
      this._emit();
    }, 600);
  }

  _stopTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this.speed = 0;
  }

  /* استئناف الرابط المنتهي (المرحلة 13.2) */
  refreshUrl(newUrl) {
    if (!newUrl || !/^https?:\/\//i.test(newUrl)) {
      throw new Error('الرابط الجديد غير صالح');
    }
    this.url = newUrl;
    this.finalUrl = newUrl;
    this.error = null;
    this._retries = 0;
    if (this.status === 'failed' || this.status === 'paused') {
      this.status = 'queued';
    }
    this._emit();
    return true;
  }

  /* تقديم أولوية تحميل مقطع معين للمشاهدة الحية (المرحلة 14.1) */
  prioritizeOffset(offset) {
    if (!this.segments || !this.segments.length) return;
    const targetIdx = this.segments.findIndex(s => !s.done && offset >= s.start && (s.end === null || offset <= s.end));
    if (targetIdx > 0) {
      const seg = this.segments.splice(targetIdx, 1)[0];
      this.segments.unshift(seg);
    }
  }

  _emit() {
    this.emit('updated', this.snapshot());
  }
}

module.exports = DownloadTask;
