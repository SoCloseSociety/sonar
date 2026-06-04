import { create } from 'zustand';

export interface MapLayer {
  id: string;
  name: string;
  icon: string;
  visible: boolean;
  description: string;
  group: string;
}

export const LAYER_GROUPS = [
  { key: 'intel', label: 'INTELLIGENCE', color: '#06b6d4' },
  { key: 'tracking', label: 'TRACKING', color: '#3b82f6' },
  { key: 'hazards', label: 'HAZARDS', color: '#f97316' },
  { key: 'infra', label: 'INFRASTRUCTURE', color: '#a855f7' },
] as const;

const DEFAULT_LAYERS: MapLayer[] = [
  // Intelligence
  { id: 'events', name: 'Events', icon: 'AlertCircle', visible: true, description: 'Geolocated OSINT events', group: 'intel' },
  { id: 'conflicts', name: 'Conflict Zones', icon: 'Crosshair', visible: true, description: 'Active conflict areas', group: 'intel' },
  { id: 'military', name: 'Military Bases', icon: 'Shield', visible: false, description: 'Known military installations', group: 'intel' },
  // Tracking
  { id: 'flights', name: 'Aircraft', icon: 'Plane', visible: true, description: 'Live ADS-B aircraft tracking', group: 'tracking' },
  { id: 'vessels', name: 'Vessels', icon: 'Ship', visible: true, description: 'Live AIS vessel tracking', group: 'tracking' },
  { id: 'webcams', name: 'Webcams', icon: 'Camera', visible: true, description: 'Public live camera feeds', group: 'tracking' },
  // Hazards
  { id: 'earthquakes', name: 'Earthquakes', icon: 'Activity', visible: false, description: 'USGS seismic activity', group: 'hazards' },
  { id: 'weather', name: 'Weather', icon: 'Cloud', visible: false, description: 'NOAA severe weather alerts', group: 'hazards' },
  { id: 'fires', name: 'Fires', icon: 'Flame', visible: false, description: 'NASA FIRMS active fires', group: 'hazards' },
  { id: 'nuclear', name: 'Nuclear', icon: 'Radiation', visible: false, description: 'Nuclear facilities & alerts', group: 'hazards' },
  // Infrastructure
  { id: 'cyber', name: 'Cyber Threats', icon: 'Wifi', visible: false, description: 'ICS/SCADA & cyber attacks', group: 'infra' },
  { id: 'oil', name: 'Oil & Gas', icon: 'Droplet', visible: false, description: 'Oil fields, terminals, pipelines', group: 'infra' },
  { id: 'gas', name: 'LNG & Gas Hubs', icon: 'Flame', visible: false, description: 'LNG terminals, gas pipelines', group: 'infra' },
  { id: 'energy', name: 'Energy & Dams', icon: 'Zap', visible: false, description: 'Hydroelectric dams, power plants', group: 'infra' },
  { id: 'chokepoint', name: 'Chokepoints', icon: 'Anchor', visible: false, description: 'Maritime straits & canals', group: 'infra' },
  { id: 'mining', name: 'Mining & Minerals', icon: 'Gem', visible: false, description: 'Gold, copper, lithium, rare earth', group: 'infra' },
  { id: 'water', name: 'Water & Dams', icon: 'Waves', visible: false, description: 'Critical dams & water control', group: 'infra' },
  { id: 'tech', name: 'Tech & Semiconductors', icon: 'Cpu', visible: false, description: 'Chip fabs, EUV, tech infrastructure', group: 'infra' },
  { id: 'port', name: 'Major Ports', icon: 'Ship', visible: false, description: 'Strategic container ports', group: 'infra' },
  { id: 'submarine_cable', name: 'Submarine Cables', icon: 'Cable', visible: false, description: 'Internet exchange & cable hubs', group: 'infra' },
  { id: 'heatmap', name: 'Heatmap', icon: 'Thermometer', visible: false, description: 'Event density overlay', group: 'infra' },
];

interface MapStore {
  layers: MapLayer[];
  viewport: { center: [number, number]; zoom: number };
  selectedFeature: unknown | null;
  toggleLayer: (layerId: string) => void;
  toggleGroup: (group: string) => void;
  enableAll: () => void;
  disableAll: () => void;
  setViewport: (center: [number, number], zoom: number) => void;
  flyTo: (lon: number, lat: number, zoom?: number) => void;
  setSelectedFeature: (feature: unknown | null) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  layers: DEFAULT_LAYERS,
  viewport: { center: [30, 25], zoom: 2.5 },
  selectedFeature: null,

  toggleLayer: (layerId) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === layerId ? { ...l, visible: !l.visible } : l
      ),
    })),

  toggleGroup: (group) =>
    set((state) => {
      const groupLayers = state.layers.filter(l => l.group === group);
      const allVisible = groupLayers.every(l => l.visible);
      return {
        layers: state.layers.map((l) =>
          l.group === group ? { ...l, visible: !allVisible } : l
        ),
      };
    }),

  enableAll: () =>
    set((state) => ({
      layers: state.layers.map((l) => ({ ...l, visible: true })),
    })),

  disableAll: () =>
    set((state) => ({
      layers: state.layers.map((l) => ({ ...l, visible: false })),
    })),

  setViewport: (center, zoom) =>
    set({ viewport: { center, zoom } }),

  flyTo: (lon, lat, zoom = 8) =>
    set({ viewport: { center: [lon, lat], zoom } }),

  setSelectedFeature: (feature) => set({ selectedFeature: feature }),
}));
