const MAPBOX_TOKEN = 'pk.eyJ1IjoicGhpbGVkZXkiLCJhIjoiY21mcTB2OTJ4MGx0cjJrcHlvNDFtcWxuZiJ9.PlD_NmzV2pPlYoi6u41T3Q';
const EDMONTON_CENTER = [-113.4938, 53.5461];
const INITIAL_ZOOM = 10.5;

const FIRE_COLORS = {
  structure: '#ff4444',
  outside: '#ff9933',
  other: '#ffcc00',
};

let map = null;
let currentMode = 'heatmap';
let popup = null;

// Donut cluster marker state
let clusterMarkers = {};
let clusterMarkersOnScreen = {};

// Pulsing dot animation
let pulsingDotAdded = false;
let pulsingDotActive = false;

// deck.gl overlay
let deckOverlay = null;
let currentGeojson = null;

export function initMap(containerId) {
  mapboxgl.accessToken = MAPBOX_TOKEN;

  map = new mapboxgl.Map({
    container: containerId,
    style: 'mapbox://styles/mapbox/dark-v11',
    center: EDMONTON_CENTER,
    zoom: INITIAL_ZOOM,
    antialias: true,
  });

  map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true });

  return new Promise((resolve) => {
    map.on('load', () => {
      addAtmosphere();
      addPulsingDot();
      addSources();
      addHeatmapLayers();
      addClusterLayers();
      addPointsLayers();
      addRecentLayer();
      initDeckOverlay();
      setMode('heatmap');
      setupInteractions();
      resolve(map);
    });
  });
}

// ─── Atmosphere / Fog ──────────────────────────────────────────────────────

function addAtmosphere() {
  map.setFog({
    color: 'rgba(15, 25, 35, 0.8)',
    'high-color': 'rgba(20, 30, 50, 0.6)',
    'horizon-blend': 0.08,
    'space-color': 'rgba(10, 15, 25, 1)',
    'star-intensity': 0.4,
  });
}

// ─── Animated pulsing dot (for recent incidents) ────────────────────────────

function addPulsingDot() {
  const size = 180;
  const pulsingDot = {
    width: size,
    height: size,
    data: new Uint8Array(size * size * 4),
    context: null,

    onAdd() {
      const canvas = document.createElement('canvas');
      canvas.width = this.width;
      canvas.height = this.height;
      this.context = canvas.getContext('2d');
    },

    render() {
      const duration = 1500;
      const t = (performance.now() % duration) / duration;
      const ctx = this.context;
      const cx = size / 2;
      const radius = 12;
      const outerRadius = radius + 40 * t;

      ctx.clearRect(0, 0, size, size);

      // Outer expanding ring
      ctx.beginPath();
      ctx.arc(cx, cx, outerRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 68, 68, ${0.35 * (1 - t)})`;
      ctx.fill();

      // Middle ring
      ctx.beginPath();
      ctx.arc(cx, cx, outerRadius * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 100, 50, ${0.25 * (1 - t)})`;
      ctx.fill();

      // Solid inner circle
      ctx.beginPath();
      ctx.arc(cx, cx, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 68, 68, 0.9)';
      ctx.fill();

      // White core glow
      ctx.beginPath();
      ctx.arc(cx, cx, radius * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 200, 150, 0.8)';
      ctx.fill();

      this.data = ctx.getImageData(0, 0, size, size).data;
      // Only repaint when the pulsing dot layer is active and visible
      if (pulsingDotActive) map.triggerRepaint();
      return true;
    },
  };

  map.addImage('pulsing-dot', pulsingDot, { pixelRatio: 2 });
  pulsingDotAdded = true;
}

// ─── Sources ────────────────────────────────────────────────────────────────

