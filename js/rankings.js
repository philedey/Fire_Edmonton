// Rankings tab — animated competitive leaderboard with podium, racing bars, FLIP table, playback
// Supports YTD / MTD / Last 7 Days period selection via station_rankings() RPC

import { fetchStationRankings, fetchStationComparison } from './api.js';
import {
  CHART_DEFAULTS, CHART_COLORS, escapeHtml, formatNum, removeSkeleton,
} from './chart-utils.js';

// --- Metric definitions ---
// Fields match the station_rankings() RPC output: total, structure_fires, outside_fires, alarms, median_duration
const METRICS = [
  { key: 'duration', label: 'Median Duration', field: 'median_duration', unit: ' min', mode: 'lower', star: true },
  { key: 'total', label: 'Total Calls', field: 'total', unit: '', mode: 'lower' },
  { key: 'structure', label: 'Structure Fires', field: 'structure_fires', unit: '', mode: 'lower' },
  { key: 'outside', label: 'Outside Fires', field: 'outside_fires', unit: '', mode: 'lower' },
  { key: 'alarms', label: 'Alarms', field: 'alarms', unit: '', mode: 'lower' },
  { key: 'alarmRatio', label: 'Alarm Ratio', compute: r => r.total > 0 ? +(r.alarms / r.total * 100).toFixed(1) : 0, unit: '%', mode: 'lower' },
];

const TIER_COLORS = { top: '#4ecdc4', mid: '#ffaa00', bottom: '#ff4444' };
const PODIUM_COLORS = [
  { bg: 'linear-gradient(135deg, #ffd700, #ffaa00)', glow: 'rgba(255, 215, 0, 0.4)', label: '1st' },
  { bg: 'linear-gradient(135deg, #c0c0c0, #a0a0a0)', glow: 'rgba(192, 192, 192, 0.3)', label: '2nd' },
  { bg: 'linear-gradient(135deg, #cd7f32, #b87333)', glow: 'rgba(205, 127, 50, 0.3)', label: '3rd' },
];

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

let cachedData = null;       // { ytd: [], mtd: [], last7: [], meta: {} }
let playbackData = null;     // from fetchStationComparison (lazy-loaded)
let activeMetric = 'duration';
let activePeriod = 'ytd';
let racingChart = null;
let playbackTimer = null;
let oldRankMap = {};

// ===== PUBLIC =====

export async function initRankings() {
  try {
    cachedData = await fetchStationRankings();
    if (!cachedData?.ytd?.length) return;
    wirePeriodToggle();
    wireMetricPills();
    wirePlayback();
    updateDateRange();
    renderAll(activeMetric, false);
    removeSkeleton('rankings');
  } catch (err) {
    console.error('Rankings init failed:', err);
  }
}

// ===== PERIOD TOGGLE =====

function wirePeriodToggle() {
  const btns = document.querySelectorAll('.period-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.period;
      if (period === activePeriod) return;

      activePeriod = period;
      btns.forEach(b => b.classList.toggle('active', b.dataset.period === period));
      updateDateRange();
      renderAll(activeMetric, true);
    });
  });
}

function updateDateRange() {
  const el = document.getElementById('rank-date-range');
  if (!el || !cachedData?.meta) return;

  const latest = new Date(cachedData.meta.latestDate + 'T00:00:00');
  const year = cachedData.meta.currentYear;
  const month = cachedData.meta.currentMonth;
  const latestDay = latest.getDate();

  if (activePeriod === 'ytd') {
    el.textContent = `Jan 1 – ${MONTH_NAMES[month - 1]} ${latestDay}, ${year}`;
  } else if (activePeriod === 'mtd') {
    el.textContent = `${MONTH_NAMES[month - 1]} 1 – ${latestDay}, ${year}`;
  } else {
    const weekStart = new Date(latest);
    weekStart.setDate(weekStart.getDate() - 6);
    const wsMonth = MONTH_NAMES[weekStart.getMonth()];
    const wsDay = weekStart.getDate();
    el.textContent = `${wsMonth} ${wsDay} – ${MONTH_NAMES[month - 1]} ${latestDay}`;
  }
}

