// Scorecard tab — side-by-side station comparison with saved comparisons

import { fetchStationComparison, fetchStationList } from './api.js';
import {
  CHART_DEFAULTS, CHART_COLORS, escapeHtml, formatNum, removeSkeleton,
} from './chart-utils.js';

const STORAGE_KEY = 'fire_scorecard_saved';
const MAX_SAVED = 20;

let allStations = [];
let radarChart = null;

// Metrics config: key, label, field/compute, "lower" = lower is better, "closer100" = closer to 100 is better
const METRICS = [
  { key: 'total', label: 'Total Calls', field: 'total_ytd', mode: 'lower' },
  { key: 'structure', label: 'Structure Fires', field: 'structure_ytd', mode: 'lower' },
  { key: 'outside', label: 'Outside Fires', field: 'outside_ytd', mode: 'lower' },
  { key: 'alarms', label: 'Alarms', field: 'alarms_ytd', mode: 'lower' },
  { key: 'duration', label: 'Avg Duration (min)', field: 'avg_duration', mode: 'lower' },
  { key: 'rank', label: 'City Rank', field: 'rank', mode: 'neutral' },
  { key: 'alarmRatio', label: 'Alarm Ratio', compute: r => r.total_ytd > 0 ? (r.alarms_ytd / r.total_ytd * 100) : 0, mode: 'lower', suffix: '%' },
  { key: 'workload', label: 'Workload Score', compute: null, mode: 'closer100', suffix: '%' },
];

export async function initScorecard() {
  try {
    const [stationNames, compData] = await Promise.all([
      fetchStationList(),
      fetchStationComparison(null),
    ]);

    allStations = compData?.allStationsYtd || [];
    computeWorkloadScores();

    populateDropdowns(stationNames);
    wireEvents();
    renderSavedList();

    // Default comparison
    const selectA = document.getElementById('sc-station-a');
    const selectB = document.getElementById('sc-station-b');
    if (selectA && selectB && stationNames.length >= 2) {
      selectA.value = stationNames[0];
      selectB.value = stationNames[1];
      runComparison();
    }

    removeSkeleton('scorecard');
  } catch (err) {
    console.error('Scorecard init failed:', err);
  }
}

