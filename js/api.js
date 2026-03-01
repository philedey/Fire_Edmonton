// --- Supabase Configuration ---
const SUPABASE_URL = 'https://ocylcvzqhpsfoxjgkeys.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jeWxjdnpxaHBzZm94amdrZXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNTQ3NTksImV4cCI6MjA4NzgzMDc1OX0.1Z46-veNdHJ-_2un4qP3uXQb1AhjbqQsLqgRKJKuCR0';
const PAGE_SIZE = 50000;

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

// Map event_description to internal fire class
function classifyDescription(desc) {
  if (desc === 'FIRE') return 'structure';
  if (desc === 'OUTSIDE FIRE' || desc === 'VEHICLE FIRE') return 'outside';
  if (desc === 'ALARMS') return 'other';
  const upper = (desc || '').toUpperCase();
  if (upper.includes('OUTSIDE') || upper.includes('VEHICLE')) return 'outside';
  if (upper === 'FIRE') return 'structure';
  return null;
}

// --- Supabase REST helper ---

async function supabaseRest(path, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase query failed: ${res.status} — ${path}`);
  return res.json();
}

// --- Supabase RPC helper ---

async function supabaseRpc(fnName, args = {}) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fnName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Supabase RPC failed: ${res.status} — ${fnName}`);
  return res.json();
}

// --- Parse filter state into RPC params ---

function filterToRpcParams(state) {
  const params = {};
  if (state) {
    if (state.year && state.year !== 'all') params.p_year = parseInt(state.year);
    if (state.fireType && state.fireType !== 'all') params.p_fire_type = state.fireType;
    if (state.neighbourhood) params.p_neighbourhood = state.neighbourhood;
    if (state.station && state.station !== 'all') params.p_station = state.station;
  }
  return params;
}

// --- Phase 1: All dashboard data in a single RPC call ---

export async function fetchDashboardData(filterState) {
  const params = filterToRpcParams(filterState);
  const data = await supabaseRpc('dashboard_data', params);

  return {
    stats: buildStatsFromRpc(data),
    extraCharts: {
      hourly: data.hourly || [],
      dayOfWeek: data.dayOfWeek || [],
      yearlyMonthly: data.yearlyMonthly || [],
      sparklines: data.sparklines || [],
    },
    availableYears: (data.availableYears || []).filter(y => !isNaN(y)).sort((a, b) => a - b),
  };
}

function buildStatsFromRpc(data) {
  const typeCounts = data.typeCounts || [];
  const yearlyBreakdown = data.yearlyBreakdown || [];
  const monthlyCounts = data.monthlyCounts || [];
  const topNeighbourhoods = data.topNeighbourhoods || [];

  // --- KPI totals ---
  const typeMap = {};
  for (const row of typeCounts) {
    if (row.event_description) typeMap[row.event_description] = parseInt(row.cnt);
  }
  const structure = typeMap['FIRE'] || 0;
  const outside = (typeMap['OUTSIDE FIRE'] || 0) + (typeMap['VEHICLE FIRE'] || 0);
  const other = typeMap['ALARMS'] || 0;
  const total = structure + outside + other;

  // --- Yearly data ---
  const yearlyData = {};
  const yearsSet = new Set();
  for (const row of yearlyBreakdown) {
    if (!row.dispatch_year) continue;
    const y = parseInt(row.dispatch_year);
    if (isNaN(y)) continue;
    yearsSet.add(y);
    if (!yearlyData[y]) yearlyData[y] = { structure: 0, outside: 0, other: 0 };
    const cls = classifyDescription(row.event_description);
    if (cls) yearlyData[y][cls] += parseInt(row.cnt);
  }
  const years = [...yearsSet].sort();

  // --- Monthly data ---
  const monthlyData = Array(12).fill(0);
  for (const row of monthlyCounts) {
    const m = parseInt(row.dispatch_month) - 1;
    if (m >= 0 && m < 12) monthlyData[m] = parseInt(row.cnt);
  }

  // --- Neighbourhoods ---
  const neighbourhoodRanking = topNeighbourhoods
    .filter(r => r.neighbourhood_name)
    .map(r => [r.neighbourhood_name, parseInt(r.cnt)]);
  const topNhood = neighbourhoodRanking[0] || ['N/A', 0];

  // --- Duration ---
  const avgDuration = data.avgDuration != null ? parseFloat(data.avgDuration) : null;
  const medianDuration = data.medianDuration != null ? parseFloat(data.medianDuration) : null;

  // --- Top types (for doughnut) ---
  const topTypes = typeCounts
    .filter(r => r.event_description)
    .map(r => [r.event_description, parseInt(r.cnt)]);

  return {
    total, structure, outside, other,
    topNeighbourhood: topNhood[0],
    topNeighbourhoodCount: topNhood[1],
    medianDurationMins: medianDuration ?? avgDuration,
    avgDurationMins: avgDuration,
    years, yearlyData, monthlyData,
    topTypes,
    neighbourhoodRanking,
  };
}

