// Weather correlation module — Edmonton Blatchford station hourly data
// Fetches from Edmonton Open Data SODA API, aggregates to daily,
// correlates with daily outside fire counts

const WEATHER_API = 'https://data.edmonton.ca/resource/ib2b-3mi4.json';
const STATION_NAME = 'EDMONTON BLATCHFORD';
const PAGE_SIZE = 50000;

let _dailyWeather = null; // { 'YYYY-MM-DD': { maxTemp, avgWind, avgHumidity } }

// --- Fetch & aggregate weather data ---

export async function fetchDailyWeather(startYear = 2011, endYear = 2025) {
  if (_dailyWeather) return _dailyWeather;

  const hourly = [];
  let offset = 0;

  // Paginate through SODA API
  while (true) {
    const url = new URL(WEATHER_API);
    url.searchParams.set('$where', `station_name='${STATION_NAME}' AND date_extract_y(date) >= ${startYear} AND date_extract_y(date) <= ${endYear}`);
    url.searchParams.set('$select', 'date,temperature_degrees_c,relative_humidity,wind_speed_km_h');
    url.searchParams.set('$order', 'date ASC');
    url.searchParams.set('$limit', String(PAGE_SIZE));
    url.searchParams.set('$offset', String(offset));

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather API failed: ${res.status}`);
    const page = await res.json();
    hourly.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Aggregate to daily
  const daily = {};
  for (const row of hourly) {
    if (!row.date) continue;
    const day = row.date.substring(0, 10); // 'YYYY-MM-DD'
    if (!daily[day]) daily[day] = { temps: [], winds: [], humidities: [] };

    const temp = parseFloat(row.temperature_degrees_c);
    const wind = parseFloat(row.wind_speed_km_h);
    const hum = parseFloat(row.relative_humidity);

    if (!isNaN(temp)) daily[day].temps.push(temp);
    if (!isNaN(wind)) daily[day].winds.push(wind);
    if (!isNaN(hum)) daily[day].humidities.push(hum);
  }

  // Compute daily aggregates
  _dailyWeather = {};
  for (const [day, d] of Object.entries(daily)) {
    if (!d.temps.length) continue;
    _dailyWeather[day] = {
      maxTemp: Math.max(...d.temps),
      avgTemp: d.temps.reduce((a, b) => a + b, 0) / d.temps.length,
      avgWind: d.winds.length ? d.winds.reduce((a, b) => a + b, 0) / d.winds.length : null,
      avgHumidity: d.humidities.length ? d.humidities.reduce((a, b) => a + b, 0) / d.humidities.length : null,
    };
  }

  return _dailyWeather;
}

// --- Compute daily fire counts from map GeoJSON ---

export function computeDailyFireCounts(mapGeojson, fireClass = 'outside') {
  const counts = {};
  if (!mapGeojson?.features) return counts;

  for (const f of mapGeojson.features) {
    const dt = f.properties?.dispatchTime;
    const cls = f.properties?.fireClass;
    if (!dt) continue;
    if (fireClass && cls !== fireClass) continue;

    const day = dt.substring(0, 10);
    counts[day] = (counts[day] || 0) + 1;
  }
  return counts;
}

// --- Pearson correlation ---

export function pearsonCorrelation(xs, ys) {
  const n = xs.length;
  if (n < 3) return { r: 0, n: 0 };

  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return { r: den > 0 ? num / den : 0, n };
}

// --- Build scatter data for weather vs fire correlation ---

export function buildWeatherFireScatter(dailyWeather, dailyFireCounts, weatherField = 'maxTemp') {
  const points = [];
  const xs = [];
  const ys = [];

  for (const [day, weather] of Object.entries(dailyWeather)) {
    const fires = dailyFireCounts[day];
    if (fires == null || fires === 0) continue; // only days with fires
    const wx = weather[weatherField];
    if (wx == null) continue;

    points.push({ x: wx, y: fires, day });
    xs.push(wx);
    ys.push(fires);
  }

  const corr = pearsonCorrelation(xs, ys);

  // Linear regression for trend line
  let slope = 0, intercept = 0;
  if (xs.length >= 2) {
    const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0, den = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - xMean) * (ys[i] - yMean);
      den += (xs[i] - xMean) ** 2;
    }
    slope = den > 0 ? num / den : 0;
    intercept = yMean - slope * xMean;
  }

  // Trend line endpoints
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const trendLine = [
    { x: xMin, y: slope * xMin + intercept },
    { x: xMax, y: slope * xMax + intercept },
  ];

  return { points, correlation: corr, trendLine, slope, intercept };
}
