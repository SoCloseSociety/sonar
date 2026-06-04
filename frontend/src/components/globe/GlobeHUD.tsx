import { useState, useEffect } from 'react';
import api from '@/services/api';

interface Props {
  mouseCoords: { lat: number; lng: number };
  eventCount: number;
  flightCount?: number;
  vesselCount?: number;
  webcamCount?: number;
}

interface TensionData {
  score: number;
  level: string;
  trend: string;
  breakdown?: Record<string, number>;
}

const levelColors: Record<string, string> = {
  CALM: '#10b981',
  GUARDED: '#3b82f6',
  ELEVATED: '#f59e0b',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
};

export function GlobeHUD({ mouseCoords, eventCount, flightCount = 0, vesselCount = 0, webcamCount = 0 }: Props) {
  const [utc, setUtc] = useState('');
  const [tension, setTension] = useState<TensionData>({ score: 0, level: 'CALM', trend: 'stable' });
  const [sourceCount, setSourceCount] = useState(0);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setUtc(now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [t, s] = await Promise.all([
          api.get('/dashboard/tension'),
          api.get('/dashboard/sources'),
        ]);
        setTension(t.data);
        if (Array.isArray(s.data)) {
          setSourceCount(s.data.filter((x: { status: string }) => x.status === 'active' || x.status === 'idle').length);
        }
      } catch { /* ignore */ }
    };
    load();
    const iv = setInterval(load, 90000);
    return () => clearInterval(iv);
  }, []);

  const trendArrow = tension.trend === 'rising' ? '\u2191' : tension.trend === 'falling' ? '\u2193' : '\u2194';
  const color = levelColors[tension.level] || '#10b981';

  return (
    <>
      {/* Top banner */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, transparent 100%)' }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: color, boxShadow: `0 0 8px ${color}80` }} />
            <span className="text-[11px] font-mono font-bold tracking-[3px]" style={{ color }}>SONAR</span>
          </div>
          <span className="text-[9px] font-mono text-slate-600 tracking-widest">UNCLASSIFIED // OSINT</span>
        </div>
        <div className="text-[11px] font-mono text-slate-400/70 tabular-nums tracking-wide">{utc}</div>
      </div>

      {/* Threat level panel */}
      <div className="absolute top-12 right-4 z-20 pointer-events-none">
        <div className="hud-frame px-3 py-2.5 bg-black/80 backdrop-blur-md border border-white/[0.06] rounded-lg">
          <div className="text-[8px] font-mono text-slate-500 tracking-[2px] mb-1.5">GLOBAL THREAT INDEX</div>
          <div className="flex items-center gap-3">
            <div className="flex gap-[2px]">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="w-[7px] h-5 rounded-[2px] transition-all duration-700"
                  style={{
                    backgroundColor: i < Math.round(tension.score) ? color : 'rgba(255,255,255,0.04)',
                    boxShadow: i < Math.round(tension.score) ? `0 0 4px ${color}40` : 'none',
                  }}
                />
              ))}
            </div>
            <div className="flex flex-col">
              <span className="font-mono font-bold text-[16px] tabular-nums leading-none" style={{ color }}>
                {tension.score.toFixed(1)}
              </span>
              <span className="text-[8px] font-mono tracking-wider mt-0.5" style={{ color: `${color}99` }}>
                {tension.level} {trendArrow}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats panel */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
        <div className="hud-frame px-3 py-2.5 bg-black/80 backdrop-blur-md border border-white/[0.06] rounded-lg">
          <div className="text-[8px] font-mono text-slate-500 tracking-[2px] mb-1.5">CURSOR</div>
          <div className="text-[11px] font-mono text-slate-300/80 tabular-nums mb-2.5">
            {mouseCoords.lat.toFixed(4)}°{mouseCoords.lat >= 0 ? 'N' : 'S'}{' '}
            {mouseCoords.lng.toFixed(4)}°{mouseCoords.lng >= 0 ? 'E' : 'W'}
          </div>
          <div className="grid grid-cols-5 gap-2.5 pt-2 border-t border-white/[0.04]">
            <StatCell label="INTEL" value={eventCount} color="#ef4444" />
            <StatCell label="AIR" value={flightCount} color="#94a3b8" />
            <StatCell label="SEA" value={vesselCount} color="#3b82f6" />
            <StatCell label="CAM" value={webcamCount} color="#06b6d4" />
            <StatCell label="SRC" value={sourceCount} color="#10b981" />
          </div>
        </div>
      </div>

      {/* Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <svg width="40" height="40" viewBox="0 0 40 40" className="opacity-10">
          <line x1="20" y1="2" x2="20" y2="15" stroke="#666666" strokeWidth="0.5" />
          <line x1="20" y1="25" x2="20" y2="38" stroke="#666666" strokeWidth="0.5" />
          <line x1="2" y1="20" x2="15" y2="20" stroke="#666666" strokeWidth="0.5" />
          <line x1="25" y1="20" x2="38" y2="20" stroke="#666666" strokeWidth="0.5" />
          <circle cx="20" cy="20" r="4" fill="none" stroke="#666666" strokeWidth="0.5" />
        </svg>
      </div>
    </>
  );
}

function StatCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className="text-[7px] font-mono tracking-widest" style={{ color: `${color}55` }}>{label}</div>
      <div className="text-[12px] font-mono font-semibold tabular-nums" style={{ color }}>{value.toLocaleString()}</div>
    </div>
  );
}
