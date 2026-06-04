import { useState, useMemo } from 'react';
import { useTradingStore } from '@/stores/tradingStore';
import { clsx } from 'clsx';
import { DollarSign, AlertTriangle, Check, Loader2 } from 'lucide-react';

interface OrderFormProps {
  conditionId: string;
  marketQuestion: string;
  currentPriceYes?: number;
  currentPriceNo?: number;
  defaultOutcome?: 'YES' | 'NO';
  defaultPrice?: number;
  defaultSide?: 'BUY' | 'SELL';
}

export function OrderForm({
  conditionId,
  marketQuestion,
  currentPriceYes,
  currentPriceNo,
  defaultOutcome = 'YES',
  defaultPrice,
  defaultSide = 'BUY',
}: OrderFormProps) {
  const { placeOrder, loading } = useTradingStore();
  const [side, setSide] = useState<'BUY' | 'SELL'>(defaultSide);
  const [outcome, setOutcome] = useState<'YES' | 'NO'>(defaultOutcome);
  const [price, setPrice] = useState(defaultPrice ?? (outcome === 'YES' ? currentPriceYes ?? 0.5 : currentPriceNo ?? 0.5));
  const [size, setSize] = useState(10);
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<{ status: string; error?: string } | null>(null);

  const currentMarketPrice = outcome === 'YES' ? currentPriceYes : currentPriceNo;

  const calculations = useMemo(() => {
    const totalCost = price * size;
    const potentialPayout = size; // each share pays $1 if correct
    const potentialProfit = potentialPayout - totalCost;
    const impliedProb = price * 100;
    const roi = totalCost > 0 ? (potentialProfit / totalCost) * 100 : 0;
    return { totalCost, potentialPayout, potentialProfit, impliedProb, roi };
  }, [price, size]);

  const handleSubmit = async () => {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    setResult(null);
    try {
      const order = await placeOrder({
        condition_id: conditionId,
        side,
        outcome,
        price,
        size,
      });
      setResult({ status: order.status });
      setShowConfirm(false);
      if (order.status === 'filled') {
        setTimeout(() => setResult(null), 5000);
      }
    } catch (err) {
      setResult({ status: 'failed', error: (err as Error).message || 'Order failed' });
      setShowConfirm(false);
    }
  };

  return (
    <div className="glass-bar">
      <div className="text-[9px] font-mono text-cyan-400 tracking-[2px] mb-3">PLACE ORDER</div>

      {/* BUY / SELL toggle */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <button
          onClick={() => setSide('BUY')}
          className={clsx(
            'py-1.5 rounded text-[10px] font-mono font-bold tracking-wider transition-all',
            side === 'BUY'
              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
              : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'
          )}
        >
          BUY
        </button>
        <button
          onClick={() => setSide('SELL')}
          className={clsx(
            'py-1.5 rounded text-[10px] font-mono font-bold tracking-wider transition-all',
            side === 'SELL'
              ? 'bg-red-500/20 border border-red-500/40 text-red-400'
              : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'
          )}
        >
          SELL
        </button>
      </div>

      {/* Outcome toggle */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={() => { setOutcome('YES'); setPrice(currentPriceYes ?? 0.5); }}
          className={clsx(
            'py-2 rounded text-[11px] font-mono font-bold tracking-wider transition-all',
            outcome === 'YES'
              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
              : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'
          )}
        >
          {side} YES
        </button>
        <button
          onClick={() => { setOutcome('NO'); setPrice(currentPriceNo ?? 0.5); }}
          className={clsx(
            'py-2 rounded text-[11px] font-mono font-bold tracking-wider transition-all',
            outcome === 'NO'
              ? 'bg-red-500/20 border border-red-500/40 text-red-400'
              : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'
          )}
        >
          {side} NO
        </button>
      </div>

      {/* Price input */}
      <div className="mb-3">
        <label className="text-[8px] font-mono text-slate-500 tracking-wider block mb-1">
          PRICE (USDC) — {(price * 100).toFixed(0)}c
        </label>
        <input
          type="range"
          min="0.01"
          max="0.99"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(parseFloat(e.target.value))}
          className="w-full h-1 bg-white/[0.06] rounded-full appearance-none cursor-pointer accent-cyan-500"
        />
        <div className="flex justify-between text-[7px] font-mono text-slate-600 mt-0.5">
          <span>1c</span>
          <span>
            {currentMarketPrice ? `Market: ${(currentMarketPrice * 100).toFixed(0)}c` : ''}
          </span>
          <span>99c</span>
        </div>
      </div>

      {/* Size input */}
      <div className="mb-3">
        <label className="text-[8px] font-mono text-slate-500 tracking-wider block mb-1">
          AMOUNT (SHARES)
        </label>
        <div className="relative">
          <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="number"
            min="1"
            max="10000"
            value={size}
            onChange={(e) => setSize(Math.max(1, parseFloat(e.target.value) || 1))}
            className="w-full pl-6 pr-3 py-1.5 bg-white/[0.03] border border-white/[0.08] rounded text-[11px] font-mono text-white focus:outline-none focus:border-cyan-500/30"
          />
        </div>
        <div className="flex gap-1 mt-1">
          {[10, 25, 50, 100].map(v => (
            <button
              key={v}
              onClick={() => setSize(v)}
              className={clsx(
                'text-[8px] font-mono px-2 py-0.5 rounded transition-all',
                size === v ? 'bg-cyan-500/15 text-cyan-400' : 'bg-white/[0.03] text-slate-600 hover:text-slate-400'
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Calculations */}
      <div className="bg-white/[0.02] rounded-lg p-2.5 mb-3 space-y-1.5">
        <div className="flex justify-between text-[9px] font-mono">
          <span className="text-slate-500">Total Cost</span>
          <span className="text-white tabular-nums">${calculations.totalCost.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-[9px] font-mono">
          <span className="text-slate-500">Potential Payout</span>
          <span className="text-emerald-400 tabular-nums">${calculations.potentialPayout.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-[9px] font-mono">
          <span className="text-slate-500">Potential Profit</span>
          <span className="text-emerald-400 tabular-nums">
            +${calculations.potentialProfit.toFixed(2)} ({calculations.roi.toFixed(0)}%)
          </span>
        </div>
        <div className="flex justify-between text-[9px] font-mono">
          <span className="text-slate-500">Implied Probability</span>
          <span className="text-cyan-400 tabular-nums">{calculations.impliedProb.toFixed(0)}%</span>
        </div>
      </div>

      {/* Submit button */}
      {showConfirm ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[9px] font-mono text-amber-400 bg-amber-500/10 rounded p-2">
            <AlertTriangle size={10} />
            <span>Confirm: {side} {outcome} @ {(price * 100).toFixed(0)}c x {size} shares = ${calculations.totalCost.toFixed(2)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowConfirm(false)}
              className="py-1.5 rounded text-[10px] font-mono bg-white/[0.03] text-slate-400 hover:text-white transition-all"
            >
              CANCEL
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className={clsx(
                'py-1.5 rounded text-[10px] font-mono font-bold tracking-wider transition-all flex items-center justify-center gap-1',
                outcome === 'YES'
                  ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                  : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              )}
            >
              {loading ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
              CONFIRM
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={loading}
          className={clsx(
            'w-full py-2 rounded text-[11px] font-mono font-bold tracking-wider transition-all flex items-center justify-center gap-1.5',
            outcome === 'YES'
              ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30'
              : 'bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30',
            loading && 'opacity-50 cursor-not-allowed'
          )}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <DollarSign size={12} />}
          {side} {outcome} — ${calculations.totalCost.toFixed(2)}
        </button>
      )}

      {/* Result feedback */}
      {result && (
        <div className={clsx(
          'mt-2 p-2 rounded text-[9px] font-mono flex items-center gap-1.5',
          result.status === 'filled' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
        )}>
          {result.status === 'filled' ? <Check size={10} /> : <AlertTriangle size={10} />}
          {result.status === 'filled' ? 'Order filled successfully!' : result.error || 'Order failed'}
        </div>
      )}
    </div>
  );
}
