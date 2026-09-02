/* الحالة المشتركة للواجهة + الثوابت — تُستورد من جميع الوحدات */

export const FILTERS = [
  { id: 'all', key: 'filter.all', icon: '📥' },
  { id: 'downloading', key: 'filter.downloading', icon: '⬇️' },
  { id: 'queued', key: 'filter.queued', icon: '⏳' },
  { id: 'paused', key: 'filter.paused', icon: '⏸' },
  { id: 'completed', key: 'filter.completed', icon: '✅' },
  { id: 'failed', key: 'filter.failed', icon: '⚠️' }
];

export const CATEGORIES = [
  { id: 'video', key: 'cat.video', icon: '🎬' },
  { id: 'audio', key: 'cat.audio', icon: '🎵' },
  { id: 'image', key: 'cat.image', icon: '🖼️' },
  { id: 'document', key: 'cat.document', icon: '📄' },
  { id: 'compressed', key: 'cat.compressed', icon: '🗜️' },
  { id: 'program', key: 'cat.program', icon: '⚙️' },
  { id: 'other', key: 'cat.other', icon: '📦' }
];

export const statusLabel = s => window.t('status.' + s);
export const CAT_ICON = Object.fromEntries(CATEGORIES.map(c => [c.id, c.icon]));

/* روابط البث المباشر (M3U8/MPD) توجّه لنافذة الفيديو */
export const STREAM_RE = /\.m3u8($|[?#])|\.mpd($|[?#])/i;

export const state = {
  tasks: new Map(),
  filter: 'all',
  view: 'tasks',
  search: '',
  settings: null,
  summary: {},
  speedSamples: [],
  dashboardStats: null,
  rulesDraft: [],
  ctxTask: null,
  renderPending: false
};