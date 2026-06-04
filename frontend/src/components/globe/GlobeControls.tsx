import { useState, useMemo } from 'react';
import { useMapStore, LAYER_GROUPS } from '@/stores/mapStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { useEventStore } from '@/stores/eventStore';
import { clsx } from 'clsx';
import {
  Layers, ChevronDown, Eye, EyeOff,
  AlertCircle, Plane, Ship, Crosshair, Shield,
  Activity, Cloud, Flame, Radiation, Camera, Wifi,
  Globe2, Thermometer, Navigation,
} from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  AlertCircle, Plane, Ship, Crosshair, Shield,
  Activity, Cloud, Flame, Radiation, Camera, Thermometer, Wifi,
};

const layerColors: Record<string, string> = {
  events: '#06b6d4',
  conflicts: '#ef4444',
  military: '#f59e0b',
  flights: '#94a3b8',
  vessels: '#3b82f6',
  earthquakes: '#f97316',
  weather: '#38bdf8',
  fires: '#ef4444',
  nuclear: '#a855f7',
  cyber: '#a855f7',
  webcams: '#06b6d4',
  heatmap: '#f59e0b',
};

const HOTSPOTS = [
  { name: 'MIDDLE EAST', lat: 30, lng: 42, zoom: 1.5, emoji: '\uD83C\uDDF8\uD83C\uDDE6' },
  { name: 'UKRAINE', lat: 48.5, lng: 35, zoom: 1.2, emoji: '\uD83C\uDDFA\uD83C\uDDE6' },
  { name: 'TAIWAN STRAIT', lat: 24, lng: 120, zoom: 1.3, emoji: '\uD83C\uDDF9\uD83C\uDDFC' },
  { name: 'KOREAN PEN.', lat: 38, lng: 127, zoom: 1.3, emoji: '\uD83C\uDDF0\uD83C\uDDF7' },
  { name: 'HORN OF AFRICA', lat: 8, lng: 48, zoom: 1.5, emoji: '\uD83C\uDDEA\uD83C\uDDF9' },
  { name: 'S. CHINA SEA', lat: 12, lng: 115, zoom: 1.4, emoji: '\uD83C\uDDE8\uD83C\uDDF3' },
  { name: 'BALTICS', lat: 57, lng: 24, zoom: 1.3, emoji: '\uD83C\uDDEA\uD83C\uDDEA' },
  { name: 'GLOBAL', lat: 25, lng: 30, zoom: 2.2, emoji: '\uD83C\uDF0D' },
];

interface Props {
  flyTo: (lat: number, lng: number, alt?: number) => void;
}

