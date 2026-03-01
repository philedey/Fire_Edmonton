# AI-Powered Analysis Design — Edmonton Fire Dashboard

## Architecture Overview

### The Core Problem: Browser-Based Claude API Access

The dashboard is vanilla HTML/JS with no build step and no backend server. The Anthropic Claude API does not support browser-side CORS requests. There are two viable approaches:

**Option A: Lightweight Proxy (Recommended)**
A minimal Node.js/Express server (or Cloudflare Worker, or Netlify Function) that proxies requests to `https://api.anthropic.com/v1/messages`. This keeps the API key server-side and adds zero complexity to the frontend.

```
Browser → /api/ai/query (your proxy) → api.anthropic.com/v1/messages
```

Proxy code (~30 lines):
```javascript
// server.js — run with: node server.js
import express from 'express';
const app = express();
app.use(express.json());
app.use(express.static('.'));  // serve dashboard files

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

app.post('/api/ai/query', async (req, res) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: req.body.model || 'claude-sonnet-4-20250514',
      max_tokens: req.body.max_tokens || 1024,
      system: req.body.system,
      messages: req.body.messages,
    }),
  });
  const data = await response.json();
  res.json(data);
});

app.listen(3000, () => console.log('Dashboard + AI proxy on http://localhost:3000'));
```

**Option B: Direct Browser Calls (Not Recommended)**
Anthropic does not support CORS. A browser-direct approach would require embedding the API key in client-side code, which is a security risk. Not viable for production.

**Recommendation: Option A.** The proxy file is trivial, keeps the existing vanilla HTML/JS architecture intact, and the `express.static('.')` line means the dashboard is served from the same origin. No build step needed; just `node server.js` instead of opening `index.html` directly.

### Model Selection Strategy

| Use Case | Model | Why |
|----------|-------|-----|
| Natural language queries (interactive, user-facing) | `claude-sonnet-4-20250514` | Fast response (~2-4s), good reasoning, cost-effective |
| Monthly/quarterly reports (batch, complex) | `claude-sonnet-4-20250514` | Good balance; Opus would be overkill for structured data |
| Anomaly detection narratives | `claude-sonnet-4-20250514` | Fast enough for near-real-time, strong pattern recognition |
| All features below | `claude-sonnet-4-20250514` | Consistent; switch to `claude-3-5-haiku-20241022` only if cost becomes a concern |

### Token Budget Strategy

The critical insight: **never send raw records to Claude**. With 213K records, even sending just 3 fields per record would exceed any context window. Instead, pre-aggregate data using SODA API queries (which are free and fast), and send Claude compact summary tables.

| Data Shape | Approx Token Count |
|------------|-------------------|
| 15-year yearly breakdown (4 types x 15 years) | ~200 tokens |
| Monthly breakdown for 1 year (12 months x 4 types) | ~150 tokens |
| Top 50 neighbourhoods with counts | ~400 tokens |
| Full neighbourhood x year matrix (412 x 15) | ~8,000 tokens (avoid unless needed) |
| Day-of-week x month heatmap (7 x 12) | ~200 tokens |
| System prompt + instructions | ~500-800 tokens |

**Target: Keep each API call under 2,000 input tokens and 1,024 output tokens.** At Sonnet pricing (~$3/M input, $15/M output), each call costs roughly $0.02. Even heavy usage (100 queries/day) stays under $2/day.

---

## Dataset Profile (for system prompt context)

These facts should be included in every system prompt to ground Claude:

```
Edmonton Fire Rescue Services incident data.
Source: City of Edmonton Open Data Portal (SODA API).
Date range: 2011-01-01 to 2026-present (live data).
Total records: ~213,555
  - ALARMS: 138,997 (alarm activations, not actual fires)
  - OUTSIDE FIRE: 45,834 (grass, brush, vehicle, dumpster, wildland)
  - FIRE: 23,625 (structure fires — residential, commercial, industrial)
  - VEHICLE FIRE: 5,099
Distinct neighbourhoods: 412
Fields: event_number, dispatch_year/month/day/dayofweek, dispatch_date, dispatch_time,
  event_duration_mins, event_description, neighbourhood_name, approximate_location,
  equipment_assigned, response_code, latitude, longitude.
Note: "FIRE" = structure fire. "OUTSIDE FIRE" = non-structure outdoor fire.
ALARMS are dispatched alarm calls (many are false alarms) — not actual fires.
```

---

## Feature 1: Natural Language Query Interface

### What It Does
Users type questions in plain English. Claude interprets the question, the dashboard runs the appropriate SODA query, and Claude narrates the answer with context.

### Examples
- "What neighbourhood had the most structure fires in 2023?"
- "How do summer vs winter fire counts compare?"
- "Which year had the longest average response duration?"
- "Are outside fires increasing or decreasing over the last 5 years?"

### Implementation Approach: Two-Step Query Pattern

**Step 1: Claude generates a SODA query** (or selects a pre-built aggregation strategy)

Rather than giving Claude raw access to SQL, provide it with a constrained set of query templates. This prevents hallucinated queries and keeps responses fast.

```javascript
// System prompt for Step 1
const QUERY_SYSTEM = `You are a data analyst assistant for the Edmonton Fire Incidents Dashboard.

