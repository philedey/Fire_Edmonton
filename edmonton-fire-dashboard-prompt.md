# Edmonton Fire Incidents Dashboard — Build Spec

## Objective

Build a production-quality interactive dashboard visualizing **all reported fire incidents in Edmonton, Alberta** by year and location. The dashboard uses **Mapbox GL JS** for geospatial visualization and **Chart.js** for analytics charts. Data is pulled live from the **City of Edmonton Open Data Portal** (Socrata SODA API).

---

## Data Source

### Primary API
- **Endpoint:** `https://data.edmonton.ca/resource/7hsn-idqi.json`
- **Dataset:** Fire Response — Current and Historical
- **Platform:** Socrata SODA API
- **Coverage:** ~840,000 total emergency response records since 2015; fire-related incidents are a subset (~61,000: ~39,000 outside fires + ~22,000 structure fires)
- **Docs:** https://dev.socrata.com/foundry/data.edmonton.ca/7hsn-idqi

### Field Discovery Strategy
The exact API field names must be auto-discovered at runtime because Socrata field names can change. On init, fetch 5 records with `$limit=5` and inspect the JSON keys. Map discovered keys to internal names using these candidate lists:

| Internal Name   | Candidate API Field Names (check in order)                                                    |
|-----------------|-----------------------------------------------------------------------------------------------|
| eventId         | `event_number`, `event_id`, `incident_number`, `id`                                          |
| eventType       | `event_type`, `incident_type`, `type`, `call_type`, `event_description`                      |
| dispatchTime    | `dispatch_date_time`, `dispatch_datetime`, `dispatch_time`, `date_time`, `incident_date`      |
| neighbourhood   | `neighbourhood`, `neighbourhood_name`, `neighborhood`, `community`, `ward`                    |
| latitude        | `latitude`, `gps_latitude`, `lat`, `y`                                                        |
| longitude       | `longitude`, `gps_longitude`, `lng`, `lon`, `x`                                               |
| responseTime    | `response_time_seconds`, `response_time`, `first_unit_response_time`                          |
| address         | `address`, `incident_address`, `location_address`                                              |
| station         | `station`, `fire_station`, `responding_station`                                                |
| equipment       | `equipment`, `apparatus`, `unit`, `assigned_equipment`                                         |

Also check for a nested location/point field (`location`, `point`, `geocoded_column`) which Socrata sometimes uses instead of separate lat/lng columns. If found, extract coordinates from `{ latitude, longitude }` or `{ coordinates: [lng, lat] }` structure.

### SODA Query Strategy

Use a **3-tier fallback** approach:

1. **Filtered + selected fields:** `$where=<eventType> like '%Fire%'&$select=<fields>&$limit=50000&$order=<dispatchTime> DESC`
2. **Filtered, all fields:** `$where=<eventType> like '%Fire%'&$limit=50000`
3. **Unfiltered:** `$limit=50000` (then filter client-side)

If the total count exceeds 50,000, implement **pagination** using `$offset` in increments of 50,000 until all records are loaded. Show progress during loading.

### Mapbox API Key
```
pk.eyJ1IjoicGhpbGVkZXkiLCJhIjoiY21mcTB2OTJ4MGx0cjJrcHlvNDFtcWxuZiJ9.PlD_NmzV2pPlYoi6u41T3Q
```

---

## Fire Classification Logic

Classify each incident's `eventType` string (case-insensitive) into one of three categories:

| Category    | Match Keywords                                                                                   | Color     |
|-------------|--------------------------------------------------------------------------------------------------|-----------|
| `structure` | Contains "STRUCTURE"                                                                             | `#ff4444` |
| `outside`   | Contains "OUTSIDE", "GRASS", "BRUSH", "VEHICLE", "RUBBISH", "DUMPSTER", "WILDLAND"              | `#ff9933` |
| `other`     | Contains "FIRE" or "ALARM" but doesn't match above                                               | `#ffcc00` |

Records not matching any fire keyword should be excluded entirely.

---

## Architecture

### Single-file HTML (preferred for portability)
- All CSS, JS inline
- External CDN dependencies only: Mapbox GL JS v3.3+, Chart.js v4.4+
- No build step required — just open in browser

### If building as a project (Node.js)
```
edmonton-fire-dashboard/
├── index.html
├── css/
│   └── dashboard.css
├── js/
│   ├── api.js          # SODA data fetching + field discovery
│   ├── map.js          # Mapbox initialization + layers
│   ├── charts.js       # Chart.js visualizations
│   ├── filters.js      # Filter state management
│   └── app.js          # Orchestration
├── package.json
└── README.md
```

---

## UI Layout

### Header Bar
- Title: "Edmonton Fire Incidents Dashboard"
- Subtitle: "Edmonton Fire Rescue Services — Open Data Portal"
- Live status indicator (green dot + record count)

### Filter Bar
- **Year dropdown** — "All Years" + each year found in data
- **Fire Type dropdown** — All / Structure / Outside
- **Neighbourhood search** — type-ahead filter (bonus)
- **Map Style dropdown** — Heatmap / Clusters / Individual Points
- **Reset button**

