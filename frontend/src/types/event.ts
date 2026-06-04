export interface SonarEvent {
  id: number;
  source: string;
  source_url?: string;
  raw_text?: string;
  category?: string;
  severity: number;
  confidence: number;
  impact_score: number;
  country?: string;
  summary?: string;
  keywords?: string[];
  entities?: Record<string, unknown>;
  market_direction?: Record<string, string>;
  latitude?: number;
  longitude?: number;
  image_url?: string;
  video_url?: string;
  media_urls?: string[];
  created_at: string;
  processed_at?: string;
}

export type EventCategory =
  | 'MILITARY_CONFLICT' | 'DIPLOMATIC' | 'ECONOMIC_POLICY'
  | 'POLITICAL_DOMESTIC' | 'NATURAL_DISASTER' | 'CRYPTO_MARKET'
  | 'ENERGY_COMMODITIES' | 'TECHNOLOGY' | 'NUCLEAR'
  | 'MARITIME_SECURITY' | 'AVIATION_INCIDENT' | 'SANCTIONS'
  | 'TERRORISM' | 'ELECTION' | 'INFRASTRUCTURE' | 'PANDEMIC_HEALTH';

export const SEVERITY_COLORS: Record<string, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
};

export function getSeverityLevel(severity: number): string {
  if (severity >= 8) return 'critical';
  if (severity >= 6) return 'high';
  if (severity >= 4) return 'medium';
  return 'low';
}

export function getSeverityColor(severity: number): string {
  return SEVERITY_COLORS[getSeverityLevel(severity)] || '#10b981';
}
