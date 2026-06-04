import { useState, useEffect } from 'react';
import { Search, Bell, Wifi, WifiOff, Activity } from 'lucide-react';
import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';

interface TensionData {
  score: number;
  level: string;
  trend: string;
}

const LEVEL_COLORS: Record<string, string> = {
  CALM:     '#00E676',
  GUARDED:  '#00CFEB',
  ELEVATED: '#FFA800',
  HIGH:     '#FF6D2A',
  CRITICAL: '#FF3A3A',
};

/** Live UTC clock — updates every second */
function UTCClock() {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const hh = now.getUTCHours().toString().padStart(2, '0');
      const mm = now.getUTCMinutes().toString().padStart(2, '0');
      const ss = now.getUTCSeconds().toString().padStart(2, '0');
      setTime(`${hh}:${mm}:${ss}`);
      setDate(now.toISOString().slice(0, 10));
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="flex flex-col items-end leading-none gap-px">
      <span className="text-[10px] text-[#D0D9E8] tabular-nums tracking-wider">{time}</span>
      <span className="text-[7px] text-[#2A3545] tabular-nums">UTC {date}</span>
    </div>
  );
}

export function TopBar() {
  const [tension, setTension] = useState<TensionData>({ score: 0, level: 'CALM', trend: 'stable' });
  const [search, setSearch] = useState('');
  const [sourceStatus, setSourceStatus] = useState({ active: 0, total: 0 });
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [t, s] = await Promise.all([
          api.get('/dashboard/tension'),
          api.get('/dashboard/sources'),
        ]);
        setTension(t.data);
        if (Array.isArray(s.data)) {
          setSourceStatus({
            active: s.data.filter((x: { status: string }) => x.status === 'active' || x.status === 'idle').length,
            total: s.data.length,
          });
        }
      } catch { /* ignore */ }
    };
    fetchData();
    const iv = setInterval(fetchData, 90000);
    return () => clearInterval(iv);
  }, []);

  const trendChar = tension.trend === 'rising' ? '▲' : tension.trend === 'falling' ? '▼' : '─';
  const bars      = Math.round(tension.score);
  const color     = LEVEL_COLORS[tension.level] || '#00E676';

  return (
    <header className="h-9 bg-[#060B16] border-b border-[#152030] flex items-center shrink-0 overflow-hidden">

      {/* ── SONAR brand segment ── */}
      <div className="flex items-center gap-2 px-3 border-r border-[#152030] h-full shrink-0">
        <div className="w-2 h-2 bg-[#FF6D2A] shrink-0" />
        <span className="text-[9px] font-black text-[#FF6D2A] tracking-[3px]">SONAR</span>
      </div>

      {/* ── THREAT segment ── */}
      <div className="flex items-center gap-1.5 px-3 border-r border-[#152030] h-full shrink-0">
        <span className="text-[7px] text-[#2A3545] tracking-[2px]">THREAT</span>
        {/* 10-bar meter */}
        <div className="flex gap-[2px]">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="w-[5px] h-3 transition-colors duration-500"
              style={{ backgroundColor: i < bars ? color : '#152030' }}
            />
          ))}
        </div>
        <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
          {tension.score.toFixed(1)}
        </span>
        <span className="text-[8px] font-bold" style={{ color }}>
          {tension.level}{trendChar}
        </span>
      </div>

      {/* ── SOURCES segment ── */}
      <div className="flex items-center gap-1.5 px-3 border-r border-[#152030] h-full shrink-0">
        {sourceStatus.active > 0
          ? <Wifi size={10} color="#00E676" />
          : <WifiOff size={10} className="text-[#4E6070]" />
        }
        <span className="text-[9px] text-[#4E6070]">
          <span style={{ color: '#00E676' }}>{sourceStatus.active}</span>
          <span className="text-[#2A3545]">/</span>
          {sourceStatus.total}
          <span className="text-[#2A3545] tracking-widest ml-1">SRC</span>
        </span>
      </div>

      {/* ── SEARCH segment ── */}
      <div className="flex-1 px-3 max-w-sm">
        <div className="relative">
          <Search size={9} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#2A3545]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SEARCH EVENTS, LOCATIONS, ENTITIES..."
            className="w-full bg-[#030711] border border-[#152030] pl-6 pr-2 py-1 text-[9px] text-[#D0D9E8] placeholder:text-[#2A3545] focus:border-[#FF6D2A]/40 focus:outline-none transition-colors"
          />
        </div>
      </div>

      <div className="flex-1" />

      {/* ── ACTIVITY indicator ── */}
      <div className="hidden md:flex items-center gap-1.5 px-3 border-l border-[#152030] h-full shrink-0">
        <Activity size={9} className="text-[#2A3545]" />
        <span className="text-[7px] text-[#2A3545] tracking-widest">LIVE</span>
        <div className="live-dot" />
      </div>

      {/* ── UTC Clock ── */}
      <div className="flex items-center px-3 border-l border-[#152030] h-full shrink-0">
        <UTCClock />
      </div>

      {/* ── Notifications ── */}
      <div className="flex items-center px-2.5 border-l border-[#152030] h-full shrink-0">
        <button className="relative p-1 text-[#4E6070] hover:text-[#D0D9E8] transition-colors">
          <Bell size={12} />
          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-[#FF3A3A]" />
        </button>
      </div>

      {/* ── User session ── */}
      <div className="flex items-center gap-2 px-3 border-l border-[#152030] h-full shrink-0">
        <div className="w-[6px] h-[6px] bg-[#00E676] animate-pulse" />
        <span className="text-[9px] text-[#4E6070] tracking-widest">
          {String(user?.username || 'ANON').toUpperCase()}
        </span>
      </div>
    </header>
  );
}
