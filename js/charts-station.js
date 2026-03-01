import { CHART_DEFAULTS, escapeHtml, renderSparkline } from './chart-utils.js';

let stationBarChart = null;
let stationTypeChart = null;

export function initStationCharts() {
  const barCanvas = document.getElementById('chart-station-bar');
  const typeCanvas = document.getElementById('chart-station-type');

  if (barCanvas) {
    stationBarChart = new Chart(barCanvas, {
      type: 'bar',
      data: { labels: [], datasets: [] },
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
          x: { ...CHART_DEFAULTS.scales.x, beginAtZero: true },
          y: {
            ...CHART_DEFAULTS.scales.y,
            ticks: { color: '#7a8a9a', font: { size: 10 } },
          },
        },
      },
    });
  }

  if (typeCanvas) {
    stationTypeChart = new Chart(typeCanvas, {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        ...CHART_DEFAULTS,
        indexAxis: 'y',
        plugins: {
          ...CHART_DEFAULTS.plugins,
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          x: { ...CHART_DEFAULTS.scales.x, stacked: true, beginAtZero: true },
          y: {
            ...CHART_DEFAULTS.scales.y,
            stacked: true,
            ticks: { color: '#7a8a9a', font: { size: 10 } },
          },
        },
      },
    });
  }
}

export function updateStationCharts(stationData) {
  if (!stationData) return;

  const { stationCalls, stationYearly } = stationData;
  if (!stationCalls || !stationCalls.length) return;

  const sorted = [...stationCalls].sort((a, b) => b.total_incidents - a.total_incidents);
  const labels = sorted.map(s => `Stn ${s.station_name}`);

  // --- Total incidents bar chart ---
  if (stationBarChart) {
    const maxCount = sorted[0].total_incidents;
    const colors = sorted.map(s => {
      const ratio = s.total_incidents / maxCount;
      if (ratio > 0.7) return 'rgba(255, 68, 68, 0.85)';
      if (ratio > 0.4) return 'rgba(255, 107, 53, 0.8)';
      return 'rgba(255, 153, 51, 0.7)';
    });

    stationBarChart.data.labels = labels;
    stationBarChart.data.datasets = [{
      label: 'Total Incidents',
      data: sorted.map(s => s.total_incidents),
      backgroundColor: colors,
      borderColor: 'transparent',
      borderWidth: 0,
      borderRadius: 2,
      barPercentage: 0.8,
    }];
    stationBarChart.update();
  }

  // --- Stacked type breakdown chart ---
  if (stationTypeChart) {
    stationTypeChart.data.labels = labels;
    stationTypeChart.data.datasets = [
      {
        label: 'Structure',
        data: sorted.map(s => s.structure_fires),
        backgroundColor: '#ff4444',
      },
      {
        label: 'Outside',
        data: sorted.map(s => s.outside_fires),
        backgroundColor: '#ff9933',
      },
      {
        label: 'Alarms',
        data: sorted.map(s => s.alarms),
        backgroundColor: '#ffcc00',
      },
    ];
    stationTypeChart.update();
  }

  // --- Station detail table ---
  renderStationTable(sorted, stationYearly);
}

function renderStationTable(stations, stationYearly) {
  const container = document.getElementById('station-table');
  if (!container) return;

  // Build yearly sparkline data per station
  const yearlyMap = {};
  const yearsSet = new Set();
  if (stationYearly) {
    for (const row of stationYearly) {
      if (!yearlyMap[row.station_name]) yearlyMap[row.station_name] = {};
      yearlyMap[row.station_name][row.dispatch_year] = row.cnt;
      yearsSet.add(row.dispatch_year);
    }
  }
  const years = [...yearsSet].sort();

  const maxCount = stations[0]?.total_incidents || 1;

  let html = `
    <table class="station-table">
      <thead>
        <tr>
          <th>Station</th>
          <th>Total</th>
          <th>Struct</th>
          <th>Outside</th>
          <th>Alarms</th>
          <th>Med Dur</th>
          <th>Trend</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const s of stations) {
    const pct = (s.total_incidents / maxCount) * 100;
    const sparkSvg = renderSparkline(yearlyMap[s.station_name], years, 70, 18);

    html += `
      <tr>
        <td class="station-name">Stn ${escapeHtml(s.station_name)}</td>
        <td class="bar-cell">
          <div class="inline-bar" style="width:${pct}%"></div>
          <span class="bar-count">${s.total_incidents.toLocaleString()}</span>
        </td>
        <td class="num-cell">${s.structure_fires.toLocaleString()}</td>
        <td class="num-cell">${s.outside_fires.toLocaleString()}</td>
        <td class="num-cell">${s.alarms.toLocaleString()}</td>
        <td class="num-cell">${s.median_duration_mins || s.avg_duration_mins || '—'}m</td>
        <td class="sparkline-cell">${sparkSvg}</td>
      </tr>
    `;
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}
