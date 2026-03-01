import { fetchDashboardData, fetchMapPoints, fetchStationData, fetchStationList } from './api.js';
import { initMap, setMode, updateData } from './map.js';
import { initCharts, updateCharts } from './charts.js';
import { initFilters, populateYears, populateNeighbourhoods, populateStations, setMapGeojson, updateKPIs } from './filters.js';
import { getCachedMapData, setCachedMapData, isCacheStale } from './cache.js';
import { initExtraCharts, updateExtraChartsFromData, renderSparkline } from './charts-extra.js';
import { initStationCharts, updateStationCharts } from './charts-station.js';
import { streamAnalysis, buildPrompt, getSystemPrompt } from './ai.js';
import { escapeHtml, renderMarkdown } from './chart-utils.js';
import {
  initMapLayers, toggleChoropleth, updateChoroplethCounts,
  toggleStations, toggle3D, update3DCounts,
  setTimeFilter, animateTimeLapse, stopTimeLapse,
} from './map-layers.js';
import { initTabs } from './tabs.js';
import { initStationCompare } from './station-compare.js';
import { initOperations } from './operations.js';
import { initTrends } from './trends.js';
import { initInsights } from './insights.js';
import { initScorecard } from './scorecard.js';
import { initRankings } from './rankings.js';

let mapGeojson = null;
let currentYears = [];
let sparklineData = {};
let isTimePlaying = false;
let currentStats = null;
let currentStationData = null;
let baselineStats = null; // Unfiltered all-years stats for context
let baselineExtraCharts = null;

async function main() {
  try {
    // === PHASE 1: Single Supabase RPC + map init (parallel) ===
    setProgress('Loading dashboard statistics...', 20);

    const [dashData, mapInstance] = await Promise.all([
      fetchDashboardData(null),
      initMap('map'),
    ]);

    const { stats, extraCharts, availableYears } = dashData;
    currentYears = availableYears;
    currentStats = stats;
    baselineStats = stats; // Keep unfiltered data for yearly chart + YoY context
    baselineExtraCharts = extraCharts;

    // Charts + KPIs render immediately
    setProgress('Rendering charts...', 60);
    initCharts();
    initExtraCharts();
    initStationCharts();
    updateCharts(stats);
    updateKPIs(stats);
    populateYears(availableYears);

    // Populate neighbourhood dropdown from ranking data
    if (stats.neighbourhoodRanking) {
      const neighbourhoodNames = stats.neighbourhoodRanking.map(([name]) => name);
      populateNeighbourhoods(neighbourhoodNames);
    }

    // Extra charts from the same RPC response (no additional fetch needed)
    updateExtraChartsFromData(extraCharts);
    sparklineData = processSparklineData(extraCharts.sparklines);
    injectSparklines(stats);

    // Remove all skeletons
    document.querySelectorAll('.skeleton').forEach(el => el.classList.remove('skeleton'));

    // Wire filters
    initFilters(null, onFilterChange);

    // Wire map style dropdown
    document.getElementById('filter-map-style').addEventListener('change', (e) => {
      setMode(e.target.value);
    });

    // Wire map layer toggles + time slider
    wireMapLayerToggles();
    wireTimeSlider(availableYears);

    // Update header status
    document.getElementById('status-dot').classList.add('active');
    document.getElementById('status-text').textContent =
      `${stats.total.toLocaleString()} fire incidents`;

    // Hide progress bar
    setProgress('Dashboard ready', 100);
    setTimeout(() => {
      document.getElementById('progress-bar').classList.add('hidden');
    }, 600);

    // === PHASE 1b: Map layers + station data (non-blocking) ===
    initMapLayers(mapInstance).then(() => {
      toggleStations(false);
      if (stats.neighbourhoodRanking) {
        updateChoroplethCounts(stats.neighbourhoodRanking);
      }
    }).catch(err => console.warn('Map layers init failed:', err));

    fetchStationList().then(names => {
      populateStations(names);
    }).catch(err => console.warn('Station list load failed:', err));

    fetchStationData().then(stationData => {
      currentStationData = stationData;
      updateStationCharts(stationData);
      document.querySelectorAll('.station-section .skeleton').forEach(el => el.classList.remove('skeleton'));
    }).catch(err => console.warn('Station data load failed:', err));

    // Wire AI panel
    wireAIPanel();

    // Initialize tab navigation with lazy-load callbacks
    initTabs({
      overview: null, // already loaded above
      stations: () => initStationCompare(),
      operations: () => initOperations(currentYears),
      trends: () => initTrends(baselineStats, baselineExtraCharts),
      insights: () => initInsights(baselineStats, baselineExtraCharts, currentStationData, mapGeojson),
      scorecard: () => initScorecard(),
      rankings: () => initRankings(),
    });

    // === PHASE 2: Map point data (try cache first) ===
    const mapLoading = document.getElementById('map-loading');

    const cached = await getCachedMapData();
    if (cached && !isCacheStale(cached.lastFetched)) {
      applyMapData(cached.geojson, stats, cached.lastFetched);
      mapLoading.classList.add('hidden');
      refreshMapInBackground(stats);
    } else {
      if (cached) {
        applyMapData(cached.geojson, stats, cached.lastFetched);
      }

      const geojson = await fetchMapPoints((count) => {
        mapLoading.querySelector('span').textContent =
          `Loading map data... ${count.toLocaleString()} points`;
      });

      applyMapData(geojson, stats, null);
      mapLoading.classList.add('hidden');
      setCachedMapData(geojson).catch(err => console.warn('Cache write failed:', err));
    }

  } catch (err) {
    console.error('Dashboard init failed:', err);
    showError(err);
  }
}

