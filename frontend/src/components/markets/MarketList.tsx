import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMarkets } from '@/hooks/useMarkets';
import { useMarketStore } from '@/stores/marketStore';
import { MarketCard } from './MarketCard';
import { MarketDetail } from './MarketDetail';
import { Spinner } from '@/components/shared/Spinner';
import type { Market } from '@/types/market';
import { clsx } from 'clsx';
import {
  Search, BarChart3, TrendingUp, Filter, ArrowUpDown, Zap,
} from 'lucide-react';

type SortKey = 'volume' | 'price' | 'spread' | 'recent';
type CategoryFilter = 'all' | string;

export function MarketList() {
  const { markets, loading, fetchMarkets } = useMarkets();
  const marketError = useMarketStore((s) => s.error);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('volume');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [signalOutcome, setSignalOutcome] = useState<'YES' | 'NO' | undefined>();
  const [signalPrice, setSignalPrice] = useState<number | undefined>();

  // Handle deep-link from signals page: /markets?signal=marketId&outcome=YES&price=65
  useEffect(() => {
    const signalMarketId = searchParams.get('signal');
    const outcome = searchParams.get('outcome') as 'YES' | 'NO' | null;
    const price = searchParams.get('price');
    if (signalMarketId && markets.length > 0) {
      const market = markets.find(m => String(m.id) === signalMarketId);
      if (market) {
        setSelectedMarket(market);
        if (outcome) setSignalOutcome(outcome);
        if (price) setSignalPrice(Number(price) / 100); // convert cents to decimal
        // Clear URL params after consuming them
        setSearchParams({}, { replace: true });
      }
    }
  }, [markets, searchParams, setSearchParams]);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (value.length > 2 || value.length === 0) {
      fetchMarkets(value || undefined);
    }
  };

  const categories = useMemo(() => {
    const cats = new Set(markets.map(m => m.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [markets]);

  const sorted = useMemo(() => {
    let filtered = categoryFilter === 'all'
      ? markets
      : markets.filter(m => m.category === categoryFilter);

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'volume': return (b.volume_24h || 0) - (a.volume_24h || 0);
        case 'price': return (b.price_yes || 0) - (a.price_yes || 0);
        case 'spread': return (a.spread || 999) - (b.spread || 999);
        case 'recent': return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
        default: return 0;
      }
    });
  }, [markets, sortBy, categoryFilter]);

  const stats = useMemo(() => {
    const totalVol = markets.reduce((s, m) => s + (m.volume_24h || 0), 0);
    const avgPrice = markets.length > 0
      ? markets.reduce((s, m) => s + (m.price_yes || 0), 0) / markets.length
      : 0;
    return { total: markets.length, totalVol, avgPrice };
  }, [markets]);

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'volume', label: 'VOLUME' },
    { key: 'price', label: 'PRICE' },
    { key: 'spread', label: 'SPREAD' },
    { key: 'recent', label: 'RECENT' },
  ];

  return (
    <div className="h-full flex">
      {/* Main list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-sonar-border/30 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-cyan-400" />
              <h1 className="text-sm font-mono font-bold text-white tracking-[2px]">MARKETS</h1>
              <span className="text-[9px] font-mono text-slate-600 tabular-nums">{stats.total} ACTIVE</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-mono text-slate-500">
                VOL: <span className="text-white font-bold">
                  ${stats.totalVol >= 1_000_000 ? `${(stats.totalVol / 1_000_000).toFixed(1)}M` : `${(stats.totalVol / 1_000).toFixed(0)}K`}
                </span>
              </span>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search markets..."
              className="w-full bg-sonar-bg border border-sonar-border/40 rounded-lg pl-8 pr-4 py-1.5 text-[11px] text-white placeholder-slate-600 focus:border-cyan-500/40 focus:outline-none font-mono"
            />
          </div>

          {/* Filters row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Category filter */}
            <div className="flex items-center gap-1">
              <Filter size={10} className="text-slate-600" />
              <button
                onClick={() => setCategoryFilter('all')}
                className={clsx(
                  'text-[9px] font-mono px-2 py-1 rounded-md transition-all',
                  categoryFilter === 'all' ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-500 hover:text-slate-300'
                )}
              >
                ALL
              </button>
              {categories.slice(0, 6).map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={clsx(
                    'text-[9px] font-mono px-2 py-1 rounded-md transition-all',
                    categoryFilter === cat ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-500 hover:text-slate-300'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="w-px h-4 bg-sonar-border/30 mx-1" />

            {/* Sort */}
            <div className="flex items-center gap-1">
              <ArrowUpDown size={10} className="text-slate-600" />
              {sortOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSortBy(opt.key)}
                  className={clsx(
                    'text-[9px] font-mono px-2 py-1 rounded-md transition-all',
                    sortBy === opt.key ? 'text-white bg-white/[0.06]' : 'text-slate-600 hover:text-slate-400'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Top movers stripe */}
        {!search && (
          <TopMoversStripe
            markets={markets}
            onSelect={setSelectedMarket}
          />
        )}

        {/* Market grid */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && markets.length === 0 ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : marketError && markets.length === 0 ? (
            <div className="text-center py-16">
              <BarChart3 size={32} className="text-red-500/40 mx-auto mb-3" />
              <p className="text-sm font-mono text-red-400 mb-2">Failed to load markets</p>
              <p className="text-[9px] font-mono text-slate-600 mb-4">{marketError}</p>
              <button onClick={() => fetchMarkets()} className="text-[10px] font-mono text-cyan-400 border border-cyan-500/30 px-4 py-1.5 hover:bg-cyan-500/10 transition-colors">
                RETRY
              </button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-16">
              <BarChart3 size={32} className="text-slate-700 mx-auto mb-3" />
              <p className="text-sm font-mono text-slate-500">No markets found.</p>
              <button onClick={() => fetchMarkets()} className="mt-3 text-[10px] font-mono text-cyan-400 border border-cyan-500/30 px-4 py-1.5 hover:bg-cyan-500/10 transition-colors">
                RELOAD
              </button>
            </div>
          ) : (
            sorted.map((market) => (
              <MarketCard key={market.id} market={market} onClick={setSelectedMarket} />
            ))
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedMarket && (
        <div className="w-[420px] border-l border-sonar-border/40 bg-[#0d1117]/80 overflow-y-auto hidden lg:block animate-slide-in">
          <MarketDetail
            marketId={selectedMarket.id}
            onClose={() => { setSelectedMarket(null); setSignalOutcome(undefined); setSignalPrice(undefined); }}
            defaultOutcome={signalOutcome}
            defaultPrice={signalPrice}
          />
        </div>
      )}
    </div>
  );
}

function TopMoversStripe({
  markets,
  onSelect,
}: {
  markets: Market[];
  onSelect: (m: Market) => void;
}) {
  const movers = useMemo(() => {
    return [...markets]
      .filter(m => m.volume_24h && m.volume_24h > 0)
      .sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0))
      .slice(0, 8);
  }, [markets]);

  if (movers.length === 0) return null;

  return (
    <div className="px-4 py-2 border-b border-sonar-border/20 shrink-0 overflow-x-auto">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Zap size={9} className="text-amber-400" />
        <span className="text-[8px] font-mono text-amber-400/70 tracking-[2px]">TOP VOLUME</span>
      </div>
      <div className="flex items-center gap-2">
        {movers.map(m => (
          <button
            key={m.id}
            onClick={() => onSelect(m)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-all shrink-0"
          >
            <span className={clsx(
              'text-xs font-mono font-bold tabular-nums',
              (m.price_yes ?? 0) > 0.5 ? 'text-emerald-400' : 'text-red-400'
            )}>
              {m.price_yes != null ? `${(m.price_yes * 100).toFixed(0)}%` : '?'}
            </span>
            <span className="text-[10px] text-slate-400 max-w-[120px] truncate">{m.question}</span>
            <span className="text-[8px] font-mono text-slate-600">
              {m.volume_24h ? `$${(m.volume_24h / 1000).toFixed(0)}K` : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