// ===== RANKING COMPUTATION =====

function getStationValue(station, metricKey) {
  const m = METRICS.find(x => x.key === metricKey);
  if (!m) return 0;
  if (m.compute) return m.compute(station);
  return station[m.field] != null ? parseFloat(station[m.field]) : null;
}

function computeRankings(stations, metricKey) {
  const m = METRICS.find(x => x.key === metricKey);
  if (!m) return [];

  const ranked = stations.map(s => {
    const mapped = {
      name: s.station_name,
      total: parseInt(s.total) || 0,
      structure_fires: parseInt(s.structure_fires) || 0,
      outside_fires: parseInt(s.outside_fires) || 0,
      alarms: parseInt(s.alarms) || 0,
      median_duration: s.median_duration != null ? parseFloat(s.median_duration) : null,
      avg_duration: s.avg_duration != null ? parseFloat(s.avg_duration) : null,
    };
    mapped.value = getStationValue(mapped, metricKey);
    return mapped;
  }).filter(s => s.value != null);

  // Sort: lower = better for all metrics
  ranked.sort((a, b) => a.value - b.value);

  ranked.forEach((s, i) => {
    s.rank = i + 1;
    s.tier = i < 10 ? 'top' : i < 21 ? 'mid' : 'bottom';
    const oldRank = oldRankMap[s.name];
    s.delta = oldRank != null ? oldRank - s.rank : 0; // positive = improved
  });

  return ranked;
}

// ===== RENDER ALL =====

function renderAll(metricKey, animate = true) {
  const stations = cachedData[activePeriod] || [];
  const rankings = computeRankings(stations, metricKey);
  if (!rankings.length) return;

  renderPodium(rankings.slice(0, 3), metricKey, animate);
  renderRacingChart(rankings, metricKey, animate);
  renderLeaderboard(rankings, metricKey, animate);

  // Store current ranks for next delta calc
  oldRankMap = {};
  rankings.forEach(r => { oldRankMap[r.name] = r.rank; });
}

// ===== PODIUM =====

function renderPodium(top3, metricKey, animate) {
  const container = document.getElementById('rank-podium');
  if (!container) return;
  const m = METRICS.find(x => x.key === metricKey);

  // Podium order: 2nd | 1st | 3rd
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  const heights = [140, 180, 110];
  const podiumIdx = [1, 0, 2]; // maps to PODIUM_COLORS

  container.innerHTML = order.map((s, i) => {
    const pi = podiumIdx[i];
    const pc = PODIUM_COLORS[pi];
    const h = heights[i];
    const val = formatValue(s.value, m);
    const delay = animate ? `animation-delay: ${[150, 0, 300][i]}ms` : '';
    const animClass = animate ? 'podium-animate' : '';

    return `
      <div class="podium-col ${animClass}" style="${delay}">
        <div class="podium-station">Stn ${escapeHtml(s.name)}</div>
        <div class="podium-value">${val}</div>
        <div class="podium-place" style="background:${pc.bg}; box-shadow: 0 0 20px ${pc.glow}; height:${h}px">
          <span class="podium-label">${pc.label}</span>
        </div>
      </div>`;
  }).join('');
}

// ===== RACING BAR CHART =====

