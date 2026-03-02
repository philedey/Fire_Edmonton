// Trends tab — YTD pace tracking, seasonal patterns, long-term growth

import { fetchOperationalKPIs } from './api.js';
import {
  CHART_DEFAULTS, CHART_COLORS, escapeHtml, deltaBadge, formatNum,
  removeSkeleton, MONTH_LABELS,
} from './chart-utils.js';
import {
  fetchDailyWeather, computeDailyFireCounts,
  pearsonCorrelation, buildWeatherFireScatter,
} from './weather.js';

let ytdPaceChart = null;
let seasonalChart = null;
let outsideSeasonalChart = null;
let growthChart = null;
let weatherScatterChart = null;
let weatherMonthlyChart = null;
let _trendsMapGeojson = null;

export function setMapGeojsonForTrends(geojson) {
  _trendsMapGeojson = geojson;
  // If trends tab already loaded, trigger weather rendering
  if (geojson) loadWeatherCorrelation();
}

export async function initTrends(baselineStats, baselineExtraCharts) {
  try {
    const opsData = await fetchOperationalKPIs();

    renderYTDKPIs(opsData);
    renderYTDPaceChart(opsData);
    renderMonthlyTable(opsData);
    renderSeasonalCharts(baselineExtraCharts);
    renderGrowthChart(baselineStats);
    renderGrowthTable(baselineStats);
    removeSkeleton('trends');
  } catch (err) {
    console.error('Trends data load failed:', err);
  }
}

// --- YTD KPI cards ---

function renderYTDKPIs(data) {
  // ytdComparison: [{dispatch_year, dispatch_month, total, structure_fires, outside_fires, alarms, avg_duration, median_duration}]
  const ytd = data?.ytdComparison || [];
  const currentYear = new Date().getFullYear();
  const priorYear = currentYear - 1;

  // Sum up YTD by year (weighted median for duration)
  const yearTotals = {};
  for (const row of ytd) {
    const y = parseInt(row.dispatch_year);
    if (!yearTotals[y]) yearTotals[y] = { total: 0, structure: 0, outside: 0, alarms: 0, durSum: 0, durCnt: 0 };
    const total = parseInt(row.total) || 0;
    yearTotals[y].total += total;
    yearTotals[y].structure += parseInt(row.structure_fires) || 0;
    yearTotals[y].outside += parseInt(row.outside_fires) || 0;
    yearTotals[y].alarms += parseInt(row.alarms) || 0;
    const dur = row.median_duration ?? row.avg_duration;
    if (dur != null && total > 0) {
      yearTotals[y].durSum += parseFloat(dur) * total;
      yearTotals[y].durCnt += total;
    }
  }

  const curr = yearTotals[currentYear] || {};
  const prev = yearTotals[priorYear] || {};

  setYTDKPI('ytd-kpi-total', curr.total, prev.total);
  setYTDKPI('ytd-kpi-structure', curr.structure, prev.structure);
  setYTDKPI('ytd-kpi-outside', curr.outside, prev.outside);
  setYTDKPI('ytd-kpi-alarms', curr.alarms, prev.alarms);

  // Median event duration KPI
  const durEl = document.getElementById('ytd-kpi-duration');
  const durSub = document.getElementById('ytd-kpi-duration-sub');
  if (durEl) {
    const currDur = curr.durCnt > 0 ? (curr.durSum / curr.durCnt) : null;
    const prevDur = prev.durCnt > 0 ? (prev.durSum / prev.durCnt) : null;
    durEl.textContent = currDur != null ? `${currDur.toFixed(1)} min` : '--';
    if (durSub && currDur != null && prevDur != null) {
      durSub.innerHTML = `vs ${prevDur.toFixed(1)} min last year ${deltaBadge(currDur, prevDur)}`;
    }
  }
}

function setYTDKPI(id, current, prior) {
  const el = document.getElementById(id);
  const sub = document.getElementById(`${id}-sub`);
  if (el) el.textContent = formatNum(current);
  if (sub && current != null && prior != null) {
    sub.innerHTML = `vs ${formatNum(prior)} last year ${deltaBadge(current, prior)}`;
  }
}

