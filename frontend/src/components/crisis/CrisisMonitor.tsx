import { useState, useEffect, useMemo } from 'react';
import { useEventStore } from '@/stores/eventStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { useMarketStore } from '@/stores/marketStore';
import { WhaleTradeCard } from '@/components/tracking/WhaleTradeCard';
import api from '@/services/api';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle, Shield, TrendingUp, TrendingDown,
  Plane, Ship, Radio, MapPin, Clock, Eye, Zap, Activity,
  BarChart3, Globe2, Target, Crosshair, Lock, Wifi,
} from 'lucide-react';

interface TensionData {
  score: number;
  level: string;
  trend: string;
  breakdown: Record<string, number>;
}

interface TensionHistory {
  score: number;
  level: string;
  calculated_at: string;
}

const LEVEL_COLORS: Record<string, string> = {
  CALM:     '#00E676',
  GUARDED:  '#00CFEB',
  ELEVATED: '#FFA800',
  HIGH:     '#FF6D2A',
  CRITICAL: '#FF3A3A',
};

const LEVEL_BG: Record<string, string> = {
  CALM:     'rgba(0,230,118,0.05)',
  GUARDED:  'rgba(0,207,235,0.05)',
  ELEVATED: 'rgba(255,168,0,0.06)',
  HIGH:     'rgba(255,109,42,0.07)',
  CRITICAL: 'rgba(255,58,58,0.08)',
};

// ── Panel wrapper ─────────────────────────────────────────────────
function Panel({ children, accent = '#FF6D2A', className = '' }: {
  children: React.ReactNode;
  accent?: string;
  className?: string;
}) {
  return (
    <div
      className={`bg-[#060B16] border border-[#152030] overflow-hidden ${className}`}
      style={{ borderLeft: `2px solid ${accent}` }}
    >
      {children}
    </div>
  );
}

function PanelHead({ icon: Icon, label, meta, accent = '#FF6D2A' }: {
  icon: React.ElementType; label: string; meta?: string; accent?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0D1826] shrink-0">
      <Icon size={10} style={{ color: accent }} />
      <span className="text-[8px] font-black tracking-[2px]" style={{ color: accent }}>{label}</span>
      {meta && <span className="ml-auto text-[7px] text-[#2A3545] tabular-nums font-mono">{meta}</span>}
    </div>
  );
}

// ── Sparkline ────────────────────────────────────────────────────
function TensionSparkline({ data, color }: { data: TensionHistory[]; color: string }) {
  if (data.length < 2) {
    return <div className="h-14 flex items-center justify-center text-[8px] text-[#2A3545]">NO HISTORY</div>;
  }
  const pts = data.slice(0, 48).reverse();
  const max = Math.max(...pts.map(d => d.score), 10);
  const H = 56; const W = pts.length * 4;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path
        d={`M0,${H} ${pts.map((d, i) => `L${i * 4},${H - (d.score / max) * H}`).join(' ')} L${(pts.length - 1) * 4},${H} Z`}
        fill={`${color}15`}
      />
      <polyline
        points={pts.map((d, i) => `${i * 4},${H - (d.score / max) * H}`).join(' ')}
        fill="none" stroke={color} strokeWidth={1.5}
      />
    </svg>
  );
}

