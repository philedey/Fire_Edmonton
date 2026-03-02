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
import { getStationResource, getApparatusCount, getSpecialty, getStatusLabel, getStatusColor } from './station-resources.js';
import { EARTH_RADIUS_KM, DEG_TO_RAD } from './response-time.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const NEIGHBOURHOOD_URL = 'https://data.edmonton.ca/resource/65fr-66s6.geojson';
const FIRE_STATION_URL = 'https://data.edmonton.ca/resource/b4y7-zhnz.json';

const CIRCLE_SEGMENTS = 64;          // Polygon vertices for circle approximation
const KM_PER_DEG_LAT = 111.32;       // Approximate km per degree of latitude
const INACTIVE_MARKER_OPACITY = 0.6;
const MARKER_SIZE_PX = 28;
const POPUP_LINK_BIND_DELAY_MS = 50;  // Timeout for popup DOM readiness

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

/**
 * Resolve lat/lng from a station data object, trying multiple field formats.
 * Returns null if no valid coordinates are found.
 * @param {Object} station - Raw station record from the API
 * @returns {{ lat: number, lng: number } | null}
 */
function resolveStationCoords(station) {
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

  return (isNaN(lat) || isNaN(lng)) ? null : { lat, lng };
}

/**
 * Build popup HTML content for a station marker.
 * @param {string} stationName
 * @param {string} address
 * @param {Object|null} resource - From getStationResource()
 * @param {boolean} isActive
 * @returns {string} HTML string
 */
function buildStationPopupHtml(stationName, address, resource, isActive) {
  const rows = [`<div class="popup-title">Station ${stationName}</div>`];

  if (resource?.name) {
    rows.push(`<div class="popup-row" style="font-size:10px;color:#7a8a9a;margin-top:-2px">${resource.name}</div>`);
  }

  if (!isActive && resource) {
    const statusLabel = getStatusLabel(resource.status);
    const statusColor = getStatusColor(resource.status);
    rows.push(`<div class="popup-row"><span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;background:${statusColor};color:#fff">${statusLabel}</span></div>`);
  }

  if (address) {
    rows.push(`<div class="popup-row"><span class="popup-label">Address:</span><span>${address}</span></div>`);
  }

  const apparatusCount = resource ? getApparatusCount(resource) : 0;
  if (apparatusCount > 0) {
    rows.push(`<div class="popup-row"><span class="popup-label">Apparatus:</span><span>${apparatusCount} units</span></div>`);
  }

  if (resource?.total_min_staff) {
    rows.push(`<div class="popup-row"><span class="popup-label">Min Staff:</span><span>${resource.total_min_staff}</span></div>`);
  }

  const specialty = resource ? getSpecialty(resource) : null;
  if (specialty) {
    rows.push(`<div class="popup-row"><span class="popup-label">Specialty:</span><span>${specialty}</span></div>`);
  }

  rows.push(`<div class="popup-row" style="margin-top:6px"><a href="#stations" class="station-link" data-station="${stationName}" style="color:var(--accent);font-size:11px;cursor:pointer">View Station Details &rarr;</a></div>`);

  return rows.join('');
}

function createStationMarkers(stations) {
  for (const station of stations) {
    const coords = resolveStationCoords(station);
    if (!coords) continue;

    const stationName = station.station_name || station.name || 'Station';
    const address = station.address || station.street_address || '';
    const resource = getStationResource(stationName);
    const isActive = !resource || resource.status === 'active';

    // Create custom SVG marker element
    const el = document.createElement('div');
    el.className = 'fire-station-marker';
    el.style.cssText = `width:${MARKER_SIZE_PX}px;height:${MARKER_SIZE_PX}px;cursor:pointer;`;
    el.innerHTML = isActive ? createStationSVG() : createStationSVG('#7a8a9a');
    el.title = `Station ${stationName}`;
    if (!isActive) el.style.opacity = String(INACTIVE_MARKER_OPACITY);

    // Build popup
    const popupHtml = buildStationPopupHtml(stationName, address, resource, isActive);
    const popupEl = new mapboxgl.Popup({ offset: 18, closeButton: true, closeOnClick: true })
      .setHTML(popupHtml);

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
      }, POPUP_LINK_BIND_DELAY_MS);
    });

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([coords.lng, coords.lat])
      .setPopup(popupEl)
      .addTo(_map);

    _stationMarkers.push(marker);
  }
}

/**
 * Simple fire station SVG icon: a shield shape with a cross.
 * Matches the dark dashboard theme with a red accent.
 */
function createStationSVG(color = '#ff6b35') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28">
    <!-- Shield background -->
    <path d="M14 2 L24 7 L24 16 Q24 24 14 27 Q4 24 4 16 L4 7 Z"
          fill="#1a2a3a" stroke="${color}" stroke-width="1.5"/>
    <!-- Cross -->
    <rect x="12" y="8" width="4" height="13" rx="1" fill="${color}"/>
    <rect x="8" y="12" width="12" height="4" rx="1" fill="${color}"/>
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

// ─── 5. Station Radius Rings ─────────────────────────────────────────────────

const RADIUS_RING_SOURCE = 'radius-rings';
const RADIUS_RING_FILL = 'radius-rings-fill';
const RADIUS_RING_OUTLINE = 'radius-rings-outline';
const RADIUS_RING_LABELS = 'radius-rings-labels';
const RADIUS_RING_LABEL_SOURCE = 'radius-rings-label-pts';
let _radiusRingsVisible = false;

