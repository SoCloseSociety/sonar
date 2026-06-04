/**
 * Aviation intelligence lookups — operator, aircraft type, country from ICAO24 hex.
 * Used to enrich ADS-B flight data in the UI without backend changes.
 */

// ── Callsign prefix → Operator name ──────────────────────────────────────────
export const OPERATOR_LOOKUP: Record<string, { name: string; country: string; type: 'military' | 'government' | 'cargo' | 'airline' }> = {
  // US Military
  RCH:   { name: 'USAF Air Mobility Command', country: 'US', type: 'military' },
  REACH: { name: 'USAF Air Mobility Command', country: 'US', type: 'military' },
  ATLAS: { name: 'USAF Strategic Airlift', country: 'US', type: 'military' },
  SPAR:  { name: 'USAF Special Air Mission', country: 'US', type: 'military' },
  CNV:   { name: 'US Navy', country: 'US', type: 'military' },
  FORTE: { name: 'USAF Global Hawk ISR', country: 'US', type: 'military' },
  DUKE:  { name: 'USAF Special Ops', country: 'US', type: 'military' },
  HOMER: { name: 'USAF E-6B TACAMO', country: 'US', type: 'military' },
  NAVY:  { name: 'US Navy', country: 'US', type: 'military' },
  EVAC:  { name: 'USAF Aeromedical Evacuation', country: 'US', type: 'military' },
  IRON:  { name: 'USAF', country: 'US', type: 'military' },
  STEEL: { name: 'USAF', country: 'US', type: 'military' },
  VIPER: { name: 'USAF Fighter Wing', country: 'US', type: 'military' },
  COBRA: { name: 'USAF', country: 'US', type: 'military' },
  GHOST: { name: 'USAF Stealth Ops', country: 'US', type: 'military' },
  POLAR: { name: 'USAF 3rd Wing Alaska', country: 'US', type: 'military' },
  TABOR: { name: 'USAF', country: 'US', type: 'military' },
  TACAM: { name: 'US Navy TACAMO', country: 'US', type: 'military' },
  SIGINT:{ name: 'USAF SIGINT', country: 'US', type: 'military' },
  DRAGON:{ name: 'USAF ISR', country: 'US', type: 'military' },
  REAPER:{ name: 'USAF MQ-9 Reaper', country: 'US', type: 'military' },
  MEDEVAC:{ name: 'Military Medical Evacuation', country: 'US', type: 'military' },
  // US Government / VIP
  SAM:   { name: 'USAF Special Air Mission (VIP)', country: 'US', type: 'government' },
  EXEC:  { name: 'US Executive Flight', country: 'US', type: 'government' },
  AIR1:  { name: 'Air Force One', country: 'US', type: 'government' },
  AIR2:  { name: 'Air Force Two', country: 'US', type: 'government' },
  MARINE:{ name: 'Marine One / Two', country: 'US', type: 'government' },
  // UK RAF
  RAF:   { name: 'Royal Air Force', country: 'GB', type: 'military' },
  ASCOT: { name: 'RAF Transport Command', country: 'GB', type: 'military' },
  TARTAN:{ name: 'RAF', country: 'GB', type: 'military' },
  VOYAGER:{ name: 'RAF Voyager Tanker', country: 'GB', type: 'military' },
  // France
  FAF:   { name: 'French Air & Space Force', country: 'FR', type: 'military' },
  COTAM: { name: "French Air Transport (COTAM)", country: 'FR', type: 'military' },
  CTM:   { name: "French Air Transport", country: 'FR', type: 'military' },
  // Germany
  GAF:   { name: 'German Air Force (Luftwaffe)', country: 'DE', type: 'military' },
  GAFCC: { name: 'German Air Force Command', country: 'DE', type: 'military' },
  // NATO
  NATO:  { name: 'NATO', country: 'NATO', type: 'military' },
  OTAN:  { name: 'NATO (OTAN)', country: 'NATO', type: 'military' },
  // Russia
  RFF:   { name: 'Russian Air Force', country: 'RU', type: 'military' },
  RFN:   { name: 'Russian Naval Aviation', country: 'RU', type: 'military' },
  // China
  CCA:   { name: 'PLA Air Force', country: 'CN', type: 'military' },
  CAF:   { name: 'Chinese Air Force', country: 'CN', type: 'military' },
  // Israel
  IAF:   { name: 'Israeli Air Force', country: 'IL', type: 'military' },
  ISRAF: { name: 'Israeli Air Force', country: 'IL', type: 'military' },
  // Turkey
  TUAF:  { name: 'Turkish Air Force', country: 'TR', type: 'military' },
  THY:   { name: 'Turkish Airlines', country: 'TR', type: 'airline' },
  // Sweden
  SWAF:  { name: 'Swedish Air Force', country: 'SE', type: 'military' },
  // Other military
  ITAL:  { name: 'Italian Air Force', country: 'IT', type: 'military' },
  SPA:   { name: 'Spanish Air Force', country: 'ES', type: 'military' },
  PAF:   { name: 'Pakistan Air Force', country: 'PK', type: 'military' },
  IAM:   { name: 'Italian Air Force', country: 'IT', type: 'military' },
  // Cargo
  FDX:   { name: 'FedEx Express', country: 'US', type: 'cargo' },
  UPS:   { name: 'UPS Airlines', country: 'US', type: 'cargo' },
  GTI:   { name: 'Atlas Air', country: 'US', type: 'cargo' },
  CLX:   { name: 'Cargolux', country: 'LU', type: 'cargo' },
  GEC:   { name: 'Lufthansa Cargo', country: 'DE', type: 'cargo' },
  ABW:   { name: 'AirBridgeCargo', country: 'RU', type: 'cargo' },
  VDA:   { name: 'Volga-Dnepr Airlines', country: 'RU', type: 'cargo' },
  ADB:   { name: 'Antonov Airlines', country: 'UA', type: 'cargo' },
  CKS:   { name: 'Kalitta Air', country: 'US', type: 'cargo' },
  SQC:   { name: 'Singapore Airlines Cargo', country: 'SG', type: 'cargo' },
  CAO:   { name: 'Air China Cargo', country: 'CN', type: 'cargo' },
  MPH:   { name: 'Martinair / KLM Cargo', country: 'NL', type: 'cargo' },
  AZG:   { name: 'Silk Way West Airlines', country: 'AZ', type: 'cargo' },
  BOX:   { name: 'AeroLogic (DHL/Lufthansa)', country: 'DE', type: 'cargo' },
  DHL:   { name: 'DHL Aviation', country: 'DE', type: 'cargo' },
  DHK:   { name: 'DHL Air Hong Kong', country: 'HK', type: 'cargo' },
  BCS:   { name: 'European Air Transport (DHL)', country: 'BE', type: 'cargo' },
  TYA:   { name: 'Turkish Cargo', country: 'TR', type: 'cargo' },
  POT:   { name: 'Polet Airlines', country: 'RU', type: 'cargo' },
  // Major airlines
  AAL:   { name: 'American Airlines', country: 'US', type: 'airline' },
  UAL:   { name: 'United Airlines', country: 'US', type: 'airline' },
  DAL:   { name: 'Delta Air Lines', country: 'US', type: 'airline' },
  SWA:   { name: 'Southwest Airlines', country: 'US', type: 'airline' },
  BAW:   { name: 'British Airways', country: 'GB', type: 'airline' },
  AFR:   { name: 'Air France', country: 'FR', type: 'airline' },
  DLH:   { name: 'Lufthansa', country: 'DE', type: 'airline' },
  KLM:   { name: 'KLM Royal Dutch', country: 'NL', type: 'airline' },
  UAE:   { name: 'Emirates', country: 'AE', type: 'airline' },
  QTR:   { name: 'Qatar Airways', country: 'QA', type: 'airline' },
  ETH:   { name: 'Ethiopian Airlines', country: 'ET', type: 'airline' },
  SIA:   { name: 'Singapore Airlines', country: 'SG', type: 'airline' },
  CPA:   { name: 'Cathay Pacific', country: 'HK', type: 'airline' },
  ANA:   { name: 'All Nippon Airways', country: 'JP', type: 'airline' },
  JAL:   { name: 'Japan Airlines', country: 'JP', type: 'airline' },
  KAL:   { name: 'Korean Air', country: 'KR', type: 'airline' },
  CCA2:  { name: 'Air China', country: 'CN', type: 'airline' },
  CSN:   { name: 'China Southern', country: 'CN', type: 'airline' },
  CES:   { name: 'China Eastern', country: 'CN', type: 'airline' },
  AFL:   { name: 'Aeroflot', country: 'RU', type: 'airline' },
  SVA:   { name: 'Saudi Arabian Airlines', country: 'SA', type: 'airline' },
  ELY:   { name: 'El Al Israel Airlines', country: 'IL', type: 'airline' },
  RYR:   { name: 'Ryanair', country: 'IE', type: 'airline' },
  EZY:   { name: 'easyJet', country: 'GB', type: 'airline' },
  IBE:   { name: 'Iberia', country: 'ES', type: 'airline' },
  TAP:   { name: 'TAP Air Portugal', country: 'PT', type: 'airline' },
  AZA:   { name: 'ITA Airways', country: 'IT', type: 'airline' },
  SAS:   { name: 'Scandinavian Airlines', country: 'SE', type: 'airline' },
  FIN:   { name: 'Finnair', country: 'FI', type: 'airline' },
  LOT:   { name: 'LOT Polish Airlines', country: 'PL', type: 'airline' },
  AUA:   { name: 'Austrian Airlines', country: 'AT', type: 'airline' },
  SWR:   { name: 'Swiss International', country: 'CH', type: 'airline' },
  TAM:   { name: 'LATAM Airlines', country: 'BR', type: 'airline' },
  AVA:   { name: 'Avianca', country: 'CO', type: 'airline' },
  AMX:   { name: 'Aeroméxico', country: 'MX', type: 'airline' },
  QFA:   { name: 'Qantas', country: 'AU', type: 'airline' },
  ANZ:   { name: 'Air New Zealand', country: 'NZ', type: 'airline' },
  RAM:   { name: 'Royal Air Maroc', country: 'MA', type: 'airline' },
  MSR:   { name: 'EgyptAir', country: 'EG', type: 'airline' },
  THY2:  { name: 'Turkish Airlines', country: 'TR', type: 'airline' },
  PIA:   { name: 'Pakistan International', country: 'PK', type: 'airline' },
  AIC:   { name: 'Air India', country: 'IN', type: 'airline' },
  ETD:   { name: 'Etihad Airways', country: 'AE', type: 'airline' },
  IRA:   { name: 'Iran Air', country: 'IR', type: 'airline' },
  IRK:   { name: 'Iraqi Airways', country: 'IQ', type: 'airline' },
  SYR:   { name: 'Syrian Air', country: 'SY', type: 'airline' },
};

