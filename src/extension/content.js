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
  if (videoEl.currentSrc && !videoEl.currentSrc.startsWith('blob:')) {
    return videoEl.currentSrc;
  }
  if (videoEl.src && !videoEl.src.startsWith('blob:')) {
    return videoEl.src;
  }
  const sources = videoEl.querySelectorAll('source');
  for (const s of sources) {
    if (s.src && !s.src.startsWith('blob:')) return s.src;
  }
  // لمواقع مثل YouTube / Twitter / TikTok نرسل رابط الصفحة لتتولى yt-dlp المعالجة
  return window.location.href;
}

function attachWidgetToVideo(video) {
  if (video.dataset.pdmAttached) return;
  video.dataset.pdmAttached = 'true';

  const widget = document.createElement('div');
  widget.className = 'pdm-video-widget';

  const isYouTube = window.location.hostname.includes('youtube.com');
  const label = isYouTube ? 'تحميل الفيديو' : 'تحميل الوسائط';

  widget.innerHTML = `
    <button class="pdm-widget-btn" type="button" title="خيارات تحميل الفيديو مع Premium DM">
      <span class="pdm-icon">⚡</span>
      <span class="pdm-btn-text">${label}</span>
      <span class="pdm-badge">Premium DM</span>
      <span class="pdm-caret">▾</span>
    </button>
    <div class="pdm-quality-menu">
      <div class="pdm-menu-header">
        <span class="pdm-header-title">⚡ خيارات التحميل والجودة</span>
        <span class="pdm-header-badge">MP4 مدمج</span>
      </div>
      <div class="pdm-menu-items">
        <button class="pdm-q-item" type="button" data-fmt="bestvideo+bestaudio/best" data-label="أفضل جودة تلقائية">
          <span class="q-icon">⭐</span>
          <div class="q-info">
            <span class="q-name">أفضل جودة تلقائياً</span>
            <span class="q-desc">دمج أعلى جودة متوفرة مع الصوت ستيريو</span>
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
        <button class="pdm-q-item" type="button" data-fmt="bestvideo[height<=480]+bestaudio/best" data-label="480p SD">
          <span class="q-icon">📱</span>
          <div class="q-info">
            <span class="q-name">SD (480p)</span>
            <span class="q-desc">حجم خفيف مناسب للباقات الضعيفة</span>
          </div>
          <span class="q-tag">480p</span>
        </button>
        <button class="pdm-q-item" type="button" data-fmt="bestvideo[height<=2160]+bestaudio/best" data-label="4K Ultra HD">
          <span class="q-icon">💎</span>
          <div class="q-info">
            <span class="q-name">4K Ultra HD (2160p)</span>
            <span class="q-desc">دقة سينمائية فائقة الوضوح</span>
          </div>
          <span class="q-tag">4K</span>
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

  // فتح وإغلاق قائمة الجودات
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
  });

  // النقر على أحد خيارات الجودة
  widget.querySelectorAll('.pdm-q-item').forEach(item => {
    item.addEventListener('click', (e) => {
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
    });
  });

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