/**
 * Generate a GeoJSON Polygon approximating a circle on the Earth's surface.
 * Uses spherical trigonometry for accurate projection at any latitude.
 * @param {number} centerLng - Center longitude in degrees
 * @param {number} centerLat - Center latitude in degrees
 * @param {number} radiusKm  - Radius in kilometres
 * @param {number} [numPoints=CIRCLE_SEGMENTS] - Number of polygon vertices
 * @returns {Array<[number, number]>} Ring of [lng, lat] coordinates
 */
function createCircleCoords(centerLng, centerLat, radiusKm, numPoints = CIRCLE_SEGMENTS) {
  if (isNaN(centerLng) || isNaN(centerLat) || isNaN(radiusKm) || radiusKm <= 0) {
    return [];
  }

  const coords = [];
  const distRadians = radiusKm / EARTH_RADIUS_KM;
  const centerLatRad = centerLat * DEG_TO_RAD;
  const centerLngRad = centerLng * DEG_TO_RAD;
  const RAD_TO_DEG = 1 / DEG_TO_RAD;

  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const lat = Math.asin(
      Math.sin(centerLatRad) * Math.cos(distRadians) +
      Math.cos(centerLatRad) * Math.sin(distRadians) * Math.cos(angle)
    );
    const lng = centerLngRad + Math.atan2(
      Math.sin(angle) * Math.sin(distRadians) * Math.cos(centerLatRad),
      Math.cos(distRadians) - Math.sin(centerLatRad) * Math.sin(lat)
    );
    coords.push([lng * RAD_TO_DEG, lat * RAD_TO_DEG]);
  }
  return coords;
}

/**
 * Show concentric radius rings around a station on the map.
 * Each band is a donut polygon (outer ring minus inner ring).
 * @param {string} stationName
 * @param {number} lat - Station latitude
 * @param {number} lng - Station longitude
 * @param {Object} analysis - Result from computeRadiusAnalysis()
 */
export function showRadiusRings(stationName, lat, lng, analysis) {
  if (!_map || !analysis) return;

  // Clean up any existing rings
  hideRadiusRings();

  const features = [];
  const labelFeatures = [];
  const { bands, rings } = analysis;

  // Compute max density once, outside the loop (was recomputed every iteration)
  const maxDensity = Math.max(
    ...bands.filter(b => b.density != null).map(b => b.density),
    1
  );

  // Build donut polygons for each band
  let prevCoords = null;
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    const outerCoords = createCircleCoords(lng, lat, ring.radiusKm);
    if (!outerCoords.length) continue;

    // Donut: outer ring + inner ring (reversed) for polygon hole
    const coordinates = prevCoords
      ? [outerCoords, [...prevCoords].reverse()]
      : [outerCoords];

    const band = bands[i];
    // Opacity scaled by density relative to peak (higher density = more opaque)
    const opacity = band.density != null
      ? Math.max(0.1, Math.min(0.5, (band.density / maxDensity) * 0.5))
      : 0.1;

    features.push({
      type: 'Feature',
      properties: {
        color: ring.color,
        opacity,
        radiusKm: ring.radiusKm,
        count: band.count,
        density: band.density,
        label: ring.label,
      },
      geometry: { type: 'Polygon', coordinates },
    });

    // Label point at the top of each ring (offset north by radius in degrees)
    labelFeatures.push({
      type: 'Feature',
      properties: {
        text: `${ring.radiusKm} km\n${ring.count} calls`,
        color: ring.color,
      },
      geometry: {
        type: 'Point',
        coordinates: [lng, lat + (ring.radiusKm / KM_PER_DEG_LAT)],
      },
    });

    prevCoords = outerCoords;
  }

  // Add source
  _map.addSource(RADIUS_RING_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features },
  });

  _map.addSource(RADIUS_RING_LABEL_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: labelFeatures },
  });

  // Fill layer — colored bands with density-based opacity
  _map.addLayer({
    id: RADIUS_RING_FILL,
    type: 'fill',
    source: RADIUS_RING_SOURCE,
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': ['get', 'opacity'],
    },
  }, 'fires-heat');

  // Outline layer
  _map.addLayer({
    id: RADIUS_RING_OUTLINE,
    type: 'line',
    source: RADIUS_RING_SOURCE,
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.5,
      'line-opacity': 0.8,
      'line-dasharray': [4, 2],
    },
  }, 'fires-heat');

  // Label layer
  _map.addLayer({
    id: RADIUS_RING_LABELS,
    type: 'symbol',
    source: RADIUS_RING_LABEL_SOURCE,
    layout: {
      'text-field': ['get', 'text'],
      'text-size': 11,
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
      'text-anchor': 'bottom',
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': ['get', 'color'],
      'text-halo-color': '#0f1923',
      'text-halo-width': 1.5,
    },
  });

  _radiusRingsVisible = true;

  // Fly to station at appropriate zoom
  _map.flyTo({
    center: [lng, lat],
    zoom: 11.5,
    duration: 1000,
  });
}

/**
 * Remove radius ring layers and source from the map.
 */
export function hideRadiusRings() {
  if (!_map) return;

  [RADIUS_RING_FILL, RADIUS_RING_OUTLINE, RADIUS_RING_LABELS].forEach(id => {
    if (_map.getLayer(id)) _map.removeLayer(id);
  });
  [RADIUS_RING_SOURCE, RADIUS_RING_LABEL_SOURCE].forEach(id => {
    if (_map.getSource(id)) _map.removeSource(id);
  });

  _radiusRingsVisible = false;
}
