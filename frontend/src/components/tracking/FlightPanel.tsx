import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTrackingStore } from '@/stores/trackingStore';
import {
  Plane, Search, ArrowUpDown, AlertTriangle, Shield, RefreshCw,
  Wifi, WifiOff, Clock, Activity, ChevronDown, ChevronUp,
  Radio, Flag, Navigation, Gauge,
} from 'lucide-react';
import { getSocket } from '@/services/socket';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { getOperator, getAircraftTypeName, getCountryFromIcao24, countryFlag, getFlightCategory } from '@/utils/aviation';
import { MiniMap } from './MiniMap';

type FilterTab = 'all' | 'military' | 'government' | 'cargo' | 'emergency';
type SortKey = 'callsign' | 'altitude' | 'speed';

// Cargo airline callsign prefixes (must match backend CARGO_CALLSIGN_PREFIXES)
const CARGO_PREFIXES = [
  'FDX', 'UPS', 'GTI', 'CLX', 'GEC', 'ABW', 'VDA', 'ADB', 'CKS',
  'SQC', 'CAO', 'MPH', 'AZG', 'BOX', 'DHK', 'BCS', 'DHL', 'POT', 'RCF', 'TYA',
];

const SQUAWK_INFO: Record<string, { label: string; desc: string; color: string }> = {
  '7500': { label: 'HIJACK',        desc: 'Unlawful interference',    color: '#FF3A3A' },
  '7600': { label: 'RADIO FAIL',    desc: 'Communications failure',   color: '#FF6D2A' },
  '7700': { label: 'EMERGENCY',     desc: 'General emergency',        color: '#FF3A3A' },
};

