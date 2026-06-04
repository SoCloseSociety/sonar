import { useEffect, useRef, memo } from 'react';
import maplibregl from 'maplibre-gl';

interface MiniMapProps {
  lat: number;
  lng: number;
  heading?: number;
  label?: string;
  accent?: string;
  zoom?: number;
  height?: number;
  /** 'flight' shows a plane icon, 'vessel' shows a ship icon */
  type?: 'flight' | 'vessel';
}

/**
 * Lightweight MapLibre minimap for the expanded tracking detail.
 * Dark style, single marker with heading indicator, no interaction.
 */
export const MiniMap = memo(function MiniMap({
  lat,
  lng,
  heading,
  label,
  accent = '#FF6D2A',
  zoom = 5,
  height = 140,
  type = 'flight',
}: MiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: [
              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm-tiles',
            paint: {
              'raster-brightness-max': 0.35,
              'raster-brightness-min': 0.0,
              'raster-contrast': 0.2,
              'raster-saturation': -0.85,
            },
          },
        ],
      },
      center: [lng, lat],
      zoom,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    });

    map.on('load', () => {
      // ── Pulsing ring around position ──
      map.addSource('pulse-ring', {
        type: 'geojson',
        data: { type: 'Point', coordinates: [lng, lat] },
      });
      map.addLayer({
        id: 'pulse-ring-layer',
        type: 'circle',
        source: 'pulse-ring',
        paint: {
          'circle-radius': 20,
          'circle-color': 'transparent',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': accent,
          'circle-stroke-opacity': 0.4,
        },
      });

      // ── Inner dot ──
      map.addLayer({
        id: 'position-dot',
        type: 'circle',
        source: 'pulse-ring',
        paint: {
          'circle-radius': 6,
          'circle-color': accent,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
          'circle-opacity': 1,
        },
      });

      // ── Heading line ──
      if (heading != null && heading < 360) {
        const hdgRad = (heading - 90) * (Math.PI / 180);
        const dist = 0.5;
        const endLat = lat + dist * Math.sin(hdgRad + Math.PI / 2);
        const cosLat = Math.cos(lat * Math.PI / 180);
        const endLng = cosLat !== 0 ? lng + dist * Math.cos(hdgRad + Math.PI / 2) / cosLat : lng;

        map.addSource('heading-line', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [[lng, lat], [endLng, endLat]],
            },
          },
        });
        map.addLayer({
          id: 'heading-line-layer',
          type: 'line',
          source: 'heading-line',
          paint: {
            'line-color': accent,
            'line-width': 2,
            'line-opacity': 0.8,
            'line-dasharray': [2, 2],
          },
        });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Only re-create when the target entity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  const icon = type === 'flight' ? '✈' : '⚓';
  const hdgStr = heading != null && heading < 360 ? `${Math.round(heading)}°` : '';

  return (
    <div className="relative border overflow-hidden rounded" style={{ borderColor: '#152030', height }}>
      {/* Map container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Overlay: label + coords */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, rgba(3,7,17,0.85) 0%, transparent 100%)' }}>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="text-xs leading-none">{icon}</span>
          {label && (
            <span className="text-[9px] font-mono font-bold truncate" style={{ color: accent }}>
              {label}
            </span>
          )}
          {hdgStr && (
            <span className="text-[7px] font-mono text-[#4E6070] flex items-center gap-0.5">
              HDG {hdgStr}
            </span>
          )}
        </div>
      </div>

      {/* Bottom overlay: coords */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(3,7,17,0.85) 0%, transparent 100%)' }}>
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[7px] font-mono text-[#4E6070] tabular-nums">
            {lat.toFixed(4)}°, {lng.toFixed(4)}°
          </span>
          <span className="text-[6px] font-mono text-[#2A3545]">
            ZOOM {zoom}
          </span>
        </div>
      </div>
    </div>
  );
});
