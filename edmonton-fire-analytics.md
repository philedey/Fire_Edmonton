# Edmonton Fire Response Data — Analytics & KPI Framework

## Project Overview

A comprehensive analytics platform leveraging the City of Edmonton's Fire Response open data (`7hsn-idqi`) to deliver actionable insights on emergency response performance, geographic risk patterns, and resource optimization.

**Data Source:** City of Edmonton Open Data Portal (Socrata SODA API)  
**Endpoint:** `https://data.edmonton.ca/resource/7hsn-idqi.json`  
**Records:** ~840,000+ incidents (2014–present)  
**Update Frequency:** Daily (24–48 hour delay)

---

## Data Fields

| Field | Type | Description |
|---|---|---|
| `location` | Text | Intersection or address of incident |
| `dispatch_date` | Date | Date of dispatch |
| `dispatch_time` | Time | Time of dispatch |
| `event_duration_minutes` | Number | Total event duration |
| `event_description` | Text | High-level category (12 types) |
| `equipment_assigned` | Text | Units and count deployed |
| `event_type` | Text | Granular incident classification |
| `neighbourhood` | Text | Edmonton neighbourhood name |
| `coordinates` | Point | Latitude / Longitude |

### Event Description Categories

- MEDICAL (57.07%)
- ALARMS (14.82%)
- MOTOR VEHICLE INCIDENT (6.65%)
- OUTSIDE FIRE (4.61%)
- CITIZEN ASSIST (3.82%)
- FIRE (2.58%)
- HAZARDOUS MATERIALS (2.18%)
- TRAINING/MAINTENANCE (1.84%)
- OTHER (0.99%)
- RESCUE (0.72%)
- VEHICLE FIRE (0.56%)
- COMMUNITY EVENT (0.28%)

---

## Tier 1 — Operational KPIs

### 1.1 Response Volume Tracking

- **Daily / Weekly / Monthly incident count** with rolling averages
- **Year-over-Year comparison** (2014–2025 depth)
- **Incident mix ratio** — track shifts in MEDICAL vs FIRE vs ALARM proportions over time
- **Anomaly detection** — flag days with statistically significant volume spikes

### 1.2 Response Duration Performance

- **Average event duration** by `event_description`
- **Median duration** (more resistant to outlier skew than mean)
- **90th / 95th percentile duration** — captures worst-case performance
- **Duration trend lines** — improving or degrading over time?
- **Outlier analysis** — incidents exceeding 60 minutes: what types, where, and what equipment?

### 1.3 Equipment Utilization

- **Deployments per unit type** (PUMPER, LADDER, RESCUE, DCCAR, HZUNIT, TANKER)
- **Average units per incident** by event type
- **Multi-unit response frequency** — how often are 3+ unit types dispatched?
- **Equipment escalation patterns** — which incident types trigger the heaviest response?

### 1.4 Peak Demand Analysis

- **Hourly heatmap** — dispatch volume by hour × day-of-week
- **Surge period identification** — define and track high-demand windows
- **Seasonal load patterns** — monthly volume curves with confidence intervals

---

## Tier 2 — Geographic Intelligence

### 2.1 Neighbourhood Risk Profiling

- **Top 20 neighbourhoods** by total incident volume
- **Per-capita incident rate** (cross-referenced with Edmonton census data)
- **Neighbourhood-level incident mix** — some areas skew MEDICAL, others FIRE
- **Trend by neighbourhood** — which areas are seeing accelerating or decelerating volume?

### 2.2 Spatial Analysis

- **Incident density heatmap** — geographic clustering visualization
- **FIRE and HAZMAT hotspot mapping** — identify infrastructure risk zones
- **Corridor analysis** — high-incident roadways for MOTOR VEHICLE INCIDENT
- **Coverage gap identification** — areas with high volume but distant station proximity

### 2.3 Comparative Benchmarking

- **Neighbourhood ranking table** with sortable KPIs
- **Quadrant chart** — volume vs. avg duration by neighbourhood (identify underserved areas)
- **Downtown vs. suburban incident profile comparison**

---

## Tier 3 — Trend Analysis & Forecasting

### 3.1 Seasonal Decomposition

- **OUTSIDE FIRE seasonality** — quantify summer spike coefficients
- **MEDICAL demand seasonality** — winter respiratory / cold weather patterns
- **ALARM false-positive seasonality** — weather-driven alarm triggers
- **Monthly seasonal index** per event type

### 3.2 Long-Term Trend Modeling

- **10-year volume growth rate** by incident type
- **Growth trajectory projection** — linear and exponential fit
- **Capacity planning scenarios** — at current growth, when do volume thresholds get hit?
- **Population-adjusted trend** — is growth driven by population or per-capita increases?

### 3.3 Predictive Indicators

- **Weather correlation modeling** — temperature, wind, humidity vs. OUTSIDE FIRE / VEHICLE FIRE
- **Event clustering** — do incidents in a neighbourhood predict follow-on incidents?
- **Day-of-week / holiday effects** — quantify event and long-weekend impact

