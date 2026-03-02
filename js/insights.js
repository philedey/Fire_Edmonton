// Insights tab — resource allocation recommendations, workload analysis, prevention priorities

import { fetchStationComparison, fetchStationData } from './api.js';
import {
  CHART_DEFAULTS, CHART_COLORS,
  escapeHtml, formatNum, removeSkeleton, MONTH_LABELS,
} from './chart-utils.js';
import { EFRS_BENCHMARKS } from './efrs-benchmarks.js';
import { getStationResource, getApparatusCount, getSpecialty } from './station-resources.js';

let workloadChart = null;
let alarmChart = null;
let monthlyChart = null;
let hourlyChart = null;
let riskChart = null;
let peerFundingChart = null;

export async function initInsights(baselineStats, baselineExtraCharts, stationData, mapGeojson) {
  try {
    // Fetch station comparison data (all stations, no filter)
    const comparisonData = await fetchStationComparison(null);

    // If stationData not yet loaded, fetch it
    if (!stationData) {
      stationData = await fetchStationData();
    }

    // Compute derived metrics
    const workload = computeWorkloadAnalysis(comparisonData);
    const alarmBurden = computeAlarmBurden(comparisonData);
    const seasonal = computeSeasonalProfile(baselineExtraCharts);
    const risk = computeRiskScores(baselineStats, baselineExtraCharts, mapGeojson);

    // Render KPIs
    renderInsightsKPIs(workload, alarmBurden, seasonal, risk);

    // Render sections
    renderWorkloadChart(workload);
    renderWorkloadTable(workload);
    renderAlarmChart(alarmBurden);
    renderAlarmTable(alarmBurden);
    renderMonthlyDemandChart(seasonal);
    renderHourlyChart(baselineExtraCharts);
    renderRiskChart(risk);
    renderRiskTable(risk);
    renderPeerCityComparison();
    renderPeerCityTable();

    removeSkeleton('insights');
  } catch (err) {
    console.error('Insights tab load failed:', err);
  }
}

// === Computation Functions ===

