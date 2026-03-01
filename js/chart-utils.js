// Shared Chart.js defaults and utilities used across chart modules

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const CHART_COLORS = [
  '#ff6b35', '#4ecdc4', '#ff4444', '#ffcc00', '#a855f7',
  '#3b82f6', '#10b981', '#f472b6', '#06b6d4', '#f97316',
  '#84cc16', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6',
];

export const RESPONSE_CODE_LABELS = {
  ST: 'Structure Fire', AL: 'Alarm', NF: 'No Fire',
  DG: 'Dangerous Goods', BO: 'Bomb', IV: 'Investigation',
  ME: 'Medical', OT: 'Other',
};

export const RESPONSE_CODE_COLORS = {
  ST: '#ff4444', AL: '#ffcc00', NF: '#7a8a9a', DG: '#a855f7',
  BO: '#ef4444', IV: '#3b82f6', ME: '#4ecdc4', OT: '#94a3b8',
};

export function deltaBadge(current, prior) {
  if (prior == null || prior === 0) return '';
  const delta = ((current - prior) / prior * 100).toFixed(1);
  const sign = delta > 0 ? '+' : '';
  const cls = delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-flat';
  return `<span class="delta-badge ${cls}">${sign}${delta}%</span>`;
}

export function formatNum(n) {
  if (n == null || isNaN(n)) return '--';
  return Number(n).toLocaleString();
}

export function removeSkeleton(tabName) {
  const panel = document.querySelector(`.tab-panel[data-tab="${tabName}"]`);
  if (panel) panel.querySelectorAll('.skeleton').forEach(el => el.classList.remove('skeleton'));
}

export const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#7a8a9a', font: { size: 11 } } },
  },
  scales: {
    x: {
      ticks: { color: '#8a9aaa', font: { size: 10 } },
      grid: { color: '#1f2f3f' },
    },
    y: {
      ticks: { color: '#8a9aaa', font: { size: 10 } },
      grid: { color: '#1f2f3f' },
    },
  },
};

export const DOUGHNUT_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right', labels: { color: '#7a8a9a', font: { size: 11 }, padding: 12 } },
  },
};

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Render an SVG sparkline from yearly count data.
 * @param {Object} yearlyCounts - { year: count } map
 * @param {number[]} years - ordered array of years
 * @param {number} [width=80] - SVG width
 * @param {number} [height=20] - SVG height
 * @returns {string} SVG markup
 */
export function renderSparkline(yearlyCounts, years, width = 80, height = 20) {
  if (!years || !years.length || !yearlyCounts) return '';

  const PAD = 2;
  const values = years.map(y => yearlyCounts[y] || 0);
  const max = Math.max(...values);

  if (max === 0 || values.length < 2) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<line x1="${PAD}" y1="${height / 2}" x2="${width - PAD}" y2="${height / 2}" ` +
      `stroke="#5a6a7a" stroke-width="1" stroke-opacity="0.5"/>` +
      `</svg>`;
  }

  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = (width - PAD * 2) / (values.length - 1);

  const points = values.map((v, i) => {
    const x = PAD + i * stepX;
    const y = PAD + (1 - (v - min) / range) * (height - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Trend color: up = orange, down = teal, flat = grey
  const first = values[0];
  const last = values[values.length - 1];
  let strokeColor = '#5a6a7a';
  if (last > first * 1.1) strokeColor = '#ff6b35';
  if (last < first * 0.9) strokeColor = '#4ecdc4';

  const lastPoint = points.split(' ').pop().split(',');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
    `<polyline points="${points}" fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${lastPoint[0]}" cy="${lastPoint[1]}" r="1.5" fill="${strokeColor}"/>` +
    `</svg>`;
}

export function renderMarkdown(text) {
  return text
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/<p>\s*<(h[34]|ul|ol)/g, '<$1')
    .replace(/<\/(h[34]|ul|ol)>\s*<\/p>/g, '</$1>');
}