---

## Tier 4 — Data Enrichment

### 4.1 Cross-Reference Datasets (Edmonton Open Data Portal)

| Dataset | ID | Enrichment Value |
|---|---|---|
| Census Population | Various | Per-capita normalization |
| Property Assessments | `q7d6-ambg` | Building age/type correlation with fire risk |
| Weather Data (Hourly) | `ib2b-3mi4` | Environmental trigger analysis |
| 311 Service Requests | Various | Leading indicator detection |
| Fire Stations | `sb3v-ytk3` | Response radius / coverage analysis |
| Fire Hydrants | `x4n2-2ke2` | Infrastructure coverage mapping |
| Building Permits | `24uj-dj8v` | Construction activity vs. alarm volume |

### 4.2 Derived Metrics

- **Response Intensity Score** — composite of duration × equipment count × event severity
- **Neighbourhood Risk Index** — weighted score combining volume, severity, and per-capita rate
- **Equipment Demand Ratio** — actual deployments vs. available fleet capacity
- **Temporal Risk Score** — probability of incident by hour/day/month for a given neighbourhood

---

## Dashboard Structure

### Page 1: Executive Summary

- Total incidents: MTD, YTD, YoY delta (%)
- Average response duration trend (30-day rolling)
- Incident category mix (donut chart)
- Top 5 neighbourhoods by volume (horizontal bar)
- Key alerts: anomalies, threshold breaches

### Page 2: Operational Deep-Dive

- Hourly × day-of-week heatmap
- Equipment deployment frequency (stacked bar)
- Duration distribution by event type (box plots)
- Outlier incident table (60+ min, sortable)
- Unit co-deployment matrix

### Page 3: Geographic View

- Interactive map with incident density overlay
- Neighbourhood ranking table (sortable by any KPI)
- Per-capita normalized choropleth
- Station coverage radius visualization
- Hotspot comparison: current month vs. same month last year

### Page 4: Trends & Forecasting

- Monthly volume by event type (stacked area chart)
- YoY overlay comparison
- Seasonal decomposition visualization
- 12-month forward projection with confidence bands
- Growth rate table by incident type

### Page 5: Weather Correlation (Enriched)

- Temperature vs. OUTSIDE FIRE scatter with regression
- Wind speed vs. fire spread duration
- Seasonal weather overlay on incident volume
- Extreme weather event impact analysis

---

## Technical Implementation

### Data Pipeline

```
Edmonton Open Data (SODA API)
    ↓
ETL Layer (n8n / Python)
    ├── Parse equipment_assigned → unit type + count
    ├── Geocode normalization
    ├── Join: census, weather, property data
    └── Compute derived metrics
    ↓
Data Warehouse (PostgreSQL / BigQuery)
    ↓
Visualization Layer (Looker Studio / React Dashboard)
```

### API Query Examples

```bash
# All fire incidents, last 30 days
https://data.edmonton.ca/resource/7hsn-idqi.json?$where=dispatch_date > '2025-02-01' AND event_description='FIRE'&$limit=5000

# Neighbourhood aggregation
https://data.edmonton.ca/resource/7hsn-idqi.json?$select=neighbourhood,count(*)&$group=neighbourhood&$order=count DESC&$limit=20

# Hourly distribution
https://data.edmonton.ca/resource/7hsn-idqi.json?$select=date_extract_hh(dispatch_time) as hour,count(*)&$group=hour&$order=hour
```

### Refresh Schedule

| Component | Frequency | Method |
|---|---|---|
| Raw data pull | Daily (6:00 AM MT) | n8n scheduled workflow |
| KPI computation | Daily (6:30 AM MT) | Post-ETL trigger |
| Weather enrichment | Hourly | Separate weather API pull |
| Dashboard refresh | Real-time (on data update) | Auto-refresh |
| Trend model retrain | Weekly (Sunday) | Scheduled job |

---

## Success Metrics

| KPI | Baseline | Target | Measurement |
|---|---|---|---|
| Dashboard adoption | 0 | 10+ weekly users | Analytics tracking |
| Data freshness | N/A | < 48 hours | Pipeline monitoring |
| Insight-to-action cycle | N/A | < 1 week | Stakeholder feedback |
| Anomaly detection accuracy | N/A | > 85% | Backtesting |

---

## Roadmap

### Phase 1 — Foundation (Weeks 1–2)

- [ ] Data pipeline: API → warehouse
- [ ] Core KPI calculations
- [ ] Executive summary dashboard

### Phase 2 — Geographic & Operational (Weeks 3–4)

- [ ] Neighbourhood profiling
- [ ] Equipment utilization analysis
- [ ] Interactive map layer

### Phase 3 — Enrichment & Forecasting (Weeks 5–6)

- [ ] Weather data integration
- [ ] Census cross-reference
- [ ] Seasonal decomposition and projections

### Phase 4 — Automation & Alerts (Weeks 7–8)

- [ ] Automated anomaly detection
- [ ] Threshold-based alerting
- [ ] Scheduled report distribution