function applyMapData(geojson, stats, lastFetched) {
  mapGeojson = geojson;
  updateData(geojson);
  setMapGeojson(geojson);

  const dateStr = lastFetched
    ? ` | ${new Date(lastFetched).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`
    : '';
  document.getElementById('status-text').textContent =
    `${stats.total.toLocaleString()} incidents | ${geojson.features.length.toLocaleString()} mapped${dateStr}`;
}

async function refreshMapInBackground(stats) {
  try {
    const geojson = await fetchMapPoints(() => {});
    if (mapGeojson && Math.abs(geojson.features.length - mapGeojson.features.length) > mapGeojson.features.length * 0.01) {
      applyMapData(geojson, stats, null);
    }
    setCachedMapData(geojson).catch(err => console.warn('Cache write failed:', err));
  } catch (err) {
    console.warn('Background map refresh failed:', err.message);
  }
}

// --- Filter change handler ---

async function onFilterChange(filterState) {
  const dashData = await fetchDashboardData(filterState);
  const { stats, extraCharts } = dashData;
  currentStats = stats;

  const selectedYear = filterState?.year && filterState.year !== 'all'
    ? parseInt(filterState.year) : null;

  // Yearly bar chart: always show all years, highlight selected
  updateCharts(stats, {
    baselineStats,
    selectedYear,
  });

  // KPIs: show filtered totals, but use baseline yearly data for YoY arrows
  updateKPIs(stats, baselineStats);

  // Extra charts: hourly/DOW/doughnut use filtered data;
  // trend chart always shows all years with selected year highlighted
  updateExtraChartsFromData(extraCharts, {
    baselineYearlyMonthly: baselineExtraCharts?.yearlyMonthly,
    selectedYear,
  });

  sparklineData = processSparklineData(extraCharts.sparklines);
  injectSparklines(stats);

  // Filter map GeoJSON client-side
  const filteredGeojson = filterMapData(filterState);
  if (filteredGeojson) {
    requestAnimationFrame(() => updateData(filteredGeojson));
  }

  // Update choropleth/3D
  if (stats.neighbourhoodRanking) {
    updateChoroplethCounts(stats.neighbourhoodRanking);
  }

  // Re-fetch station data with filters (non-blocking)
  // Station data comes from materialized views so year filtering not available yet,
  // but we track the filter state for future use
}

