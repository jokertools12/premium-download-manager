'use strict';

/* ==========================================================================
   Premium Download Manager — Landing Page Interactivity & Workflow Simulator
   ========================================================================== */

// 1. القاموس متعدد اللغات (عربي / English)
const TRANSLATIONS = {
  ar: {
    navFeatures: 'المميزات',
    navWorkflow: 'مسار العمل',
    navCompare: 'المقارنة',
    navDownloads: 'التنزيل',
    heroTag: 'الجيل الثالث · v3.0 مفتوح المصدر 100%',
    heroTitle: 'التحميل الخارق، الذكاء الاصطناعي، والحرية التامة',
    heroDesc: 'أسرع من IDM، أجمل منه، وبلا إعلانات. محرك تقسيم حتى 32 اتصالاً متزامناً، فيديو وتورنت، وقواعد ذكية تعمل offline بالكامل.',
    heroDownload: '⬇ تنزيل لـ ',
    heroGithub: '⭐ المستودع على GitHub',
    statFree: 'مجاني 100% للأبد',
    statNoAds: 'بلا إعلانات وبلا تتبع',
    statTests: '128 اختباراً آلياً ناجحاً',
    wfTag: 'تقنية حصرية',
    wfTitle: 'كيف يتفوق محرك Premium DM؟',
    wfDesc: 'شاهد محاكاة حية لمسار العمل فائق السرعة من لحظة التقاط الرابط حتى التحقق الآلي.',
    step1Title: '1. الالتقاط الذكي',
    step1Desc: 'اعتراض فوري عبر الإضافة أو الحافظة',
    step2Title: '2. التسريع المتعدد',
    step2Desc: 'تقسيم إلى 16 اتصالاً متوازياً تكيفياً',
    step3Title: '3. التوجيه والتحقق',
    step3Desc: 'فحص SHA-256 وتصنيف ذكي للمجلدات',
    simStart: '⚡ تشغيل محاكاة التحميل المتعدد',
    simRestart: '🔄 إعادة المحاكاة',
    simSpeed: 'السرعة الآن: ',
    simProgress: 'التقدم: ',
    simStatusReady: 'جاهز لبدء المحاكاة...',
    simStatusRunning: '🚀 جاري التقسيم والتحميل عبر 16 خيط اتصال متوازي...',
    simStatusDone: '✅ اكتمل التحميل! تم التحقق من SHA-256 ونُقل إلى مجلد الفيديوهات.',
    compTag: 'المقارنة المباشرة',
    compTitle: 'لماذا يتفوق Premium DM على الجميع؟',
    compDesc: 'مقارنة هندسية صريحة وشاملة مع أشهر برامج التحميل التجارية والمفتوحة.',
    dlTag: 'التثبيت والتشغيل',
    dlTitle: 'احصل عليه الآن لنظامك المفضل',
    copiedToast: '✓ تم نسخ الأمر للحافظة بنجاح!'
  },
  en: {
    navFeatures: 'Features',
    navWorkflow: 'Workflow',
    navCompare: 'Comparison',
    navDownloads: 'Download',
    heroTag: 'Generation 3 · v3.0 100% Open Source',
    heroTitle: 'Blazing Speed, Offline AI, Complete Freedom',
    heroDesc: 'Faster than IDM, visually stunning, and zero ads. Up to 32 parallel connections, YouTube/M3U8 sniffer, BitTorrent, and offline AI rules.',
    heroDownload: '⬇ Download for ',
    heroGithub: '⭐ View on GitHub',
    statFree: '100% Free Forever',
    statNoAds: 'Zero Ads & Zero Telemetry',
    statTests: '128 Automated Tests Passed',
    wfTag: 'Cutting-edge Architecture',
    wfTitle: 'How Does Premium DM Accelerate?',
    wfDesc: 'Watch a live interactive simulation of our high-throughput multi-stream pipeline in real-time.',
    step1Title: '1. Smart Sniffing',
    step1Desc: 'Instant capture via browser or clipboard',
    step2Title: '2. Parallel Acceleration',
    step2Desc: 'Dynamic split across 16 parallel chunks',
    step3Title: '3. Assembly & Verify',
    step3Desc: 'SHA-256 hash check & AI folder routing',
    simStart: '⚡ Start Multi-Stream Simulation',
    simRestart: '🔄 Restart Simulation',
    simSpeed: 'Speed: ',
    simProgress: 'Progress: ',
    simStatusReady: 'Ready to launch workflow simulation...',
    simStatusRunning: '🚀 Downloading across 16 parallel workers...',
    simStatusDone: '✅ Complete! SHA-256 checksum verified & organized.',
    compTag: 'Direct Benchmark',
    compTitle: 'Why Choose Premium DM Over IDM?',
    compDesc: 'An honest, feature-by-feature breakdown against legacy commercial and open-source managers.',
    dlTag: 'Install & Setup',
    dlTitle: 'Get It Now For Your Preferred OS',
    copiedToast: '✓ Command copied to clipboard!'
  }
};

let currentLang = 'ar';
let currentTheme = 'dark';