function addSources() {
  // Unclustered source (heatmap + points + recent)
  map.addSource('fires', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Clustered source with property aggregation for donut charts
  map.addSource('fires-clustered', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 60,
    clusterProperties: {
      // Aggregate fire class counts within each cluster
      structure: ['+', ['case', ['==', ['get', 'fireClass'], 'structure'], 1, 0]],
      outside: ['+', ['case', ['==', ['get', 'fireClass'], 'outside'], 1, 0]],
      other: ['+', ['case', ['==', ['get', 'fireClass'], 'other'], 1, 0]],
    },
  });

  // Recent incidents source (last 48h)
  map.addSource('fires-recent', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
}

// ─── Heatmap (with zoom-responsive transition to circles) ───────────────────

function addHeatmapLayers() {
  // Heatmap layer — fades out between zoom 11-13
  map.addLayer({
    id: 'fires-heat',
    type: 'heatmap',
    source: 'fires',
    paint: {
      'heatmap-weight': 1,
      'heatmap-intensity': [
        'interpolate', ['linear'], ['zoom'],
        8, 0.6, 11, 1.5, 14, 3,
      ],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(0,0,0,0)',
        0.1, 'rgba(30,10,60,0.4)',
        0.25, 'rgba(120,20,20,0.65)',
        0.4, 'rgba(200,40,15,0.8)',
        0.55, 'rgba(255,80,20,0.88)',
        0.7, 'rgba(255,140,40,0.92)',
        0.85, 'rgba(255,200,60,0.96)',
        1, 'rgba(255,255,180,1)',
      ],
      'heatmap-radius': [
        'interpolate', ['linear'], ['zoom'],
        8, 12, 11, 25, 14, 40,
      ],
      // Fade out heatmap as zoom increases (transition to circles)
      'heatmap-opacity': [
        'interpolate', ['linear'], ['zoom'],
        10, 0.9, 12, 0.6, 14, 0,
      ],
    },
  });

  // Transitional circle layer — fades IN as heatmap fades OUT
  map.addLayer({
    id: 'fires-heat-circles',
    type: 'circle',
    source: 'fires',
    minzoom: 11,
    paint: {
      'circle-color': [
        'match', ['get', 'fireClass'],
        'structure', FIRE_COLORS.structure,
        'outside', FIRE_COLORS.outside,
        'other', FIRE_COLORS.other,
        '#ff9933',
      ],
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        11, 2, 14, 5, 18, 10,
      ],
      'circle-stroke-width': [
        'interpolate', ['linear'], ['zoom'],
        11, 0, 13, 0.5, 16, 1,
      ],
      'circle-stroke-color': 'rgba(255,255,255,0.25)',
      'circle-opacity': [
        'interpolate', ['linear'], ['zoom'],
        11, 0, 12, 0.5, 14, 0.85,
      ],
    },
  });
}

// ─── Donut Chart Cluster Markers ────────────────────────────────────────────

function addClusterLayers() {
  // Unclustered points within cluster source (visible when zoomed in)
  map.addLayer({
    id: 'cluster-unclustered',
    type: 'circle',
    source: 'fires-clustered',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': [
        'match', ['get', 'fireClass'],
        'structure', FIRE_COLORS.structure,
        'outside', FIRE_COLORS.outside,
        'other', FIRE_COLORS.other,
        '#ff9933',
      ],
      'circle-radius': 5,
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(255,255,255,0.3)',
    },
  });

  // No GL layer for clusters — we use HTML donut markers instead
  // They are managed in updateDonutMarkers(), triggered by map 'render' event
}

function updateDonutMarkers() {
  if (currentMode !== 'clusters') return;

  const newMarkers = {};
  const features = map.querySourceFeatures('fires-clustered');

  for (const feature of features) {
    const coords = feature.geometry.coordinates;
    const props = feature.properties;

    if (!props.cluster) continue;

    const id = props.cluster_id;

    let marker = clusterMarkers[id];
    if (!marker) {
      const el = createDonutElement(props);
      marker = new mapboxgl.Marker({ element: el })
        .setLngLat(coords);
      // Click to zoom into cluster
      el.addEventListener('click', () => {
        map.getSource('fires-clustered').getClusterExpansionZoom(id, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: coords, zoom: zoom + 0.5 });
        });
      });
    }
    newMarkers[id] = marker;

    if (!clusterMarkersOnScreen[id]) {
      marker.addTo(map);
    }
  }

  // Remove markers no longer on screen
  for (const id in clusterMarkersOnScreen) {
    if (!newMarkers[id]) {
      clusterMarkersOnScreen[id].remove();
    }
  }

  // Prune orphaned markers from cache to prevent memory leak
  for (const id in clusterMarkers) {
    if (!newMarkers[id]) {
      delete clusterMarkers[id];
    }
  }

  clusterMarkersOnScreen = newMarkers;
}

function clearDonutMarkers() {
  for (const id in clusterMarkersOnScreen) {
    clusterMarkersOnScreen[id].remove();
  }
  clusterMarkers = {};
  clusterMarkersOnScreen = {};
}

