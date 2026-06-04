import { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle, Shield, Radio, MapPin, Clock, Crosshair,
  Activity, TrendingUp, TrendingDown, Zap, Anchor,
  Skull, Globe, Wifi, Target, ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Area, AreaChart } from 'recharts';
import api from '@/services/api';
import type { Signal } from '@/types/signal';

// ── Types ──
interface TensionData {
  score: number;
  level: string;
  trend: string;
  breakdown?: Record<string, number>;
  calculated_at?: string;
}

interface TensionPoint {
  score: number;
  level: string;
  calculated_at: string;
}

interface IntelEvent {
  id: number;
  source: string;
  category: string;
  severity: number;
  confidence: number;
  impact_score: number;
  country: string;
  summary: string;
  keywords: string[];
  entities: Record<string, unknown[]>;  // backend may emit objects; coerced in render
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

// Coerce LLM-emitted entity items (which may be objects like {name, credibility}) into strings.
function entityList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      out.push(item);
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const v = o.name ?? o.value ?? o.label ?? o.text;
      if (typeof v === 'string' && v.trim()) out.push(v);
    }
  }
  return out;
}

interface SensitiveZone {
  name: string;
  lat: number;
  lon: number;
  flights: number;
  military_flights: number;
  vessels: number;
  military_vessels: number;
  dark_vessels: number;
  total_activity: number;
  risk_score: number;
}

interface Anomaly {
  type: string;
  severity: number;
  description: string;
  asset_id: string;
  asset_name: string | null;
  latitude: number;
  longitude: number;
  zone: string | null;
  detected_at: string;
}

// ── Constants ──
const LEVEL_COLORS: Record<string, string> = {
  CALM: '#00E676', GUARDED: '#00CFEB', ELEVATED: '#FFA800', HIGH: '#FF6D2A', CRITICAL: '#FF3A3A',
};

const CATEGORY_COLORS: Record<string, string> = {
  MILITARY_CONFLICT: '#FF3A3A', NUCLEAR: '#a855f7', CYBER_ATTACK: '#8b5cf6',
  MARITIME_SECURITY: '#00CFEB', TERRORISM: '#FF3A3A', NATURAL_DISASTER: '#FFA800',
  DIPLOMATIC: '#00CFEB', SANCTIONS: '#FF6D2A', EARTHQUAKE: '#FF6D2A',
};

const ANOMALY_COLORS: Record<string, string> = {
  DARK_VESSEL: '#a855f7', UNIDENTIFIED_MILITARY_VESSEL: '#FF6D2A', NO_SQUAWK_MILITARY: '#FFA800',
};

// ── Sub-components ──

function SectionHeader({ icon: Icon, label, count, accent = '#FF6D2A' }: {
  icon: React.ElementType; label: string; count?: number; accent?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="w-[3px] h-4" style={{ background: accent }} />
      <Icon size={12} style={{ color: accent }} />
      <span className="text-[9px] font-black tracking-[2px]" style={{ color: accent }}>{label}</span>
      {count != null && (
        <span className="text-[8px] text-[#2A3545] tabular-nums ml-1">({count})</span>
      )}
    </div>
  );
}

