export interface Flight {
  icao24: string;
  callsign?: string;
  aircraft_type?: string;
  origin_country?: string;
  altitude?: number;
  velocity?: number;
  heading?: number;
  squawk?: string;
  is_military: boolean;
  is_government: boolean;
  latitude: number;
  longitude: number;
  captured_at?: string;
}

export interface Vessel {
  mmsi: string;
  vessel_name?: string;
  vessel_type?: number;
  vessel_type_name?: string;
  flag?: string;
  imo?: string;
  speed?: number;
  heading?: number;
  destination?: string;
  is_military: boolean;
  is_dark: boolean;
  latitude: number;
  longitude: number;
  captured_at?: string;
}

export interface TrackingAnomaly {
  id: number;
  anomaly_type?: string;
  entity_type?: string;
  entity_id?: string;
  severity: number;
  description?: string;
  detected_at: string;
}
