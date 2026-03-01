// AI Analysis module — streams Claude responses via server proxy

const SYSTEM_PROMPT = `You are a fire data analyst for Edmonton Fire Rescue Services (EFRS), Alberta, Canada. You analyze incident data spanning 2011-present.

RULES:
1. Only cite numbers present in the provided data. Never invent statistics or fabricate causes.
2. When suggesting causes, clearly label them as hypotheses: "This may be due to..."
3. Structure every response with: **Summary** (2-3 sentences), **Findings** (bullet points with numbers), **Key Takeaway** (1 sentence, actionable).
4. Use **bold** for numbers and key terms. Keep responses 250-350 words.
5. Use year-over-year percentage changes when comparing periods.
6. Edmonton context: 31 fire stations, city bisected by North Saskatchewan River, industrial areas in northeast/southeast, residential suburbs expanding in southwest/west.

CATEGORIES:
- Structure fires (FIRE) — building fires, highest severity
- Outside fires (OUTSIDE FIRE, VEHICLE FIRE) — seasonal (peaks May-Sep), weather-dependent
- Alarms (ALARMS) — fire alarm activations, highest volume, many false positives

DATA LIMITATIONS:
- Duration field is total event duration (dispatch to close), not dispatch-to-arrival response time.
- Station assignments are proximity-based estimates, not actual dispatch records.
- No population density, building age, or socioeconomic data is included.`;

// --- Analysis templates ---

export const ANALYSIS_MODES = [
  {
    id: 'risk',
    label: 'Risk Assessment',
    icon: '🎯',
    prompt: (stats) => `Perform a neighbourhood fire risk assessment using this data:

${formatStats(stats)}

REQUIRED OUTPUT STRUCTURE:
1. **Risk Tier Classification**: Group the top 15 neighbourhoods into High/Medium/Elevated tiers based on incident volume relative to the dataset average.
2. **Fire Type Mix Analysis**: For each high-risk neighbourhood, note whether structure fires, outside fires, or alarms dominate. A high structure-fire ratio signals greater life safety risk.
3. **Trend Direction**: Using the yearly data, identify which high-risk neighbourhoods are trending up vs stabilizing.
4. **Mitigation Priorities**: Rank the top 3 neighbourhoods where intervention would have the largest impact, based on volume AND trend direction.

Do NOT speculate on demographic or infrastructure causes — only cite patterns visible in the data.`,
  },
  {
    id: 'anomaly',
    label: 'Anomaly Detection',
    icon: '📊',
    prompt: (stats) => `Identify statistical anomalies in this fire incident data:

${formatStats(stats)}

ANOMALY CRITERIA:
- A yearly total that deviates >15% from the 3-year rolling average
- A monthly value that is >25% above or below the same month's multi-year average
- A neighbourhood whose fire type distribution differs significantly from the city-wide ratio (structure: ${pct(stats.structure, stats.total)}, outside: ${pct(stats.outside, stats.total)}, alarms: ${pct(stats.other, stats.total)})

REQUIRED OUTPUT:
1. **Yearly Anomalies**: List any years with unusual totals. Quantify the deviation.
2. **Seasonal Anomalies**: Flag months that break expected patterns (e.g., winter months with high outside fires).
3. **Neighbourhood Outliers**: Identify neighbourhoods with unusual fire type ratios vs the city average.
4. **Severity Assessment**: Rate each anomaly as Concerning / Notable / Minor.`,
  },
  {
    id: 'resource',
    label: 'Resource Optimization',
    icon: '🚒',
    prompt: (stats, stationData) => `Analyze station workload and resource allocation:

${formatStats(stats)}

${formatStationData(stationData)}

REQUIRED OUTPUT:
1. **Workload Distribution**: Identify the top 5 and bottom 5 stations by call volume. Compute each as a percentage of total calls.
2. **Specialization**: Which stations handle disproportionately more structure fires vs alarms?
3. **Imbalance Score**: Flag stations where volume is >50% above or below the median.
4. **Rebalancing Opportunities**: Suggest 2-3 specific actions to redistribute workload.

Note: Station assignments are proximity-based estimates. Duration data reflects total event time, not response time.`,
  },
  {
    id: 'forecast',
    label: 'Trend Forecast',
    icon: '📈',
    prompt: (stats) => `Analyze historical trends and project directional patterns:

${formatStats(stats)}

REQUIRED OUTPUT:
1. **Long-term Trend**: Is the overall incident count increasing, decreasing, or stable? Cite the average annual change rate.
2. **Category Trajectories**: For each fire type (structure, outside, alarms), state whether trending up/down/flat with YoY percentage changes.
3. **Seasonal Shifts**: Are seasonal patterns intensifying or moderating compared to earlier years?
4. **Directional Outlook**: Based on the observed trends, state whether the next period is likely to see increases or decreases for each category. Label these as projections, not predictions.

Do NOT provide specific numerical forecasts — state directional trends only.`,
  },
  {
    id: 'query',
    label: 'Ask Anything',
    icon: '💬',
    prompt: null, // User provides the prompt
  },
];

