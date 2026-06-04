import { useMapStore, LAYER_GROUPS } from '@/stores/mapStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { useEventStore } from '@/stores/eventStore';
import { clsx } from 'clsx';
import {
  AlertCircle, Plane, Ship, Crosshair, Shield,
  Activity, Cloud, Flame, Radiation, Camera, Thermometer,
  Wifi, Layers, Eye, EyeOff, ChevronDown, Navigation,
} from 'lucide-react';
import { useState, useMemo } from 'react';

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

const regions = [
  { name: 'MIDDLE EAST', center: [42, 30] as [number, number], zoom: 5, emoji: '\uD83C\uDDF8\uD83C\uDDE6' },
  { name: 'EUROPE', center: [15, 50] as [number, number], zoom: 4, emoji: '\uD83C\uDDEA\uD83C\uDDFA' },
  { name: 'ASIA PACIFIC', center: [105, 35] as [number, number], zoom: 3.5, emoji: '\uD83C\uDDE8\uD83C\uDDF3' },
  { name: 'AMERICAS', center: [-80, 20] as [number, number], zoom: 3, emoji: '\uD83C\uDDFA\uD83C\uDDF8' },
  { name: 'AFRICA', center: [20, 5] as [number, number], zoom: 3.5, emoji: '\uD83C\uDDF3\uD83C\uDDEC' },
  { name: 'GLOBAL', center: [30, 25] as [number, number], zoom: 2.5, emoji: '\uD83C\uDF0D' },
];

export function MapControls() {
  const { layers, toggleLayer, toggleGroup, enableAll, disableAll, setViewport } = useMapStore();
  const flights = useTrackingStore((s) => s.flights);
  const vessels = useTrackingStore((s) => s.vessels);
  const events = useEventStore((s) => s.events);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    intel: true, tracking: true, hazards: false, infra: false,
  });
  const [showRegions, setShowRegions] = useState(false);

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

  if (collapsed) {
    return (
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-1.5 px-2.5 py-2 bg-black/80 backdrop-blur-xl border border-white/[0.08] rounded-lg hover:border-cyan-500/30 transition-all group"
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
    <div className="absolute top-4 right-4 z-10 w-64 flex flex-col gap-2">
      {/* Main layers panel */}
      <div className="bg-black/90 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Layers size={13} className="text-cyan-400" />
            <span className="text-[10px] font-mono font-bold text-white tracking-[2px]">LAYERS</span>
            <span className="text-[8px] font-mono text-slate-500 ml-1">
              {activeCount}/{layers.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={enableAll}
              className="p-1 hover:bg-white/[0.05] rounded transition-colors"
              title="Show all"
            >
              <Eye size={11} className="text-slate-500 hover:text-cyan-400" />
            </button>
            <button
              onClick={disableAll}
              className="p-1 hover:bg-white/[0.05] rounded transition-colors"
              title="Hide all"
            >
              <EyeOff size={11} className="text-slate-500 hover:text-slate-300" />
            </button>
            <button
              onClick={() => setCollapsed(true)}
              className="p-1 hover:bg-white/[0.05] rounded transition-colors ml-1"
            >
              <ChevronDown size={11} className="text-slate-500 rotate-90" />
            </button>
          </div>
        </div>

        {/* Grouped layers */}
        <div className="max-h-[55vh] overflow-y-auto">
          {LAYER_GROUPS.map(group => {
            const groupLayers = layers.filter(l => l.group === group.key);
            const visibleInGroup = groupLayers.filter(l => l.visible).length;
            const isExpanded = expandedGroups[group.key] ?? true;

            return (
              <div key={group.key} className="border-b border-white/[0.03] last:border-0">
                {/* Group header */}
                <button
                  onClick={() => toggleGroupExpand(group.key)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.02] transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-3.5 rounded-full" style={{ background: group.color, opacity: visibleInGroup > 0 ? 1 : 0.2 }} />
                    <span className="text-[8px] font-mono tracking-[1.5px] text-slate-400 group-hover:text-slate-300 transition-colors">
                      {group.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Group toggle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleGroup(group.key); }}
                      className={clsx(
                        'text-[7px] font-mono px-1.5 py-0.5 rounded transition-all',
                        visibleInGroup === groupLayers.length
                          ? 'text-white/60 bg-white/[0.06]'
                          : visibleInGroup > 0
                          ? 'text-white/40 bg-white/[0.03]'
                          : 'text-slate-600 hover:text-slate-400'
                      )}
                    >
                      {visibleInGroup}/{groupLayers.length}
                    </button>
                    <ChevronDown
                      size={10}
                      className={clsx('text-slate-600 transition-transform', !isExpanded && '-rotate-90')}
                    />
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
                            'w-full flex items-center gap-2.5 px-3 py-1.5 transition-all group/item',
                            layer.visible
                              ? 'hover:bg-white/[0.03]'
                              : 'hover:bg-white/[0.02] opacity-40 hover:opacity-70'
                          )}
                          title={layer.description}
                        >
                          {/* Toggle switch */}
                          <div
                            className={clsx(
                              'w-6 h-3 rounded-full relative transition-all shrink-0',
                              layer.visible ? 'bg-white/[0.15]' : 'bg-white/[0.04]'
                            )}
                          >
                            <div
                              className={clsx(
                                'absolute top-0.5 w-2 h-2 rounded-full transition-all',
                                layer.visible ? 'left-3.5' : 'left-0.5'
                              )}
                              style={{
                                background: layer.visible ? accent : '#334155',
                                boxShadow: layer.visible ? `0 0 6px ${accent}60` : 'none',
                              }}
                            />
                          </div>

                          <Icon
                            size={12}
                            style={{ color: layer.visible ? accent : '#475569' }}
                            className="shrink-0 transition-colors"
                          />

                          <span className={clsx(
                            'text-[10px] font-mono tracking-wide flex-1 text-left transition-colors',
                            layer.visible ? 'text-white' : 'text-slate-500'
                          )}>
                            {layer.name}
                          </span>

                          {/* Live count badge */}
                          {count !== null && count > 0 && layer.visible && (
                            <span
                              className="text-[8px] font-mono tabular-nums px-1.5 py-0.5 rounded-full"
                              style={{
                                color: accent,
                                background: `${accent}15`,
                              }}
                            >
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
      </div>

      {/* Region navigation */}
      <div className="bg-black/90 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl">
        <button
          onClick={() => setShowRegions(!showRegions)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Navigation size={11} className="text-cyan-400" />
            <span className="text-[9px] font-mono tracking-[1.5px] text-slate-400">NAVIGATE</span>
          </div>
          <ChevronDown
            size={10}
            className={clsx('text-slate-600 transition-transform', !showRegions && '-rotate-90')}
          />
        </button>
        {showRegions && (
          <div className="px-1 pb-1.5 grid grid-cols-2 gap-0.5">
            {regions.map((r) => (
              <button
                key={r.name}
                onClick={() => setViewport(r.center, r.zoom)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[9px] font-mono text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all"
              >
                <span className="text-[10px]">{r.emoji}</span>
                <span className="tracking-wide">{r.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