export function FlightPanel() {
  const flights = useTrackingStore((s) => s.flights);
  const flightsLoading = useTrackingStore((s) => s.flightsLoading);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [sortKey, setSortKey] = useState<SortKey>('altitude');
  const [sortDesc, setSortDesc] = useState(true);
  const [expandedIcao, setExpandedIcao] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);

  const handleRefresh = useCallback(async () => {
    setFetchError(false);
    try {
      await useTrackingStore.getState().fetchFlights();
      setLastUpdate(new Date());
      setFetchError(false);
    } catch {
      setFetchError(true);
    }
  }, []);

  useEffect(() => {
    useTrackingStore.getState().fetchFlights()
      .then(() => { setInitialLoaded(true); setLastUpdate(new Date()); })
      .catch(() => { setInitialLoaded(true); setFetchError(true); });

    const iv = setInterval(async () => {
      try {
        await useTrackingStore.getState().fetchFlights();
        setLastUpdate(new Date());
        setFetchError(false);
      } catch { setFetchError(true); }
    }, 30000);

    const socket = getSocket();
    const onUpdate = (p: { type: string }) => {
      if (p.type === 'flights') {
        useTrackingStore.getState().fetchFlights()
          .then(() => setLastUpdate(new Date()))
          .catch(() => {});
      }
    };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('tracking_update', onUpdate);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      clearInterval(iv);
      socket.off('tracking_update', onUpdate);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDesc(d => !d);
    else { setSortKey(key); setSortDesc(true); }
  }, [sortKey]);

  const isCargo = useCallback((f: typeof flights[0]) => {
    const cs = String(f.callsign || '').toUpperCase();
    return CARGO_PREFIXES.some(p => cs.startsWith(p));
  }, []);

  const stats = useMemo(() => ({
    total:     flights.length,
    military:  flights.filter(f => f.is_military).length,
    gov:       flights.filter(f => f.is_government).length,
    cargo:     flights.filter(f => isCargo(f)).length,
    emergency: flights.filter(f => f.squawk && ['7500','7600','7700'].includes(f.squawk)).length,
  }), [flights, isCargo]);

  const filtered = useMemo(() => {
    let list = flights;
    if (tab === 'military')  list = list.filter(f => f.is_military);
    else if (tab === 'government') list = list.filter(f => f.is_government);
    else if (tab === 'cargo') list = list.filter(f => isCargo(f));
    else if (tab === 'emergency')  list = list.filter(f => f.squawk && ['7500','7600','7700'].includes(f.squawk));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        (f.callsign || '').toLowerCase().includes(q) ||
        (f.icao24 || '').toLowerCase().includes(q) ||
        (f.origin_country || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sortKey === 'altitude') return sortDesc ? (b.altitude || 0) - (a.altitude || 0) : (a.altitude || 0) - (b.altitude || 0);
      if (sortKey === 'speed')    return sortDesc ? (b.velocity || 0) - (a.velocity || 0) : (a.velocity || 0) - (b.velocity || 0);
      return sortDesc ? (b.callsign || '').localeCompare(a.callsign || '') : (a.callsign || '').localeCompare(b.callsign || '');
    });
  }, [flights, tab, search, sortKey, sortDesc]);

  const tabs: { key: FilterTab; label: string; count: number; color: string }[] = [
    { key: 'all',       label: 'ALL',    count: stats.total,     color: '#00CFEB' },
    { key: 'military',  label: 'MIL',    count: stats.military,  color: '#FF3A3A' },
    { key: 'government',label: 'GOV',    count: stats.gov,       color: '#FFA800' },
    { key: 'cargo',     label: 'CARGO',  count: stats.cargo,     color: '#22D3EE' },
    { key: 'emergency', label: '⚡ EMRG', count: stats.emergency, color: '#FF3A3A' },
  ];

  const isLoading = !initialLoaded || flightsLoading;

  return (
    <div className="h-full flex flex-col" style={{ background: '#030711' }}>

      {/* ── Header ── */}
      <div
        className="px-4 pt-3 pb-2 border-b shrink-0"
        style={{ borderColor: '#152030', background: '#060B16' }}
      >
        {/* Title row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Plane size={14} style={{ color: '#FF6D2A' }} />
            <span className="text-[11px] font-mono font-black tracking-[3px] text-[#D0D9E8]">
              STRATEGIC TRACKING
            </span>
            {/* Connection + live dot */}
            <div className="flex items-center gap-1">
              {connected
                ? <Radio size={9} style={{ color: '#00E676' }} className="animate-pulse" />
                : <WifiOff size={9} style={{ color: '#FF3A3A' }} />
              }
              <span className="text-[7px] font-mono" style={{ color: connected ? '#00E676' : '#FF3A3A' }}>
                {connected ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
            {stats.emergency > 0 && (
              <span
                className="flex items-center gap-1 text-[8px] font-black tracking-widest px-1.5 py-px border animate-pulse"
                style={{ color: '#FF3A3A', borderColor: '#FF3A3A40', background: 'rgba(255,58,58,0.1)' }}
              >
                <AlertTriangle size={8} /> {stats.emergency} EMRG
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {lastUpdate && (
              <span className="text-[7px] font-mono text-[#2A3545] flex items-center gap-1">
                <Clock size={7} />
                {formatDistanceToNow(lastUpdate, { addSuffix: true })}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={flightsLoading}
              className="flex items-center gap-1 px-2 py-1 border transition-all text-[8px] font-mono tracking-widest"
              style={{ borderColor: '#152030', color: '#4E6070' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#D0D9E8'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#4E6070'; }}
            >
              <RefreshCw size={9} className={flightsLoading ? 'animate-spin' : ''} />
              REFRESH
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div
          className="flex items-stretch divide-x divide-[#0D1826] mb-2"
          style={{ border: '1px solid #0D1826', background: '#030711' }}
        >
          {[
            { label: 'STRATEGIC', value: stats.total, color: '#D0D9E8' },
            { label: 'MILITARY', value: stats.military, color: '#FF3A3A' },
            { label: 'CARGO', value: stats.cargo, color: '#22D3EE' },
            { label: 'EMERGENCY', value: stats.emergency, color: stats.emergency > 0 ? '#FF3A3A' : '#2A3545' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex flex-col items-center justify-center px-3 py-2 flex-1" style={{ borderColor: '#0D1826' }}>
              <div className="text-sm font-mono font-black tabular-nums" style={{ color }}>{value}</div>
              <div className="text-[6px] font-mono text-[#2A3545] tracking-wider mt-px">{label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#2A3545]" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search callsign, ICAO24, country..."
            className="w-full pl-7 pr-3 py-1.5 text-[10px] font-mono placeholder:text-[#2A3545] focus:outline-none"
            style={{
              background: '#030711',
              border: '1px solid #152030',
              color: '#D0D9E8',
            }}
            onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#FF6D2A50'; }}
            onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#152030'; }}
          />
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-1 text-[8px] font-mono font-bold px-2 py-1 border transition-all tracking-[1px]"
              style={tab === t.key
                ? { color: t.color, borderColor: `${t.color}40`, background: `${t.color}12` }
                : { color: '#2A3545', borderColor: '#0D1826', background: 'transparent' }
              }
              onMouseEnter={e => { if (tab !== t.key) (e.currentTarget as HTMLElement).style.color = '#D0D9E8'; }}
              onMouseLeave={e => { if (tab !== t.key) (e.currentTarget as HTMLElement).style.color = '#2A3545'; }}
            >
              {t.label}
              {t.count > 0 && <span className="opacity-60">{t.count}</span>}
            </button>
          ))}
          <div className="flex-1" />
          {/* Sort controls */}
          <div className="flex items-center gap-1">
            <ArrowUpDown size={8} style={{ color: '#2A3545' }} />
            {(['altitude', 'speed', 'callsign'] as SortKey[]).map(k => (
              <button key={k} onClick={() => handleSort(k)}
                className="text-[7px] font-mono px-1.5 py-0.5 border transition-all tracking-wider"
                style={sortKey === k
                  ? { color: '#00CFEB', borderColor: '#00CFEB40', background: 'rgba(0,207,235,0.08)' }
                  : { color: '#2A3545', borderColor: 'transparent' }
                }
              >
                {k === 'altitude' ? 'ALT' : k === 'speed' ? 'SPD' : 'CS'}
                {sortKey === k && <span className="ml-0.5">{sortDesc ? '↓' : '↑'}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div
          className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.7fr_0.5fr] gap-1 mt-2 px-3 py-1.5 border-t"
          style={{ borderColor: '#0D1826' }}
        >
          {['CALLSIGN / ICAO24', 'ALT (FT)', 'SPD (KT)', 'HDG', 'TYPE'].map(h => (
            <span key={h} className="text-[6px] font-mono text-[#2A3545] tracking-wider">{h}</span>
          ))}
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#FF6D2A30', borderTopColor: '#FF6D2A' }} />
            <span className="text-[9px] font-mono text-[#2A3545] tracking-widest">ACQUIRING TRACKS...</span>
          </div>
        ) : fetchError ? (
          <DiagnosticsPanel onRetry={handleRefresh} />
        ) : filtered.length === 0 && flights.length === 0 ? (
          <EmptyState onRefresh={handleRefresh} loading={flightsLoading} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2">
            <Plane size={22} style={{ color: '#2A3545' }} />
            <span className="text-[9px] font-mono text-[#4E6070]">NO AIRCRAFT MATCH FILTER</span>
          </div>
        ) : (
          filtered.map((flight) => {
            const altFt   = flight.altitude ? Math.round(flight.altitude * 3.281).toLocaleString() : '--';
            const spdKt   = flight.velocity ? Math.round(flight.velocity * 1.944) : '--';
            const hdg     = flight.heading && flight.heading < 360 ? `${Math.round(flight.heading)}°` : '--';
            const sq      = flight.squawk;
            const sqInfo  = sq ? SQUAWK_INFO[sq] : null;
            const isMil   = flight.is_military;
            const isGov   = flight.is_government;
            const isCargoFlight = isCargo(flight);
            const accent  = isMil ? '#FF3A3A' : isGov ? '#FFA800' : isCargoFlight ? '#22D3EE' : sqInfo ? sqInfo.color : '#4E6070';
            const expanded = expandedIcao === flight.icao24;

            return (
              <div
                key={flight.icao24}
                className="border-b cursor-pointer"
                style={{ borderColor: '#0D1826', background: sqInfo ? 'rgba(255,58,58,0.03)' : undefined }}
                onClick={() => setExpandedIcao(expanded ? null : flight.icao24)}
              >
                {/* Main row */}
                <div
                  className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.7fr_0.5fr] gap-1 px-3 py-2 transition-colors"
                  style={{ borderLeft: `2px solid ${expanded ? accent : 'transparent'}` }}
                  onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = '#060B16'; }}
                  onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = ''; }}
                >
                  <div className="flex flex-col min-w-0 justify-center">
                    <div className="flex items-center gap-1">
                      {sqInfo && <AlertTriangle size={8} style={{ color: sqInfo.color }} className="shrink-0 animate-pulse" />}
                      {(isMil || isGov) && !sqInfo && <Shield size={8} style={{ color: accent }} className="shrink-0" />}
                      <span className="text-[11px] font-mono font-bold truncate" style={{ color: accent }}>
                        {flight.callsign || flight.icao24 || '--'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[7px] font-mono text-[#2A3545]">{flight.icao24}</span>
                      {(() => {
                        const _ic = getCountryFromIcao24(flight.icao24);
                        const _cc = _ic?.code || '';
                        const _fl = _cc ? countryFlag(_cc) : '';
                        const _cn = flight.origin_country || _ic?.name || '';
                        return _cn ? (
                          <span className="text-[7px] font-mono text-[#2A3545] flex items-center gap-0.5">
                            · {_fl && <span className="text-[9px]">{_fl}</span>}{_cn}
                          </span>
                        ) : null;
                      })()}
                      {(() => {
                        const _op = getOperator(flight.callsign || '');
                        return _op ? (
                          <span className="text-[7px] font-mono text-[#4E6070]">· {_op.name}</span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-[#94A3B8] self-center tabular-nums">{altFt}</span>
                  <span className="text-[10px] font-mono text-[#94A3B8] self-center tabular-nums">{spdKt}</span>
                  <span className="text-[10px] font-mono text-[#4E6070] self-center tabular-nums">{hdg}</span>
                  <div className="flex items-center gap-1 self-center">
                    <span
                      className="text-[7px] font-mono px-1 py-0.5"
                      style={isMil
                        ? { color: '#FF3A3A', background: 'rgba(255,58,58,0.1)' }
                        : isGov
                        ? { color: '#FFA800', background: 'rgba(255,168,0,0.1)' }
                        : isCargoFlight
                        ? { color: '#22D3EE', background: 'rgba(34,211,238,0.1)' }
                        : { color: '#2A3545', background: 'rgba(42,53,69,0.3)' }
                      }
                    >
                      {isMil ? 'MIL' : isGov ? 'GOV' : isCargoFlight ? 'CARGO' : 'ZONE'}
                    </span>
                    {expanded ? <ChevronUp size={8} style={{ color: '#2A3545' }} /> : <ChevronDown size={8} style={{ color: '#2A3545' }} />}
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded && (() => {
                  const operator = getOperator(flight.callsign || '');
                  const typeName = getAircraftTypeName(flight.aircraft_type || '');
                  const icaoCountry = getCountryFromIcao24(flight.icao24);
                  const country = flight.origin_country || icaoCountry?.name || '';
                  const countryCode = icaoCountry?.code || operator?.country || '';
                  const flag = countryCode ? countryFlag(countryCode) : '';
                  const category = getFlightCategory(flight.callsign || '', flight.aircraft_type || '', isMil, isGov, sq);

                  return (
                    <div
                      className="px-4 py-3 border-t"
                      style={{ borderColor: `${accent}20`, background: `${accent}04` }}
                    >
                      {sqInfo && (
                        <div
                          className="flex items-center gap-2 px-3 py-2 mb-2 border"
                          style={{ background: `${sqInfo.color}10`, borderColor: `${sqInfo.color}30` }}
                        >
                          <AlertTriangle size={10} style={{ color: sqInfo.color }} className="animate-pulse" />
                          <div>
                            <div className="text-[9px] font-mono font-black tracking-[2px]" style={{ color: sqInfo.color }}>
                              SQUAWK {sq} — {sqInfo.label}
                            </div>
                            <div className="text-[8px] font-mono text-[#4E6070]">{sqInfo.desc}</div>
                          </div>
                        </div>
                      )}

                      {/* Operator / Aircraft identification */}
                      <div className="flex items-center gap-2 mb-2 px-2 py-2 border" style={{ borderColor: `${accent}20`, background: `${accent}06` }}>
                        {flag && <span className="text-base leading-none">{flag}</span>}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-black" style={{ color: accent }}>
                              {operator?.name || category}
                            </span>
                            <span className="text-[7px] font-mono px-1 py-0.5" style={{
                              color: accent, background: `${accent}15`, border: `1px solid ${accent}30`,
                            }}>
                              {category}
                            </span>
                          </div>
                          {typeName && (
                            <div className="text-[8px] font-mono text-[#6B7F94] mt-0.5">
                              {typeName}
                            </div>
                          )}
                          {country && (
                            <div className="text-[7px] font-mono text-[#4E6070] mt-0.5 flex items-center gap-1">
                              <Flag size={7} /> {country}
                              {operator?.country && operator.country !== countryCode && (
                                <span className="text-[#2A3545]">· Operator: {countryFlag(operator.country)} {operator.country}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { label: 'ICAO24', value: flight.icao24 || '--' },
                          { label: 'CALLSIGN', value: flight.callsign || '--' },
                          { label: 'AIRCRAFT TYPE', value: flight.aircraft_type ? `${flight.aircraft_type}${typeName ? ` · ${typeName}` : ''}` : '--' },
                          { label: 'ALTITUDE', value: flight.altitude ? `${altFt} ft / FL${Math.round(flight.altitude * 3.281 / 100).toString().padStart(3, '0')}` : '--' },
                          { label: 'GROUND SPEED', value: flight.velocity ? `${spdKt} kt / ${Math.round(flight.velocity * 3.6)} km/h` : '--' },
                          { label: 'HEADING', value: hdg !== '--' ? `${hdg} ${_hdgCardinal(flight.heading)}` : '--' },
                          { label: 'REGISTRATION', value: country || '--' },
                          { label: 'SQUAWK', value: sq || 'STANDBY' },
                          { label: 'VERTICAL RATE', value: flight.altitude ? (flight.velocity ? `${(flight.altitude > 10000 ? 'CRUISE' : 'CLIMBING')}` : '--') : '--' },
                        ] as { label: string; value: string }[]).map(({ label, value }) => (
                          <div key={label} className="border p-2" style={{ borderColor: '#0D1826', background: '#030711' }}>
                            <div className="text-[6px] font-mono text-[#2A3545] tracking-[2px] mb-0.5">{label}</div>
                            <div className="text-[9px] font-mono text-[#94A3B8] font-bold truncate">{value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Mini map */}
                      {flight.latitude && flight.longitude && (
                        <div className="mt-2">
                          <MiniMap
                            lat={flight.latitude}
                            lng={flight.longitude}
                            heading={flight.heading}
                            label={flight.callsign || flight.icao24}
                            accent={accent}
                            zoom={isMil || isGov ? 4 : 5}
                            height={150}
                            type="flight"
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })
        )}
      </div>

      {/* Footer: showing count */}
      {filtered.length > 0 && (
        <div
          className="px-4 py-1.5 border-t shrink-0 flex items-center justify-between"
          style={{ borderColor: '#152030', background: '#060B16' }}
        >
          <span className="text-[7px] font-mono text-[#2A3545]">
            SHOWING <span className="text-[#D0D9E8]">{filtered.length}</span> OF <span className="text-[#D0D9E8]">{flights.length}</span> TRACKS
          </span>
          {lastUpdate && (
            <span className="text-[7px] font-mono text-[#2A3545] flex items-center gap-1">
              <Activity size={7} /> UPDATED {formatDistanceToNow(lastUpdate, { addSuffix: true })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Empty state with context ──────────────────────────────────────

function EmptyState({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col items-center gap-3 py-6">
        <Plane size={32} style={{ color: '#152030' }} />
        <div className="text-center">
          <div className="text-[10px] font-mono text-[#4E6070] tracking-[2px] mb-1">NO STRATEGIC TRACKS</div>
          <div className="text-[9px] font-mono text-[#2A3545] max-w-xs leading-relaxed text-center">
            No strategic aircraft (military, cargo, government) in the last 2 hours. Civilian traffic is filtered out to optimize resources.
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border text-[9px] font-mono tracking-wider transition-all"
          style={{ borderColor: '#152030', color: '#4E6070' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#D0D9E8'; (e.currentTarget as HTMLElement).style.borderColor = '#FF6D2A40'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#4E6070'; (e.currentTarget as HTMLElement).style.borderColor = '#152030'; }}
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          RETRY FETCH
        </button>
      </div>

      {/* Data sources */}
      <div className="border" style={{ borderColor: '#152030' }}>
        <div className="px-3 py-2 border-b flex items-center gap-1.5" style={{ borderColor: '#0D1826', background: '#040C18' }}>
          <Wifi size={9} style={{ color: '#00CFEB' }} />
          <span className="text-[8px] font-mono font-bold tracking-[2px] text-[#00CFEB]">DATA SOURCES</span>
        </div>
        {[
          { name: 'ADSB.FI', desc: 'Global ADS-B feed (primary)', free: true },
          { name: 'ADSB.LOL', desc: 'Community ADS-B feed (secondary)', free: true },
          { name: 'ADSBEXCHANGE', desc: 'Military-enhanced feed (API key)', free: false },
          { name: 'OPENSKY', desc: 'Academic network (fallback)', free: true },
        ].map(s => (
          <div key={s.name} className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: '#0D1826' }}>
            <div>
              <div className="text-[9px] font-mono font-bold text-[#D0D9E8]">{s.name}</div>
              <div className="text-[7px] font-mono text-[#2A3545]">{s.desc}</div>
            </div>
            <span className="text-[7px] font-mono" style={{ color: s.free ? '#00E676' : '#FFA800' }}>
              {s.free ? 'FREE' : 'API KEY'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function _hdgCardinal(heading?: number): string {
  if (heading == null || heading >= 360) return '';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(heading / 22.5) % 16];
}

// ── Diagnostics panel on error ────────────────────────────────────

function DiagnosticsPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="flex items-center gap-2 px-3 py-2 border" style={{ borderColor: '#FF3A3A40', background: 'rgba(255,58,58,0.06)' }}>
          <AlertTriangle size={12} style={{ color: '#FF3A3A' }} />
          <span className="text-[9px] font-mono font-bold text-[#FF3A3A] tracking-[2px]">TRACKING FEED ERROR</span>
        </div>
        <p className="text-[9px] font-mono text-[#4E6070] text-center max-w-xs leading-relaxed">
          Failed to fetch flight data from the backend. Check that the SONAR backend is running and the database is accessible.
        </p>
        <button onClick={onRetry} className="flex items-center gap-2 px-4 py-2 border text-[9px] font-mono tracking-wider" style={{ borderColor: '#FF6D2A40', color: '#FF6D2A', background: 'rgba(255,109,42,0.08)' }}>
          <RefreshCw size={10} /> RETRY
        </button>
      </div>

      <div className="border p-3 space-y-2" style={{ borderColor: '#152030', background: '#040C18' }}>
        <div className="text-[8px] font-mono font-bold text-[#FFA800] tracking-[2px] mb-2">TROUBLESHOOTING</div>
        {[
          'Check docker compose logs backend',
          'Verify PostgreSQL is running: docker compose ps',
          'Check .env for ADSB_FI_URL / OPENSKY_USER config',
          'Flight ingestion runs every 30s — wait 1 minute after startup',
        ].map((tip, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-[8px] font-mono text-[#2A3545] shrink-0">{i + 1}.</span>
            <span className="text-[8px] font-mono text-[#4E6070]">{tip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