// --- Format dashboard data for Claude ---

function formatStats(stats) {
  if (!stats) return 'No data available.';

  let text = `FIRE INCIDENT SUMMARY:
- Total incidents: ${stats.total?.toLocaleString() || 'N/A'}
- Structure fires: ${stats.structure?.toLocaleString() || 0} (${pct(stats.structure, stats.total)})
- Outside fires: ${stats.outside?.toLocaleString() || 0} (${pct(stats.outside, stats.total)})
- Alarms: ${stats.other?.toLocaleString() || 0} (${pct(stats.other, stats.total)})
- Top neighbourhood: ${stats.topNeighbourhood || 'N/A'} (${stats.topNeighbourhoodCount?.toLocaleString() || 0} incidents)
- Median event duration: ${stats.medianDurationMins?.toFixed(1) || 'N/A'} minutes (dispatch to close, not arrival time)
- Data range: ${stats.years?.[0] || '?'} – ${stats.years?.[stats.years.length - 1] || '?'}`;

  if (stats.yearlyData) {
    text += '\n\nYEARLY BREAKDOWN:';
    for (const year of stats.years || []) {
      const d = stats.yearlyData[year];
      if (d) {
        const total = (d.structure || 0) + (d.outside || 0) + (d.other || 0);
        text += `\n  ${year}: ${total.toLocaleString()} total (struct: ${d.structure}, outside: ${d.outside}, alarms: ${d.other})`;
      }
    }
  }

  if (stats.monthlyData) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    text += '\n\nMONTHLY DISTRIBUTION:';
    text += '\n  ' + stats.monthlyData.map((c, i) => `${months[i]}: ${c.toLocaleString()}`).join(', ');
  }

  // Year-over-year changes
  if (stats.yearlyData && stats.years?.length > 1) {
    text += '\n\nYEAR-OVER-YEAR CHANGES:';
    for (let i = 1; i < stats.years.length; i++) {
      const prev = stats.yearlyData[stats.years[i - 1]];
      const curr = stats.yearlyData[stats.years[i]];
      if (prev && curr) {
        const prevTotal = (prev.structure || 0) + (prev.outside || 0) + (prev.other || 0);
        const currTotal = (curr.structure || 0) + (curr.outside || 0) + (curr.other || 0);
        const delta = prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal * 100).toFixed(1) : 'N/A';
        text += `\n  ${stats.years[i - 1]}→${stats.years[i]}: ${delta}%`;
      }
    }
  }

  if (stats.neighbourhoodRanking) {
    text += '\n\nTOP 15 NEIGHBOURHOODS:';
    for (const [name, count] of stats.neighbourhoodRanking.slice(0, 15)) {
      text += `\n  ${name}: ${count.toLocaleString()}`;
    }
  }

  // Hourly distribution (if available from extraCharts)
  if (stats.hourlyData) {
    text += '\n\nHOURLY DISTRIBUTION:';
    text += '\n  ' + stats.hourlyData.map((c, i) => `${i}h:${c}`).join(', ');
  }

  // Day-of-week distribution (if available)
  if (stats.dayOfWeekData) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    text += '\n\nDAY OF WEEK:';
    text += '\n  ' + stats.dayOfWeekData.map((d, i) => `${days[i]}:${d.count || d}`).join(', ');
  }

  return text;
}