// --- YTD pace chart (last 3 years, monthly) ---

function renderYTDPaceChart(data) {
  const ctx = document.getElementById('chart-ytd-pace');
  if (!ctx) return;

  // ytdComparison: [{dispatch_year, dispatch_month, total, ...}]
  const ytd = data?.ytdComparison || [];
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear];
  const yearColors = ['#7a8a9a', '#4ecdc4', '#ff6b35'];

  // Build monthly data per year
  const yearData = {};
  for (const y of years) yearData[y] = Array(12).fill(0);
  for (const row of ytd) {
    const y = parseInt(row.dispatch_year);
    const m = parseInt(row.dispatch_month) - 1;
    if (yearData[y] && m >= 0 && m < 12) {
      yearData[y][m] = parseInt(row.total) || 0;
    }
  }

  const datasets = years.map((y, i) => ({
    label: String(y),
    data: yearData[y],
    borderColor: yearColors[i],
    backgroundColor: i === 2 ? 'rgba(255, 107, 53, 0.1)' : 'transparent',
    fill: i === 2,
    tension: 0.4,
    pointRadius: 3,
    borderWidth: i === 2 ? 2.5 : 1.5,
    borderDash: i === 0 ? [4, 4] : [],
  }));

  if (ytdPaceChart) ytdPaceChart.destroy();
  ytdPaceChart = new Chart(ctx, {
    type: 'line',
    data: { labels: MONTH_LABELS, datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x },
        y: { ...CHART_DEFAULTS.scales.y, beginAtZero: true },
      },
    },
  });
}

// --- Monthly comparison table ---

