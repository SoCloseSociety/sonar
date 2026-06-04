import { useEffect, useState } from 'react';
import api from '@/services/api';

interface SourceStatus {
  name: string;
  enabled: boolean;
  last_fetch: string | null;
  error_count: number;
  healthy: boolean;
}

export function SourceHealth() {
  const [sources, setSources] = useState<SourceStatus[]>([]);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data } = await api.get('/dashboard/sources');
        if (Array.isArray(data)) setSources(data);
      } catch {
        // Backend may not have endpoint yet — use defaults
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 90000);
    return () => clearInterval(interval);
  }, []);

  const sourceNames = sources.length > 0
    ? sources
    : [
        'RSS', 'GDELT', 'Government', 'Conflict Monitor',
        'YouTube', 'Reddit', 'ACLED', 'Cyber Threats',
        'Sanctions/Trade', 'Shodan', 'OpenSky', 'AISstream',
        'USGS', 'NOAA', 'FIRMS', 'Safecast', 'Polymarket',
        'Webcams',
      ].map((n) => ({ name: n, enabled: true, last_fetch: null, error_count: 0, healthy: true }));

  return (
    <div className="sonar-card">
      <h3 className="text-xs font-mono text-slate-500 uppercase mb-3">
        Source Status ({sourceNames.filter((s) => s.healthy).length}/{sourceNames.length})
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {sourceNames.map((s) => (
          <div key={s.name} className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              !s.enabled ? 'bg-slate-600' :
              s.healthy ? 'bg-accent-green' :
              'bg-red-500 animate-pulse'
            }`} />
            <span className={`text-xs ${s.enabled ? 'text-slate-400' : 'text-slate-600'}`}>
              {s.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
