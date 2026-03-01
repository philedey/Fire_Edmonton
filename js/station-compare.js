// Station Comparison tab — YTD performance with year-over-year comparison + AI analysis

import { fetchStationComparison, fetchStationList, fetchEquipmentAnalytics, fetchStationDurationBuckets } from './api.js';
import {
  CHART_DEFAULTS, CHART_COLORS, DOUGHNUT_DEFAULTS, RESPONSE_CODE_LABELS, RESPONSE_CODE_COLORS,
  escapeHtml, deltaBadge, formatNum, removeSkeleton, MONTH_LABELS, renderMarkdown,
} from './chart-utils.js';
import {
  streamAnalysis, buildStationPrompt, getStationSystemPrompt,
} from './ai.js';

let trendChart = null;
let typeMixChart = null;
let equipmentChart = null;
let responseChart = null;
let yoyChart = null;
let durationHistChart = null;
let currentStation = '04';
let currentStationData = null;
let currentEquipData = null;

export async function initStationCompare() {
  await populateStationDropdown();
  wireStationSelector();
  wireStationAI();
  await loadStation(currentStation);
}

async function populateStationDropdown() {
  const select = document.getElementById('station-select');
  try {
    const names = await fetchStationList();
    select.innerHTML = names.map(n =>
      `<option value="${n}" ${n === '04' ? 'selected' : ''}>Station ${n}</option>`
    ).join('');
  } catch (e) {
    console.warn('Station list load failed:', e);
  }
}

function wireStationSelector() {
  const select = document.getElementById('station-select');
  select.addEventListener('change', () => {
    currentStation = select.value;
    loadStation(currentStation);
  });
}

async function loadStation(station) {
  try {
    const [data, equipData, durData] = await Promise.all([
      fetchStationComparison(station),
      fetchEquipmentAnalytics(null, station),
      fetchStationDurationBuckets(station),
    ]);

    if (!data) {
      console.warn('No station comparison data returned');
      return;
    }

    currentStationData = data;
    currentEquipData = equipData;

    renderStationKPIs(data, station);
    renderTrendChart(data);
    renderTypeMix(data);
    renderEquipmentProfile(data);
    renderResponseCodes(data);
    renderAllStationsTable(data, station);

    // Enhanced analytics
    renderYoYChart(data);
    renderMultiUnitKPI(equipData);
    renderShortDurationKPI(durData);
    renderStationDurationHist(durData);
    renderDurationComparison(data);
    renderEquipmentCombosTable(equipData);
    updateStationAIPanel(station);

    removeSkeleton('stations');
  } catch (err) {
    console.error('Station comparison load failed:', err);
  }
}

// --- KPI cards ---

function renderStationKPIs(data, station) {
  const kpisArray = data.stationKpis || [];
  const currentYear = data.currentYear || new Date().getFullYear();
  const priorYear = data.priorYear || currentYear - 1;

  const curr = kpisArray.find(r => r.dispatch_year === currentYear) || {};
  const prior = kpisArray.find(r => r.dispatch_year === priorYear) || {};

  setKPI('stn-kpi-total', curr.total, prior.total);
  setKPI('stn-kpi-structure', curr.structure_fires, prior.structure_fires);
  setKPI('stn-kpi-outside', curr.outside_fires, prior.outside_fires);
  setKPI('stn-kpi-alarms', curr.alarms, prior.alarms);

  const dur = document.getElementById('stn-kpi-duration');
  const durSub = document.getElementById('stn-kpi-duration-sub');
  if (dur) {
    const med = curr.median_duration != null ? parseFloat(curr.median_duration).toFixed(1) : '--';
    dur.textContent = med !== '--' ? `${med} min` : '--';

    if (durSub) {
      const allStations = data.allStationsYtd || [];
      const durs = allStations.map(r => parseFloat(r.median_duration)).filter(v => !isNaN(v));
      if (durs.length) {
        const cityMed = (durs.reduce((a, b) => a + b, 0) / durs.length).toFixed(1);
        durSub.textContent = `City median: ${cityMed} min`;
      }
    }
  }

  const rank = document.getElementById('stn-kpi-rank');
  if (rank) {
    const allStations = data.allStationsYtd || [];
    const myStation = allStations.find(r => r.station_name === station);
    rank.textContent = myStation?.rank != null ? `#${myStation.rank}` : '--';
  }
}

