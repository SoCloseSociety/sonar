import { useEffect, useState } from 'react';
import api from '@/services/api';

interface Stats {
  events_per_hour: number;
  events_24h: number;
  markets: number;
  active_signals: number;
}

export function StatsBar() {
  const [stats, setStats] = useState<Stats>({ events_per_hour: 0, events_24h: 0, markets: 0, active_signals: 0 });

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await api.get('/dashboard/stats');
        setStats(data);
      } catch {}
    };
    fetch();
    const interval = setInterval(fetch, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-4 gap-3">
      <StatCard label="Events/hr" value={stats.events_per_hour} />
      <StatCard label="Events 24h" value={stats.events_24h} />
      <StatCard label="Markets" value={stats.markets} />
      <StatCard label="Signals" value={stats.active_signals} color="text-accent-green" />
    </div>
  );
}

function StatCard({ label, value, color = 'text-white' }: { label: string; value: number; color?: string }) {
  return (
    <div className="sonar-card text-center">
      <p className={`text-xl font-mono font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-500 font-mono uppercase">{label}</p>
    </div>
  );
}