function renderRacingChart(rankings, metricKey, animate) {
  const canvas = document.getElementById('chart-racing-bars');
  if (!canvas) return;
  const m = METRICS.find(x => x.key === metricKey);

  const labels = rankings.map(r => `Stn ${r.name}`);
  const values = rankings.map(r => r.value);
  const colors = rankings.map(r => TIER_COLORS[r.tier]);

  if (racingChart) {
    racingChart.data.labels = labels;
    racingChart.data.datasets[0].data = values;
    racingChart.data.datasets[0].backgroundColor = colors;
    racingChart.options.plugins.title.text = `${m.label} by Station`;
    racingChart.update(animate ? 'default' : 'none');
    return;
  }

  racingChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: colors.map(c => c + '80'),
        borderWidth: 1,
        borderRadius: 3,
        barPercentage: 0.8,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: 'y',
      animation: { duration: animate ? 800 : 0, easing: 'easeOutQuart' },
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
        title: {
          display: true,
          text: `${m.label} by Station`,
          color: '#e0e6ed',
          font: { size: 14, weight: 'bold' },
          padding: { bottom: 12 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.raw}${m.unit}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#7a8a9a', font: { size: 10 } },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#e0e6ed', font: { size: 11 } },
        },
      },
    },
  });
}

// ===== LEADERBOARD TABLE (FLIP animated) =====

function renderLeaderboard(rankings, metricKey, animate) {
  const container = document.getElementById('rank-leaderboard');
  if (!container) return;
  const m = METRICS.find(x => x.key === metricKey);
  const maxVal = Math.max(...rankings.map(r => r.value), 1);

  // Monthly trend data for sparklines (only if playback data loaded)
  const monthlyTrend = playbackData?.monthlyTrend || [];
  const sparkData = monthlyTrend.length ? buildSparkData(monthlyTrend, metricKey) : {};

  // FLIP: record old positions
  const oldPositions = {};
  if (animate) {
    container.querySelectorAll('.lb-row').forEach(row => {
      oldPositions[row.dataset.station] = row.getBoundingClientRect();
    });
  }

  // Build rows
  const rows = rankings.map(r => {
    const barPct = (r.value / maxVal) * 100;

    const deltaHtml = r.delta > 0
      ? `<span class="lb-delta lb-delta-up">\u25B2${r.delta}</span>`
      : r.delta < 0
        ? `<span class="lb-delta lb-delta-down">\u25BC${Math.abs(r.delta)}</span>`
        : '<span class="lb-delta lb-delta-flat">\u2014</span>';

    const badgeClass = r.rank <= 3 ? `lb-badge-${r.rank}` : '';
    const spark = sparkData[r.name] || '';
    const nLabel = activePeriod === 'last7'
      ? `<span class="lb-n" title="Incidents in period">n=${r.total}</span>`
      : '';

    return `<div class="lb-row" data-station="${escapeHtml(r.name)}" data-value="${r.value}">
      <div class="lb-rank-badge ${badgeClass}">${r.rank}</div>
      <div class="lb-name">Stn ${escapeHtml(r.name)}${nLabel}</div>
      <div class="lb-value">${formatValue(r.value, m)}</div>
      ${deltaHtml}
      <div class="lb-tier-bar-wrap">
        <div class="lb-tier-bar" style="width:${barPct.toFixed(1)}%;background:${TIER_COLORS[r.tier]}"></div>
      </div>
      <div class="lb-spark">${spark}</div>
    </div>`;
  }).join('');

  container.innerHTML = rows;

  // FLIP: animate from old to new positions
  if (animate && Object.keys(oldPositions).length) {
    container.querySelectorAll('.lb-row').forEach(row => {
      const stn = row.dataset.station;
      const oldRect = oldPositions[stn];
      if (!oldRect) {
        row.classList.add('lb-fade-in');
        return;
      }
      const newRect = row.getBoundingClientRect();
      const deltaY = oldRect.top - newRect.top;
      if (Math.abs(deltaY) < 1) return;

      row.style.transform = `translateY(${deltaY}px)`;
      row.style.transition = 'none';
      // Force reflow
      row.offsetHeight;
      row.style.transition = '';
      row.style.transform = '';

      // Apply glow
      const prevRank = oldRankMap[stn];
      const newRank = rankings.find(r => r.name === stn)?.rank;
      if (prevRank != null && newRank != null) {
        if (newRank < prevRank) row.classList.add('lb-glow-up');
        else if (newRank > prevRank) row.classList.add('lb-glow-down');
      }
    });

    // Clean glow classes after animation
    setTimeout(() => {
      container.querySelectorAll('.lb-glow-up, .lb-glow-down').forEach(el => {
        el.classList.remove('lb-glow-up', 'lb-glow-down');
      });
    }, 2000);
  }
}

