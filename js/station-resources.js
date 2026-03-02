// Static station resource data — apparatus, crew sizes, status, specializations
// Source: Edmonton Fire Rescue Services public information
// Update manually when station status changes (e.g., Station 7 reopening)

export const STATION_RESOURCES = [
  { station_number: 1, name: 'Headquarters', address: '10351 96 Street', district: 'Central', status: 'active', pump_companies: ['Pump 1', 'Pump 1A'], ladder_companies: ['Ladder 1'], rescue_companies: [], special_units: ['PIO'], chief_units: ['Chief of Department', 'Deputy Chiefs', 'Platoon Chief', 'Chief of Special Operations'], min_crew_size: 4, total_min_staff: 12, has_ems: true, notes: 'Department headquarters. Two pumper units.' },
  { station_number: 2, name: 'Downtown', address: '10217 107 Street', district: 'Central', status: 'active', pump_companies: ['Pump 2'], ladder_companies: [], rescue_companies: ['Rescue 2'], special_units: [], chief_units: [], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: '' },
  { station_number: 3, name: 'University', address: '11226 76 Avenue', district: 'Southwest', status: 'active', pump_companies: ['Pump 3'], ladder_companies: [], rescue_companies: ['Rescue 3'], special_units: ['Technical Rescue Team Support Unit'], chief_units: [], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: 'Technical Rescue Team (TRT) operates from this station.' },
  { station_number: 4, name: 'Jasper Place', address: '10949 156 Street', district: 'Southwest', status: 'active', pump_companies: ['Pump 4'], ladder_companies: [], rescue_companies: ['Rescue 4'], special_units: [], chief_units: ['District Chief - Car 4'], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: '' },
  { station_number: 5, name: 'Norwood', address: '9020 111 Avenue', district: 'North', status: 'active', pump_companies: ['Pump 5', 'Pump 5A'], ladder_companies: [], rescue_companies: [], special_units: ['Parade 1950'], chief_units: ['District Chief - Car 1'], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: 'Two pumper units. High medical call volume area.' },
  { station_number: 6, name: 'Mill Creek', address: '8105 96 Street', district: 'Southwest', status: 'active', pump_companies: ['Pump 6'], ladder_companies: ['Ladder 6'], rescue_companies: [], special_units: [], chief_units: [], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: '' },
  { station_number: 7, name: 'Highlands', address: '5025 118 Avenue', district: 'North', status: 'closed_renovation', pump_companies: [], ladder_companies: [], rescue_companies: [], special_units: [], chief_units: [], min_crew_size: 0, total_min_staff: 0, has_ems: false, notes: 'Closed for revitalization. Resources redeployed to nearby stations. Expected back in service winter 2026.' },
  { station_number: 8, name: 'Blatchford', address: '8603 Flying Club Road NW', district: 'North', status: 'under_construction', pump_companies: [], ladder_companies: [], rescue_companies: [], special_units: [], chief_units: [], min_crew_size: 0, total_min_staff: 0, has_ems: false, notes: 'New Blatchford Station under construction. Resources temporarily at Station 10. Expected completion winter 2025/2026.' },
  { station_number: 9, name: 'Roper Station', address: '5604 50 Street', district: 'Southeast', status: 'active', pump_companies: ['Pump 9'], ladder_companies: [], rescue_companies: ['Rescue 9'], special_units: [], chief_units: ['District Chief - Car 2'], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: '' },
  { station_number: 10, name: 'Lauderdale', address: '12735 101 Street', district: 'North', status: 'active', pump_companies: ['Pump 10', 'Pump 10A'], ladder_companies: [], rescue_companies: [], special_units: ['Hazmat 10', 'Hazmat 2', 'Hazmat 3'], chief_units: [], min_crew_size: 4, total_min_staff: 12, has_ems: false, notes: 'HAZMAT specialty station. Two pumper units. Currently also housing Station 8 resources.' },
  { station_number: 11, name: 'Capilano', address: '6110 98 Avenue', district: 'Southeast', status: 'active', pump_companies: ['Pump 11', 'Pump 11A'], ladder_companies: [], rescue_companies: [], special_units: ['River boom trailer'], chief_units: [], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: 'Two pumper units.' },
  { station_number: 12, name: 'Meadowlark', address: '9020 156 Street', district: 'Southwest', status: 'active', pump_companies: ['Pump 12'], ladder_companies: [], rescue_companies: [], special_units: [], chief_units: [], min_crew_size: 4, total_min_staff: 4, has_ems: false, notes: '' },
  { station_number: 13, name: 'Rainbow Valley', address: '4035 119 Street', district: 'Southwest', status: 'active', pump_companies: ['Pump 13'], ladder_companies: [], rescue_companies: [], special_units: [], chief_units: [], min_crew_size: 4, total_min_staff: 4, has_ems: false, notes: '' },
  { station_number: 14, name: 'Londonderry', address: '7312 144 Avenue', district: 'North', status: 'active', pump_companies: ['Pump 14'], ladder_companies: [], rescue_companies: ['Rescue 14'], special_units: [], chief_units: [], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: '' },
  { station_number: 15, name: 'Coronet', address: '5120 97 Street', district: 'Southeast', status: 'active', pump_companies: ['Pump 15'], ladder_companies: [], rescue_companies: [], special_units: [], chief_units: [], min_crew_size: 4, total_min_staff: 4, has_ems: false, notes: '' },
  { station_number: 16, name: 'Mill Woods', address: '2904 66 Street NW', district: 'Southeast', status: 'active', pump_companies: ['Pump 16'], ladder_companies: ['Ladder 16'], rescue_companies: [], special_units: [], chief_units: [], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: '' },
  { station_number: 17, name: 'Castle Downs', address: '15505 Castle Downs Road', district: 'North', status: 'active', pump_companies: ['Pump 17'], ladder_companies: ['Ladder 17'], rescue_companies: [], special_units: [], chief_units: [], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: '' },
  { station_number: 18, name: 'Clareview', address: '13808 Victoria Trail', district: 'North', status: 'active', pump_companies: ['Pump 18'], ladder_companies: ['Ladder 18'], rescue_companies: [], special_units: ['All Terrain Pump 18'], chief_units: [], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: '' },
  { station_number: 19, name: 'Callingwood', address: '6210 178 Street', district: 'Southwest', status: 'active', pump_companies: ['Pump 19'], ladder_companies: [], rescue_companies: ['Rescue 19'], special_units: [], chief_units: [], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: '' },
  { station_number: 20, name: 'Kaskitayo', address: '2303 105 Street NW', district: 'Southwest', status: 'active', pump_companies: ['Pump 20'], ladder_companies: [], rescue_companies: ['Rescue 20'], special_units: [], chief_units: [], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: '' },
  { station_number: 21, name: 'Rossdale', address: '9315 101 Street', district: 'Central', status: 'active', pump_companies: [], ladder_companies: [], rescue_companies: ['Rescue 21'], special_units: ['Mobile Command', 'Foam Truck 21', 'Tow unit 21', 'Utility boat', 'Jet boat x2'], chief_units: [], min_crew_size: 5, total_min_staff: 5, has_ems: false, notes: 'River rescue and water/ice rescue specialty station. No pumper unit. 5-person crew.' },
  { station_number: 22, name: 'Wîhkwêntôwin', address: '10124 123 Street', district: 'Central', status: 'active', pump_companies: ['Pump 22'], ladder_companies: ['Ladder 22'], rescue_companies: [], special_units: [], chief_units: [], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: 'Formerly Oliver station.' },
  { station_number: 23, name: 'Morin', address: '10130 178 Street', district: 'Southwest', status: 'active', pump_companies: ['Pump 23'], ladder_companies: ['Ladder 23'], rescue_companies: [], special_units: ['All Terrain Pump 23'], chief_units: [], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: '' },
  { station_number: 24, name: 'Terwillegar', address: '131 Haddow Close', district: 'Southwest', status: 'active', pump_companies: ['Pump 24'], ladder_companies: ['Ladder 24'], rescue_companies: [], special_units: ['All Terrain Pump 24', 'Mule 24'], chief_units: ['District Chief - Car 3'], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: '' },
  { station_number: 25, name: 'Lake District', address: '8403 167 Avenue', district: 'North', status: 'active', pump_companies: ['Pump 25'], ladder_companies: [], rescue_companies: [], special_units: ['Investigator 1', 'Investigator 2', 'Investigator K9', 'Service 1', 'Fan Trailer'], chief_units: ['District Chief - Car 5'], min_crew_size: 4, total_min_staff: 4, has_ems: false, notes: 'Fire investigation unit based here.' },
  { station_number: 26, name: 'Meadows', address: '2803 34 Street NW', district: 'Southeast', status: 'active', pump_companies: ['Pump 26'], ladder_companies: [], rescue_companies: [], special_units: ['Tanker 26', 'Salvage 1', 'Service truck 2'], chief_units: [], min_crew_size: 4, total_min_staff: 4, has_ems: false, notes: 'Edge station with tanker for non-hydrant zones.' },
  { station_number: 27, name: 'Ellerslie', address: '1203 Ellwood Road SW', district: 'Southeast', status: 'active', pump_companies: ['Pump 27'], ladder_companies: ['Ladder 27'], rescue_companies: [], special_units: ['All Terrain Pump 27', 'Tanker 27'], chief_units: [], min_crew_size: 4, total_min_staff: 8, has_ems: false, notes: 'Edge station with tanker for non-hydrant zones.' },
  { station_number: 28, name: 'Heritage Valley', address: '12110 26 Avenue SW', district: 'Southwest', status: 'active', pump_companies: ['Pump 28'], ladder_companies: [], rescue_companies: [], special_units: ['Tanker 28'], chief_units: [], min_crew_size: 4, total_min_staff: 4, has_ems: false, notes: 'Edge station with tanker for non-hydrant zones.' },
  { station_number: 29, name: 'Lewis Farms', address: '9204 213 Street', district: 'Southwest', status: 'active', pump_companies: ['Pump 29'], ladder_companies: [], rescue_companies: [], special_units: ['Tanker 29 (Super Tanker)'], chief_units: [], min_crew_size: 4, total_min_staff: 4, has_ems: false, notes: 'Edge station with super tanker for non-hydrant zones.' },
  { station_number: 30, name: 'Pilot Sound', address: '15850 50 St NW', district: 'North', status: 'active', pump_companies: ['Pump 30'], ladder_companies: [], rescue_companies: [], special_units: ['Tanker 30 (Super Tanker)'], chief_units: [], min_crew_size: 4, total_min_staff: 4, has_ems: false, notes: 'Edge station with super tanker for non-hydrant zones.' },
  { station_number: 31, name: 'Windermere', address: '3865 Allan Drive SW', district: 'Southwest', status: 'active', pump_companies: ['Pump 31'], ladder_companies: [], rescue_companies: [], special_units: ['Tanker 31'], chief_units: [], min_crew_size: 4, total_min_staff: 4, has_ems: false, notes: 'Newest station. Edge station with tanker.' },
];

