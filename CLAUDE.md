# Edmonton Fire Incidents Dashboard

## Project Overview
Interactive dashboard visualizing Edmonton fire incident data (2011-2026) from the City of Edmonton Open Data Portal. Supabase + PostGIS backend, Mapbox GL JS for maps, Chart.js for analytics, vanilla HTML/JS (no build step).

## Architecture
- **No build step** — static HTML/JS/CSS served via any HTTP server
- **Supabase backend** — PostGIS database (213K rows), RPC functions for all data
- **Two-phase loading**: Phase 1 = Supabase RPC calls (stats + charts), Phase 2 = 74K map points in background
- **IndexedDB cache** for map GeoJSON (24h TTL, stale-while-revalidate)
- **Server-side re-aggregation** on filter changes via RPC with filter params
- **6 tabs** — Overview, Stations, Operations, Trends, Insights, Scorecard (lazy-loaded)
- **Shared utilities** — `chart-utils.js` (CHART_DEFAULTS, DOUGHNUT_DEFAULTS, escapeHtml, renderMarkdown, deltaBadge, etc.)

## File Structure
```
Fire_Edmonton/
├── index.html              # HTML shell, CDN deps (Mapbox GL v3.3, Chart.js v4.4)
├── css/dashboard.css        # Dark theme, responsive, skeleton shimmer, scorecard styles
├── js/
│   ├── app.js              # Entry point — RPC orchestration, filter wiring, AI panel
│   ├── api.js              # Supabase REST + RPC queries (8 fetch functions)
│   ├── chart-utils.js      # Shared: CHART_DEFAULTS, DOUGHNUT_DEFAULTS, escapeHtml, renderMarkdown, deltaBadge, formatNum, renderSparkline
│   ├── charts.js           # Chart.js — yearly bar, monthly area, doughnut, neighbourhood table
│   ├── charts-extra.js     # Hourly, day-of-week, YoY trends, sparkline re-export
│   ├── charts-station.js   # Station bar charts + detail table with sparklines
│   ├── filters.js          # Filter state → RPC params, KPI rendering, neighbourhood/station dropdowns
│   ├── tabs.js             # Tab navigation with lazy-load callbacks
│   ├── map.js              # Mapbox GL — heatmap/cluster/points/hexbin, donut clusters, fog
│   ├── map-layers.js       # Choropleth, fire stations, 3D extrusion, time-lapse
│   ├── cache.js            # IndexedDB caching layer for map GeoJSON
│   ├── operations.js       # Operations tab — equipment analytics, duration analysis, response codes
│   ├── trends.js           # Trends tab — YTD KPIs, monthly comparison, pace charts
│   ├── insights.js         # Insights tab — workload scoring, seasonal demand, risk analysis
│   ├── scorecard.js        # Scorecard tab — side-by-side station comparison + saved comparisons
│   ├── station-compare.js  # Stations tab — station detail with KPIs, charts, AI analysis
│   └── ai.js               # Claude API integration — analysis modes, station prompts, streaming
├── scripts/
│   ├── sync_soda_to_supabase.py   # Bulk sync SODA → Supabase (full + incremental)
│   └── load_fire_stations.py      # Load 31 fire stations from Edmonton Open Data
├── server.js               # Express proxy for Anthropic API (AI panel)
├── CLAUDE.md               # This file
├── SESSION.md              # Session history and research findings
├── AI_ANALYSIS_DESIGN.md   # Claude API integration design (from research)
└── edmonton-fire-dashboard-prompt.md  # Original build spec
```

## Supabase Database
- **URL**: `https://ocylcvzqhpsfoxjgkeys.supabase.co`
- **Anon key**: in `js/api.js` and `scripts/*.py`
- **Tables**: `fire_incidents` (213,519 rows), `fire_stations` (31 rows)
- **PostGIS**: enabled, `geom` column auto-populated via trigger

### RPC Functions
| Function | Purpose |
|----------|---------|
| `dashboard_data(p_year, p_fire_type, p_neighbourhood, p_station)` | All overview stats in 1 call. Returns typeCounts, yearlyBreakdown, monthlyCounts, topNeighbourhoods, avgDuration, medianDuration, hourly, dayOfWeek, yearlyMonthly, sparklines, availableYears |
| `station_comparison(p_station)` | Station KPIs, monthly trend, all stations YTD (with median_duration), equipment profile, response codes, city avg |
| `operational_kpis(p_year)` | Duration stats (median/p90/p95), duration buckets, response codes, YTD comparison (with median_duration), outliers, duration trend, false alarm rate |
| `station_data()` | Station calls + yearly data from materialized views |
| `nearest_station(lng, lat, n)` | PostGIS spatial query |
| `incidents_in_radius(lng, lat, radius_m)` | PostGIS radius search |

### Materialized Views
| View | Purpose |
|------|---------|
| `mv_station_ytd` | Per-station monthly aggregates (avg + median duration) |
| `mv_station_calls` | Per-station totals with spatial join (avg + median duration) |
| `mv_station_yearly` | Per-station yearly breakdown for sparklines |
| `mv_ytd_comparison` | Monthly totals for YTD pacing (avg + median duration) |
| `mv_duration_distribution` | Duration histogram buckets by fire type |
| `mv_response_codes` | Response code counts per year/station |
| `mv_equipment_breakdown` | Equipment type aggregates per station |

