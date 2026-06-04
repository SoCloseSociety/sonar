import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTrackingStore } from '@/stores/trackingStore';
import {
  Ship, Search, ArrowUpDown, AlertTriangle, Shield, RefreshCw,
  Clock, ChevronDown, ChevronUp, Navigation, Anchor, Flag,
  Activity, Radio,
} from 'lucide-react';
import { getSocket } from '@/services/socket';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { getVesselTypeInfo, getCountryFromMMSI, countryFlag, getVesselCategoryColor } from '@/utils/maritime';
import { MiniMap } from './MiniMap';

type VesselTab = 'all' | 'military' | 'dark' | 'cargo' | 'tanker';
type VesselSort = 'name' | 'speed' | 'type';

export function VesselPanel() {
  const vessels = useTrackingStore((s) => s.vessels);
  const vesselsLoading = useTrackingStore((s) => s.vesselsLoading);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<VesselTab>('all');
  const [sortKey, setSortKey] = useState<VesselSort>('speed');
  const [sortDesc, setSortDesc] = useState(true);
  const [expandedMmsi, setExpandedMmsi] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);

  const handleRefresh = useCallback(async () => {
    try {
      await useTrackingStore.getState().fetchVessels();
      setLastUpdate(new Date());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    useTrackingStore.getState().fetchVessels()
      .then(() => { setInitialLoaded(true); setLastUpdate(new Date()); })
      .catch(() => setInitialLoaded(true));
    const iv = setInterval(async () => {
      try {
        await useTrackingStore.getState().fetchVessels();
        setLastUpdate(new Date());
      } catch { /* ignore */ }
    }, 60000);
    const socket = getSocket();
    const onUpdate = (p: { type: string }) => {
      if (p.type === 'vessels') {
        useTrackingStore.getState().fetchVessels().then(() => setLastUpdate(new Date())).catch(() => {});
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

  const handleSort = useCallback((key: VesselSort) => {
    if (sortKey === key) setSortDesc(d => !d);
    else { setSortKey(key); setSortDesc(true); }
  }, [sortKey]);

  const stats = useMemo(() => ({
    total: vessels.length,
    military: vessels.filter(v => v.is_military).length,
    dark: vessels.filter(v => v.is_dark).length,
    cargo: vessels.filter(v => v.vessel_type != null && v.vessel_type >= 70 && v.vessel_type < 80).length,
    tanker: vessels.filter(v => v.vessel_type != null && v.vessel_type >= 80 && v.vessel_type < 90).length,
  }), [vessels]);

  const filtered = useMemo(() => {
    let list = vessels;
    if (tab === 'military') list = list.filter(v => v.is_military);
    else if (tab === 'dark') list = list.filter(v => v.is_dark);
    else if (tab === 'cargo') list = list.filter(v => v.vessel_type != null && v.vessel_type >= 70 && v.vessel_type < 80);
    else if (tab === 'tanker') list = list.filter(v => v.vessel_type != null && v.vessel_type >= 80 && v.vessel_type < 90);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        (v.vessel_name || '').toLowerCase().includes(q) ||
        (v.mmsi || '').toLowerCase().includes(q) ||
        (v.flag || '').toLowerCase().includes(q) ||
        (v.destination || '').toLowerCase().includes(q) ||
        (v.imo || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sortKey === 'speed') return sortDesc ? (b.speed || 0) - (a.speed || 0) : (a.speed || 0) - (b.speed || 0);
      if (sortKey === 'type') return sortDesc ? (b.vessel_type_name || '').localeCompare(a.vessel_type_name || '') : (a.vessel_type_name || '').localeCompare(b.vessel_type_name || '');
      return sortDesc ? (b.vessel_name || '').localeCompare(a.vessel_name || '') : (a.vessel_name || '').localeCompare(b.vessel_name || '');
    });
  }, [vessels, tab, search, sortKey, sortDesc]);

  const tabs: { key: VesselTab; label: string; count: number; color: string }[] = [
    { key: 'all',      label: 'ALL',    count: stats.total,    color: '#00CFEB' },
    { key: 'military', label: 'MIL',    count: stats.military, color: '#FF3A3A' },
    { key: 'dark',     label: 'DARK',   count: stats.dark,     color: '#f97316' },
    { key: 'cargo',    label: 'CARGO',  count: stats.cargo,    color: '#3b82f6' },
    { key: 'tanker',   label: 'TANKER', count: stats.tanker,   color: '#f97316' },
  ];

  const isLoading = !initialLoaded || vesselsLoading;

  return (
    <div className="h-full flex flex-col" style={{ background: '#030711' }}>

      {/* ── Header ── */}
      <div className="px-4 pt-3 pb-2 border-b shrink-0" style={{ borderColor: '#152030', background: '#060B16' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Ship size={14} style={{ color: '#3b82f6' }} />
            <span className="text-[11px] font-mono font-black tracking-[3px] text-[#D0D9E8]">
              VESSEL TRACKING
            </span>
            <div className="flex items-center gap-1">
              {connected
                ? <Radio size={9} style={{ color: '#00E676' }} className="animate-pulse" />
                : <Radio size={9} style={{ color: '#FF3A3A' }} />
              }
              <span className="text-[7px] font-mono" style={{ color: connected ? '#00E676' : '#FF3A3A' }}>
                {connected ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
            {stats.dark > 0 && (
              <span className="flex items-center gap-1 text-[8px] font-black tracking-widest px-1.5 py-px border"
                style={{ color: '#f97316', borderColor: '#f9731640', background: 'rgba(249,115,22,0.1)' }}>
                <AlertTriangle size={8} /> {stats.dark} DARK
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lastUpdate && (
              <span className="text-[7px] font-mono text-[#2A3545] flex items-center gap-1">
                <Clock size={7} /> {formatDistanceToNow(lastUpdate, { addSuffix: true })}
              </span>
            )}
            <button onClick={handleRefresh} disabled={vesselsLoading}
              className="flex items-center gap-1 px-2 py-1 border transition-all text-[8px] font-mono tracking-widest"
              style={{ borderColor: '#152030', color: '#4E6070' }}>
              <RefreshCw size={9} className={vesselsLoading ? 'animate-spin' : ''} /> REFRESH
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-stretch divide-x divide-[#0D1826] mb-2" style={{ border: '1px solid #0D1826', background: '#030711' }}>
          {[
            { label: 'TRACKED', value: stats.total, color: '#D0D9E8' },
            { label: 'MILITARY', value: stats.military, color: '#FF3A3A' },
            { label: 'DARK', value: stats.dark, color: stats.dark > 0 ? '#f97316' : '#2A3545' },
            { label: 'CARGO', value: stats.cargo, color: '#3b82f6' },
            { label: 'TANKER', value: stats.tanker, color: '#f97316' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex flex-col items-center justify-center px-3 py-2 flex-1">
              <div className="text-sm font-mono font-black tabular-nums" style={{ color }}>{value}</div>
              <div className="text-[6px] font-mono text-[#2A3545] tracking-wider mt-px">{label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#2A3545]" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, MMSI, IMO, flag, destination..."
            className="w-full pl-7 pr-3 py-1.5 text-[10px] font-mono placeholder:text-[#2A3545] focus:outline-none"
            style={{ background: '#030711', border: '1px solid #152030', color: '#D0D9E8' }}
            onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#3b82f650'; }}
            onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#152030'; }}
          />
        </div>

        {/* Filter tabs + sort */}
        <div className="flex items-center gap-1 flex-wrap">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-1 text-[8px] font-mono font-bold px-2 py-1 border transition-all tracking-[1px]"
              style={tab === t.key
                ? { color: t.color, borderColor: `${t.color}40`, background: `${t.color}12` }
                : { color: '#2A3545', borderColor: '#0D1826', background: 'transparent' }
              }>
              {t.label}
              {t.count > 0 && <span className="opacity-60">{t.count}</span>}
            </button>
          ))}
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <ArrowUpDown size={8} style={{ color: '#2A3545' }} />
            {(['speed', 'name', 'type'] as VesselSort[]).map(k => (
              <button key={k} onClick={() => handleSort(k)}
                className="text-[7px] font-mono px-1.5 py-0.5 border transition-all tracking-wider"
                style={sortKey === k
                  ? { color: '#00CFEB', borderColor: '#00CFEB40', background: 'rgba(0,207,235,0.08)' }
                  : { color: '#2A3545', borderColor: 'transparent' }
                }>
                {k === 'speed' ? 'SPD' : k === 'name' ? 'NAME' : 'TYPE'}
                {sortKey === k && <span className="ml-0.5">{sortDesc ? '↓' : '↑'}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[2fr_0.7fr_0.7fr_1fr_0.6fr] gap-1 mt-2 px-3 py-1.5 border-t" style={{ borderColor: '#0D1826' }}>
          {['VESSEL / MMSI', 'FLAG', 'SPD (KT)', 'TYPE', 'STATUS'].map(h => (
            <span key={h} className="text-[6px] font-mono text-[#2A3545] tracking-wider">{h}</span>
          ))}
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#3b82f630', borderTopColor: '#3b82f6' }} />
            <span className="text-[9px] font-mono text-[#2A3545] tracking-widest">ACQUIRING VESSELS...</span>
          </div>
        ) : filtered.length === 0 && vessels.length === 0 ? (
          <EmptyState onRefresh={handleRefresh} loading={vesselsLoading} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2">
            <Ship size={22} style={{ color: '#2A3545' }} />
            <span className="text-[9px] font-mono text-[#4E6070]">NO VESSELS MATCH FILTER</span>
          </div>
        ) : (
          filtered.map((vessel) => {
            const typeInfo = getVesselTypeInfo(vessel.vessel_type);
            const mmsiCountry = getCountryFromMMSI(vessel.mmsi);
            const flagStr = vessel.flag || mmsiCountry?.code || '';
            const flagEmoji = flagStr ? countryFlag(flagStr) : '';
            const countryName = mmsiCountry?.name || vessel.flag || '';
            const catColor = vessel.is_military ? '#ef4444' : vessel.is_dark ? '#f97316' : getVesselCategoryColor(typeInfo.category);
            const isExpanded = expandedMmsi === vessel.mmsi;

            return (
              <div key={vessel.mmsi} className="border-b cursor-pointer"
                style={{ borderColor: '#0D1826', background: vessel.is_dark ? 'rgba(249,115,22,0.03)' : vessel.is_military ? 'rgba(239,68,68,0.03)' : undefined }}
                onClick={() => setExpandedMmsi(isExpanded ? null : vessel.mmsi)}>

                {/* Main row */}
                <div className="grid grid-cols-[2fr_0.7fr_0.7fr_1fr_0.6fr] gap-1 px-3 py-2 transition-colors"
                  style={{ borderLeft: `2px solid ${isExpanded ? catColor : 'transparent'}` }}
                  onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = '#060B16'; }}
                  onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = ''; }}>

                  <div className="flex flex-col min-w-0 justify-center">
                    <div className="flex items-center gap-1">
                      {vessel.is_dark && <AlertTriangle size={8} className="text-orange-400 shrink-0" />}
                      {vessel.is_military && <Shield size={8} className="text-red-400 shrink-0" />}
                      <span className="text-[11px] font-mono font-bold truncate" style={{ color: catColor }}>
                        {vessel.vessel_name || `MMSI ${vessel.mmsi}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[7px] font-mono text-[#2A3545]">{vessel.mmsi}</span>
                      {vessel.destination && (
                        <span className="text-[7px] font-mono text-[#2A3545] truncate">
                          <span className="text-[#4E6070]">→</span> {vessel.destination}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 self-center">
                    {flagEmoji && <span className="text-[11px] leading-none">{flagEmoji}</span>}
                    <span className="text-[8px] font-mono text-[#4E6070]">{flagStr}</span>
                  </div>

                  <span className="text-[10px] font-mono text-[#94A3B8] self-center tabular-nums">
                    {vessel.speed != null ? vessel.speed.toFixed(1) : '--'}
                  </span>

                  <div className="flex items-center gap-1 self-center">
                    <span className="text-[9px]">{typeInfo.emoji}</span>
                    <span className="text-[8px] font-mono text-[#94A3B8] truncate">{vessel.vessel_type_name || typeInfo.name}</span>
                  </div>

                  <div className="flex items-center gap-1 self-center">
                    {vessel.is_dark ? (
                      <span className="text-[7px] font-mono font-bold px-1 py-0.5" style={{ color: '#f97316', background: 'rgba(249,115,22,0.1)' }}>DARK</span>
                    ) : vessel.is_military ? (
                      <span className="text-[7px] font-mono font-bold px-1 py-0.5" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}>MIL</span>
                    ) : (
                      <span className="text-[7px] font-mono text-[#2A3545]">—</span>
                    )}
                    {isExpanded ? <ChevronUp size={8} style={{ color: '#2A3545' }} /> : <ChevronDown size={8} style={{ color: '#2A3545' }} />}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 py-3 border-t" style={{ borderColor: `${catColor}20`, background: `${catColor}04` }}>

                    {/* Country / Type identification */}
                    <div className="flex items-center gap-2 mb-2 px-2 py-2 border" style={{ borderColor: `${catColor}20`, background: `${catColor}06` }}>
                      {flagEmoji && <span className="text-xl leading-none">{flagEmoji}</span>}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-black" style={{ color: catColor }}>
                            {vessel.vessel_name || 'UNKNOWN VESSEL'}
                          </span>
                          <span className="text-[7px] font-mono px-1 py-0.5" style={{
                            color: catColor, background: `${catColor}15`, border: `1px solid ${catColor}30`,
                          }}>
                            {typeInfo.emoji} {typeInfo.name.toUpperCase()}
                          </span>
                        </div>
                        {countryName && (
                          <div className="text-[8px] font-mono text-[#6B7F94] mt-0.5 flex items-center gap-1">
                            <Flag size={7} /> {countryName}
                          </div>
                        )}
                        {vessel.destination && (
                          <div className="text-[7px] font-mono text-[#4E6070] mt-0.5 flex items-center gap-1">
                            <Anchor size={7} /> Destination: {vessel.destination}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Dark vessel alert */}
                    {vessel.is_dark && (
                      <div className="flex items-center gap-2 px-3 py-2 mb-2 border"
                        style={{ background: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.3)' }}>
                        <AlertTriangle size={10} className="text-orange-400 animate-pulse" />
                        <div>
                          <div className="text-[9px] font-mono font-black tracking-[2px] text-orange-400">
                            DARK VESSEL — AIS ANOMALY
                          </div>
                          <div className="text-[8px] font-mono text-[#4E6070]">
                            No name, low speed, no type — possible sanctions evasion or AIS manipulation
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Data grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { label: 'MMSI', value: vessel.mmsi || '--' },
                        { label: 'IMO', value: vessel.imo || '--' },
                        { label: 'FLAG / REGISTRY', value: countryName ? `${flagEmoji} ${countryName}` : flagStr || '--' },
                        { label: 'VESSEL TYPE', value: `${typeInfo.emoji} ${vessel.vessel_type_name || typeInfo.name} (${vessel.vessel_type ?? '--'})` },
                        { label: 'SPEED (SOG)', value: vessel.speed != null ? `${vessel.speed.toFixed(1)} kt / ${(vessel.speed * 1.852).toFixed(1)} km/h` : '--' },
                        { label: 'HEADING', value: vessel.heading != null ? `${Math.round(vessel.heading)}° ${_vesselHdgCardinal(vessel.heading)}` : '--' },
                        { label: 'DESTINATION', value: vessel.destination || '--' },
                        { label: 'AIS STATUS', value: vessel.is_dark ? 'DARK / SUSPICIOUS' : vessel.is_military ? 'MILITARY' : 'NORMAL' },
                        { label: 'CATEGORY', value: `${typeInfo.category.toUpperCase()}` },
                      ] as { label: string; value: string }[]).map(({ label, value }) => (
                        <div key={label} className="border p-2" style={{ borderColor: '#0D1826', background: '#030711' }}>
                          <div className="text-[6px] font-mono text-[#2A3545] tracking-[2px] mb-0.5">{label}</div>
                          <div className="text-[9px] font-mono text-[#94A3B8] font-bold truncate">{value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Mini map */}
                    {vessel.latitude && vessel.longitude && (
                      <div className="mt-2">
                        <MiniMap
                          lat={vessel.latitude}
                          lng={vessel.longitude}
                          heading={vessel.heading}
                          label={vessel.vessel_name || vessel.mmsi}
                          accent={catColor}
                          zoom={vessel.is_military ? 4 : 6}
                          height={150}
                          type="vessel"
                        />
                      </div>
                    )}
                    {vessel.captured_at && (
                      <div className="mt-1 text-[7px] font-mono text-[#2A3545] flex items-center gap-1 justify-end">
                        <Clock size={7} /> {formatDistanceToNow(new Date(vessel.captured_at), { addSuffix: true })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {filtered.length > 0 && (
        <div className="px-4 py-1.5 border-t shrink-0 flex items-center justify-between"
          style={{ borderColor: '#152030', background: '#060B16' }}>
          <span className="text-[7px] font-mono text-[#2A3545]">
            SHOWING <span className="text-[#D0D9E8]">{filtered.length}</span> OF <span className="text-[#D0D9E8]">{vessels.length}</span> VESSELS
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

function _vesselHdgCardinal(heading?: number): string {
  if (heading == null || heading >= 360) return '';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(heading / 22.5) % 16];
}

function EmptyState({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col items-center gap-3 py-6">
        <Ship size={32} style={{ color: '#152030' }} />
        <div className="text-center">
          <div className="text-[10px] font-mono text-[#4E6070] tracking-[2px] mb-1">NO VESSEL DATA</div>
          <div className="text-[9px] font-mono text-[#2A3545] max-w-xs leading-relaxed text-center">
            AISstream API key required for vessel tracking. Military, cargo, and tanker vessels are monitored in sensitive maritime zones.
          </div>
        </div>
        <button onClick={onRefresh} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border text-[9px] font-mono tracking-wider transition-all"
          style={{ borderColor: '#152030', color: '#4E6070' }}>
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> RETRY
        </button>
      </div>
      <div className="border" style={{ borderColor: '#152030' }}>
        <div className="px-3 py-2 border-b flex items-center gap-1.5" style={{ borderColor: '#0D1826', background: '#040C18' }}>
          <Anchor size={9} style={{ color: '#3b82f6' }} />
          <span className="text-[8px] font-mono font-bold tracking-[2px] text-[#3b82f6]">DATA SOURCE</span>
        </div>
        {[
          { name: 'AISSTREAM', desc: 'Global AIS WebSocket feed', key: true },
          { name: 'MARINETRAFFIC', desc: 'Alternative (not configured)', key: false },
        ].map(s => (
          <div key={s.name} className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: '#0D1826' }}>
            <div>
              <div className="text-[9px] font-mono font-bold text-[#D0D9E8]">{s.name}</div>
              <div className="text-[7px] font-mono text-[#2A3545]">{s.desc}</div>
            </div>
            <span className="text-[7px] font-mono" style={{ color: s.key ? '#FFA800' : '#2A3545' }}>
              {s.key ? 'API KEY' : 'N/A'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
