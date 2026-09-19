'use strict';

/* Premium DM — Content Script (Floating Video Sniffer Widget) v2.2.0 */

let settings = { showVideoWidget: true };

// جلب الإعدادات من الخلفية
try {
  chrome.runtime.sendMessage({ type: 'getSettings' }, res => {
    if (res && res.settings) settings = { ...settings, ...res.settings };
    if (settings.showVideoWidget !== false) initVideoSniffer();
  });
} catch (_e) {
  initVideoSniffer();
}

function showPageToast(text, ok = true) {
  const old = document.querySelector('.pdm-page-toast');
  if (old) old.remove();

  const toast = document.createElement('div');
  toast.className = 'pdm-page-toast';
  toast.innerHTML = `<span>${ok ? '⚡' : '⚠️'}</span> <span>${text}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function getBestMediaUrl(videoEl) {
  const host = (window.location.hostname || '').toLowerCase();
  const isVideoPlatform = host.includes('youtube.com') || host.includes('youtu.be') ||
    host.includes('tiktok.com') || host.includes('facebook.com') || host.includes('fb.watch') ||
    host.includes('instagram.com') || host.includes('twitter.com') || host.includes('x.com') ||
    host.includes('vimeo.com') || host.includes('dailymotion.com');
  if (isVideoPlatform) {
    return window.location.href;
  }
  if (videoEl.currentSrc && !videoEl.currentSrc.startsWith('blob:') && !videoEl.currentSrc.includes('googlevideo.com')) {
    return videoEl.currentSrc;
  }
  if (videoEl.src && !videoEl.src.startsWith('blob:') && !videoEl.src.includes('googlevideo.com')) {
    return videoEl.src;
  }
  const sources = videoEl.querySelectorAll('source');
  for (const s of sources) {
    if (s.src && !s.src.startsWith('blob:') && !s.src.includes('googlevideo.com')) return s.src;
  }
  // لمواقع الفيديو نرسل رابط الصفحة دائماً لتتولى أداة التحميل المعالجة الكاملة مع الصوت
  return window.location.href;
}

function attachWidgetToVideo(video) {
  if (video.dataset.pdmAttached || video.dataset.pdmDismissed) return;
  video.dataset.pdmAttached = 'true';

  const widget = document.createElement('div');
  widget.className = 'pdm-video-widget';

  const isYouTube = window.location.hostname.includes('youtube.com');
  const label = isYouTube ? 'تحميل الفيديو' : 'تحميل الوسائط';

  widget.innerHTML = `
    <div class="pdm-widget-bar">
      <button class="pdm-widget-btn" type="button" title="خيارات تحميل الفيديو مع Premium DM">
        <span class="pdm-icon">⚡</span>
        <span class="pdm-btn-text">${label}</span>
        <span class="pdm-badge">Premium DM</span>
        <span class="pdm-caret">▾</span>
      </button>
      <button class="pdm-widget-close" type="button" title="إخفاء زر التحميل">✕</button>
    </div>
    <div class="pdm-quality-menu">
      <div class="pdm-menu-header">
        <span class="pdm-header-title">⚡ الجودات المتوفرة للفيديو</span>
        <span class="pdm-header-badge">MP4 + صوت</span>
        <button class="pdm-menu-close" type="button" title="إغلاق">✕</button>
      </div>
      <div class="pdm-menu-items">
        <!-- جودات أولية افتراضية لحين اكتمال الفحص اللحظي للجودات الحقيقية -->
        <button class="pdm-q-item" type="button" data-fmt="bestvideo+bestaudio/best" data-label="أفضل جودة تلقائية">
          <span class="q-icon">⭐</span>
          <div class="q-info">
            <span class="q-name">أفضل جودة متوفرة تلقائياً</span>
            <span class="q-desc">دمج أعلى دقة لهذا الفيديو مع الصوت ستيريو</span>
          </div>
          <span class="q-tag">Auto Best</span>
        </button>
        <button class="pdm-q-item" type="button" data-fmt="bestvideo[height<=1080]+bestaudio/best" data-label="1080p Full HD">
          <span class="q-icon">🎬</span>
          <div class="q-info">
            <span class="q-name">Full HD (1080p)</span>
            <span class="q-desc">فيديو عالي الوضوح + صوت مدمج</span>
          </div>
          <span class="q-tag">1080p</span>
        </button>
        <button class="pdm-q-item" type="button" data-fmt="bestvideo[height<=720]+bestaudio/best" data-label="720p HD">
          <span class="q-icon">🎬</span>
          <div class="q-info">
            <span class="q-name">HD (720p)</span>
            <span class="q-desc">جودة ممتازة وحجم متوازن وسريع</span>
          </div>
          <span class="q-tag">720p</span>
        </button>
        <div class="pdm-menu-sep"></div>
        <button class="pdm-q-item pdm-audio-item" type="button" data-audio="true" data-label="صوت MP3 فقط">
          <span class="q-icon">🎵</span>
          <div class="q-info">
            <span class="q-name">استخراج الصوت فقط (MP3)</span>
            <span class="q-desc">تحويل مباشر لأعلى جودة صوتية</span>
          </div>
          <span class="q-tag">MP3</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(widget);

  function getYouTubeQualities() {
    try {
      const player = document.getElementById('movie_player');
      if (player && typeof player.getAvailableQualityLevels === 'function') {
        const levels = player.getAvailableQualityLevels() || [];
        const map = {
          highres: { height: 4320, label: '8K Ultra HD (4320p)', tag: '8K' },
          hd2880:  { height: 2880, label: '5K Ultra HD (2880p)', tag: '5K' },
          hd2160:  { height: 2160, label: '4K Ultra HD (2160p)', tag: '4K' },
          hd1440:  { height: 1440, label: '2K Quad HD (1440p)', tag: '2K' },
          hd1080:  { height: 1080, label: 'Full HD (1080p)', tag: '1080p' },
          hd720:   { height: 720,  label: 'HD (720p)', tag: '720p' },
          large:   { height: 480,  label: 'SD (480p)', tag: '480p' },
          medium:  { height: 360,  label: 'Medium (360p)', tag: '360p' },
          small:   { height: 240,  label: 'Low (240p)', tag: '240p' },
          tiny:    { height: 144,  label: 'Tiny (144p)', tag: '144p' }
        };
        const found = levels.map(l => map[l]).filter(Boolean);
        if (found.length) return found;
      }
    } catch (_e) {}
    return null;
  }

  function buildFormatsHtml(formats, isYtLevels) {
    let html = `
      <button class="pdm-q-item" type="button" data-fmt="bestvideo+bestaudio/best" data-label="أفضل جودة تلقائية">
        <span class="q-icon">⭐</span>
        <div class="q-info">
          <span class="q-name">أفضل جودة متوفرة تلقائياً</span>
          <span class="q-desc">أعلى دقة لهذا الفيديو مع صوت ستيريو</span>
        </div>
        <span class="q-tag">Auto Best</span>
      </button>
    `;

    if (isYtLevels && Array.isArray(formats)) {
      for (const q of formats) {
        const icon = q.height >= 2160 ? '💎' : (q.height >= 720 ? '🎬' : '📱');
        const desc = q.height >= 1080 ? 'فيديو عالي الوضوح + صوت مدمج 100%' : 'جودة خفيفة وسريعة التحميل';
        html += `
          <button class="pdm-q-item" type="button" data-fmt="bestvideo[height<=${q.height}]+bestaudio/best" data-label="${q.label}">
            <span class="q-icon">${icon}</span>
            <div class="q-info">
              <span class="q-name">${q.label}</span>
              <span class="q-desc">${desc}</span>
            </div>
            <span class="q-tag">${q.tag}</span>
          </button>
        `;
      }
    } else if (Array.isArray(formats) && formats.length) {
      const videoFormats = formats.filter(f => f.kind !== 'audio' && f.kind !== 'best');
      for (const f of videoFormats) {
        const icon = (f.height && f.height >= 2160) ? '💎' : ((f.height && f.height >= 720) ? '🎬' : '📱');
        const tag = f.height ? `${f.height}p` : 'MP4';
        const sizeStr = f.size ? ` • ${f.size}` : '';
        const desc = `${f.merge ? 'فيديو + صوت مدمج 100%' : 'مسار متوفر'}${sizeStr}`;
        html += `
          <button class="pdm-q-item" type="button" data-fmt="${f.id}" data-label="${f.label}">
            <span class="q-icon">${icon}</span>
            <div class="q-info">
              <span class="q-name">${f.label}</span>
              <span class="q-desc">${desc}</span>
            </div>
            <span class="q-tag">${tag}</span>
          </button>
        `;
      }
    }

    html += `
      <div class="pdm-menu-sep"></div>
      <button class="pdm-q-item pdm-audio-item" type="button" data-audio="true" data-label="صوت MP3 فقط">
        <span class="q-icon">🎵</span>
        <div class="q-info">
          <span class="q-name">استخراج الصوت فقط (MP3)</span>
          <span class="q-desc">تحويل مباشر لأعلى جودة صوتية</span>
        </div>
        <span class="q-tag">MP3</span>
      </button>
    `;

    return html;
  }

  function bindItemClicks() {
    const items = widget.querySelectorAll('.pdm-q-item');
    items.forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        widget.classList.remove('open');

        const mediaUrl = getBestMediaUrl(video);
        const isPageLevel = isYouTube || mediaUrl === window.location.href;
        const isAudio = item.dataset.audio === 'true';
        const formatId = item.dataset.fmt || undefined;
        const labelText = item.dataset.label || 'الفيديو';

        const pageTitle = document.title
          .replace(/\s*-\s*YouTube$/i, '')
          .replace(/^[(\d+)]\s*/, '')
          .trim();

        chrome.runtime.sendMessage({
          type: 'send',
          payload: {
            url: mediaUrl,
            video: isPageLevel,
            formatId,
            audioOnly: isAudio,
            mergeOutput: 'mp4',
            title: pageTitle,
            referrer: window.location.href,
            force: true
          }
        }, res => {
          if (res && res.ok) {
            showPageToast(`✓ تم إرسال [${labelText}] إلى Premium DM بنجاح! 🎬`);
          } else {
            showPageToast('تعذر الاتصال بالبرنامج المكتبي، تأكد من تشغيل Premium DM', false);
          }
        });
      };
    });
  }

  let dynamicFormatsLoaded = false;
  function loadRealQualities() {
    if (dynamicFormatsLoaded) return;
    const mediaUrl = getBestMediaUrl(video);
    const targetUrl = isYouTube ? window.location.href : mediaUrl;
    const itemsContainer = widget.querySelector('.pdm-menu-items');

    // 1. فحص محلي فوري ليوتيوب من مشغل الصفحة (0ms)
    if (isYouTube) {
      const ytQualities = getYouTubeQualities();
      if (ytQualities && ytQualities.length && itemsContainer) {
        itemsContainer.innerHTML = buildFormatsHtml(ytQualities, true);
        bindItemClicks();
      }
    }

    // 2. استعلام المحرك الخلفي لجلب الأحجام والدقات الحقيقية المؤكدة
    chrome.runtime.sendMessage({ type: 'getVideoFormats', url: targetUrl }, res => {
      if (res && res.ok && Array.isArray(res.formats) && res.formats.length) {
        dynamicFormatsLoaded = true;
        if (itemsContainer) {
          itemsContainer.innerHTML = buildFormatsHtml(res.formats, false);
          bindItemClicks();
        }
      }
    });
  }

  function updatePosition() {
    if (!video.isConnected) {
      widget.remove();
      return;
    }
    const rect = video.getBoundingClientRect();
    if (rect.width < 140 || rect.height < 90 || rect.bottom < 0 || rect.top > window.innerHeight) {
      widget.style.display = 'none';
      return;
    }
    widget.style.display = 'inline-flex';
    const top = rect.top + window.scrollY + 12;
    const right = (window.innerWidth - (rect.right + window.scrollX)) + 12;
    widget.style.top = `${Math.max(10, top)}px`;
    widget.style.right = `${Math.max(10, right)}px`;
  }

  window.addEventListener('scroll', updatePosition, { passive: true });
  window.addEventListener('resize', updatePosition, { passive: true });
  updatePosition();

  video.addEventListener('play', updatePosition);
  video.addEventListener('loadeddata', updatePosition);

  // إغلاق وإخفاء الويدجت تماماً عند النقر على ✕
  const closeBtn = widget.querySelector('.pdm-widget-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      widget.remove();
      video.dataset.pdmDismissed = 'true';
    });
  }

  const menuClose = widget.querySelector('.pdm-menu-close');
  if (menuClose) {
    menuClose.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      widget.classList.remove('open');
    });
  }

  // فتح وإغلاق قائمة الجودات وتحميل الجودات الحقيقية
  const btn = widget.querySelector('.pdm-widget-btn');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const isOpen = widget.classList.contains('open');
    // إغلاق أي قائمة مفتوحة أخرى أولاً
    document.querySelectorAll('.pdm-video-widget.open').forEach(w => {
      if (w !== widget) w.classList.remove('open');
    });
    widget.classList.toggle('open', !isOpen);
    if (!isOpen) {
      loadRealQualities();
    }
  });

  widget.addEventListener('mouseenter', () => {
    loadRealQualities();
  });

  bindItemClicks();

  // إغلاق القائمة عند النقر خارجها
  document.addEventListener('click', (e) => {
    if (!widget.contains(e.target)) {
      widget.classList.remove('open');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      widget.classList.remove('open');
    }
  });
}

