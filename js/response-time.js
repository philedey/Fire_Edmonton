// Estimated response time proxy using haversine distance
// Note: These are estimates based on straight-line distance × 1.4 road factor at 50 km/h.
// Actual response times depend on traffic, road network, time of day, and turnout time.

import { STATION_RESOURCES } from './station-resources.js';

const ROAD_FACTOR = 1.4;       // Straight-line to road distance multiplier (urban grid)
const AVG_SPEED_KMH = 50;      // Average emergency vehicle speed in urban setting
const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

// Station coordinates indexed by station name (e.g., "01")
let _stationCoords = null;

export function setStationCoords(coordsMap) {
  _stationCoords = coordsMap;
}

function haversine(lat1, lon1, lat2, lon2) {
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
    const [lng, lat] = f.geometry.coordinates;
    if (isNaN(lat) || isNaN(lng)) continue;
    times.push(estimateTravelMinutes(stnCoords.lat, stnCoords.lng, lat, lng));
  }

  if (!times.length) return null;

  times.sort((a, b) => a - b);
  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const mid = Math.floor(times.length / 2);
  const median = times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
  const within7 = times.filter(t => t <= 7).length;

  // Distribution buckets
  const buckets = { '0-3': 0, '3-5': 0, '5-7': 0, '7-10': 0, '10-15': 0, '15+': 0 };
  for (const t of times) {
    if (t <= 3) buckets['0-3']++;
    else if (t <= 5) buckets['3-5']++;
    else if (t <= 7) buckets['5-7']++;
    else if (t <= 10) buckets['7-10']++;
    else if (t <= 15) buckets['10-15']++;
    else buckets['15+']++;
  }

  return {
    avgTravelMin: avg,
    medianTravelMin: median,
    pctWithin7: (within7 / times.length) * 100,
    distribution: buckets,
    count: times.length,
  };
}

/**
 * Compute response time metrics for ALL stations.
 * @param {Object} mapGeojson
 * @returns {Object} keyed by station name
 */
export function computeAllStationResponseMetrics(mapGeojson) {
  if (!_stationCoords || !mapGeojson?.features?.length) return {};

  // Group incidents by station
  const byStation = {};
  for (const f of mapGeojson.features) {
    const stn = f.properties.station;
    if (!stn || !_stationCoords[stn]) continue;
    if (!byStation[stn]) byStation[stn] = [];
    const [lng, lat] = f.geometry.coordinates;
    if (!isNaN(lat) && !isNaN(lng)) {
      byStation[stn].push({ lat, lng });
    }
  }

  const results = {};
  for (const [stn, incidents] of Object.entries(byStation)) {
    const stnCoords = _stationCoords[stn];
    const times = incidents.map(i => estimateTravelMinutes(stnCoords.lat, stnCoords.lng, i.lat, i.lng));
    times.sort((a, b) => a - b);

    const avg = times.reduce((s, t) => s + t, 0) / times.length;
    const mid = Math.floor(times.length / 2);
    const median = times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
    const within7 = times.filter(t => t <= 7).length;

    results[stn] = {
      avgTravelMin: avg,
      medianTravelMin: median,
      pctWithin7: (within7 / times.length) * 100,
      count: times.length,
    };
  }

  return results;
}
