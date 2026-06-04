import { useState } from 'react';
import { useEventStore } from '@/stores/eventStore';
import { Filter, ChevronDown, MapPin, Clock, Shield, Radio, X } from 'lucide-react';
import { clsx } from 'clsx';

const SEVERITY_OPTIONS = [
  { label: 'ALL', value: 0, color: 'text-slate-400' },
  { label: 'LOW+', value: 3, color: 'text-green-400' },
  { label: 'MED+', value: 5, color: 'text-amber-400' },
  { label: 'HIGH+', value: 7, color: 'text-orange-400' },
  { label: 'CRIT', value: 9, color: 'text-red-400' },
];

const TIME_OPTIONS = [
  { label: '1H', value: 1 },
  { label: '6H', value: 6 },
  { label: '24H', value: 24 },
  { label: '48H', value: 48 },
];

const CATEGORIES = [
  { key: 'MILITARY_CONFLICT', icon: '\u2694\uFE0F', label: 'MILITARY' },
  { key: 'DIPLOMATIC', icon: '\uD83C\uDFF3\uFE0F', label: 'DIPLOMATIC' },
  { key: 'NUCLEAR', icon: '\u2622\uFE0F', label: 'NUCLEAR' },
  { key: 'TERRORISM', icon: '\uD83D\uDCA3', label: 'TERRORISM' },
  { key: 'CYBER_ATTACK', icon: '\uD83D\uDEE1\uFE0F', label: 'CYBER' },
  { key: 'NATURAL_DISASTER', icon: '\uD83C\uDF0A', label: 'DISASTER' },
  { key: 'EARTHQUAKE', icon: '\uD83C\uDF0B', label: 'EARTHQUAKE' },
  { key: 'WEATHER', icon: '\u26C8\uFE0F', label: 'WEATHER' },
  { key: 'FIRE', icon: '\uD83D\uDD25', label: 'FIRE' },
  { key: 'ECONOMIC_POLICY', icon: '\uD83D\uDCC8', label: 'ECONOMIC' },
  { key: 'SANCTIONS', icon: '\uD83D\uDEAB', label: 'SANCTIONS' },
  { key: 'MARITIME_SECURITY', icon: '\u2693', label: 'MARITIME' },
  { key: 'AVIATION_INCIDENT', icon: '\u2708\uFE0F', label: 'AVIATION' },
  { key: 'PANDEMIC_HEALTH', icon: '\uD83C\uDFE5', label: 'HEALTH' },
  { key: 'ELECTION', icon: '\uD83D\uDDF3\uFE0F', label: 'ELECTION' },
  { key: 'ENERGY_COMMODITIES', icon: '\u26FD', label: 'ENERGY' },
  { key: 'CRYPTO_MARKET', icon: '\u20BF', label: 'CRYPTO' },
];

const SOURCES = [
  'rss', 'gdelt', 'government', 'conflict_monitor', 'youtube_live',
  'reddit', 'acled', 'cyber_threats', 'sanctions_trade', 'shodan',
  'earthquake', 'weather', 'fire', 'nuclear', 'polymarket', 'opensky', 'aisstream',
];