function EventRow({ event }: { event: IntelEvent }) {
  const sc = event.severity >= 9 ? '#FF3A3A' : event.severity >= 7 ? '#FF6D2A' : '#FFA800';
  const catColor = CATEGORY_COLORS[event.category || ''] || '#4E6070';
  const ago = (() => {
    try { return formatDistanceToNow(new Date(event.created_at), { addSuffix: true }); }
    catch { return ''; }
  })();

  return (
    <div className="flex items-start gap-2 px-3 py-2 border-b border-[#0A1018] hover:bg-[#0A1020] transition-colors"
      style={{ borderLeft: `2px solid ${sc}` }}>
      <span className="text-[7px] font-black px-1.5 py-0.5 shrink-0 mt-0.5 tabular-nums"
        style={{ color: sc, background: `${sc}12` }}>
        SEV{event.severity}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {event.category && (
            <span className="text-[7px] font-bold tracking-wider" style={{ color: catColor }}>
              {event.category.replace(/_/g, ' ')}
            </span>
          )}
          {event.country && (
            <span className="text-[7px] text-[#2A3545] flex items-center gap-0.5">
              <MapPin size={6} />{event.country}
            </span>
          )}
        </div>
        <p className="text-[10px] text-[#D0D9E8] leading-relaxed line-clamp-2">
          {event.summary || 'No summary available'}
        </p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[7px] text-[#4E6070] flex items-center gap-0.5">
            <Radio size={6} />{event.source}
          </span>
          <span className="text-[7px] text-[#2A3545] ml-auto flex items-center gap-0.5">
            <Clock size={6} />{ago}
          </span>
        </div>
        {/* Entities (defensive: LLM may emit objects like {name, credibility}) */}
        {event.entities && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {entityList(event.entities.people).slice(0, 2).map(p => (
              <span key={p} className="text-[6px] font-mono text-[#00CFEB] bg-[#00CFEB]/08 border border-[#00CFEB]/20 px-1 py-px">{p}</span>
            ))}
            {entityList(event.entities.organizations).slice(0, 2).map(o => (
              <span key={o} className="text-[6px] font-mono text-[#FF6D2A] bg-[#FF6D2A]/08 border border-[#FF6D2A]/20 px-1 py-px">{o}</span>
            ))}
            {entityList(event.entities.countries).slice(0, 2).map(c => (
              <span key={c} className="text-[6px] font-mono text-[#4E6070] bg-[#4E6070]/08 border border-[#4E6070]/20 px-1 py-px">{c}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──

export function IntelPage() {
  const [tension, setTension] = useState<TensionData | null>(null);
  const [tensionHistory, setTensionHistory] = useState<TensionPoint[]>([]);
  const [topEvents, setTopEvents] = useState<IntelEvent[]>([]);
  const [zones, setZones] = useState<SensitiveZone[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (mounted) setLoading(true);
      try {
        const [t, th, ev, z, a, s] = await Promise.allSettled([
          api.get('/dashboard/tension'),
          api.get('/dashboard/tension/history', { params: { hours: 48 } }),
          api.get('/events', { params: { min_severity: 7, hours: 24, limit: 30 } }),
          api.get('/map/sensitive-zones'),
          api.get('/tracking/anomalies'),
          api.get('/signals', { params: { limit: 5 } }),
        ]);
        if (!mounted) return;
        if (t.status === 'fulfilled') setTension(t.value.data);
        if (th.status === 'fulfilled' && Array.isArray(th.value.data)) setTensionHistory(th.value.data);
        if (ev.status === 'fulfilled' && Array.isArray(ev.value.data)) setTopEvents(ev.value.data);
        if (z.status === 'fulfilled' && Array.isArray(z.value.data)) setZones(z.value.data);
        if (a.status === 'fulfilled' && Array.isArray(a.value.data)) setAnomalies(a.value.data);
        if (s.status === 'fulfilled' && Array.isArray(s.value.data)) setSignals(s.value.data);
      } catch { /* ignore */ }
      if (mounted) setLoading(false);
    };
    load();
    const iv = setInterval(load, 60000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);

  const color = LEVEL_COLORS[tension?.level || 'CALM'] || '#00E676';
  const bars = tension ? Math.min(20, Math.round(tension.score * 2)) : 0;

  // Chart data — last 48 points; skip malformed timestamps to avoid Invalid Date breaking the chart
  const chartData = useMemo(() => {
    return tensionHistory.slice(-48).flatMap(p => {
      const ts = p.calculated_at ? new Date(p.calculated_at) : null;
      if (!ts || Number.isNaN(ts.getTime())) return [];
      return [{
        time: ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        score: p.score,
      }];
    });
  }, [tensionHistory]);

  if (loading && !tension) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-[#FF6D2A]/20 border-t-[#FF6D2A] rounded-full animate-spin" />
          <span className="text-[9px] font-mono text-[#2A3545] tracking-[3px]">LOADING INTEL BRIEFING...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#030711] p-3 space-y-3" style={{ fontFamily: 'ui-monospace, monospace' }}>

      {/* ── HEADER ── */}
      <div className="flex items-center gap-3 px-1">
        <div className="w-[3px] h-5 bg-[#FF6D2A]" />
        <span className="text-[11px] font-black text-[#D0D9E8] tracking-[3px]">INTELLIGENCE BRIEFING</span>
        <div className="live-dot" />
        <span className="text-[7px] text-[#00E676] tracking-[2px]">LIVE</span>
        <div className="flex-1" />
        <span className="text-[7px] text-[#2A3545] tabular-nums">
          {new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC
        </span>
      </div>

      {/* ═══ SECTION 1: THREAT OVERVIEW ═══ */}
      <div className="border border-[#152030] p-3" style={{ borderLeft: `3px solid ${color}` }}>
        <div className="flex items-start gap-6">
          {/* Score */}
          <div className="shrink-0 text-center" style={{ minWidth: 90 }}>
            <div className="text-[52px] font-black tabular-nums leading-none" style={{ color }}>
              {tension ? tension.score.toFixed(1) : '--'}
            </div>
            <div className="text-[9px] font-black tracking-[4px] mt-1" style={{ color }}>
              {tension?.level || 'LOADING'}
            </div>
            <div className="flex items-center justify-center gap-1 mt-1">
              {tension?.trend === 'rising' ? <TrendingUp size={9} style={{ color: '#FF3A3A' }} /> :
                tension?.trend === 'falling' ? <TrendingDown size={9} style={{ color: '#00E676' }} /> :
                  <Activity size={9} className="text-[#4E6070]" />}
              <span className="text-[7px] tracking-widest" style={{
                color: tension?.trend === 'rising' ? '#FF3A3A' : tension?.trend === 'falling' ? '#00E676' : '#4E6070'
              }}>
                {String(tension?.trend || 'stable').toUpperCase()}
              </span>
            </div>
          </div>

          {/* Bar meter */}
          <div className="flex-1 space-y-2">
            <div className="flex gap-[3px]">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="flex-1 h-6 transition-colors duration-500"
                  style={{ backgroundColor: i < bars ? color : '#0D1826' }} />
              ))}
            </div>
            {tension?.breakdown && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(tension.breakdown).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[7px] text-[#2A3545] tracking-wider w-28 shrink-0 truncate">
                      {key.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    <div className="flex-1 h-[3px] bg-[#0D1826]">
                      <div className="h-full transition-all" style={{ width: `${Math.min(100, ((val as number) / 3) * 100)}%`, backgroundColor: color }} />
                    </div>
                    <span className="text-[8px] tabular-nums w-6 text-right shrink-0" style={{ color }}>
                      {(val as number).toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tension sparkline chart */}
          <div className="w-56 shrink-0 hidden lg:block">
            <div className="text-[7px] text-[#2A3545] tracking-[2px] mb-1">48H TREND</div>
            {chartData.length > 2 ? (
              <ResponsiveContainer width="100%" height={70}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="tensionGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="score" stroke={color} fill="url(#tensionGrad)" strokeWidth={1.5} dot={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 10]} hide />
                  <Tooltip
                    contentStyle={{ background: '#0D1826', border: '1px solid #152030', fontSize: 9, fontFamily: 'monospace' }}
                    labelStyle={{ color: '#4E6070' }}
                    itemStyle={{ color }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[70px] flex items-center justify-center text-[8px] text-[#2A3545]">NO HISTORY</div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ MAIN 2-COLUMN LAYOUT ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* ── LEFT: PRIORITY INTELLIGENCE ── */}
        <div className="lg:col-span-2 bg-[#060B16] border border-[#152030]" style={{ borderLeft: '2px solid #FF3A3A', maxHeight: 480 }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0D1826]">
            <Zap size={10} className="text-[#FF3A3A]" />
            <span className="text-[8px] font-black tracking-[2px] text-[#FF3A3A]">PRIORITY INTELLIGENCE</span>
            <span className="ml-auto text-[7px] text-[#2A3545] tabular-nums">{topEvents.length} EVENTS | SEV ≥ 7 | 24H</span>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 440 }}>
            {topEvents.length > 0 ? topEvents.map(event => (
              <EventRow key={event.id} event={event} />
            )) : (
              <div className="flex flex-col items-center py-10 gap-2">
                <Shield size={22} className="text-[#00E676]/30" />
                <p className="text-[9px] text-[#2A3545]">NO HIGH-SEVERITY EVENTS IN LAST 24H</p>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: ZONE ANALYSIS ── */}
        <div className="bg-[#060B16] border border-[#152030]" style={{ borderLeft: '2px solid #00CFEB' }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0D1826]">
            <Globe size={10} className="text-[#00CFEB]" />
            <span className="text-[8px] font-black tracking-[2px] text-[#00CFEB]">ZONE ANALYSIS</span>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 440 }}>
            {/* Header */}
            <div className="flex items-center px-3 py-1.5 border-b border-[#0D1826] text-[6px] text-[#2A3545] tracking-wider">
              <span className="flex-1">ZONE</span>
              <span className="w-10 text-right">FLT</span>
              <span className="w-10 text-right">MIL</span>
              <span className="w-10 text-right">VSL</span>
              <span className="w-12 text-right">RISK</span>
            </div>
            {zones.map(z => {
              const rc = z.risk_score >= 8 ? '#FF3A3A' : z.risk_score >= 5 ? '#FFA800' : z.risk_score >= 2 ? '#00CFEB' : '#00E676';
              return (
                <div key={z.name} className="flex items-center px-3 py-2 border-b border-[#0A1018] hover:bg-[#0A1020] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] text-[#D0D9E8] font-bold truncate">{z.name}</div>
                    {z.dark_vessels > 0 && (
                      <span className="text-[6px] text-[#a855f7]">{z.dark_vessels} DARK</span>
                    )}
                  </div>
                  <span className="w-10 text-right text-[9px] tabular-nums text-[#4E6070]">{z.flights}</span>
                  <span className="w-10 text-right text-[9px] tabular-nums text-[#FFA800]">{z.military_flights}</span>
                  <span className="w-10 text-right text-[9px] tabular-nums text-[#4E6070]">{z.vessels}</span>
                  <span className="w-12 text-right text-[11px] tabular-nums font-black" style={{ color: rc }}>
                    {z.risk_score.toFixed(1)}
                  </span>
                </div>
              );
            })}
            {zones.length === 0 && (
              <div className="px-3 py-6 text-center text-[8px] text-[#2A3545]">NO ZONE DATA</div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ SECTION 4: MARITIME ANOMALIES ═══ */}
      <div className="bg-[#060B16] border border-[#152030]" style={{ borderLeft: '2px solid #a855f7' }}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0D1826]">
          <Anchor size={10} className="text-[#a855f7]" />
          <span className="text-[8px] font-black tracking-[2px] text-[#a855f7]">TRACKING ANOMALIES</span>
          <span className="ml-auto text-[7px] text-[#2A3545] tabular-nums">{anomalies.length} DETECTED</span>
        </div>
        {anomalies.length === 0 ? (
          <div className="flex items-center justify-center py-6 gap-2">
            <Shield size={14} className="text-[#00E676]/30" />
            <span className="text-[9px] text-[#00E676]/60 tracking-wider">NO ANOMALIES DETECTED</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-[#0D1826]">
            {anomalies.slice(0, 12).map((a, i) => {
              const ac = ANOMALY_COLORS[a.type] || '#FF6D2A';
              return (
                <div key={`${a.asset_id}-${a.detected_at}-${i}`} className="bg-[#060B16] px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[6px] font-black px-1.5 py-0.5 tracking-wider"
                      style={{ color: ac, background: `${ac}12`, border: `1px solid ${ac}25` }}>
                      {a.type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[7px] font-black tabular-nums" style={{ color: ac }}>SEV{a.severity}</span>
                  </div>
                  <p className="text-[9px] text-[#D0D9E8] leading-relaxed line-clamp-2">{a.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[7px] text-[#4E6070]">{a.asset_id}</span>
                    {a.zone && <span className="text-[7px] text-[#2A3545]">{a.zone}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ SECTION 5: ACTIVE SIGNALS ═══ */}
      <div className="bg-[#060B16] border border-[#152030]" style={{ borderLeft: '2px solid #00E676' }}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0D1826]">
          <Target size={10} className="text-[#00E676]" />
          <span className="text-[8px] font-black tracking-[2px] text-[#00E676]">ACTIVE SIGNALS</span>
          <a href="/signals" className="ml-auto text-[7px] text-[#FF6D2A] hover:text-[#FF6D2A]/80 flex items-center gap-0.5">
            VIEW ALL <ChevronRight size={8} />
          </a>
        </div>
        <div>
          {signals.length > 0 ? signals.slice(0, 5).map(sig => {
            const dc = sig.direction === 'BUY_YES' ? '#00E676' : sig.direction === 'BUY_NO' ? '#FF3A3A' : '#00CFEB';
            return (
              <div key={sig.id} className="flex items-start gap-2 px-3 py-2 border-b border-[#0A1018]">
                <span className="text-[7px] font-black px-1.5 py-0.5 shrink-0 mt-px tracking-wider"
                  style={{ color: dc, background: `${dc}12`, border: `1px solid ${dc}25` }}>
                  {(sig.direction || sig.signal_type || '').replace(/_/g, ' ')}
                </span>
                <p className="text-[8px] text-[#D0D9E8] leading-tight line-clamp-2 flex-1">
                  {sig.reasoning?.slice(0, 120) || `${sig.signal_type} signal`}
                </p>
                {(sig.confidence ?? 0) > 0 && (
                  <span className="text-[7px] text-[#2A3545] tabular-nums shrink-0">
                    {((sig.confidence ?? 0) * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            );
          }) : (
            <div className="px-3 py-4 text-center text-[8px] text-[#2A3545]">NO ACTIVE SIGNALS</div>
          )}
        </div>
      </div>
    </div>
  );
}
