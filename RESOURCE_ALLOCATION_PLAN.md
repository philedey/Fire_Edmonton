# From Data to Decisions: Resource Allocation Strategy for Edmonton Fire Rescue Services

## How 213,000 Incidents Tell Us Where to Put Trucks, People, and Prevention Dollars

---

## Executive Summary

The Edmonton Fire Incidents Dashboard transforms 15 years of open data (213,000+ incidents, 2011-2026) into a decision-support tool for fire service leadership. This document outlines **seven concrete resource allocation strategies** the platform enables, the **real-world benefits** of each, and what makes this type of data analysis fundamentally different from traditional fire service reporting.

The core thesis: **Edmonton Fire Rescue Services generates massive operational data every day, but most of it sits in spreadsheets or static annual reports. When you make it queryable, visual, and AI-augmented in real time, it becomes a resource allocation tool that can save money, redistribute workload, and target prevention where it matters most.**

This is not a technology pitch. It is a plan for turning existing data into defensible decisions about where to put equipment, when to staff up, where to inspect, and what to stop doing.

---

## Part 1: What the Data Actually Shows

### The Dataset

| Metric | Value |
|--------|-------|
| Total incidents | 213,000+ |
| Structure fires (FIRE) | ~23,000 |
| Outside fires (OUTSIDE FIRE, VEHICLE FIRE) | ~51,000 |
| Alarm activations (ALARMS) | ~139,000 |
| Fire stations | 31 |
| Date range | January 2011 - present |
| Update frequency | Daily (~180 records/day) |
| Geographic coverage | 74,000 geocoded fire incidents |

### Fields Available Per Incident

- **What happened**: event description, fire classification, response code
- **When**: dispatch datetime (year, month, day, day-of-week, time of day)
- **How long**: event duration in minutes (dispatch to close)
- **Where**: neighbourhood, approximate address, latitude/longitude
- **What responded**: equipment assigned (unit types and counts), nearest station
- **Outcome codes**: ST (structure), AL (alarm), NF (no fire), DG (dangerous goods), BO (bomb), IV (investigation), ME (medical), OT (other)

### What the Data Does NOT Include

This is critical for setting expectations about what recommendations can be data-driven vs. hypothesis-driven:

- **No dispatch-to-arrival response times** — the duration field is total event time (dispatch to close), not how long it took to reach the scene. This means we cannot directly measure response time compliance with NFPA 1710 standards.
- **No actual dispatch records** — station assignments are proximity-based estimates (nearest station to incident location), not records of which station actually responded.
- **No property damage or dollar loss estimates**
- **No cause/origin data** (arson, cooking, electrical, etc.)
- **No population density or building stock data** (age, occupancy type, construction)
- **No staffing levels by station or shift**
- **No apparatus availability / out-of-service data**
- **No mutual aid records** (when neighbouring municipalities assist)

These gaps matter. They define the boundary between "the data proves this" and "the data suggests this, but further investigation is needed."

---

## Part 2: Seven Resource Allocation Strategies

### Strategy 1: Station Workload Rebalancing

**The Problem**: Not all 31 fire stations handle the same volume. Some are overwhelmed; others are underutilized. This affects crew fatigue, apparatus wear, and response quality.

**What the Data Shows**:
- The dashboard ranks all 31 stations by total call volume, structure fires, outside fires, alarms, and average event duration
- Station-level KPIs include YoY comparison (is this station getting busier or quieter?)
- Monthly trend charts compare each station's volume against the city average
- The AI Resource Optimization mode identifies stations where volume is >50% above or below the median

**Actionable Recommendations**:
1. **Identify the top 5 overloaded stations** — stations with call volume consistently 40%+ above the city average. These stations need attention: either more staffing, additional apparatus, or boundary adjustments.
2. **Identify the bottom 5 underutilized stations** — not necessarily candidates for closure (coverage still matters), but potential sources of mutual aid capacity or cross-staffing.
3. **Track workload trends year-over-year** — a station going from average to overloaded in 2-3 years signals a changing service area (new development, population growth).

