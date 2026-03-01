// Operations tab — equipment utilization, duration analysis, response codes

import { fetchEquipmentAnalytics, fetchOperationalKPIs } from './api.js';
import {
  CHART_DEFAULTS, CHART_COLORS, DOUGHNUT_DEFAULTS, RESPONSE_CODE_LABELS, RESPONSE_CODE_COLORS,
  escapeHtml, formatNum, removeSkeleton, MONTH_LABELS,
} from './chart-utils.js';

let equipTypeChart = null;
let avgUnitsChart = null;
let durationHistChart = null;
let durationTrendChart = null;
let responseCodeChart = null;
let falseAlarmChart = null;

export async function initOperations(availableYears) {
  populateOpsYear(availableYears);
  wireOpsYearSelector();
  // Default to most recent full year
  const defaultYear = availableYears && availableYears.length > 1
    ? availableYears[availableYears.length - 2] : 2025;
  document.getElementById('ops-year').value = String(defaultYear);
  await loadOperationsData(defaultYear);
}

function populateOpsYear(years) {
  const select = document.getElementById('ops-year');
  if (!select || !years || !years.length) return;
  select.innerHTML = years.map(y =>
    `<option value="${y}">${y}</option>`
  ).join('');
}

function wireOpsYearSelector() {
  const select = document.getElementById('ops-year');
  if (!select) return;
  select.addEventListener('change', () => {
    loadOperationsData(parseInt(select.value));
  });
}

async function loadOperationsData(year) {
  try {
    const [opsData, equipData] = await Promise.all([
      fetchOperationalKPIs(year),
      fetchEquipmentAnalytics(year),
    ]);

    renderOpsKPIs(opsData, equipData);
    renderEquipmentTypeChart(equipData);
    renderAvgUnitsChart(equipData);
    renderCombosTable(equipData);
    renderDurationHistogram(opsData);
    renderDurationTrend(opsData);
    renderOutlierTable(opsData);
    renderResponseCodeChart(opsData);
    renderFalseAlarmChart(opsData);
    removeSkeleton('operations');
  } catch (err) {
    console.error('Operations data load failed:', err);
  }
}

// --- KPI cards ---

function renderOpsKPIs(opsData, equipData) {
  // durationStats: array of [{event_description, fire_class, cnt, avg_duration, median_duration, p90_duration, p95_duration}]
  // Compute weighted overall median and p90
  const durStats = opsData?.durationStats || [];
  let totalCnt = 0, weightedMedian = 0, weightedP90 = 0;
  for (const r of durStats) {
    const cnt = parseInt(r.cnt) || 0;
    totalCnt += cnt;
    weightedMedian += cnt * (parseFloat(r.median_duration) || 0);
    weightedP90 += cnt * (parseFloat(r.p90_duration) || 0);
  }
  const overallMedian = totalCnt > 0 ? (weightedMedian / totalCnt) : null;
  const overallP90 = totalCnt > 0 ? (weightedP90 / totalCnt) : null;

  const multi = equipData?.multiUnitFrequency || {};
  const falseRates = opsData?.falseAlarmRate || [];

  const medianEl = document.getElementById('ops-kpi-median');
  const p90El = document.getElementById('ops-kpi-p90');
  const multiEl = document.getElementById('ops-kpi-multi');
  const falseEl = document.getElementById('ops-kpi-false');

  if (medianEl) medianEl.textContent = overallMedian != null ? `${overallMedian.toFixed(1)}` : '--';
  if (p90El) p90El.textContent = overallP90 != null ? `${overallP90.toFixed(1)}` : '--';
  if (multiEl) multiEl.textContent = multi.multi_unit_pct != null ? `${parseFloat(multi.multi_unit_pct).toFixed(1)}%` : '--';

  // Latest false alarm rate (nf_pct)
  if (falseEl && falseRates.length) {
    const latest = falseRates[falseRates.length - 1];
    falseEl.textContent = latest?.nf_pct != null ? `${parseFloat(latest.nf_pct).toFixed(1)}%` : '--';
  }

  // Short-duration calls (<5 min)
  const shortEl = document.getElementById('ops-kpi-short');
  const shortSub = document.getElementById('ops-kpi-short-sub');
  if (shortEl) {
    const raw = opsData?.durationBuckets || [];
    let shortCnt = 0, bucketTotal = 0;
    for (const r of raw) {
      const cnt = parseInt(r.cnt) || 0;
      bucketTotal += cnt;
      if (r.duration_bucket === '0-5') shortCnt += cnt;
    }
    const pct = bucketTotal > 0 ? ((shortCnt / bucketTotal) * 100).toFixed(1) : '--';
    shortEl.textContent = pct !== '--' ? `${pct}%` : '--';
    if (shortSub) shortSub.textContent = `${shortCnt.toLocaleString()} of ${bucketTotal.toLocaleString()} calls`;
  }
}

