let fullGeojson = null;
let filterCallback = null;
let debounceTimer = null;

const state = {
  year: 'all',
  fireType: 'all',
  neighbourhood: '',
  station: 'all',
};

export function initFilters(geojson, onChange) {
  fullGeojson = geojson;
  filterCallback = onChange;
  wireEvents();
}

export function populateYears(years) {
  const select = document.getElementById('filter-year');
  while (select.options.length > 1) select.remove(1);
  for (const y of years) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    select.appendChild(opt);
  }
}

export function populateStations(stationNames) {
  const select = document.getElementById('filter-station');
  while (select.options.length > 1) select.remove(1);
  for (const name of stationNames) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = `Station ${name}`;
    select.appendChild(opt);
  }
}

export function setMapGeojson(geojson) {
  fullGeojson = geojson;
}

function wireEvents() {
  document.getElementById('filter-year').addEventListener('change', (e) => {
    state.year = e.target.value;
    triggerUpdate(true);
  });

  document.getElementById('filter-type').addEventListener('change', (e) => {
    state.fireType = e.target.value;
    triggerUpdate(true);
  });

  document.getElementById('filter-neighbourhood').addEventListener('input', (e) => {
    state.neighbourhood = e.target.value.trim().toLowerCase();
    triggerUpdate(false);
  });

  document.getElementById('filter-station').addEventListener('change', (e) => {
    state.station = e.target.value;
    triggerUpdate(true);
  });

  document.getElementById('filter-reset').addEventListener('click', () => {
    state.year = 'all';
    state.fireType = 'all';
    state.neighbourhood = '';
    state.station = 'all';
    document.getElementById('filter-year').value = 'all';
    document.getElementById('filter-type').value = 'all';
    document.getElementById('filter-neighbourhood').value = '';
    document.getElementById('filter-station').value = 'all';
    triggerUpdate(true);
  });
}

function triggerUpdate(immediate) {
  if (debounceTimer) clearTimeout(debounceTimer);

  if (immediate) {
    doUpdate();
    return;
  }

  debounceTimer = setTimeout(doUpdate, 300);
}

async function doUpdate() {
  if (!filterCallback) return;

  // Pass filter state directly — app.js handles the Supabase RPC call
  const hasFilters = state.year !== 'all' || state.fireType !== 'all' || state.neighbourhood || state.station !== 'all';
  updateFilterChips();
  filterCallback(hasFilters ? { ...state } : null);
}

function updateFilterChips() {
  const container = document.getElementById('filter-chips');
  if (!container) return;

  const chips = [];
  if (state.year !== 'all') {
    chips.push(`<span class="filter-chip"><span class="filter-chip-label">Year:</span>${state.year}</span>`);
  }
  if (state.fireType !== 'all') {
    const label = state.fireType.charAt(0).toUpperCase() + state.fireType.slice(1);
    chips.push(`<span class="filter-chip"><span class="filter-chip-label">Type:</span>${label}</span>`);
  }
  if (state.station !== 'all') {
    chips.push(`<span class="filter-chip"><span class="filter-chip-label">Station:</span>${state.station}</span>`);
  }
  if (state.neighbourhood) {
    chips.push(`<span class="filter-chip"><span class="filter-chip-label">Area:</span>${state.neighbourhood}</span>`);
  }

  if (chips.length) {
    container.innerHTML = chips.join('');
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
    container.innerHTML = '';
  }
}

export function updateKPIs(stats, baselineStats = null) {
  const fmt = (n) => n.toLocaleString();
  const pct = (n, total) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%';

  document.getElementById('kpi-total').textContent = fmt(stats.total);
  document.getElementById('kpi-total-sub').textContent =
    stats.years.length > 1
      ? `${stats.years[0]} – ${stats.years[stats.years.length - 1]}`
      : stats.years[0] || '';

  document.getElementById('kpi-structure').textContent = fmt(stats.structure);
  document.getElementById('kpi-structure-sub').textContent = `${pct(stats.structure, stats.total)} of total`;

  document.getElementById('kpi-outside').textContent = fmt(stats.outside);
  document.getElementById('kpi-outside-sub').textContent = `${pct(stats.outside, stats.total)} of total`;

  document.getElementById('kpi-neighbourhood').textContent = stats.topNeighbourhood;
  document.getElementById('kpi-neighbourhood-sub').textContent = `${fmt(stats.topNeighbourhoodCount)} incidents`;

  if (stats.medianDurationMins !== null) {
    document.getElementById('kpi-response').textContent = `${stats.medianDurationMins.toFixed(1)} min`;
    document.getElementById('kpi-response-sub').textContent = 'avg duration';
  } else {
    document.getElementById('kpi-response').textContent = 'N/A';
    document.getElementById('kpi-response-sub').textContent = 'no data';
  }

  // YoY change arrows — use baseline data when filtered to single year
  injectYoYDeltas(stats, baselineStats);

  document.querySelectorAll('.kpi-card.skeleton').forEach(el => el.classList.remove('skeleton'));
}

function injectYoYDeltas(stats, baselineStats = null) {
  // When filtered to a single year, use baseline data to find prior year for comparison
  const yearlySource = baselineStats?.yearlyData || stats.yearlyData;
  const allYears = baselineStats?.years || stats.years;
  if (!yearlySource || !allYears || allYears.length < 2) return;

  // Determine current year: use the filtered year if single, otherwise latest
  const currYear = stats.years.length === 1
    ? stats.years[0]
    : allYears[allYears.length - 1];

  // Find previous year from the full timeline
  const currIdx = allYears.indexOf(currYear);
  if (currIdx < 1) return;
  const prevYear = allYears[currIdx - 1];

  const curr = yearlySource[currYear];
  const prev = yearlySource[prevYear];
  if (!curr || !prev) return;

  const currTotal = (curr.structure || 0) + (curr.outside || 0) + (curr.other || 0);
  const prevTotal = (prev.structure || 0) + (prev.outside || 0) + (prev.other || 0);

  setDelta('kpi-total', currTotal, prevTotal, `vs ${prevYear}`);
  setDelta('kpi-structure', curr.structure || 0, prev.structure || 0, `vs ${prevYear}`);
  setDelta('kpi-outside', curr.outside || 0, prev.outside || 0, `vs ${prevYear}`);
}

function setDelta(kpiId, curr, prev, label) {
  const card = document.getElementById(kpiId)?.closest('.kpi-card');
  if (!card || !prev) return;

  // Remove existing delta
  const existing = card.querySelector('.kpi-delta');
  if (existing) existing.remove();

  const delta = ((curr - prev) / prev) * 100;
  const isUp = delta > 0;
  const isFlat = Math.abs(delta) < 1;

  const el = document.createElement('div');
  el.className = `kpi-delta ${isFlat ? 'flat' : isUp ? 'up' : 'down'}`;
  el.textContent = `${isFlat ? '~' : isUp ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}% ${label}`;
  card.appendChild(el);
}