**Real-World Benefit**: Workload rebalancing doesn't require building new stations. It means adjusting response boundaries, cross-staffing agreements, or targeted apparatus relocation during peak periods. A 10% reduction in peak-station call volume extends apparatus life, reduces overtime, and improves crew wellness — all without capital expenditure.

**Limitation**: Station assignments in this dataset are proximity-based estimates. Actual dispatch records (from EFRS CAD system) would be needed to confirm which stations are truly overburdened vs. just located near many incidents.

---

### Strategy 2: Temporal Staffing Optimization

**The Problem**: Fire departments staff 24/7, but incidents are not evenly distributed across hours, days, or months. Fixed staffing means you're overstaffed at 3 AM in February and understaffed at 2 PM in July.

**What the Data Shows**:
- **Hourly distribution**: the dashboard charts incident volume by hour of day (0-23h). Structure fires, outside fires, and alarms each have distinct hourly profiles.
- **Day-of-week distribution**: weekdays vs. weekends have different patterns, especially for outside fires.
- **Monthly/seasonal patterns**: outside fires peak dramatically May-September. Structure fires are more consistent year-round but spike slightly in winter (heating-related). Alarms have their own seasonal rhythm.
- **Seasonal index chart**: quantifies exactly which months are above/below average (e.g., July at 130 = 30% above average).

**Actionable Recommendations**:
1. **Shift start times**: align crew changes with the daily demand curve. If incidents ramp up at 9 AM and peak at 2 PM, starting a shift at 8 AM (instead of 6 AM) puts fresh crews on during the highest-volume period.
2. **Seasonal surge staffing**: outside fire season (May-September) may justify temporary additional staffing, overtime pre-authorization, or cross-trained wildland crews. The seasonal index quantifies exactly how much above baseline each summer month runs.
3. **Weekend vs. weekday adjustments**: if outside fires spike on weekends (yard work, recreational burning), weekend shifts in brush/wildland areas may need different equipment mixes.
4. **Winter structure fire preparedness**: if December-February shows elevated structure fire rates (heating equipment), this justifies pre-positioning structure fire apparatus and targeted public education campaigns in those months.

**Real-World Benefit**: Even modest staffing adjustments — moving one crew's shift start by 2 hours, or pre-authorizing overtime for 4 months instead of 12 — can reduce both overtime costs and response delays. The data provides the evidence base to justify these changes to union agreements and budget processes.

---

### Strategy 3: Equipment Deployment Optimization

**The Problem**: Fire apparatus is expensive ($500K-$1.5M per unit). Placing the right equipment at the right station matters enormously for both response capability and capital efficiency.

**What the Data Shows**:
- **Equipment type deployment frequency**: which unit types (pumper, ladder, rescue, hazmat, etc.) are deployed most citywide and per station
- **Average units per incident by fire type**: structure fires require more units than outside fires or alarms
- **Equipment combination analysis**: the most common equipment combos (e.g., PUMPER(1)+LADDER(1), PUMPER(2)+RESCUE(1)) reveal what units are actually deployed together
- **Multi-unit response percentage**: per station, what fraction of incidents require 3+ unit types — a proxy for incident complexity
- **Station-level equipment profiles**: which stations deploy which types, and how each compares to citywide norms

**Actionable Recommendations**:
1. **Identify equipment mismatches**: if a station handles a disproportionate share of structure fires but lacks a ladder truck, that is a coverage gap. Conversely, if a station with a ladder truck rarely handles structure fires, that apparatus may be better positioned elsewhere.
2. **Common combo analysis for pre-positioning**: if PUMPER+LADDER is the #1 equipment combo for structure fires, every station in a high-structure-fire area should have both. The combo data makes this evidence-based rather than assumption-based.
3. **Multi-unit frequency as a complexity indicator**: stations with high multi-unit rates handle complex incidents. These stations may need more specialized apparatus, more crew members per shift, or faster mutual aid agreements with neighbouring stations.
4. **Specialty apparatus positioning**: hazmat, heavy rescue, and technical rescue units serve large areas. The geographic distribution of incident types helps determine where these units should be housed for optimal coverage.

