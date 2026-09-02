/* أدوات الوسائط للمعاينة (3.3) — نقية وقابلة للاختبار */

const IMG_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif']);
const PLAYABLE_EXTS = new Set(['mp4', 'webm', 'm4v', 'mp3', 'wav', 'ogg', 'oga']);

export const extOf = p => {
  const m = /\.([a-z0-9]+)\s*$/i.exec(String(p || ''));
  return m ? m[1].toLowerCase() : '';
};

export const isImage = p => IMG_EXTS.has(extOf(p));
export const isPlayable = p => PLAYABLE_EXTS.has(extOf(p));
export const isMedia = p => isImage(p) || isPlayable(p);

/* رابط خدمة ملف محلي عبر بروتوكول app:// (يديره main.js) */
export const mediaUrl = p => 'app://media/' + encodeURIComponent(String(p || ''));