function filterMapData(state) {
  if (!mapGeojson) return { type: 'FeatureCollection', features: [] };
  if (!state) return mapGeojson;

  let features = mapGeojson.features;

  if (state.fireType && state.fireType !== 'all') {
    features = features.filter(f => f.properties.fireClass === state.fireType);
  }

  if (state.neighbourhood) {
    features = features.filter(f =>
      (f.properties.neighbourhood || '').toLowerCase().includes(state.neighbourhood)
    );
  }

  if (state.year && state.year !== 'all') {
    const y = parseInt(state.year);
    features = features.filter(f => {
      const dt = f.properties.dispatchTime;
      if (!dt) return false;
      return new Date(dt).getFullYear() === y;
    });
  }

  if (state.station && state.station !== 'all') {
    features = features.filter(f => f.properties.station === state.station);
  }

  return { type: 'FeatureCollection', features };
}

// --- Sparkline processing + injection ---

function processSparklineData(data) {
  if (!data || !data.length) return {};
  const result = {};
  for (const row of data) {
    const name = row.neighbourhood_name;
    const year = parseInt(row.dispatch_year);
    const cnt = parseInt(row.cnt) || 0;
    if (!name || isNaN(year)) continue;
    if (!result[name]) result[name] = {};
    result[name][year] = cnt;
  }
  return result;
}

function injectSparklines(stats) {
  const table = document.querySelector('.neighbourhood-table');
  if (!table || !stats.neighbourhoodRanking) return;

  const rows = table.querySelectorAll('tbody tr');
  rows.forEach((row, i) => {
    if (i >= stats.neighbourhoodRanking.length) return;
    const [name] = stats.neighbourhoodRanking[i];
    const nData = sparklineData[name];

    let sparkCell = row.querySelector('.sparkline-cell');
    if (!sparkCell) {
      const td = document.createElement('td');
      td.className = 'sparkline-cell';
      row.appendChild(td);
      sparkCell = td;
    }

    if (nData && currentYears.length) {
      sparkCell.innerHTML = renderSparkline(nData, currentYears);
    } else {
      sparkCell.innerHTML = '';
    }
  });

  const thead = table.querySelector('thead tr');
  if (thead && !thead.querySelector('.sparkline-header')) {
    const th = document.createElement('th');
    th.className = 'sparkline-header';
    th.textContent = 'Trend';
    thead.appendChild(th);
  }
}

// --- Map layer toggles ---

function wireMapLayerToggles() {
  document.getElementById('toggle-choropleth').addEventListener('change', (e) => {
    toggleChoropleth(e.target.checked);
  });

  document.getElementById('toggle-stations').addEventListener('change', (e) => {
    toggleStations(e.target.checked);
  });

  document.getElementById('toggle-3d').addEventListener('change', (e) => {
    toggle3D(e.target.checked);
  });
}

// --- Time slider ---

function wireTimeSlider(years) {
  const slider = document.getElementById('time-slider');
  const yearLabel = document.getElementById('time-slider-year');
  const playBtn = document.getElementById('time-play');
  const resetBtn = document.getElementById('time-reset');

  if (!slider || !years.length) return;

  slider.min = 0;
  slider.max = years.length;
  slider.value = 0;

  slider.addEventListener('input', () => {
    const idx = parseInt(slider.value);
    if (idx === 0) {
      yearLabel.textContent = 'All Years';
      if (mapGeojson) updateData(mapGeojson);
    } else {
      const year = years[idx - 1];
      yearLabel.textContent = String(year);
      if (mapGeojson) setTimeFilter(year, mapGeojson);
    }
    if (isTimePlaying) stopAnimation();
  });

  playBtn.addEventListener('click', () => {
    if (isTimePlaying) stopAnimation();
    else startAnimation(years, slider, yearLabel);
  });

  resetBtn.addEventListener('click', () => {
    stopAnimation();
    slider.value = 0;
    yearLabel.textContent = 'All Years';
    if (mapGeojson) updateData(mapGeojson);
  });
}

function startAnimation(years, slider, yearLabel) {
  isTimePlaying = true;
  document.getElementById('time-play').textContent = '⏸';

  animateTimeLapse(years, mapGeojson, (year) => {
    const idx = years.indexOf(year);
    if (idx !== -1) {
      slider.value = idx + 1;
      yearLabel.textContent = String(year);
    }
  }, 1500);
}