export function FeedFilters() {
  const { filters, setFilter, fetchEvents, countries } = useEventStore();
  const [expanded, setExpanded] = useState(false);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  const apply = (key: string, value: unknown) => {
    setFilter(key, value);
    setTimeout(fetchEvents, 50);
  };

  const activeCount = [
    filters.category,
    filters.minSeverity > 0,
    filters.source,
    filters.country,
    filters.hours !== 48,
  ].filter(Boolean).length;

  const clearAll = () => {
    setFilter('category', undefined);
    setFilter('minSeverity', 0);
    setFilter('source', undefined);
    setFilter('country', undefined);
    setFilter('hours', 48);
    setTimeout(fetchEvents, 50);
  };

  const filteredCountries = countries.filter(c =>
    c.toLowerCase().includes(countrySearch.toLowerCase())
  );

  return (
    <div className="px-4 pb-2 space-y-2">
      {/* Top bar: Severity pills + Time range + Expand toggle */}
      <div className="flex items-center gap-2">
        {/* Severity quick filters */}
        <div className="flex gap-1">
          {SEVERITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => apply('minSeverity', opt.value)}
              className={clsx(
                'px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all',
                filters.minSeverity === opt.value
                  ? `${opt.color} bg-white/[0.08] border border-current/30`
                  : 'text-slate-600 hover:text-slate-400'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-white/[0.06]" />

        {/* Time range */}
        <div className="flex gap-1">
          {TIME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => apply('hours', opt.value)}
              className={clsx(
                'px-1.5 py-0.5 rounded text-[9px] font-mono transition-all',
                filters.hours === opt.value
                  ? 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/20'
                  : 'text-slate-600 hover:text-slate-400'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Active filter count + expand toggle */}
        {activeCount > 0 && (
          <button onClick={clearAll} className="text-[9px] font-mono text-red-400/60 hover:text-red-400 flex items-center gap-1">
            <X size={10} /> CLEAR
          </button>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className={clsx(
            'flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono transition-all',
            expanded ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-500 hover:text-slate-300'
          )}
        >
          <Filter size={10} />
          {activeCount > 0 && (
            <span className="w-3.5 h-3.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[8px] flex items-center justify-center font-bold">
              {activeCount}
            </span>
          )}
          <ChevronDown size={10} className={clsx('transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>

      {/* Expanded filters panel */}
      {expanded && (
        <div className="space-y-2.5 pt-1 animate-slide-in">
          {/* Location filter */}
          <div className="relative">
            <div className="flex items-center gap-1.5 mb-1">
              <MapPin size={10} className="text-slate-500" />
              <span className="text-[8px] font-mono text-slate-500 tracking-widest">LOCATION</span>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                className={clsx(
                  'w-full text-left px-2.5 py-1.5 rounded-md text-[10px] font-mono border transition-all',
                  filters.country
                    ? 'text-cyan-400 bg-cyan-500/[0.06] border-cyan-500/20'
                    : 'text-slate-500 bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]'
                )}
              >
                {filters.country || 'All locations'}
                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600" />
              </button>
              {showCountryDropdown && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-[#0d1117] border border-white/[0.08] rounded-lg shadow-2xl max-h-48 overflow-hidden">
                  <div className="p-1.5 border-b border-white/[0.04]">
                    <input
                      type="text"
                      placeholder="Search country..."
                      value={countrySearch}
                      onChange={e => setCountrySearch(e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-[10px] font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/30"
                      autoFocus
                    />
                  </div>
                  <div className="overflow-y-auto max-h-36">
                    <button
                      onClick={() => { apply('country', undefined); setShowCountryDropdown(false); setCountrySearch(''); }}
                      className="w-full text-left px-3 py-1.5 text-[10px] font-mono text-slate-400 hover:bg-white/[0.04] transition-colors"
                    >
                      All locations
                    </button>
                    {filteredCountries.map(c => (
                      <button
                        key={c}
                        onClick={() => { apply('country', c); setShowCountryDropdown(false); setCountrySearch(''); }}
                        className={clsx(
                          'w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-white/[0.04] transition-colors',
                          filters.country === c ? 'text-cyan-400' : 'text-slate-300'
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Category filter */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Shield size={10} className="text-slate-500" />
              <span className="text-[8px] font-mono text-slate-500 tracking-widest">CATEGORY</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => apply('category', undefined)}
                className={clsx(
                  'px-2 py-0.5 rounded text-[9px] font-mono transition-all',
                  !filters.category
                    ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                    : 'text-slate-600 hover:text-slate-400 border border-transparent'
                )}
              >
                ALL
              </button>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => apply('category', cat.key)}
                  className={clsx(
                    'px-1.5 py-0.5 rounded text-[9px] font-mono transition-all flex items-center gap-1',
                    filters.category === cat.key
                      ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                      : 'text-slate-600 hover:text-slate-400 border border-transparent'
                  )}
                >
                  <span className="text-[10px]">{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Source filter */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Radio size={10} className="text-slate-500" />
              <span className="text-[8px] font-mono text-slate-500 tracking-widest">SOURCE</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => apply('source', undefined)}
                className={clsx(
                  'px-2 py-0.5 rounded text-[9px] font-mono transition-all',
                  !filters.source
                    ? 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/20'
                    : 'text-slate-600 hover:text-slate-400 border border-transparent'
                )}
              >
                ALL
              </button>
              {SOURCES.map(src => (
                <button
                  key={src}
                  onClick={() => apply('source', src)}
                  className={clsx(
                    'px-1.5 py-0.5 rounded text-[9px] font-mono transition-all',
                    filters.source === src
                      ? 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/20'
                      : 'text-slate-600 hover:text-slate-400 border border-transparent'
                  )}
                >
                  {src}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
