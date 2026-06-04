import { useState, useEffect } from 'react';
import { PriceChart } from './PriceChart';
import { OrderForm } from './OrderForm';
import type { Market } from '@/types/market';
import api from '@/services/api';
import { clsx } from 'clsx';
import {
  X, TrendingUp, TrendingDown, BarChart3, Clock,
  ExternalLink, Droplets, ArrowLeftRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function MarketDetail({
  marketId,
  onClose,
  defaultOutcome,
  defaultPrice,
}: {
  marketId: number;
  onClose: () => void;
  defaultOutcome?: 'YES' | 'NO';
  defaultPrice?: number;
}) {
  const [market, setMarket] = useState<Market | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
    api.get(`/markets/${marketId}`)
      .then(({ data }) => setMarket(data))
      .catch(() => setError(true));
  }, [marketId]);

  if (error) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-32 gap-2">
        <span className="text-[11px] font-mono text-slate-500">Failed to load market</span>
        <button onClick={onClose} className="text-[10px] font-mono text-cyan-500 hover:text-cyan-300 transition-colors">CLOSE</button>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="p-4 flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  const priceYes = market.price_yes;
  const priceNo = market.price_no;
  const isLikely = (priceYes ?? 0) > 0.5;

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <span className="text-[10px] font-mono text-cyan-400 tracking-[2px]">MARKET DETAIL</span>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
          <X size={14} />
        </button>
      </div>

      {/* Question */}
      <h2 className="text-sm text-white leading-snug mb-3">{market.question}</h2>

      {market.description && (
        <p className="text-[11px] text-slate-400 leading-relaxed mb-4 line-clamp-3">{market.description}</p>
      )}

      {/* Tags */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {market.category && (
          <span className="text-[8px] font-mono font-bold tracking-widest text-accent-blue px-1.5 py-0.5 rounded bg-accent-blue/10">
            {market.category}
          </span>
        )}
        {market.tags?.map((tag) => (
          <span key={tag} className="text-[8px] font-mono text-slate-500 px-1.5 py-0.5 rounded bg-white/[0.03]">
            {tag}
          </span>
        ))}
      </div>

      {/* Price display */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className={clsx('glass-bar text-center', isLikely && 'border-emerald-500/20')}>
          <div className="text-[8px] font-mono text-slate-500 tracking-wider mb-1">YES</div>
          <div className={clsx('text-2xl font-mono font-bold tabular-nums', isLikely ? 'text-emerald-400' : 'text-slate-300')}>
            {priceYes != null ? `${(priceYes * 100).toFixed(1)}` : '--'}
            <span className="text-sm text-slate-500">c</span>
          </div>
          {isLikely && (
            <div className="flex items-center justify-center gap-1 mt-1">
              <TrendingUp size={9} className="text-emerald-400" />
              <span className="text-[8px] font-mono text-emerald-400">LIKELY</span>
            </div>
          )}
        </div>
        <div className={clsx('glass-bar text-center', !isLikely && 'border-red-500/20')}>
          <div className="text-[8px] font-mono text-slate-500 tracking-wider mb-1">NO</div>
          <div className={clsx('text-2xl font-mono font-bold tabular-nums', !isLikely ? 'text-red-400' : 'text-slate-300')}>
            {priceNo != null ? `${(priceNo * 100).toFixed(1)}` : '--'}
            <span className="text-sm text-slate-500">c</span>
          </div>
          {!isLikely && (
            <div className="flex items-center justify-center gap-1 mt-1">
              <TrendingDown size={9} className="text-red-400" />
              <span className="text-[8px] font-mono text-red-400">UNLIKELY</span>
            </div>
          )}
        </div>
      </div>

      {/* Price chart */}
      <div className="glass-bar mb-4">
        <div className="text-[9px] font-mono text-slate-500 tracking-wider mb-2">PRICE HISTORY</div>
        <PriceChart marketId={marketId} />
      </div>

      {/* Stats */}
      <div className="detail-grid mb-4">
        <div className="text-center">
          <div className="text-[8px] font-mono text-slate-500 tracking-wider">VOLUME 24H</div>
          <div className="text-sm font-mono font-bold text-white flex items-center justify-center gap-1">
            <BarChart3 size={10} className="text-accent-blue" />
            {market.volume_24h != null
              ? market.volume_24h >= 1000 ? `$${(market.volume_24h / 1000).toFixed(1)}K` : `$${market.volume_24h.toFixed(0)}`
              : '--'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[8px] font-mono text-slate-500 tracking-wider">LIQUIDITY</div>
          <div className="text-sm font-mono font-bold text-white flex items-center justify-center gap-1">
            <Droplets size={10} className="text-accent-cyan" />
            {market.liquidity != null
              ? market.liquidity >= 1000 ? `$${(market.liquidity / 1000).toFixed(0)}K` : `$${market.liquidity.toFixed(0)}`
              : '--'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[8px] font-mono text-slate-500 tracking-wider">SPREAD</div>
          <div className={clsx('text-sm font-mono font-bold flex items-center justify-center gap-1',
            market.spread && market.spread < 0.03 ? 'text-emerald-400' : 'text-amber-400'
          )}>
            <ArrowLeftRight size={10} />
            {market.spread != null ? `${(market.spread * 100).toFixed(1)}%` : '--'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[8px] font-mono text-slate-500 tracking-wider">EXPIRES</div>
          <div className="text-sm font-mono font-bold text-white flex items-center justify-center gap-1">
            <Clock size={10} className="text-slate-400" />
            {market.end_date
              ? (() => { try { return formatDistanceToNow(new Date(market.end_date)); } catch { return '?'; } })()
              : 'N/A'}
          </div>
        </div>
      </div>

      {/* Outcomes */}
      {market.outcomes && (
        <div className="glass-bar mb-4">
          <div className="text-[9px] font-mono text-slate-500 tracking-wider mb-2">OUTCOMES</div>
          <div className="space-y-1">
            {(market.outcomes.outcomes || []).map((outcome: string, i: number) => {
              const price = market.outcomes?.prices?.[i];
              return (
                <div key={outcome} className="flex items-center justify-between py-1">
                  <span className="text-[11px] text-slate-300">{outcome}</span>
                  {price != null && (
                    <span className="text-[11px] font-mono font-bold text-white tabular-nums">
                      {(price * 100).toFixed(0)}c
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Order Form */}
      {market.condition_id && market.active && (
        <div className="mb-4">
          <OrderForm
            conditionId={market.condition_id}
            marketQuestion={market.question}
            currentPriceYes={market.price_yes}
            currentPriceNo={market.price_no}
            defaultOutcome={defaultOutcome}
            defaultPrice={defaultPrice}
          />
        </div>
      )}

      {/* External link */}
      {market.condition_id && (
        <a
          href={`https://polymarket.com/event/${market.condition_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[10px] font-mono text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all"
        >
          <ExternalLink size={10} />
          VIEW ON POLYMARKET
        </a>
      )}
    </div>
  );
}
