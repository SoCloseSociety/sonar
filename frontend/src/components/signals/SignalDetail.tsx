import type { Signal } from '@/types/signal';
import { Badge } from '@/components/shared/Badge';

export function SignalDetail({ signal }: { signal: Signal }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant={signal.direction === 'BUY_YES' ? 'green' : 'red'}>
          {signal.direction}
        </Badge>
        <Badge>{signal.signal_type}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="sonar-card">
          <span className="text-xs text-slate-500">Current Price</span>
          <p className="text-xl font-mono font-bold text-white">
            {signal.current_price ? `${(signal.current_price * 100).toFixed(1)}%` : '--'}
          </p>
        </div>
        <div className="sonar-card">
          <span className="text-xs text-slate-500">Fair Value Est.</span>
          <p className="text-xl font-mono font-bold text-accent-green">
            {signal.estimated_fair_value ? `${(signal.estimated_fair_value * 100).toFixed(1)}%` : '--'}
          </p>
        </div>
      </div>

      {signal.reasoning && (
        <div>
          <h4 className="text-xs text-slate-500 mb-1">Reasoning</h4>
          <p className="text-sm text-slate-300">{signal.reasoning}</p>
        </div>
      )}
    </div>
  );
}
