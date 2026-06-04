import { memo, useMemo } from 'react';
import type { Signal } from '@/types/signal';
import { clsx } from 'clsx';
import {
  TrendingUp, TrendingDown, Clock, Zap, Target,
  AlertTriangle, ChevronRight, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const SIGNAL_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  STRONG_MISPRICING: { label: 'STRONG', color: '#22d3ee' },
  MODERATE_MISPRICING: { label: 'MODERATE', color: '#a855f7' },
  HIGH_CONFIDENCE: { label: 'HI-CONF', color: '#10b981' },
  EDGE_DETECTED: { label: 'EDGE', color: '#f59e0b' },
  RULE_BASED_EDGE: { label: 'RULE', color: '#f59e0b' },
};

const SENSITIVITY_CONFIG: Record<string, { label: string; color: string; urgent: boolean }> = {
  urgent: { label: 'URGENT', color: '#ef4444', urgent: true },
  high: { label: 'HIGH', color: '#f97316', urgent: false },
  normal: { label: 'NORMAL', color: '#64748b', urgent: false },
};

function ConfidenceRing({ value, size = 36, color }: { value: number; size?: number; color: string }) {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - value * circumference;

  return (
    <div className="confidence-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e293b" strokeWidth={2.5} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={2.5}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[9px] font-mono font-bold tabular-nums" style={{ color }}>
          {(value * 100).toFixed(0)}
        </span>
      </div>
    </div>
  );
}