// ── ICAO aircraft type code → human-readable name ────────────────────────────
export const AIRCRAFT_TYPE_NAMES: Record<string, string> = {
  // Strategic bombers
  B52:  'B-52 Stratofortress', B2: 'B-2 Spirit', B21: 'B-21 Raider',
  TU95: 'Tu-95 Bear', TU160: 'Tu-160 Blackjack', TU22: 'Tu-22M Backfire',
  // Military transports
  C17:  'C-17 Globemaster III', C130: 'C-130 Hercules', C5: 'C-5 Galaxy',
  C141: 'C-141 Starlifter', C27: 'C-27J Spartan',
  AN124: 'An-124 Ruslan', AN225: 'An-225 Mriya', IL76: 'Il-76 Candid',
  A400: 'A400M Atlas', C295: 'C-295', CN35: 'CN-235',
  // Tankers / refueling
  KC135: 'KC-135 Stratotanker', KC46: 'KC-46 Pegasus', KC10: 'KC-10 Extender',
  A330M: 'A330 MRTT Voyager', A310: 'A310 MRTT',
  // AWACS / command / ISR
  E3:   'E-3 Sentry AWACS', E4: 'E-4B Nightwatch (Doomsday)',
  E6:   'E-6B Mercury TACAMO', E7: 'E-7 Wedgetail',
  E8:   'E-8 JSTARS', RC135: 'RC-135 Rivet Joint',
  EP3:  'EP-3E Aries II', U2: 'U-2 Dragon Lady', SR71: 'SR-71 Blackbird',
  // Maritime patrol
  P8:   'P-8A Poseidon', P3: 'P-3 Orion',
  // Drones
  RQ4:  'RQ-4 Global Hawk', MQ9: 'MQ-9 Reaper', MQ1: 'MQ-1 Predator',
  // Osprey
  V22:  'V-22 Osprey',
  // Fighters
  F22:  'F-22 Raptor', F35: 'F-35 Lightning II',
  F18:  'F/A-18 Hornet', F16: 'F-16 Fighting Falcon',
  F15:  'F-15 Eagle', F14: 'F-14 Tomcat',
  EF2K: 'Eurofighter Typhoon', RFAL: 'Dassault Rafale',
  GR4:  'Tornado GR4', JAS39: 'Gripen',
  SU35: 'Su-35 Flanker-E', SU27: 'Su-27 Flanker', SU57: 'Su-57 Felon',
  MIG29: 'MiG-29 Fulcrum', MIG31: 'MiG-31 Foxhound', MIG35: 'MiG-35',
  J10: 'J-10 Vigorous Dragon', J11: 'J-11', J16: 'J-16', J20: 'J-20 Mighty Dragon',
  JH7: 'JH-7 Flying Leopard',
  // Attack
  A10:  'A-10 Thunderbolt II (Warthog)', SU25: 'Su-25 Frogfoot',
  // Military helicopters
  AH64: 'AH-64 Apache', UH60: 'UH-60 Black Hawk',
  CH47: 'CH-47 Chinook', H1: 'Bell UH-1 Huey',
  // Cargo aircraft
  B744: 'Boeing 747-400F', B748: 'Boeing 747-8F',
  B77L: 'Boeing 777F', B77F: 'Boeing 777F',
  B763: 'Boeing 767-300F', B764: 'Boeing 767-400F',
  A332: 'Airbus A330-200F', A333: 'Airbus A330-300F',
  MD11: 'MD-11F',
  // Common airliners (abbreviated)
  B738: 'Boeing 737-800', B739: 'Boeing 737-900',
  B737: 'Boeing 737', B38M: 'Boeing 737 MAX 8', B39M: 'Boeing 737 MAX 9',
  B772: 'Boeing 777-200', B773: 'Boeing 777-300',
  B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10',
  A319: 'Airbus A319', A320: 'Airbus A320', A321: 'Airbus A321',
  A20N: 'Airbus A320neo', A21N: 'Airbus A321neo',
  A339: 'Airbus A330-900neo', A359: 'Airbus A350-900', A35K: 'Airbus A350-1000',
  A388: 'Airbus A380',
  E190: 'Embraer E190', E195: 'Embraer E195',
  CRJ9: 'CRJ-900', CRJ7: 'CRJ-700', AT76: 'ATR 72-600',
};

