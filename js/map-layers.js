/**
 * map-layers.js
 * Additional map layers for the Edmonton Fire Incidents Dashboard:
 *   1. Neighbourhood choropleth (fire count fill)
 *   2. Fire station markers
 *   3. 3D extrusion mode
 *   4. Time-lapse animation
 *
 * All functions receive the Mapbox GL map instance from app.js.
 * New layers are inserted BELOW existing fire layers so they never obscure incident data.
 */

import { navigateToTab } from './tabs.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const NEIGHBOURHOOD_URL = 'https://data.edmonton.ca/resource/65fr-66s6.geojson';
const FIRE_STATION_URL = 'https://data.edmonton.ca/resource/b4y7-zhnz.json';

const CHOROPLETH_SOURCE = 'neighbourhoods';
const CHOROPLETH_FILL = 'neighbourhood-fill';
const CHOROPLETH_OUTLINE = 'neighbourhood-outline';
const EXTRUSION_LAYER = 'neighbourhood-extrusion';

const MAX_EXTRUSION_HEIGHT = 4000; // meters at max fire count

// Colour stops used by both choropleth and extrusion layers.
// Keyed on a normalised 0-1 value derived from fire count.
const FILL_COLOR_EXPR = [
  'interpolate', ['linear'], ['get', 'fireCount'],
  0, 'rgba(0,0,0,0)',
  1, '#4a0000',
  5, '#8b0000',
  20, '#ff4444',
  50, '#ff9933',
];

// ─── Module state ────────────────────────────────────────────────────────────

let _map = null;
let _neighbourhoodGeojson = null; // original GeoJSON from Open Data
let _stationMarkers = []; // Mapbox Marker instances
let _stationsVisible = true;
let _choroplethVisible = false;
let _3dVisible = false;
let _animationTimer = null;
let _hoverPopup = null;
let _hoveredFeatureId = null;

// ─── Initialisation ──────────────────────────────────────────────────────────

/**
 * Initialise all map layer data. Call once after the map is fully loaded.
 * @param {mapboxgl.Map} map
 */
export async function initMapLayers(map) {
  _map = map;

  // Hover popup shared across choropleth / 3D
  _hoverPopup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
  });

  // Fetch neighbourhood boundaries and station data in parallel.
  // Both are non-critical; warn on failure rather than crashing.
  const [neighbourhoods, stations] = await Promise.all([
    fetchNeighbourhoods(),
    fetchStations(),
  ]);

  if (neighbourhoods) {
    _neighbourhoodGeojson = neighbourhoods;
    addNeighbourhoodSource();
    addChoroplethLayers();
    addExtrusionLayer();
    setupChoroplethInteractions();
  }

  if (stations) {
    createStationMarkers(stations);
  }
}

// ─── Data fetching ───────────────────────────────────────────────────────────

