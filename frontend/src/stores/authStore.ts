import { create } from 'zustand';
import type { User } from '@/types/auth';
import api from '@/services/api';

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  walletAuth: (walletAddress: string, signature: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: localStorage.getItem('sonar_token'),
  isAuthenticated: !!localStorage.getItem('sonar_token'),
  isLoading: !!localStorage.getItem('sonar_token'),

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('sonar_token', data.access_token);
    set({ user: data.user, token: data.access_token, isAuthenticated: true });
  },

  register: async (email, username, password) => {
    const { data } = await api.post('/auth/register', { email, username, password });
    localStorage.setItem('sonar_token', data.access_token);
    set({ user: data.user, token: data.access_token, isAuthenticated: true });
  },

  walletAuth: async (walletAddress, signature) => {
    const { data } = await api.post('/auth/wallet', { wallet_address: walletAddress, signature });
    localStorage.setItem('sonar_token', data.access_token);
    set({ user: data.user, token: data.access_token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('sonar_token');
    set({ user: null, token: null, isAuthenticated: false });
  },

  loadUser: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data, isAuthenticated: true });
    } catch {
      localStorage.removeItem('sonar_token');
      set({ user: null, token: null, isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
  },
}));

// Silent refresh every 10 minutes to keep session alive
// Use a managed interval that only runs when authenticated
let _refreshInterval: ReturnType<typeof setInterval> | null = null;

function startRefreshInterval() {
  if (_refreshInterval) return;
  _refreshInterval = setInterval(() => {
    const { token, loadUser } = useAuthStore.getState();
    if (token) {
      loadUser();
    } else {
      stopRefreshInterval();
    }
  }, 10 * 60 * 1000);
}

function stopRefreshInterval() {
  if (_refreshInterval) {
    clearInterval(_refreshInterval);
    _refreshInterval = null;
  }
}

// Start if already authenticated, listen for changes
if (useAuthStore.getState().token) startRefreshInterval();
useAuthStore.subscribe((state, prev) => {
  if (state.token && !prev.token) startRefreshInterval();
  if (!state.token && prev.token) stopRefreshInterval();
});