function renderMonthlyTable(data) {
  const container = document.getElementById('ytd-monthly-table');
  if (!container) return;

  const ytd = data?.ytdComparison || [];
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear];

  // Build monthly totals
  const monthData = {};
  for (const y of years) monthData[y] = Array(12).fill(0);
  for (const row of ytd) {
    const y = parseInt(row.dispatch_year);
    const m = parseInt(row.dispatch_month) - 1;
    if (monthData[y] && m >= 0 && m < 12) {
      monthData[y][m] = parseInt(row.total) || 0;
    }
  }

  let html = `
    <table class="ops-table">
      <thead>
        <tr>
          <th>Month</th>
          ${years.map(y => `<th>${y}</th>`).join('')}
          <th>YoY Delta</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (let m = 0; m < 12; m++) {
    const curr = monthData[currentYear][m];
    const prev = monthData[currentYear - 1][m];
    const hasData = curr > 0 || prev > 0;
    if (!hasData && m > new Date().getMonth()) continue; // Skip future months

    html += `<tr>
      <td>${MONTH_LABELS[m]}</td>
      ${years.map(y => `<td>${monthData[y][m] ? formatNum(monthData[y][m]) : '--'}</td>`).join('')}
      <td>${prev > 0 ? deltaBadge(curr, prev) : '--'}</td>
    </tr>`;
  }

  // Totals row
  const totals = years.map(y => monthData[y].reduce((a, b) => a + b, 0));
  html += `<tr style="font-weight:600;border-top:2px solid var(--border)">
    <td>Total</td>
    ${totals.map(t => `<td>${formatNum(t)}</td>`).join('')}
    <td>${totals[1] > 0 ? deltaBadge(totals[2], totals[1]) : '--'}</td>
  </tr>`;

  html += '</tbody></table>';
  container.innerHTML = html;
}

// --- Seasonal charts ---

function renderSeasonalCharts(extraCharts) {
  renderSeasonalIndex(extraCharts);
  renderOutsideSeasonality(extraCharts);
}

function renderSeasonalIndex(extraCharts) {
  const ctx = document.getElementById('chart-seasonal');
  if (!ctx) return;

  const yearlyMonthly = extraCharts?.yearlyMonthly || [];

  // Compute average per month across years
  const monthTotals = Array(12).fill(0);
  const monthCounts = Array(12).fill(0);

  for (const row of yearlyMonthly) {
    const m = parseInt(row.dispatch_month) - 1;
    const cnt = parseInt(row.cnt) || 0;
    if (m >= 0 && m < 12) {
      monthTotals[m] += cnt;
      monthCounts[m]++;
    }
  }

  const monthAvgs = monthTotals.map((t, i) => monthCounts[i] > 0 ? t / monthCounts[i] : 0);
  const overallAvg = monthAvgs.reduce((a, b) => a + b, 0) / 12;
  const seasonalIndex = monthAvgs.map(v => overallAvg > 0 ? (v / overallAvg * 100).toFixed(1) : 100);

  if (seasonalChart) seasonalChart.destroy();
  seasonalChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MONTH_LABELS,
      datasets: [{
        label: 'Seasonal Index',
        data: seasonalIndex,
        backgroundColor: seasonalIndex.map(v =>
          v > 110 ? '#ff6b35' : v < 90 ? '#3b82f6' : '#4ecdc4'
        ),
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
      },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x },
        y: { ...CHART_DEFAULTS.scales.y, title: { display: true, text: 'Index (100 = avg)', color: '#7a8a9a' } },
      },
    },
  });
}

function renderOutsideSeasonality(extraCharts) {
  const ctx = document.getElementById('chart-outside-seasonal');
  if (!ctx) return;

  const yearlyMonthly = extraCharts?.yearlyMonthly || [];
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear];
  const yearColors = ['#7a8a9a', '#4ecdc4', '#ff9933'];

  const monthByYear = {};
  for (const y of years) monthByYear[y] = Array(12).fill(0);
  for (const row of yearlyMonthly) {
    const y = parseInt(row.dispatch_year);
    const m = parseInt(row.dispatch_month) - 1;
    if (monthByYear[y] && m >= 0 && m < 12) {
      monthByYear[y][m] = parseInt(row.cnt) || 0;
    }
  }

  const datasets = years.map((y, i) => ({
    label: String(y),
    data: monthByYear[y],
    borderColor: yearColors[i],
    tension: 0.4,
    pointRadius: 2,
    borderWidth: i === 2 ? 2.5 : 1.5,
    borderDash: i === 0 ? [4, 4] : [],
    fill: false,
  }));

  if (outsideSeasonalChart) outsideSeasonalChart.destroy();
  outsideSeasonalChart = new Chart(ctx, {
    type: 'line',
    data: { labels: MONTH_LABELS, datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x },
        y: { ...CHART_DEFAULTS.scales.y, beginAtZero: true },
      },
    },
  });
}

// --- Growth charts ---

function renderGrowthChart(stats) {
  const ctx = document.getElementById('chart-growth');
  if (!ctx) return;

  if (!stats || !stats.years || !stats.yearlyData) return;

  const years = stats.years;
  const totals = years.map(y => {
    const d = stats.yearlyData[y] || {};
    return (d.structure || 0) + (d.outside || 0) + (d.other || 0);
  });

  // Compute trend line (linear regression)
  const n = years.length;
  const xMean = years.reduce((a, b) => a + b, 0) / n;
  const yMean = totals.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (years[i] - xMean) * (totals[i] - yMean);
    den += (years[i] - xMean) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  const trendLine = years.map(y => Math.round(slope * y + intercept));

  if (growthChart) growthChart.destroy();
  growthChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years.map(String),
      datasets: [
        {
          label: 'Total Incidents',
          data: totals,
          borderColor: '#ff6b35',
          backgroundColor: 'rgba(255, 107, 53, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          borderWidth: 2,
        },
        {
          label: 'Trend',
          data: trendLine,
          borderColor: '#7a8a9a',
          borderDash: [6, 4],
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
        x: { ...CHART_DEFAULTS.scales.x },
        y: { ...CHART_DEFAULTS.scales.y, beginAtZero: false },
      },
    },
  });
}

// --- Growth rate table ---

function renderGrowthTable(stats) {
  const container = document.getElementById('growth-rate-table');
  if (!container || !stats || !stats.years || !stats.yearlyData) return;

  const years = stats.years;
  if (years.length < 2) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">Not enough data</p>';
    return;
  }

  const types = ['structure', 'outside', 'other'];
  const typeLabels = { structure: 'Structure Fires', outside: 'Outside Fires', other: 'Alarms' };
  const typeColors = { structure: '#ff4444', outside: '#ff9933', other: '#ffcc00' };

  const firstYear = years[0];
  const lastYear = years[years.length - 1];
  const nYears = lastYear - firstYear;

  let html = `
    <table class="ops-table">
      <thead>
        <tr>
          <th>Type</th><th>${firstYear}</th><th>${lastYear}</th>
          <th>Change</th><th>CAGR</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const type of types) {
    const first = stats.yearlyData[firstYear]?.[type] || 0;
    const last = stats.yearlyData[lastYear]?.[type] || 0;
    const change = first > 0 ? ((last - first) / first * 100).toFixed(1) : '--';
    const cagr = first > 0 && nYears > 0
      ? ((Math.pow(last / first, 1 / nYears) - 1) * 100).toFixed(1)
      : '--';

    html += `
      <tr>
        <td><span style="color:${typeColors[type]}">&#9679;</span> ${typeLabels[type]}</td>
        <td>${formatNum(first)}</td>
        <td>${formatNum(last)}</td>
        <td>${change !== '--' ? deltaBadge(last, first) : '--'}</td>
        <td>${cagr !== '--' ? `${cagr}%/yr` : '--'}</td>
      </tr>
    `;
  }

  // Total row
  const totalFirst = types.reduce((s, t) => s + (stats.yearlyData[firstYear]?.[t] || 0), 0);
  const totalLast = types.reduce((s, t) => s + (stats.yearlyData[lastYear]?.[t] || 0), 0);
  const totalCagr = totalFirst > 0 && nYears > 0
    ? ((Math.pow(totalLast / totalFirst, 1 / nYears) - 1) * 100).toFixed(1) : '--';

  html += `
    <tr style="font-weight:600;border-top:2px solid var(--border)">
      <td>Total</td>
      <td>${formatNum(totalFirst)}</td>
      <td>${formatNum(totalLast)}</td>
      <td>${deltaBadge(totalLast, totalFirst)}</td>
      <td>${totalCagr !== '--' ? `${totalCagr}%/yr` : '--'}</td>
    </tr>
  `;

  html += '</tbody></table>';
  container.innerHTML = html;
}