// ── ICAO24 hex prefix → country of registration ─────────────────────────────
// Based on ICAO Annex 10 allocation blocks
const ICAO_COUNTRY_RANGES: [number, number, string, string][] = [
  // [start, end, country_code, country_name]
  [0x004000, 0x0043FF, 'ZW', 'Zimbabwe'],
  [0x006000, 0x006FFF, 'MZ', 'Mozambique'],
  [0x008000, 0x00FFFF, 'ZA', 'South Africa'],
  [0x010000, 0x017FFF, 'EG', 'Egypt'],
  [0x018000, 0x01FFFF, 'LY', 'Libya'],
  [0x020000, 0x027FFF, 'MA', 'Morocco'],
  [0x028000, 0x02FFFF, 'TN', 'Tunisia'],
  [0x040000, 0x047FFF, 'KE', 'Kenya'],
  [0x048000, 0x04FFFF, 'TZ', 'Tanzania'],
  [0x050000, 0x057FFF, 'ET', 'Ethiopia'],
  [0x060000, 0x067FFF, 'NG', 'Nigeria'],
  [0x0C0000, 0x0DFFFF, 'DZ', 'Algeria'],
  [0x200000, 0x27FFFF, 'CN', 'China'],
  [0x300000, 0x37FFFF, 'IN', 'India'],
  [0x380000, 0x3BFFFF, 'JP', 'Japan'],
  [0x3C0000, 0x3FFFFF, 'KR', 'South Korea'],
  [0x400000, 0x43FFFF, 'GB', 'United Kingdom'],
  [0x440000, 0x447FFF, 'AT', 'Austria'],
  [0x448000, 0x44FFFF, 'BE', 'Belgium'],
  [0x450000, 0x457FFF, 'BG', 'Bulgaria'],
  [0x458000, 0x45FFFF, 'DK', 'Denmark'],
  [0x460000, 0x467FFF, 'FI', 'Finland'],
  [0x468000, 0x46FFFF, 'GR', 'Greece'],
  [0x470000, 0x477FFF, 'HU', 'Hungary'],
  [0x478000, 0x47FFFF, 'NO', 'Norway'],
  [0x480000, 0x487FFF, 'NL', 'Netherlands'],
  [0x488000, 0x48FFFF, 'PL', 'Poland'],
  [0x490000, 0x497FFF, 'PT', 'Portugal'],
  [0x498000, 0x49FFFF, 'CZ', 'Czechia'],
  [0x4A0000, 0x4A7FFF, 'RO', 'Romania'],
  [0x4B0000, 0x4B7FFF, 'SE', 'Sweden'],
  [0x4B8000, 0x4BFFFF, 'CH', 'Switzerland'],
  [0x4C0000, 0x4C7FFF, 'TR', 'Turkey'],
  [0x4CA000, 0x4CAFFF, 'IE', 'Ireland'],
  [0x500000, 0x507FFF, 'IS', 'Iceland'],
  [0x508000, 0x50FFFF, 'IT', 'Italy'],
  [0x510000, 0x5103FF, 'ES', 'Spain'],
  [0x380000, 0x3BFFFF, 'JP', 'Japan'],
  [0x680000, 0x6FFFFF, 'PK', 'Pakistan'],
  [0x700000, 0x700FFF, 'AF', 'Afghanistan'],
  [0x710000, 0x717FFF, 'SA', 'Saudi Arabia'],
  [0x730000, 0x737FFF, 'IR', 'Iran'],
  [0x738000, 0x73FFFF, 'IQ', 'Iraq'],
  [0x740000, 0x747FFF, 'IL', 'Israel'],
  [0x748000, 0x74FFFF, 'JO', 'Jordan'],
  [0x750000, 0x757FFF, 'LB', 'Lebanon'],
  [0x758000, 0x75FFFF, 'SY', 'Syria'],
  [0x760000, 0x767FFF, 'AE', 'UAE'],
  [0x768000, 0x76FFFF, 'YE', 'Yemen'],
  [0x780000, 0x7BFFFF, 'RU', 'Russia'],
  [0x7C0000, 0x7FFFFF, 'AU', 'Australia'],
  [0x800000, 0x83FFFF, 'ID', 'Indonesia'],
  [0x840000, 0x87FFFF, 'MY', 'Malaysia'],
  [0x880000, 0x887FFF, 'TH', 'Thailand'],
  [0x888000, 0x88FFFF, 'VN', 'Vietnam'],
  [0x890000, 0x890FFF, 'SG', 'Singapore'],
  [0x898000, 0x89FFFF, 'TW', 'Taiwan'],
  [0x900000, 0x9FFFFF, 'BR', 'Brazil'],
  [0xA00000, 0xAFFFFF, 'US', 'United States'],
  [0xC00000, 0xC3FFFF, 'CA', 'Canada'],
  [0xC80000, 0xC87FFF, 'NZ', 'New Zealand'],
  [0xE00000, 0xE3FFFF, 'AR', 'Argentina'],
  [0xE40000, 0xE7FFFF, 'MX', 'Mexico'],
  [0xE80000, 0xE83FFF, 'CL', 'Chile'],
  [0xE84000, 0xE87FFF, 'CO', 'Colombia'],
  [0xE88000, 0xE8BFFF, 'VE', 'Venezuela'],
  [0x3C4000, 0x3C7FFF, 'DE', 'Germany'],
  [0x3C8000, 0x3CBFFF, 'DE', 'Germany'],
  [0x3CC000, 0x3CFFFF, 'DE', 'Germany'],
  [0x3D0000, 0x3DFFFF, 'DE', 'Germany'],
  [0x3E0000, 0x3FFFFF, 'DE', 'Germany'],
  [0x380000, 0x383FFF, 'FR', 'France'],
  [0x384000, 0x387FFF, 'FR', 'France'],
  [0x388000, 0x38FFFF, 'FR', 'France'],
  [0x390000, 0x39FFFF, 'FR', 'France'],
  [0x3A0000, 0x3AFFFF, 'FR', 'France'],
  [0x3B0000, 0x3BFFFF, 'FR', 'France'],
];