export function GlobeControls({ flyTo }: Props) {
  const { layers, toggleLayer, toggleGroup, enableAll, disableAll } = useMapStore();
  const flights = useTrackingStore((s) => s.flights);
  const vessels = useTrackingStore((s) => s.vessels);
  const events = useEventStore((s) => s.events);
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'layers' | 'hotspots'>('layers');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    intel: true, tracking: true, hazards: false, infra: false,
  });

  const activeCount = useMemo(() => layers.filter(l => l.visible).length, [layers]);

  const getCounts = (id: string): number | null => {
    if (id === 'flights') return flights.length;
    if (id === 'vessels') return vessels.length;
    if (id === 'events') return events.length;
    return null;
  };

  const toggleGroupExpand = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  if (!open) {
    return (
      <div className="absolute top-12 right-4 z-20">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-2 bg-black/80 backdrop-blur-xl border border-white/[0.08] rounded-lg hover:border-cyan-500/30 transition-all"
        >
          <Layers size={14} className="text-cyan-400" />
          <span className="w-4 h-4 rounded-full bg-cyan-500/15 text-cyan-400 text-[8px] font-mono font-bold flex items-center justify-center">
            {activeCount}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-12 right-4 z-20 w-56">
      <div className="bg-black/90 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Layers size={12} className="text-cyan-400" />
            <span className="text-[9px] font-mono font-bold text-white tracking-[2px]">CONTROLS</span>
          </div>
          <div className="flex items-center gap-1">
            {tab === 'layers' && (
              <>
                <button onClick={enableAll} className="p-0.5 hover:bg-white/[0.05] rounded transition-colors" title="Show all">
                  <Eye size={10} className="text-slate-500 hover:text-cyan-400" />
                </button>
                <button onClick={disableAll} className="p-0.5 hover:bg-white/[0.05] rounded transition-colors" title="Hide all">
                  <EyeOff size={10} className="text-slate-500" />
                </button>
              </>
            )}
            <button onClick={() => setOpen(false)} className="p-0.5 hover:bg-white/[0.05] rounded transition-colors ml-1">
              <ChevronDown size={10} className="text-slate-500 rotate-90" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.04]">
          <button
            onClick={() => setTab('layers')}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[8px] font-mono tracking-[1.5px] transition-all',
              tab === 'layers'
                ? 'text-cyan-400 bg-cyan-500/[0.06] border-b border-cyan-400'
                : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <Layers size={9} />
            LAYERS
          </button>
          <button
            onClick={() => setTab('hotspots')}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[8px] font-mono tracking-[1.5px] transition-all',
              tab === 'hotspots'
                ? 'text-cyan-400 bg-cyan-500/[0.06] border-b border-cyan-400'
                : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <Navigation size={9} />
            HOTSPOTS
          </button>
        </div>

        {/* Layers tab */}
        {tab === 'layers' && (
          <div className="max-h-[50vh] overflow-y-auto">
            {LAYER_GROUPS.map(group => {
              const groupLayers = layers.filter(l => l.group === group.key);
              const visibleInGroup = groupLayers.filter(l => l.visible).length;
              const isExpanded = expandedGroups[group.key] ?? true;

              return (
                <div key={group.key} className="border-b border-white/[0.03] last:border-0">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroupExpand(group.key)}
                    className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-0.5 h-3 rounded-full" style={{ background: group.color, opacity: visibleInGroup > 0 ? 1 : 0.2 }} />
                      <span className="text-[7px] font-mono tracking-[1.5px] text-slate-400">{group.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleGroup(group.key); }}
                        className="text-[7px] font-mono text-slate-500 hover:text-slate-300 px-1 py-0.5 rounded transition-all"
                      >
                        {visibleInGroup}/{groupLayers.length}
                      </button>
                      <ChevronDown size={9} className={clsx('text-slate-600 transition-transform', !isExpanded && '-rotate-90')} />
                    </div>
                  </button>

                  {/* Layer items */}
                  {isExpanded && (
                    <div className="pb-1">
                      {groupLayers.map((layer) => {
                        const Icon = iconMap[layer.icon] || AlertCircle;
                        const accent = layerColors[layer.id] || '#64748b';
                        const count = getCounts(layer.id);

                        return (
                          <button
                            key={layer.id}
                            onClick={() => toggleLayer(layer.id)}
                            className={clsx(
                              'w-full flex items-center gap-2 px-3 py-1 transition-all',
                              layer.visible
                                ? 'hover:bg-white/[0.03]'
                                : 'opacity-35 hover:opacity-60 hover:bg-white/[0.02]'
                            )}
                            title={layer.description}
                          >
                            {/* Mini toggle */}
                            <div
                              className={clsx(
                                'w-5 h-2.5 rounded-full relative transition-all shrink-0',
                                layer.visible ? 'bg-white/[0.12]' : 'bg-white/[0.04]'
                              )}
                            >
                              <div
                                className={clsx(
                                  'absolute top-[2px] w-[6px] h-[6px] rounded-full transition-all',
                                  layer.visible ? 'left-[12px]' : 'left-[2px]'
                                )}
                                style={{
                                  background: layer.visible ? accent : '#334155',
                                  boxShadow: layer.visible ? `0 0 4px ${accent}50` : 'none',
                                }}
                              />
                            </div>

                            <Icon size={11} style={{ color: layer.visible ? accent : '#475569' }} className="shrink-0" />
                            <span className={clsx(
                              'text-[9px] font-mono tracking-wide flex-1 text-left',
                              layer.visible ? 'text-white' : 'text-slate-500'
                            )}>
                              {layer.name}
                            </span>

                            {count !== null && count > 0 && layer.visible && (
                              <span className="text-[7px] font-mono tabular-nums" style={{ color: `${accent}80` }}>
                                {count > 999 ? `${(count / 1000).toFixed(1)}k` : count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Hotspots tab */}
        {tab === 'hotspots' && (
          <div className="p-1.5 grid grid-cols-2 gap-0.5 max-h-[50vh] overflow-y-auto">
            {HOTSPOTS.map((h) => (
              <button
                key={h.name}
                onClick={() => flyTo(h.lat, h.lng, h.zoom)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[9px] font-mono text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/[0.06] transition-all"
              >
                <span className="text-[10px]">{h.emoji}</span>
                <span className="tracking-wide">{h.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