function setKPI(id, current, prior) {
  const el = document.getElementById(id);
  const sub = document.getElementById(`${id}-sub`);
  if (el) el.textContent = formatNum(current);
  if (sub && current != null && prior != null) {
    sub.innerHTML = `vs ${formatNum(prior)} prior yr ${deltaBadge(current, prior)}`;
  }
}

// --- Monthly trend chart (station vs city avg) ---

function renderTrendChart(data) {
  const ctx = document.getElementById('chart-stn-trend');
  if (!ctx) return;

  const monthlyTrend = data.monthlyTrend || [];
  const cityAvg = data.cityAvgMonthly || [];

  const labels = [];
  const stationData = [];
  const cityData = [];

  const stnMap = {};
  for (const r of monthlyTrend) {
    stnMap[`${r.dispatch_year}-${r.dispatch_month}`] = parseInt(r.total) || 0;
  }
  const cityMap = {};
  for (const r of cityAvg) {
    cityMap[`${r.dispatch_year}-${r.dispatch_month}`] = parseFloat(r.avg_total) || 0;
  }

  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    labels.push(`${MONTH_LABELS[m - 1]} ${String(y).slice(2)}`);
    stationData.push(stnMap[`${y}-${m}`] || 0);
    cityData.push(cityMap[`${y}-${m}`] || 0);
  }

  const subtitle = document.getElementById('stn-trend-subtitle');
  if (subtitle) subtitle.textContent = `Station ${currentStation} vs City Average`;

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `Station ${currentStation}`,
          data: stationData,
          borderColor: '#ff6b35',
          backgroundColor: 'rgba(255, 107, 53, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          borderWidth: 2,
        },
        {
          label: 'City Average',
          data: cityData,
          borderColor: '#7a8a9a',
          borderDash: [5, 5],
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 1.5,
          fill: false,
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x, ticks: { ...CHART_DEFAULTS.scales.x.ticks, maxRotation: 45 } },
        y: { ...CHART_DEFAULTS.scales.y, beginAtZero: true },
      },
    },
  });
}

// --- Type mix doughnut ---

function renderTypeMix(data) {
  const ctx = document.getElementById('chart-stn-type');
  if (!ctx) return;

  const kpisArray = data.stationKpis || [];
  const currentYear = data.currentYear || new Date().getFullYear();
  const curr = kpisArray.find(r => r.dispatch_year === currentYear) || {};

  const labels = ['Structure', 'Outside', 'Alarms'];
  const values = [
    curr.structure_fires || 0,
    curr.outside_fires || 0,
    curr.alarms || 0,
  ];

  if (typeMixChart) typeMixChart.destroy();
  typeMixChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#ff4444', '#ff9933', '#ffcc00'],
        borderColor: 'rgba(22, 36, 52, 0.8)',
        borderWidth: 2,
      }],
    },
    options: DOUGHNUT_DEFAULTS,
  });
}

// --- Equipment profile (horizontal bar) ---

function renderEquipmentProfile(data) {
  const ctx = document.getElementById('chart-stn-equipment');
  if (!ctx) return;

  const equipment = (data.equipmentProfile || []).slice(0, 12);
  const labels = equipment.map(r => r.unit_type || 'Unknown');
  const values = equipment.map(r => parseInt(r.units_deployed) || parseInt(r.incidents) || 0);

  if (equipmentChart) equipmentChart.destroy();
  equipmentChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Deployments',
        data: values,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: 'y',
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x, beginAtZero: true },
        y: { ...CHART_DEFAULTS.scales.y, ticks: { ...CHART_DEFAULTS.scales.y.ticks, font: { size: 10 } } },
      },
    },
  });
}