function buildSparkData(monthlyTrend, metricKey) {
  // Group last 6 months of data per station, render inline SVG sparkline
  const m = METRICS.find(x => x.key === metricKey);
  const result = {};
  const byStation = {};

  for (const row of monthlyTrend) {
    const stn = row.station_name;
    if (!byStation[stn]) byStation[stn] = [];
    let val;
    if (m.field) val = row[m.field] != null ? parseFloat(row[m.field]) : null;
    else if (metricKey === 'alarmRatio') {
      const total = parseInt(row.total) || 0;
      const alarms = parseInt(row.alarms) || 0;
      val = total > 0 ? (alarms / total) * 100 : null;
    } else {
      val = parseInt(row.total) || 0;
    }
    byStation[stn].push({ y: row.dispatch_year, m: row.dispatch_month, val });
  }

  for (const [stn, rows] of Object.entries(byStation)) {
    const sorted = rows.sort((a, b) => a.y - b.y || a.m - b.m).slice(-6);
    const vals = sorted.map(r => r.val).filter(v => v != null);
    if (vals.length < 2) continue;

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const w = 60, h = 18;
    const points = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const trend = vals[vals.length - 1] <= vals[0] ? '#4ecdc4' : '#ff6b35';
    result[stn] = `<svg width="${w}" height="${h}" class="lb-sparkline"><polyline points="${points}" fill="none" stroke="${trend}" stroke-width="1.5"/></svg>`;
  }

  return result;
}

// ===== METRIC PILLS =====

function wireMetricPills() {
  const container = document.getElementById('rank-metrics');
  if (!container) return;

  container.innerHTML = METRICS.map(m => {
    const active = m.key === activeMetric ? ' active' : '';
    const star = m.star ? ' key-metric' : '';
    const label = m.star ? `\u2605 ${m.label}` : m.label;
    return `<button class="metric-pill${active}${star}" data-metric="${m.key}">${label}</button>`;
  }).join('');

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.metric-pill');
    if (!btn) return;
    const metric = btn.dataset.metric;
    if (metric === activeMetric) return;

    activeMetric = metric;
    container.querySelectorAll('.metric-pill').forEach(b => b.classList.toggle('active', b.dataset.metric === metric));
    renderAll(metric, true);
  });
}

// ===== PLAYBACK (lazy-loads monthly data on first use) =====

let playbackMonths = [];
let playbackIdx = 0;
let playbackLoading = false;

function wirePlayback() {
  const playBtn = document.getElementById('rank-play');
  const speedBtns = document.querySelectorAll('.rank-speed-btn');
  if (!playBtn) return;

  playBtn.addEventListener('click', async () => {
    if (playbackTimer) {
      stopPlayback();
      return;
    }
    // Lazy-load monthly trend data on first play
    if (!playbackData && !playbackLoading) {
      playbackLoading = true;
      const monthLabel = document.getElementById('rank-month-label');
      if (monthLabel) monthLabel.textContent = 'Loading...';
      try {
        playbackData = await fetchStationComparison(null);
        buildPlaybackMonths();
      } catch (err) {
        console.error('Failed to load playback data:', err);
        if (monthLabel) monthLabel.textContent = 'Error';
        playbackLoading = false;
        return;
      }
      playbackLoading = false;
    }
    startPlayback();
  });

  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (playbackTimer) {
        stopPlayback();
        startPlayback();
      }
    });
  });
}