DATASET: Edmonton Fire Rescue Services, 2011–2026. ~213K records.
Event types: FIRE (structure), OUTSIDE FIRE, VEHICLE FIRE, ALARMS.
412 neighbourhoods. Fields: dispatch_year, dispatch_month, dispatch_day,
dispatch_dayofweek, event_description, neighbourhood_name, event_duration_mins,
equipment_assigned, response_code, approximate_location, latitude, longitude.

Your job: Given a user's natural language question, output a JSON object describing
what data aggregation to perform. Choose from these query types:

1. "type_by_year" — counts grouped by event_description and dispatch_year
2. "type_by_month" — counts grouped by event_description and dispatch_month
3. "neighbourhood_ranking" — counts by neighbourhood_name, optionally filtered
4. "time_pattern" — counts by dispatch_dayofweek and/or dispatch_month
5. "duration_stats" — avg/min/max of event_duration_mins, grouped by a dimension
6. "yearly_trend" — total counts by year, optionally filtered by type/neighbourhood
7. "comparison" — two separate aggregations to compare

Output JSON format:
{
  "query_type": "<type>",
  "filters": {
    "year": null or "2023",
    "event_description": null or "FIRE",
    "neighbourhood": null or "DOWNTOWN"
  },
  "group_by": ["dispatch_year"],
  "metric": "count" or "avg_duration",
  "explanation": "Brief explanation of what data you need and why"
}

If the question cannot be answered from this dataset, say so clearly.
Do NOT make up data. Only describe what query to run.`;
```

**Step 2: Execute the query, then ask Claude to narrate**

```javascript
// After running the SODA query and getting results:
const NARRATE_SYSTEM = `You are a fire safety data analyst. Given aggregated data from
Edmonton's fire incident database, provide a clear, concise answer to the user's question.

Rules:
- Be specific with numbers and percentages
- Note any caveats (e.g., partial year data for 2026, ALARMS ≠ actual fires)
- Keep answers to 2-4 sentences unless the user asks for detail
- Use plain language suitable for a city official or journalist
- If trends are notable, mention them
- Format numbers with commas (e.g., 23,625)`;

const messages = [{
  role: 'user',
  content: `Question: "${userQuestion}"

Data result:
${JSON.stringify(queryResult, null, 2)}

Answer the question based on this data.`
}];
```

### Why Two Steps?
- Step 1 is cheap (small input, small output) and deterministic
- The dashboard code maps the JSON output to actual SODA queries — no risk of query injection
- Step 2 receives only the aggregated result (tiny payload), not raw data
- Total: ~1,500 input tokens + ~200 output tokens = ~$0.01 per query

### Alternative: Single-Step with Pre-Fetched Context

For simpler deployment, pre-fetch a "data snapshot" when the dashboard loads (the stats are already fetched in `fetchAggregatedStats`), and send that snapshot with every query:

```javascript
// Build snapshot from data already loaded by the dashboard
function buildDataSnapshot(stats) {
  return `
CURRENT DASHBOARD DATA (filtered view):
Total incidents: ${stats.total}
Structure fires: ${stats.structure} (${(stats.structure/stats.total*100).toFixed(1)}%)
Outside fires: ${stats.outside} (${(stats.outside/stats.total*100).toFixed(1)}%)
Alarms: ${stats.other}
Top neighbourhood: ${stats.topNeighbourhood} (${stats.topNeighbourhoodCount} incidents)
Avg duration: ${stats.medianDurationMins?.toFixed(1)} min
Year range: ${stats.years[0]}–${stats.years[stats.years.length-1]}

YEARLY BREAKDOWN:
${stats.years.map(y => `${y}: structure=${stats.yearlyData[y]?.structure||0}, outside=${stats.yearlyData[y]?.outside||0}, other=${stats.yearlyData[y]?.other||0}`).join('\n')}

MONTHLY TOTALS (Jan-Dec):
${stats.monthlyData.join(', ')}

TOP 15 NEIGHBOURHOODS:
${stats.neighbourhoodRanking.map(([n,c]) => `${n}: ${c}`).join('\n')}
`;
}
```

This snapshot is ~600 tokens. For many questions ("which year was worst?", "what's the monthly pattern?"), this is sufficient without a second SODA query. Only drill-down questions ("show me Downtown in 2023 by month") require the two-step approach.

### UI Integration

Add to the filter bar area or as a collapsible panel below the KPI row:

```html
<!-- AI Query Panel -->
<div class="ai-panel">
  <div class="ai-input-row">
    <input type="text" id="ai-query" placeholder="Ask about Edmonton fire data..."
           class="ai-input">
    <button id="ai-ask" class="btn btn-accent">Ask AI</button>
  </div>
  <div id="ai-response" class="ai-response hidden">
    <div class="ai-response-text" id="ai-response-text"></div>
    <div class="ai-meta" id="ai-meta"></div>
  </div>
</div>
```

### Complexity: **Medium**
- Step 1 (single-step with snapshot): Low — 2-3 hours. Use pre-loaded stats, one API call.
- Step 2 (two-step with dynamic SODA queries): Medium — 1-2 days. Need query template mapping, error handling, loading states.

---

## Feature 2: Anomaly Detection Narratives

