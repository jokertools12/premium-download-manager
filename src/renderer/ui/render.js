/* منسّق العرض الرئيسي — يعيد بناء القائمة/اللوحة عند التغييرات البنيوية */

import { $ } from '../lib/dom.js';
import { fmtSpeed } from '../lib/format.js';
import { state } from '../state.js';
import { filteredTasks, renderSidebar } from './sidebar.js';
import { taskCard } from './taskcard.js';
import { renderDashboard } from './dashboard.js';

export function render() {
  state.renderPending = false;
  renderSidebar();
  const dash = state.view === 'dashboard';
  $('#toolbar').style.display = dash ? 'none' : 'flex';
  $('#list').style.display = dash ? 'none' : 'flex';
  $('#dashboard').style.display = dash ? 'block' : 'none';
  $('#btnDashboard').classList.toggle('active', dash);
  $('#totalSpeed').innerHTML = `<span>▲</span> ${fmtSpeed((state.summary && state.summary.speed) || 0)}`;
  if (dash) {
    renderDashboard();
    $('#empty').style.display = 'none';
    return;
  }
  const arr = filteredTasks();
  $('#list').innerHTML = arr.map(taskCard).join('');
  $('#empty').style.display = arr.length ? 'none' : 'flex';
}

export function renderSoon() {
  if (state.renderPending) return;
  state.renderPending = true;
  setTimeout(render, 300);
}