/**
 * Resolve operator info from callsign prefix.
 * Tries longest prefix first (e.g. REACH before RCH).
 */
export function getOperator(callsign: string): { name: string; country: string; type: string } | null {
  if (!callsign) return null;
  const cs = callsign.toUpperCase().trim();
  // Try progressively shorter prefixes (max 7 chars)
  for (let len = Math.min(cs.length, 7); len >= 2; len--) {
    const prefix = cs.slice(0, len);
    if (OPERATOR_LOOKUP[prefix]) return OPERATOR_LOOKUP[prefix];
  }
  return null;
}

/**
 * Get human-readable aircraft type name from ICAO type code.
 */
export function getAircraftTypeName(typeCode: string): string | null {
  if (!typeCode) return null;
  const t = typeCode.toUpperCase().trim();
  // Direct match
  if (AIRCRAFT_TYPE_NAMES[t]) return AIRCRAFT_TYPE_NAMES[t];
  // Try without trailing digits (e.g. "C130J" → "C130")
  const base = t.replace(/[A-Z]$/, '');
  if (AIRCRAFT_TYPE_NAMES[base]) return AIRCRAFT_TYPE_NAMES[base];
  return null;
}

/**
 * Derive country of registration from ICAO24 hex address.
 */
export function getCountryFromIcao24(icao24: string): { code: string; name: string } | null {
  if (!icao24 || icao24.length < 6) return null;
  const hex = parseInt(icao24, 16);
  if (isNaN(hex)) return null;
  for (const [start, end, code, name] of ICAO_COUNTRY_RANGES) {
    if (hex >= start && hex <= end) return { code, name };
  }
  return null;
}

/**
 * ISO country code → flag emoji (regional indicator symbols).
 */
export function countryFlag(code: string): string {
  if (!code || code.length < 2) return '';
  if (code === 'NATO') return '🔵';
  const c = code.toUpperCase();
  return String.fromCodePoint(
    0x1F1E6 + c.charCodeAt(0) - 65,
    0x1F1E6 + c.charCodeAt(1) - 65,
  );
}

/**
 * Get the strategic category label for display.
 */
export function getFlightCategory(callsign: string, aircraftType: string, isMilitary: boolean, isGovernment: boolean, squawk?: string): string {
  if (squawk === '7500') return 'HIJACK';
  if (squawk === '7600') return 'COMMS FAIL';
  if (squawk === '7700') return 'EMERGENCY';
  if (isGovernment) return 'GOVERNMENT';
  const op = getOperator(callsign);
  if (op) {
    if (op.type === 'military') return 'MILITARY';
    if (op.type === 'cargo') return 'CARGO';
  }
  if (isMilitary) return 'MILITARY';
  const typeName = getAircraftTypeName(aircraftType);
  if (typeName && /bomber|tanker|awacs|recon|patrol|drone|fighter|attack/i.test(typeName)) return 'MILITARY';
  return 'ZONE';
}