### KPI Row (5 cards, full width)
1. **Total Fire Incidents** — count + year range
2. **Structure Fires** — count + % of total
3. **Outside Fires** — count + % of total
4. **Top Neighbourhood** — name + incident count
5. **Median Response Time** — minutes (filter out values > 60 min as outliers)

### Main Content (2-column, 50/50 split)

#### Left: Mapbox Map
- **Dark style:** `mapbox://styles/mapbox/dark-v11`
- **Center:** `[-113.4938, 53.5461]` (Edmonton)
- **Zoom:** `10.5`
- **3 map modes** (toggled by dropdown, only one visible at a time):

  **1. Heatmap mode (default)**
  - Heatmap layer on unclustered points
  - Color ramp: transparent → dark red → orange → yellow
  - Radius scales with zoom

  **2. Cluster mode**
  - Cluster circles with color steps by count (orange → deep red)
  - Cluster count labels
  - Click cluster to zoom in (getClusterExpansionZoom)

  **3. Points mode**
  - Individual circles colored by fire class
  - Click for popup: event type, neighbourhood, date, class

- **Legend overlay** — bottom-left, showing fire type colors
- **Navigation controls** — top-right

#### Right: Charts Panel (scrollable)

**Chart 1: Fire Incidents by Year** (stacked bar)
- X: year, Y: count
- 3 stacked series: Structure (red), Outside (orange), Other (yellow)
- Tooltip: index mode, show all series

**Chart 2: Monthly Distribution** (area line)
- X: month name (Jan–Dec), Y: count
- Single series, orange line with filled area
- Smooth tension: 0.4

**Chart 3: Fire Type Breakdown** (doughnut)
- Top 8 event types by count
- Legend on right side
- Color palette: reds, oranges, yellows, teals

**Chart 4: Top 15 Neighbourhoods** (table with inline bars)
- Ranked table: #, Name, Count, proportional bar
- Scrollable, sticky header

### Theme / Colors
```
Background:      #0f1923
Panel:           #1a2a3a
Border:          #2a3a4a
Grid:            #1f2f3f
Text primary:    #e0e6ed
Text secondary:  #7a8a9a
Text muted:      #5a6a7a
Accent:          #ff6b35
Success:         #4ecdc4
Structure fire:  #ff4444
Outside fire:    #ff9933
Other fire:      #ffcc00
```

---

## Interactivity Requirements

### All filters cross-update everything
When any filter changes, ALL of these must update simultaneously:
- KPI cards
- Map data (GeoJSON source)
- All 4 charts
- Neighbourhood table

### Map click interactions
- **Points mode:** Click shows popup with event details
- **Cluster mode:** Click zooms into cluster
- **Cursor:** Pointer on hover over clickable features

### Chart.js responsive config
```javascript
{
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#7a8a9a' } } },
  scales: {
    x: { ticks: { color: '#5a6a7a' }, grid: { color: '#1f2f3f' } },
    y: { ticks: { color: '#5a6a7a' }, grid: { color: '#1f2f3f' } }
  }
}
```

---

## Loading & Error States

### Loading overlay
- Full-screen dark overlay with spinner
- Status text updates through stages: "Discovering API schema..." → "Fetching fire incidents..." → "Processing data..." → "Initializing map..."
- Detail text shows sub-status (e.g., "Attempt 2 of 3", "42,000 records loaded")

### Error state
- Show which step failed
- Display discovered field mapping for debugging
- Show error message
- Retry button (page reload)

---

## Responsive Design

### Desktop (>900px)
- 2-column layout (map | charts)
- 5 KPI cards in a row

### Tablet/Mobile (<900px)
- Single column: KPIs → Map (400px height) → Charts
- KPI row wraps to 3 columns

---

## Enhancement Wishlist (stretch goals)

1. **Time slider / animation** — scrub through years or animate fire progression over time
2. **Neighbourhood boundary polygons** — overlay Edmonton neighbourhood boundaries from another open data endpoint, shade by fire density
3. **Hour-of-day heatmap** — small multiples or a 24-hour clock chart showing when fires happen
4. **Response time analysis** — scatter plot of response time vs distance from nearest station
5. **Year-over-year trend lines** — show if fire counts are increasing or decreasing
6. **Export** — download filtered data as CSV or screenshot dashboard as PNG
7. **Dark/light mode toggle**
8. **URL state** — encode filters in URL hash so dashboards are shareable
9. **Service Worker** — cache API responses for offline viewing
10. **Neighbourhood drill-down** — click a neighbourhood on the map to see its dedicated stats panel

---

## Testing Checklist

- [ ] Dashboard loads and displays data on first open (internet required)
- [ ] Field auto-discovery works — check console for "Discovered API fields" log
- [ ] All 3 map modes render correctly (heatmap, clusters, points)
- [ ] Year filter updates all panels
- [ ] Fire type filter updates all panels
- [ ] KPI numbers are consistent with chart totals
- [ ] Popups appear on point click in points mode
- [ ] Clusters expand on click
- [ ] Charts are responsive on window resize
- [ ] Mobile layout collapses to single column
- [ ] Error state shows useful debug info if API is unreachable
- [ ] No console errors in normal operation