function computeWorkloadAnalysis(comparisonData) {
  const stations = comparisonData?.allStationsYtd || [];
  const totals = stations.map(r => parseInt(r.total_ytd) || 0);
  const sorted = [...totals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
  const mean = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const variance = totals.length
    ? totals.reduce((s, v) => s + (v - mean) ** 2, 0) / totals.length : 0;
  const stddev = Math.sqrt(variance);
  const cv = mean > 0 ? (stddev / mean) * 100 : 0;

  const stationList = [...stations]
    .sort((a, b) => (parseInt(b.total_ytd) || 0) - (parseInt(a.total_ytd) || 0))
    .map(r => {
      const total = parseInt(r.total_ytd) || 0;
      const pctOfMedian = median > 0 ? (total / median) * 100 : 0;
      return {
        name: r.station_name,
        total,
        structure: parseInt(r.structure_ytd) || 0,
        outside: parseInt(r.outside_ytd) || 0,
        alarms: parseInt(r.alarms_ytd) || 0,
        avgDuration: r.median_duration != null ? parseFloat(r.median_duration) : (r.avg_duration != null ? parseFloat(r.avg_duration) : null),
        pctOfMedian,
        status: getWorkloadStatus(pctOfMedian),
      };
    });

  return {
    stations: stationList,
    median,
    mean,
    cv,
    overloadedCount: stationList.filter(s => s.pctOfMedian > 150).length,
    underutilizedCount: stationList.filter(s => s.pctOfMedian < 75).length,
  };
}

function computeAlarmBurden(comparisonData) {
  const stations = comparisonData?.allStationsYtd || [];
  const rates = stations.map(r => {
    const total = parseInt(r.total_ytd) || 0;
    const alarms = parseInt(r.alarms_ytd) || 0;
    const alarmPct = total > 0 ? (alarms / total) * 100 : 0;
    return {
      station: r.station_name,
      total,
      alarms,
      alarmPct,
      fires: total - alarms,
    };
  }).sort((a, b) => b.alarmPct - a.alarmPct);

  const totalAlarms = rates.reduce((s, r) => s + r.alarms, 0);
  const costPerAlarm = 1500;
  return {
    stationRates: rates,
    top10: rates.slice(0, 10),
    totalAlarms,
    estCost: totalAlarms * costPerAlarm,
    costPerAlarm,
  };
}

function computeSeasonalProfile(extraCharts) {
  const yearlyMonthly = extraCharts?.yearlyMonthly || [];

  // Average per month across years
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

  const monthlyDemand = monthTotals.map((t, i) => monthCounts[i] > 0 ? t / monthCounts[i] : 0);
  const flatLevel = monthlyDemand.reduce((a, b) => a + b, 0) / 12;

  const peak = Math.max(...monthlyDemand);
  const trough = Math.min(...monthlyDemand.filter(v => v > 0));
  const peakMonth = monthlyDemand.indexOf(peak);
  const troughMonth = monthlyDemand.indexOf(trough);
  const peakTroughRatio = trough > 0 ? peak / trough : 0;

  return {
    monthlyDemand,
    flatLevel,
    peak,
    trough,
    peakMonth,
    troughMonth,
    peakTroughRatio,
  };
}

function computeRiskScores(baselineStats, extraCharts, mapGeojson) {
  const ranking = baselineStats?.neighbourhoodRanking || [];
  if (!ranking.length) return { neighbourhoods: [], topTarget: 'N/A' };

  const maxCount = ranking[0]?.[1] || 1;

  // Sparkline data for trends
  const sparklines = extraCharts?.sparklines || [];
  const sparkMap = {};
  for (const row of sparklines) {
    const name = row.neighbourhood_name;
    const year = parseInt(row.dispatch_year);
    const cnt = parseInt(row.cnt) || 0;
    if (!name || isNaN(year)) continue;
    if (!sparkMap[name]) sparkMap[name] = {};
    sparkMap[name][year] = cnt;
  }

  // Fire type per neighbourhood from map GeoJSON
  const fireTypes = {};
  if (mapGeojson?.features) {
    for (const f of mapGeojson.features) {
      const name = f.properties.neighbourhood;
      const cls = f.properties.fireClass;
      if (!name || !cls) continue;
      if (!fireTypes[name]) fireTypes[name] = { structure: 0, outside: 0 };
      if (cls === 'structure') fireTypes[name].structure++;
      else if (cls === 'outside') fireTypes[name].outside++;
    }
  }

  const neighbourhoods = ranking.slice(0, 25).map(([name, count]) => {
    // Volume score (0-100)
    const volumeScore = (count / maxCount) * 100;

    // Trend score (0-100) via linear regression on last 5 years
    const yearData = sparkMap[name] || {};
    const years = Object.keys(yearData).map(Number).sort();
    const recent = years.slice(-5);
    let trendScore = 50;
    let trendDirection = 'stable';
    if (recent.length >= 2) {
      const values = recent.map(y => yearData[y] || 0);
      const n = values.length;
      const xMean = (n - 1) / 2;
      const yMean = values.reduce((a, b) => a + b, 0) / n;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        num += (i - xMean) * (values[i] - yMean);
        den += (i - xMean) ** 2;
      }
      const slope = den !== 0 ? num / den : 0;
      const growthRate = yMean > 0 ? slope / yMean : 0;
      trendScore = Math.max(0, Math.min(100, 50 + growthRate * 250));
      trendDirection = growthRate > 0.03 ? 'up' : growthRate < -0.03 ? 'down' : 'stable';
    }

    // Severity score (0-100) based on structure fire ratio
    const ft = fireTypes[name] || { structure: 0, outside: 0 };
    const fireTotal = ft.structure + ft.outside;
    let severityScore = 30;
    if (fireTotal > 0) {
      const structPct = ft.structure / fireTotal;
      severityScore = structPct * 100;
    }

    const riskScore = volumeScore * 0.4 + trendScore * 0.3 + severityScore * 0.3;

    return {
      name,
      totalCount: count,
      structureCount: ft.structure,
      structurePct: fireTotal > 0 ? ((ft.structure / fireTotal) * 100).toFixed(1) : '--',
      volumeScore: volumeScore.toFixed(1),
      trendScore: trendScore.toFixed(1),
      severityScore: severityScore.toFixed(1),
      riskScore: riskScore.toFixed(1),
      riskTier: getRiskTier(riskScore),
      trendDirection,
      yearlyData: yearData,
    };
  }).sort((a, b) => parseFloat(b.riskScore) - parseFloat(a.riskScore));

  return {
    neighbourhoods,
    topTarget: neighbourhoods[0]?.name || 'N/A',
  };
}