function buildPlaybackMonths() {
  const monthly = playbackData?.monthlyTrend || [];
  const monthSet = new Set();
  for (const row of monthly) {
    monthSet.add(`${row.dispatch_year}-${String(row.dispatch_month).padStart(2, '0')}`);
  }
  playbackMonths = [...monthSet].sort();
}

function getPlaybackSpeed() {
  const active = document.querySelector('.rank-speed-btn.active');
  const speed = parseInt(active?.dataset.speed) || 1;
  return Math.max(375, 1500 / speed);
}

function startPlayback() {
  if (!playbackMonths.length) return;
  const playBtn = document.getElementById('rank-play');
  const monthLabel = document.getElementById('rank-month-label');
  if (playBtn) playBtn.textContent = '\u23F8';
  playbackIdx = 0;

  const tick = () => {
    if (playbackIdx >= playbackMonths.length) {
      stopPlayback();
      return;
    }

    const [year, month] = playbackMonths[playbackIdx].split('-').map(Number);
    if (monthLabel) {
      monthLabel.textContent = `${MONTH_NAMES[month - 1]} ${year}`;
      monthLabel.classList.add('playback-flash');
      setTimeout(() => monthLabel.classList.remove('playback-flash'), 300);
    }

    // Build snapshot for this month
    const snapshot = buildMonthlySnapshot(year, month);
    if (snapshot.length) {
      const rankings = computeRankings(snapshot, activeMetric);
      renderPodium(rankings.slice(0, 3), activeMetric, true);
      renderRacingChart(rankings, activeMetric, true);
      renderLeaderboard(rankings, activeMetric, true);
      oldRankMap = {};
      rankings.forEach(r => { oldRankMap[r.name] = r.rank; });
    }

    playbackIdx++;
    playbackTimer = setTimeout(tick, getPlaybackSpeed());
  };

  tick();
}

function stopPlayback() {
  if (playbackTimer) clearTimeout(playbackTimer);
  playbackTimer = null;
  const playBtn = document.getElementById('rank-play');
  if (playBtn) playBtn.textContent = '\u25B6';

  // Restore current period view
  const monthLabel = document.getElementById('rank-month-label');
  if (monthLabel) monthLabel.textContent = activePeriod === 'ytd' ? 'YTD' : activePeriod === 'mtd' ? 'MTD' : '7D';
  renderAll(activeMetric, true);
}

function buildMonthlySnapshot(year, month) {
  const monthly = playbackData?.monthlyTrend || [];
  // Filter to rows up to this month for the given year (cumulative YTD)
  const filtered = monthly.filter(r => r.dispatch_year === year && r.dispatch_month <= month);

  // Aggregate per station
  const byStation = {};
  for (const row of filtered) {
    const stn = row.station_name;
    if (!byStation[stn]) byStation[stn] = { station_name: stn, total: 0, structure_fires: 0, outside_fires: 0, alarms: 0, durSum: 0, durCnt: 0 };
    const total = parseInt(row.total) || 0;
    byStation[stn].total += total;
    byStation[stn].structure_fires += parseInt(row.structure_fires) || 0;
    byStation[stn].outside_fires += parseInt(row.outside_fires) || 0;
    byStation[stn].alarms += parseInt(row.alarms) || 0;
    const dur = row.median_duration ?? row.avg_duration;
    if (dur != null && total > 0) {
      byStation[stn].durSum += parseFloat(dur) * total;
      byStation[stn].durCnt += total;
    }
  }

  return Object.values(byStation).map(s => ({
    ...s,
    median_duration: s.durCnt > 0 ? +(s.durSum / s.durCnt).toFixed(1) : null,
  }));
}

// ===== HELPERS =====

function formatValue(val, metric) {
  if (val == null) return '--';
  if (metric.unit === '%') return `${val.toFixed(1)}${metric.unit}`;
  if (metric.unit === ' min') return `${val.toFixed(1)} min`;
  return formatNum(val);
}
