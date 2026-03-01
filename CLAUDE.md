# Edmonton Fire Incidents Dashboard

## Project Overview
Interactive dashboard visualizing Edmonton fire incident data (2011-2026) from the City of Edmonton Open Data Portal (Socrata SODA API). Uses Mapbox GL JS for maps, Chart.js for analytics, vanilla HTML/JS (no build step).

## Architecture
- **No build step** — static HTML/JS/CSS served via any HTTP server
- **Supabase backend** — PostGIS database (213K rows), single RPC call for all dashboard data
- **Two-phase loading**: Phase 1 = 1 Supabase RPC call (all stats + charts), Phase 2 = 74K map points in background
- **IndexedDB cache** for map GeoJSON (24h TTL, stale-while-revalidate)
- **Server-side re-aggregation** on filter changes via RPC with filter params

## File Structure
```
Fire_Edmonton/
├── index.html              # HTML shell, CDN deps (Mapbox GL v3.3, Chart.js v4.4)
├── css/dashboard.css        # Dark theme, responsive, skeleton shimmer, progress bar
├── js/
│   ├── app.js              # Entry point — single RPC call orchestration
│   ├── api.js              # Supabase REST + RPC queries (replaces SODA)
│   ├── map.js              # Mapbox GL — heatmap/cluster/points, popups, legend
│   ├── map-layers.js       # Choropleth, fire stations, 3D extrusion, time-lapse
│   ├── charts.js           # Chart.js — yearly bar, monthly area, doughnut, neighbourhood table
│   ├── charts-extra.js     # Hourly, day-of-week, YoY trends, sparkline renderer
│   ├── filters.js          # Filter state → RPC params, debounced updates, KPI rendering
│   └── cache.js            # IndexedDB caching layer for map GeoJSON
├── scripts/
│   ├── sync_soda_to_supabase.py   # Bulk sync SODA → Supabase (full + incremental)
│   └── load_fire_stations.py      # Load 31 fire stations from Edmonton Open Data
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
- **RPC**: `dashboard_data(p_year, p_fire_type, p_neighbourhood)` — returns all stats in 1 call
- **Spatial functions**: `nearest_station(lng, lat, n)`, `incidents_in_radius(lng, lat, radius_m)`
- **Materialized views**: 7 views, refreshed via `refresh_materialized_views()`
- **Sync**: `python3 scripts/sync_soda_to_supabase.py [--full|--incremental]`

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
```

## Completed Features
- [x] Phase 1: Charts — hourly, day-of-week, YoY trends, sparklines
- [x] Phase 2: Map — choropleth, fire stations, 3D extrusion, time-lapse
- [x] Phase 3: Supabase — PostGIS database, materialized views, RPC, sync scripts

## Next Steps (Prioritized Roadmap)

### Remaining Map Features
- Isochrone coverage rings (Mapbox Isochrone API, 4/6/8/10 min)
- Compare/swipe mode (`mapbox-gl-compare`)
- HexBin aggregation (deck.gl)
- Dispatch arcs — station → incident (deck.gl)

### Remaining Charts
- Duration histogram (event_duration_mins bins)
- Calendar heatmap (`chartjs-chart-matrix@2`)
- Radar chart (multi-metric neighbourhood profiles)
- Scatter plot (duration vs hour)
- Sankey flow (type → neighbourhood → equipment, `chartjs-chart-sankey`)

### Supabase Enhancements
- Daily auto-sync via Edge Function + pg_cron
- Neighbourhood boundary polygons in Supabase (for server-side spatial joins)
- Hot spot clustering via PostGIS `ST_ClusterDBSCAN`

### AI Integration (Claude API)
- Express proxy server for Anthropic API
- Natural language query interface
- Anomaly detection narratives
- Risk forecasts by neighbourhood
- Automated monthly reports
- See AI_ANALYSIS_DESIGN.md for full design

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