### What It Does
Feed Claude time-series data and have it identify:
- Unusual spikes (months/years with counts 2+ standard deviations above mean)
- Seasonal patterns (summer vs winter differences)
- Emerging trends (year-over-year changes, accelerating or decelerating)
- Sudden shifts (e.g., a neighbourhood jumping from low to high-risk)

### Data to Send

Pre-compute these aggregations via SODA before calling Claude:

```javascript
// Query 1: Year x Month x Type matrix (15 years x 12 months x 4 types = ~720 rows)
// This is the core time-series data
const yearMonthType = await sodaQuery({
  $select: 'dispatch_year, dispatch_month, event_description, count(*) as cnt',
  $where: WHERE_ALL,
  $group: 'dispatch_year, dispatch_month, event_description',
  $order: 'dispatch_year, dispatch_month',
});

// Query 2: Neighbourhood x Year for top 20 neighbourhoods
const nhoodYearly = await sodaQuery({
  $select: 'neighbourhood_name, dispatch_year, count(*) as cnt',
  $where: `${WHERE_ALL} AND neighbourhood_name in(${top20Names})`,
  $group: 'neighbourhood_name, dispatch_year',
  $order: 'neighbourhood_name, dispatch_year',
});
```

Format as a compact table (not JSON — tables are more token-efficient):

```
YEAR-MONTH MATRIX (fire incidents only, excluding alarms):
Year,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec
2011,45,38,52,78,120,145,189,175,98,67,48,42
2012,43,41,55,82,115,152,195,180,102,65,51,44
...
2025,52,48,61,89,130,158,201,188,112,72,55,49
2026,55,51,... (partial year through Feb)
```

This entire matrix fits in ~800 tokens. Add statistical context:

```
STATISTICAL CONTEXT:
Overall monthly mean: 95.3 incidents/month
Monthly std dev: 42.1
Highest month ever: Jul 2024 (215 incidents)
Lowest month ever: Dec 2013 (32 incidents)
Year-over-year trend: +2.1% annually (2011-2025)
Summer (Jun-Aug) vs Winter (Dec-Feb) ratio: 2.4x
```

### Prompt Structure

```javascript
const ANOMALY_SYSTEM = `You are a fire safety data analyst for Edmonton Fire Rescue Services.
Analyze the time-series data below and produce a structured anomaly report.

Your report should identify:
1. SPIKES: Months/years significantly above normal (>1.5 std dev from rolling average)
2. SEASONAL PATTERNS: Consistent month-to-month patterns and any years that broke the pattern
3. EMERGING TRENDS: Multi-year directional changes (increasing, decreasing, plateau)
4. NOTABLE SHIFTS: Any sudden changes in pattern worth investigating

Format your response as:

## Key Findings
(2-3 bullet points with the most important observations)

## Anomalies Detected
(Specific months/years with numbers)

## Seasonal Pattern
(Description of the normal seasonal cycle and any deviations)

## Trend Analysis
(Long-term direction with supporting numbers)

Be specific with numbers. Flag anything that a fire chief should investigate further.
Do not speculate about causes unless the data strongly suggests one.`;
```

### UI Integration

Add an "AI Insights" card to the charts panel, or a dedicated tab:

```html
<div class="chart-card ai-insights-card">
  <div class="ai-insights-header">
    <h3>AI Anomaly Analysis</h3>
    <button id="run-anomaly" class="btn btn-accent btn-sm">Analyze</button>
  </div>
  <div id="anomaly-results" class="ai-response">
    <div class="ai-placeholder">Click "Analyze" to detect patterns and anomalies in the data</div>
  </div>
</div>
```