// --- Response codes doughnut ---

function renderResponseCodes(data) {
  const ctx = document.getElementById('chart-stn-response');
  if (!ctx) return;

  const codes = data.responseCodes || [];
  const labels = codes.map(r => RESPONSE_CODE_LABELS[r.response_code] || r.response_code || 'Unknown');
  const values = codes.map(r => parseInt(r.cnt) || 0);
  const colors = codes.map(r => RESPONSE_CODE_COLORS[r.response_code] || '#5a6a7a');

  if (responseChart) responseChart.destroy();
  responseChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: 'rgba(22, 36, 52, 0.8)',
        borderWidth: 2,
      }],
    },
    options: DOUGHNUT_DEFAULTS,
  });
}

// --- Year-over-Year stacked bar chart ---

function renderYoYChart(data) {
  const ctx = document.getElementById('chart-stn-yoy');
  if (!ctx) return;

  const kpis = (data.stationKpis || []).sort((a, b) => a.dispatch_year - b.dispatch_year);
  if (!kpis.length) return;

  const labels = kpis.map(r => String(r.dispatch_year));
  const structData = kpis.map(r => parseInt(r.structure_fires) || 0);
  const outsideData = kpis.map(r => parseInt(r.outside_fires) || 0);
  const alarmsData = kpis.map(r => parseInt(r.alarms) || 0);

  if (yoyChart) yoyChart.destroy();
  yoyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Structure', data: structData, backgroundColor: '#ff4444', borderRadius: 4 },
        { label: 'Outside', data: outsideData, backgroundColor: '#ff9933', borderRadius: 4 },
        { label: 'Alarms', data: alarmsData, backgroundColor: '#ffcc00', borderRadius: 4 },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: { ...CHART_DEFAULTS.plugins, tooltip: { mode: 'index', intersect: false } },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x, stacked: true },
        y: { ...CHART_DEFAULTS.scales.y, stacked: true, beginAtZero: true },
      },
    },
  });
}

// --- Multi-unit KPI ---

function renderMultiUnitKPI(equipData) {
  const el = document.getElementById('stn-kpi-multi');
  const sub = document.getElementById('stn-kpi-multi-sub');
  if (!el) return;

  const multi = equipData?.multiUnitFrequency || {};
  el.textContent = multi.multi_unit_pct != null ? `${parseFloat(multi.multi_unit_pct).toFixed(1)}%` : '--';
  if (sub) {
    sub.textContent = multi.multi_unit_incidents != null
      ? `${multi.multi_unit_incidents} of ${multi.total_incidents} incidents`
      : '3+ unit types';
  }
}

// --- Short-duration KPI ---

function renderShortDurationKPI(durData) {
  const el = document.getElementById('stn-kpi-short');
  const sub = document.getElementById('stn-kpi-short-sub');
  if (!el || !durData) return;

  const shortCnt = durData.buckets['0-5'] || 0;
  const total = durData.total || 0;
  const pct = total > 0 ? ((shortCnt / total) * 100).toFixed(1) : '--';
  el.textContent = pct !== '--' ? `${pct}%` : '--';
  if (sub) sub.textContent = `${shortCnt.toLocaleString()} of ${total.toLocaleString()} calls`;
}

// --- Station duration histogram ---

function renderStationDurationHist(durData) {
  const ctx = document.getElementById('chart-stn-duration');
  if (!ctx || !durData) return;

  const order = ['0-5', '5-15', '15-30', '30-60', '60-120', '120+'];
  const labels = order.map(b => b + ' min');
  const values = order.map(b => durData.buckets[b] || 0);
  const colors = ['#4ecdc4', '#3b82f6', '#ff6b35', '#ffcc00', '#ff9933', '#ff4444'];

  if (durationHistChart) durationHistChart.destroy();
  durationHistChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Incidents',
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x },
        y: { ...CHART_DEFAULTS.scales.y, beginAtZero: true },
      },
    },
  });
}

// --- Duration comparison (station vs city avg) ---