// --- Weather correlation ---

async function loadWeatherCorrelation() {
  if (!_trendsMapGeojson) return;

  try {
    const dailyWeather = await fetchDailyWeather(2011, 2025);
    const dailyFires = computeDailyFireCounts(_trendsMapGeojson, 'outside');

    const scatter = buildWeatherFireScatter(dailyWeather, dailyFires, 'maxTemp');
    renderWeatherKPIs(scatter);
    renderWeatherScatter(scatter);
    renderWeatherMonthly(dailyWeather, dailyFires);
  } catch (err) {
    console.warn('Weather correlation load failed:', err);
  }
}

function renderWeatherKPIs(scatter) {
  const rEl = document.getElementById('weather-corr-r');
  const rSub = document.getElementById('weather-corr-sub');
  const nEl = document.getElementById('weather-corr-n');
  const peakEl = document.getElementById('weather-peak-temp');
  const peakSub = document.getElementById('weather-peak-sub');

  if (rEl) {
    const r = scatter.correlation.r;
    rEl.textContent = r.toFixed(3);
    if (rSub) {
      const strength = Math.abs(r) > 0.5 ? 'Strong' : Math.abs(r) > 0.3 ? 'Moderate' : 'Weak';
      const dir = r > 0 ? 'positive' : 'negative';
      rSub.textContent = `${strength} ${dir} correlation`;
    }
  }

  if (nEl) nEl.textContent = scatter.correlation.n.toLocaleString();

  if (peakEl && scatter.points.length) {
    const bins = {};
    for (const p of scatter.points) {
      const bin = Math.floor(p.x / 5) * 5;
      const key = `${bin} to ${bin + 5}`;
      bins[key] = (bins[key] || 0) + p.y;
    }
    const peak = Object.entries(bins).sort((a, b) => b[1] - a[1])[0];
    if (peak) {
      peakEl.textContent = `${peak[0]}°C`;
      if (peakSub) peakSub.textContent = `${peak[1].toLocaleString()} outside fires in range`;
    }
  }

  document.querySelectorAll('#weather-corr-r, #weather-corr-n, #weather-peak-temp')
    .forEach(el => {
      const card = el.closest('.kpi-card');
      if (card) card.classList.remove('skeleton');
    });
}