**Refresh**: `SELECT refresh_materialized_views();`
**Sync**: `python3 scripts/sync_soda_to_supabase.py [--full|--incremental]`

## Duration / Event Time (IMPORTANT)
- `event_duration_mins` = **total event duration** (dispatch → event close), NOT response time (dispatch → arrival)
- The dataset has no arrival timestamp — actual response time cannot be computed
- Dashboard shows **median** duration as primary KPI (robust to outliers)
- `avg_duration` retained in DB as fallback; `median_duration` is the primary field
- All labels say "Event Duration" with "dispatch to close" subtitle

## Data Source (Original)
- **SODA API**: `https://data.edmonton.ca/resource/7hsn-idqi.json` (used for sync only)
- **Total records**: ~924K (all event types), ~213K fire+alarm subset
- **Fire classification**: FIRE=structure (23K), OUTSIDE FIRE+VEHICLE FIRE=outside (51K), ALARMS=other (139K)
- **Map points**: 74K (fires only, with coordinates, excludes ALARMS)
- **Date range**: 2011-2026 (updated daily by City of Edmonton, ~180 records/day)

## Key API Fields
```
event_number, event_description, event_type_group, dispatch_datetime,
dispatch_year, dispatch_month, dispatch_day, dispatch_dayofweek,
dispatch_time, event_close_datetime, event_duration_mins,
neighbourhood_name, neighbourhood_id, latitude, longitude,
geometry_point, equipment_assigned, response_code, approximate_location
```

## Related Edmonton Open Data
- Fire stations (31): `https://data.edmonton.ca/resource/b4y7-zhnz.json`
- Neighbourhood boundaries: `https://data.edmonton.ca/resource/65fr-66s6.geojson`

## Mapbox Token
```
pk.eyJ1IjoicGhpbGVkZXkiLCJhIjoiY21mcTB2OTJ4MGx0cjJrcHlvNDFtcWxuZiJ9.PlD_NmzV2pPlYoi6u41T3Q
```

## Running Locally
```bash
cd Fire_Edmonton
python3 -m http.server 8080
# Open http://localhost:8080
# For AI panel: ANTHROPIC_API_KEY=sk-... node server.js (port 3001)
```

## Completed Features
- [x] Overview tab — KPIs, yearly/monthly/type charts, neighbourhood table with sparklines
- [x] Map — heatmap, clusters (donut), points, hexbin, choropleth, fire stations, 3D extrusion, time-lapse
- [x] Stations tab — per-station KPIs, monthly trends, equipment profile, AI-powered analysis
- [x] Operations tab — equipment analytics, duration histogram, duration trend, response codes, outliers
- [x] Trends tab — YTD pacing vs prior year, monthly comparison, duration KPI with YoY delta
- [x] Insights tab — workload scoring, seasonal demand analysis, risk identification, resource allocation
- [x] Scorecard tab — side-by-side station comparison (8 metrics), radar chart, saved comparisons (localStorage)
- [x] Filters — year, fire type, neighbourhood (dropdown), station
- [x] AI integration — Claude API via Express proxy, 4 analysis modes + natural language query
- [x] Supabase — PostGIS database, materialized views, 3 RPC functions, sync scripts
- [x] Duration fix — median instead of mean, "Event Duration" labelling, dispatch-to-close clarification

## Next Steps (Prioritized Roadmap)

### Map Enhancements
- Isochrone coverage rings (Mapbox Isochrone API, 4/6/8/10 min)
- Compare/swipe mode (`mapbox-gl-compare`)
- Dispatch arcs — station → incident (deck.gl)

### Chart Enhancements
- Calendar heatmap (`chartjs-chart-matrix@2`)
- Scatter plot (duration vs hour)
- Sankey flow (type → neighbourhood → equipment, `chartjs-chart-sankey`)

### Supabase Enhancements
- Daily auto-sync via Edge Function + pg_cron
- Neighbourhood boundary polygons in Supabase (for server-side spatial joins)
- Hot spot clustering via PostGIS `ST_ClusterDBSCAN`

### AI Enhancements
- Automated monthly reports
- Anomaly detection narratives (spike identification)
- Risk forecasts by neighbourhood

## Fire Classification Logic
```
FIRE               → structure (red #ff4444)
OUTSIDE FIRE       → outside   (orange #ff9933)
VEHICLE FIRE       → outside   (orange #ff9933)
ALARMS             → other     (yellow #ffcc00)
Everything else    → excluded
```

## Theme Colors
```
Background: #0f1923 | Panel: #1a2a3a | Border: #2a3a4a
Text: #e0e6ed | Secondary: #7a8a9a | Muted: #5a6a7a
Accent: #ff6b35 | Success: #4ecdc4
```

## Conventions
- Shared utilities in `chart-utils.js` — always import from there, never duplicate
- Tab lazy-loading via `tabs.js` TABS array + callbacks in `app.js`
- Delta badges: `delta-up` = orange (bad/increase), `delta-down` = teal (good/decrease)
- No `console.log` in production — only `console.warn` for error paths, `console.error` for fatal
- Workload scoring: median-based %, >150% = Overloaded, >125% = High, <75% = Low
- Saved comparisons: localStorage key `fire_scorecard_saved`, max 20 entries
