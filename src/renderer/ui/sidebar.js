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

export function filteredTasks() {
  let arr = [...state.tasks.values()];
  if (state.filter === 'downloading') arr = arr.filter(t => ['downloading', 'queued'].includes(t.status));
  else if (state.filter.startsWith('cat:')) arr = arr.filter(t => t.category === state.filter.slice(4));
  else if (state.filter !== 'all') arr = arr.filter(t => t.status === state.filter);
  if (state.search) {
    const q = state.search.toLowerCase();
    arr = arr.filter(t => (t.filename || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q));
  }
  return arr.sort((a, b) => b.createdAt - a.createdAt);
}