function stopAnimation() {
  isTimePlaying = false;
  document.getElementById('time-play').textContent = '▶';
  stopTimeLapse();
}

// --- AI Panel ---

function wireAIPanel() {
  const panel = document.getElementById('ai-panel');
  const toggleBtn = document.getElementById('ai-toggle');
  const closeBtn = document.getElementById('ai-close');
  const queryInput = document.getElementById('ai-query');
  const askBtn = document.getElementById('ai-ask');
  const responseArea = document.getElementById('ai-response');

  if (!panel || !toggleBtn) return;

  // Toggle panel
  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('open');
    toggleBtn.classList.toggle('hidden', panel.classList.contains('open'));
  });

  closeBtn.addEventListener('click', () => {
    panel.classList.remove('open');
    toggleBtn.classList.remove('hidden');
  });

  // Mode buttons
  const modeButtons = panel.querySelectorAll('.ai-mode-btn');
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const modeId = btn.dataset.mode;
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      runAnalysis(modeId, null, responseArea);
    });
  });

  // Ask button / Enter key
  askBtn.addEventListener('click', () => {
    const query = queryInput.value.trim();
    if (query) {
      modeButtons.forEach(b => b.classList.remove('active'));
      runAnalysis('query', query, responseArea);
    }
  });

  queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      askBtn.click();
    }
  });
}

const LOADING_MESSAGES = {
  risk: 'Assessing neighbourhood risk levels...',
  anomaly: 'Scanning for data anomalies...',
  resource: 'Analyzing station workloads...',
  forecast: 'Projecting incident trends...',
  query: 'Thinking about your question...',
};

function runAnalysis(modeId, userQuery, responseArea) {
  // Show mode-specific loading
  const loadMsg = LOADING_MESSAGES[modeId] || 'Analyzing fire data...';
  responseArea.innerHTML = `
    <div class="ai-loading">
      <div class="ai-loading-dots"><span></span><span></span><span></span></div>
      <span>${loadMsg}</span>
    </div>
  `;

  const prompt = buildPrompt(modeId, currentStats, currentStationData, userQuery);
  if (!prompt) {
    responseArea.innerHTML = '<div class="ai-error">Could not build analysis prompt. Try a different mode.</div>';
    return;
  }

  // Create response container
  responseArea.innerHTML = '<div class="ai-response-content"></div>';
  const contentDiv = responseArea.querySelector('.ai-response-content');
  let fullText = '';

  streamAnalysis(
    getSystemPrompt(),
    prompt,
    // onToken
    (token) => {
      fullText += token;
      contentDiv.innerHTML = renderMarkdown(fullText) + '<span class="ai-cursor"></span>';
      responseArea.scrollTop = responseArea.scrollHeight;
    },
    // onDone
    () => {
      contentDiv.innerHTML = renderMarkdown(fullText);
      // Add copy button
      const copyBtn = document.createElement('button');
      copyBtn.className = 'ai-copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(fullText).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        });
      };
      responseArea.appendChild(copyBtn);
    },
    // onError
    (err) => {
      if (fullText) {
        contentDiv.innerHTML = renderMarkdown(fullText);
      } else {
        responseArea.innerHTML = `<div class="ai-error">${escapeHtml(String(err))}</div>`;
      }
    }
  );
}


// --- Utilities ---

function setProgress(text, pct) {
  const fill = document.getElementById('progress-fill');
  const label = document.getElementById('progress-text');
  if (fill) fill.style.width = `${pct}%`;
  if (label) label.textContent = text;
}

function showError(err) {
  document.getElementById('progress-bar')?.classList.add('hidden');
  const panel = document.getElementById('error-panel');
  panel.classList.remove('hidden');

  document.getElementById('error-step').textContent = 'Failed during dashboard initialization';
  document.getElementById('error-message').textContent = err.message || String(err);
  document.getElementById('error-debug').textContent = JSON.stringify({
    error: err.message,
    stack: err.stack?.split('\n').slice(0, 5).join('\n'),
  }, null, 2);
}

main();
