/* القائمة الجانبية: الفلاتر والتصنيفات + منطق تصفية المهام */

import { $ } from '../lib/dom.js';
import { state, FILTERS, CATEGORIES } from '../state.js';

export function renderSidebar() {
  const count = f => {
    if (f === 'all') return state.tasks.size;
    if (f === 'downloading') return [...state.tasks.values()].filter(t => ['downloading', 'queued'].includes(t.status)).length;
    return [...state.tasks.values()].filter(t => t.status === f).length;
  };
  $('#sideFilters').innerHTML = FILTERS.map(f => `
    <button class="side-item ${state.filter === f.id ? 'active' : ''}" data-filter="${f.id}">
      <span>${f.icon}</span><span>${window.t(f.key)}</span><span class="count">${count(f.id)}</span>
    </button>`).join('');

  const catCount = c => [...state.tasks.values()].filter(t => t.category === c).length;
  $('#sideCats').innerHTML = CATEGORIES.map(c => `
    <button class="side-item ${state.filter === 'cat:' + c.id ? 'active' : ''}" data-filter="cat:${c.id}">
      <span>${c.icon}</span><span>${window.t(c.key)}</span><span class="count">${catCount(c.id)}</span>
    </button>`).join('');
}

/* ترتيب القائمة (3.1) — نقية وقابلة للاختبار */
export const SORT_KEYS = ['createdAt', 'name', 'size', 'speed', 'status'];
const STATUS_ORDER = { downloading: 0, queued: 1, paused: 2, failed: 3, canceled: 4, completed: 5 };

function cmp(key, a, b) {
  switch (key) {
    case 'name': return String(a.filename || a.title || '').localeCompare(String(b.filename || b.title || ''));
    case 'size': return (a.size || 0) - (b.size || 0);
    case 'speed': return (a.speed || 0) - (b.speed || 0);
    case 'status': return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    default: return (a.createdAt || 0) - (b.createdAt || 0);
  }
}

export function sortTasks(arr, sort) {
  const { key = 'createdAt', dir = 'desc' } = sort || {};
  const s = dir === 'asc' ? 1 : -1;
  return [...arr].sort((a, b) => cmp(key, a, b) * s);
}

export function filteredTasks() {
  let arr = [...state.tasks.values()];
  if (state.filter === 'downloading') arr = arr.filter(t => ['downloading', 'queued'].includes(t.status));
  else if (state.filter.startsWith('cat:')) arr = arr.filter(t => t.category === state.filter.slice(4));
  else if (state.filter !== 'all') arr = arr.filter(t => t.status === state.filter);
  if (state.search) {
    const q = state.search.toLowerCase();
    arr = arr.filter(t => (t.filename || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q));
  }
  return sortTasks(arr, state.sort);
}