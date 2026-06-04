export interface Signal {
  id: number;
  event_id?: number;
  market_id?: number;
  signal_type: string;
  current_price?: number;
  estimated_fair_value?: number;
  edge_pct?: number;
  confidence?: number;
  direction?: string;
  time_sensitivity?: string;
  reasoning?: string;
  status: string;
  created_at: string;
  // Enriched — joined from markets / events tables
  market_question?: string;
  market_condition_id?: string;
  market_category?: string;
  event_summary?: string;
}