**Real-World Benefit**: Mispositioned apparatus is the most expensive resource allocation error in fire services. A $1.2M ladder truck at a station that handles 90% alarms and 5% structure fires is not optimal. The equipment deployment data provides the evidence to justify apparatus relocation decisions to council and the public.

---

### Strategy 4: False Alarm and Short-Duration Call Reduction

**The Problem**: A significant percentage of fire department responses result in no actual fire. False alarms waste crew time, wear out apparatus, and — critically — pull resources away from real emergencies.

**What the Data Shows**:
- **False alarm rate trend**: the NF (no-fire) response code percentage over time, tracked annually
- **Short-duration calls (<5 min)**: calls that resolve in under 5 minutes are likely false alarms, cancelled dispatches, or incidents where no action was needed. The dashboard shows this as a percentage of total calls, both citywide and per station.
- **Response code distribution**: the breakdown of NF, AL, ST, and other codes reveals the actual outcome distribution
- **Per-station false alarm rates**: some stations may have much higher false alarm rates due to their service area (e.g., commercial districts with many automatic alarm systems)

**Actionable Recommendations**:
1. **Alarm verification programs**: if the false alarm rate is 15-25%, an alarm verification program (requiring alarm companies to confirm activation before dispatching) can cut false alarm responses by 50-70%. The data quantifies the current baseline and can track the program's impact.
2. **Nuisance alarm ordinances**: identify addresses or neighbourhoods with repeat false alarms. Many cities charge escalating fees for repeated false alarms — the data identifies where these ordinances would have the most impact.
3. **Dispatch triage improvements**: short-duration calls (<5 min) suggest incidents where a full fire response was unnecessary. Analyzing these by type and location can identify opportunities for tiered dispatch (send a single unit to investigate before committing full resources).
4. **Station-specific false alarm reduction**: if Station X has a 30% false alarm rate while the city average is 15%, investigate the service area — likely a concentration of commercial alarm systems.

**Real-World Benefit**: Every false alarm response costs $1,000-$3,000 in direct costs (fuel, apparatus wear, crew time) and carries an opportunity cost of unavailability for real emergencies. If a city runs 15,000 alarm calls per year at a 20% false rate, that's 3,000 wasted responses — potentially $3-9M/year in avoidable costs. Even a 25% reduction through verification programs pays for itself immediately.

---

### Strategy 5: Neighbourhood-Level Prevention Targeting

**The Problem**: Fire prevention budgets are limited. Inspections, public education campaigns, and code enforcement cannot cover every neighbourhood equally. They need to be targeted where the risk and return on investment are highest.

**What the Data Shows**:
- **Neighbourhood fire ranking**: the top 15-20 neighbourhoods by total incident count, with sparkline trends showing whether each is getting better or worse
- **Neighbourhood fire type mix**: some neighbourhoods have disproportionate structure fire rates (indicating older building stock or code compliance issues), while others have high outside fire rates (indicating vegetation management issues)
- **Choropleth map**: colour-coded neighbourhood boundaries showing fire density at a glance
- **3D extrusion mode**: neighbourhood blocks rise proportional to fire count — visceral, presentation-ready visualization
- **AI Risk Assessment**: automatically classifies neighbourhoods into High/Medium/Elevated risk tiers and identifies mitigation priorities based on volume + trend direction