function computeWorkloadScores() {
  const totals = allStations.map(r => parseInt(r.total_ytd) || 0);
  const sorted = [...totals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;

  for (const s of allStations) {
    const total = parseInt(s.total_ytd) || 0;
    s._workload = median > 0 ? (total / median) * 100 : 0;
  }

  // Set workload compute function now that we have median
  METRICS.find(m => m.key === 'workload').compute = r => r._workload || 0;
}

function populateDropdowns(names) {
  const selectA = document.getElementById('sc-station-a');
  const selectB = document.getElementById('sc-station-b');
  if (!selectA || !selectB) return;

  const options = names.map(n => `<option value="${n}">Station ${n}</option>`).join('');
  selectA.innerHTML = options;
  selectB.innerHTML = options;
}

function wireEvents() {
  document.getElementById('sc-station-a')?.addEventListener('change', runComparison);
  document.getElementById('sc-station-b')?.addEventListener('change', runComparison);
  document.getElementById('sc-save-btn')?.addEventListener('click', saveComparison);
}

function getStation(name) {
  return allStations.find(r => r.station_name === name);
}

function getMetricValue(metric, station) {
  if (metric.compute) return metric.compute(station);
  const raw = station[metric.field];
  return raw != null ? parseFloat(raw) : null;
}

function determineWinner(metric, valA, valB) {
  if (valA == null || valB == null) return 'tie';
  if (metric.mode === 'neutral') return 'tie';
  if (metric.mode === 'lower') {
    if (valA < valB) return 'a';
    if (valB < valA) return 'b';
    return 'tie';
  }
  if (metric.mode === 'closer100') {
    const distA = Math.abs(valA - 100);
    const distB = Math.abs(valB - 100);
    if (distA < distB) return 'a';
    if (distB < distA) return 'b';
    return 'tie';
  }
  return 'tie';
}

function runComparison() {
  const nameA = document.getElementById('sc-station-a')?.value;
  const nameB = document.getElementById('sc-station-b')?.value;
  if (!nameA || !nameB) return;

  const a = getStation(nameA);
  const b = getStation(nameB);
  if (!a || !b) return;

  renderScorecardHeader(a, b, nameA, nameB);
  renderScorecardTable(a, b, nameA, nameB);
  renderRadarChart(a, b, nameA, nameB);
}

function renderScorecardHeader(a, b, nameA, nameB) {
  const container = document.getElementById('sc-header');
  if (!container) return;

  let winsA = 0, winsB = 0;
  for (const m of METRICS) {
    if (m.mode === 'neutral') continue;
    const winner = determineWinner(m, getMetricValue(m, a), getMetricValue(m, b));
    if (winner === 'a') winsA++;
    else if (winner === 'b') winsB++;
  }

  const total = winsA + winsB;
  const overallWinner = winsA > winsB ? nameA : winsB > winsA ? nameB : null;

  container.innerHTML = `
    <div class="sc-score-bar">
      <div class="sc-score-side sc-side-a ${winsA >= winsB ? 'sc-leading' : ''}">
        <span class="sc-score-name">Stn ${escapeHtml(nameA)}</span>
        <span class="sc-score-num">${winsA}</span>
      </div>
      <div class="sc-score-vs">
        <span class="sc-vs-label">vs</span>
        <span class="sc-vs-sub">${total} metrics</span>
      </div>
      <div class="sc-score-side sc-side-b ${winsB >= winsA ? 'sc-leading' : ''}">
        <span class="sc-score-num">${winsB}</span>
        <span class="sc-score-name">Stn ${escapeHtml(nameB)}</span>
      </div>
    </div>
    ${overallWinner
      ? `<div class="sc-verdict">Station ${escapeHtml(overallWinner)} leads in ${Math.max(winsA, winsB)} of ${total} comparable metrics</div>`
      : `<div class="sc-verdict">Even match across ${total} comparable metrics</div>`
    }
  `;
}

function renderScorecardTable(a, b, nameA, nameB) {
  const container = document.getElementById('sc-table');
  if (!container) return;

  // Find max values for bar scaling
  const maxVals = {};
  for (const m of METRICS) {
    const vals = allStations.map(s => getMetricValue(m, s)).filter(v => v != null && v > 0);
    maxVals[m.key] = Math.max(...vals, 1);
  }

  let html = `
    <table class="sc-compare-table">
      <thead>
        <tr>
          <th class="sc-th-station">Stn ${escapeHtml(nameA)}</th>
          <th class="sc-th-metric">Metric</th>
          <th class="sc-th-station">Stn ${escapeHtml(nameB)}</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const m of METRICS) {
    const valA = getMetricValue(m, a);
    const valB = getMetricValue(m, b);
    const winner = determineWinner(m, valA, valB);
    const maxVal = maxVals[m.key];
    const suffix = m.suffix || '';

    const fmtA = valA != null ? (m.suffix === '%' ? valA.toFixed(1) + suffix : m.key === 'duration' ? parseFloat(valA).toFixed(1) : formatNum(valA)) : '--';
    const fmtB = valB != null ? (m.suffix === '%' ? valB.toFixed(1) + suffix : m.key === 'duration' ? parseFloat(valB).toFixed(1) : formatNum(valB)) : '--';

    const pctA = valA != null ? Math.min((valA / maxVal) * 100, 100) : 0;
    const pctB = valB != null ? Math.min((valB / maxVal) * 100, 100) : 0;

    const clsA = winner === 'a' ? 'sc-winner' : winner === 'b' ? 'sc-loser' : '';
    const clsB = winner === 'b' ? 'sc-winner' : winner === 'a' ? 'sc-loser' : '';

    html += `
      <tr>
        <td class="sc-val-cell sc-val-left ${clsA}">
          <span class="sc-val">${fmtA}</span>
          <div class="sc-bar-track sc-bar-left"><div class="sc-bar-fill sc-fill-a" style="width:${pctA}%"></div></div>
        </td>
        <td class="sc-metric-cell">${m.label}</td>
        <td class="sc-val-cell sc-val-right ${clsB}">
          <div class="sc-bar-track sc-bar-right"><div class="sc-bar-fill sc-fill-b" style="width:${pctB}%"></div></div>
          <span class="sc-val">${fmtB}</span>
        </td>
      </tr>
    `;
  }

  html += '</tbody></table>';
  html += '<p class="sc-caption">Lower is better for all metrics except City Rank (volume indicator) and Workload (closer to 100% is balanced).</p>';
  container.innerHTML = html;
}

function renderRadarChart(a, b, nameA, nameB) {
  const ctx = document.getElementById('chart-sc-radar');
  if (!ctx) return;

  // Normalize each metric 0-100 relative to max across all stations
  const labels = METRICS.filter(m => m.mode !== 'neutral').map(m => m.label);
  const normalize = (m, val) => {
    const vals = allStations.map(s => getMetricValue(m, s)).filter(v => v != null && v > 0);
    const max = Math.max(...vals, 1);
    return val != null ? (val / max) * 100 : 0;
  };

  const scorable = METRICS.filter(m => m.mode !== 'neutral');
  const dataA = scorable.map(m => normalize(m, getMetricValue(m, a)));
  const dataB = scorable.map(m => normalize(m, getMetricValue(m, b)));

  if (radarChart) radarChart.destroy();
  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [
        {
          label: `Stn ${nameA}`,
          data: dataA,
          borderColor: '#ff6b35',
          backgroundColor: 'rgba(255, 107, 53, 0.15)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#ff6b35',
        },
        {
          label: `Stn ${nameB}`,
          data: dataB,
          borderColor: '#4ecdc4',
          backgroundColor: 'rgba(78, 205, 196, 0.15)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#4ecdc4',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#7a8a9a', font: { size: 11 } } },
      },
      scales: {
        r: {
          ticks: { color: '#5a6a7a', backdropColor: 'transparent', font: { size: 9 } },
          grid: { color: '#2a3a4a' },
          angleLines: { color: '#2a3a4a' },
          pointLabels: { color: '#8a9aaa', font: { size: 10 } },
          suggestedMin: 0,
          suggestedMax: 100,
        },
      },
    },
  });
}

// === Saved Comparisons ===

function getSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

function setSaved(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
}

function saveComparison() {
  const nameA = document.getElementById('sc-station-a')?.value;
  const nameB = document.getElementById('sc-station-b')?.value;
  if (!nameA || !nameB || nameA === nameB) return;

  const saved = getSaved();
  // Prevent duplicates
  if (saved.some(s => s.stationA === nameA && s.stationB === nameB)) return;

  saved.unshift({
    id: Date.now(),
    stationA: nameA,
    stationB: nameB,
    savedAt: new Date().toISOString(),
    label: `Stn ${nameA} vs Stn ${nameB}`,
  });

  setSaved(saved);
  renderSavedList();
}

function loadComparison(id) {
  const saved = getSaved();
  const item = saved.find(s => s.id === id);
  if (!item) return;

  const selectA = document.getElementById('sc-station-a');
  const selectB = document.getElementById('sc-station-b');
  if (selectA) selectA.value = item.stationA;
  if (selectB) selectB.value = item.stationB;
  runComparison();
}

function deleteComparison(id) {
  const saved = getSaved().filter(s => s.id !== id);
  setSaved(saved);
  renderSavedList();
}

function renderSavedList() {
  const container = document.getElementById('sc-saved-list');
  if (!container) return;

  const saved = getSaved();
  if (!saved.length) {
    container.innerHTML = '<p class="sc-saved-empty">No saved comparisons yet. Compare two stations and click Save.</p>';
    return;
  }

  let html = '';
  for (const item of saved) {
    const date = new Date(item.savedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
    html += `
      <div class="sc-saved-item" data-id="${item.id}">
        <button class="sc-saved-load" data-id="${item.id}">
          <span class="sc-saved-label">${escapeHtml(item.label)}</span>
          <span class="sc-saved-date">${date}</span>
        </button>
        <button class="sc-saved-delete" data-id="${item.id}" title="Delete">&times;</button>
      </div>
    `;
  }

  container.innerHTML = html;

  // Wire load/delete buttons
  container.querySelectorAll('.sc-saved-load').forEach(btn => {
    btn.addEventListener('click', () => loadComparison(parseInt(btn.dataset.id)));
  });
  container.querySelectorAll('.sc-saved-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteComparison(parseInt(btn.dataset.id));
    });
  });
}