async function fetchNeighbourhoods() {
  try {
    const res = await fetch(NEIGHBOURHOOD_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const geojson = await res.json();
    // Assign stable numeric ids for feature-state hover highlighting
    if (geojson.features) {
      geojson.features.forEach((f, i) => {
        f.id = i;
        // Ensure a fireCount property exists (will be overwritten by update)
        if (!f.properties.fireCount) f.properties.fireCount = 0;
      });
    }
    console.log(`Neighbourhood boundaries loaded: ${geojson.features.length} polygons`);
    return geojson;
  } catch (err) {
    console.warn('Failed to load neighbourhood boundaries:', err.message);
    return null;
  }
}

async function fetchStations() {
  try {
    const res = await fetch(FIRE_STATION_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log(`Fire stations loaded: ${data.length} stations`);
    return data;
  } catch (err) {
    console.warn('Failed to load fire station data:', err.message);
    return null;
  }
}

// ─── Neighbourhood source ────────────────────────────────────────────────────

function addNeighbourhoodSource() {
  if (_map.getSource(CHOROPLETH_SOURCE)) return;
  _map.addSource(CHOROPLETH_SOURCE, {
    type: 'geojson',
    data: _neighbourhoodGeojson,
    promoteId: 'id', // not used; we set id directly on features
  });
}

// ─── 1. Choropleth layers ────────────────────────────────────────────────────

function addChoroplethLayers() {
  if (_map.getLayer(CHOROPLETH_FILL)) return;

  // Fill layer: inserted before 'fires-heat' so it sits behind all incident layers
  _map.addLayer({
    id: CHOROPLETH_FILL,
    type: 'fill',
    source: CHOROPLETH_SOURCE,
    paint: {
      'fill-color': FILL_COLOR_EXPR,
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        0.75,
        0.55,
      ],
    },
    layout: {
      visibility: 'none',
    },
  }, 'fires-heat'); // insert BEFORE the heatmap

  // Outline layer
  _map.addLayer({
    id: CHOROPLETH_OUTLINE,
    type: 'line',
    source: CHOROPLETH_SOURCE,
    paint: {
      'line-color': '#2a3a4a',
      'line-width': 0.8,
    },
    layout: {
      visibility: 'none',
    },
  }, 'fires-heat');
}

function setupChoroplethInteractions() {
  // Hover highlight
  _map.on('mousemove', CHOROPLETH_FILL, (e) => {
    if (!e.features || !e.features.length) return;
    _map.getCanvas().style.cursor = 'pointer';

    // Remove previous hover state
    if (_hoveredFeatureId !== null) {
      _map.setFeatureState(
        { source: CHOROPLETH_SOURCE, id: _hoveredFeatureId },
        { hover: false }
      );
    }

    _hoveredFeatureId = e.features[0].id;
    _map.setFeatureState(
      { source: CHOROPLETH_SOURCE, id: _hoveredFeatureId },
      { hover: true }
    );

    // Tooltip
    const props = e.features[0].properties;
    const name = props.descriptive_name || props.name || 'Unknown';
    const count = props.fireCount || 0;

    _hoverPopup
      .setLngLat(e.lngLat)
      .setHTML(
        `<div class="popup-title">${name}</div>` +
        `<div class="popup-row"><span class="popup-label">Fire Incidents:</span><span>${count.toLocaleString()}</span></div>`
      )
      .addTo(_map);
  });

  _map.on('mouseleave', CHOROPLETH_FILL, () => {
    _map.getCanvas().style.cursor = '';
    if (_hoveredFeatureId !== null) {
      _map.setFeatureState(
        { source: CHOROPLETH_SOURCE, id: _hoveredFeatureId },
        { hover: false }
      );
      _hoveredFeatureId = null;
    }
    _hoverPopup.remove();
  });
}

/**
 * Toggle choropleth visibility.
 * @param {boolean} visible
 */
export function toggleChoropleth(visible) {
  _choroplethVisible = visible;
  if (!_map) return;
  const vis = visible ? 'visible' : 'none';
  if (_map.getLayer(CHOROPLETH_FILL)) {
    _map.setLayoutProperty(CHOROPLETH_FILL, 'visibility', vis);
  }
  if (_map.getLayer(CHOROPLETH_OUTLINE)) {
    _map.setLayoutProperty(CHOROPLETH_OUTLINE, 'visibility', vis);
  }
}

/**
 * Update choropleth colouring with current fire counts per neighbourhood.
 * @param {Array<[string, number]>} neighbourhoodRanking - [name, count] pairs
 */
export function updateChoroplethCounts(neighbourhoodRanking) {
  if (!_neighbourhoodGeojson || !_map) return;

  // Build lookup: normalise name to uppercase for matching
  const countMap = new Map();
  for (const [name, count] of neighbourhoodRanking) {
    countMap.set(name.toUpperCase(), count);
  }

  // Stamp fireCount onto each feature
  for (const feature of _neighbourhoodGeojson.features) {
    const key = (feature.properties.name || '').toUpperCase();
    feature.properties.fireCount = countMap.get(key) || 0;
  }

  // Push updated data to the source
  const src = _map.getSource(CHOROPLETH_SOURCE);
  if (src) src.setData(_neighbourhoodGeojson);
}

// ─── 2. Fire Station Markers ─────────────────────────────────────────────────

function createStationMarkers(stations) {
  for (const station of stations) {
    // Resolve lat/lng from whichever fields are present
    let lat = parseFloat(station.latitude);
    let lng = parseFloat(station.longitude);

    // Fallback: nested location object
    if ((isNaN(lat) || isNaN(lng)) && station.location) {
      lat = parseFloat(station.location.latitude);
      lng = parseFloat(station.location.longitude);
    }

    // Fallback: geometry_point
    if ((isNaN(lat) || isNaN(lng)) && station.geometry_point) {
      const coords = station.geometry_point.coordinates;
      if (coords) {
        lng = parseFloat(coords[0]);
        lat = parseFloat(coords[1]);
      }
    }

    if (isNaN(lat) || isNaN(lng)) continue;

    // Resolve name
    const stationName = station.station_name || station.name || 'Station';
    const address = station.address || station.street_address || '';

    // Create custom SVG marker element
    const el = document.createElement('div');
    el.className = 'fire-station-marker';
    el.style.cssText = 'width:28px;height:28px;cursor:pointer;';
    el.innerHTML = createStationSVG();
    el.title = `Station ${stationName}`;

    // Build popup with "View Details" link
    const popupEl = new mapboxgl.Popup({ offset: 18, closeButton: true, closeOnClick: true })
      .setHTML(
        `<div class="popup-title">Station ${stationName}</div>` +
        (address ? `<div class="popup-row"><span class="popup-label">Address:</span><span>${address}</span></div>` : '') +
        `<div class="popup-row" style="margin-top:6px"><a href="#stations" class="station-link" data-station="${stationName}" style="color:var(--accent);font-size:11px;cursor:pointer">View Station Details &rarr;</a></div>`
      );

    popupEl.on('open', () => {
      setTimeout(() => {
        const link = document.querySelector(`.station-link[data-station="${stationName}"]`);
        if (link) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const sel = document.getElementById('station-select');
            if (sel) { sel.value = stationName; sel.dispatchEvent(new Event('change')); }
            navigateToTab('stations');
            popupEl.remove();
          });
        }
      }, 50);
    });

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([lng, lat])
      .setPopup(popupEl)
      .addTo(_map);

    _stationMarkers.push(marker);
  }
}

