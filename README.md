# Edmonton Fire Incidents Dashboard

Interactive analytics dashboard visualizing **213,000+ fire incidents** (2011–2026) from the City of Edmonton Open Data Portal. Features real-time map visualization, AI-powered station analysis, and comprehensive operational metrics across 31 fire stations.

**Live data** is synced from [Edmonton Open Data](https://data.edmonton.ca/resource/7hsn-idqi.json) into a Supabase PostGIS backend, with materialized views for sub-second query performance.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/JS/CSS — no build step |
| Maps | Mapbox GL JS v3.3 |
| Charts | Chart.js v4.4 |
| 3D Viz | deck.gl v9.1 |
| Database | Supabase (PostgreSQL + PostGIS) |
| AI | Claude API via Express proxy (SSE streaming) |
| Server | Node.js + Express |

## Features

### Overview Tab
- **KPI cards** — total incidents, structure fires, outside fires, alarms with YoY delta badges
- **Interactive map** — heatmap, clusters, and point layers with 74K fire locations
- **Neighbourhood choropleth** — colour-coded boundaries by fire density
- **3D extrusion mode** — neighbourhood blocks rise proportional to fire count
- **Fire station markers** — 31 stations with popup details and navigation links
- **Time-lapse animation** — step through years with animated map filtering
- **Charts** — yearly breakdown, monthly trends, fire type doughnut, hourly/day-of-week patterns, neighbourhood ranking with sparklines
- **Filters** — year, fire type, neighbourhood, station with server-side re-aggregation

### Stations Tab
- **Station selector** — dropdown for all 31 stations (default: Station 04)
- **8 KPI cards** — total calls, structure fires, outside fires, alarms, avg duration, city rank, multi-unit %, short calls (<5min) — all with YoY comparison
- **Monthly trend chart** — station volume vs city average (24 months)
- **Fire type mix** — doughnut breakdown for selected station
- **Equipment profile** — horizontal bar of unit type deployments
- **Response codes** — doughnut (ST/AL/NF/DG/BO/IV/ME/OT)
- **YoY stacked bar** — historical totals broken down by fire type
- **Duration distribution** — histogram of event durations by bucket
- **Equipment combos** — top 10 most common equipment combinations
- **Duration comparison** — station vs city average with delta indicator
- **All-stations table** — sortable comparison of all 31 stations
- **AI Station Analyst** — Claude-powered analysis with 4 modes:
  - Equipment Analysis — deployment patterns, multi-unit frequency
  - Performance Review — volume trends, duration, ranking assessment
  - Response Patterns — fire type mix, seasonal patterns, response codes
  - Ask About Station — free-form questions with full station context

### Operations Tab
- **5 KPI cards** — median duration, 90th percentile, multi-unit response %, no-fire rate, short calls (<5min)
- **Equipment deployments by type** — horizontal bar chart
- **Avg units per incident** — by fire type
- **Equipment combos table** — most common combinations
- **Duration histogram** — bucketed distribution (0–5, 5–15, 15–30, 30–60, 60–120, 120+ min)
- **Duration trend** — average and median by year
- **Outlier table** — incidents exceeding 60 minutes
- **Response code doughnut** — breakdown with labels
- **False alarm rate** — no-fire percentage trend over years

### Trends Tab
- **YTD KPI cards** — current year vs prior year with delta badges
- **YTD pace chart** — monthly comparison across 3 years
- **Monthly comparison table** — side-by-side with YoY delta
- **Seasonal index** — bar chart showing monthly fire activity vs average
- **Outside fire seasonality** — multi-year overlay of monthly patterns
- **Growth trajectory** — long-term trend line with linear regression
- **Growth rate table** — compound annual growth rate by fire type

### AI Analysis (Overview)
- **Risk Assessment** — neighbourhood fire risk tiers based on volume and trends
- **Anomaly Detection** — statistical outliers in yearly, seasonal, and neighbourhood data
- **Resource Optimization** — station workload distribution and rebalancing suggestions
- **Trend Forecast** — directional projections based on historical patterns
- **Ask Anything** — free-form questions about the dataset

## Architecture

```
Browser                         Supabase (PostGIS)
  │                                  │
  ├── Phase 1: Single RPC ──────────>│ dashboard_data()
  │   (all KPIs + charts)            │ station_comparison()
  │                                  │ equipment_analytics()
  │                                  │ operational_kpis()
  │                                  │
  ├── Phase 2: REST paginated ──────>│ fire_incidents (74K map points)
  │   (background, IndexedDB cache)  │
  │                                  │
  ├── AI Analysis ──> Express Proxy ─────> Anthropic API
  │                   (SSE streaming)       (Claude Sonnet)
  │
  └── Map tiles ──> Mapbox GL
```

- **Two-phase loading**: Phase 1 fetches all stats in a single RPC call. Phase 2 loads 74K map points in the background with IndexedDB caching (24h TTL, stale-while-revalidate).
- **Server-side aggregation**: Filter changes trigger new RPC calls with filter parameters — no client-side data processing for stats.
- **7 materialized views** pre-compute common aggregations for sub-second response times.

## Data Source

| Metric | Value |
|--------|-------|
| Source | [City of Edmonton Open Data Portal](https://data.edmonton.ca/resource/7hsn-idqi.json) |
| Total records | ~213K fire + alarm incidents |
| Structure fires | ~23K |
| Outside fires | ~51K |
| Alarms | ~139K |
| Map points | ~74K (fires with coordinates) |
| Fire stations | 31 |
| Date range | 2011–2026 |
| Update frequency | Daily (~180 records/day) |

**Fire classification:**
- `FIRE` → Structure fire (red)
- `OUTSIDE FIRE` / `VEHICLE FIRE` → Outside fire (orange)
- `ALARMS` → Alarm activation (yellow)

## Getting Started

### Prerequisites
- Node.js 18+
- An Anthropic API key (for AI analysis features)

### Setup

```bash
git clone https://github.com/philedey/Fire_Edmonton.git
cd Fire_Edmonton
npm install
```

Create a `.env` file:

```
ANTHROPIC_API_KEY=your-api-key-here
```

### Run

```bash
npm start
```

Open [http://localhost:8080](http://localhost:8080)

> **Without AI features**: You can also serve with `python3 -m http.server 8080` — everything except the AI analysis panel will work.

### Data Sync

To refresh the Supabase database from Edmonton Open Data:

```bash
# Full sync (all records)
python3 scripts/sync_soda_to_supabase.py --full

# Incremental sync (recent records only)
python3 scripts/sync_soda_to_supabase.py --incremental
```

## Design

Dark glassmorphism theme with `backdrop-filter: blur(20px)` glass cards, animated tab navigation, and responsive layouts down to 375px.

| Token | Value |
|-------|-------|
| Background | `#0a1018` |
| Panel | `#1a2a3a` |
| Border | `#2a3a4a` |
| Text | `#e0e6ed` |
| Accent | `#ff6b35` |
| Success | `#4ecdc4` |
| Structure fire | `#ff4444` |
| Outside fire | `#ff9933` |
| Alarm | `#ffcc00` |

## License

This project uses publicly available data from the [City of Edmonton Open Data Portal](https://data.edmonton.ca/) under their [Open Data Terms of Use](https://data.edmonton.ca/stories/s/City-of-Edmonton-Open-Data-Terms-of-Use/msh8-if28/).