function initVideoSniffer() {
  function scan() {
    const videos = document.querySelectorAll('video');
    videos.forEach(v => attachWidgetToVideo(v));
  }

  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
}

// رصد اعتراض ونقر روابط التنزيل داخل الصفحات (مع دعم مفتاح Alt لتجاوز البرنامج)
const DL_EXT_RE = /\.(zip|rar|7z|tar|gz|bz2|xz|iso|exe|msi|apk|dmg|deb|rpm|mp4|mkv|webm|avi|mov|wmv|flv|m4v|mp3|m4a|aac|wav|flac|ogg|oga|pdf|epub|torrent|jar|msu|cab)($|[?#])/i;

function initLinkInterceptor() {
  document.addEventListener('click', e => {
    // ضغط مفتاح Alt يتيح التحميل المباشر عبر المتصفح وتجاوز الإضافة (معيار IDM الشهير)
    if (e.altKey) return;

    const a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a || !a.href) return;

    // إذا كانت هذه النقرة ناتجة عن الاسترجاع التلقائي عند إغلاق البرنامج، لا نعترضها
    if (a.getAttribute('data-pdm-bypass') === 'true') return;

    const href = a.href;
    if (!/^https?:\/\//i.test(href)) return;

    const hasDownloadAttr = a.hasAttribute('download');
    const isDownloadLink = DL_EXT_RE.test(href.split('#')[0]);

    if (!hasDownloadAttr && !isDownloadLink) return;

    // إيقاف المتصفح فوراً عن بدء التنزيل المزدوج بالتوازي مع البرنامج
    e.preventDefault();
    e.stopPropagation();

    const filename = a.getAttribute('download') || href.split('?')[0].split('/').pop() || undefined;

    try {
      chrome.runtime.sendMessage({
        type: 'interceptLinkClick',
        url: href,
        filename,
        referrer: window.location.href
      }, res => {
        if (res && res.handled) {
          showPageToast(`⚡ تم توجيه التحميل إلى Premium DM: ${res.filename || filename || ''}`);
        } else {
          // البرنامج مغلق أو لم يستجب: السماح للمتصفح بالتحميل الطبيعي دون أي إعاقة
          const fallback = document.createElement('a');
          fallback.href = href;
          if (a.hasAttribute('download')) fallback.setAttribute('download', a.getAttribute('download') || '');
          if (a.target) fallback.target = a.target;
          fallback.setAttribute('data-pdm-bypass', 'true');
          document.body.appendChild(fallback);
          fallback.click();
          fallback.remove();
        }
      });
    } catch (_e) {
      // في حالة وجود خطأ في اتصال الـ runtime، نسمح بالتنزيل الطبيعي
      window.location.href = href;
    }
  }, true);

  // استقبال رسائل إشعار الالتقاط من الخلفية
  chrome.runtime.onMessage.addListener(msg => {
    if (msg && msg.type === 'showCaptureToast') {
      showPageToast(`⚡ تم اعتراض التنزيل والتحميل عبر Premium DM: ${msg.filename || ''}`);
    }
  });
}

initLinkInterceptor();