/**
 * Simple fire station SVG icon: a shield shape with a cross.
 * Matches the dark dashboard theme with a red accent.
 */
function createStationSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28">
    <!-- Shield background -->
    <path d="M14 2 L24 7 L24 16 Q24 24 14 27 Q4 24 4 16 L4 7 Z"
          fill="#1a2a3a" stroke="#ff6b35" stroke-width="1.5"/>
    <!-- Cross -->
    <rect x="12" y="8" width="4" height="13" rx="1" fill="#ff6b35"/>
    <rect x="8" y="12" width="12" height="4" rx="1" fill="#ff6b35"/>
  </svg>`;
}

/**
 * Toggle fire station marker visibility.
 * @param {boolean} visible
 */
export function toggleStations(visible) {
  _stationsVisible = visible;
  for (const marker of _stationMarkers) {
    const el = marker.getElement();
    el.style.display = visible ? '' : 'none';
  }
}

// ─── 3. 3D Extrusion Layer ───────────────────────────────────────────────────

function addExtrusionLayer() {
  if (_map.getLayer(EXTRUSION_LAYER)) return;

  _map.addLayer({
    id: EXTRUSION_LAYER,
    type: 'fill-extrusion',
    source: CHOROPLETH_SOURCE,
    paint: {
      'fill-extrusion-color': FILL_COLOR_EXPR,
      'fill-extrusion-height': [
        'interpolate', ['linear'], ['get', 'fireCount'],
        0, 0,
        1, 50,
        10, 500,
        50, 2000,
        100, MAX_EXTRUSION_HEIGHT,
      ],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.78,
    },
    layout: {
      visibility: 'none',
    },
  }, 'fires-heat');
}

/**
 * Toggle 3D extrusion mode.
 * Adjusts pitch/bearing for perspective view when enabled.
 * @param {boolean} visible
 */
export function toggle3D(visible) {
  _3dVisible = visible;
  if (!_map) return;

  if (_map.getLayer(EXTRUSION_LAYER)) {
    _map.setLayoutProperty(EXTRUSION_LAYER, 'visibility', visible ? 'visible' : 'none');
  }

  if (visible) {
    _map.easeTo({ pitch: 45, bearing: -15, duration: 800 });
  } else {
    _map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
  }
}

/**
 * Update 3D extrusion heights with current fire counts.
 * Uses the same data shape as updateChoroplethCounts.
 * @param {Array<[string, number]>} neighbourhoodRanking - [name, count] pairs
 */
export function update3DCounts(neighbourhoodRanking) {
  // Reuse choropleth update; both layers read from the same source & property
  updateChoroplethCounts(neighbourhoodRanking);
}

// ─── 4. Time-Lapse Animation ─────────────────────────────────────────────────

/**
 * Filter the fires source to show only incidents from a given year.
 * @param {number} year - The year to filter to
 * @param {object} fullGeojson - The full GeoJSON FeatureCollection of fire points
 */
export function setTimeFilter(year, fullGeojson) {
  if (!_map || !fullGeojson) return;

  const filtered = {
    type: 'FeatureCollection',
    features: fullGeojson.features.filter((f) => {
      const dt = f.properties.dispatchTime;
      if (!dt) return false;
      // dispatchTime is an ISO string; extract year
      const featureYear = new Date(dt).getFullYear();
      return featureYear === year;
    }),
  };

  const src = _map.getSource('fires');
  const srcClustered = _map.getSource('fires-clustered');
  if (src) src.setData(filtered);
  if (srcClustered) srcClustered.setData(filtered);
}

/**
 * Animate through a series of years, filtering fire data for each.
 * @param {number[]} years - Array of years to step through
 * @param {object} fullGeojson - Full fire GeoJSON FeatureCollection
 * @param {function} onYearChange - Callback(year) invoked each step
 * @param {number} [speed=1500] - Milliseconds between steps
 */
export function animateTimeLapse(years, fullGeojson, onYearChange, speed = 1500) {
  stopTimeLapse(); // clear any existing animation

  if (!years || !years.length || !fullGeojson) return;

  let idx = 0;

  const step = () => {
    if (idx >= years.length) {
      // Loop back to start
      idx = 0;
    }
    const year = years[idx];
    setTimeFilter(year, fullGeojson);
    if (onYearChange) onYearChange(year);
    idx++;
    _animationTimer = setTimeout(step, speed);
  };

  step();
}

/**
 * Stop any running time-lapse animation.
 */
export function stopTimeLapse() {
  if (_animationTimer !== null) {
    clearTimeout(_animationTimer);
    _animationTimer = null;
  }
}