function renderDurationComparison(data) {
  const container = document.getElementById('stn-duration-compare');
  if (!container) return;

  const kpis = data.stationKpis || [];
  const currentYear = data.currentYear || new Date().getFullYear();
  const curr = kpis.find(r => r.dispatch_year === currentYear) || {};
  const stnDur = curr.median_duration != null ? parseFloat(curr.median_duration) : null;

  const allStations = data.allStationsYtd || [];
  const durs = allStations.map(r => parseFloat(r.median_duration)).filter(v => !isNaN(v));
  const cityAvg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null;

  if (stnDur == null || cityAvg == null) {
    container.innerHTML = '';
    return;
  }

  const diff = stnDur - cityAvg;
  const pctDiff = ((diff / cityAvg) * 100).toFixed(1);
  const cls = diff > 0 ? 'delta-up' : diff < 0 ? 'delta-down' : 'delta-flat';
  const sign = diff > 0 ? '+' : '';

  container.innerHTML = `
    <div class="duration-compare-bar">
      <div class="duration-label">Station: <strong>${stnDur.toFixed(1)} min</strong></div>
      <div class="duration-label">City Avg: <strong>${cityAvg.toFixed(1)} min</strong></div>
      <span class="delta-badge ${cls}">${sign}${pctDiff}%</span>
    </div>
  `;
}

// --- Equipment combos table ---

function renderEquipmentCombosTable(equipData) {
  const container = document.getElementById('stn-equipment-combos');
  if (!container) return;

  const combos = (equipData?.topCombos || []).slice(0, 10);
  if (!combos.length) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">No data</p>';
    return;
  }

  const maxCnt = parseInt(combos[0].cnt) || 1;
  let html = `<table class="ops-table"><thead><tr><th>#</th><th>Equipment Combination</th><th>Incidents</th></tr></thead><tbody>`;

  combos.forEach((row, i) => {
    const pct = ((parseInt(row.cnt) || 0) / maxCnt) * 100;
    html += `<tr><td>${i + 1}</td><td>${escapeHtml(row.equipment_assigned || '')}</td>
      <td class="bar-cell"><div class="inline-bar" style="width:${pct}%"></div><span class="bar-count">${formatNum(row.cnt)}</span></td></tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// --- All stations comparison table ---

function renderAllStationsTable(data, selectedStation) {
  const container = document.getElementById('station-compare-table');
  if (!container) return;

  const stations = data.allStationsYtd || [];
  if (!stations.length) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">No data</p>';
    return;
  }

  const sorted = [...stations].sort((a, b) => (parseInt(b.total_ytd) || 0) - (parseInt(a.total_ytd) || 0));

  // Compute median total for workload score
  const totals = sorted.map(row => parseInt(row.total_ytd) || 0);
  const sortedTotals = [...totals].sort((a, b) => a - b);
  const mid = Math.floor(sortedTotals.length / 2);
  const median = sortedTotals.length % 2 !== 0
    ? sortedTotals[mid]
    : (sortedTotals[mid - 1] + sortedTotals[mid]) / 2;
  const maxTotal = Math.max(...totals, 1);

  let html = `
    <table class="ops-table">
      <thead>
        <tr>
          <th>#</th><th>Station</th><th>Total YTD</th>
          <th>Structure</th><th>Outside</th><th>Alarms</th>
          <th>Avg Dur</th><th>Workload</th>
        </tr>
      </thead>
      <tbody>
  `;

  sorted.forEach((row, i) => {
    const stn = row.station_name || '';
    const highlighted = stn === selectedStation ? ' highlighted' : '';
    const total = parseInt(row.total_ytd) || 0;
    const structure = parseInt(row.structure_ytd) || 0;
    const outside = parseInt(row.outside_ytd) || 0;
    const alarms = parseInt(row.alarms_ytd) || 0;
    const dur = row.median_duration != null ? parseFloat(row.median_duration).toFixed(1) : '--';

    const workloadPct = median > 0 ? (total / median) * 100 : 0;
    let workloadClass, workloadLabel;
    if (workloadPct > 150) {
      workloadClass = 'workload-red';
      workloadLabel = 'Overloaded';
    } else if (workloadPct > 125) {
      workloadClass = 'workload-orange';
      workloadLabel = 'High';
    } else if (workloadPct < 75) {
      workloadClass = 'workload-green';
      workloadLabel = 'Low';
    } else {
      workloadClass = 'workload-neutral';
      workloadLabel = '';
    }
    const barWidth = (total / maxTotal) * 100;

    html += `
      <tr class="${highlighted}">
        <td>${i + 1}</td>
        <td>${escapeHtml(stn)}</td>
        <td>${formatNum(total)}</td>
        <td>${formatNum(structure)}</td>
        <td>${formatNum(outside)}</td>
        <td>${formatNum(alarms)}</td>
        <td>${dur}</td>
        <td class="workload-cell">
          <div class="workload-bar-track">
            <div class="workload-bar-fill ${workloadClass}" style="width:${barWidth}%"></div>
          </div>
          <span class="workload-pct ${workloadClass}">${workloadPct.toFixed(0)}%</span>
          ${workloadLabel ? `<span class="workload-label ${workloadClass}">${workloadLabel}</span>` : ''}
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// --- AI Station Analysis ---

function wireStationAI() {
  const panel = document.getElementById('stn-ai-section');
  if (!panel) return;

  const modeButtons = panel.querySelectorAll('.stn-ai-mode-btn');
  const queryInput = document.getElementById('stn-ai-query');
  const askBtn = document.getElementById('stn-ai-ask');
  const responseArea = document.getElementById('stn-ai-response');

  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const modeId = btn.dataset.mode;
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      runStationAnalysis(modeId, null, responseArea);
    });
  });

  askBtn?.addEventListener('click', () => {
    const query = queryInput.value.trim();
    if (query) {
      modeButtons.forEach(b => b.classList.remove('active'));
      runStationAnalysis('stn-query', query, responseArea);
    }
  });

  queryInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') askBtn?.click();
  });
}