**Actionable Recommendations**:
1. **Tiered inspection schedules**: the top 10 neighbourhoods by structure fire count should receive the most frequent building inspections. The data provides the evidence to justify this resource allocation to property owners and council.
2. **Seasonal prevention campaigns**: neighbourhoods with high outside fire rates need targeted spring/summer messaging (yard burning bans, BBQ safety, vehicle fire prevention). The seasonal data pinpoints exactly when to start and end these campaigns.
3. **Trend-based escalation**: a neighbourhood that was mid-tier 3 years ago but is now top-5 is a higher priority than a neighbourhood that has been high but stable. The YoY trend data identifies these emerging hotspots.
4. **Fire type-specific interventions**:
   - High structure fires → building inspections, smoke alarm programs, cooking safety education
   - High outside fires → vegetation management, burn bans, wildland-urban interface planning
   - High alarms → alarm maintenance requirements, nuisance alarm enforcement

**Real-World Benefit**: Targeted prevention is 10-50x more cost-effective than suppression. A $50,000 neighbourhood-focused smoke alarm installation program that prevents 2-3 structure fires saves $500K-$1M in suppression and property loss costs. The data provides the targeting intelligence to maximize prevention ROI.

---

### Strategy 6: Long-Term Capital and Budget Planning

**The Problem**: Fire department budgets are set 1-3 years in advance. Growth trends, category shifts, and seasonal intensification all need to be factored into budget requests — but they're often based on gut feel rather than data.

**What the Data Shows**:
- **Growth trajectory**: 15-year trend with linear regression showing the overall direction and rate of change
- **Compound Annual Growth Rate (CAGR) by fire type**: separate growth rates for structure fires, outside fires, and alarms — these categories grow at very different rates
- **YTD pace tracking**: the current year's monthly trajectory compared to the prior 2 years, providing early warning of whether the year will end above or below budget
- **Monthly comparison tables**: side-by-side monthly numbers with YoY deltas, showing exactly where the year is tracking differently
- **AI Trend Forecast**: directional projections (not predictions) based on historical patterns, with category-specific assessments

**Actionable Recommendations**:
1. **Evidence-based budget requests**: instead of "we need 5% more next year," the CAGR data supports "outside fires have grown at 3.2%/year for 15 years, and the seasonal index shows summer peaks are intensifying — we need $X for seasonal surge capacity."
2. **YTD early warning system**: if by June the YTD pace is tracking 12% above the prior year, leadership knows immediately — not at year-end — that overtime and apparatus costs will exceed budget. This enables mid-year adjustments.
3. **Category-specific planning**: if structure fires are flat but outside fires are growing at 4%/year, that argues for wildland/brush apparatus and prevention investment, not more ladder trucks.
4. **New station justification**: if specific neighbourhoods show consistent growth and workload data shows nearby stations are already overloaded, that is a data-backed case for a new station — the most expensive capital decision in fire services ($5-15M).
5. **Apparatus replacement scheduling**: growth trends by fire type inform what KIND of apparatus to order as replacements. If the future is more outside fires and fewer structure fires, the apparatus fleet mix should shift accordingly.

**Real-World Benefit**: Data-driven budget requests are harder for council to cut and easier to defend publicly. A fire chief who says "the data shows..." is more persuasive than one who says "I think we need..." This is especially powerful for capital decisions (new stations, apparatus purchases) that commit $5-15M over 20-30 year lifecycles.

---

### Strategy 7: Operational Efficiency Benchmarking

**The Problem**: Without benchmarks, there is no way to know if a station, crew, or process is performing well or poorly. Duration, response codes, equipment utilization, and multi-unit rates are all performance signals — but only if you have the city average and peer comparisons to contextualize them.

**What the Data Shows**:
- **Duration metrics**: median, average, 90th percentile, and 95th percentile event durations — citywide and per station
- **Duration distribution histograms**: bucketed (0-5, 5-15, 15-30, 30-60, 60-120, 120+ minutes) showing the shape of the duration curve, not just the average
- **Duration trend over time**: are events getting longer or shorter year-over-year?
- **Station vs. city average comparisons**: every station metric shown alongside the city average with percentage delta
- **Outlier table**: incidents exceeding 60 minutes — what, where, when, what equipment
- **All-stations ranking table**: sortable comparison of all 31 stations on every metric