// --- Equipment deployments by type (horizontal bar) ---

function renderEquipmentTypeChart(data) {
  const ctx = document.getElementById('chart-equipment-type');
  if (!ctx) return;

  // byUnitType: [{unit_type, incidents, units_deployed}]
  const items = (data?.byUnitType || []).slice(0, 15);
  const labels = items.map(r => r.unit_type || 'Unknown');
  const values = items.map(r => parseInt(r.units_deployed) || parseInt(r.incidents) || 0);

  if (equipTypeChart) equipTypeChart.destroy();
  equipTypeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Units Deployed',
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

// --- Avg units per incident by fire type ---

function renderAvgUnitsChart(data) {
  const ctx = document.getElementById('chart-avg-units');
  if (!ctx) return;

  // avgUnitsByType: [{event_description, fire_class, incident_count, avg_unit_types, avg_total_units}]
  const items = data?.avgUnitsByType || [];
  const labels = items.map(r => r.event_description || r.fire_class || 'Unknown');
  const values = items.map(r => parseFloat(r.avg_total_units) || parseFloat(r.avg_unit_types) || 0);

  if (avgUnitsChart) avgUnitsChart.destroy();
  avgUnitsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg Units per Incident',
        data: values,
        backgroundColor: ['#ff4444', '#ff9933', '#ffcc00', '#4ecdc4', '#a855f7'].slice(0, labels.length),
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

// --- Equipment combos table ---

function renderCombosTable(data) {
  const container = document.getElementById('equipment-combos-table');
  if (!container) return;

  // topCombos: [{equipment_assigned, cnt}]
  const combos = (data?.topCombos || []).slice(0, 15);
  if (!combos.length) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">No data</p>';
    return;
  }

  const maxCnt = parseInt(combos[0].cnt) || 1;
  let html = `
    <table class="ops-table">
      <thead><tr><th>#</th><th>Equipment Combination</th><th>Incidents</th></tr></thead>
      <tbody>
  `;

  combos.forEach((row, i) => {
    const pct = ((parseInt(row.cnt) || 0) / maxCnt) * 100;
    html += `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(row.equipment_assigned || '')}</td>
        <td class="bar-cell">
          <div class="inline-bar" style="width:${pct}%"></div>
          <span class="bar-count">${formatNum(row.cnt)}</span>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// --- Duration histogram ---

function renderDurationHistogram(data) {
  const ctx = document.getElementById('chart-duration-hist');
  if (!ctx) return;

  // durationBuckets: [{duration_bucket, event_description, fire_class, cnt, avg_duration, median_duration}]
  // Aggregate across event types by duration_bucket
  const raw = data?.durationBuckets || [];
  const bucketTotals = {};
  const bucketOrder = ['0-5', '5-15', '15-30', '30-60', '60-120', '120+'];
  for (const r of raw) {
    const b = r.duration_bucket;
    if (!bucketTotals[b]) bucketTotals[b] = 0;
    bucketTotals[b] += parseInt(r.cnt) || 0;
  }

  const labels = bucketOrder.filter(b => bucketTotals[b] != null);
  const values = labels.map(b => bucketTotals[b] || 0);

  if (durationHistChart) durationHistChart.destroy();
  durationHistChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(b => b + ' min'),
      datasets: [{
        label: 'Incidents',
        data: values,
        backgroundColor: ['#4ecdc4', '#3b82f6', '#ff6b35', '#ffcc00', '#ff9933', '#ff4444'].slice(0, labels.length),
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

// --- Duration trend by year ---

function renderDurationTrend(data) {
  const ctx = document.getElementById('chart-duration-trend');
  if (!ctx) return;

  // durationTrend: [{dispatch_year, avg_duration, median_duration, p90_duration}]
  const trend = data?.durationTrend || [];
  const labels = trend.map(r => String(r.dispatch_year));
  const avgData = trend.map(r => parseFloat(r.avg_duration) || 0);
  const medianData = trend.map(r => parseFloat(r.median_duration) || 0);

  if (durationTrendChart) durationTrendChart.destroy();
  durationTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Average',
          data: avgData,
          borderColor: '#ff6b35',
          backgroundColor: 'rgba(255, 107, 53, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          borderWidth: 2,
        },
        {
          label: 'Median',
          data: medianData,
          borderColor: '#4ecdc4',
          tension: 0.4,
          pointRadius: 3,
          borderWidth: 2,
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
        x: { ...CHART_DEFAULTS.scales.x },
        y: { ...CHART_DEFAULTS.scales.y, beginAtZero: true, title: { display: true, text: 'Minutes', color: '#7a8a9a' } },
      },
    },
  });
}

// --- Outlier table (60+ min incidents) ---

function renderOutlierTable(data) {
  const container = document.getElementById('outlier-table');
  if (!container) return;

  // outliers: [{event_number, event_description, fire_class, neighbourhood_name, event_duration_mins, equipment_assigned, dispatch_datetime, nearest_station, response_code}]
  const outliers = (data?.outliers || []).slice(0, 50);
  if (!outliers.length) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">No long-duration incidents found</p>';
    return;
  }

  let html = `
    <table class="ops-table">
      <thead>
        <tr>
          <th>Date</th><th>Type</th><th>Neighbourhood</th>
          <th>Duration</th><th>Equipment</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const row of outliers) {
    const date = row.dispatch_datetime ? new Date(row.dispatch_datetime).toLocaleDateString('en-CA') : '--';
    const dur = row.event_duration_mins != null ? `${parseFloat(row.event_duration_mins).toFixed(0)} min` : '--';
    const equip = row.equipment_assigned || '';
    html += `
      <tr>
        <td>${date}</td>
        <td>${escapeHtml(row.event_description || '')}</td>
        <td>${escapeHtml(row.neighbourhood_name || '')}</td>
        <td>${dur}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(equip)}">${escapeHtml(equip)}</td>
      </tr>
    `;
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

// --- Response code doughnut ---

function renderResponseCodeChart(data) {
  const ctx = document.getElementById('chart-response-codes');
  if (!ctx) return;

  // Use responseCodeTotals (aggregated) instead of responseCodes (per-type breakdown)
  const codes = data?.responseCodeTotals || data?.responseCodes || [];
  const labels = codes.map(r => RESPONSE_CODE_LABELS[r.response_code] || r.response_code || 'Unknown');
  const values = codes.map(r => parseInt(r.cnt) || 0);
  const colors = codes.map(r => RESPONSE_CODE_COLORS[r.response_code] || '#5a6a7a');

  if (responseCodeChart) responseCodeChart.destroy();
  responseCodeChart = new Chart(ctx, {
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

// --- False alarm rate by year ---

function renderFalseAlarmChart(data) {
  const ctx = document.getElementById('chart-false-alarm');
  if (!ctx) return;

  // falseAlarmRate: [{dispatch_year, nf_alarms, total_alarms, nf_pct}]
  const rates = (data?.falseAlarmRate || []).filter(r => r.nf_pct != null);
  const labels = rates.map(r => String(r.dispatch_year));
  const values = rates.map(r => parseFloat(r.nf_pct) || 0);

  if (falseAlarmChart) falseAlarmChart.destroy();
  falseAlarmChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'No-Fire Rate (%)',
        data: values,
        borderColor: '#ffcc00',
        backgroundColor: 'rgba(255, 204, 0, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        borderWidth: 2,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x },
        y: { ...CHART_DEFAULTS.scales.y, beginAtZero: true, title: { display: true, text: '%', color: '#7a8a9a' } },
      },
    },
  });
}