function createDonutElement(props) {
  const counts = {
    structure: props.structure || 0,
    outside: props.outside || 0,
    other: props.other || 0,
  };
  const total = counts.structure + counts.outside + counts.other;

  // Size scales with total count
  const r = total < 50 ? 22 : total < 200 ? 28 : total < 1000 ? 36 : 44;
  const r0 = Math.round(r * 0.55); // inner radius (donut hole)
  const w = r * 2;

  const el = document.createElement('div');
  el.className = 'cluster-donut';
  el.style.cssText = `width:${w}px;height:${w}px;cursor:pointer;`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', w);
  svg.setAttribute('height', w);
  svg.setAttribute('viewBox', `0 0 ${w} ${w}`);

  // Draw donut segments
  const segments = [
    { count: counts.structure, color: FIRE_COLORS.structure },
    { count: counts.outside, color: FIRE_COLORS.outside },
    { count: counts.other, color: FIRE_COLORS.other },
  ];

  let offset = 0;
  for (const seg of segments) {
    if (seg.count === 0) continue;
    const pct = seg.count / total;
    const path = donutSegment(r, r, r, r0, offset, offset + pct);
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', path);
    pathEl.setAttribute('fill', seg.color);
    pathEl.setAttribute('opacity', '0.85');
    svg.appendChild(pathEl);
    offset += pct;
  }

  // Center circle with count text
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', r);
  circle.setAttribute('cy', r);
  circle.setAttribute('r', r0 - 1);
  circle.setAttribute('fill', '#0f1923');
  circle.setAttribute('stroke', 'rgba(255,255,255,0.1)');
  circle.setAttribute('stroke-width', '1');
  svg.appendChild(circle);

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', r);
  text.setAttribute('y', r);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'central');
  text.setAttribute('fill', '#e0e6ed');
  text.setAttribute('font-size', total >= 10000 ? '9' : total >= 1000 ? '10' : '11');
  text.setAttribute('font-family', 'system-ui, sans-serif');
  text.setAttribute('font-weight', '600');
  text.textContent = total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total.toLocaleString();
  svg.appendChild(text);

  el.appendChild(svg);
  return el;
}

function donutSegment(cx, cy, r, r0, startPct, endPct) {
  // SVG arc path for a donut segment
  if (endPct - startPct >= 1) endPct = startPct + 0.9999; // near-full circle
  const a0 = startPct * 2 * Math.PI - Math.PI / 2;
  const a1 = endPct * 2 * Math.PI - Math.PI / 2;
  const largeArc = endPct - startPct > 0.5 ? 1 : 0;

  const x0 = cx + Math.cos(a0) * r;
  const y0 = cy + Math.sin(a0) * r;
  const x1 = cx + Math.cos(a1) * r;
  const y1 = cy + Math.sin(a1) * r;
  const x2 = cx + Math.cos(a1) * r0;
  const y2 = cy + Math.sin(a1) * r0;
  const x3 = cx + Math.cos(a0) * r0;
  const y3 = cy + Math.sin(a0) * r0;

  return `M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${largeArc} 0 ${x3} ${y3} Z`;
}

// ─── Points Layer ──────────────────────────────────────────────────────────

function addPointsLayers() {
  map.addLayer({
    id: 'fires-points',
    type: 'circle',
    source: 'fires',
    paint: {
      'circle-color': [
        'match', ['get', 'fireClass'],
        'structure', FIRE_COLORS.structure,
        'outside', FIRE_COLORS.outside,
        'other', FIRE_COLORS.other,
        '#ff9933',
      ],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2, 13, 5, 18, 10],
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(255,255,255,0.2)',
      'circle-opacity': 0.8,
    },
  });
}

// ─── Recent Incidents Layer (pulsing dots) ──────────────────────────────────

function addRecentLayer() {
  map.addLayer({
    id: 'fires-recent',
    type: 'symbol',
    source: 'fires-recent',
    layout: {
      'icon-image': 'pulsing-dot',
      'icon-size': 0.5,
      'icon-allow-overlap': true,
    },
  });
}

function updateRecentSource(geojson) {
  if (!map || !geojson) return;

  const cutoff = Date.now() - 48 * 60 * 60 * 1000; // 48 hours ago
  const recentFeatures = geojson.features.filter(f => {
    const dt = f.properties.dispatchTime;
    if (!dt) return false;
    return new Date(dt).getTime() > cutoff;
  });

  const src = map.getSource('fires-recent');
  if (src) {
    src.setData({ type: 'FeatureCollection', features: recentFeatures });
  }
  // Only run pulsing dot animation when there are recent features
  pulsingDotActive = recentFeatures.length > 0;
  if (pulsingDotActive) map.triggerRepaint();
}

// ─── deck.gl HexagonLayer ──────────────────────────────────────────────────

function initDeckOverlay() {
  if (typeof deck === 'undefined') return;

  deckOverlay = new deck.MapboxOverlay({
    interleaved: false,
    layers: [],
  });
  map.addControl(deckOverlay);
}