// === Rendering Functions ===

function renderInsightsKPIs(workload, alarmBurden, seasonal, risk) {
  const alarmCostEl = document.getElementById('ins-kpi-alarm-cost');
  const alarmCostSub = document.getElementById('ins-kpi-alarm-cost-sub');
  if (alarmCostEl) {
    const cost = alarmBurden.estCost;
    alarmCostEl.textContent = cost >= 1000000
      ? `$${(cost / 1000000).toFixed(1)}M`
      : `$${(cost / 1000).toFixed(0)}K`;
    if (alarmCostSub) alarmCostSub.textContent = `${formatNum(alarmBurden.totalAlarms)} alarm responses @ $${alarmBurden.costPerAlarm}/ea (est.)`;
  }

  const imbalanceEl = document.getElementById('ins-kpi-imbalance');
  const imbalanceSub = document.getElementById('ins-kpi-imbalance-sub');
  if (imbalanceEl) {
    imbalanceEl.textContent = `${workload.cv.toFixed(1)}%`;
    if (imbalanceSub) imbalanceSub.textContent = workload.cv > 40 ? 'High imbalance' : 'Moderate spread';
  }

  const preventionEl = document.getElementById('ins-kpi-prevention');
  const preventionSub = document.getElementById('ins-kpi-prevention-sub');
  if (preventionEl) {
    preventionEl.textContent = risk.topTarget;
    if (preventionSub) preventionSub.textContent = risk.neighbourhoods[0]
      ? `Risk score: ${risk.neighbourhoods[0].riskScore}`
      : '';
  }

  const seasonalEl = document.getElementById('ins-kpi-seasonal');
  const seasonalSub = document.getElementById('ins-kpi-seasonal-sub');
  if (seasonalEl) {
    seasonalEl.textContent = seasonal.peakTroughRatio > 0
      ? `${seasonal.peakTroughRatio.toFixed(1)}x`
      : '--';
    if (seasonalSub) seasonalSub.textContent = `${MONTH_LABELS[seasonal.peakMonth]} peak / ${MONTH_LABELS[seasonal.troughMonth]} trough`;
  }

  // Median event duration (city-wide from station medians)
  const durEl = document.getElementById('ins-kpi-duration');
  const durSub = document.getElementById('ins-kpi-duration-sub');
  if (durEl) {
    const durs = workload.stations.map(s => s.avgDuration).filter(v => v != null);
    if (durs.length) {
      const cityMed = durs.reduce((a, b) => a + b, 0) / durs.length;
      const fastest = Math.min(...durs);
      const slowest = Math.max(...durs);
      durEl.textContent = `${cityMed.toFixed(1)} min`;
      if (durSub) durSub.textContent = `range: ${fastest.toFixed(1)} – ${slowest.toFixed(1)} min`;
    }
  }

  const overloadedEl = document.getElementById('ins-kpi-overloaded');
  const overloadedSub = document.getElementById('ins-kpi-overloaded-sub');
  if (overloadedEl) {
    overloadedEl.textContent = `${workload.overloadedCount} of 31`;
    if (overloadedSub) overloadedSub.textContent = `${workload.underutilizedCount} underutilized (<75%)`;
  }
}

