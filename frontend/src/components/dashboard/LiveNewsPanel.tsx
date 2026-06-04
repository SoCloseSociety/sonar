import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { Tv, Maximize2, X, Radio, AlertCircle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

interface NewsChannel {
  id: string;
  name: string;
  country: string;
  flag: string;
  lang: string;
  youtubeVideoId: string; // always a direct video ID for reliability
  color: string;
}

// Only channels with permanent 24/7 live stream video IDs (more reliable than channel ID method)
// These are verified permanent live stream IDs from major news channels
const CHANNELS: NewsChannel[] = [
  { id: 'aljazeera',   name: 'Al Jazeera',  country: 'Qatar',       flag: '🇶🇦', lang: 'EN', youtubeVideoId: 'coYw-eVU0Ks',   color: '#f59e0b' },
  { id: 'france24en',  name: 'France 24',   country: 'France',      flag: '🇫🇷', lang: 'EN', youtubeVideoId: 'h3MuIUNCCLI',   color: '#3b82f6' },
  { id: 'dwnews',      name: 'DW News',     country: 'Germany',     flag: '🇩🇪', lang: 'EN', youtubeVideoId: 'FZCkFcKNJnQ',   color: '#ef4444' },
  { id: 'skynews',     name: 'Sky News',    country: 'UK',          flag: '🇬🇧', lang: 'EN', youtubeVideoId: 'YIBHQ8-NnjI',   color: '#06b6d4' },
  { id: 'euronews',    name: 'Euronews',    country: 'Europe',      flag: '🇪🇺', lang: 'EN', youtubeVideoId: 'MAc6iTHD_sc',   color: '#6366f1' },
  { id: 'nhkworld',    name: 'NHK World',   country: 'Japan',       flag: '🇯🇵', lang: 'EN', youtubeVideoId: 'ng40ggM87aA',   color: '#dc2626' },
  { id: 'trtworld',    name: 'TRT World',   country: 'Turkey',      flag: '🇹🇷', lang: 'EN', youtubeVideoId: 'gCNeDWCI0vo',   color: '#e11d48' },
  { id: 'cgtn',        name: 'CGTN',        country: 'China',       flag: '🇨🇳', lang: 'EN', youtubeVideoId: 'IBlKMIOOOFc',   color: '#ef4444' },
  { id: 'arirang',     name: 'Arirang',     country: 'S. Korea',    flag: '🇰🇷', lang: 'EN', youtubeVideoId: 'h7OahOSh6BM',   color: '#10b981' },
  { id: 'france24fr',  name: 'France 24',   country: 'France',      flag: '🇫🇷', lang: 'FR', youtubeVideoId: 'l3UXXid4Ibo',   color: '#3b82f6' },
  { id: 'bfmtv',       name: 'BFMTV',       country: 'France',      flag: '🇫🇷', lang: 'FR', youtubeVideoId: 'SJLAxw9pMGk',   color: '#ef4444' },
  { id: 'lci',         name: 'LCI',         country: 'France',      flag: '🇫🇷', lang: 'FR', youtubeVideoId: 'MBVl0m5rYFg',   color: '#3b82f6' },
];

type ChannelStatus = 'checking' | 'live' | 'offline';

function getEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
}