The results render as formatted HTML (convert Claude's markdown to HTML using a simple regex-based converter or a tiny library like `marked`).

### Token Budget
- Input: ~1,500 tokens (system prompt + data matrix + statistical context)
- Output: ~800 tokens (structured report)
- Cost: ~$0.02 per analysis run
- Latency: ~3-5 seconds with Sonnet

### Complexity: **Medium**
- The SODA aggregation queries already exist in `api.js` patterns
- Main work: formatting the data compactly, building the prompt, rendering markdown output
- Estimated: 1 day

---

## Feature 3: Predictive Risk Narratives

### What It Does
Given the current date, analyse historical patterns for the upcoming period and generate risk narratives like:
- "Downtown is entering its historically highest-risk period for structure fires (June-August averages 45% more incidents than winter months)"
- "Based on 14 years of data, the next 30 days have historically seen 12.3 outside fires per week in mill-area neighbourhoods"

### Data to Send

The key insight: Claude is not running a predictive model. It is analyzing historical base rates and seasonality to project what is "normal" for the upcoming period, then flagging areas that deviate from normal.

```javascript
// For the current month and upcoming 2 months:
const currentMonth = new Date().getMonth() + 1; // 1-indexed
const nextMonths = [currentMonth, (currentMonth % 12) + 1, ((currentMonth + 1) % 12) + 1];

// Historical averages for these months, by neighbourhood (top 30)
const riskData = await sodaQuery({
  $select: `neighbourhood_name, dispatch_month, event_description,
            count(*) as cnt, avg(event_duration_mins) as avg_dur`,
  $where: `${WHERE_ALL} AND dispatch_month in(${nextMonths.join(',')})
            AND neighbourhood_name in(${top30Names})`,
  $group: 'neighbourhood_name, dispatch_month, event_description',
  $order: 'cnt DESC',
});

// Also get year-over-year for these months to detect acceleration
const yearTrend = await sodaQuery({
  $select: 'dispatch_year, dispatch_month, count(*) as cnt',
  $where: `${WHERE_ALL} AND dispatch_month in(${nextMonths.join(',')})`,
  $group: 'dispatch_year, dispatch_month',
  $order: 'dispatch_year',
});
```

Format compactly:

```
CURRENT DATE: February 27, 2026
FORECAST PERIOD: March, April, May 2026

HISTORICAL MONTHLY AVERAGES (2011-2025, fires only):
Mar: 287/month (structure: 142, outside: 108, vehicle: 37)
Apr: 389/month (structure: 148, outside: 198, vehicle: 43)
May: 512/month (structure: 155, outside: 310, vehicle: 47)

TOP 10 NEIGHBOURHOODS FOR MAR-MAY (historical total):
DOWNTOWN: 824 total (avg 59/year, structure-heavy)
OLIVER: 612 total (avg 44/year)
...

YEAR-OVER-YEAR FOR MAR-MAY:
2021: 1,105 | 2022: 1,188 (+7.5%) | 2023: 1,201 (+1.1%) | 2024: 1,245 (+3.7%) | 2025: 1,298 (+4.3%)

DAY-OF-WEEK PATTERN FOR MAR-MAY:
Mon: 14.1% | Tue: 13.8% | Wed: 14.3% | Thu: 14.0% | Fri: 15.2% | Sat: 15.1% | Sun: 13.5%
```

### Prompt Structure

```javascript
const RISK_SYSTEM = `You are a fire risk analyst for Edmonton Fire Rescue Services.
Based on historical incident data, generate a risk assessment for the upcoming period.

Your assessment should:
1. Identify which neighbourhoods are entering historically high-risk periods
2. Quantify the expected increase/decrease vs the current period
3. Note any accelerating trends that suggest this year may exceed historical averages
4. Provide actionable insights for resource planning

Format:

## Risk Level: [LOW / MODERATE / ELEVATED / HIGH]

## Upcoming Period Summary
(What to expect in the next 1-3 months based on historical patterns)

## High-Risk Areas
(Specific neighbourhoods with projected incident rates)

## Notable Patterns
(Day-of-week, time-of-day, or type-specific patterns relevant to planning)

## Comparison to Trend
(Is the recent trajectory above or below the historical baseline?)

Keep the tone professional and suitable for a fire department briefing.
Base all statements on the data provided. Do not fabricate statistics.`;
```

### UI Integration

A dedicated panel or modal, accessible via a "Risk Forecast" button in the header or filter bar:

```html
<div class="risk-panel" id="risk-panel">
  <div class="risk-header">
    <h3>AI Risk Forecast</h3>
    <span class="risk-badge" id="risk-badge">--</span>
    <button id="run-risk" class="btn btn-accent btn-sm">Generate Forecast</button>
  </div>
  <div id="risk-results" class="ai-response"></div>
</div>
```

The risk badge dynamically updates color: green (LOW), yellow (MODERATE), orange (ELEVATED), red (HIGH).

### Token Budget
- Input: ~1,200 tokens
- Output: ~600 tokens
- Cost: ~$0.01 per forecast
- Auto-refresh: Could regenerate daily or when filters change

### Complexity: **Medium**
- The SODA queries are straightforward
- Main complexity: date-aware logic for "current period" and "upcoming period"
- Estimated: 1 day

---

## Feature 4: Incident Pattern Analysis (Cluster Detection)

### What It Does
When a user is viewing a specific neighbourhood or time period, Claude analyzes clusters of incidents that occurred close together in space and time, identifying potential underlying causes or patterns.

### Data to Send

This is the one feature that benefits from individual records — but only a filtered subset. When the user has filtered to a specific neighbourhood and/or year:

```javascript
// Get individual incidents for the filtered view (likely <500 records)
const incidents = await sodaQuery({
  $select: 'dispatch_date, dispatch_time, dispatch_dayofweek, event_description, ' +
           'approximate_location, equipment_assigned, event_duration_mins, response_code',
  $where: `${WHERE_ALL} AND neighbourhood_name='${neighbourhood}' AND dispatch_year='${year}'`,
  $order: 'dispatch_date, dispatch_time',
  $limit: 500,
});
```

For neighbourhood-level analysis, also fetch comparison data:

```javascript
// Monthly pattern for this neighbourhood vs city average
const nhoodMonthly = await sodaQuery({
  $select: 'dispatch_month, event_description, count(*) as cnt',
  $where: `${WHERE_ALL} AND neighbourhood_name='${neighbourhood}'`,
  $group: 'dispatch_month, event_description',
});
```

Format as a compact incident log:

```
NEIGHBOURHOOD: DOWNTOWN (2023)
Total incidents this period: 187

INCIDENT TIMELINE (chronological):
Date       | Time  | Day | Type         | Duration | Location           | Equipment
2023-01-03 | 14:22 | Tue | FIRE         | 45 min   | 101 ST NW/JASPER  | PUMPER(3),LADDER(2)
2023-01-05 | 02:15 | Thu | ALARMS       | 12 min   | 102 ST NW/103 AV  | PUMPER(1),LADDER(1)
2023-01-05 | 03:44 | Thu | FIRE         | 67 min   | 102 ST NW/103 AV  | PUMPER(4),LADDER(2),RESCUE(1)
... (truncated to most recent 200 if >200 records)

MONTHLY DISTRIBUTION (this neighbourhood):
Jan: 12 | Feb: 10 | Mar: 14 | Apr: 16 | May: 19 | Jun: 22 | Jul: 24 | Aug: 21 | Sep: 17 | Oct: 14 | Nov: 11 | Dec: 7

CITY-WIDE COMPARISON:
This neighbourhood ranks #3 of 412 for total fire incidents.
Structure fire rate: 2.8x city average per capita.
```

### Prompt Structure

```javascript
const PATTERN_SYSTEM = `You are a fire investigator analyst for Edmonton Fire Rescue Services.
Analyze the incident log for a specific neighbourhood and time period.

Look for:
1. TEMPORAL CLUSTERS: Multiple incidents within the same week or at the same time of day
   (could indicate arson patterns, vulnerable building stock, or recurring hazards)
2. LOCATION CLUSTERS: Multiple incidents at or near the same address
   (could indicate a problem property, homeless encampment, or industrial hazard)
3. EQUIPMENT PATTERNS: Incidents requiring unusually high equipment deployment
   (indicates severity escalation)
4. DURATION ANOMALIES: Incidents with very long durations vs neighbourhood average
5. SEASONAL vs EXPECTED: Does this neighbourhood follow the city-wide seasonal pattern
   or have its own unique pattern?

Format:

## Pattern Summary
(1-2 sentences on the most notable finding)

## Temporal Clusters
(Identify any suspicious groupings by date/time)

## Location Hotspots
(Addresses or intersections appearing multiple times)

## Severity Indicators
(Any trends in duration or equipment deployment)

## Comparison to City Average
(How this neighbourhood differs from the norm)

Be factual. Flag patterns worth investigating but do not accuse.
If a location appears 3+ times, explicitly call it out.`;
```

### UI Integration

This is best triggered contextually — when a user clicks a neighbourhood in the table or filters to one:

```html
<!-- Appears in the neighbourhood table card when a neighbourhood is selected -->
<div class="pattern-analysis" id="pattern-analysis">
  <button id="analyze-patterns" class="btn btn-accent btn-sm">
    Analyze Patterns for <span id="selected-nhood">—</span>
  </button>
  <div id="pattern-results" class="ai-response hidden"></div>
</div>
```

### Token Budget
- Input: ~2,500-4,000 tokens (200 incident rows + context)
- Output: ~800 tokens
- Cost: ~$0.02-0.03 per analysis
- This is the most expensive feature per call because it uses individual records

### Complexity: **Medium-High**
- Need to handle variable record counts (cap at 200-300 most recent)
- Need good incident log formatting
- Contextual trigger (which neighbourhood is selected) requires UI wiring
- Estimated: 1.5 days

---

## Feature 5: Automated Monthly/Quarterly Reports

### What It Does
Generate executive-summary reports suitable for fire department leadership, city council, or media. One click produces a formatted report covering key metrics, trends, and recommendations.

### Data to Send

Aggregate everything needed for a comprehensive report in parallel:

```javascript
async function buildReportData(period = 'monthly', targetYear, targetMonth) {
  const [
    periodStats,     // Current period counts by type
    prevPeriodStats, // Previous period (month or quarter) for comparison
    yearAgoStats,    // Same period last year
    topNhoods,       // Top 20 neighbourhoods for period
    durationStats,   // Duration distribution
    dayOfWeek,       // Day-of-week breakdown
    equipmentStats,  // Equipment deployment frequency
  ] = await Promise.all([
    sodaQuery({ /* current period aggregates */ }),
    sodaQuery({ /* previous period aggregates */ }),
    sodaQuery({ /* same period, previous year */ }),
    sodaQuery({ /* neighbourhood ranking for period */ }),
    sodaQuery({ /* avg, min, max duration by type */ }),
    sodaQuery({ /* count by day of week */ }),
    sodaQuery({ /* count by response_code */ }),
  ]);
  // ... format into compact text
}
```

Formatted data payload (~1,500 tokens):

```
REPORT PERIOD: January 2026
REPORT TYPE: Monthly Summary

CURRENT MONTH:
Total incidents: 1,245
  Structure fires: 189 (15.2%)
  Outside fires: 312 (25.1%)
  Vehicle fires: 42 (3.4%)
  Alarms: 702 (56.4%)

COMPARISON:
vs December 2025: +8.2% total (+3.1% structure, +15.4% outside)
vs January 2025: -2.1% total (-5.3% structure, +4.2% outside)

TOP 5 NEIGHBOURHOODS (January 2026):
1. DOWNTOWN: 67 incidents (5.4% of total)
2. OLIVER: 48 incidents (3.9%)
3. CENTRAL MCDOUGALL: 41 incidents (3.3%)
4. MCCAULEY: 38 incidents (3.1%)
5. BOYLE STREET: 35 incidents (2.8%)

RESPONSE METRICS:
Avg event duration: 18.4 min (structure: 34.2, outside: 12.1, alarm: 11.8)
Longest incident: 247 min (structure fire, DOWNTOWN, Jan 14)

DAY-OF-WEEK DISTRIBUTION:
Mon: 178 | Tue: 171 | Wed: 183 | Thu: 176 | Fri: 191 | Sat: 182 | Sun: 164

EQUIPMENT DEPLOYMENT:
Total equipment dispatches: 4,890
Avg units per incident: 3.9
Most common: PUMPER (deployed to 89% of incidents)
```

### Prompt Structure

```javascript
const REPORT_SYSTEM = `You are a senior fire safety analyst writing official monthly reports
for Edmonton Fire Rescue Services leadership.

Generate a professional executive summary report from the data provided.

Report structure:
1. EXECUTIVE SUMMARY (2-3 sentences capturing the most important finding)
2. KEY METRICS (the numbers in context — are they up/down/normal?)
3. NOTABLE TRENDS (what changed compared to last month and last year)
4. GEOGRAPHIC ANALYSIS (which areas need attention)
5. OPERATIONAL INSIGHTS (response times, equipment utilization, day-of-week patterns)
6. RECOMMENDATIONS (2-3 actionable suggestions based on the data)

Tone: Professional, concise, data-driven. Suitable for a department chief or city councillor.
Always include month-over-month AND year-over-year comparisons.
Flag anything that is 15%+ above or below historical norms.
Do not speculate beyond what the data supports.`;
```

### UI Integration

A report button in the header or as a separate dashboard tab:

```html
<div class="report-modal" id="report-modal">
  <div class="report-modal-content">
    <div class="report-header">
      <h2>AI-Generated Report</h2>
      <div class="report-controls">
        <select id="report-type">
          <option value="monthly">Monthly Report</option>
          <option value="quarterly">Quarterly Report</option>
          <option value="annual">Annual Summary</option>
        </select>
        <select id="report-period">
          <!-- Populated dynamically -->
        </select>
        <button id="generate-report" class="btn btn-accent">Generate</button>
        <button id="copy-report" class="btn btn-reset">Copy to Clipboard</button>
        <button id="close-report" class="btn btn-reset">Close</button>
      </div>
    </div>
    <div id="report-content" class="report-body"></div>
  </div>
</div>
```

Include a "Copy to Clipboard" button so the report can be pasted into emails or documents.

### Token Budget
- Input: ~2,000 tokens (system prompt + comprehensive data payload)
- Output: ~1,500 tokens (full report)
- Cost: ~$0.03 per report
- Frequency: On-demand, not auto-triggered

### Complexity: **Medium**
- The data aggregation is the most work (7 parallel SODA queries)
- Report rendering needs good markdown-to-HTML conversion
- Copy-to-clipboard and period selection add UI work
- Estimated: 1.5 days

---

## Feature 6: Resource Optimization Suggestions

### What It Does
Analyze incident frequency by area, time-of-day (approximated from dispatch_time), and day-of-week to suggest optimal resource positioning. This helps answer: "Are we deploying the right equipment to the right areas at the right times?"

### Data to Send

```javascript
// Equipment deployment by neighbourhood (top 30)
const equipByNhood = await sodaQuery({
  $select: 'neighbourhood_name, equipment_assigned, count(*) as cnt',
  $where: `${WHERE_FIRES} AND dispatch_year >= '2023'`,
  $group: 'neighbourhood_name, equipment_assigned',
  $order: 'cnt DESC',
  $limit: 200,
});

// Incidents by hour bucket and neighbourhood (using dispatch_time)
// Note: SODA supports date_extract_hh() in some implementations
// Fallback: fetch dispatch_time and bucket client-side
const timePattern = await sodaQuery({
  $select: `neighbourhood_name, dispatch_dayofweek,
            count(*) as cnt, avg(event_duration_mins) as avg_dur`,
  $where: `${WHERE_FIRES} AND dispatch_year >= '2023'`,
  $group: 'neighbourhood_name, dispatch_dayofweek',
  $order: 'neighbourhood_name, cnt DESC',
  $limit: 500,
});

// Response code distribution by area
const responseByArea = await sodaQuery({
  $select: 'neighbourhood_name, response_code, count(*) as cnt',
  $where: `${WHERE_ALL} AND dispatch_year >= '2023'`,
  $group: 'neighbourhood_name, response_code',
  $order: 'cnt DESC',
  $limit: 300,
});
```

Formatted data (~1,800 tokens):

```
RESOURCE ANALYSIS DATA (2023-2025)

INCIDENT DENSITY BY NEIGHBOURHOOD (top 15):
Neighbourhood      | Total | Structure | Outside | Avg Duration | Avg Equipment Units
DOWNTOWN            | 892   | 312       | 245     | 28.4 min     | 5.2
OLIVER              | 634   | 198       | 267     | 22.1 min     | 4.1
CENTRAL MCDOUGALL   | 521   | 187       | 201     | 24.8 min     | 4.5
...

DAY-OF-WEEK PATTERNS (top 5 neighbourhoods):
DOWNTOWN:    Mon=14% Tue=13% Wed=15% Thu=14% Fri=16% Sat=15% Sun=13%
OLIVER:      Mon=13% Tue=14% Wed=14% Thu=15% Fri=15% Sat=16% Sun=13%

EQUIPMENT DEPLOYMENT PATTERNS:
Most common configs for structure fires:
  PUMPER(2),LADDER(1): 34% of incidents
  PUMPER(3),LADDER(2),RESCUE(1): 28%
  PUMPER(4),LADDER(2),RESCUE(1),TANKER(1): 18% (major incidents)

Most common configs for outside fires:
  PUMPER(1): 45%
  PUMPER(2): 32%
  PUMPER(1),TANKER(1): 15%

GEOGRAPHIC CLUSTERING:
Downtown + Oliver + Central McDougall (adjacent neighbourhoods):
  Combined: 2,047 incidents (24% of all fire incidents)
  Within 3km radius of city center

Southeast cluster (Mill Woods area):
  MILL WOODS TOWN CENTRE + TIPASKAN + LAKEWOOD:
  Combined: 412 incidents
  Predominantly outside fires (68%)
```

### Prompt Structure

```javascript
const RESOURCE_SYSTEM = `You are a fire department resource planning analyst for Edmonton
Fire Rescue Services. Analyze incident patterns and equipment deployment data to suggest
resource optimization opportunities.

Consider:
1. GEOGRAPHIC COVERAGE: Are high-incident areas adequately covered?
   Do adjacent high-risk neighbourhoods share response burden?
2. TEMPORAL COVERAGE: Are there day-of-week or seasonal patterns that suggest
   flexible staffing could improve response?
3. EQUIPMENT MATCHING: Are the right types of equipment being sent?
   (e.g., outside fires rarely need ladder trucks)
4. EFFICIENCY: Are there areas where response duration is consistently high,
   suggesting a coverage gap?
5. CLUSTERING: Nearby high-incident neighbourhoods that could share resources

Format:

## Key Optimization Opportunities
(Top 3 findings with estimated impact)

## Geographic Recommendations
(Station coverage gaps, areas needing additional resources)

## Temporal Recommendations
(Shift adjustments, seasonal staffing changes)

## Equipment Recommendations
(Deployment pattern improvements)

## Data Limitations
(What additional data would improve this analysis — e.g., station locations,
staffing levels, actual response times vs dispatch times)

Be specific with numbers. Frame recommendations as "consider" or "investigate"
rather than directives — you are advising, not commanding.
Acknowledge that you don't have station location data, budget data, or staffing data.`;
```

### UI Integration

A dedicated "Resource Analysis" section, potentially in a modal or new tab:

```html
<div class="resource-panel" id="resource-panel">
  <div class="resource-header">
    <h3>AI Resource Optimization</h3>
    <select id="resource-period">
      <option value="recent">Last 3 Years (2023-2025)</option>
      <option value="all">All Years (2011-2025)</option>
    </select>
    <button id="run-resource" class="btn btn-accent btn-sm">Analyze</button>
  </div>
  <div id="resource-results" class="ai-response"></div>
</div>
```

### Token Budget
- Input: ~2,500 tokens
- Output: ~1,200 tokens
- Cost: ~$0.03 per analysis
- Frequency: On-demand; this is a strategic analysis, not something run every page load

### Complexity: **High**
- Most complex data preparation (equipment parsing, geographic clustering)
- The `equipment_assigned` field needs parsing (e.g., "PUMPER(3),LADDER(2)" -> structured data)
- Would benefit from knowing fire station locations (not in the dataset — could be hard-coded or fetched from another Edmonton open data source)
- Estimated: 2 days

---

## Implementation Priority & Roadmap

### Phase 1: Foundation (Day 1)
1. **Proxy server** — `server.js` with Express, ~30 lines
2. **AI module** — `js/ai.js` with shared `callClaude()` function, response rendering, loading states
3. **Feature 1: Natural Language Query** — highest user value, exercises the full pipeline

### Phase 2: Insights (Day 2-3)
4. **Feature 2: Anomaly Detection** — uses existing dashboard data, straightforward prompting
5. **Feature 3: Risk Forecast** — date-aware variant of anomaly detection
6. **Feature 5: Automated Reports** — most complex data aggregation but high utility

### Phase 3: Deep Analysis (Day 4-5)
7. **Feature 4: Pattern Analysis** — needs neighbourhood selection UX
8. **Feature 6: Resource Optimization** — needs equipment parsing, most complex

---

## Shared Frontend Module: `js/ai.js`

```javascript
// js/ai.js — Shared AI analysis module

const AI_PROXY = '/api/ai/query';  // Proxy endpoint

// Shared function to call Claude via proxy
export async function callClaude({ system, userMessage, maxTokens = 1024 }) {
  const startTime = Date.now();

  const response = await fetch(AI_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status}`);
  }

  const data = await response.json();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const text = data.content?.[0]?.text || 'No response generated.';
  const usage = data.usage || {};

  return {
    text,
    elapsed,
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
  };
}

// Simple markdown to HTML (covers headers, bold, bullets, line breaks)
export function markdownToHtml(md) {
  return md
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="ai-heading">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
    .replace(/<p><h/g, '<h')
    .replace(/<\/h(\d)><\/p>/g, '</h$1>')
    .replace(/<p><ul>/g, '<ul>')
    .replace(/<\/ul><\/p>/g, '</ul>');
}

// Render AI response into a container element
export function renderAiResponse(containerId, result) {
  const container = document.getElementById(containerId);
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="ai-content">${markdownToHtml(result.text)}</div>
    <div class="ai-meta">
      Generated in ${result.elapsed}s |
      ${result.inputTokens + result.outputTokens} tokens |
      Claude Sonnet
    </div>
  `;
}

// Show loading state
export function showAiLoading(containerId, message = 'Analyzing data...') {
  const container = document.getElementById(containerId);
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="ai-loading">
      <div class="ai-spinner"></div>
      <span>${message}</span>
    </div>
  `;
}
```

---

## CSS Additions for AI Features

```css
/* === AI Analysis Panels === */
.ai-panel {
  padding: 12px 24px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.ai-input-row {
  display: flex;
  gap: 8px;
}

.ai-input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.9rem;
}

.ai-input:focus {
  outline: none;
  border-color: var(--accent);
}

.ai-response {
  margin-top: 12px;
  padding: 16px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.85rem;
  line-height: 1.6;
}

.ai-content h3.ai-heading {
  color: var(--accent);
  font-size: 0.9rem;
  margin: 16px 0 8px 0;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}

.ai-content h3.ai-heading:first-child {
  margin-top: 0;
}

.ai-content ul {
  padding-left: 20px;
  margin: 8px 0;
}

.ai-content li {
  margin: 4px 0;
  color: var(--text);
}

.ai-content strong {
  color: var(--accent);
}

.ai-content p {
  margin: 8px 0;
  color: var(--text);
}

.ai-meta {
  margin-top: 12px;
  font-size: 0.7rem;
  color: var(--text-muted);
  text-align: right;
}

.ai-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  color: var(--text-secondary);
}

.ai-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.ai-placeholder {
  color: var(--text-muted);
  font-style: italic;
  text-align: center;
  padding: 20px;
}

.ai-insights-card .ai-insights-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.ai-insights-card .ai-insights-header h3 {
  margin-bottom: 0;
}

.btn-sm {
  padding: 5px 12px;
  font-size: 0.78rem;
}

/* Risk badge */
.risk-badge {
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.risk-low { background: #1a4a2e; color: #4ecdc4; }
.risk-moderate { background: #4a3a1a; color: #ffcc00; }
.risk-elevated { background: #4a2a1a; color: #ff9933; }
.risk-high { background: #4a1a1a; color: #ff4444; }

/* Report modal */
.report-modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 25, 35, 0.95);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.report-modal-content {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 90%;
  max-width: 900px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.report-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.report-header h2 {
  font-size: 1.1rem;
  margin-right: auto;
}

.report-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}
```

---

## Cost Estimation Summary

| Feature | Input Tokens | Output Tokens | Cost/Call | Expected Frequency |
|---------|-------------|---------------|-----------|-------------------|
| Natural Language Query | ~1,200 | ~300 | ~$0.01 | 10-50x/day |
| Anomaly Detection | ~1,500 | ~800 | ~$0.02 | 1-5x/day |
| Risk Forecast | ~1,200 | ~600 | ~$0.01 | 1x/day |
| Pattern Analysis | ~3,500 | ~800 | ~$0.02 | 5-10x/day |
| Monthly Report | ~2,000 | ~1,500 | ~$0.03 | 1-4x/month |
| Resource Optimization | ~2,500 | ~1,200 | ~$0.03 | 1-2x/week |

**Estimated total daily cost for moderate usage: $0.30-1.00/day**
**Estimated monthly cost: $10-30/month**

This assumes Claude Sonnet. Switching to Haiku for the natural language queries would cut that cost by ~5x but with somewhat less nuanced responses.

---

## Security Considerations

1. **API Key**: Must stay server-side in the proxy. Never expose in client JS.
2. **Rate Limiting**: Add basic rate limiting to the proxy (e.g., 60 requests/minute/IP) to prevent abuse.
3. **Input Sanitization**: User's natural language query should be truncated to 500 characters and stripped of any prompt injection patterns before sending to Claude.
4. **SODA Injection**: The two-step query pattern prevents users from injecting arbitrary SODA queries. Claude outputs a structured JSON template, and the dashboard code maps it to pre-defined query patterns.
5. **No PII**: The Edmonton open data dataset contains no personal information — only approximate locations, neighbourhoods, and equipment types. No risk of PII leakage to Claude.

---

## Implementation Notes

### Integrating with Existing Code

The existing codebase uses ES modules (`import`/`export` in `js/app.js`). The AI module follows the same pattern. Key integration points:

1. **`js/ai.js`** — New module, exports `callClaude()`, `markdownToHtml()`, `renderAiResponse()`
2. **`js/app.js`** — Import AI module, wire up button handlers after Phase 1 init
3. **`index.html`** — Add AI panel HTML below the filter bar
4. **`css/dashboard.css`** — Append AI-specific styles
5. **`server.js`** — New file at project root, serves static files + proxies API calls

The dashboard continues to work without the proxy (existing SODA queries go directly to Edmonton's API). AI features gracefully degrade if the proxy is unavailable.

### Streaming Responses

For longer outputs (reports, anomaly analysis), Claude's streaming API can be used to show text as it generates. The proxy would use `stream: true` and forward Server-Sent Events:

```javascript
// In server.js proxy
app.post('/api/ai/query-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify({ ...req.body, stream: true }),
  });

  // Pipe the SSE stream through
  response.body.pipe(res);
});
```

This provides a much better UX for reports that take 5-10 seconds to generate — users see text appearing in real time rather than staring at a spinner.
