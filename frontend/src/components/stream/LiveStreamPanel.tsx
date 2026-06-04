import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Camera, X, Maximize2, Minimize2, ExternalLink, Wifi, WifiOff, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/services/api';

interface WebcamStream {
  id: string;
  name: string;
  country?: string;
  city?: string;
  thumbnail?: string;
  player_url?: string;
  status?: string;
  lat?: number;
  lon?: number;
}

interface LiveStreamPanelProps {
  className?: string;
}

/** Proxy thumbnail through backend to avoid Windy CORS/referrer blocks */
function proxyThumb(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return `/api/map/webcams/proxy-thumb?url=${encodeURIComponent(url)}`;
}

/** Extract YouTube video ID from watch/embed/short URLs */
function getYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      return u.searchParams.get('v') || u.pathname.split('/').pop() || null;
    }
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1) || null;
    }
  } catch { /* invalid URL */ }
  return null;
}

/** Build embeddable YouTube URL */
function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=1&modestbranding=1&rel=0`;
}

/** Check if URL is embeddable (YouTube) */
function isEmbeddable(url: string | undefined): boolean {
  if (!url) return false;
  return getYouTubeVideoId(url) !== null;
}

export const LiveStreamToggle = memo(function LiveStreamToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={clsx(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all',
        open
          ? 'bg-red-500/15 text-red-400 border border-red-500/30'
          : 'bg-black/60 backdrop-blur-md text-cyan-400/80 border border-white/[0.08] hover:border-cyan-500/30 hover:text-cyan-400'
      )}
      title="Live Streams"
    >
      <Camera size={12} />
      <span className="tracking-wider">LIVE</span>
      {!open && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
    </button>
  );
});

export function LiveStreamPanel({ className }: LiveStreamPanelProps) {
  const [webcams, setWebcams] = useState<WebcamStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStream, setActiveStream] = useState<WebcamStream | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 6;

  const fetchWebcams = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/map/webcams');
      if (Array.isArray(data)) {
        const streams: WebcamStream[] = data
          .filter((c: Record<string, unknown>) => c.player_url || c.thumbnail)
          .map((c: Record<string, unknown>) => ({
            id: String(c.id || c.name || Math.random()),
            name: (c.name as string) || 'Live Camera',
            country: c.country as string,
            city: c.city as string,
            thumbnail: c.thumbnail as string,
            player_url: c.player_url as string,
            status: c.status as string,
            lat: c.lat as number,
            lon: c.lon as number,
          }));
        setWebcams(streams);
      }
    } catch {
      /* silently fail — webcams are non-critical */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebcams();
  }, [fetchWebcams]);

  const totalPages = Math.ceil(webcams.length / PAGE_SIZE);
  const visibleWebcams = webcams.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Active stream view — with inline embed for YouTube, auto-refresh for others
  if (activeStream) {
    const ytId = activeStream.player_url ? getYouTubeVideoId(activeStream.player_url) : null;

    return (
      <div className={clsx(
        'flex flex-col bg-black/95 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl',
        expanded ? 'w-[640px] h-[420px]' : 'w-96 h-72',
        className
      )}>
        {/* Stream header */}
        <div className="flex items-center justify-between px-3 py-2 bg-black/60 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-[10px] font-mono text-red-400 font-bold tracking-wider">LIVE</span>
            <span className="text-[10px] font-mono text-slate-400 truncate">{activeStream.name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setExpanded(!expanded)} className="p-1 hover:bg-white/[0.05] rounded transition-colors">
              {expanded ? <Minimize2 size={12} className="text-slate-400" /> : <Maximize2 size={12} className="text-slate-400" />}
            </button>
            {activeStream.player_url && (
              <button onClick={() => openExternal(activeStream.player_url!)} className="p-1 hover:bg-white/[0.05] rounded transition-colors">
                <ExternalLink size={12} className="text-slate-400" />
              </button>
            )}
            <button onClick={() => { setActiveStream(null); setExpanded(false); }} className="p-1 hover:bg-white/[0.05] rounded transition-colors">
              <X size={12} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Stream content */}
        <div className="flex-1 relative bg-black">
          {ytId ? (
            /* YouTube embed — works inline */
            <iframe
              src={getYouTubeEmbedUrl(ytId)}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={activeStream.name}
            />
          ) : (
            /* Non-YouTube: auto-refreshing thumbnail + external link */
            <AutoRefreshThumbnail
              src={activeStream.thumbnail}
              alt={activeStream.name}
              className="w-full h-full object-cover"
              playerUrl={activeStream.player_url}
              onOpenExternal={openExternal}
            />
          )}
        </div>

        {/* Stream info */}
        <div className="px-3 py-1.5 bg-black/60 border-t border-white/[0.06] flex items-center justify-between">
          <span className="text-[9px] font-mono text-slate-500">
            {[activeStream.city, activeStream.country].filter(Boolean).join(', ')}
          </span>
          <div className="flex items-center gap-2">
            {ytId && <span className="text-[8px] font-mono text-red-400/60">YT EMBED</span>}
            {activeStream.lat && activeStream.lon && (
              <span className="text-[9px] font-mono text-cyan-400/50 tabular-nums">
                {activeStream.lat.toFixed(2)}, {activeStream.lon.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Stream browser
  return (
    <div className={clsx(
      'flex flex-col w-80 bg-black/95 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Camera size={12} className="text-cyan-400" />
          <span className="text-[10px] font-mono font-bold text-white tracking-widest">LIVE CAMERAS</span>
          <span className="text-[9px] font-mono text-slate-500">{webcams.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={fetchWebcams}
            disabled={loading}
            className="p-1 hover:bg-white/[0.05] rounded transition-colors disabled:opacity-30"
            title="Refresh"
          >
            <RefreshCw size={10} className={clsx('text-slate-400', loading && 'animate-spin')} />
          </button>
          {totalPages > 1 && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-0.5 hover:bg-white/[0.05] rounded disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={12} className="text-slate-400" />
              </button>
              <span className="text-[8px] font-mono text-slate-500 tabular-nums">{page + 1}/{totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-0.5 hover:bg-white/[0.05] rounded disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={12} className="text-slate-400" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stream grid */}
      <div className="p-2 overflow-y-auto max-h-80">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          </div>
        ) : webcams.length === 0 ? (
          <div className="text-center py-8">
            <WifiOff size={20} className="text-slate-600 mx-auto mb-2" />
            <span className="text-[10px] font-mono text-slate-600 tracking-widest">NO STREAMS AVAILABLE</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {visibleWebcams.map(cam => (
              <StreamCard key={cam.id} cam={cam} onClick={() => setActiveStream(cam)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Thumbnail that auto-refreshes every 10s with overlay for external open */
const AutoRefreshThumbnail = memo(function AutoRefreshThumbnail({
  src,
  alt,
  className,
  playerUrl,
  onOpenExternal,
}: {
  src?: string;
  alt: string;
  className?: string;
  playerUrl?: string;
  onOpenExternal: (url: string) => void;
}) {
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    intervalRef.current = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const imgUrl = src
    ? `${proxyThumb(src)}&t=${tick}`
    : undefined;

  return (
    <div className="relative w-full h-full">
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={alt}
          className={className}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className={clsx('flex items-center justify-center bg-black/60', className)}>
          <Camera size={20} className="text-slate-700" />
        </div>
      )}
      {/* Overlay with open button */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 gap-2">
        {playerUrl ? (
          <button
            onClick={() => onOpenExternal(playerUrl)}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg transition-all group"
          >
            <div className="w-5 h-5 rounded-full bg-red-500/30 flex items-center justify-center">
              <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[8px] border-l-white ml-0.5" />
            </div>
            <span className="text-[11px] font-mono font-bold text-white tracking-wider">OPEN STREAM</span>
            <ExternalLink size={11} className="text-slate-400 group-hover:text-white transition-colors" />
          </button>
        ) : (
          <span className="text-[10px] font-mono text-slate-400 tracking-widest">PREVIEW ONLY</span>
        )}
        <span className="text-[8px] font-mono text-slate-500/70">Auto-refreshing every 10s</span>
      </div>
    </div>
  );
});

const StreamCard = memo(function StreamCard({
  cam,
  onClick,
}: {
  cam: WebcamStream;
  onClick: () => void;
}) {
  const isActive = cam.status === 'active';
  const embeddable = isEmbeddable(cam.player_url);

  return (
    <button
      onClick={onClick}
      className="group relative rounded-lg overflow-hidden bg-white/[0.02] border border-white/[0.04] hover:border-cyan-500/20 transition-all text-left"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-black/50 relative overflow-hidden">
        <ThumbnailWithFallback
          src={cam.thumbnail}
          alt={cam.name}
          className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
        />
        {/* Live / embeddable indicator */}
        <div className="absolute top-1 left-1 flex items-center gap-1 px-1 py-0.5 bg-black/70 rounded text-[7px] font-mono">
          {isActive ? (
            <>
              <Wifi size={7} className="text-green-400" />
              <span className="text-green-400">LIVE</span>
            </>
          ) : (
            <>
              <WifiOff size={7} className="text-slate-500" />
              <span className="text-slate-500">OFF</span>
            </>
          )}
        </div>
        {embeddable && (
          <div className="absolute top-1 right-1 px-1 py-0.5 bg-red-500/80 rounded text-[6px] font-mono text-white font-bold">
            YT
          </div>
        )}
        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
          <div className="w-6 h-6 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-white ml-0.5" />
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-1.5">
        <div className="text-[8px] font-mono text-slate-300 truncate leading-tight">{cam.name}</div>
        <div className="text-[7px] font-mono text-slate-600 truncate">
          {[cam.city, cam.country].filter(Boolean).join(', ') || 'Unknown location'}
        </div>
      </div>
    </button>
  );
});

/** Image component with proxy fallback and error handling */
const ThumbnailWithFallback = memo(function ThumbnailWithFallback({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setImgSrc(proxyThumb(src) || null);
  }, [src]);

  if (failed || !imgSrc) {
    return (
      <div className={clsx('flex items-center justify-center bg-black/60', className)}>
        <Camera size={20} className="text-slate-700" />
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => {
        if (imgSrc !== src && src) {
          setImgSrc(src);
        } else {
          setFailed(true);
        }
      }}
    />
  );
});