**Actionable Recommendations**:
1. **Identify duration outliers**: stations with average event durations significantly above the city average warrant investigation. Is it the incident mix (more complex fires)? Geographic factors (longer travel times)? Operational factors (crew efficiency)?
2. **Long-duration incident review**: the 60+ minute outlier table identifies specific incidents for post-incident review. These are the events consuming the most resources — understanding why they take so long can drive process improvements.
3. **Short-duration analysis**: if 15% of a station's calls resolve in <5 minutes, that suggests either dispatch optimization opportunities (could a single unit have been sent?) or false alarm issues specific to that station's area.
4. **Peer benchmarking for station captains**: station-level report cards showing where each station ranks on key metrics give captains concrete performance targets and facilitate healthy inter-station accountability.

**Real-World Benefit**: What gets measured gets managed. Station captains who see their duration metrics compared to peers are motivated to improve. Operations chiefs who see the outlier table can identify systemic issues (a particular neighbourhood with always-long incidents, suggesting access or water supply problems). Over time, benchmarking drives continuous improvement without additional spending.

---

## Part 3: The Real-World Benefits of This Type of Analysis

### Why This Is Different From Annual Reports

Traditional fire service reporting produces a static annual report: total calls, total fires, maybe a few charts. It is backward-looking, non-interactive, and updated once per year. This dashboard is fundamentally different in five ways:

**1. Real-time, not annual**: data syncs daily. A fire chief can check YTD pace against budget on any day, not wait 6 months for the annual report.

**2. Interactive, not static**: filters for year, fire type, neighbourhood, and station allow any stakeholder to answer their own questions. A councillor asking "how are fires trending in my ward?" gets an answer in 10 seconds, not a 2-week data request.

**3. Multi-dimensional, not flat**: the same data is presented as maps, charts, KPIs, tables, and AI narratives. Each visualization reveals different patterns. A heatmap shows geographic concentration. A seasonal index shows temporal patterns. A duration histogram shows operational efficiency. The same dataset, five different decision lenses.

**4. AI-augmented, not raw**: the Claude-powered analysis modes transform raw data into structured insights — risk tiers, anomaly flags, resource optimization suggestions, and trend projections. This bridges the gap between "here's the data" and "here's what it means."

**5. Station-level granularity**: city-level aggregates mask enormous variation between stations. This platform surfaces station-level performance for all 31 stations, enabling the kind of targeted management that citywide averages cannot support.

### Quantifiable Benefits

| Benefit Category | Mechanism | Estimated Impact |
|-----------------|-----------|-----------------|
| False alarm reduction | Alarm verification program informed by NF rate data | 1,500-3,000 fewer responses/year, saving $1.5-9M |
| Overtime reduction | Seasonal staffing alignment based on monthly demand curves | 5-15% reduction in unplanned overtime |
| Apparatus lifecycle extension | Workload rebalancing across stations | 1-3 years additional apparatus life ($200K-$500K per unit) |
| Prevention ROI | Targeted inspections in top-risk neighbourhoods | 10-20% reduction in structure fires in targeted areas |
| Budget accuracy | YTD pace tracking and growth rate data | Fewer mid-year budget surprises, stronger budget defense |
| Capital planning | Growth trends and workload data for new station justification | Avoid premature construction ($5-15M) or delayed construction (coverage gaps) |
| Operational efficiency | Duration benchmarking and outlier review | 5-10% reduction in average event duration over 3 years |

### Intangible Benefits

- **Political defensibility**: data-backed decisions are harder to criticize. "The data shows Station X handles 45% more calls than average" is a stronger argument than "we feel Station X is busy."
- **Public transparency**: an open-data dashboard demonstrates accountability to taxpayers. Edmonton's open data portal makes this politically aligned.
- **Grant eligibility**: many federal and provincial fire service grants (including FEMA equivalents in Canada) require data-driven justification. This platform generates that justification automatically.
- **Insurance implications**: municipal fire protection ratings (used by insurers to set premiums) consider data-driven management practices. Better data = better ratings = lower premiums for residents and businesses.
- **Recruitment and retention**: fire departments that use modern data tools attract analytically-minded recruits and demonstrate organizational modernization.

