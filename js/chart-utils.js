// Shared Chart.js defaults and utilities used across chart modules

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
