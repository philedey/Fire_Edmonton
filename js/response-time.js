// Estimated response time proxy using haversine distance
// Note: These are estimates based on straight-line distance × 1.4 road factor at 50 km/h.
// Actual response times depend on traffic, road network, time of day, and turnout time.

const ROAD_FACTOR = 1.4;       // Straight-line to road distance multiplier (urban grid)
const AVG_SPEED_KMH = 50;      // Average emergency vehicle speed in urban setting

// Geo constants — exported for reuse in map-layers.js and elsewhere
export const DEG_TO_RAD = Math.PI / 180;
export const EARTH_RADIUS_KM = 6371;

// Station coordinates indexed by station name (e.g., "01")
let _stationCoords = null;

export function setStationCoords(coordsMap) {
  _stationCoords = coordsMap;
}

export function getStationCoords(stationName) {
  return _stationCoords?.[stationName] || null;
}

export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateTravelMinutes(lat1, lon1, lat2, lon2) {
  const km = haversine(lat1, lon1, lat2, lon2);
  return (km * ROAD_FACTOR) / AVG_SPEED_KMH * 60;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const RESPONSE_TARGET_MINUTES = 7; // EFRS standard response target

/** Distribution bucket boundaries (upper bound inclusive). */
const DISTRIBUTION_BOUNDS = [
  { key: '0-3',  max: 3  },
  { key: '3-5',  max: 5  },
  { key: '5-7',  max: 7  },
  { key: '7-10', max: 10 },
  { key: '10-15', max: 15 },
];

/**
 * Compute summary stats from a sorted array of travel-time values.
 * @param {number[]} sortedTimes - Pre-sorted (ascending) travel times in minutes
 * @returns {{ avgTravelMin, medianTravelMin, pctWithin7, count }}
 */
function computeTimeStats(sortedTimes) {
  const n = sortedTimes.length;
  const avg = sortedTimes.reduce((s, t) => s + t, 0) / n;
  const mid = Math.floor(n / 2);
  const median = n % 2 ? sortedTimes[mid] : (sortedTimes[mid - 1] + sortedTimes[mid]) / 2;
  const withinTarget = sortedTimes.filter(t => t <= RESPONSE_TARGET_MINUTES).length;

  return {
    avgTravelMin: avg,
    medianTravelMin: median,
    pctWithin7: (withinTarget / n) * 100,
    count: n,
  };
}

/**
 * Build distribution buckets from a sorted array of travel-time values.
 * @param {number[]} sortedTimes
 * @returns {Object} e.g. { '0-3': 12, '3-5': 30, ... , '15+': 2 }
 */
function buildDistribution(sortedTimes) {
  const buckets = {};
  for (const { key } of DISTRIBUTION_BOUNDS) buckets[key] = 0;
  buckets['15+'] = 0;

  for (const t of sortedTimes) {
    const bound = DISTRIBUTION_BOUNDS.find(b => t <= b.max);
    buckets[bound ? bound.key : '15+']++;
  }
  return buckets;
}

/**
 * Extract valid [lat, lng] coordinates from a GeoJSON feature.
 * Returns null if coordinates are missing or NaN.
 * @param {Object} feature - GeoJSON Feature with Point geometry
 * @returns {{ lat: number, lng: number } | null}
 */
function extractCoords(feature) {
  const coords = feature.geometry?.coordinates;
  if (!coords) return null;
  const [lng, lat] = coords;
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute response time metrics for a specific station using map GeoJSON data.
 * @param {string} stationName - e.g., "01"
 * @param {Object} mapGeojson - GeoJSON FeatureCollection with incident points
 * @returns {{ avgTravelMin, medianTravelMin, pctWithin7, distribution, count }}
 */
export function computeStationResponseMetrics(stationName, mapGeojson) {
  if (!_stationCoords || !mapGeojson?.features?.length) return null;

  const stnCoords = _stationCoords[stationName];
  if (!stnCoords) return null;

  const times = [];
  for (const f of mapGeojson.features) {
    if (f.properties.station !== stationName) continue;
    const pt = extractCoords(f);
    if (!pt) continue;
    times.push(estimateTravelMinutes(stnCoords.lat, stnCoords.lng, pt.lat, pt.lng));
  }

  if (!times.length) return null;

  times.sort((a, b) => a - b);
  const stats = computeTimeStats(times);
  stats.distribution = buildDistribution(times);
  return stats;
}

/**
 * Compute response time metrics for ALL stations.
 * @param {Object} mapGeojson
 * @returns {Object} keyed by station name
 */
export function computeAllStationResponseMetrics(mapGeojson) {
  if (!_stationCoords || !mapGeojson?.features?.length) return {};

  // Group incidents by station, extracting valid coordinates once
  const byStation = {};
  for (const f of mapGeojson.features) {
    const stn = f.properties.station;
    if (!stn || !_stationCoords[stn]) continue;
    const pt = extractCoords(f);
    if (!pt) continue;
    if (!byStation[stn]) byStation[stn] = [];
    byStation[stn].push(pt);
  }

  const results = {};
  for (const [stn, incidents] of Object.entries(byStation)) {
    const stnCoords = _stationCoords[stn];
    const times = incidents.map(i => estimateTravelMinutes(stnCoords.lat, stnCoords.lng, i.lat, i.lng));
    times.sort((a, b) => a - b);
    results[stn] = computeTimeStats(times);
  }

  return results;
}

// ─── Radius ring analysis ─────────────────────────────────────────────────────

const COVERAGE_TARGET_KM = 4.2;  // EFRS 7-min target radius
const BEYOND_RING_COLOR = '#7a8a9a';

export const RADIUS_RINGS = [
  { radiusKm: 1.5, estMinutes: 2.5, color: '#4ecdc4', label: '1.5 km (~2.5 min)' },
  { radiusKm: 3.0, estMinutes: 5.0, color: '#3b82f6', label: '3 km (~5 min)' },
  { radiusKm: 4.2, estMinutes: 7.0, color: '#ff6b35', label: '4.2 km (~7 min)' },
  { radiusKm: 6.0, estMinutes: 10.0, color: '#ffaa00', label: '6 km (~10 min)' },
  { radiusKm: 8.0, estMinutes: 13.4, color: '#ff4444', label: '8 km (~13 min)' },
];

/**
 * Count how many sorted values fall within each threshold using a single pass.
 * Thresholds must be in ascending order (RADIUS_RINGS already is).
 * @param {number[]} sortedValues - Pre-sorted ascending
 * @param {number[]} thresholds - Ascending threshold values
 * @returns {number[]} Cumulative counts for each threshold
 */
function countByThresholds(sortedValues, thresholds) {
  const counts = new Array(thresholds.length).fill(0);
  let ti = 0; // threshold index
  for (let i = 0; i < sortedValues.length && ti < thresholds.length; i++) {
    while (ti < thresholds.length && sortedValues[i] > thresholds[ti]) {
      // Carry forward count from the position before advancing
      if (ti + 1 < thresholds.length) counts[ti + 1] = counts[ti];
      ti++;
    }
    if (ti < thresholds.length) counts[ti]++;
  }
  // Forward-fill: later thresholds must be >= earlier ones
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] < counts[i - 1]) counts[i] = counts[i - 1];
  }
  return counts;
}