---

## Part 4: What Additional Data Would Unlock

The current dataset is powerful but has known gaps. Each gap represents an opportunity to make the analysis more actionable:

| Data Gap | What It Would Enable | Source |
|----------|---------------------|--------|
| **Dispatch-to-arrival response times** | NFPA 1710 compliance measurement, true response time mapping, coverage gap identification | EFRS CAD system |
| **Actual dispatch station** (not just nearest) | Accurate workload measurement, mutual aid analysis, cross-station response patterns | EFRS CAD system |
| **Property damage / dollar loss** | Cost-benefit analysis of prevention programs, economic impact assessment by neighbourhood | EFRS incident reports |
| **Fire cause/origin** | Targeted prevention (cooking vs. electrical vs. arson), code enforcement priorities | EFRS fire investigation reports |
| **Building stock data** (age, type, occupancy) | Structural risk modeling, inspection prioritization by building age/type | City of Edmonton property assessment |
| **Population density by neighbourhood** | Per-capita fire rates (normalizing for population), growth area identification | Census / municipal data |
| **Staffing levels by station/shift** | True workload-per-firefighter metrics, staffing model optimization | EFRS HR/scheduling system |
| **Apparatus availability data** | Actual available coverage at any moment, maintenance scheduling optimization | EFRS fleet management |
| **Weather data** | Correlation analysis (temperature → structure fires, wind/drought → outside fires) | Environment Canada |
| **Call-for-service data** (all types) | Total emergency workload (medical, hazmat, rescue, public assist) — fires are a subset of what fire stations respond to | EFRS CAD system |

The highest-value additions would be **response times** and **actual dispatch records**. These two fields alone would transform the platform from "incident analysis" to "performance management."

---

## Part 5: Implementation Roadmap

### Phase 1: Quick Wins (Current Capabilities)

These recommendations can be actioned immediately with the current dashboard:

1. **Generate station workload rankings** → Share with operations chiefs for awareness
2. **Identify top 3 false-alarm-heavy stations** → Propose targeted alarm verification pilot
3. **Create seasonal staffing profile** → Present hourly/monthly demand curves to scheduling team
4. **Run AI Risk Assessment** → Generate neighbourhood risk tiers for prevention division
5. **Produce YTD pace report** → Monthly dashboard review for budget tracking

### Phase 2: Enhanced Analysis (3-6 months)

Add capabilities that deepen the analysis:

1. **Response time isochrones** — Mapbox Isochrone API showing 4/6/8/10-minute coverage rings from each station, revealing true coverage gaps
2. **Hot spot clustering** — PostGIS `ST_ClusterDBSCAN` to identify statistically significant incident clusters (not just high-count neighbourhoods)
3. **Automated monthly reporting** — scheduled AI analysis generating narrative reports for each station captain
4. **Comparative dashboards** — station-vs-station comparison mode with normalized metrics
5. **Weather correlation** — overlay Environment Canada data to quantify how temperature, wind, and drought conditions drive demand

### Phase 3: Integrated Decision Support (6-12 months)

Connect to internal EFRS systems for full decision-support capability:

1. **CAD integration** — real dispatch records and response times
2. **Staffing model integration** — actual crew levels per station per shift
3. **Apparatus tracking** — real-time availability and maintenance scheduling
4. **Prediction models** — weekly/monthly demand forecasting using historical patterns + weather
5. **What-if scenario planning** — "if we close Station X, how does coverage change?" simulation using isochrone and incident data

---

## Part 6: The Meta-Argument — Why Fire Services Should Do This

### The Cost of Not Knowing