function formatStationData(stationData) {
  if (!stationData?.stationCalls) return '';

  let text = 'STATION WORKLOAD (by nearest-incident proximity):';
  const sorted = [...stationData.stationCalls].sort((a, b) => b.total_incidents - a.total_incidents);

  for (const s of sorted) {
    text += `\n  Station ${s.station_name}: ${s.total_incidents.toLocaleString()} total | struct: ${s.structure_fires} | outside: ${s.outside_fires} | alarms: ${s.alarms} | med dur: ${s.median_duration_mins || s.avg_duration_mins || '?'}min`;
  }

  return text;
}

function pct(n, total) {
  if (!total) return '0%';
  return `${((n / total) * 100).toFixed(1)}%`;
}

// --- Streaming API call ---

// --- Response cache ---

const responseCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_SIZE = 20;

function hashInput(system, prompt) {
  const str = system + '|' + prompt;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export async function streamAnalysis(systemPrompt, userPrompt, onToken, onDone, onError) {
  const system = systemPrompt || SYSTEM_PROMPT;

  // Check cache
  const cacheKey = hashInput(system, userPrompt);
  const cached = responseCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    // Replay cached response with fast typewriter
    const words = cached.text.split(/(\s+)/);
    for (let i = 0; i < words.length; i++) {
      onToken(words[i]);
      if (i % 8 === 0) await new Promise(r => setTimeout(r, 10));
    }
    onDone?.();
    return;
  }

  let fullText = '';

  try {
    const response = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: `Request failed (${response.status})` }));
      if (errData.retryable) {
        onError?.(`${errData.error} Retrying...`);
        await new Promise(r => setTimeout(r, errData.retryAfterMs || 5000));
        return streamAnalysis(systemPrompt, userPrompt, onToken, onDone, onError);
      }
      onError?.(errData.error || `Request failed (${response.status})`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Stream timeout: 60s max
    const readTimeout = setTimeout(() => {
      reader.cancel();
      if (fullText) {
        onDone?.();
      } else {
        onError?.('Analysis timed out. Please retry.');
      }
    }, 60000);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullText += parsed.delta.text;
              onToken(parsed.delta.text);
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      }
    }

    clearTimeout(readTimeout);

    // Cache the response
    if (fullText) {
      if (responseCache.size >= MAX_CACHE_SIZE) {
        const oldest = responseCache.keys().next().value;
        responseCache.delete(oldest);
      }
      responseCache.set(cacheKey, { text: fullText, timestamp: Date.now() });
    }

    onDone?.();
  } catch (err) {
    if (fullText) {
      onDone?.();
    } else {
      onError?.(err.message || String(err));
    }
  }
}

// --- Public API for the panel ---

export function buildPrompt(modeId, stats, stationData, userQuery) {
  const mode = ANALYSIS_MODES.find(m => m.id === modeId);
  if (!mode) return null;

  if (modeId === 'query') {
    return `Based on this Edmonton fire incident data, answer the following question:\n\n${formatStats(stats)}\n\n${stationData ? formatStationData(stationData) : ''}\n\nQuestion: ${userQuery}`;
  }

  if (modeId === 'resource') {
    return mode.prompt(stats, stationData);
  }

  return mode.prompt(stats);
}

export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

// --- Station-specific AI analysis ---