/**
 * Compute radius-based coverage analysis for a station.
 * Returns cumulative ring counts and non-cumulative band counts with density.
 *
 * Distances are computed once per incident, sorted, and then counted
 * across all ring thresholds in a single pass (O(n) after sort).
 */
export function computeRadiusAnalysis(stationName, mapGeojson) {
  if (!_stationCoords || !mapGeojson?.features?.length) return null;

  const stnCoords = _stationCoords[stationName];
  if (!stnCoords) return null;

  // Compute straight-line distance for each incident assigned to this station
  const distances = [];
  for (const f of mapGeojson.features) {
    if (f.properties.station !== stationName) continue;
    const pt = extractCoords(f);
    if (!pt) continue;
    distances.push(haversine(stnCoords.lat, stnCoords.lng, pt.lat, pt.lng));
  }

  if (!distances.length) return null;

  const totalAssigned = distances.length;

  // Sort once, then count all ring thresholds in a single pass
  distances.sort((a, b) => a - b);
  const thresholds = RADIUS_RINGS.map(r => r.radiusKm);
  const cumulativeCounts = countByThresholds(distances, thresholds);

  // Build cumulative rings
  const rings = RADIUS_RINGS.map((r, i) => {
    const count = cumulativeCounts[i];
    const area = Math.PI * r.radiusKm ** 2;
    return {
      radiusKm: r.radiusKm,
      estMinutes: r.estMinutes,
      color: r.color,
      label: r.label,
      count,
      area: +area.toFixed(2),
      density: +(count / area).toFixed(1),
      pct: +(count / totalAssigned * 100).toFixed(1),
    };
  });

  // Build non-cumulative bands
  const bands = [];
  let prevRadius = 0;
  let prevCount = 0;
  for (const ring of rings) {
    const bandCount = ring.count - prevCount;
    const bandArea = Math.PI * (ring.radiusKm ** 2 - prevRadius ** 2);
    bands.push({
      label: `${prevRadius}–${ring.radiusKm} km`,
      radiusKm: ring.radiusKm,
      color: ring.color,
      count: bandCount,
      bandArea: +bandArea.toFixed(2),
      density: bandArea > 0 ? +(bandCount / bandArea).toFixed(1) : 0,
      cumulativePct: ring.pct,
    });
    prevRadius = ring.radiusKm;
    prevCount = ring.count;
  }

  // Beyond outermost ring
  const outermost = rings[rings.length - 1];
  const beyond = totalAssigned - outermost.count;
  if (beyond > 0) {
    bands.push({
      label: `${outermost.radiusKm}+ km`,
      radiusKm: null,
      color: BEYOND_RING_COLOR,
      count: beyond,
      bandArea: null,
      density: null,
      cumulativePct: 100,
    });
  }

  // Coverage score = % within COVERAGE_TARGET_KM (the EFRS 7-min target)
  const targetRing = rings.find(r => r.radiusKm === COVERAGE_TARGET_KM);
  const coverageScore = targetRing ? targetRing.pct : 0;

  // Average distance
  const avgDistance = distances.reduce((a, b) => a + b, 0) / totalAssigned;

  return { rings, bands, coverageScore, totalAssigned, avgDistance: +avgDistance.toFixed(2) };
}