Fire departments that don't analyze their data still make resource allocation decisions. They just make them based on tradition, intuition, and politics instead of evidence. The cost of this:

- **Apparatus in the wrong location**: a $1.2M ladder truck at a station that handles 90% alarms and 5% structure fires. Over a 20-year apparatus lifecycle, that is $24M in misallocated capital.
- **Flat staffing on a curved demand curve**: paying 24/7 staffing at the same level when demand varies 3:1 between peak and off-peak hours. The excess capacity at 3 AM in February has zero value, while the shortage at 2 PM in July delays response.
- **Untargeted prevention**: spending the same amount on prevention in every neighbourhood when fire risk varies 10:1 between the highest and lowest neighbourhoods. This is like distributing police patrols equally across all neighbourhoods regardless of crime rates.
- **Reactive budgeting**: discovering at year-end that outside fire growth consumed the overtime budget, when the trend has been visible for 5 years in the historical data.

### The Fundamental Value Proposition

The dashboard costs essentially nothing to operate — it is built on free open data, open-source tools, and a commodity cloud database. The analysis it produces would cost $50,000-$200,000 annually if commissioned from a consulting firm. And consultants produce static reports; this platform produces living, queryable, AI-augmented analysis that is always current.

**The question is not "can we afford to do this analysis?"**
**The question is "can we afford not to?"**

Every fire department in North America is under pressure to justify budgets, demonstrate efficiency, and plan for changing demand. The departments that master their data will make better decisions, defend their budgets more effectively, and — most importantly — get the right resources to the right place at the right time.

That is the real resource allocation benefit: not just saving money, but saving time — the minutes between dispatch and arrival that determine whether a house fire becomes a room-and-contents fire or a total loss, whether a grass fire stays small or becomes a wildland-urban interface emergency.

Data doesn't fight fires. Firefighters do. But data tells us where to put the firefighters.

---

## Appendix: Current Dashboard Analytical Capabilities

### Overview Tab
- Total incidents, structure fires, outside fires, alarms (with YoY deltas)
- Interactive map: heatmap, clusters, points, choropleth, 3D extrusion, time-lapse
- Yearly breakdown (stacked bar by fire type)
- Monthly trend (area chart)
- Fire type distribution (doughnut)
- Hourly distribution (bar)
- Day-of-week distribution (bar)
- Top neighbourhoods with sparklines
- Filters: year, fire type, neighbourhood, station (server-side re-aggregation)

### Stations Tab
- Per-station KPIs: total calls, structure fires, outside fires, alarms, avg duration, city rank, multi-unit %, short calls
- Monthly trend: station vs city average (24 months)
- Fire type mix (doughnut)
- Equipment profile (horizontal bar)
- Response codes (doughnut)
- YoY history (stacked bar)
- Duration distribution (histogram)
- Equipment combinations (table)
- Duration comparison (station vs city avg)
- All-stations comparison table
- AI Station Analyst: Equipment Analysis, Performance Review, Response Patterns, Ask Anything

### Operations Tab
- Median duration, 90th percentile, multi-unit %, no-fire rate, short calls
- Equipment deployments by type
- Avg units per incident by fire type
- Equipment combos table
- Duration histogram
- Duration trend (average + median by year)
- Outlier table (60+ minute incidents)
- Response code breakdown
- False alarm rate trend

### Trends Tab
- YTD KPIs with prior-year comparison
- YTD pace chart (3-year monthly comparison)
- Monthly comparison table with YoY deltas
- Seasonal index (monthly fire activity vs average)
- Outside fire seasonality (multi-year monthly overlay)
- Growth trajectory with linear regression
- CAGR by fire type

### AI Analysis (Overview)
- Risk Assessment: neighbourhood fire risk tiers
- Anomaly Detection: statistical outliers in yearly, seasonal, and neighbourhood data
- Resource Optimization: station workload distribution and rebalancing suggestions
- Trend Forecast: directional projections by category
- Ask Anything: free-form questions about the dataset
