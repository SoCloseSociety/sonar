import { useEffect, useState, memo } from 'react';
import api from '@/services/api';
import { useMapStore } from '@/stores/mapStore';
import { Shield, Anchor, Plane, Eye, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';

interface ZoneData {
  name: string;
  lat: number;
  lon: number;
  bbox: { lat_min: number; lat_max: number; lon_min: number; lon_max: number };
  flights: number;
  military_flights: number;
  vessels: number;
  military_vessels: number;
  dark_vessels: number;
  total_activity: number;
  military_activity: number;
  risk_score: number;
}

function riskColor(score: number): string {
  if (score >= 7) return '#ef4444';
  if (score >= 4) return '#f97316';
  if (score >= 2) return '#f59e0b';
  if (score >= 0.5) return '#3b82f6';
  return '#1e293b';
}

function riskLabel(score: number): string {
  if (score >= 7) return 'CRITICAL';
  if (score >= 4) return 'HIGH';
  if (score >= 2) return 'ELEVATED';
  if (score >= 0.5) return 'ACTIVE';
  return 'QUIET';
}

export const ZonePanel = memo(function ZonePanel() {
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const { flyTo } = useMapStore();

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const { data } = await api.get('/map/sensitive-zones');
        setZones(data || []);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 120_000); // refresh every 2 min
    return () => clearInterval(iv);
  }, []);

  // Only show zones with some activity
  const activeZones = zones.filter(z => z.total_activity > 0 || z.military_activity > 0);
  const topZones = activeZones.slice(0, collapsed ? 0 : 8);

  return (
    <div className="absolute top-3 right-3 w-52 z-10 select-none">
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#0d1117]/95 border border-sonar-border/40 rounded-t-lg text-[9px] font-mono tracking-[2px] text-cyan-400 hover:bg-[#0d1117] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shield size={9} />
          <span>SENSITIVE ZONES</span>
          {activeZones.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 text-[8px]">
              {activeZones.length}
            </span>
          )}
        </div>
        {collapsed ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
      </button>

      {!collapsed && (
        <div className="bg-[#0d1117]/95 border-x border-b border-sonar-border/40 rounded-b-lg overflow-hidden">
          {loading && (
            <div className="px-3 py-4 text-center text-[9px] font-mono text-slate-600">
              LOADING...
            </div>
          )}

          {!loading && topZones.length === 0 && (
            <div className="px-3 py-4 text-center text-[9px] font-mono text-slate-600">
              NO ACTIVE ZONES
            </div>
          )}

          {topZones.map((zone, i) => {
            const color = riskColor(zone.risk_score);
            const label = riskLabel(zone.risk_score);
            return (
              <button
                key={zone.name}
                onClick={() => flyTo(zone.lon, zone.lat, 5)}
                className={clsx(
                  'w-full px-3 py-2 text-left hover:bg-white/[0.03] transition-colors',
                  i < topZones.length - 1 && 'border-b border-white/[0.04]',
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-[8px] font-mono font-bold tracking-wider truncate max-w-[110px]"
                    style={{ color }}
                  >
                    {String(zone.name).toUpperCase()}
                  </span>
                  <span
                    className="text-[7px] font-mono font-bold px-1 py-0.5 rounded"
                    style={{ color, background: `${color}18`, border: `1px solid ${color}30` }}
                  >
                    {label}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Flights */}
                  <div className="flex items-center gap-1">
                    <Plane size={7} className="text-slate-500" />
                    <span className="text-[9px] font-mono tabular-nums text-slate-300">
                      {zone.flights}
                    </span>
                    {zone.military_flights > 0 && (
                      <span className="text-[7px] font-mono text-red-400">
                        ({zone.military_flights}✦)
                      </span>
                    )}
                  </div>

                  {/* Vessels */}
                  <div className="flex items-center gap-1">
                    <Anchor size={7} className="text-slate-500" />
                    <span className="text-[9px] font-mono tabular-nums text-slate-300">
                      {zone.vessels}
                    </span>
                    {zone.military_vessels > 0 && (
                      <span className="text-[7px] font-mono text-red-400">
                        ({zone.military_vessels}✦)
                      </span>
                    )}
                  </div>

                  {/* Dark vessels */}
                  {zone.dark_vessels > 0 && (
                    <div className="flex items-center gap-1">
                      <Eye size={7} className="text-orange-400" />
                      <span className="text-[7px] font-mono tabular-nums text-orange-400">
                        {zone.dark_vessels}
                      </span>
                    </div>
                  )}

                  {/* High military activity badge */}
                  {zone.military_activity >= 5 && (
                    <AlertTriangle size={8} className="text-red-400 ml-auto shrink-0" />
                  )}
                </div>

                {/* Risk bar */}
                <div className="mt-1.5 h-0.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, zone.risk_score * 10)}%`, backgroundColor: color }}
                  />
                </div>
              </button>
            );
          })}

          {activeZones.length > 8 && !collapsed && (
            <div className="px-3 py-1.5 text-center text-[8px] font-mono text-slate-600 border-t border-white/[0.04]">
              +{activeZones.length - 8} more zones
            </div>
          )}
        </div>
      )}
    </div>
  );
});