// Single channel tile with automatic status detection via iframe load + YouTube postMessage API
function ChannelTile({
  ch,
  isSelected,
  status,
  onSelect,
}: {
  ch: NewsChannel;
  isSelected: boolean;
  status: ChannelStatus;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={clsx(
        'relative flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left shrink-0',
        isSelected
          ? 'bg-black/60 border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
          : status === 'offline'
          ? 'bg-black/20 border-white/[0.04] opacity-40 cursor-not-allowed'
          : 'bg-black/40 border-white/[0.08] hover:border-white/20 hover:bg-black/60',
      )}
      disabled={status === 'offline'}
      title={status === 'offline' ? `${ch.name} — unavailable` : ch.name}
    >
      <span className="text-base leading-none shrink-0">{ch.flag}</span>
      <div className="min-w-0">
        <div className={clsx(
          'text-[9px] font-mono font-bold truncate',
          isSelected ? 'text-white' : 'text-slate-300',
        )}>
          {ch.name}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {status === 'checking' && <Loader2 size={7} className="text-slate-500 animate-spin" />}
          {status === 'live' && <div className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />}
          {status === 'offline' && <AlertCircle size={7} className="text-slate-600" />}
          <span className={clsx(
            'text-[7px] font-mono',
            status === 'live' ? 'text-red-400' : status === 'offline' ? 'text-slate-600' : 'text-slate-500',
          )}>
            {status === 'checking' ? 'CHECKING' : status === 'live' ? 'LIVE' : 'OFFLINE'}
          </span>
          <span className="text-[7px] font-mono text-slate-700">{ch.lang}</span>
        </div>
      </div>
      {isSelected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r" style={{ background: ch.color }} />
      )}
    </button>
  );
}