export const SignalCard = memo(function SignalCard({
  signal,
  compact = false,
  onClick,
  onBet,
}: {
  signal: Signal;
  compact?: boolean;
  onClick?: (signal: Signal) => void;
  onBet?: (marketId: number, outcome: 'YES' | 'NO', price: number) => void;
}) {
  const isUp = signal.direction === 'BUY_YES';
  const dirColor = isUp ? '#10b981' : '#ef4444';
  const typeConfig = SIGNAL_TYPE_LABELS[signal.signal_type] || { label: signal.signal_type, color: '#64748b' };
  const sensitivity = SENSITIVITY_CONFIG[signal.time_sensitivity || 'normal'] || SENSITIVITY_CONFIG.normal;

  const edgeDisplay = signal.edge_pct ? `${signal.edge_pct > 0 ? '+' : ''}${signal.edge_pct.toFixed(1)}%` : '--';
  const priceDisplay = signal.current_price != null ? `${(signal.current_price * 100).toFixed(0)}c` : '--';
  const fairValueDisplay = signal.estimated_fair_value != null ? `${(signal.estimated_fair_value * 100).toFixed(0)}c` : '--';
  const confValue = signal.confidence || 0;

  const timeAgo = useMemo(() => {
    try { return formatDistanceToNow(new Date(signal.created_at), { addSuffix: true }); }
    catch { return ''; }
  }, [signal.created_at]);

  if (compact) {
    return (
      <div
        onClick={() => onClick?.(signal)}
        className={clsx(
          'signal-card p-3 group',
          isUp ? 'signal-card--buy' : 'signal-card--sell',
          sensitivity.urgent && 'signal-card--urgent',
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${dirColor}12` }}
          >
            {isUp ? <ArrowUpRight size={16} style={{ color: dirColor }} /> : <ArrowDownRight size={16} style={{ color: dirColor }} />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[8px] font-mono font-bold tracking-widest px-1.5 py-0.5 rounded"
                style={{ color: typeConfig.color, background: `${typeConfig.color}15` }}
              >
                {typeConfig.label}
              </span>
              <span className="text-[8px] font-mono font-bold tracking-wider" style={{ color: dirColor }}>
                {signal.direction}
              </span>
            </div>
            {signal.reasoning && (
              <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">{signal.reasoning}</p>
            )}
          </div>

          <div className="text-right shrink-0">
            <div className={clsx('text-sm font-mono font-bold', isUp ? 'text-emerald-400' : 'text-red-400')}>
              {edgeDisplay}
            </div>
            <div className="text-[8px] font-mono text-slate-500">EDGE</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onClick?.(signal)}
      className={clsx(
        'signal-card p-4 group',
        isUp ? 'signal-card--buy' : 'signal-card--sell',
        sensitivity.urgent && 'signal-card--urgent',
      )}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-mono font-bold tracking-widest px-2 py-0.5 rounded-md"
            style={{ color: typeConfig.color, background: `${typeConfig.color}15`, border: `1px solid ${typeConfig.color}25` }}
          >
            {typeConfig.label}
          </span>
          {sensitivity.urgent && (
            <span className="flex items-center gap-1 text-[8px] font-mono font-bold text-red-400">
              <AlertTriangle size={9} /> URGENT
            </span>
          )}
          {!sensitivity.urgent && signal.time_sensitivity === 'high' && (
            <span className="flex items-center gap-1 text-[8px] font-mono text-orange-400">
              <Clock size={8} /> TIME-SENSITIVE
            </span>
          )}
        </div>
        <span className="text-[8px] font-mono text-slate-600 flex items-center gap-1">
          <Clock size={8} /> {timeAgo}
        </span>
      </div>

      {/* Main content */}
      <div className="flex items-start gap-4">
        {/* Direction */}
        <div className="flex flex-col items-center gap-1">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: `${dirColor}10`, border: `1px solid ${dirColor}20` }}
          >
            {isUp ? <TrendingUp size={20} style={{ color: dirColor }} /> : <TrendingDown size={20} style={{ color: dirColor }} />}
          </div>
          <span className="text-[8px] font-mono font-bold tracking-wider" style={{ color: dirColor }}>
            {isUp ? 'BUY YES' : 'BUY NO'}
          </span>
        </div>

        {/* Center */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className={clsx('text-2xl font-mono font-bold tabular-nums', isUp ? 'text-emerald-400' : 'text-red-400')}>
              {edgeDisplay}
            </span>
            <span className="text-[8px] font-mono text-slate-500 tracking-wider">EXPECTED EDGE</span>
          </div>

          {signal.reasoning && (
            <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2 mb-2">{signal.reasoning}</p>
          )}

          <div className="flex items-center gap-3">
            <div className="data-cell flex-1">
              <span className="data-cell__label">PRICE</span>
              <span className="data-cell__value text-xs">{priceDisplay}</span>
            </div>
            <div className="data-cell flex-1">
              <span className="data-cell__label">FAIR VALUE</span>
              <span className="data-cell__value text-xs" style={{ color: dirColor }}>{fairValueDisplay}</span>
            </div>
            <div className="data-cell flex-1">
              <span className="data-cell__label">STATUS</span>
              <span className={clsx('text-[10px] font-mono font-bold', signal.status === 'active' ? 'text-emerald-400' : 'text-slate-500')}>
                {String(signal.status || '').toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Confidence ring */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <ConfidenceRing value={confValue} size={44} color={dirColor} />
          <span className="text-[7px] font-mono text-slate-500 tracking-wider">CONF</span>
        </div>
      </div>

      {/* Bottom */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/[0.04]">
        <div className="flex items-center gap-3">
          {signal.event_id && (
            <span className="text-[8px] font-mono text-slate-600 flex items-center gap-1">
              <Zap size={8} /> EVENT #{signal.event_id}
            </span>
          )}
          {signal.market_id && (
            <span className="text-[8px] font-mono text-slate-600 flex items-center gap-1">
              <Target size={8} /> MARKET #{signal.market_id}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {signal.market_id && onBet && signal.status === 'active' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const outcome = signal.direction === 'BUY_YES' ? 'YES' : 'NO';
                onBet(signal.market_id!, outcome as 'YES' | 'NO', signal.current_price ?? 0.5);
              }}
              className={clsx(
                'text-[9px] font-mono font-bold tracking-wider px-3 py-1 rounded transition-all flex items-center gap-1',
                isUp
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25'
                  : 'bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25'
              )}
            >
              <Target size={8} /> BET
            </button>
          )}
          <span className="text-[8px] font-mono text-slate-600 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            DETAILS <ChevronRight size={8} />
          </span>
        </div>
      </div>
    </div>
  );
});