// --- Phase 2: Map point data (from Supabase REST) ---

export async function fetchMapPoints(onProgress) {
  const selectFields = 'latitude,longitude,event_description,neighbourhood_name,dispatch_datetime,approximate_location,nearest_station,equipment_assigned,response_code,event_duration_mins';
  let allData = [];
  let offset = 0;

  while (true) {
    const page = await supabaseRest('fire_incidents', {
      select: selectFields,
      event_description: 'in.(FIRE,OUTSIDE FIRE,VEHICLE FIRE)',
      latitude: 'not.is.null',
      order: 'dispatch_datetime.desc',
      limit: PAGE_SIZE,
      offset: offset,
    });

    allData = allData.concat(page);
    onProgress?.(allData.length);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return buildGeoJSON(allData);
}

function buildGeoJSON(rows) {
  const features = [];
  for (const r of rows) {
    const lat = parseFloat(r.latitude);
    const lng = parseFloat(r.longitude);
    if (isNaN(lat) || isNaN(lng)) continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        fireClass: classifyDescription(r.event_description),
        eventType: r.event_description || '',
        neighbourhood: r.neighbourhood_name || 'Unknown',
        dispatchTime: r.dispatch_datetime || '',
        address: r.approximate_location || '',
        station: r.nearest_station || '',
        equipment: r.equipment_assigned || '',
        responseCode: r.response_code || '',
        duration: r.event_duration_mins != null ? r.event_duration_mins : '',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

// --- Station list (for filter dropdown) ---

export async function fetchStationList() {
  const rows = await supabaseRest('fire_stations', {
    select: 'station_name',
    order: 'station_name',
  });
  return rows.map(r => r.station_name);
}

// --- Station data (separate RPC — non-blocking) ---

export async function fetchStationData() {
  const data = await supabaseRpc('station_data', {});
  return data;
}

// --- Station comparison (for Station Comparison tab) ---

export async function fetchStationComparison(station) {
  const data = await supabaseRpc('station_comparison', {
    p_station: station || null,
  });
  return data;
}

// --- Station rankings (live query, YTD/MTD/Last 7 Days) ---

export async function fetchStationRankings() {
  return await supabaseRpc('station_rankings', {});
}

// --- Equipment analytics ---

export async function fetchEquipmentAnalytics(year, station) {
  const params = {};
  if (year) params.p_year = year;
  if (station) params.p_station = station;
  const data = await supabaseRpc('equipment_analytics', params);
  return data;
}

// --- Operational KPIs (duration, response codes, YTD) ---

export async function fetchOperationalKPIs(year) {
  const params = {};
  if (year) params.p_year = year;
  const data = await supabaseRpc('operational_kpis', params);
  return data;
}

// --- Station duration buckets (direct REST query, client-side bucketing) ---

export async function fetchStationDurationBuckets(station) {
  let allRows = [];
  let offset = 0;
  const batchSize = 1000;

  while (true) {
    const page = await supabaseRest('fire_incidents', {
      select: 'event_duration_mins',
      nearest_station: `eq.${station}`,
      'event_duration_mins': 'not.is.null',
      limit: batchSize,
      offset,
    });
    allRows = allRows.concat(page);
    if (page.length < batchSize) break;
    offset += batchSize;
  }

  const buckets = { '0-5': 0, '5-15': 0, '15-30': 0, '30-60': 0, '60-120': 0, '120+': 0 };
  for (const r of allRows) {
    const d = parseFloat(r.event_duration_mins);
    if (d <= 5) buckets['0-5']++;
    else if (d <= 15) buckets['5-15']++;
    else if (d <= 30) buckets['15-30']++;
    else if (d <= 60) buckets['30-60']++;
    else if (d <= 120) buckets['60-120']++;
    else buckets['120+']++;
  }
  const total = Object.values(buckets).reduce((a, b) => a + b, 0);
  return { buckets, total };
}

