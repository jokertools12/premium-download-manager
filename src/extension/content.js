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
    <button class="pdm-widget-btn" title="تحميل الفيديو المكتشف مع Premium DM">
      <span class="pdm-icon">⚡</span>
      <span>${label}</span>
      <span class="pdm-badge">Premium DM</span>
    </button>
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

  // تحديث الموضع عند تشغيل الفيديو أو تغيير أبعاده
  video.addEventListener('play', updatePosition);
  video.addEventListener('loadeddata', updatePosition);

  // النقر على الزر للتحميل
  widget.querySelector('.pdm-widget-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const mediaUrl = getBestMediaUrl(video);
    const isPageLevel = isYouTube || mediaUrl === window.location.href;

    chrome.runtime.sendMessage({
      type: 'send',
      payload: {
        url: mediaUrl,
        video: isPageLevel,
        referrer: window.location.href,
        force: true
      }
    }, res => {
      if (res && res.ok) {
        showPageToast('تم إرسال الفيديو إلى Premium DM بنجاح! 🎬');
      } else {
        showPageToast('تعذر الاتصال بالبرنامج المكتبي، تأكد من تشغيل Premium DM', false);
      }
    });
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