// ── Main ─────────────────────────────────────────────────────────
export function CrisisMonitor() {
  const events        = useEventStore((s) => s.events);
  const flights       = useTrackingStore((s) => s.flights);
  const vessels       = useTrackingStore((s) => s.vessels);
  const anomalies     = useTrackingStore((s) => s.anomalies);
  const markets       = useMarketStore((s) => s.markets);

  const [tension, setTension]             = useState<TensionData | null>(null);
  const [tensionHistory, setTensionHistory] = useState<TensionHistory[]>([]);
  const [now, setNow]                     = useState(() => new Date());

  // Live clock
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [t, th] = await Promise.all([
          api.get('/dashboard/tension'),
          api.get('/dashboard/tension/history', { params: { hours: 24 } }),
        ]);
        setTension(t.data);
        if (Array.isArray(th.data)) setTensionHistory(th.data);
      } catch { /* ignore */ }
    };
    load();
    useTrackingStore.getState().fetchAnomalies();
    useTrackingStore.getState().fetchFlights();
    useTrackingStore.getState().fetchVessels();
    useMarketStore.getState().fetchMarkets();
    useEventStore.getState().fetchEvents();
    const iv   = setInterval(load, 90000);
    const evIv = setInterval(() => useEventStore.getState().fetchEvents(), 30000);
    return () => { clearInterval(iv); clearInterval(evIv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived data
  const criticalEvents = useMemo(() =>
    events.filter(e => e.severity >= 7).slice(0, 25),
    [events]
  );

  const sevCounts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const e of events) {
      if (e.severity >= 8) c.critical++;
      else if (e.severity >= 6) c.high++;
      else if (e.severity >= 4) c.medium++;
      else c.low++;
    }
    return c;
  }, [events]);

  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of criticalEvents) counts[e.category || 'UNKNOWN'] = (counts[e.category || 'UNKNOWN'] || 0) + 1;
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 8);
  }, [criticalEvents]);

  const geoHotspots = useMemo(() => {
    const cc: Record<string, { count: number; maxSev: number }> = {};
    for (const e of criticalEvents) {
      const c = e.country || 'Unknown';
      if (!cc[c]) cc[c] = { count: 0, maxSev: 0 };
      cc[c].count++;
      cc[c].maxSev = Math.max(cc[c].maxSev, e.severity);
    }
    return Object.entries(cc).sort(([, a], [, b]) => b.maxSev - a.maxSev || b.count - a.count).slice(0, 8);
  }, [criticalEvents]);

  const riskMarkets = useMemo(() =>
    markets
      .filter(m => m.price_yes != null && m.volume_24h && m.volume_24h > 500)
      .sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0))
      .slice(0, 4),
    [markets]
  );

  const milFlights  = flights.filter(f => f.is_military).length;
  const govFlights  = flights.filter(f => f.is_government).length;
  const darkVessels = vessels.filter(v => v.is_dark).length;
  const milVessels  = vessels.filter(v => v.is_military).length;

  const color   = LEVEL_COLORS[tension?.level || 'CALM'] || '#00E676';
  const levelBg = LEVEL_BG[tension?.level || 'CALM'] || 'transparent';
  const bars    = tension ? Math.round(tension.score * 2) : 0;

  const utcStr = `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}:${String(now.getUTCSeconds()).padStart(2,'0')} UTC`;

  return (
    <div className="h-full overflow-y-auto bg-[#030711]" style={{ fontFamily: 'ui-monospace, monospace' }}>

      {/* ══ CLASSIFICATION BANNER ══════════════════════════════════ */}
      <div className="flex items-center justify-center gap-6 py-1 bg-[#FF3A3A]/10 border-b border-[#FF3A3A]/25 shrink-0">
        <Lock size={8} className="text-[#FF3A3A]" />
        <span className="text-[7px] font-black text-[#FF3A3A] tracking-[4px]">TOP SECRET // NOFORN // COMPARTMENTED</span>
        <Lock size={8} className="text-[#FF3A3A]" />
      </div>

      <div className="p-3 space-y-2">

        {/* ══ HEADER ═════════════════════════════════════════════════ */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <div className="w-[3px] h-5 bg-[#FF3A3A]" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black text-[#D0D9E8] tracking-[3px]">SITUATION ROOM</span>
                <div className="live-dot" />
                <span className="text-[7px] text-[#00E676] tracking-[2px]">LIVE</span>
              </div>
              <div className="text-[7px] text-[#2A3545] tracking-wider mt-px">GLOBAL CRISIS MONITORING SYSTEM — REAL-TIME ANALYSIS</div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <div className="text-[7px] text-[#2A3545]">SYSTEM TIME</div>
              <div className="text-[11px] font-black text-[#D0D9E8] tabular-nums">{utcStr}</div>
            </div>
            <div>
              <div className="text-[7px] text-[#2A3545]">EVENTS MONITORED</div>
              <div className="text-[11px] font-black text-[#FF6D2A] tabular-nums">{events.length}</div>
            </div>
          </div>
        </div>

        {/* ══ THREAT LEVEL BANNER ════════════════════════════════════ */}
        <div
          className="border border-[#152030] p-3 relative overflow-hidden"
          style={{ background: levelBg, borderLeft: `3px solid ${color}` }}
        >
          <div className="flex items-center gap-6">
            {/* Level + Score */}
            <div className="shrink-0 text-center" style={{ minWidth: 80 }}>
              <div className="text-[48px] font-black tabular-nums leading-none" style={{ color }}>
                {tension ? tension.score.toFixed(1) : '—'}
              </div>
              <div className="text-[9px] font-black tracking-[4px] mt-1" style={{ color }}>
                {tension?.level || 'LOADING'}
              </div>
              <div className="flex items-center justify-center gap-1 mt-1">
                {tension?.trend === 'rising'  ? <TrendingUp  size={9} style={{ color: '#FF3A3A' }} /> :
                 tension?.trend === 'falling' ? <TrendingDown size={9} style={{ color: '#00E676' }} /> :
                 <Activity size={9} className="text-[#4E6070]" />}
                <span className="text-[7px] tracking-widest" style={{
                  color: tension?.trend === 'rising' ? '#FF3A3A' : tension?.trend === 'falling' ? '#00E676' : '#4E6070'
                }}>
                  {String(tension?.trend || 'STABLE').toUpperCase()}
                </span>
              </div>
            </div>

            {/* 20-bar meter */}
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
                        {String(key).replace(/_/g, ' ').toUpperCase()}
                      </span>
                      <div className="flex-1 h-[3px] bg-[#0D1826]">
                        <div className="h-full transition-all duration-500"
                          style={{ width: `${((val as number) / 3) * 100}%`, backgroundColor: color }} />
                      </div>
                      <span className="text-[8px] tabular-nums w-6 text-right shrink-0" style={{ color }}>
                        {(val as number).toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 24h sparkline */}
            <div className="w-36 shrink-0">
              <div className="text-[7px] text-[#2A3545] tracking-[2px] mb-1">24H TREND</div>
              <TensionSparkline data={tensionHistory} color={color} />
            </div>
          </div>
        </div>

        {/* ══ STAT STRIP ══════════════════════════════════════════════ */}
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-1">
          {[
            { label: 'CRITICAL',    value: sevCounts.critical,  color: '#FF3A3A' },
            { label: 'HIGH',        value: sevCounts.high,      color: '#FF6D2A' },
            { label: 'MEDIUM',      value: sevCounts.medium,    color: '#FFA800' },
            { label: 'LOW',         value: sevCounts.low,       color: '#00E676' },
            { label: 'MIL. FLIGHTS',value: milFlights,          color: '#FF6D2A' },
            { label: 'GOV. FLIGHTS',value: govFlights,          color: '#FFA800' },
            { label: 'DARK VESSELS',value: darkVessels,         color: '#a855f7' },
            { label: 'ANOMALIES',   value: anomalies.length,    color: '#FF6D2A' },
          ].map(s => (
            <div key={s.label} className="bg-[#060B16] border border-[#152030] px-2 py-1.5 text-center">
              <div className="text-[7px] text-[#2A3545] tracking-wider truncate">{s.label}</div>
              <div className="text-[18px] font-black tabular-nums leading-tight" style={{ color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* ══ MAIN 3-COLUMN GRID ══════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">

          {/* LEFT: Critical events feed */}
          <div className="lg:col-span-2 flex flex-col bg-[#060B16] border border-[#152030]" style={{ borderLeft: '2px solid #FF3A3A', maxHeight: 480 }}>
            <PanelHead icon={Zap} label="PRIORITY EVENTS FEED" meta={`${criticalEvents.length} EVENTS ≥ SEV 7`} accent="#FF3A3A" />
            <div className="flex-1 overflow-y-auto">
              {criticalEvents.map(event => {
                const sc = event.severity >= 9 ? '#FF3A3A' : event.severity >= 8 ? '#FF6D2A' : '#FFA800';
                const ago = (() => {
                  try { return formatDistanceToNow(new Date(event.created_at), { addSuffix: true }); }
                  catch { return ''; }
                })();
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-2 px-3 py-2 border-b border-[#0A1018] hover:bg-[#0A1020] transition-colors"
                    style={{ borderLeft: `2px solid ${sc}` }}
                  >
                    <span className="text-[7px] font-black px-1.5 py-0.5 shrink-0 mt-0.5 tabular-nums"
                      style={{ color: sc, background: `${sc}12` }}>
                      SEV{event.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-[#D0D9E8] leading-relaxed line-clamp-2">
                        {event.summary || event.raw_text?.slice(0, 150)}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-[7px] text-[#4E6070] flex items-center gap-0.5">
                          <Radio size={6} />{event.source}
                        </span>
                        {event.country && (
                          <span className="text-[7px] text-[#4E6070] flex items-center gap-0.5">
                            <MapPin size={6} />{event.country}
                          </span>
                        )}
                        {event.category && (
                          <span className="text-[7px] text-[#4E6070]">
                            {event.category.replace(/_/g, ' ')}
                          </span>
                        )}
                        <span className="text-[7px] text-[#2A3545] ml-auto flex items-center gap-0.5">
                          <Clock size={6} />{ago}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {criticalEvents.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Shield size={22} className="text-[#00E676]/30" />
                  <p className="text-[9px] text-[#2A3545]">NO PRIORITY EVENTS — SITUATION NOMINAL</p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Sidebar panels */}
          <div className="space-y-2">

            {/* Threat breakdown */}
            <Panel accent="#FF3A3A">
              <PanelHead icon={AlertTriangle} label="THREAT BREAKDOWN" accent="#FF3A3A" />
              <div className="px-3 py-2 space-y-1.5">
                {([
                  { label: 'CRITICAL', count: sevCounts.critical, color: '#FF3A3A' },
                  { label: 'HIGH',     count: sevCounts.high,     color: '#FF6D2A' },
                  { label: 'MEDIUM',   count: sevCounts.medium,   color: '#FFA800' },
                  { label: 'LOW',      count: sevCounts.low,      color: '#00E676' },
                ] as { label: string; count: number; color: string }[]).map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="text-[7px] font-bold w-12 shrink-0" style={{ color: s.color }}>{s.label}</span>
                    <div className="flex-1 h-[5px] bg-[#0A1020]">
                      <div className="h-full transition-all duration-700"
                        style={{ width: `${(s.count / (events.length || 1)) * 100}%`, backgroundColor: s.color }} />
                    </div>
                    <span className="text-[9px] tabular-nums w-5 text-right text-[#D0D9E8]">{s.count}</span>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Geographic hotspots */}
            <Panel accent="#00CFEB">
              <PanelHead icon={Globe2} label="ACTIVE REGIONS" meta={`${geoHotspots.length} HOT`} accent="#00CFEB" />
              <div className="max-h-36 overflow-y-auto">
                {geoHotspots.map(([country, data]) => {
                  const c = data.maxSev >= 9 ? '#FF3A3A' : data.maxSev >= 8 ? '#FF6D2A' : '#FFA800';
                  return (
                    <div key={country} className="flex items-center gap-2 px-3 py-1.5 border-b border-[#0A1018]">
                      <MapPin size={7} style={{ color: c }} className="shrink-0" />
                      <span className="text-[9px] text-[#D0D9E8] flex-1 truncate">{country}</span>
                      <span className="text-[7px] font-bold shrink-0 px-1" style={{ color: c, background: `${c}12` }}>
                        SEV{data.maxSev}
                      </span>
                      <span className="text-[7px] text-[#4E6070] tabular-nums w-4 text-right">{data.count}</span>
                    </div>
                  );
                })}
                {geoHotspots.length === 0 && (
                  <div className="px-3 py-4 text-[8px] text-[#2A3545]">NO DATA</div>
                )}
              </div>
            </Panel>

            {/* Threat categories */}
            <Panel accent="#a855f7">
              <PanelHead icon={BarChart3} label="THREAT CATEGORIES" accent="#a855f7" />
              <div className="px-3 py-2 space-y-1.5">
                {categoryBreakdown.map(([cat, count]) => (
                  <div key={cat} className="flex items-center gap-2">
                    <span className="text-[7px] text-[#4E6070] flex-1 truncate tracking-wider">
                      {cat.replace(/_/g, ' ')}
                    </span>
                    <div className="w-16 h-[4px] bg-[#0A1020]">
                      <div className="h-full bg-[#a855f7]/60"
                        style={{ width: `${(count / (criticalEvents.length || 1)) * 100}%` }} />
                    </div>
                    <span className="text-[8px] tabular-nums text-[#D0D9E8] w-4 text-right">{count}</span>
                  </div>
                ))}
                {categoryBreakdown.length === 0 && (
                  <p className="text-[8px] text-[#2A3545]">NO DATA</p>
                )}
              </div>
            </Panel>
          </div>
        </div>

        {/* ══ 2-COLUMN: TRACKING + MARKETS ══════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">

          {/* Tracking overview */}
          <Panel accent="#00CFEB">
            <PanelHead icon={Crosshair} label="TRACKING OVERVIEW" accent="#00CFEB" />
            <div className="grid grid-cols-2 divide-x divide-[#0D1826]">
              {/* Flights */}
              <div className="px-3 py-2 space-y-1.5">
                <div className="text-[7px] text-[#2A3545] tracking-[2px] mb-2">AVIATION</div>
                {([
                  { label: 'TOTAL TRACKED', value: flights.length,  color: '#00CFEB' },
                  { label: 'MILITARY',       value: milFlights,      color: '#FF6D2A' },
                  { label: 'GOVERNMENT',     value: govFlights,      color: '#FFA800' },
                ] as { label: string; value: number; color: string }[]).map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <Plane size={7} style={{ color: s.color }} className="shrink-0" />
                    <span className="text-[7px] text-[#4E6070] flex-1 tracking-wider">{s.label}</span>
                    <span className="text-[10px] font-black tabular-nums" style={{ color: s.value > 0 ? s.color : '#2A3545' }}>
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>
              {/* Vessels */}
              <div className="px-3 py-2 space-y-1.5">
                <div className="text-[7px] text-[#2A3545] tracking-[2px] mb-2">MARITIME</div>
                {([
                  { label: 'TOTAL TRACKED', value: vessels.length,  color: '#00CFEB' },
                  { label: 'DARK (AIS OFF)', value: darkVessels,    color: '#a855f7' },
                  { label: 'MILITARY',       value: milVessels,     color: '#FF3A3A' },
                ] as { label: string; value: number; color: string }[]).map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <Ship size={7} style={{ color: s.color }} className="shrink-0" />
                    <span className="text-[7px] text-[#4E6070] flex-1 tracking-wider">{s.label}</span>
                    <span className="text-[10px] font-black tabular-nums" style={{ color: s.value > 0 ? s.color : '#2A3545' }}>
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Market risk indicators */}
          <Panel accent="#FFA800">
            <PanelHead icon={Target} label="MARKET RISK INDICATORS" meta="POLYMARKET" accent="#FFA800" />
            <div className="max-h-36 overflow-y-auto">
              {riskMarkets.map(m => {
                const prob = m.price_yes != null ? Math.round(m.price_yes * 100) : 0;
                const pc   = prob >= 70 ? '#FF3A3A' : prob >= 40 ? '#FFA800' : '#00E676';
                const vol  = m.volume_24h
                  ? m.volume_24h >= 1000 ? `$${(m.volume_24h / 1000).toFixed(1)}K` : `$${m.volume_24h.toFixed(0)}`
                  : '$0';
                return (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2 border-b border-[#0A1018]">
                    <div className="flex flex-col items-center w-10 shrink-0">
                      <span className="text-[13px] font-black tabular-nums" style={{ color: pc }}>{prob}%</span>
                      <div className="w-full h-[2px] bg-[#0D1826] mt-0.5">
                        <div className="h-full" style={{ width: `${prob}%`, backgroundColor: pc }} />
                      </div>
                    </div>
                    <p className="text-[8px] text-[#D0D9E8] flex-1 leading-tight line-clamp-2">{m.question}</p>
                    <div className="shrink-0 text-right">
                      <div className="text-[6px] text-[#2A3545]">VOL</div>
                      <div className="text-[8px] text-[#4E6070]">{vol}</div>
                    </div>
                  </div>
                );
              })}
              {riskMarkets.length === 0 && (
                <div className="px-3 py-4 text-[8px] text-[#2A3545]">NO MARKET DATA</div>
              )}
            </div>
          </Panel>
        </div>

        {/* ══ ANOMALIES ═══════════════════════════════════════════════ */}
        {anomalies.length > 0 && (
          <Panel accent="#FF6D2A">
            <PanelHead icon={Eye} label="TRACKING ANOMALIES" meta={`${anomalies.length} ACTIVE`} accent="#FF6D2A" />
            <div className="p-2 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2">
              {anomalies.slice(0, 6).map((a) => (
                <WhaleTradeCard key={a.id} anomaly={a} />
              ))}
            </div>
          </Panel>
        )}

      </div>
    </div>
  );
}
