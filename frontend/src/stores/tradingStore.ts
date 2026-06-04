import { create } from 'zustand';
import api from '@/services/api';

export interface Order {
  id: number;
  market_id: number;
  condition_id: string;
  wallet_address: string;
  side: 'BUY' | 'SELL';
  outcome: 'YES' | 'NO';
  price: number;
  size: number;
  status: 'pending' | 'filled' | 'cancelled' | 'failed';
  tx_hash?: string;
  error_message?: string;
  created_at: string;
  filled_at?: string;
}

export interface Position {
  id: number;
  market_id: number;
  condition_id: string;
  outcome: 'YES' | 'NO';
  size: number;
  avg_price: number;
  current_price?: number;
  unrealized_pnl?: number;
}

interface TradingStore {
  orders: Order[];
  positions: Position[];
  loading: boolean;
  error: string | null;
  placeOrder: (params: {
    condition_id: string;
    side: 'BUY' | 'SELL';
    outcome: 'YES' | 'NO';
    price: number;
    size: number;
  }) => Promise<Order>;
  cancelOrder: (orderId: number) => Promise<void>;
  fetchOrders: () => Promise<void>;
  fetchPositions: () => Promise<void>;
}

export const useTradingStore = create<TradingStore>((set) => ({
  orders: [],
  positions: [],
  loading: false,
  error: null,

  placeOrder: async (params) => {
    set({ loading: true });
    try {
      const { data } = await api.post('/trading/orders', params);
      set((state) => ({
        orders: [data, ...state.orders],
        loading: false,
      }));
      return data;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  cancelOrder: async (orderId) => {
    await api.delete(`/trading/orders/${orderId}`);
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, status: 'cancelled' as const } : o
      ),
    }));
  },

  fetchOrders: async () => {
    try {
      const { data } = await api.get('/trading/orders');
      set({ orders: Array.isArray(data) ? data : [], error: null });
    } catch (err) {
      console.warn('Failed to fetch orders:', err);
    }
  },

  fetchPositions: async () => {
    try {
      const { data } = await api.get('/trading/positions');
      set({ positions: Array.isArray(data) ? data : [], error: null });
    } catch (err) {
      console.warn('Failed to fetch positions:', err);
    }
  },
}));
