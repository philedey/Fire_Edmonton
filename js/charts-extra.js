import { CHART_DEFAULTS } from './chart-utils.js';
// Re-export renderSparkline from the shared module for app.js
export { renderSparkline } from './chart-utils.js';

// Chart instances
let hourlyChart = null;
let dayOfWeekChart = null;
let trendChart = null;

const HOUR_LABELS = [
  '12 AM','1 AM','2 AM','3 AM','4 AM','5 AM','6 AM','7 AM','8 AM','9 AM','10 AM','11 AM',
  '12 PM','1 PM','2 PM','3 PM','4 PM','5 PM','6 PM','7 PM','8 PM','9 PM','10 PM','11 PM',
];

const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const TREND_COLORS = ['#ff4444','#ff9933','#ffcc00','#4ecdc4','#36a89e'];

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// --- Hour color gradient: darker for night hours, brighter for day hours ---

function getHourColor(hour) {
  const nightHours = [22, 23, 0, 1, 2, 3, 4, 5];
  if (nightHours.includes(hour)) {
    return 'rgba(204, 68, 0, 0.7)';
  }
  if (hour === 6 || hour === 7 || hour === 20 || hour === 21) {
    return 'rgba(255, 107, 53, 0.75)';
  }
  return 'rgba(255, 153, 51, 0.85)';
}

function getHourColors() {
  return Array.from({ length: 24 }, (_, i) => getHourColor(i));
}

// --- Init ---

export function initExtraCharts() {
  const hourlyCanvas = document.getElementById('chart-hourly');
  const dowCanvas = document.getElementById('chart-dow');
  const trendCanvas = document.getElementById('chart-trends');

  if (hourlyCanvas) {
    hourlyChart = new Chart(hourlyCanvas, {
      type: 'bar',
      data: { labels: HOUR_LABELS, datasets: [] },
      options: {
        ...CHART_DEFAULTS,
        indexAxis: 'y',
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.parsed.x.toLocaleString()} incidents`,
            },
          },
        },
        scales: {
          x: {
            ...CHART_DEFAULTS.scales.x,
            beginAtZero: true,
          },
          y: {
            ...CHART_DEFAULTS.scales.y,
            ticks: { color: '#5a6a7a', font: { size: 9 } },
          },
        },
      },
    });
  }

  if (dowCanvas) {
    dayOfWeekChart = new Chart(dowCanvas, {
      type: 'bar',
      data: { labels: DAY_SHORT, datasets: [] },
      options: {
        ...CHART_DEFAULTS,
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.parsed.y.toLocaleString()} incidents`,
            },
          },
        },
        scales: {
          x: { ...CHART_DEFAULTS.scales.x },
          y: { ...CHART_DEFAULTS.scales.y, beginAtZero: true },
        },
      },
    });
  }

  if (trendCanvas) {
    trendChart = new Chart(trendCanvas, {
      type: 'line',
      data: { labels: MONTH_NAMES, datasets: [] },
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
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
      },
    });
  }
}

// --- Update all extra charts ---

export function updateExtraChartsFromData(extraCharts, ctx = {}) {
  updateHourlyChart(extraCharts.hourly || []);
  updateDayOfWeekChart(extraCharts.dayOfWeek || []);

  // Trend chart: always show all years from baseline when a year is selected
  const trendData = ctx.selectedYear && ctx.baselineYearlyMonthly
    ? ctx.baselineYearlyMonthly
    : (extraCharts.yearlyMonthly || []);
  updateTrendChart(trendData, ctx.selectedYear || null);
}

// --- Hourly chart ---

function updateHourlyChart(data) {
  if (!hourlyChart) return;

  const counts = Array(24).fill(0);
  for (const row of data) {
    const h = parseInt(row.hour);
    if (h >= 0 && h < 24) {
      counts[h] = parseInt(row.cnt) || 0;
    }
  }

  hourlyChart.data.datasets = [{
    label: 'Incidents',
    data: counts,
    backgroundColor: getHourColors(),
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 2,
    barPercentage: 0.85,
  }];
  hourlyChart.update();
}

// --- Day-of-week chart ---

function updateDayOfWeekChart(data) {
  if (!dayOfWeekChart) return;

  const dayMap = {};
  for (const row of data) {
    if (row.dispatch_dayofweek) {
      dayMap[row.dispatch_dayofweek] = parseInt(row.cnt) || 0;
    }
  }

  const counts = DAY_ORDER.map(day => dayMap[day] || 0);
  const maxCount = Math.max(...counts, 1);

  const colors = counts.map(c => {
    const ratio = c / maxCount;
    const alpha = 0.4 + ratio * 0.5;
    return `rgba(255, 107, 53, ${alpha.toFixed(2)})`;
  });

  dayOfWeekChart.data.datasets = [{
    label: 'Incidents',
    data: counts,
    backgroundColor: colors,
    borderColor: 'rgba(255, 107, 53, 0.9)',
    borderWidth: 1,
    borderRadius: 3,
  }];
  dayOfWeekChart.update();
}

// --- Year-over-year trend lines ---

function updateTrendChart(data, selectedYear = null) {
  if (!trendChart) return;

  const yearMap = {};
  for (const row of data) {
    const y = parseInt(row.dispatch_year);
    const m = parseInt(row.dispatch_month);
    if (isNaN(y) || isNaN(m)) continue;
    if (!yearMap[y]) yearMap[y] = Array(12).fill(0);
    if (m >= 1 && m <= 12) {
      yearMap[y][m - 1] = parseInt(row.cnt) || 0;
    }
  }

  const allYears = Object.keys(yearMap).map(Number).sort();
  const recentYears = allYears.slice(-5);

  const datasets = recentYears.map((year, idx) => {
    const isSelected = selectedYear && year === selectedYear;
    const isDimmed = selectedYear && year !== selectedYear;
    const color = TREND_COLORS[idx % TREND_COLORS.length];

    return {
      label: String(year),
      data: yearMap[year],
      borderColor: isDimmed ? color + '40' : color,
      backgroundColor: 'transparent',
      borderWidth: isSelected ? 3.5 : isDimmed ? 1 : 2,
      tension: 0.3,
      pointRadius: isSelected ? 4 : isDimmed ? 0 : 2,
      pointHoverRadius: 5,
      pointBackgroundColor: isDimmed ? color + '40' : color,
      order: isSelected ? 0 : 1, // selected year drawn on top
    };
  });

  trendChart.data.datasets = datasets;
  trendChart.update();
}