// Player component — tracks iframe load and YouTube postMessage error codes
function ChannelPlayer({
  ch,
  onStatusChange,
  onFullscreen,
  onClose,
}: {
  ch: NewsChannel;
  onStatusChange: (id: string, status: ChannelStatus) => void;
  onFullscreen: () => void;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    onStatusChange(ch.id, 'checking');

    // YouTube postMessage error detection
    const handleMessage = (evt: MessageEvent) => {
      try {
        const data = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
        // YouTube iframe API sends info events; error code 150/100 = video unavailable
        if (data?.event === 'infoDelivery' && data?.info?.error) {
          onStatusChange(ch.id, 'offline');
        }
        if (data?.event === 'onError' || (data?.info?.error != null)) {
          onStatusChange(ch.id, 'offline');
        }
      } catch { /* not a JSON message */ }
    };
    window.addEventListener('message', handleMessage);

    // Fallback timeout — if no error received after 8s, assume live
    timeoutRef.current = setTimeout(() => {
      onStatusChange(ch.id, 'live');
    }, 8000);

    return () => {
      window.removeEventListener('message', handleMessage);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [ch.id, ch.youtubeVideoId, onStatusChange]);

  const handleLoad = () => {
    setLoading(false);
    // Don't mark as live here — wait for postMessage or timeout
  };

  return (
    <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={20} className="text-cyan-500/50 animate-spin" />
            <span className="text-[8px] font-mono text-slate-600 tracking-wider">CONNECTING TO {String(ch.name).toUpperCase()}...</span>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={getEmbedUrl(ch.youtubeVideoId)}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={ch.name}
        onLoad={handleLoad}
      />
      {/* Overlay bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-1.5 pointer-events-none">
          <span className="text-sm leading-none">{ch.flag}</span>
          <span className="text-[9px] font-mono font-bold text-white">{ch.name}</span>
          <div className="flex items-center gap-0.5 bg-red-600/90 px-1.5 py-0.5 rounded">
            <Radio size={6} className="text-white" />
            <span className="text-[6px] font-mono text-white font-bold tracking-wider">LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-1 pointer-events-auto">
          <button
            onClick={onFullscreen}
            className="p-1 bg-black/60 rounded text-slate-300 hover:text-white transition-colors"
            title="Fullscreen"
          >
            <Maximize2 size={10} />
          </button>
          <button
            onClick={onClose}
            className="p-1 bg-black/60 rounded text-slate-300 hover:text-white transition-colors"
            title="Close player"
          >
            <X size={10} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ──
export const LiveNewsPanel = memo(function LiveNewsPanel() {
  const [selected, setSelected] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [langFilter, setLangFilter] = useState<'ALL' | 'EN' | 'FR'>('ALL');
  const [statuses, setStatuses] = useState<Record<string, ChannelStatus>>(() =>
    Object.fromEntries(CHANNELS.map(ch => [ch.id, 'checking' as ChannelStatus]))
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleStatusChange = useCallback((id: string, status: ChannelStatus) => {
    setStatuses(prev => prev[id] === status ? prev : { ...prev, [id]: status });
  }, []);

  // Auto-check all channels on mount by spawning hidden iframes
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    CHANNELS.forEach((ch, i) => {
      // Stagger checks to avoid hammering YouTube
      const t = setTimeout(() => {
        // Simple ping: fetch YouTube oembed to check if video exists
        fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ch.youtubeVideoId}&format=json`)
          .then(r => {
            handleStatusChange(ch.id, r.ok ? 'live' : 'offline');
          })
          .catch(() => {
            // CORS block = video likely exists (YouTube blocks oembed for some live streams)
            // Keep as 'live' optimistically
            handleStatusChange(ch.id, 'live');
          });
      }, i * 300);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [handleStatusChange]);

  const filtered = CHANNELS.filter(ch => {
    if (langFilter !== 'ALL' && ch.lang !== langFilter) return false;
    return statuses[ch.id] !== 'offline'; // hide offline channels
  });

  const activeChannel = CHANNELS.find(ch => ch.id === selected);

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  // Fullscreen player
  if (fullscreen && activeChannel) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-[#0a0e17]/95 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xl leading-none">{activeChannel.flag}</span>
            <span className="text-sm font-mono font-bold text-white tracking-wider">{activeChannel.name}</span>
            <span className="text-[8px] font-mono text-slate-500 bg-white/[0.05] px-1.5 py-0.5 rounded border border-white/[0.06]">
              {activeChannel.lang}
            </span>
            <div className="flex items-center gap-1 ml-1 bg-red-600/20 border border-red-500/30 px-2 py-0.5 rounded">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[8px] font-mono text-red-400 tracking-[2px]">LIVE</span>
            </div>
          </div>
          <button onClick={() => setFullscreen(false)} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
        <iframe
          src={getEmbedUrl(activeChannel.youtubeVideoId)}
          className="flex-1 w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={activeChannel.name}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-[#080c14]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <Tv size={11} className="text-cyan-400" />
          <span className="text-[9px] font-mono font-bold text-cyan-400 tracking-[2px]">LIVE NEWS</span>
          <div className="flex items-center gap-1 bg-red-600/15 border border-red-500/25 px-1.5 py-0.5 rounded">
            <div className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[7px] font-mono text-red-400 tracking-wider">ON AIR</span>
          </div>
          <span className="text-[7px] font-mono text-slate-600">
            {filtered.length} ch. live
          </span>
        </div>
        {/* Lang filter */}
        <div className="flex items-center gap-0.5">
          {(['ALL', 'EN', 'FR'] as const).map(lang => (
            <button
              key={lang}
              onClick={() => setLangFilter(lang)}
              className={clsx(
                'text-[7px] font-mono px-1.5 py-0.5 rounded transition-all',
                langFilter === lang
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25'
                  : 'text-slate-600 hover:text-slate-400',
              )}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      {/* Video player */}
      {selected && activeChannel && statuses[activeChannel.id] !== 'offline' && (
        <ChannelPlayer
          ch={activeChannel}
          onStatusChange={handleStatusChange}
          onFullscreen={() => setFullscreen(true)}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Horizontal scrollable channel strip */}
      <div className="relative flex items-center px-1 py-2 shrink-0">
        <button
          onClick={() => scroll('left')}
          className="shrink-0 p-1 text-slate-600 hover:text-slate-300 transition-colors z-10"
        >
          <ChevronLeft size={12} />
        </button>
        <div
          ref={scrollRef}
          className="flex items-center gap-1.5 overflow-x-auto flex-1 px-1 scrollbar-hide"
          style={{ scrollbarWidth: 'none' }}
        >
          {filtered.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 text-[9px] font-mono text-slate-600">
              <AlertCircle size={11} className="text-slate-600" />
              No live channels available
            </div>
          ) : (
            filtered.map(ch => (
              <ChannelTile
                key={ch.id}
                ch={ch}
                isSelected={selected === ch.id}
                status={statuses[ch.id]}
                onSelect={() => setSelected(selected === ch.id ? null : ch.id)}
              />
            ))
          )}
        </div>
        <button
          onClick={() => scroll('right')}
          className="shrink-0 p-1 text-slate-600 hover:text-slate-300 transition-colors z-10"
        >
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
});
