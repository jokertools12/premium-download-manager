/* منسّق العرض الرئيسي — يعيد بناء القائمة/اللوحة/السجل عند التغييرات البنيوية */

import { $ } from '../lib/dom.js';
import { fmtSpeed } from '../lib/format.js';
import { state } from '../state.js';
import { filteredTasks, renderSidebar } from './sidebar.js';
import { taskCard } from './taskcard.js';
import { renderDashboard, drawDailyChart } from './dashboard.js';
import { renderHistory } from './history.js';

export function render() {
  state.renderPending = false;
  renderSidebar();
  const isDash = state.view === 'dashboard';
  const isHist = state.view === 'history';
  $('#toolbar').style.display = (!isDash && !isHist) ? 'flex' : 'none';
  $('#list').style.display = (!isDash && !isHist) ? 'flex' : 'none';
  $('#dashboard').style.display = isDash ? 'block' : 'none';
  $('#historyView').style.display = isHist ? 'block' : 'none';
  $('#btnDashboard').classList.toggle('active', isDash);
  $('#btnHistory').classList.toggle('active', isHist);
  $('#totalSpeed').innerHTML = `<span>▲</span> ${fmtSpeed((state.summary && state.summary.speed) || 0)}`;
  if (isDash) {
    renderDashboard();
    drawDailyChart();
    $('#empty').style.display = 'none';
    return;
  }
  if (isHist) {
    renderHistory();
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