function updateStationAIPanel(station) {
  const label = document.getElementById('stn-ai-station-label');
  if (label) label.textContent = `Station ${station}`;
}

const STN_LOADING_MESSAGES = {
  'stn-equipment': 'Analyzing equipment deployment patterns...',
  'stn-performance': 'Reviewing station performance metrics...',
  'stn-response': 'Analyzing response patterns...',
  'stn-query': 'Thinking about your question...',
};

function runStationAnalysis(modeId, userQuery, responseArea) {
  const loadMsg = STN_LOADING_MESSAGES[modeId] || 'Analyzing station data...';
  responseArea.innerHTML = `
    <div class="ai-loading">
      <div class="ai-loading-dots"><span></span><span></span><span></span></div>
      <span>${loadMsg}</span>
    </div>
  `;

  const prompt = buildStationPrompt(modeId, currentStationData, currentEquipData, currentStation, userQuery);
  if (!prompt) {
    responseArea.innerHTML = '<div class="ai-error">Could not build analysis prompt.</div>';
    return;
  }

  responseArea.innerHTML = '<div class="ai-response-content"></div>';
  const contentDiv = responseArea.querySelector('.ai-response-content');
  let fullText = '';

  streamAnalysis(
    getStationSystemPrompt(),
    prompt,
    (token) => {
      fullText += token;
      contentDiv.innerHTML = renderMarkdown(fullText) + '<span class="ai-cursor"></span>';
      responseArea.scrollTop = responseArea.scrollHeight;
    },
    () => {
      contentDiv.innerHTML = renderMarkdown(fullText);
      const copyBtn = document.createElement('button');
      copyBtn.className = 'ai-copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(fullText).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        });
      };
      responseArea.appendChild(copyBtn);
    },
    (err) => {
      if (fullText) {
        contentDiv.innerHTML = renderMarkdown(fullText);
      } else {
        responseArea.innerHTML = `<div class="ai-error">${escapeHtml(String(err))}</div>`;
      }
    }
  );
}