export const STATION_ANALYSIS_MODES = [
  {
    id: 'stn-equipment',
    label: 'Equipment Analysis',
    icon: '\u{1F527}',
    prompt: (ctx) => `Analyze equipment deployment patterns for Edmonton Fire Station ${ctx.station}:

${ctx.dataText}

REQUIRED OUTPUT:
1. **Equipment Profile**: Which unit types does this station deploy most? How does the mix compare to a typical station?
2. **Multi-Unit Patterns**: ${ctx.multiUnitPct}% of incidents require 3+ unit types. Is this above or below typical? What drives multi-unit responses?
3. **Top Equipment Combos**: Identify the most common equipment combinations and what incident types they likely serve.
4. **Key Takeaway**: One actionable observation about this station's equipment utilization.`,
  },
  {
    id: 'stn-performance',
    label: 'Performance Review',
    icon: '\u{1F4CA}',
    prompt: (ctx) => `Review performance for Edmonton Fire Station ${ctx.station}:

${ctx.dataText}

REQUIRED OUTPUT:
1. **Volume Assessment**: This station handles ${ctx.totalYtd} calls YTD, ranked #${ctx.rank} of 31 stations. Classify workload as High/Medium/Low relative to peers.
2. **Trend Analysis**: Using monthly data, identify if call volume is trending up, down, or stable vs city average.
3. **Duration**: Station median event duration is ${ctx.medianDuration} min vs city median ${ctx.cityMedianDuration} min. Note: duration = dispatch to event close, not arrival time. Assess whether this is within normal range.
4. **Year-over-Year**: Compare current year to prior year. Flag any significant shifts in volume or fire type mix.
5. **Key Takeaway**: One actionable insight for station leadership.`,
  },
  {
    id: 'stn-response',
    label: 'Response Patterns',
    icon: '\u{1F3AF}',
    prompt: (ctx) => `Analyze response patterns for Edmonton Fire Station ${ctx.station}:

${ctx.dataText}

REQUIRED OUTPUT:
1. **Fire Type Mix**: Break down structure fires (${ctx.structurePct}%), outside fires (${ctx.outsidePct}%), and alarms (${ctx.alarmsPct}%). Compare to city-wide ratios.
2. **Response Codes**: Identify the dominant response codes and any unusual distributions.
3. **Seasonal Patterns**: Using monthly trend data, identify peak months and any seasonal anomalies.
4. **Key Takeaway**: One pattern that station leadership should monitor.`,
  },
  {
    id: 'stn-query',
    label: 'Ask About Station',
    icon: '\u{1F4AC}',
    prompt: null,
  },
];

export function getStationSystemPrompt() {
  return SYSTEM_PROMPT + `

STATION ANALYSIS CONTEXT:
You are analyzing a specific fire station. Focus on station-level performance, not city-wide trends.
- Compare this station's metrics to city averages and peer stations when data is available.
- Equipment combinations reflect what units typically respond together; common combos include Engine+Ladder, Engine+Rescue, etc.
- Multi-unit percentage indicates incident complexity — stations with more structure fires typically have higher multi-unit rates.
- Station assignments are proximity-based estimates, not actual dispatch records.`;
}

export function formatStationAnalysisData(stationData, equipData, station) {
  let text = `STATION ${station} DATA:\n`;

  const kpis = stationData?.stationKpis || [];
  const currentYear = stationData?.currentYear || new Date().getFullYear();
  const priorYear = stationData?.priorYear || currentYear - 1;
  const curr = kpis.find(r => r.dispatch_year === currentYear) || {};
  const prior = kpis.find(r => r.dispatch_year === priorYear) || {};

  text += `\nYTD (${currentYear}): ${curr.total || 0} total | Structure: ${curr.structure_fires || 0} | Outside: ${curr.outside_fires || 0} | Alarms: ${curr.alarms || 0} | Median Duration: ${curr.median_duration ? parseFloat(curr.median_duration).toFixed(1) : (curr.avg_duration ? parseFloat(curr.avg_duration).toFixed(1) : '?')} min`;
  text += `\nPrior Year (${priorYear}): ${prior.total || 0} total | Structure: ${prior.structure_fires || 0} | Outside: ${prior.outside_fires || 0} | Alarms: ${prior.alarms || 0}`;

  if (kpis.length > 2) {
    text += '\n\nYEARLY HISTORY:';
    for (const row of [...kpis].sort((a, b) => a.dispatch_year - b.dispatch_year)) {
      text += `\n  ${row.dispatch_year}: ${row.total} total (struct: ${row.structure_fires}, outside: ${row.outside_fires}, alarms: ${row.alarms})`;
    }
  }

  const monthly = (stationData?.monthlyTrend || []).slice(-12);
  if (monthly.length) {
    text += '\n\nMONTHLY TREND (last 12 months):';
    text += '\n  ' + monthly.map(r => `${r.dispatch_year}-${String(r.dispatch_month).padStart(2, '0')}: ${r.total}`).join(', ');
  }

  const cityAvg = (stationData?.cityAvgMonthly || []).slice(-12);
  if (cityAvg.length) {
    text += '\n  City Avg: ' + cityAvg.map(r => `${r.dispatch_year}-${String(r.dispatch_month).padStart(2, '0')}: ${parseFloat(r.avg_total).toFixed(0)}`).join(', ');
  }

  const allStations = stationData?.allStationsYtd || [];
  const sorted = [...allStations].sort((a, b) => (parseInt(b.total_ytd) || 0) - (parseInt(a.total_ytd) || 0));
  if (sorted.length) {
    text += '\n\nSTATION RANKING (top 10):';
    const top10 = sorted.slice(0, 10);
    for (const r of top10) {
      const marker = r.station_name === station ? ' <<<' : '';
      const idx = sorted.indexOf(r) + 1;
      text += `\n  #${idx} Station ${r.station_name}: ${r.total_ytd} calls, med dur ${parseFloat(r.median_duration || r.avg_duration).toFixed(1)} min${marker}`;
    }
    const thisStation = sorted.find(r => r.station_name === station);
    if (thisStation && !top10.find(r => r.station_name === station)) {
      const rank = sorted.indexOf(thisStation) + 1;
      text += `\n  #${rank} Station ${station}: ${thisStation.total_ytd} calls, med dur ${parseFloat(thisStation.median_duration || thisStation.avg_duration).toFixed(1)} min <<<`;
    }
  }

  const codes = stationData?.responseCodes || [];
  if (codes.length) {
    text += '\n\nRESPONSE CODES:';
    text += '\n  ' + codes.map(r => `${r.response_code}: ${r.cnt}`).join(', ');
  }

  if (equipData) {
    const units = (equipData.byUnitType || []).slice(0, 10);
    if (units.length) {
      text += '\n\nEQUIPMENT DEPLOYMENTS:';
      text += '\n  ' + units.map(r => `${r.unit_type}: ${r.units_deployed || r.incidents} deployments`).join(', ');
    }

    const multi = equipData.multiUnitFrequency || {};
    if (multi.multi_unit_pct != null) {
      text += `\n\nMULTI-UNIT: ${multi.multi_unit_pct}% of incidents require 3+ unit types (${multi.multi_unit_incidents} of ${multi.total_incidents})`;
    }

    const combos = (equipData.topCombos || []).slice(0, 5);
    if (combos.length) {
      text += '\n\nTOP EQUIPMENT COMBOS:';
      for (const c of combos) {
        text += `\n  ${c.equipment_assigned}: ${c.cnt} incidents`;
      }
    }
  }

  return text;
}

