import { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle, Shield, TrendingUp, TrendingDown,
  Plane, Ship, Target, Crosshair, Activity, Clock,
  Radio, MapPin, Zap, BarChart3, Signal as SignalIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import api from '@/services/api';
import { useEventStore } from '@/stores/eventStore';
import { useMarketStore } from '@/stores/marketStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { WhaleTradeCard } from '@/components/tracking/WhaleTradeCard';
import type { Signal } from '@/types/signal';

interface DashboardStats {
  events_per_hour: number;
  events_24h: number;
  markets: number;
  active_signals: number;
  flights: number;
  vessels: number;
}

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

// ── Panel components ──

function Panel({ children, accent = '#FF6D2A' }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="bg-[#060B16] border border-[#152030] overflow-hidden" style={{ borderLeft: `2px solid ${accent}` }}>
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

// ── Sparkline ──

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

// ── Main ──

export function DashboardView() {
  const events    = useEventStore((s) => s.events);
  const flights   = useTrackingStore((s) => s.flights);
  const vessels   = useTrackingStore((s) => s.vessels);
  const anomalies = useTrackingStore((s) => s.anomalies);
  const markets   = useMarketStore((s) => s.markets);

  const [tension, setTension] = useState<TensionData | null>(null);
  const [tensionHistory, setTensionHistory] = useState<TensionHistory[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [globalStats, setGlobalStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const results = await Promise.allSettled([
          api.get('/dashboard/tension'),
          api.get('/dashboard/tension/history', { params: { hours: 48 } }),
          api.get('/signals', { params: { limit: 5 } }),
          api.get('/dashboard/stats'),
        ]);
        if (cancelled) return;
        if (results[0].status === 'fulfilled') setTension(results[0].value.data);
        if (results[1].status === 'fulfilled' && Array.isArray(results[1].value.data)) setTensionHistory(results[1].value.data);
        if (results[2].status === 'fulfilled' && Array.isArray(results[2].value.data)) setSignals(results[2].value.data);
        if (results[3].status === 'fulfilled' && results[3].value.data) setGlobalStats(results[3].value.data);
      } catch { /* ignore */ }
    };
    load();
    useTrackingStore.getState().fetchFlights();
    useTrackingStore.getState().fetchVessels();
    useTrackingStore.getState().fetchAnomalies();
    useMarketStore.getState().fetchMarkets();
    useEventStore.getState().fetchEvents();
    const iv = setInterval(load, 90000);
    return () => { cancelled = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived
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

  const priorityEvents = useMemo(() =>
    events.filter(e => e.severity >= 7).slice(0, 15),
    [events]
  );

  const topMarkets = useMemo(() =>
    markets
      .filter(m => m.price_yes != null && m.volume_24h && m.volume_24h > 500)
      .sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0))
      .slice(0, 5),
    [markets]
  );

  const milFlights  = useMemo(() => flights.filter(f => f.is_military).length, [flights]);
  const darkVessels = useMemo(() => vessels.filter(v => v.is_dark).length, [vessels]);
  const color       = LEVEL_COLORS[tension?.level || 'CALM'] || '#00E676';
  const bars        = tension ? Math.round(tension.score * 2) : 0;

  return (
    <div className="h-full overflow-y-auto bg-[#030711] p-3 space-y-2" style={{ fontFamily: 'ui-monospace, monospace' }}>

      {/* ── HEADER ── */}
      <div className="flex items-center gap-3 px-1">
        <div className="w-[3px] h-5 bg-[#FF6D2A]" />
        <span className="text-[11px] font-black text-[#D0D9E8] tracking-[3px]">SITUATION OVERVIEW</span>
        <div className="live-dot" />
        <span className="text-[7px] text-[#00E676] tracking-[2px]">LIVE</span>
        <div className="flex-1" />
        <span className="text-[8px] text-[#2A3545] tabular-nums">{events.length} EVENTS</span>
      </div>

      {/* ── TENSION INDEX + SPARKLINE ── */}
      <div className="border border-[#152030] p-3" style={{ borderLeft: `3px solid ${color}` }}>
        <div className="flex items-center gap-6">
          {/* Score */}
          <div className="shrink-0 text-center" style={{ minWidth: 80 }}>
            <div className="text-[48px] font-black tabular-nums leading-none" style={{ color }}>
              {tension ? tension.score.toFixed(1) : '--'}
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

          {/* Bar meter + breakdown */}
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
                      <div className="h-full transition-all duration-500"
                        style={{ width: `${Math.min(100, ((val as number) / 3) * 100)}%`, backgroundColor: color }} />
                    </div>
                    <span className="text-[8px] tabular-nums w-6 text-right shrink-0" style={{ color }}>
                      {(val as number).toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 48h Recharts sparkline */}
          <div className="w-48 shrink-0 hidden lg:block">
            <div className="text-[7px] text-[#2A3545] tracking-[2px] mb-1">48H TREND</div>
            {tensionHistory.length > 2 ? (
              <ResponsiveContainer width="100%" height={56}>
                <AreaChart data={tensionHistory.slice(-48).flatMap(p => {
                  const ts = p.calculated_at ? new Date(p.calculated_at) : null;
                  if (!ts || Number.isNaN(ts.getTime())) return [];
                  return [{
                    time: ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    score: p.score,
                  }];
                })}>
                  <defs>
                    <linearGradient id="dashTensionGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="score" stroke={color} fill="url(#dashTensionGrad)" strokeWidth={1.5} dot={false} />
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
              <div className="h-14 flex items-center justify-center text-[8px] text-[#2A3545]">NO HISTORY</div>
            )}
          </div>
        </div>
      </div>

      {/* ── GLOBAL STATS BAR ── */}
      {globalStats && (
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-1">
          {[
            { label: 'EVENTS/HR',   value: globalStats.events_per_hour, color: '#FF6D2A', icon: '⚡' },
            { label: 'EVENTS 24H',  value: globalStats.events_24h,      color: '#00CFEB', icon: '📊' },
            { label: 'MARKETS',     value: globalStats.markets,         color: '#FFA800', icon: '📈' },
            { label: 'SIGNALS',     value: globalStats.active_signals,  color: '#00E676', icon: '🎯' },
            { label: 'FLIGHTS',     value: globalStats.flights,         color: '#38bdf8', icon: '✈' },
            { label: 'VESSELS',     value: globalStats.vessels,         color: '#a855f7', icon: '⚓' },
          ].map(s => (
            <div key={s.label} className="bg-[#060B16] border border-[#152030] px-2 py-1 text-center">
              <div className="text-[6px] text-[#2A3545] tracking-wider">{s.label}</div>
              <div className="text-[16px] font-black tabular-nums leading-tight" style={{ color: s.color }}>
                {s.value >= 1000 ? `${(s.value / 1000).toFixed(1)}k` : s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── STAT STRIP (compact) ── */}
      <div className="grid grid-cols-4 lg:grid-cols-6 gap-1">
        {[
          { label: 'CRITICAL',     value: sevCounts.critical,  color: '#FF3A3A' },
          { label: 'HIGH',         value: sevCounts.high,      color: '#FF6D2A' },
          { label: 'MIL. FLIGHTS', value: milFlights,          color: '#FFA800' },
          { label: 'DARK VESSELS', value: darkVessels,         color: '#a855f7' },
          { label: 'AIRCRAFT',     value: flights.length,      color: '#00CFEB' },
          { label: 'VESSELS',      value: vessels.length,      color: '#00CFEB' },
        ].map(s => (
          <div key={s.label} className="bg-[#060B16] border border-[#152030] px-2 py-1.5 text-center">
            <div className="text-[7px] text-[#2A3545] tracking-wider truncate">{s.label}</div>
            <div className="text-[18px] font-black tabular-nums leading-tight" style={{ color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── MAIN 2-COLUMN: EVENTS + SIDEBAR ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">

        {/* LEFT: Priority events feed */}
        <div className="lg:col-span-2 flex flex-col bg-[#060B16] border border-[#152030]" style={{ borderLeft: '2px solid #FF3A3A', maxHeight: 420 }}>
          <PanelHead icon={Zap} label="PRIORITY EVENTS" meta={`${priorityEvents.length} EVENTS >= SEV 7`} accent="#FF3A3A" />
          <div className="flex-1 overflow-y-auto">
            {priorityEvents.map(event => {
              const sc = event.severity >= 9 ? '#FF3A3A' : event.severity >= 8 ? '#FF6D2A' : '#FFA800';
              const ago = (() => {
                try { return formatDistanceToNow(new Date(event.created_at), { addSuffix: true }); }
                catch { return ''; }
              })();
              return (
                <div key={event.id}
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
                      <span className="text-[7px] text-[#2A3545] ml-auto flex items-center gap-0.5">
                        <Clock size={6} />{ago}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {priorityEvents.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Shield size={22} className="text-[#00E676]/30" />
                <p className="text-[9px] text-[#2A3545]">NO PRIORITY EVENTS</p>
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

          {/* Latest signals */}
          <Panel accent="#00E676">
            <PanelHead icon={Crosshair} label="SIGNALS" meta={`${signals.length} ACTIVE`} accent="#00E676" />
            <div className="max-h-36 overflow-y-auto">
              {signals.map(sig => {
                const dc = sig.direction === 'BUY_YES' ? '#00E676' : sig.direction === 'BUY_NO' ? '#FF3A3A' : '#00CFEB';
                return (
                  <div key={sig.id} className="flex items-start gap-2 px-3 py-2 border-b border-[#0A1018]">
                    <span className="text-[7px] font-black px-1.5 py-0.5 shrink-0 mt-px tracking-wider"
                      style={{ color: dc, background: `${dc}12`, border: `1px solid ${dc}25` }}>
                      {(sig.direction || sig.signal_type || '').replace('_', ' ')}
                    </span>
                    <p className="text-[8px] text-[#D0D9E8] leading-tight line-clamp-2 flex-1">
                      {sig.reasoning?.slice(0, 80) || `${sig.signal_type} signal`}
                    </p>
                  </div>
                );
              })}
              {signals.length === 0 && (
                <div className="px-3 py-4 text-center text-[8px] text-[#2A3545]">NO ACTIVE SIGNALS</div>
              )}
            </div>
          </Panel>

          {/* Top markets */}
          <Panel accent="#FFA800">
            <PanelHead icon={Target} label="TOP MARKETS" meta="POLYMARKET" accent="#FFA800" />
            <div className="max-h-36 overflow-y-auto">
              {topMarkets.map(m => {
                const prob = m.price_yes != null ? Math.round(m.price_yes * 100) : 0;
                const pc = prob >= 70 ? '#FF3A3A' : prob >= 40 ? '#FFA800' : '#00E676';
                return (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2 border-b border-[#0A1018]">
                    <span className="text-[13px] font-black tabular-nums w-10 shrink-0 text-center" style={{ color: pc }}>
                      {prob}%
                    </span>
                    <p className="text-[8px] text-[#D0D9E8] flex-1 leading-tight line-clamp-2">{m.question}</p>
                  </div>
                );
              })}
              {topMarkets.length === 0 && (
                <div className="px-3 py-4 text-[8px] text-[#2A3545]">NO MARKET DATA</div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* ── ANOMALIES (if any) ── */}
      {anomalies.length > 0 && (
        <Panel accent="#FF6D2A">
          <PanelHead icon={AlertTriangle} label="TRACKING ANOMALIES" meta={`${anomalies.length} ACTIVE`} accent="#FF6D2A" />
          <div className="p-2 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2">
            {anomalies.slice(0, 6).map((a, idx) => (
              <WhaleTradeCard key={a.id ?? `anomaly-${idx}`} anomaly={a} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
