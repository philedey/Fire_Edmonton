// KPMG Review of EFRS (2021) operational benchmarks
// Source: 2019 data published in 2021 KPMG review — note the vintage in displays
// Used for contextual reference lines and peer city comparisons

export const EFRS_BENCHMARKS = {
  // Staffing
  total_fte: 1090,
  min_deployment_per_shift: 218,
  platoons: 4,
  staffing_maintenance_factor: 1.25,
  crew_size_pumper: 4,
  crew_size_ladder: 4,
  crew_size_rescue: 4,

  // Financial (2019)
  annual_operational_budget: 226000000,
  funding_per_event: 3999,
  funding_per_capita: 224,
  personnel_cost_pct: 0.83,

  // Fleet
  total_heavy_units: 81,
  active_heavy_units: 55,
  reserve_units: 26,
  units_past_lifecycle: 13,
  active_aerial_units: 9,

  // Performance
  response_time_target_minutes: 7,
  nfpa_ems_target_minutes: 6.33,
  nfpa_fire_target_minutes: 6.67,
  critical_medical_threshold_minutes: 4,
  turnout_time_achievement_pct: 70,
  travel_time_achievement_pct: 75,

  // Demand
  medical_call_growth_rate_annual: 0.07,
  non_medical_call_growth_rate_annual: 0.02,
  medical_call_pct: 0.68,
  overnight_volume_reduction_pct: 0.50,

  // Comparator cities (2019 data)
  comparators: {
    edmonton: { label: 'Edmonton', firefighters: 1090, stations: 31, funding_per_event: 3999, medical_pct: 0.68 },
    calgary: { label: 'Calgary', firefighters: 1298, stations: 41, funding_per_event: 4890, medical_pct: 0.48 },
    winnipeg: { label: 'Winnipeg', firefighters: 865, stations: 27, funding_per_event: 2375, medical_pct: 0.77 },
    ottawa: { label: 'Ottawa', firefighters: 1300, stations: 45, funding_per_event: 6142, medical_pct: 0.17 },
    vancouver: { label: 'Vancouver', firefighters: 760, stations: 20, funding_per_event: 2166, medical_pct: 0.72 },
  },

  // Districts
  districts: {
    Central: { stations: [1, 2, 21, 22] },
    North: { stations: [5, 7, 8, 10, 14, 17, 18, 25, 30] },
    Southeast: { stations: [9, 11, 15, 16, 26] },
    Southwest: { stations: [3, 4, 6, 12, 13, 19, 20, 23, 24, 27, 28, 29, 31] },
  },
};