function renderWorkloadChart(workload) {
  const ctx = document.getElementById('chart-ins-workload');
  if (!ctx) return;

  const stations = workload.stations;
  const labels = stations.map(s => `Stn ${s.name}`);
  const values = stations.map(s => s.pctOfMedian);
  const colors = stations.map(s => {
    if (s.pctOfMedian > 150) return '#ff4444';
    if (s.pctOfMedian > 125) return '#ff9933';
    if (s.pctOfMedian < 75) return '#4ecdc4';
    return '#5a6a7a';
  });

  if (workloadChart) workloadChart.destroy();
  workloadChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '% of Median',
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: 'y',
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.x.toFixed(0)}% of median workload`,
          },
        },
      },
      scales: {
        x: {
          ...CHART_DEFAULTS.scales.x,
          beginAtZero: true,
          title: { display: true, text: '% of Median', color: '#7a8a9a' },
        },
        y: {
          ...CHART_DEFAULTS.scales.y,
          ticks: { ...CHART_DEFAULTS.scales.y.ticks, font: { size: 10 } },
        },
      },
    },
  });
}

function renderWorkloadTable(workload) {
  const container = document.getElementById('ins-workload-table');
  if (!container) return;

  let html = `<table class="ops-table"><thead><tr>
    <th>#</th><th>Station</th><th>Calls</th><th>% Median</th><th>Status</th><th>Med Dur</th><th>Specialty</th>
  </tr></thead><tbody>`;

  workload.stations.forEach((s, i) => {
    const statusCls = s.status === 'Overloaded' ? 'ins-overloaded'
      : s.status === 'High' ? 'ins-above'
      : s.status === 'Low' ? 'ins-under'
      : 'ins-balanced';
    const dur = s.avgDuration != null ? `${s.avgDuration.toFixed(1)}` : '--';
    const res = getStationResource(s.name);
    const specialty = getSpecialty(res);
    const specialtyHtml = specialty ? `<span class="stn-specialty-badge">${specialty}</span>` : '';

    html += `<tr>
      <td>${i + 1}</td>
      <td>Stn ${escapeHtml(s.name)}</td>
      <td>${formatNum(s.total)}</td>
      <td>${s.pctOfMedian.toFixed(0)}%</td>
      <td><span class="ins-status ${statusCls}">${s.status}</span></td>
      <td>${dur}</td>
      <td>${specialtyHtml}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderAlarmChart(alarmBurden) {
  const ctx = document.getElementById('chart-ins-alarm');
  if (!ctx) return;

  const top = alarmBurden.top10;
  const labels = top.map(r => `Stn ${r.station}`);
  const values = top.map(r => r.alarmPct);
  const colors = values.map(v =>
    v > 80 ? '#ff4444' : v > 70 ? '#ff9933' : v > 60 ? '#ffcc00' : '#4ecdc4'
  );

  if (alarmChart) alarmChart.destroy();
  alarmChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Alarm %',
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: 'y',
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.x.toFixed(1)}% alarm calls`,
          },
        },
      },
      scales: {
        x: {
          ...CHART_DEFAULTS.scales.x,
          beginAtZero: true,
          max: 100,
          title: { display: true, text: 'Alarm %', color: '#7a8a9a' },
        },
        y: {
          ...CHART_DEFAULTS.scales.y,
          ticks: { ...CHART_DEFAULTS.scales.y.ticks, font: { size: 10 } },
        },
      },
    },
  });
}

function renderAlarmTable(alarmBurden) {
  const container = document.getElementById('ins-alarm-table');
  if (!container) return;

  let html = `<table class="ops-table"><thead><tr>
    <th>#</th><th>Station</th><th>Total</th><th>Alarms</th><th>Alarm %</th><th>Fire Calls</th>
  </tr></thead><tbody>`;

  alarmBurden.stationRates.forEach((r, i) => {
    const cls = r.alarmPct > 80 ? 'color:#ff4444' : r.alarmPct > 70 ? 'color:#ff9933' : '';
    html += `<tr>
      <td>${i + 1}</td>
      <td>Stn ${escapeHtml(r.station)}</td>
      <td>${formatNum(r.total)}</td>
      <td>${formatNum(r.alarms)}</td>
      <td style="${cls};font-weight:600">${r.alarmPct.toFixed(1)}%</td>
      <td>${formatNum(r.fires)}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderMonthlyDemandChart(seasonal) {
  const ctx = document.getElementById('chart-ins-monthly');
  if (!ctx) return;

  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: MONTH_LABELS,
      datasets: [
        {
          label: 'Avg Monthly Demand',
          data: seasonal.monthlyDemand,
          borderColor: '#ff6b35',
          backgroundColor: 'rgba(255, 107, 53, 0.15)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          borderWidth: 2.5,
        },
        {
          label: 'Flat 24/7 Staffing Level',
          data: Array(12).fill(seasonal.flatLevel),
          borderColor: '#7a8a9a',
          borderDash: [6, 4],
          pointRadius: 0,
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
        y: {
          ...CHART_DEFAULTS.scales.y,
          beginAtZero: false,
          title: { display: true, text: 'Avg Incidents/Month', color: '#7a8a9a' },
        },
      },
    },
  });
}

