import { CHART_DEFAULTS, escapeHtml } from './chart-utils.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DOUGHNUT_PALETTE = [
  '#ff4444', '#ff6b35', '#ff9933', '#ffcc00',
  '#e84525', '#cc7a00', '#4ecdc4', '#36a89e',
];

let yearlyChart = null;
let monthlyChart = null;
let doughnutChart = null;

export function initCharts() {
  yearlyChart = new Chart(document.getElementById('chart-yearly'), {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x, stacked: true },
        y: { ...CHART_DEFAULTS.scales.y, stacked: true, beginAtZero: true },
      },
    },
  });

  monthlyChart = new Chart(document.getElementById('chart-monthly'), {
    type: 'line',
    data: { labels: MONTH_NAMES, datasets: [] },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
      },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x },
        y: { ...CHART_DEFAULTS.scales.y, beginAtZero: true },
      },
    },
  });

  doughnutChart = new Chart(document.getElementById('chart-doughnut'), {
    type: 'doughnut',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#7a8a9a', font: { size: 11 }, padding: 12 },
        },
      },
    },
  });
}

export function updateCharts(stats, ctx = {}) {
  updateYearlyChart(stats, ctx);
  updateMonthlyChart(stats);
  updateDoughnutChart(stats);
  updateNeighbourhoodTable(stats);
}

function updateYearlyChart(stats, ctx = {}) {
  // When a year is selected, show ALL years from baseline data with the selected year highlighted
  const useBaseline = ctx.selectedYear && ctx.baselineStats;
  const source = useBaseline ? ctx.baselineStats : stats;
  const years = source.years;
  const selectedYear = ctx.selectedYear || null;

  const structureData = years.map(y => source.yearlyData[y]?.structure || 0);
  const outsideData = years.map(y => source.yearlyData[y]?.outside || 0);
  const otherData = years.map(y => source.yearlyData[y]?.other || 0);

  // Dim unselected years when a year filter is active
  const structureColors = years.map(y =>
    selectedYear && y !== selectedYear ? 'rgba(255, 68, 68, 0.25)' : '#ff4444'
  );
  const outsideColors = years.map(y =>
    selectedYear && y !== selectedYear ? 'rgba(255, 153, 51, 0.25)' : '#ff9933'
  );
  const otherColors = years.map(y =>
    selectedYear && y !== selectedYear ? 'rgba(255, 204, 0, 0.25)' : '#ffcc00'
  );

  yearlyChart.data.labels = years;
  yearlyChart.data.datasets = [
    { label: 'Structure', data: structureData, backgroundColor: structureColors },
    { label: 'Outside', data: outsideData, backgroundColor: outsideColors },
    { label: 'Other', data: otherData, backgroundColor: otherColors },
  ];
  yearlyChart.update();
}

function updateMonthlyChart(stats) {
  monthlyChart.data.datasets = [{
    label: 'Incidents',
    data: stats.monthlyData,
    borderColor: '#ff9933',
    backgroundColor: 'rgba(255, 153, 51, 0.15)',
    fill: true,
    tension: 0.4,
    pointRadius: 3,
    pointBackgroundColor: '#ff9933',
  }];
  monthlyChart.update();
}

function updateDoughnutChart(stats) {
  const labels = stats.topTypes.map(([name]) => name);
  const data = stats.topTypes.map(([, count]) => count);

  doughnutChart.data.labels = labels;
  doughnutChart.data.datasets = [{
    data,
    backgroundColor: DOUGHNUT_PALETTE.slice(0, data.length),
    borderColor: '#1a2a3a',
    borderWidth: 2,
  }];
  doughnutChart.update();
}

function updateNeighbourhoodTable(stats) {
  const container = document.getElementById('neighbourhood-table');
  const ranking = stats.neighbourhoodRanking;
  if (!ranking.length) {
    container.innerHTML = '<p style="color:#5a6a7a;text-align:center;padding:20px">No data</p>';
    return;
  }

  const maxCount = ranking[0][1];

  let html = `
    <table class="neighbourhood-table">
      <thead>
        <tr><th>#</th><th>Neighbourhood</th><th>Incidents</th></tr>
      </thead>
      <tbody>
  `;

  for (let i = 0; i < ranking.length; i++) {
    const [name, count] = ranking[i];
    const pct = (count / maxCount) * 100;
    html += `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(name)}</td>
        <td class="bar-cell">
          <div class="inline-bar" style="width:${pct}%"></div>
          <span class="bar-count">${count.toLocaleString()}</span>
        </td>
      </tr>
    `;
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}