// 2. إدارة محاكي مسار العمل (Interactive Workflow Simulator)
let simTimer = null;
let isSimulating = false;

function initWorkflowSimulator() {
  const container = document.getElementById('chunksGrid');
  if (!container) return;

  // إنشاء 16 صندوق مقطع (Chunks)
  container.innerHTML = '';
  for (let i = 0; i < 16; i++) {
    const box = document.createElement('div');
    box.className = 'chunk-box';
    box.id = `chunk_${i}`;
    box.innerHTML = `
      <div class="chunk-fill" id="fill_${i}"></div>
      <span class="chunk-text">#${i + 1}</span>
    `;
    container.appendChild(box);
  }

  const btnSim = document.getElementById('btnStartSim');
  if (btnSim) {
    btnSim.onclick = () => {
      if (isSimulating) return;
      runSimulation();
    };
  }

  // التبديل بين خطوات مسار العمل يدوياً
  document.querySelectorAll('.wf-step-item').forEach(item => {
    item.onclick = () => {
      document.querySelectorAll('.wf-step-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    };
  });
}

function runSimulation() {
  isSimulating = true;
  const statusEl = document.getElementById('simStatusText');
  const speedEl = document.getElementById('simSpeedVal');
  const progEl = document.getElementById('simProgVal');
  const btn = document.getElementById('btnStartSim');

  btn.disabled = true;
  statusEl.textContent = TRANSLATIONS[currentLang].simStatusRunning;

  // إعادة تصفير الشرائح
  for (let i = 0; i < 16; i++) {
    const f = document.getElementById(`fill_${i}`);
    if (f) f.style.width = '0%';
  }

  let progress = 0;
  clearInterval(simTimer);

  simTimer = setInterval(() => {
    progress += Math.random() * 4 + 2;
    if (progress > 100) progress = 100;

    progEl.textContent = Math.round(progress) + '%';
    const fakeSpeed = progress < 98 ? (Math.random() * 35 + 85).toFixed(1) + ' MB/s' : '0 B/s';
    speedEl.textContent = fakeSpeed;

    for (let i = 0; i < 16; i++) {
      const f = document.getElementById(`fill_${i}`);
      if (f) {
        const chunkProg = Math.min(100, Math.max(0, (progress * 1.2) - (i * 3)));
        f.style.width = chunkProg + '%';
      }
    }

    if (progress >= 100) {
      clearInterval(simTimer);
      isSimulating = false;
      btn.disabled = false;
      btn.textContent = TRANSLATIONS[currentLang].simRestart;
      statusEl.textContent = TRANSLATIONS[currentLang].simStatusDone;
      speedEl.textContent = '0 B/s';

      // تفعيل الخطوة الثالثة بصرياً
      const step3 = document.querySelector('[data-step="3"]');
      if (step3) {
        document.querySelectorAll('.wf-step-item').forEach(i => i.classList.remove('active'));
        step3.classList.add('active');
      }
    }
  }, 100);
}

// 3. اكتشاف نظام تشغيل الزائر تلقائياً (OS Auto-Detection)
function detectVisitorOS() {
  const ua = navigator.userAgent.toLowerCase();
  let os = 'Windows';
  let targetTab = 'win';

  if (ua.includes('mac')) {
    os = 'macOS';
    targetTab = 'mac';
  } else if (ua.includes('linux')) {
    os = 'Linux';
    targetTab = 'linux';
  }

  const heroBtnText = document.getElementById('heroOsName');
  if (heroBtnText) heroBtnText.textContent = os;

  switchTab(targetTab);
}

// 4. ألسنة تبويب منصات التنزيل (Tab switcher)
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    };
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `tab_${tabId}`);
  });
}

// 5. نسخ أوامر سطر الأوامر بنقرة واحدة (Copy to Clipboard)
function initCopyButtons() {
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.onclick = () => {
      const cmd = btn.getAttribute('data-cmd');
      if (cmd) {
        navigator.clipboard.writeText(cmd).then(() => {
          const old = btn.textContent;
          btn.textContent = '✓ ' + (currentLang === 'ar' ? 'تم النسخ!' : 'Copied!');
          setTimeout(() => btn.textContent = old, 2000);
        });
      }
    };
  });
}

// 6. مبدل اللغة والاتجاه (RTL / LTR)
function initLanguageToggle() {
  const btn = document.getElementById('btnLangToggle');
  if (!btn) return;

  btn.onclick = () => {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    applyLanguage(currentLang);
  };
}

function applyLanguage(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

  const dict = TRANSLATIONS[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  });

  const langBtn = document.getElementById('btnLangToggle');
  if (langBtn) langBtn.textContent = lang === 'ar' ? 'English 🌐' : 'العربية 🌐';
}

// 7. مبدل المظهر (Dark / Light)
function initThemeToggle() {
  const btn = document.getElementById('btnThemeToggle');
  if (!btn) return;

  btn.onclick = () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    btn.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
  };
}

// تشغيل عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  initWorkflowSimulator();
  initTabs();
  detectVisitorOS();
  initCopyButtons();
  initLanguageToggle();
  initThemeToggle();
});
