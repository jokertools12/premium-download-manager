'use strict';
/* دعم المنصات الثلاث (6.1): win32 / darwin / linux — نقية وقابلة للاختبار
   تجمع: أسماء وروابط الأدوات الثنائية، مجلدات البيانات، ودلائل Native Messaging */

const os = require('os');
const path = require('path');

const YT_DLP_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/';

/* ثنائيات ffmpeg-static: ملف واحد مباشر بلا أرشيف لكل منصة (يبسط التثبيت) */
function ffmpegAsset(platform, arch) {
  if (platform === 'win32') return 'ffmpeg-win32-x64';
  if (platform === 'darwin') return arch === 'arm64' ? 'ffmpeg-darwin-arm64' : 'ffmpeg-darwin-x64';
  return arch === 'arm64' ? 'ffmpeg-linux-arm64' : 'ffmpeg-linux-x64';
}

const FFMPEG_STATIC_BASE = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/';

/* معلومات الأدوات المطلوبة لمنصة معينة */
function binaries(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') {
    return {
      ytDlp: { url: YT_DLP_BASE + 'yt-dlp.exe', file: 'yt-dlp.exe' },
      ffmpeg: {
        url: FFMPEG_STATIC_BASE + 'ffmpeg-win32-x64',
        file: 'ffmpeg.exe'
      }
    };
  }
  if (platform === 'darwin') {
    return {
      ytDlp: { url: YT_DLP_BASE + 'yt-dlp_macos', file: 'yt-dlp' },
      ffmpeg: {
        url: FFMPEG_STATIC_BASE + ffmpegAsset('darwin', arch),
        file: 'ffmpeg'
      }
    };
  }
  return {
    ytDlp: { url: YT_DLP_BASE + 'yt-dlp_linux', file: 'yt-dlp' },
    ffmpeg: {
      url: FFMPEG_STATIC_BASE + ffmpegAsset('linux', arch),
      file: 'ffmpeg'
    }
  };
}

/* هل تحتاج الثنائية تنفيذ (chmod +x) بعد التنزيل؟ */
function needsChmod(platform = process.platform) {
  return platform !== 'win32';
}

/* مجلد بيانات التطبيق حسب المنصة (نفس منطق database.js) */
function dataDir(currentPlatform = process.platform) {
  if (currentPlatform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'PremiumDownloadManager'
    );
  }
  if (currentPlatform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'PremiumDownloadManager');
  }
  return path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
    'PremiumDownloadManager'
  );
}

/* مسارات Native Messaging للمتصفحات حسب المنصة (6.1) */
function nativeMessagingDir(platform, browser) {
  const home = os.homedir();
  if (platform === 'darwin') {
    if (browser === 'firefox') return path.join(home, 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts');
    return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');
  }
  if (platform === 'linux') {
    if (browser === 'firefox') return path.join(home, '.mozilla', 'native-messaging-m');
    return path.join(home, '.config', browser === 'edge' ? 'microsoft-edge' : 'google-chrome', 'NativeMessagingHosts');
  }
  return null; // ويندوز يستخدم السجل
}

module.exports = { binaries, ffmpegAsset, needsChmod, dataDir, nativeMessagingDir };