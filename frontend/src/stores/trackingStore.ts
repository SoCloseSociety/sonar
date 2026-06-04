import { create } from 'zustand';
import type { Flight, Vessel, TrackingAnomaly } from '@/types/tracking';
import api from '@/services/api';

interface TrackingStore {
  flights: Flight[];
  vessels: Vessel[];
  anomalies: TrackingAnomaly[];
  flightsLoading: boolean;
  vesselsLoading: boolean;
  fetchFlights: (militaryOnly?: boolean) => Promise<void>;
  fetchVessels: (militaryOnly?: boolean) => Promise<void>;
  fetchAnomalies: () => Promise<void>;
  setFlights: (flights: Flight[]) => void;
  setVessels: (vessels: Vessel[]) => void;
}

export const useTrackingStore = create<TrackingStore>((set) => ({
  flights: [],
  vessels: [],
  anomalies: [],
  flightsLoading: false,
  vesselsLoading: false,

  fetchFlights: async (militaryOnly = false) => {
    try {
      set({ flightsLoading: true });
      const { data } = await api.get('/map/flights', {
        params: { military_only: militaryOnly },
      });
      set({ flights: data, flightsLoading: false });
    } catch (err) {
      console.error('[SONAR] Failed to fetch flights:', err);
      set({ flightsLoading: false });
    }
  },

  fetchVessels: async (militaryOnly = false) => {
    try {
      set({ vesselsLoading: true });
      const { data } = await api.get('/map/vessels', {
        params: { military_only: militaryOnly },
      });
      set({ vessels: data, vesselsLoading: false });
    } catch (err) {
      console.error('[SONAR] Failed to fetch vessels:', err);
      set({ vesselsLoading: false });
    }
  },

  fetchAnomalies: async () => {
    try {
      const { data } = await api.get('/tracking/anomalies');
      set({ anomalies: data });
    } catch (err) {
      console.error('[SONAR] Failed to fetch anomalies:', err);
    }
  },

  setFlights: (flights) => set({ flights }),
  setVessels: (vessels) => set({ vessels }),
}));
