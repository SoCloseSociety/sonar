import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useMapStore } from '@/stores/mapStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { MapControls } from './MapControls';
import { ZonePanel } from './ZonePanel';
import api from '@/services/api';

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// ── Severity color scale ──
function sevColor(s: number): string {
  if (s >= 9) return '#dc2626';
  if (s >= 7) return '#ef4444';
  if (s >= 5) return '#f59e0b';
  if (s >= 3) return '#10b981';
  return '#06b6d4';
}

function sevLabel(s: number): string {
  if (s >= 9) return 'CRITICAL';
  if (s >= 7) return 'HIGH';
  if (s >= 5) return 'MEDIUM';
  if (s >= 3) return 'LOW';
  return 'INFO';
}

// ── Time ago helper ──
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Normalize AIS heading (511 = not available)
function normalizeHeading(heading: number | undefined | null): number {
  if (!heading || heading >= 360 || heading === 511) return 0;
  return heading;
}

// ── SVG Icon Loader ──
function loadSvgIcon(map: maplibregl.Map, name: string, svg: string, size: number): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image(size, size);
    img.onload = () => {
      if (!map.hasImage(name)) map.addImage(name, img);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

// ── SVG Templates ──
const svgAircraft = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
  <defs>
    <filter id="ag-${fill.replace('#','')}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="abg-${fill.replace('#','')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${fill}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${fill}" stop-opacity="0.7"/>
    </linearGradient>
  </defs>
  <g filter="url(#ag-${fill.replace('#','')})">
    <path d="M20 2 L21.5 10 L18.5 10 Z" fill="${fill}" opacity="0.85"/>
    <path d="M18.5 10 L21.5 10 L22.5 15 L34 20 L33 22 L22.5 18.5 L22.5 29 L27 32 L26.5 34 L20 31 L13.5 34 L13 32 L17.5 29 L17.5 18.5 L7 22 L6 20 L17.5 15 Z" fill="url(#abg-${fill.replace('#','')})" stroke="#0a0e17" stroke-width="1" stroke-linejoin="round"/>
    <ellipse cx="20" cy="15" rx="1.2" ry="5" fill="rgba(255,255,255,0.15)"/>
    <circle cx="20" cy="8" r="1.2" fill="rgba(136,220,255,0.6)"/>
    <circle cx="14" cy="19" r="0.6" fill="rgba(255,255,255,0.35)"/>
    <circle cx="26" cy="19" r="0.6" fill="rgba(255,255,255,0.35)"/>
  </g>
</svg>`;

const svgVessel = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
  <defs>
    <filter id="vg-${fill.replace('#','')}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1.8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="vbg-${fill.replace('#','')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${fill}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${fill}" stop-opacity="0.65"/>
    </linearGradient>
  </defs>
  <g filter="url(#vg-${fill.replace('#','')})">
    <path d="M18 3 Q22 10 24 17 L25 24 L23 30 L13 30 L11 24 L12 17 Q14 10 18 3 Z" fill="url(#vbg-${fill.replace('#','')})" stroke="#0a0e17" stroke-width="1" stroke-linejoin="round"/>
    <rect x="14" y="13" width="8" height="7" rx="2" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"/>
    <rect x="15" y="14.5" width="6" height="2.5" rx="1" fill="rgba(136,221,255,0.3)"/>
    <line x1="18" y1="4" x2="18" y2="11" stroke="rgba(255,255,255,0.15)" stroke-width="1.2"/>
    <circle cx="18" cy="5" r="0.8" fill="rgba(255,255,255,0.4)"/>
    <line x1="14" y1="24" x2="22" y2="24" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>
    <line x1="13" y1="27" x2="23" y2="27" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
  </g>
</svg>`;

const svgCamera = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <rect x="2" y="7" width="20" height="13" rx="2" fill="${fill}" stroke="#0a0e17" stroke-width="1"/>
  <path d="M8 7 L10 3 L14 3 L16 7" fill="${fill}" stroke="#0a0e17" stroke-width="1"/>
  <circle cx="12" cy="14" r="4" fill="#0a0e17" opacity="0.4"/>
  <circle cx="12" cy="14" r="2.5" fill="rgba(255,255,255,0.3)"/>
</svg>`;

const svgEarthquake = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <circle cx="12" cy="12" r="10" fill="none" stroke="${fill}" stroke-width="1.5" opacity="0.3"/>
  <circle cx="12" cy="12" r="6" fill="none" stroke="${fill}" stroke-width="1.5" opacity="0.5"/>
  <circle cx="12" cy="12" r="3" fill="${fill}"/>
  <path d="M6 12 L8 8 L10 14 L12 6 L14 16 L16 10 L18 12" fill="none" stroke="${fill}" stroke-width="1.5"/>
</svg>`;

const svgFire = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path d="M12 2C12 2 8 8 8 13C8 16 9.5 19 12 21C14.5 19 16 16 16 13C16 8 12 2 12 2Z" fill="${fill}" stroke="#0a0e17" stroke-width="0.8"/>
  <path d="M12 8C12 8 10 11 10 14C10 16 11 17 12 18C13 17 14 16 14 14C14 11 12 8 12 8Z" fill="#fbbf24" opacity="0.7"/>
</svg>`;

const svgWeather = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path d="M6 16C3.8 16 2 14.2 2 12C2 10 3.5 8.3 5.5 8C6.3 5.6 8.4 4 11 4C14 4 16.5 6 17 9C19.2 9.2 21 11 21 13.2C21 15.5 19 17 17 16Z" fill="${fill}" stroke="#0a0e17" stroke-width="0.8"/>
  <line x1="8" y1="19" x2="8" y2="22" stroke="${fill}" stroke-width="1.5" opacity="0.6"/>
  <line x1="12" y1="18" x2="12" y2="22" stroke="${fill}" stroke-width="1.5" opacity="0.6"/>
  <line x1="16" y1="19" x2="16" y2="22" stroke="${fill}" stroke-width="1.5" opacity="0.6"/>
</svg>`;

const svgCyber = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <rect x="4" y="3" width="16" height="14" rx="2" fill="#0a0e17" stroke="${fill}" stroke-width="1.5"/>
  <line x1="4" y1="20" x2="20" y2="20" stroke="${fill}" stroke-width="1.5"/>
  <line x1="12" y1="17" x2="12" y2="20" stroke="${fill}" stroke-width="1.5"/>
  <text x="12" y="13" text-anchor="middle" fill="${fill}" font-size="7" font-family="monospace">&gt;_</text>
</svg>`;

const svgNuclear = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <circle cx="12" cy="12" r="10" fill="none" stroke="${fill}" stroke-width="1.2" opacity="0.3"/>
  <circle cx="12" cy="12" r="3" fill="${fill}"/>
  <path d="M12 2 A10 10 0 0 1 20.5 17" fill="none" stroke="${fill}" stroke-width="3" opacity="0.5"/>
  <path d="M20.5 17 A10 10 0 0 1 3.5 17" fill="none" stroke="${fill}" stroke-width="3" opacity="0.5"/>
  <path d="M3.5 17 A10 10 0 0 1 12 2" fill="none" stroke="${fill}" stroke-width="3" opacity="0.5"/>
</svg>`;

const svgMilBase = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <polygon points="12,2 15,9 22,9 16,14 18,22 12,17 6,22 8,14 2,9 9,9" fill="${fill}" stroke="#0a0e17" stroke-width="0.8"/>
</svg>`;

const svgEvent = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20">
  <circle cx="10" cy="10" r="8" fill="${fill}" opacity="0.25"/>
  <circle cx="10" cy="10" r="5" fill="${fill}" stroke="#0a0e17" stroke-width="1"/>
</svg>`;

// Category layer configs
const CATEGORY_LAYERS: Record<string, { category: string; color: string; svgFn: (c: string) => string }> = {
  earthquakes: { category: 'EARTHQUAKE', color: '#f97316', svgFn: svgEarthquake },
  weather: { category: 'WEATHER', color: '#38bdf8', svgFn: svgWeather },
  fires: { category: 'FIRE', color: '#ef4444', svgFn: svgFire },
  cyber: { category: 'CYBER_ATTACK', color: '#a855f7', svgFn: svgCyber },
};

export function GlobalMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const { layers, viewport } = useMapStore();
  const flights = useTrackingStore((s) => s.flights);
  const vessels = useTrackingStore((s) => s.vessels);
  const [mapLoaded, setMapLoaded] = useState(false);

  // ──── Init map ────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: DARK_STYLE,
      center: viewport.center as [number, number],
      zoom: viewport.zoom,
      maxZoom: 18,
      minZoom: 1.5,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', async () => {
      await registerAllIcons(map);
      loadCountryChoropleth(map);
      loadEventData(map);
      loadGeoJSONLayers(map);
      setupTrackingLayers(map);
      setupWebcamLayers(map);
      setupCategoryLayers(map);
      setMapLoaded(true);
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ──── FlyTo on viewport changes ────
  useEffect(() => {
    if (mapRef.current && mapLoaded) {
      mapRef.current.flyTo({
        center: viewport.center as [number, number],
        zoom: viewport.zoom,
        duration: 1500,
      });
    }
  }, [viewport.center[0], viewport.center[1], viewport.zoom]);

  // ──── Toggle layer visibility ────
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    const layerMapping: Record<string, string[]> = {
      events: ['events-symbols', 'events-glow'],
      conflicts: ['conflict-zones-fill', 'conflict-zones-line'],
      military: ['military-symbols'],
      nuclear: ['nuclear-symbols'],
      flights: ['flights-layer'],
      vessels: ['vessels-layer'],
      webcams: ['webcams-symbols', 'webcams-glow'],
      heatmap: ['events-heatmap'],
      earthquakes: ['earthquakes-symbols', 'earthquakes-glow'],
      weather: ['weather-symbols', 'weather-glow'],
      fires: ['fires-symbols', 'fires-glow'],
      cyber: ['cyber-symbols', 'cyber-glow'],
    };

    for (const layer of layers) {
      const mapLayers = layerMapping[layer.id] || [];
      for (const layerId of mapLayers) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
        }
      }
    }
  }, [layers, mapLoaded]);

  // ──── Always fetch tracking data ────
  useEffect(() => {
    useTrackingStore.getState().fetchFlights();
    useTrackingStore.getState().fetchVessels();
    const iv1 = setInterval(() => useTrackingStore.getState().fetchFlights(), 120_000);
    const iv2 = setInterval(() => useTrackingStore.getState().fetchVessels(), 180_000);
    return () => { clearInterval(iv1); clearInterval(iv2); };
  }, []);

  // ──── Fetch webcams on load ────
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    loadWebcams(mapRef.current);
  }, [mapLoaded]);

  // ──── Auto-refresh event data every 2 minutes ────
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    const refreshEvents = async () => {
      try {
        const { data } = await api.get('/map/events', { params: { hours: 48 } });
        const features = (data || [])
          .filter((e: { latitude: number; longitude: number }) => e.latitude && e.longitude)
          .map((e: { id: number; longitude: number; latitude: number; severity: number; summary: string; category: string; created_at: string; source: string; country: string; impact_score: number; keywords: string }) => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [e.longitude, e.latitude] },
            properties: {
              id: e.id, severity: e.severity || 0,
              summary: e.summary || `${e.source || 'Unknown'} event`,
              category: e.category || String(e.source || 'EVENT').toUpperCase(),
              created_at: e.created_at || '', source: e.source || '',
              country: e.country || '', impact_score: e.impact_score || 0,
              keywords: e.keywords || '',
              icon: e.severity >= 9 ? 'evt-critical' : e.severity >= 7 ? 'evt-high' : e.severity >= 5 ? 'evt-medium' : e.severity >= 3 ? 'evt-low' : 'evt-info',
            },
          }));
        const source = map.getSource('events-source') as maplibregl.GeoJSONSource;
        if (source) source.setData({ type: 'FeatureCollection', features });
      } catch (err) {
        console.error('[SONAR] Event refresh failed:', err);
      }
    };
    const iv = setInterval(refreshEvents, 120_000);
    return () => clearInterval(iv);
  }, [mapLoaded]);

  // ──── Fetch category data when toggled on ────
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    for (const [layerId, config] of Object.entries(CATEGORY_LAYERS)) {
      const layer = layers.find((l) => l.id === layerId);
      if (layer?.visible) loadCategoryData(map, layerId, config);
    }
  }, [layers, mapLoaded]);

  // ──── Update flight markers ────
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource('flights-source') as maplibregl.GeoJSONSource;
    if (!source) return;

    source.setData({
      type: 'FeatureCollection',
      features: flights.map((f) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [f.longitude, f.latitude] },
        properties: {
          callsign: f.callsign || f.icao24,
          icao24: f.icao24,
          is_military: f.is_military,
          is_government: f.is_government,
          heading: normalizeHeading(f.heading),
          altitude: f.altitude ?? 0,
          velocity: f.velocity ?? 0,
          origin_country: f.origin_country || '',
          squawk: f.squawk || '',
          icon: f.is_military ? 'aircraft-mil' : f.is_government ? 'aircraft-gov' : 'aircraft-civ',
        },
      })),
    });
  }, [flights, mapLoaded]);

  // ──── Update vessel markers ────
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource('vessels-source') as maplibregl.GeoJSONSource;
    if (!source) return;

    source.setData({
      type: 'FeatureCollection',
      features: vessels.map((v) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [v.longitude, v.latitude] },
        properties: {
          name: v.vessel_name || v.mmsi,
          mmsi: v.mmsi,
          is_military: v.is_military,
          is_dark: v.is_dark,
          heading: normalizeHeading(v.heading),
          speed: v.speed ?? 0,
          flag: v.flag || '',
          destination: v.destination || '',
          vessel_type: v.vessel_type ?? 0,
          icon: v.is_military ? 'vessel-mil' : (v.is_dark ? 'vessel-dark' : 'vessel-civ'),
        },
      })),
    });
  }, [vessels, mapLoaded]);

  // ──────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────

  // ──── Country choropleth (severity-based country coloring) ────
  async function loadCountryChoropleth(map: maplibregl.Map) {
    try {
      // Fetch events and aggregate severity by country
      const { data: events } = await api.get('/map/events', { params: { hours: 48 } });
      const countryScores: Record<string, { maxSev: number; count: number }> = {};
      for (const e of events || []) {
        const country = e.country;
        if (!country) continue;
        if (!countryScores[country]) countryScores[country] = { maxSev: 0, count: 0 };
        countryScores[country].maxSev = Math.max(countryScores[country].maxSev, e.severity || 0);
        countryScores[country].count += 1;
      }

      // Load Natural Earth country boundaries
      const geoResp = await fetch('https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_countries.geojson');
      if (!geoResp.ok) return;
      const geoData = await geoResp.json();

      // Enrich features with severity score
      for (const feature of geoData.features) {
        const name = feature.properties?.name || feature.properties?.NAME || '';
        const nameUpper = String(name).toUpperCase();
        const iso = String(feature.properties?.iso_a2 || '').toUpperCase();
        // Try matching by name or ISO code
        let score = countryScores[name] || countryScores[nameUpper] || countryScores[iso];
        if (!score) {
          // Try partial match
          for (const [key, val] of Object.entries(countryScores)) {
            if (nameUpper.includes(String(key).toUpperCase()) || String(key).toUpperCase().includes(nameUpper)) {
              score = val;
              break;
            }
          }
        }
        feature.properties.severity_score = score?.maxSev || 0;
        feature.properties.event_count = score?.count || 0;
      }

      map.addSource('countries-choropleth', { type: 'geojson', data: geoData });

      // Determine safe insertion point — use first available layer or undefined (top)
      const insertBefore = map.getLayer('events-glow') ? 'events-glow'
        : map.getLayer('events-symbols') ? 'events-symbols'
        : undefined;

      // Country fill — much more visible severity colors
      map.addLayer({
        id: 'country-severity-fill',
        type: 'fill',
        source: 'countries-choropleth',
        paint: {
          'fill-color': [
            'interpolate', ['linear'], ['get', 'severity_score'],
            0, 'rgba(0,0,0,0)',
            1, 'rgba(0,207,235,0.08)',
            3, 'rgba(0,230,118,0.12)',
            5, 'rgba(255,168,0,0.18)',
            7, 'rgba(255,109,42,0.22)',
            9, 'rgba(255,58,58,0.28)',
          ],
          'fill-opacity': 1,
        },
      }, insertBefore);

      // Country borders — clearly visible for ALL countries
      map.addLayer({
        id: 'country-borders-all',
        type: 'line',
        source: 'countries-choropleth',
        paint: {
          'line-color': [
            'interpolate', ['linear'], ['zoom'],
            1, 'rgba(42,53,69,0.6)',
            4, 'rgba(42,53,69,0.8)',
            8, 'rgba(78,96,112,0.7)',
          ],
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            1, 0.3,
            3, 0.7,
            6, 1.0,
          ],
        },
      }, insertBefore);

      // Severity-colored borders — only for countries with events
      map.addLayer({
        id: 'country-severity-line',
        type: 'line',
        source: 'countries-choropleth',
        filter: ['>', ['get', 'severity_score'], 0],
        paint: {
          'line-color': [
            'interpolate', ['linear'], ['get', 'severity_score'],
            1, 'rgba(0,207,235,0.55)',
            5, 'rgba(255,168,0,0.65)',
            7, 'rgba(255,109,42,0.75)',
            9, 'rgba(255,58,58,0.9)',
          ],
          'line-width': [
            'interpolate', ['linear'], ['get', 'severity_score'],
            1, 1.0,
            5, 1.6,
            7, 2.2,
            9, 2.8,
          ],
        },
      }, insertBefore);
    } catch (err) {
      console.error('[SONAR] Country choropleth failed:', err);
    }
  }

  async function registerAllIcons(map: maplibregl.Map) {
    await Promise.all([
      // Aircraft
      loadSvgIcon(map, 'aircraft-mil', svgAircraft('#ef4444'), 40),
      loadSvgIcon(map, 'aircraft-gov', svgAircraft('#f59e0b'), 40),
      loadSvgIcon(map, 'aircraft-civ', svgAircraft('#94a3b8'), 40),
      // Vessels
      loadSvgIcon(map, 'vessel-mil', svgVessel('#ef4444'), 36),
      loadSvgIcon(map, 'vessel-civ', svgVessel('#3b82f6'), 36),
      loadSvgIcon(map, 'vessel-dark', svgVessel('#f97316'), 36),
      // Webcams
      loadSvgIcon(map, 'webcam-active', svgCamera('#06b6d4'), 24),
      loadSvgIcon(map, 'webcam-inactive', svgCamera('#475569'), 24),
      // Events by severity
      loadSvgIcon(map, 'evt-critical', svgEvent('#dc2626'), 20),
      loadSvgIcon(map, 'evt-high', svgEvent('#ef4444'), 20),
      loadSvgIcon(map, 'evt-medium', svgEvent('#f59e0b'), 20),
      loadSvgIcon(map, 'evt-low', svgEvent('#10b981'), 20),
      loadSvgIcon(map, 'evt-info', svgEvent('#06b6d4'), 20),
      // Category icons
      loadSvgIcon(map, 'icon-earthquake', svgEarthquake('#f97316'), 24),
      loadSvgIcon(map, 'icon-weather', svgWeather('#38bdf8'), 24),
      loadSvgIcon(map, 'icon-fire', svgFire('#ef4444'), 24),
      loadSvgIcon(map, 'icon-cyber', svgCyber('#a855f7'), 24),
      // Static layers
      loadSvgIcon(map, 'icon-milbase', svgMilBase('#f59e0b'), 24),
      loadSvgIcon(map, 'icon-nuclear', svgNuclear('#8b5cf6'), 24),
    ]);
  }

  // ──── Events ────
  async function loadEventData(map: maplibregl.Map) {
    try {
      const { data } = await api.get('/map/events', { params: { hours: 48 } });
      const features = (data || [])
        .filter((e: { latitude: number; longitude: number }) => e.latitude && e.longitude)
        .map((e: { id: number; longitude: number; latitude: number; severity: number; summary: string; category: string; created_at: string; source: string; country: string; impact_score: number; keywords: string }) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [e.longitude, e.latitude] },
          properties: {
            id: e.id,
            severity: e.severity || 0,
            summary: e.summary || `${e.source || 'Unknown'} event`,
            category: e.category || String(e.source || 'EVENT').toUpperCase(),
            created_at: e.created_at || '',
            source: e.source || '',
            country: e.country || '',
            impact_score: e.impact_score || 0,
            keywords: e.keywords || '',
            icon: e.severity >= 9 ? 'evt-critical' : e.severity >= 7 ? 'evt-high' : e.severity >= 5 ? 'evt-medium' : e.severity >= 3 ? 'evt-low' : 'evt-info',
          },
        }));

      map.addSource('events-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // Glow layer
      map.addLayer({
        id: 'events-glow',
        type: 'circle',
        source: 'events-source',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'severity'], 0, 8, 5, 14, 10, 22],
          'circle-color': ['interpolate', ['linear'], ['get', 'severity'], 0, '#06b6d4', 3, '#10b981', 5, '#f59e0b', 7, '#ef4444', 9, '#dc2626'],
          'circle-opacity': 0.2,
          'circle-blur': 1,
        },
      });

      // Symbol layer with icons
      map.addLayer({
        id: 'events-symbols',
        type: 'symbol',
        source: 'events-source',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-size': ['interpolate', ['linear'], ['get', 'severity'], 0, 0.7, 5, 1.0, 10, 1.4],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });

      // Clusters
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'events-source',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#10b981', 10, '#f59e0b', 50, '#ef4444'],
          'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 50, 25],
          'circle-opacity': 0.7,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#0a0e17',
        },
      });

      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'events-source',
        filter: ['has', 'point_count'],
        layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 },
        paint: { 'text-color': '#ffffff' },
      });

      // Heatmap — matches severity color scale
      map.addLayer({
        id: 'events-heatmap',
        type: 'heatmap',
        source: 'events-source',
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'severity'], 0, 0.1, 3, 0.3, 5, 0.5, 7, 0.8, 9, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 1, 0.8, 5, 1.2, 10, 1.5],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 1, 20, 5, 35, 10, 50],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.1, 'rgba(6,182,212,0.15)',
            0.25, 'rgba(16,185,129,0.35)',
            0.45, 'rgba(245,158,11,0.5)',
            0.65, 'rgba(239,68,68,0.6)',
            0.85, 'rgba(220,38,38,0.75)',
            1, 'rgba(220,38,38,0.9)',
          ],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.7, 8, 0.5],
        },
      });

      // Click popup - rich event card
      map.on('click', 'events-symbols', (e) => {
        const f = e.features?.[0];
        if (!f?.properties) return;
        const coords = (f.geometry as GeoJSON.Point).coordinates;
        const p = f.properties;
        const sev = Number(p.severity) || 0;
        const color = sevColor(sev);
        const label = sevLabel(sev);
        const ago = p.created_at ? timeAgo(p.created_at) : '';
        const keywords = p.keywords ? String(p.keywords).split(',').slice(0, 5).map((k: string) =>
          `<span style="font-size:8px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.06);color:#94a3b8;">${k.trim()}</span>`
        ).join(' ') : '';

        // Category emoji
        const catEmojis: Record<string, string> = {
          MILITARY_CONFLICT: '\u2694\uFE0F', DIPLOMATIC: '\uD83C\uDFF3\uFE0F', ECONOMIC_POLICY: '\uD83D\uDCC8',
          NATURAL_DISASTER: '\uD83C\uDF0A', NUCLEAR: '\u2622\uFE0F', SANCTIONS: '\uD83D\uDEAB',
          ELECTION: '\uD83D\uDDF3\uFE0F', CRYPTO_MARKET: '\u20BF', ENERGY_COMMODITIES: '\u26FD',
          TERRORISM: '\uD83D\uDCA3', CYBER_ATTACK: '\uD83D\uDEE1\uFE0F', MARITIME_SECURITY: '\u2693',
          AVIATION_INCIDENT: '\u2708\uFE0F', EARTHQUAKE: '\uD83C\uDF0B', WEATHER: '\u26C8\uFE0F', FIRE: '\uD83D\uDD25',
          TECHNOLOGY: '\uD83D\uDD2C', POLITICAL_DOMESTIC: '\uD83C\uDFDB\uFE0F', PANDEMIC_HEALTH: '\uD83C\uDFE5',
        };
        const catEmoji = catEmojis[p.category] || '\uD83D\uDD34';
        const catDisplay = String(p.category || 'EVENT').replace(/_/g, ' ');

        const impact = Number(p.impact_score) || 0;
        const impactBar = impact > 0 ? `<div style="margin-top:8px;padding:6px 10px;background:rgba(255,255,255,0.02);border-radius:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:7px;color:#475569;letter-spacing:1.5px;">IMPACT SCORE</span>
            <span style="font-size:11px;color:${color};font-weight:700;">${impact}/10</span>
          </div>
          <div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;">
            <div style="height:100%;width:${impact * 10}%;background:${color};border-radius:2px;"></div>
          </div>
        </div>` : '';

        new maplibregl.Popup({ offset: 14, className: 'sonar-popup', maxWidth: '340px' })
          .setLngLat(coords as [number, number])
          .setHTML(`<div style="font-family:'JetBrains Mono',monospace;min-width:260px;">
            <!-- Header bar -->
            <div style="height:3px;background:linear-gradient(to right,${color},transparent);border-radius:2px;margin-bottom:10px;"></div>
            <!-- Badges row -->
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
              <span style="font-size:9px;padding:3px 8px;border-radius:4px;background:${color};color:#fff;font-weight:700;letter-spacing:0.5px;">${label}</span>
              <span style="font-size:9px;padding:3px 8px;border-radius:4px;background:rgba(255,255,255,0.06);color:#e2e8f0;">${catEmoji} ${catDisplay}</span>
              ${p.country ? `<span style="font-size:9px;padding:3px 6px;border-radius:4px;background:rgba(255,255,255,0.04);color:#64748b;">${p.country}</span>` : ''}
            </div>
            <!-- Summary -->
            <div style="color:#e2e8f0;font-size:12px;line-height:1.5;margin-bottom:8px;">${p.summary}</div>
            <!-- Keywords -->
            ${keywords ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">${keywords}</div>` : ''}
            <!-- Impact bar -->
            ${impactBar}
            <!-- Footer -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04);">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:9px;color:#475569;">SRC: <span style="color:#94a3b8;">${p.source}</span></span>
              </div>
              <span style="font-size:9px;color:#475569;">${ago}</span>
            </div>
          </div>`)
          .addTo(map);
      });
      map.on('mouseenter', 'events-symbols', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'events-symbols', () => { map.getCanvas().style.cursor = ''; });
    } catch (err) {
      console.error('[SONAR] Failed to load events:', err);
    }
  }

  // ──── GeoJSON static layers ────
  async function loadGeoJSONLayers(map: maplibregl.Map) {
    try {
      const resp = await fetch('/data/conflict_zones.geojson');
      if (resp.ok) {
        const data = await resp.json();
        map.addSource('conflicts-source', { type: 'geojson', data });

        // Severity-based fill coloring
        map.addLayer({
          id: 'conflict-zones-fill', type: 'fill', source: 'conflicts-source',
          paint: {
            'fill-color': [
              'interpolate', ['linear'], ['get', 'severity'],
              5, 'rgba(245,158,11,0.06)',
              7, 'rgba(239,68,68,0.08)',
              9, 'rgba(220,38,38,0.12)',
            ],
            'fill-opacity': 1,
          },
        });

        // Severity-based dashed border
        map.addLayer({
          id: 'conflict-zones-line', type: 'line', source: 'conflicts-source',
          paint: {
            'line-color': [
              'interpolate', ['linear'], ['get', 'severity'],
              5, '#f59e0b',
              7, '#ef4444',
              9, '#dc2626',
            ],
            'line-width': [
              'interpolate', ['linear'], ['get', 'severity'],
              5, 1,
              7, 1.5,
              9, 2,
            ],
            'line-opacity': [
              'interpolate', ['linear'], ['get', 'severity'],
              5, 0.3,
              7, 0.45,
              9, 0.6,
            ],
            'line-dasharray': [4, 2],
          },
        });

        // Zone name labels
        map.addLayer({
          id: 'conflict-zones-labels', type: 'symbol', source: 'conflicts-source',
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 10,
            'text-allow-overlap': false,
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          },
          paint: {
            'text-color': [
              'interpolate', ['linear'], ['get', 'severity'],
              5, 'rgba(245,158,11,0.5)',
              7, 'rgba(239,68,68,0.6)',
              9, 'rgba(220,38,38,0.7)',
            ],
            'text-halo-color': '#0a0e17',
            'text-halo-width': 1.5,
          },
        });

        // Click popup for conflict zones
        map.on('click', 'conflict-zones-fill', (e) => {
          const feat = e.features?.[0];
          if (!feat?.properties) return;
          const p = feat.properties;
          const sev = Number(p.severity) || 5;
          const color = sevColor(sev);
          new maplibregl.Popup({ offset: 12, className: 'sonar-popup', maxWidth: '280px' })
            .setLngLat(e.lngLat)
            .setHTML(`<div style="font-family:'JetBrains Mono',monospace;min-width:200px;">
              <div style="height:3px;background:linear-gradient(to right,${color},transparent);border-radius:2px;margin-bottom:10px;"></div>
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                <span style="font-size:9px;padding:3px 8px;border-radius:4px;background:${color};color:#fff;font-weight:700;">${sevLabel(sev)}</span>
                <span style="font-size:9px;padding:3px 8px;border-radius:4px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;font-weight:700;">CONFLICT ZONE</span>
              </div>
              <div style="color:#f1f5f9;font-size:15px;font-weight:800;margin-bottom:4px;">${p.name}</div>
              <div style="color:#94a3b8;font-size:11px;line-height:1.4;">${p.conflict || ''}</div>
            </div>`)
            .addTo(map);
        });
        map.on('mouseenter', 'conflict-zones-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'conflict-zones-fill', () => { map.getCanvas().style.cursor = ''; });
      }
    } catch (err) { console.error('[SONAR] Conflict zones failed:', err); }

    try {
      const resp = await fetch('/data/military_bases.geojson');
      if (resp.ok) {
        const data = await resp.json();
        map.addSource('military-source', { type: 'geojson', data });
        map.addLayer({
          id: 'military-symbols', type: 'symbol', source: 'military-source',
          layout: { visibility: 'none', 'icon-image': 'icon-milbase', 'icon-size': 0.8, 'icon-allow-overlap': true },
        });
        map.on('click', 'military-symbols', (e) => {
          const feat = e.features?.[0];
          if (!feat?.properties) return;
          const coords = (feat.geometry as GeoJSON.Point).coordinates;
          const p = feat.properties;
          new maplibregl.Popup({ offset: 12, className: 'sonar-popup', maxWidth: '280px' })
            .setLngLat(coords as [number, number])
            .setHTML(`<div style="font-family:'JetBrains Mono',monospace;min-width:200px;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                <span style="font-size:9px;padding:2px 6px;border-radius:3px;background:#f59e0b;color:#0a0e17;font-weight:700;">MILITARY BASE</span>
                <span style="font-size:9px;padding:2px 6px;border-radius:3px;background:rgba(255,255,255,0.08);color:#e2e8f0;">${p.type || ''}</span>
              </div>
              <div style="color:#e2e8f0;font-size:14px;font-weight:700;margin-bottom:2px;">${p.name}</div>
              <div style="color:#64748b;font-size:10px;margin-bottom:8px;">${p.country || ''} ${p.branch ? `\u00b7 ${p.branch}` : ''}</div>
            </div>`)
            .addTo(map);
        });
        map.on('mouseenter', 'military-symbols', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'military-symbols', () => { map.getCanvas().style.cursor = ''; });
      }
    } catch { /* no military data */ }

    try {
      const resp = await fetch('/data/nuclear_sites.geojson');
      if (resp.ok) {
        const data = await resp.json();
        map.addSource('nuclear-source', { type: 'geojson', data });
        map.addLayer({
          id: 'nuclear-symbols', type: 'symbol', source: 'nuclear-source',
          layout: { visibility: 'none', 'icon-image': 'icon-nuclear', 'icon-size': 0.85, 'icon-allow-overlap': true },
        });
        map.on('click', 'nuclear-symbols', (e) => {
          const feat = e.features?.[0];
          if (!feat?.properties) return;
          const coords = (feat.geometry as GeoJSON.Point).coordinates;
          const p = feat.properties;
          const riskColor = p.risk === 'critical' ? '#ef4444' : p.risk === 'high' ? '#f97316' : p.risk === 'medium' ? '#f59e0b' : '#10b981';
          new maplibregl.Popup({ offset: 12, className: 'sonar-popup', maxWidth: '280px' })
            .setLngLat(coords as [number, number])
            .setHTML(`<div style="font-family:'JetBrains Mono',monospace;min-width:200px;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                <span style="font-size:9px;padding:2px 6px;border-radius:3px;background:#8b5cf6;color:#fff;font-weight:700;">NUCLEAR</span>
                <span style="font-size:9px;padding:2px 6px;border-radius:3px;background:${riskColor};color:#fff;font-weight:700;">${String(p.risk || 'unknown').toUpperCase()}</span>
                <span style="font-size:9px;padding:2px 6px;border-radius:3px;background:rgba(255,255,255,0.08);color:#e2e8f0;">${p.type || ''}</span>
              </div>
              <div style="color:#e2e8f0;font-size:14px;font-weight:700;margin-bottom:2px;">${p.name}</div>
              <div style="color:#64748b;font-size:10px;margin-bottom:4px;">${p.country || ''} ${p.status ? `\u00b7 ${String(p.status).toUpperCase()}` : ''}</div>
            </div>`)
            .addTo(map);
        });
        map.on('mouseenter', 'nuclear-symbols', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'nuclear-symbols', () => { map.getCanvas().style.cursor = ''; });
      }
    } catch { /* no nuclear data */ }
  }

  // ──── Flights & Vessels ────
  function setupTrackingLayers(map: maplibregl.Map) {
    // FLIGHTS
    map.addSource('flights-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'flights-layer',
      type: 'symbol',
      source: 'flights-source',
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': [
          'interpolate', ['linear'], ['zoom'],
          2, 0.6,
          5, 0.85,
          8, 1.1,
        ],
        'icon-rotate': ['get', 'heading'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });

    map.on('click', 'flights-layer', (e) => {
      const f = e.features?.[0];
      if (!f?.properties) return;
      const coords = (f.geometry as GeoJSON.Point).coordinates;
      const p = f.properties;
      const isMil = p.is_military === true || p.is_military === 'true';
      const isGov = p.is_government === true || p.is_government === 'true';
      const accentColor = isMil ? '#ef4444' : isGov ? '#f59e0b' : '#3b82f6';
      const typeBadge = isMil
        ? `<span style="font-size:9px;padding:3px 8px;border-radius:4px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);color:#ef4444;font-weight:700;letter-spacing:0.5px;">MILITARY</span>`
        : isGov
        ? `<span style="font-size:9px;padding:3px 8px;border-radius:4px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);color:#f59e0b;font-weight:700;letter-spacing:0.5px;">GOVERNMENT</span>`
        : `<span style="font-size:9px;padding:3px 8px;border-radius:4px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);color:#60a5fa;font-weight:600;letter-spacing:0.5px;">CIVILIAN</span>`;

      const isEmergency = p.squawk && ['7500', '7600', '7700'].includes(String(p.squawk));
      const squawkMeaning: Record<string, string> = { '7500': 'HIJACK', '7600': 'RADIO FAIL', '7700': 'EMERGENCY' };
      const squawkAlert = isEmergency
        ? `<div style="margin-top:8px;padding:6px 10px;background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.5);border-radius:6px;display:flex;align-items:center;gap:6px;">
            <span style="width:8px;height:8px;border-radius:50%;background:#dc2626;box-shadow:0 0 8px rgba(220,38,38,0.8);display:inline-block;"></span>
            <span style="font-size:10px;color:#fca5a5;font-weight:700;letter-spacing:1px;">SQUAWK ${p.squawk} — ${squawkMeaning[String(p.squawk)] || 'ALERT'}</span>
          </div>` : '';

      const altM = Number(p.altitude) || 0;
      const altFt = altM ? Math.round(altM * 3.281).toLocaleString() : '--';
      const altKm = altM ? (altM / 1000).toFixed(1) : '--';
      const spdMs = Number(p.velocity) || 0;
      const spdKt = spdMs ? Math.round(spdMs * 1.944) : '--';
      const spdKmh = spdMs ? Math.round(spdMs * 3.6) : '--';
      const hdg = Number(p.heading) ? Math.round(Number(p.heading)) : null;
      const hdgStr = hdg !== null ? `${hdg}\u00b0` : '--';
      // Compass direction
      const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
      const compass = hdg !== null ? dirs[Math.round(hdg / 22.5) % 16] : '';

      new maplibregl.Popup({ offset: 16, className: 'sonar-popup', maxWidth: '320px' })
        .setLngLat(coords as [number, number])
        .setHTML(`<div style="font-family:'JetBrains Mono',monospace;min-width:260px;">
          <!-- Header bar -->
          <div style="height:3px;background:linear-gradient(to right,${accentColor},transparent);border-radius:2px;margin-bottom:10px;"></div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2"><path d="M12 2L9 12H2l6 4.5L5.5 22 12 17.5 18.5 22 16 16.5 22 12h-7z"/></svg>
              ${typeBadge}
            </div>
            <span style="font-size:8px;color:#475569;letter-spacing:1px;">AIRCRAFT</span>
          </div>
          <!-- Callsign + ICAO -->
          <div style="margin-bottom:10px;">
            <div style="color:#f1f5f9;font-size:18px;font-weight:800;letter-spacing:1px;">${p.callsign || 'UNKNOWN'}</div>
            <div style="color:#64748b;font-size:10px;margin-top:2px;">ICAO: <span style="color:#94a3b8;">${p.icao24}</span>${p.origin_country ? ` &middot; <span style="color:#94a3b8;">${p.origin_country}</span>` : ''}</div>
          </div>
          ${squawkAlert}
          <!-- Metrics grid -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:rgba(255,255,255,0.04);border-radius:8px;overflow:hidden;margin-top:8px;">
            <div style="padding:8px 6px;text-align:center;background:#0d1117;">
              <div style="color:#475569;font-size:7px;letter-spacing:1.5px;margin-bottom:4px;">ALTITUDE</div>
              <div style="color:#e2e8f0;font-size:14px;font-weight:700;">${altFt}</div>
              <div style="color:#475569;font-size:8px;">ft / ${altKm} km</div>
            </div>
            <div style="padding:8px 6px;text-align:center;background:#0d1117;">
              <div style="color:#475569;font-size:7px;letter-spacing:1.5px;margin-bottom:4px;">SPEED</div>
              <div style="color:#e2e8f0;font-size:14px;font-weight:700;">${spdKt}</div>
              <div style="color:#475569;font-size:8px;">kt / ${spdKmh} km/h</div>
            </div>
            <div style="padding:8px 6px;text-align:center;background:#0d1117;">
              <div style="color:#475569;font-size:7px;letter-spacing:1.5px;margin-bottom:4px;">HEADING</div>
              <div style="color:#e2e8f0;font-size:14px;font-weight:700;">${hdgStr}</div>
              <div style="color:#475569;font-size:8px;">${compass}</div>
            </div>
          </div>
          <!-- Squawk + Coords footer -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04);">
            <span style="font-size:9px;color:#475569;">SQK: <span style="color:${isEmergency ? '#ef4444' : '#94a3b8'};font-weight:${isEmergency ? '700' : '400'};">${p.squawk || '----'}</span></span>
            <span style="font-size:8px;color:#334155;">${Number(coords[1]).toFixed(3)}, ${Number(coords[0]).toFixed(3)}</span>
          </div>
        </div>`)
        .addTo(map);
    });
    map.on('mouseenter', 'flights-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'flights-layer', () => { map.getCanvas().style.cursor = ''; });

    // VESSELS
    map.addSource('vessels-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'vessels-layer',
      type: 'symbol',
      source: 'vessels-source',
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': [
          'interpolate', ['linear'], ['zoom'],
          2, 0.55,
          5, 0.8,
          8, 1.0,
        ],
        'icon-rotate': ['get', 'heading'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });

    map.on('click', 'vessels-layer', (e) => {
      const f = e.features?.[0];
      if (!f?.properties) return;
      const coords = (f.geometry as GeoJSON.Point).coordinates;
      const p = f.properties;
      const isMil = p.is_military === true || p.is_military === 'true';
      const isDark = p.is_dark === true || p.is_dark === 'true';
      const accentColor = isMil ? '#ef4444' : isDark ? '#f97316' : '#3b82f6';

      // Vessel type name mapping
      const vesselTypes: Record<string, string> = {
        '0': 'Unknown', '20': 'Wing in Ground', '30': 'Fishing', '31': 'Towing', '32': 'Towing (large)',
        '33': 'Dredging', '34': 'Diving Ops', '35': 'Military Ops', '36': 'Sailing', '37': 'Pleasure',
        '40': 'HSC', '50': 'Pilot', '51': 'SAR', '52': 'Tug', '53': 'Port Tender',
        '60': 'Passenger', '70': 'Cargo', '71': 'Cargo (hazard A)', '72': 'Cargo (hazard B)',
        '80': 'Tanker', '81': 'Tanker (hazard A)', '82': 'Tanker (hazard B)', '89': 'Tanker',
        '90': 'Other',
      };
      const vType = p.vessel_type ? (vesselTypes[String(p.vessel_type)] || `Type ${p.vessel_type}`) : 'Unknown';

      const badges = [];
      if (isMil) badges.push(`<span style="font-size:9px;padding:3px 8px;border-radius:4px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);color:#ef4444;font-weight:700;letter-spacing:0.5px;">MILITARY</span>`);
      if (isDark) badges.push(`<span style="font-size:9px;padding:3px 8px;border-radius:4px;background:rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.4);color:#fb923c;font-weight:700;letter-spacing:0.5px;">DARK SHIP</span>`);
      if (!isMil && !isDark) badges.push(`<span style="font-size:9px;padding:3px 8px;border-radius:4px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);color:#60a5fa;font-weight:600;letter-spacing:0.5px;">CIVILIAN</span>`);

      const spd = Number(p.speed) || 0;
      const hdg = Number(p.heading) && Number(p.heading) < 360 ? Math.round(Number(p.heading)) : null;
      const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
      const compass = hdg !== null ? dirs[Math.round(hdg / 22.5) % 16] : '';

      new maplibregl.Popup({ offset: 16, className: 'sonar-popup', maxWidth: '320px' })
        .setLngLat(coords as [number, number])
        .setHTML(`<div style="font-family:'JetBrains Mono',monospace;min-width:260px;">
          <!-- Header bar -->
          <div style="height:3px;background:linear-gradient(to right,${accentColor},transparent);border-radius:2px;margin-bottom:10px;"></div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${badges.join('')}</div>
            <span style="font-size:8px;color:#475569;letter-spacing:1px;">VESSEL</span>
          </div>
          <!-- Name + MMSI -->
          <div style="margin-bottom:10px;">
            <div style="color:#f1f5f9;font-size:18px;font-weight:800;letter-spacing:0.5px;">${p.name || 'UNKNOWN VESSEL'}</div>
            <div style="color:#64748b;font-size:10px;margin-top:2px;">
              MMSI: <span style="color:#94a3b8;">${p.mmsi}</span>
              ${p.flag ? ` &middot; <span style="color:#94a3b8;">${p.flag}</span>` : ''}
              &middot; <span style="color:#94a3b8;">${vType}</span>
            </div>
          </div>
          ${isDark ? `<div style="margin-bottom:10px;padding:6px 10px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);border-radius:6px;display:flex;align-items:center;gap:6px;">
            <span style="width:8px;height:8px;border-radius:50%;background:#f97316;box-shadow:0 0 8px rgba(249,115,22,0.7);display:inline-block;"></span>
            <div>
              <div style="font-size:10px;color:#fb923c;font-weight:700;letter-spacing:0.5px;">AIS TRANSPONDER OFF</div>
              <div style="font-size:8px;color:#92400e;margin-top:1px;">Possible dark ship activity detected</div>
            </div>
          </div>` : ''}
          <!-- Metrics grid -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:rgba(255,255,255,0.04);border-radius:8px;overflow:hidden;">
            <div style="padding:8px 6px;text-align:center;background:#0d1117;">
              <div style="color:#475569;font-size:7px;letter-spacing:1.5px;margin-bottom:4px;">SPEED</div>
              <div style="color:#e2e8f0;font-size:14px;font-weight:700;">${spd ? spd.toFixed(1) : '--'}</div>
              <div style="color:#475569;font-size:8px;">knots</div>
            </div>
            <div style="padding:8px 6px;text-align:center;background:#0d1117;">
              <div style="color:#475569;font-size:7px;letter-spacing:1.5px;margin-bottom:4px;">HEADING</div>
              <div style="color:#e2e8f0;font-size:14px;font-weight:700;">${hdg !== null ? hdg + '\u00b0' : '--'}</div>
              <div style="color:#475569;font-size:8px;">${compass}</div>
            </div>
            <div style="padding:8px 6px;text-align:center;background:#0d1117;">
              <div style="color:#475569;font-size:7px;letter-spacing:1.5px;margin-bottom:4px;">TYPE</div>
              <div style="color:#e2e8f0;font-size:11px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${vType}</div>
              <div style="color:#475569;font-size:8px;">AIS ${p.vessel_type || '--'}</div>
            </div>
          </div>
          <!-- Destination -->
          ${p.destination ? `<div style="margin-top:8px;padding:6px 10px;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:6px;">
            <div style="font-size:7px;color:#475569;letter-spacing:1.5px;margin-bottom:3px;">DESTINATION</div>
            <div style="font-size:12px;color:#93c5fd;font-weight:600;">${p.destination}</div>
          </div>` : ''}
          <!-- Footer -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04);">
            <span style="font-size:8px;color:#334155;">${Number(coords[1]).toFixed(3)}, ${Number(coords[0]).toFixed(3)}</span>
            <a href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:${p.mmsi}" target="_blank" rel="noopener" style="font-size:8px;color:#475569;text-decoration:none;">MarineTraffic &rarr;</a>
          </div>
        </div>`)
        .addTo(map);
    });
    map.on('mouseenter', 'vessels-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'vessels-layer', () => { map.getCanvas().style.cursor = ''; });
  }

  // ──── Webcams ────
  function setupWebcamLayers(map: maplibregl.Map) {
    map.addSource('webcams-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    // Glow
    map.addLayer({
      id: 'webcams-glow', type: 'circle', source: 'webcams-source',
      paint: { 'circle-radius': 14, 'circle-color': '#06b6d4', 'circle-opacity': 0.12, 'circle-blur': 1 },
    });

    // Symbol layer with camera icon
    map.addLayer({
      id: 'webcams-symbols',
      type: 'symbol',
      source: 'webcams-source',
      layout: {
        'icon-image': ['case', ['==', ['get', 'status'], 'active'], 'webcam-active', 'webcam-inactive'],
        'icon-size': 0.85,
        'icon-allow-overlap': true,
      },
    });

    // Hover preview with thumbnail
    map.on('mouseenter', 'webcams-symbols', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const feat = e.features?.[0];
      if (!feat?.properties) return;
      const coords = (feat.geometry as GeoJSON.Point).coordinates;
      const p = feat.properties;
      const thumb = p.thumbnail ? `<img src="${p.thumbnail}" style="width:200px;height:auto;border-radius:4px;margin-bottom:6px;" onerror="this.style.display='none'" />` : '';
      const live = p.status === 'active';

      if (hoverPopupRef.current) hoverPopupRef.current.remove();
      hoverPopupRef.current = new maplibregl.Popup({ offset: 14, className: 'sonar-popup', maxWidth: '220px', closeButton: false, closeOnClick: false })
        .setLngLat(coords as [number, number])
        .setHTML(`<div style="font-family:'JetBrains Mono',monospace;">
          ${thumb}
          <div style="display:flex;align-items:center;gap:5px;">
            <span style="width:6px;height:6px;border-radius:50%;background:${live ? '#10b981' : '#475569'};display:inline-block;"></span>
            <span style="color:#e2e8f0;font-size:11px;font-weight:500;">${p.name || 'Webcam'}</span>
          </div>
          <div style="color:#64748b;font-size:9px;margin-top:2px;">${[p.city, p.country].filter(Boolean).join(', ')}</div>
        </div>`)
        .addTo(map);
    });

    map.on('mouseleave', 'webcams-symbols', () => {
      map.getCanvas().style.cursor = '';
      if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null; }
    });

    // Click popup with embedded live stream
    map.on('click', 'webcams-symbols', (e) => {
      const feat = e.features?.[0];
      if (!feat?.properties) return;
      if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null; }

      const coords = (feat.geometry as GeoJSON.Point).coordinates;
      const p = feat.properties;
      const hasStream = p.player_url && p.player_url !== '';
      const thumb = p.thumbnail || '';
      const typeLabel = p.cam_type ? String(p.cam_type).toUpperCase() : 'CAM';

      // Embed the webcam player in an iframe, or show thumbnail as fallback
      const streamEmbed = hasStream
        ? `<div style="margin-bottom:8px;border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,0.06);">
            <iframe src="${p.player_url}" width="280" height="180" style="border:none;display:block;" allow="autoplay" loading="lazy"></iframe>
          </div>`
        : (thumb ? `<img src="${thumb}" style="width:100%;border-radius:6px;margin-bottom:8px;" onerror="this.style.display='none'" />` : '');

      new maplibregl.Popup({ offset: 14, className: 'sonar-popup', maxWidth: '320px' })
        .setLngLat(coords as [number, number])
        .setHTML(`<div style="font-family:'JetBrains Mono',monospace;min-width:240px;">
          ${streamEmbed}
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span style="font-size:9px;padding:2px 6px;border-radius:3px;background:${hasStream ? '#06b6d4' : '#475569'};color:${hasStream ? '#0a0e17' : '#e2e8f0'};font-weight:700;">${typeLabel}</span>
            ${hasStream ? '<span style="width:7px;height:7px;border-radius:50%;background:#10b981;display:inline-block;box-shadow:0 0 6px rgba(16,185,129,0.5);"></span>' : ''}
          </div>
          <div style="color:#e2e8f0;font-size:12px;font-weight:600;margin-bottom:2px;">${p.name || 'Unknown Camera'}</div>
          <div style="color:#94a3b8;font-size:10px;margin-bottom:6px;">${[p.city, p.country].filter(Boolean).join(', ')}</div>
          ${hasStream ? `<a href="${p.player_url}" target="_blank" rel="noopener" style="color:#06b6d4;text-decoration:none;font-size:10px;display:flex;align-items:center;gap:4px;">Open Full Stream <span style="font-size:12px;">\u2192</span></a>` : '<span style="color:#64748b;font-size:10px;">No stream available</span>'}
        </div>`)
        .addTo(map);
    });
  }

  async function loadWebcams(map: maplibregl.Map) {
    try {
      const { data: webcams } = await api.get('/map/webcams');
      if (!webcams?.length) return;

      const features = webcams
        .filter((c: { lat: number; lon: number }) => c.lat && c.lon)
        .map((c: { id: string; name: string; lon: number; lat: number; country: string; city: string; thumbnail: string; player_url: string; type: string; status: string }) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
          properties: { id: c.id, name: c.name, country: c.country, city: c.city, thumbnail: c.thumbnail, player_url: c.player_url, cam_type: c.type, status: c.status },
        }));

      const source = map.getSource('webcams-source') as maplibregl.GeoJSONSource;
      if (source) source.setData({ type: 'FeatureCollection', features });
    } catch (err) {
      console.error('[SONAR] Failed to load webcams:', err);
    }
  }

  // ──── Category layers (Earthquakes, Weather, Fires, Cyber) ────
  function setupCategoryLayers(map: maplibregl.Map) {
    const iconNameMap: Record<string, string> = {
      earthquakes: 'icon-earthquake',
      weather: 'icon-weather',
      fires: 'icon-fire',
      cyber: 'icon-cyber',
    };

    for (const [layerId, config] of Object.entries(CATEGORY_LAYERS)) {
      const src = `${layerId}-source`;
      map.addSource(src, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      map.addLayer({
        id: `${layerId}-glow`, type: 'circle', source: src, layout: { visibility: 'none' },
        paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'severity'], 0, 8, 5, 14, 10, 22], 'circle-color': config.color, 'circle-opacity': 0.15, 'circle-blur': 1 },
      });

      map.addLayer({
        id: `${layerId}-symbols`, type: 'symbol', source: src, layout: {
          visibility: 'none',
          'icon-image': iconNameMap[layerId] || 'evt-info',
          'icon-size': ['interpolate', ['linear'], ['get', 'severity'], 0, 0.7, 5, 1.0, 10, 1.3],
          'icon-allow-overlap': true,
        },
      });

      map.on('click', `${layerId}-symbols`, (ev) => {
        const feat = ev.features?.[0];
        if (!feat?.properties) return;
        const coords = (feat.geometry as GeoJSON.Point).coordinates;
        const p = feat.properties;
        const sev = Number(p.severity) || 0;
        const color = sevColor(sev);
        const ago = p.created_at ? timeAgo(p.created_at) : '';

        new maplibregl.Popup({ offset: 12, className: 'sonar-popup', maxWidth: '280px' })
          .setLngLat(coords as [number, number])
          .setHTML(`<div style="font-family:'JetBrains Mono',monospace;min-width:200px;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
              <span style="font-size:9px;padding:2px 6px;border-radius:3px;background:${config.color};color:#0a0e17;font-weight:700;">${config.category}</span>
              <span style="font-size:9px;padding:2px 6px;border-radius:3px;background:${color};color:#fff;font-weight:700;">SEV ${sev}</span>
            </div>
            <div style="color:#e2e8f0;font-size:12px;line-height:1.4;margin-bottom:6px;">${p.summary || 'Event detected'}</div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;">
              <span style="font-size:9px;color:#64748b;">${p.source || ''}</span>
              <span style="font-size:9px;color:#64748b;">${ago}</span>
            </div>
          </div>`)
          .addTo(map);
      });
      map.on('mouseenter', `${layerId}-symbols`, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', `${layerId}-symbols`, () => { map.getCanvas().style.cursor = ''; });
    }
  }

  async function loadCategoryData(map: maplibregl.Map, layerId: string, config: { category: string }) {
    try {
      const { data } = await api.get('/map/events', { params: { hours: 48, category: config.category } });
      const features = (data || [])
        .filter((e: { latitude: number; longitude: number }) => e.latitude && e.longitude)
        .map((e: { id: number; longitude: number; latitude: number; severity: number; summary: string; category: string; created_at: string; source: string }) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [e.longitude, e.latitude] },
          properties: { id: e.id, severity: e.severity || 0, summary: e.summary || 'Event detected', category: e.category, created_at: e.created_at, source: e.source },
        }));
      const source = map.getSource(`${layerId}-source`) as maplibregl.GeoJSONSource;
      if (source) source.setData({ type: 'FeatureCollection', features });
    } catch (err) {
      console.error(`[SONAR] Failed to load ${config.category}:`, err);
    }
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      {mapLoaded && <MapControls />}
      {mapLoaded && <ZonePanel />}
    </div>
  );
}
