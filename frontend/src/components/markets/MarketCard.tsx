import { memo, useMemo } from 'react';
import type { Market } from '@/types/market';
import { clsx } from 'clsx';
import { TrendingUp, TrendingDown, BarChart3, Clock, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

function PriceGauge({ price, size = 52 }: { price: number; size?: number }) {
  const pct = price * 100;
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (price * circumference);
  const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1a1f2e" strokeWidth={3} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={3}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-mono font-bold tabular-nums" style={{ color }}>
          {pct.toFixed(0)}
        </span>
      </div>
    </div>
  );
}

export const MarketCard = memo(function MarketCard({
  market,
  compact = false,
  onClick,
}: {
  market: Market;
  compact?: boolean;
  onClick?: (market: Market) => void;
}) {
  const priceYes = market.price_yes;
  const volume = market.volume_24h;
  const volumeDisplay = volume != null
    ? volume >= 1_000_000 ? `$${(volume / 1_000_000).toFixed(1)}M`
    : volume >= 1_000 ? `$${(volume / 1_000).toFixed(1)}K`
    : `$${volume.toFixed(0)}`
    : '--';

  const timeAgo = useMemo(() => {
    if (!market.updated_at) return '';
    try { return formatDistanceToNow(new Date(market.updated_at), { addSuffix: true }); }
    catch { return ''; }
  }, [market.updated_at]);

  const isHigh = (priceYes ?? 0) > 0.7;
  const isLow = (priceYes ?? 1) < 0.3;

  if (compact) {
    return (
      <div onClick={() => onClick?.(market)} className="market-card p-3 group">
        <div className="flex items-center gap-3">
          {priceYes != null && <PriceGauge price={priceYes} size={36} />}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-slate-200 line-clamp-1 leading-snug">{market.question}</p>
            <div className="flex items-center gap-2 mt-1">
              {market.category && (
                <span className="text-[8px] font-mono text-accent-blue tracking-wider">{market.category}</span>
              )}
              <span className="text-[8px] font-mono text-slate-600">{volumeDisplay}</span>
            </div>
          </div>
          <ArrowRight size={12} className="text-slate-700 group-hover:text-slate-400 transition-colors shrink-0" />
        </div>
      </div>
    );
  }

  return (
    <div onClick={() => onClick?.(market)} className="market-card p-4 group">
      <div className="flex items-start gap-4">
        {priceYes != null && <PriceGauge price={priceYes} size={56} />}

        <div className="flex-1 min-w-0">
          <p className="text-sm text-white leading-snug line-clamp-2 mb-2">{market.question}</p>

          <div className="flex items-center gap-2 flex-wrap mb-3">
            {market.category && (
              <span className="text-[8px] font-mono font-bold tracking-widest text-accent-blue px-1.5 py-0.5 rounded bg-accent-blue/10">
                {market.category}
              </span>
            )}
            {market.tags?.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[8px] font-mono text-slate-500 px-1.5 py-0.5 rounded bg-white/[0.03]">
                {tag}
              </span>
            ))}
            {isHigh && (
              <span className="text-[8px] font-mono font-bold text-emerald-400 flex items-center gap-0.5">
                <TrendingUp size={8} /> LIKELY
              </span>
            )}
            {isLow && (
              <span className="text-[8px] font-mono font-bold text-red-400 flex items-center gap-0.5">
                <TrendingDown size={8} /> UNLIKELY
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div>
              <span className="text-[8px] font-mono text-slate-600 block">VOL 24H</span>
              <span className="text-xs font-mono font-bold text-white flex items-center gap-1">
                <BarChart3 size={10} className="text-accent-blue" />
                {volumeDisplay}
              </span>
            </div>
            {market.liquidity != null && (
              <div>
                <span className="text-[8px] font-mono text-slate-600 block">LIQUIDITY</span>
                <span className="text-xs font-mono font-bold text-white">
                  ${market.liquidity >= 1000 ? `${(market.liquidity / 1000).toFixed(0)}K` : market.liquidity.toFixed(0)}
                </span>
              </div>
            )}
            {market.spread != null && (
              <div>
                <span className="text-[8px] font-mono text-slate-600 block">SPREAD</span>
                <span className={clsx('text-xs font-mono font-bold', market.spread < 0.03 ? 'text-emerald-400' : 'text-amber-400')}>
                  {(market.spread * 100).toFixed(1)}%
                </span>
              </div>
            )}
            {market.end_date && (
              <div>
                <span className="text-[8px] font-mono text-slate-600 block">EXPIRES</span>
                <span className="text-xs font-mono text-slate-300 flex items-center gap-1">
                  <Clock size={9} />
                  {(() => { try { return formatDistanceToNow(new Date(market.end_date)); } catch { return '?'; } })()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {timeAgo && (
        <div className="mt-3 pt-2 border-t border-white/[0.04] flex items-center justify-between">
          <span className="text-[8px] font-mono text-slate-600">Updated {timeAgo}</span>
          <span className="text-[8px] font-mono text-slate-600 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            VIEW MARKET <ArrowRight size={8} />
          </span>
        </div>
      )}
    </div>
  );
});