// Lookup helper: maps station_name ("01", "02", ...) to resource object
const _lookup = {};
for (const s of STATION_RESOURCES) {
  const key = String(s.station_number).padStart(2, '0');
  _lookup[key] = s;
}

export function getStationResource(stationName) {
  return _lookup[stationName] || _lookup[stationName?.replace(/^0+/, '')] || null;
}

// Derived helpers
export function getApparatusCount(res) {
  if (!res) return 0;
  return res.pump_companies.length + res.ladder_companies.length + res.rescue_companies.length;
}

export function getSpecialty(res) {
  if (!res) return null;
  const notes = (res.notes || '').toLowerCase();
  const specials = res.special_units.join(' ').toLowerCase();
  if (specials.includes('hazmat')) return 'HAZMAT';
  if (notes.includes('technical rescue') || specials.includes('technical rescue')) return 'TRT';
  if (notes.includes('river rescue') || notes.includes('water') || specials.includes('boat')) return 'Water Rescue';
  if (specials.includes('investigator')) return 'Investigation';
  return null;
}

export function getStatusLabel(status) {
  switch (status) {
    case 'active': return 'Active';
    case 'closed_renovation': return 'Closed — Renovation';
    case 'under_construction': return 'Under Construction';
    default: return status || 'Unknown';
  }
}

export function getStatusColor(status) {
  switch (status) {
    case 'active': return '#4ecdc4';
    case 'closed_renovation': return '#ff9933';
    case 'under_construction': return '#ffcc00';
    default: return '#7a8a9a';
  }
}