function renderHourlyChart(extraCharts) {
  const ctx = document.getElementById('chart-ins-hourly');
  if (!ctx) return;

  const hourly = extraCharts?.hourly || [];
  const counts = Array(24).fill(0);
  for (const row of hourly) {
    const h = parseInt(row.hour);
    if (h >= 0 && h < 24) counts[h] = parseInt(row.cnt) || 0;
  }

  const total = counts.reduce((a, b) => a + b, 0);
  const flatAvg = total / 24;
  const labels = Array.from({ length: 24 }, (_, i) =>
    i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`
  );

  const colors = counts.map(c => c > flatAvg * 1.2 ? '#ff6b35' : c < flatAvg * 0.8 ? '#3b82f6' : '#4ecdc4');

  if (hourlyChart) hourlyChart.destroy();
  hourlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Incidents',
          data: counts,
          backgroundColor: colors,
          borderRadius: 3,
        },
        {
          label: 'Flat Avg',
          data: Array(24).fill(flatAvg),
          type: 'line',
          borderColor: '#7a8a9a',
          borderDash: [6, 4],
          pointRadius: 0,
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
        x: { ...CHART_DEFAULTS.scales.x, ticks: { ...CHART_DEFAULTS.scales.x.ticks, maxRotation: 45, font: { size: 9 } } },
        y: { ...CHART_DEFAULTS.scales.y, beginAtZero: true, title: { display: true, text: 'Incidents', color: '#7a8a9a' } },
      },
    },
  });
}

function renderRiskChart(risk) {
  const ctx = document.getElementById('chart-ins-risk');
  if (!ctx) return;

  const top15 = risk.neighbourhoods.slice(0, 15);
  const labels = top15.map(n => n.name);
  const values = top15.map(n => parseFloat(n.riskScore));
  const colors = top15.map(n => {
    const score = parseFloat(n.riskScore);
    if (score >= 70) return '#ff4444';
    if (score >= 50) return '#ff9933';
    if (score >= 30) return '#ffcc00';
    return '#4ecdc4';
  });

  if (riskChart) riskChart.destroy();
  riskChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Risk Score',
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: 'y',
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `Risk Score: ${ctx.parsed.x.toFixed(1)}`,
          },
        },
      },
      scales: {
        x: {
          ...CHART_DEFAULTS.scales.x,
          beginAtZero: true,
          max: 100,
          title: { display: true, text: 'Risk Score', color: '#7a8a9a' },
        },
        y: {
          ...CHART_DEFAULTS.scales.y,
          ticks: { ...CHART_DEFAULTS.scales.y.ticks, font: { size: 9 } },
        },
      },
    },
  });
}

function renderRiskTable(risk) {
  const container = document.getElementById('ins-risk-table');
  if (!container) return;

  let html = `<table class="ops-table"><thead><tr>
    <th>#</th><th>Neighbourhood</th><th>Risk</th><th>Total</th><th>Struct %</th><th>Trend</th><th>Tier</th>
  </tr></thead><tbody>`;

  risk.neighbourhoods.slice(0, 20).forEach((n, i) => {
    const tierCls = n.riskTier === 'High' ? 'ins-risk-high'
      : n.riskTier === 'Elevated' ? 'ins-risk-elevated'
      : n.riskTier === 'Medium' ? 'ins-risk-medium'
      : 'ins-risk-low';

    const trendIcon = n.trendDirection === 'up' ? '<span style="color:#ff6b35">&#9650;</span>'
      : n.trendDirection === 'down' ? '<span style="color:#4ecdc4">&#9660;</span>'
      : '<span style="color:#7a8a9a">&#9654;</span>';

    html += `<tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(n.name)}</td>
      <td style="font-weight:600">${n.riskScore}</td>
      <td>${formatNum(n.totalCount)}</td>
      <td>${n.structurePct}%</td>
      <td>${trendIcon}</td>
      <td><span class="ins-risk-tier ${tierCls}">${n.riskTier}</span></td>
    </tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// === Utility ===

function getWorkloadStatus(pctOfMedian) {
  if (pctOfMedian > 150) return 'Overloaded';
  if (pctOfMedian > 125) return 'High';
  if (pctOfMedian < 75) return 'Low';
  return 'Normal';
}

function getRiskTier(score) {
  if (score >= 70) return 'High';
  if (score >= 50) return 'Elevated';
  if (score >= 30) return 'Medium';
  return 'Low';
}

// --- KPMG Peer City Comparison ---

function renderPeerCityComparison() {
  const ctx = document.getElementById('chart-ins-peer-funding');
  if (!ctx) return;

  const comps = EFRS_BENCHMARKS.comparators;
  const cities = Object.values(comps);
  const labels = cities.map(c => c.label);
  const values = cities.map(c => c.funding_per_event);
  const colors = labels.map(l => l === 'Edmonton' ? '#ff6b35' : '#5a6a7a');

  if (peerFundingChart) peerFundingChart.destroy();
  peerFundingChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Funding per Event ($)',
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (tooltipCtx) => `$${tooltipCtx.parsed.y.toLocaleString()} per event`,
          },
        },
      },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x },
        y: { ...CHART_DEFAULTS.scales.y, beginAtZero: true, title: { display: true, text: '$ / Event', color: '#7a8a9a' } },
      },
    },
  });
}

function renderPeerCityTable() {
  const container = document.getElementById('ins-peer-table');
  if (!container) return;

  const comps = EFRS_BENCHMARKS.comparators;
  const cities = Object.values(comps);

  let html = `<table class="ops-table"><thead><tr>
    <th>City</th><th>Firefighters</th><th>Stations</th><th>$/Event</th><th>Medical %</th>
  </tr></thead><tbody>`;

  for (const c of cities) {
    const highlighted = c.label === 'Edmonton' ? ' style="color:var(--accent);font-weight:600"' : '';
    html += `<tr${highlighted}>
      <td>${c.label}</td>
      <td>${c.firefighters.toLocaleString()}</td>
      <td>${c.stations}</td>
      <td>$${c.funding_per_event.toLocaleString()}</td>
      <td>${(c.medical_pct * 100).toFixed(0)}%</td>
    </tr>`;
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}
