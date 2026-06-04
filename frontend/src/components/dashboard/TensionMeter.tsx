import { useEffect, useState } from 'react';
import api from '@/services/api';

interface TensionData {
  score: number;
  level: string;
  trend: string;
  breakdown: Record<string, number>;
}

const levelColors: Record<string, string> = {
  CALM: '#10b981',
  GUARDED: '#3b82f6',
  ELEVATED: '#f59e0b',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
};

export function TensionMeter() {
  const [tension, setTension] = useState<TensionData>({
    score: 0, level: 'CALM', trend: 'stable', breakdown: {},
  });

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await api.get('/dashboard/tension');
        setTension(data);
      } catch {}
    };
    fetch();
    const interval = setInterval(fetch, 120000);
    return () => clearInterval(interval);
  }, []);

  const color = levelColors[tension.level] || '#10b981';
  const percentage = (tension.score / 10) * 100;

  return (
    <div className="sonar-card">
      <h3 className="text-xs font-mono text-slate-500 uppercase mb-3">Global Tension Index</h3>

      <div className="flex items-center gap-4">
        {/* Gauge */}
        <div className="relative w-20 h-20">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#1e293b"
              strokeWidth="3"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeDasharray={`${percentage}, 100`}
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-mono font-bold" style={{ color }}>
              {tension.score.toFixed(1)}
            </span>
          </div>
        </div>

        <div>
          <p className="text-lg font-mono font-bold" style={{ color }}>
            {tension.level}
          </p>
          <p className="text-xs text-slate-500">
            Trend: {tension.trend === 'rising' ? '^' : tension.trend === 'falling' ? 'v' : '~'} {tension.trend}
          </p>
        </div>
      </div>

      {Object.keys(tension.breakdown).length > 0 && (
        <div className="mt-3 space-y-1">
          {Object.entries(tension.breakdown).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 w-28 truncate">{key}</span>
              <div className="flex-1 h-1 bg-sonar-bg rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(value / 3) * 100}%`, backgroundColor: color }}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-500 w-8 text-right">
                {value.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