function renderWeatherScatter(scatter) {
  const ctx = document.getElementById('chart-weather-scatter');
  if (!ctx || !scatter.points.length) return;

  const scatterData = scatter.points.map(p => ({ x: p.x, y: p.y }));
  const trendData = scatter.trendLine;

  if (weatherScatterChart) weatherScatterChart.destroy();
  weatherScatterChart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Daily Observations',
          data: scatterData,
          backgroundColor: 'rgba(255, 153, 51, 0.3)',
          borderColor: 'rgba(255, 153, 51, 0.6)',
          pointRadius: 2,
          pointHoverRadius: 5,
        },
        {
          label: `Trend (r=${scatter.correlation.r.toFixed(2)})`,
          data: trendData,
          type: 'line',
          borderColor: '#ff6b35',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          callbacks: {
            label: (tooltipCtx) => {
              const p = tooltipCtx.raw;
              return `${p.x.toFixed(1)}°C — ${p.y} fires`;
            },
          },
        },
      },
      scales: {
        x: {
          ...CHART_DEFAULTS.scales.x,
          title: { display: true, text: 'Max Daily Temperature (°C)', color: '#7a8a9a' },
        },
        y: {
          ...CHART_DEFAULTS.scales.y,
          beginAtZero: true,
          title: { display: true, text: 'Outside Fires', color: '#7a8a9a' },
        },
      },
    },
  });

  ctx.closest('.chart-card')?.classList.remove('skeleton');
}

function renderWeatherMonthly(dailyWeather, dailyFires) {
  const ctx = document.getElementById('chart-weather-monthly');
  if (!ctx) return;

  const monthTemp = Array(12).fill(null).map(() => []);
  const monthFires = Array(12).fill(0);

  for (const [day, weather] of Object.entries(dailyWeather)) {
    const m = parseInt(day.substring(5, 7)) - 1;
    if (m >= 0 && m < 12 && weather.avgTemp != null) {
      monthTemp[m].push(weather.avgTemp);
    }
  }

  for (const [day, count] of Object.entries(dailyFires)) {
    const m = parseInt(day.substring(5, 7)) - 1;
    if (m >= 0 && m < 12) monthFires[m] += count;
  }

  const avgTemps = monthTemp.map(arr =>
    arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null
  );

  if (weatherMonthlyChart) weatherMonthlyChart.destroy();
  weatherMonthlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MONTH_LABELS,
      datasets: [
        {
          label: 'Outside Fires',
          data: monthFires,
          backgroundColor: 'rgba(255, 153, 51, 0.6)',
          borderColor: '#ff9933',
          borderWidth: 1,
          borderRadius: 3,
          yAxisID: 'y',
        },
        {
          label: 'Avg Temperature (°C)',
          data: avgTemps,
          type: 'line',
          borderColor: '#4ecdc4',
          backgroundColor: 'rgba(78, 205, 196, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          borderWidth: 2,
          yAxisID: 'y1',
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
        y: {
          ...CHART_DEFAULTS.scales.y,
          beginAtZero: true,
          position: 'left',
          title: { display: true, text: 'Outside Fires', color: '#7a8a9a' },
        },
        y1: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#4ecdc4', font: { size: 10 } },
          title: { display: true, text: 'Temperature (°C)', color: '#4ecdc4' },
        },
      },
    },
  });

  ctx.closest('.chart-card')?.classList.remove('skeleton');
}
