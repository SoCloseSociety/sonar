export interface Market {
  id: number;
  condition_id: string;
  question: string;
  description?: string;
  category?: string;
  outcomes?: { outcomes: string[]; prices: number[] };
  active: boolean;
  tags?: string[];
  end_date?: string;
  price_yes?: number;
  price_no?: number;
  volume_24h?: number;
  liquidity?: number;
  spread?: number;
  updated_at?: string;
}

export interface MarketSnapshot {
  price_yes: number;
  price_no: number;
  volume_24h: number;
  liquidity: number;
  spread: number;
  captured_at: string;
}
