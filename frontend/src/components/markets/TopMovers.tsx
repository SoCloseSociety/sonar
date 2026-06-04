import type { Market } from '@/types/market';

export function TopMovers({ markets }: { markets: Market[] }) {
  // Show markets with highest volume as "top movers"
  const sorted = [...markets]
    .filter((m) => m.volume_24h && m.volume_24h > 0)
    .sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0))
    .slice(0, 5);

  if (sorted.length === 0) return null;

  return (
    <div className="bg-sonar-surface border border-sonar-border rounded-lg p-3">
      <h3 className="text-xs font-mono text-slate-500 uppercase mb-2">Top Volume</h3>
      <div className="space-y-2">
        {sorted.map((m) => (
          <div key={m.id} className="flex items-center gap-2">
            <span className="text-sm font-mono font-bold text-accent-green w-12">
              {m.price_yes != null ? `${(m.price_yes * 100).toFixed(0)}%` : '?'}
            </span>
            <span className="text-xs text-slate-300 truncate flex-1">{m.question}</span>
            <span className="text-[10px] font-mono text-slate-500">
              ${((m.volume_24h || 0) / 1000).toFixed(1)}k
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
