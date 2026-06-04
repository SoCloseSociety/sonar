import { create } from 'zustand';
import type { Market, MarketSnapshot } from '@/types/market';
import api from '@/services/api';

interface MarketStore {
  markets: Market[];
  total: number;
  loading: boolean;
  error: string | null;
  selectedMarket: Market | null;
  snapshots: MarketSnapshot[];
  fetchMarkets: (search?: string) => Promise<void>;
  fetchSnapshots: (marketId: number) => Promise<void>;
  setSelectedMarket: (market: Market | null) => void;
  updateMarket: (conditionId: string, data: Partial<Market>) => void;
}

export const useMarketStore = create<MarketStore>((set, get) => ({
  markets: [],
  total: 0,
  loading: false,
  error: null,
  selectedMarket: null,
  snapshots: [],

  fetchMarkets: async (search) => {
    set({ loading: true, error: null });
    try {
      const params: Record<string, unknown> = { active: true, limit: 200 };
      if (search) params.search = search;
      const { data } = await api.get('/markets', { params, timeout: 30000 });
      // Handle both old array format and new paginated format
      if (Array.isArray(data)) {
        set({ markets: data, total: data.length, loading: false });
      } else {
        set({ markets: data.markets || [], total: data.total || 0, loading: false });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch markets';
      set({ loading: false, error: msg });
    }
  },

  fetchSnapshots: async (marketId) => {
    try {
      const { data } = await api.get(`/markets/${marketId}/snapshots`);
      set({ snapshots: data });
    } catch (err) {
      console.warn('Failed to fetch snapshots:', err);
    }
  },

  setSelectedMarket: (market) => set({ selectedMarket: market }),

  updateMarket: (conditionId, update) =>
    set((state) => ({
      markets: state.markets.map((m) =>
        m.condition_id === conditionId ? { ...m, ...update } : m
      ),
    })),
}));