function updateDeckHexbin(geojson) {
  if (!deckOverlay || !geojson) return;

  const data = geojson.features
    .filter(f => f.geometry && f.geometry.coordinates)
    .map(f => ({
      position: f.geometry.coordinates,
      fireClass: f.properties.fireClass,
    }));

  const hexLayer = new deck.HexagonLayer({
    id: 'fire-hexagons',
    data,
    getPosition: d => d.position,
    elevationScale: 50,
    extruded: true,
    radius: 300,
    coverage: 0.85,
    upperPercentile: 95,
    colorRange: [
      [30, 10, 60],
      [140, 25, 25],
      [220, 60, 20],
      [255, 130, 40],
      [255, 200, 60],
      [255, 255, 180],
    ],
    elevationRange: [0, 800],
    material: {
      ambient: 0.6,
      diffuse: 0.6,
      shininess: 40,
    },
    opacity: 0.85,
    pickable: true,
    autoHighlight: true,
    onHover: ({ object, x, y }) => {
      const tooltip = document.getElementById('deck-tooltip');
      if (tooltip) {
        if (object) {
          tooltip.style.display = 'block';
          tooltip.style.left = `${x}px`;
          tooltip.style.top = `${y}px`;
          tooltip.textContent = `${object.points.length} incidents`;
        } else {
          tooltip.style.display = 'none';
        }
      }
    },
  });

  deckOverlay.setProps({ layers: [hexLayer] });
}

function clearDeckLayers() {
  if (deckOverlay) {
    deckOverlay.setProps({ layers: [] });
  }
}

// ─── Interactions ──────────────────────────────────────────────────────────

function setupInteractions() {
  // Points/circles click → popup
  map.on('click', 'fires-points', showPopup);
  map.on('click', 'fires-heat-circles', showPopup);
  map.on('click', 'cluster-unclustered', showPopup);

  // Cursor changes
  for (const layer of ['fires-points', 'fires-heat-circles', 'cluster-unclustered']) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }

  // Update donut markers when map is idle (not every frame)
  map.on('idle', updateDonutMarkers);
  map.on('moveend', updateDonutMarkers);
}

function showPopup(e) {
  if (!e.features || !e.features.length) return;
  const props = e.features[0].properties;
  const coords = e.features[0].geometry.coordinates.slice();

  const classLabel = {
    structure: 'Structure Fire',
    outside: 'Outside Fire',
    other: 'Other Fire/Alarm',
  }[props.fireClass] || props.fireClass;

  const classColor = FIRE_COLORS[props.fireClass] || '#ff9933';

  const dateStr = props.dispatchTime
    ? new Date(props.dispatchTime).toLocaleDateString('en-CA', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : 'N/A';

  popup
    .setLngLat(coords)
    .setHTML(`
      <div class="popup-title">${props.eventType || 'Fire Incident'}</div>
      <div class="popup-row">
        <span class="popup-label">Class:</span>
        <span style="color:${classColor};font-weight:600">${classLabel}</span>
      </div>
      <div class="popup-row"><span class="popup-label">Neighbourhood:</span><span>${props.neighbourhood || 'N/A'}</span></div>
      <div class="popup-row"><span class="popup-label">Date:</span><span>${dateStr}</span></div>
      ${props.address ? `<div class="popup-row"><span class="popup-label">Address:</span><span>${props.address}</span></div>` : ''}
    `)
    .addTo(map);
}

// ─── Mode switching ────────────────────────────────────────────────────────

export function setMode(mode) {
  currentMode = mode;

  const heatLayers = ['fires-heat', 'fires-heat-circles'];
  const pointLayers = ['fires-points'];
  const clusterLayers = ['cluster-unclustered'];

  const hide = (layers) => layers.forEach(l => {
    if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', 'none');
  });
  const show = (layers) => layers.forEach(l => {
    if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', 'visible');
  });

  hide(heatLayers);
  hide(pointLayers);
  hide(clusterLayers);
  clearDonutMarkers();
  clearDeckLayers();

  if (mode === 'heatmap') {
    show(heatLayers);
  } else if (mode === 'clusters') {
    show(clusterLayers);
    // Donut markers are created/updated in the render callback
  } else if (mode === 'points') {
    show(pointLayers);
  } else if (mode === 'hexbin') {
    updateDeckHexbin(currentGeojson);
    // Tilt for 3D perspective
    map.easeTo({ pitch: 45, bearing: -15, duration: 800 });
  }

  // Reset camera if leaving hexbin
  if (mode !== 'hexbin' && map.getPitch() > 0) {
    map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
  }

  // Always show recent pulsing dots
  if (map.getLayer('fires-recent')) {
    map.setLayoutProperty('fires-recent', 'visibility', 'visible');
  }
}

export function updateData(geojson) {
  if (!map) return;
  currentGeojson = geojson;

  const src = map.getSource('fires');
  const srcClustered = map.getSource('fires-clustered');
  if (src) src.setData(geojson);
  if (srcClustered) srcClustered.setData(geojson);

  // Update recent incidents
  updateRecentSource(geojson);

  // If hexbin mode is active, update deck layer
  if (currentMode === 'hexbin') {
    updateDeckHexbin(geojson);
  }

  // Force donut marker refresh
  clusterMarkers = {};
}

export function getMode() {
  return currentMode;
}
