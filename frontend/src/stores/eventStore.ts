import { create } from 'zustand';
import type { SonarEvent } from '@/types/event';
import api from '@/services/api';

/**
 * Sanitize an event from API/WebSocket: ensure all "string" fields are actually
 * strings and not objects/numbers. Prevents React Error #31 ("Objects are not
 * valid as a React child") when API returns {} or a number for a string field.
 */
function sanitizeEvent(raw: Record<string, unknown>): SonarEvent {
  const s = (v: unknown): string | undefined => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return undefined; // {} or [] → drop
    return String(v);
  };
  const sReq = (v: unknown, fallback: string): string => s(v) ?? fallback;

  return {
    ...raw,
    id: typeof raw.id === 'number' ? raw.id : Number(raw.id) || 0,
    source: sReq(raw.source, 'unknown'),
    source_url: s(raw.source_url),
    raw_text: s(raw.raw_text),
    category: s(raw.category),
    severity: Number(raw.severity) || 0,
    confidence: Number(raw.confidence) || 0,
    impact_score: Number(raw.impact_score) || 0,
    country: s(raw.country),
    summary: s(raw.summary),
    image_url: s(raw.image_url),
    video_url: s(raw.video_url),
    created_at: sReq(raw.created_at, new Date().toISOString()),
    processed_at: s(raw.processed_at),
    // Keep arrays/objects only if they're the right type
    keywords: Array.isArray(raw.keywords) ? raw.keywords.filter((k: unknown) => typeof k === 'string') : undefined,
    entities: raw.entities && typeof raw.entities === 'object' && !Array.isArray(raw.entities) ? raw.entities as Record<string, unknown> : undefined,
    market_direction: raw.market_direction && typeof raw.market_direction === 'object' && !Array.isArray(raw.market_direction) ? raw.market_direction as Record<string, string> : undefined,
    media_urls: Array.isArray(raw.media_urls) ? raw.media_urls.filter((u: unknown) => typeof u === 'string') : undefined,
    latitude: typeof raw.latitude === 'number' ? raw.latitude : undefined,
    longitude: typeof raw.longitude === 'number' ? raw.longitude : undefined,
  } as SonarEvent;
}

interface EventFilters {
  category?: string;
  minSeverity: number;
  source?: string;
  country?: string;
  hours: number;
}

interface EventStore {
  events: SonarEvent[];
  loading: boolean;
  selectedEvent: SonarEvent | null;
  filters: EventFilters;
  countries: string[];
  newEventIds: Set<number>;
  fetchEvents: () => Promise<void>;
  setSelectedEvent: (event: SonarEvent | null) => void;
  addEvent: (event: SonarEvent) => void;
  markSeen: (id: number) => void;
  setFilter: (key: string, value: unknown) => void;
}

// ── SSE Connection (singleton with auto-reconnect) ──
let _sseSource: EventSource | null = null;
let _sseFallbackInterval: ReturnType<typeof setInterval> | null = null;
let _sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _sseReconnectAttempts = 0;

function _initSSE() {
  if (_sseSource) return;
  try {
    const baseUrl = (import.meta as unknown as Record<string, Record<string, string>>).env?.VITE_API_URL || '';
    _sseSource = new EventSource(`${baseUrl}/api/events/stream`);
    _sseSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ping') return;
        useEventStore.getState().addEvent(data);
      } catch { /* ignore parse errors */ }
    };
    _sseSource.onopen = () => {
      _sseReconnectAttempts = 0;
      // SSE connected — stop polling fallback
      if (_sseFallbackInterval) {
        clearInterval(_sseFallbackInterval);
        _sseFallbackInterval = null;
      }
    };
    _sseSource.onerror = () => {
      _sseSource?.close();
      _sseSource = null;
      // Start polling fallback immediately
      if (!_sseFallbackInterval) {
        _sseFallbackInterval = setInterval(() => useEventStore.getState().fetchEvents(), 60000);
      }
      // Auto-reconnect with exponential backoff (5s, 10s, 20s, 30s max)
      _sseReconnectAttempts++;
      const delay = Math.min(5000 * Math.pow(2, _sseReconnectAttempts - 1), 30000);
      if (_sseReconnectTimer) clearTimeout(_sseReconnectTimer);
      _sseReconnectTimer = setTimeout(_initSSE, delay);
    };
  } catch {
    if (!_sseFallbackInterval) {
      _sseFallbackInterval = setInterval(() => useEventStore.getState().fetchEvents(), 60000);
    }
  }
}

// Start SSE on module load
setTimeout(_initSSE, 3000);

export const useEventStore = create<EventStore>((set, get) => ({
  events: [],
  loading: false,
  selectedEvent: null,
  filters: { minSeverity: 0, hours: 48 },
  countries: [],
  newEventIds: new Set(),

  fetchEvents: async () => {
    set({ loading: true });
    try {
      const { filters } = get();
      const params: Record<string, unknown> = {};
      if (filters.category) params.category = filters.category;
      if (filters.minSeverity > 0) params.min_severity = filters.minSeverity;
      if (filters.source) params.source = filters.source;
      if (filters.country) params.country = filters.country;
      if (filters.hours) params.hours = filters.hours;

      const { data } = await api.get('/events', { params });
      const events = (Array.isArray(data) ? data : []).map((e: Record<string, unknown>) => sanitizeEvent(e));
      const countrySet = new Set<string>();
      for (const ev of events) {
        if (ev.country) countrySet.add(ev.country);
      }
      set({
        events,
        loading: false,
        countries: [...countrySet].sort(),
      });
    } catch {
      set({ loading: false });
    }
  },

  setSelectedEvent: (event) => set({ selectedEvent: event }),

  addEvent: (raw) => {
    const event = sanitizeEvent(raw as unknown as Record<string, unknown>);
    set((state) => {
      // Dedup: skip if event with same id already exists
      if (event.id && state.events.some(e => e.id === event.id)) return state;
      const updated = new Set(state.newEventIds);
      if (event.id) updated.add(event.id);
      return { events: [event, ...state.events].slice(0, 200), newEventIds: updated };
    });
    // Auto-clear NEW badge after 30s — outside set() to avoid double-fire in React Strict Mode
    if (event.id) {
      const eid = event.id;
      setTimeout(() => { get().markSeen(eid); }, 30000);
    }
  },

  markSeen: (id) =>
    set((state) => {
      if (!state.newEventIds.has(id)) return state;
      const updated = new Set(state.newEventIds);
      updated.delete(id);
      return { newEventIds: updated };
    }),

  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    })),
}));