export function buildStationPrompt(modeId, stationData, equipData, station, userQuery) {
  const mode = STATION_ANALYSIS_MODES.find(m => m.id === modeId);
  if (!mode) return null;

  const dataText = formatStationAnalysisData(stationData, equipData, station);

  const kpis = stationData?.stationKpis || [];
  const currentYear = stationData?.currentYear || new Date().getFullYear();
  const curr = kpis.find(r => r.dispatch_year === currentYear) || {};
  const total = parseInt(curr.total) || 0;
  const struct = parseInt(curr.structure_fires) || 0;
  const outside = parseInt(curr.outside_fires) || 0;
  const alarms = parseInt(curr.alarms) || 0;

  const allStations = stationData?.allStationsYtd || [];
  const thisStation = allStations.find(r => r.station_name === station);
  const durs = allStations.map(r => parseFloat(r.median_duration || r.avg_duration)).filter(v => !isNaN(v));
  const cityMedDur = durs.length ? (durs.reduce((a, b) => a + b, 0) / durs.length).toFixed(1) : '?';

  const multi = equipData?.multiUnitFrequency || {};

  const ctx = {
    station,
    dataText,
    totalYtd: total,
    rank: thisStation?.rank || '?',
    medianDuration: curr.median_duration ? parseFloat(curr.median_duration).toFixed(1) : (curr.avg_duration ? parseFloat(curr.avg_duration).toFixed(1) : '?'),
    cityMedianDuration: cityMedDur,
    structurePct: total > 0 ? ((struct / total) * 100).toFixed(1) : '0',
    outsidePct: total > 0 ? ((outside / total) * 100).toFixed(1) : '0',
    alarmsPct: total > 0 ? ((alarms / total) * 100).toFixed(1) : '0',
    multiUnitPct: multi.multi_unit_pct != null ? parseFloat(multi.multi_unit_pct).toFixed(1) : '?',
  };

  if (modeId === 'stn-query') {
    return `Based on this station data, answer the following question:\n\n${dataText}\n\nQuestion: ${userQuery}`;
  }

  return mode.prompt(ctx);
}
