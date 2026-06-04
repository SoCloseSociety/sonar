import {
  useState, useEffect, useRef, useCallback, memo,
} from 'react';
import {
  Camera, Tv, X, Maximize2, ExternalLink, WifiOff,
  ChevronLeft, ChevronRight, Radio, Loader2, AlertCircle, RefreshCw,
  LayoutGrid, Columns, Grid, Square,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/services/api';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface WebcamStream {
  id: string;
  name: string;
  country?: string;
  city?: string;
  thumbnail?: string;
  player_url?: string;
  embed_url?: string;          // Windy public embed player URL
  status?: string;
  lat?: number;
  lon?: number;
}

interface NewsChannel {
  id: string;
  name: string;
  country: string;
  region: string;
  flag: string;
  lang: string;
  youtubeChannelId: string;    // YouTube channel ID — permanent, never expires
  color: string;
  directUrl?: string;          // Fallback direct URL if YouTube channel embed blocked
}

type ChannelStatus = 'live' | 'offline' | 'checking' | 'unknown';
type GridMode = 'solo' | 'split' | 'quad' | 'hex' | 'octo' | 'nine';

type ActiveItem =
  | { kind: 'camera'; cam: WebcamStream }
  | { kind: 'news';   ch: NewsChannel };

export interface MediaPanelProps {
  defaultTab?: 'cameras' | 'news';
  fullPage?: boolean;
}

const GRID_CONFIGS: Record<GridMode, { cols: number; count: number; label: string; Icon: React.ElementType }> = {
  solo:  { cols: 1, count: 1, label: '1×1', Icon: Square      },
  split: { cols: 2, count: 2, label: '2×1', Icon: Columns     },
  quad:  { cols: 2, count: 4, label: '2×2', Icon: Grid        },
  hex:   { cols: 3, count: 6, label: '3×2', Icon: LayoutGrid  },
  octo:  { cols: 4, count: 8, label: '4×2', Icon: LayoutGrid  },
  nine:  { cols: 3, count: 9, label: '3×3', Icon: Grid        },
};

// ─────────────────────────────────────────────
// News channels
// Using YouTube CHANNEL IDs (permanent — never expire unlike video IDs)
// Embed format: youtube.com/embed/live_stream?channel={channelId}
// ─────────────────────────────────────────────

const NEWS_CHANNELS: NewsChannel[] = [
  // ── International / English ──
  { id: 'aljazeera',   name: 'Al Jazeera',   country: 'Qatar',     region: 'INTL', flag: '🇶🇦', lang: 'EN', youtubeChannelId: 'UCNye-wNBqNL5ZzHSJj3l8Bg', color: '#f59e0b' },
  { id: 'skynews',     name: 'Sky News',      country: 'UK',        region: 'EU',   flag: '🇬🇧', lang: 'EN', youtubeChannelId: 'UCoMdktPbSTixAyNGwb-UYkQ', color: '#06b6d4' },
  { id: 'dwnews',      name: 'DW News',       country: 'Germany',   region: 'EU',   flag: '🇩🇪', lang: 'EN', youtubeChannelId: 'UCknLrEdhRCp1aegoMqRaCZg', color: '#ef4444' },
  { id: 'euronews',    name: 'Euronews EN',   country: 'Europe',    region: 'EU',   flag: '🇪🇺', lang: 'EN', youtubeChannelId: 'UCSrZ3UV4jOidv8ppoVuvW9Q', color: '#6366f1' },
  { id: 'france24en',  name: 'France 24',     country: 'France',    region: 'EU',   flag: '🇫🇷', lang: 'EN', youtubeChannelId: 'UCQfwfsi5VrQ8yKZ-UWmAEFg', color: '#3b82f6' },
  { id: 'trtworld',    name: 'TRT World',     country: 'Turkey',    region: 'MENA', flag: '🇹🇷', lang: 'EN', youtubeChannelId: 'UCnyCrv8b7bu0oWFXGyHaPzg', color: '#e11d48' },
  { id: 'nhkworld',    name: 'NHK World',     country: 'Japan',     region: 'ASIA', flag: '🇯🇵', lang: 'EN', youtubeChannelId: 'UCSPEjw8F2nQDtmUKPFNF7_A', color: '#dc2626' },
  { id: 'arirang',     name: 'Arirang TV',    country: 'S. Korea',  region: 'ASIA', flag: '🇰🇷', lang: 'EN', youtubeChannelId: 'UCKs3AQ4Z0FhXqJR7oLhnSsQ', color: '#10b981' },
  { id: 'cgtn',        name: 'CGTN',          country: 'China',     region: 'ASIA', flag: '🇨🇳', lang: 'EN', youtubeChannelId: 'UCBFTFELNwDEhYgVFM7FqQ-A', color: '#dc2626' },
  { id: 'wion',        name: 'WION',          country: 'India',     region: 'ASIA', flag: '🇮🇳', lang: 'EN', youtubeChannelId: 'UCpAFMfJcpY5BXynlOtC_qYg', color: '#f59e0b' },
  { id: 'timesnow',    name: 'Times Now',     country: 'India',     region: 'ASIA', flag: '🇮🇳', lang: 'EN', youtubeChannelId: 'UCpEhnqL0y41EpW2TvWAHD7Q', color: '#f97316' },
  { id: 'ndtv',        name: 'NDTV 24x7',    country: 'India',     region: 'ASIA', flag: '🇮🇳', lang: 'EN', youtubeChannelId: 'UCZFMm1mMw0F81Z37aaEzTUA', color: '#ef4444' },
  { id: 'abcau',       name: 'ABC News AU',   country: 'Australia', region: 'ASIA', flag: '🇦🇺', lang: 'EN', youtubeChannelId: 'UCVgO39Bk5sMo66-6o6Spn6Q', color: '#6366f1' },
  { id: 'africanews',  name: 'Africanews',    country: 'Africa',    region: 'AFR',  flag: '🌍',  lang: 'EN', youtubeChannelId: 'UCG_QCDz7fTJCZvutdHLcqLg', color: '#10b981' },
  { id: 'i24news',     name: 'i24 News',      country: 'Israel',    region: 'MENA', flag: '🇮🇱', lang: 'EN', youtubeChannelId: 'UCnzNtKQSP9FqIoEuYCBn4Ow', color: '#3b82f6' },
  { id: 'bloomberg',   name: 'Bloomberg',     country: 'USA',       region: 'AMER', flag: '🇺🇸', lang: 'EN', youtubeChannelId: 'UCIALMKvObZNtJ6AmdCLP7Lg', color: '#FF6D2A' },
  { id: 'voa',         name: 'VOA News',      country: 'USA',       region: 'AMER', flag: '🇺🇸', lang: 'EN', youtubeChannelId: 'UCVSNOxehfALJKhaGXHg0t_g', color: '#ef4444' },
  { id: 'indiatoday',  name: 'India Today',   country: 'India',     region: 'ASIA', flag: '🇮🇳', lang: 'EN', youtubeChannelId: 'UCYPvAwZP8pZhSMW8qs7cVCw', color: '#f59e0b' },
  { id: 'channel4',    name: 'Ch4 News',      country: 'UK',        region: 'EU',   flag: '🇬🇧', lang: 'EN', youtubeChannelId: 'UCTrQ7HXWRRxr7OsOtodr2_w', color: '#06b6d4' },
  { id: 'gbnews',      name: 'GB News',       country: 'UK',        region: 'EU',   flag: '🇬🇧', lang: 'EN', youtubeChannelId: 'UCgnMNpgHoMWUr_pqO8YfLEA', color: '#f97316' },
  { id: 'telesur',     name: 'TeleSUR',       country: 'Latam',     region: 'AMER', flag: '🌎',  lang: 'EN', youtubeChannelId: 'UCGV4n3j0sGrFVhFQA1jyFiQ', color: '#ef4444' },
  // ── French ──
  { id: 'france24fr',  name: 'France 24 FR',  country: 'France',    region: 'EU',   flag: '🇫🇷', lang: 'FR', youtubeChannelId: 'UCCCPCZNChQdGa9EkATeye4g', color: '#3b82f6' },
  { id: 'bfmtv',       name: 'BFMTV',         country: 'France',    region: 'EU',   flag: '🇫🇷', lang: 'FR', youtubeChannelId: 'UCUsBMOIUl_ad6JUOC16DpmQ', color: '#ef4444' },
  { id: 'lci',         name: 'LCI',           country: 'France',    region: 'EU',   flag: '🇫🇷', lang: 'FR', youtubeChannelId: 'UCfJSEG0m4PO1RjMsmC2sJBw', color: '#3b82f6' },
  { id: 'cnews',       name: 'CNews',         country: 'France',    region: 'EU',   flag: '🇫🇷', lang: 'FR', youtubeChannelId: 'UCXKJrYczY2_fJEZgFPGY0HQ', color: '#f97316' },
  { id: 'tv5monde',    name: 'TV5 Monde',     country: 'France',    region: 'EU',   flag: '🇫🇷', lang: 'FR', youtubeChannelId: 'UCJsZHPR1jqKu-soDmKNMBFg', color: '#10b981' },
  { id: 'euronewsfr',  name: 'Euronews FR',   country: 'Europe',    region: 'EU',   flag: '🇪🇺', lang: 'FR', youtubeChannelId: 'UC6hBGEi9ZtD9sBDjGqbGkKQ', color: '#6366f1' },
  { id: 'afrnewsfr',   name: 'Africanews FR', country: 'Africa',    region: 'AFR',  flag: '🌍',  lang: 'FR', youtubeChannelId: 'UCB_J4LnKPXCbrRAfpLvAuJA', color: '#10b981' },
  // ── Arabic ──
  { id: 'aljazeeraAr', name: 'Al Jazeera AR', country: 'Qatar',     region: 'MENA', flag: '🇶🇦', lang: 'AR', youtubeChannelId: 'UCfiwzLy-8yKzIbsmZTzxDgw', color: '#f59e0b' },
  { id: 'france24ar',  name: 'France 24 AR',  country: 'France',    region: 'MENA', flag: '🇫🇷', lang: 'AR', youtubeChannelId: 'UCDpPdE0bMKhCPVVEHSHAqow', color: '#3b82f6' },
  { id: 'dwar',        name: 'DW Arabic',     country: 'Germany',   region: 'MENA', flag: '🇩🇪', lang: 'AR', youtubeChannelId: 'UCp_5_G3ggNS5B7FmS0YHRaA', color: '#ef4444' },
  // ── Spanish ──
  { id: 'dwes',        name: 'DW Español',    country: 'Germany',   region: 'AMER', flag: '🇩🇪', lang: 'ES', youtubeChannelId: 'UCDypoksJCaO5HMRriAHy7UA', color: '#ef4444' },
  { id: 'france24es',  name: 'France 24 ES',  country: 'France',    region: 'AMER', flag: '🇫🇷', lang: 'ES', youtubeChannelId: 'UCpXwBpbmb0aXJaWoJmBwK6A', color: '#3b82f6' },
];

const REGIONS = ['ALL', 'INTL', 'EU', 'MENA', 'ASIA', 'AMER', 'AFR'];
const LANGS   = ['ALL', 'EN', 'FR', 'AR', 'ES'];

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

function proxyThumb(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return `/api/map/webcams/proxy-thumb?url=${encodeURIComponent(url)}`;
}

/** Build YouTube live embed URL — uses video ID when available, falls back to live_stream channel embed */
function youtubeChannelEmbed(channelId: string, muted = true, videoId?: string): string {
  if (videoId) {
    const params = new URLSearchParams({
      autoplay: '1',
      mute: muted ? '1' : '0',
      controls: '1',
      rel: '0',
      modestbranding: '1',
      enablejsapi: '1',
    });
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
  }
  const params = new URLSearchParams({
    channel: channelId,
    autoplay: '1',
    mute: muted ? '1' : '0',
    controls: '1',
    modestbranding: '1',
    rel: '0',
    enablejsapi: '1',
  });
  return `https://www.youtube-nocookie.com/embed/live_stream?${params}`;
}

function ytWatchUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${channelId}/live`;
}

// ─────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────

function useFetchWebcams() {
  const [webcams, setWebcams] = useState<WebcamStream[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/map/webcams');
      if (Array.isArray(data)) {
        setWebcams(data
          .filter((c: Record<string, unknown>) => c.embed_url || c.player_url || c.thumbnail)
          .map((c: Record<string, unknown>) => ({
            id: String(c.id ?? c.name ?? Math.random()),
            name: (c.name as string) || 'Live Camera',
            country: c.country as string,
            city: c.city as string,
            thumbnail: c.thumbnail as string,
            player_url: c.player_url as string,
            embed_url: c.embed_url as string,
            status: c.status as string,
            lat: c.lat as number,
            lon: c.lon as number,
          })));
      }
    } catch { /* non-critical */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch_();
    const iv = setInterval(fetch_, 60_000);
    return () => clearInterval(iv);
  }, [fetch_]);

  return { webcams, loading, refresh: fetch_ };
}

// Keywords indicating a live stream title
const LIVE_KEYWORDS = ['live', 'en direct', 'en vivo', 'direkt', 'canlı', '直播', 'مباشر', 'direto', 'ao vivo', 'в эфире', '24/7', 'stream', 'streaming', 'direct', 'en cours'];

/** Validate a video ID is embeddable via YouTube oEmbed API */
async function validateVideoEmbed(videoId: string): Promise<boolean> {
  try {
    const resp = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(4000) }
    );
    return resp.ok; // 200 = embeddable, 401/404 = not
  } catch {
    return false; // Network error / timeout — assume invalid
  }
}

async function checkChannelClientSide(ch: NewsChannel): Promise<{ status: ChannelStatus; videoId?: string }> {
  try {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.youtubeChannelId}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return { status: 'unknown' };
    const text = await resp.text();
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) return { status: 'unknown' };

    const entries = Array.from(doc.querySelectorAll('entry')).slice(0, 15);
    if (entries.length === 0) return { status: 'offline' };

    // Extract all video IDs with their titles
    const candidates: { videoId: string; title: string; isLive: boolean; isRecent: boolean }[] = [];
    const now = Date.now();
    for (const entry of entries) {
      const videoId = entry.getElementsByTagName('yt:videoId')[0]?.textContent;
      if (!videoId) continue;
      const title = entry.querySelector('title')?.textContent ?? '';
      const published = entry.querySelector('published')?.textContent ?? '';
      const ageMs = published ? now - new Date(published).getTime() : Infinity;
      const isLive = LIVE_KEYWORDS.some(kw => title.toLowerCase().includes(kw));
      const isRecent = ageMs > 0 && ageMs < 30 * 60_000;
      candidates.push({ videoId, title, isLive, isRecent });
    }

    // Sort: live-keyword entries first, then recent, then rest
    candidates.sort((a, b) => {
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      if (a.isRecent !== b.isRecent) return a.isRecent ? -1 : 1;
      return 0;
    });

    // Validate top candidates with oEmbed (try up to 3)
    const toValidate = candidates.slice(0, 3);
    for (const c of toValidate) {
      const valid = await validateVideoEmbed(c.videoId);
      if (valid) {
        return { status: 'live', videoId: c.videoId };
      }
    }

    // No validated video ID — channel is alive but no embeddable video found
    // Don't return a videoId so it falls back to live_stream?channel= format
    return { status: 'live' };
  } catch {
    return { status: 'unknown' };
  }
}

function useLiveStatus() {
  // All news channels default to 'live' — they are 24/7 streams
  const [status, setStatus] = useState<Record<string, ChannelStatus>>(() => {
    const init: Record<string, ChannelStatus> = {};
    NEWS_CHANNELS.forEach(ch => { init[ch.id] = 'live'; });
    return init;
  });
  const [videoIds, setVideoIds] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkAll = useCallback(async () => {
    setChecking(true);
    setStatus(() => {
      const next: Record<string, ChannelStatus> = {};
      NEWS_CHANNELS.forEach(ch => { next[ch.id] = 'checking'; });
      return next;
    });

    // Try client-side RSS check (browser fetch, no Docker IP issues)
    // Collect raw results first, then decide fallback strategy
    const rawResults: Record<string, { status: ChannelStatus; videoId?: string }> = {};
    await Promise.allSettled(
      NEWS_CHANNELS.map(ch =>
        checkChannelClientSide(ch).then(result => { rawResults[ch.id] = result; })
      )
    );

    // Extract video IDs from results
    const newVideoIds: Record<string, string> = {};
    for (const [chId, result] of Object.entries(rawResults)) {
      if (result.videoId) newVideoIds[chId] = result.videoId;
    }
    setVideoIds(prev => ({ ...prev, ...newVideoIds }));

    const unknownCount = Object.values(rawResults).filter(r => r.status === 'unknown').length;

    // If >80% unknown, CORS is blocking client-side checks — try backend
    if (unknownCount / NEWS_CHANNELS.length > 0.8) {
      try {
        const { data } = await api.get('/map/live-check');
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const merged: Record<string, ChannelStatus> = {};
          NEWS_CHANNELS.forEach(ch => {
            const bs = (data as Record<string, ChannelStatus>)[ch.id];
            // Treat 'unknown' as 'live' — 24/7 news channels are presumed on-air
            merged[ch.id] = (!bs || bs === 'unknown') ? 'live' : bs;
          });
          setStatus(merged);
          setChecking(false);
          setLastChecked(new Date());
          return;
        }
      } catch { /* backend unavailable */ }
    }

    // Apply client-side results: 'unknown' → 'live' for 24/7 channels
    const merged: Record<string, ChannelStatus> = {};
    NEWS_CHANNELS.forEach(ch => {
      const raw = rawResults[ch.id]?.status ?? 'unknown';
      merged[ch.id] = raw === 'unknown' ? 'live' : raw;
    });
    setStatus(merged);
    setChecking(false);
    setLastChecked(new Date());
  }, []);

  return { status, videoIds, checking, lastChecked, checkAll };
}

// ─────────────────────────────────────────────
// Webcam embed resolution
// Priority: embed_url (Windy player) > YouTube URL > thumbnail player
// ─────────────────────────────────────────────

function resolveWebcamEmbed(cam: WebcamStream, muted: boolean): { type: 'iframe'; src: string } | { type: 'thumb' } | { type: 'open'; url: string } | null {
  // 1. Windy embed player (best — native live stream)
  if (cam.embed_url) return { type: 'iframe', src: cam.embed_url };

  // 2. YouTube video URL → extract ID and embed
  if (cam.player_url) {
    const ytMatch = cam.player_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (ytMatch) {
      const params = new URLSearchParams({ autoplay: '1', mute: muted ? '1' : '0', controls: '1', rel: '0', modestbranding: '1', origin: window.location.origin });
      return { type: 'iframe', src: `https://www.youtube.com/embed/${ytMatch[1]}?${params}` };
    }
    // Non-embeddable page URL → open button
    return { type: 'open', url: cam.player_url };
  }

  // 3. Thumbnail only → static/auto-refresh image
  if (cam.thumbnail) return { type: 'thumb' };

  return null;
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

const ThumbnailImg = memo(function ThumbnailImg({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [imgSrc, setImgSrc] = useState(() => proxyThumb(src) || null);
  useEffect(() => { setFailed(false); setImgSrc(proxyThumb(src) || null); }, [src]);
  if (failed || !imgSrc) return <div className={clsx('flex items-center justify-center bg-[#0A1020]', className)}><Camera size={16} className="text-[#2A3545]" /></div>;
  return <img src={imgSrc} alt={alt} className={className} referrerPolicy="no-referrer" loading="lazy" onError={() => { imgSrc !== src && src ? setImgSrc(src) : setFailed(true); }} />;
});

function AutoRefreshThumb({ cam, onLoad }: { cam: WebcamStream; onLoad: () => void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 10_000); return () => clearInterval(iv); }, []);
  const src = cam.thumbnail ? `${proxyThumb(cam.thumbnail)}&t=${tick}` : undefined;
  return (
    <div className="relative w-full h-full bg-black">
      {src
        ? <img src={src} alt={cam.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" onLoad={onLoad} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        : <div className="w-full h-full flex items-center justify-center"><Camera size={24} className="text-[#2A3545]" /></div>
      }
      {cam.player_url && (
        <div className="absolute inset-0 flex items-center justify-center">
          <button onClick={() => window.open(cam.player_url!, '_blank', 'noopener,noreferrer')} className="flex items-center gap-2 px-3 py-2 bg-[#FF6D2A]/15 hover:bg-[#FF6D2A]/25 border border-[#FF6D2A]/40 transition-all">
            <ExternalLink size={10} className="text-[#FF6D2A]" />
            <span className="text-[9px] font-mono font-bold text-[#FF6D2A] tracking-widest">OPEN LIVE</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Grid cell player — supports news + webcam + fallback
// ─────────────────────────────────────────────

interface GridCellProps {
  item: ActiveItem | null;
  selected: boolean;
  cellIndex: number;
  muted: boolean;
  videoId?: string;
  onSelect: () => void;
  onClear: () => void;
  onToggleMute: () => void;
  onFullscreen: () => void;
}

function GridCell({ item, selected, muted, videoId, onSelect, onClear, onToggleMute, onFullscreen }: GridCellProps) {
  const [loading, setLoading] = useState(true);
  const [embedError, setEmbedError] = useState(false);
  // Fallback chain: 0 = use videoId, 1 = use live_stream?channel=, 2 = give up
  const [fallbackLevel, setFallbackLevel] = useState(0);
  const embedWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    setLoading(true);
    setEmbedError(false);
    setFallbackLevel(0);
    if (embedWatchdogRef.current) clearTimeout(embedWatchdogRef.current);
  }, [item]);

  // Listen for YouTube postMessage errors to detect "video unavailable"
  useEffect(() => {
    if (!item || item.kind !== 'news') return;

    const handleMessage = (event: MessageEvent) => {
      // YouTube sends postMessage events — check for error indicators
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data);
          // YouTube Player API error codes: 2=invalid param, 5=html5 error, 100=not found, 101/150=embed blocked
          if (parsed?.event === 'onError' || parsed?.info?.playerState === -1) {
            // Error detected — try next fallback
            if (fallbackLevel === 0 && videoId) {
              setFallbackLevel(1); // Try live_stream?channel= format
              setLoading(true);
            } else {
              setEmbedError(true);
              setLoading(false);
            }
          }
          if (parsed?.event === 'onReady' || parsed?.event === 'onStateChange') {
            // Player is working — cancel watchdog
            if (embedWatchdogRef.current) {
              clearTimeout(embedWatchdogRef.current);
              embedWatchdogRef.current = null;
            }
          }
        } catch { /* not JSON — ignore */ }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [item, fallbackLevel, videoId]);

  // Start embed watchdog when iframe loads — if no YouTube player event within 12s, try fallback
  // Must be before early return to satisfy React rules of hooks
  const handleIframeLoad = useCallback(() => {
    setLoading(false);
    if (item?.kind === 'news' && !embedError) {
      if (embedWatchdogRef.current) clearTimeout(embedWatchdogRef.current);
      embedWatchdogRef.current = setTimeout(() => {
        if (fallbackLevel === 0 && videoId) {
          setFallbackLevel(1);
          setLoading(true);
        }
      }, 12_000);
    }
  }, [item, embedError, fallbackLevel, videoId]);

  if (!item) {
    return (
      <div
        onClick={onSelect}
        className={clsx(
          'relative flex flex-col items-center justify-center bg-[#030711] cursor-pointer transition-all border',
          selected ? 'border-[#FF6D2A]/60' : 'border-[#152030] hover:border-[#FF6D2A]/30',
        )}
      >
        {selected && <div className="absolute inset-0 bg-[#FF6D2A]/[0.03]" />}
        {selected && <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#FF6D2A]/60" />}
        <Tv size={20} className="text-[#2A3545] mb-2" />
        <span className="text-[8px] font-mono text-[#2A3545] tracking-[2px]">
          {selected ? 'SELECT CHANNEL' : 'CLICK TO FOCUS'}
        </span>
      </div>
    );
  }

  const ch = item.kind === 'news' ? item.ch : null;
  const cam = item.kind === 'camera' ? item.cam : null;
  const accentColor = ch?.color ?? '#FF6D2A';

  // Resolve embed strategy with fallback chain for news channels
  let embedSrc: string | null = null;
  let openUrl: string | null = null;
  let showThumb = false;

  if (ch) {
    if (fallbackLevel === 0 && videoId) {
      embedSrc = youtubeChannelEmbed(ch.youtubeChannelId, muted, videoId);
    } else if (fallbackLevel <= 1) {
      embedSrc = youtubeChannelEmbed(ch.youtubeChannelId, muted);
    }
    openUrl = ytWatchUrl(ch.youtubeChannelId);
  } else if (cam) {
    const resolved = resolveWebcamEmbed(cam, muted);
    if (resolved?.type === 'iframe') embedSrc = resolved.src;
    else if (resolved?.type === 'open') openUrl = resolved.url;
    else if (resolved?.type === 'thumb') showThumb = true;
  }

  const title = ch?.name ?? cam?.name ?? '';
  const itemKey = ch ? `ch-${ch.id}-fb${fallbackLevel}` : `cam-${cam?.id}`;

  return (
    <div
      className={clsx(
        'relative group bg-black overflow-hidden border transition-all cursor-pointer',
        selected ? 'border-[#FF6D2A]/70' : 'border-[#152030] hover:border-[#FF6D2A]/30',
      )}
      onClick={onSelect}
    >
      {selected && <div className="absolute top-0 left-0 right-0 h-[2px] z-20" style={{ background: accentColor }} />}

      {/* Loading state */}
      {loading && embedSrc && !embedError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#030711]">
          <Loader2 size={16} className="text-[#FF6D2A]/40 animate-spin" />
        </div>
      )}

      {/* Embed iframe */}
      {embedSrc && !embedError ? (
        <iframe
          ref={iframeRef}
          key={`${itemKey}-${muted}`}
          src={embedSrc}
          className="w-full h-full"
          style={{ pointerEvents: selected ? 'auto' : 'none' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={title}
          onLoad={handleIframeLoad}
          onError={() => {
            setLoading(false);
            if (fallbackLevel === 0 && videoId && ch) {
              setFallbackLevel(1);
              setLoading(true);
            } else {
              setEmbedError(true);
            }
          }}
        />
      ) : showThumb && cam ? (
        <AutoRefreshThumb cam={cam} onLoad={() => setLoading(false)} />
      ) : embedError ? (
        /* Embed hard-failed — show retry + open button */
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#030711]">
          <AlertCircle size={18} className="text-[#FF6D2A]/50" />
          <span className="text-[8px] font-mono text-[#4E6070] tracking-widest">STREAM UNAVAILABLE</span>
          <div className="flex items-center gap-2">
            {ch && (
              <button
                onClick={e => { e.stopPropagation(); setEmbedError(false); setFallbackLevel(0); setLoading(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#152030]/80 hover:bg-[#1E3050] border border-[#2A3545]/40 transition-all"
              >
                <RefreshCw size={9} className="text-[#4E6070]" />
                <span className="text-[8px] font-mono font-bold text-[#4E6070] tracking-widest">RETRY</span>
              </button>
            )}
            {(openUrl) && (
              <button
                onClick={e => { e.stopPropagation(); window.open(openUrl, '_blank', 'noopener,noreferrer'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF6D2A]/15 hover:bg-[#FF6D2A]/25 border border-[#FF6D2A]/40 transition-all"
              >
                <ExternalLink size={9} className="text-[#FF6D2A]" />
                <span className="text-[8px] font-mono font-bold text-[#FF6D2A] tracking-widest">WATCH ON YT</span>
              </button>
            )}
          </div>
        </div>
      ) : openUrl ? (
        /* openUrl only — external site, no embed */
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#030711]">
          <Tv size={20} className="text-[#FF6D2A]/40" />
          <button
            onClick={e => { e.stopPropagation(); window.open(openUrl, '_blank', 'noopener,noreferrer'); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF6D2A]/15 hover:bg-[#FF6D2A]/25 border border-[#FF6D2A]/40 transition-all"
          >
            <ExternalLink size={9} className="text-[#FF6D2A]" />
            <span className="text-[8px] font-mono font-bold text-[#FF6D2A] tracking-widest">WATCH LIVE</span>
          </button>
        </div>
      ) : null}

      {/* Always-visible "open in YouTube" button — top-right corner */}
      {openUrl && !embedError && (
        <div className="absolute top-1 right-1 z-30 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => window.open(openUrl, '_blank', 'noopener,noreferrer')}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-black/80 border border-[#FF6D2A]/30 text-[#FF6D2A] hover:bg-[#FF6D2A]/20 transition-all"
          >
            <ExternalLink size={7} />
            <span className="text-[6px] font-mono font-bold tracking-widest">YT LIVE</span>
          </button>
        </div>
      )}

      {/* Bottom overlay (hover + selected) */}
      <div className={clsx(
        'absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-gradient-to-t from-black/90 to-transparent transition-opacity z-20',
        selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}>
        <div className="flex items-center gap-1.5 pointer-events-none overflow-hidden">
          {ch && <span className="text-sm leading-none shrink-0">{ch.flag}</span>}
          <span className="text-[8px] font-mono font-bold text-[#D0D9E8] truncate">{title}</span>
          <div className="flex items-center gap-0.5 bg-[#FF3A3A]/80 px-1 py-0.5 shrink-0">
            <Radio size={5} className="text-white" />
            <span className="text-[5px] font-mono text-white font-bold">LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 pointer-events-auto shrink-0" onClick={e => e.stopPropagation()}>
          {embedSrc && !embedError && (
            <button onClick={onToggleMute} className="text-[6px] font-mono text-[#4E6070] hover:text-white px-1 border border-[#152030] leading-4">
              {muted ? 'UNMUTE' : 'MUTE'}
            </button>
          )}
          <button onClick={onFullscreen} className="p-1 text-[#4E6070] hover:text-[#FF6D2A]"><Maximize2 size={9} /></button>
          <button onClick={onClear} className="p-1 text-[#4E6070] hover:text-[#FF3A3A]"><X size={9} /></button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Fullscreen
// ─────────────────────────────────────────────

function FullscreenPlayer({ item, videoId, onClose }: { item: ActiveItem; videoId?: string; onClose: () => void }) {
  const ch = item.kind === 'news' ? item.ch : null;
  const cam = item.kind === 'camera' ? item.cam : null;
  const [fsFallback, setFsFallback] = useState(0); // 0=videoId, 1=live_stream, 2=error

  let src: string | null = null;
  let openUrl: string | null = null;

  if (ch) {
    if (fsFallback === 0 && videoId) {
      src = youtubeChannelEmbed(ch.youtubeChannelId, false, videoId);
    } else if (fsFallback <= 1) {
      src = youtubeChannelEmbed(ch.youtubeChannelId, false);
    }
    openUrl = ytWatchUrl(ch.youtubeChannelId);
  } else if (cam) {
    const resolved = resolveWebcamEmbed(cam, false);
    if (resolved?.type === 'iframe') src = resolved.src;
    else if (resolved?.type === 'open') openUrl = resolved.url;
  }

  // Listen for YouTube error messages in fullscreen
  useEffect(() => {
    if (!ch) return;
    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed?.event === 'onError') {
            if (fsFallback === 0 && videoId) setFsFallback(1);
            else setFsFallback(2);
          }
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [ch, fsFallback, videoId]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-[#060B16]/95 border-b border-[#152030] shrink-0">
        <div className="flex items-center gap-2.5">
          {ch && <span className="text-xl leading-none">{ch.flag}</span>}
          <span className="text-sm font-mono font-bold text-[#D0D9E8]">{ch?.name ?? cam?.name}</span>
          <div className="flex items-center gap-1 bg-[#FF3A3A]/15 border border-[#FF3A3A]/30 px-2 py-0.5">
            <div className="w-1.5 h-1.5 bg-[#FF3A3A] animate-pulse" />
            <span className="text-[8px] font-mono text-[#FF3A3A] tracking-[2px]">LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ch && fsFallback > 0 && (
            <button onClick={() => setFsFallback(0)} className="flex items-center gap-1 px-2 py-1 border border-[#152030] text-[8px] font-mono text-[#4E6070] hover:text-[#00E676] transition-all">
              <RefreshCw size={9} /> RETRY
            </button>
          )}
          {openUrl && (
            <button onClick={() => window.open(openUrl!, '_blank', 'noopener,noreferrer')} className="flex items-center gap-1 px-2 py-1 border border-[#152030] text-[8px] font-mono text-[#4E6070] hover:text-[#FF6D2A] transition-all">
              <ExternalLink size={9} /> OPEN
            </button>
          )}
          <button onClick={onClose} className="p-2 text-[#4E6070] hover:text-[#D0D9E8] transition-colors"><X size={16} /></button>
        </div>
      </div>
      {src && fsFallback < 2 ? (
        <iframe
          key={`fs-${ch?.id ?? cam?.id}-fb${fsFallback}`}
          src={src}
          className="flex-1 w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={ch?.name ?? cam?.name ?? ''}
          onError={() => {
            if (fsFallback === 0 && videoId && ch) setFsFallback(1);
            else setFsFallback(2);
          }}
        />
      ) : cam ? (
        <AutoRefreshThumb cam={cam} onLoad={() => {}} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <AlertCircle size={32} className="text-[#FF6D2A]/40" />
          <span className="text-[10px] font-mono text-[#4E6070] tracking-widest">STREAM NOT DIRECTLY EMBEDDABLE</span>
          <div className="flex items-center gap-3">
            {ch && (
              <button onClick={() => setFsFallback(0)} className="flex items-center gap-2 px-4 py-2 bg-[#152030]/80 border border-[#2A3545]/40 text-[#4E6070] font-mono text-sm hover:bg-[#1E3050] transition-all">
                <RefreshCw size={14} /> RETRY
              </button>
            )}
            {openUrl && (
              <button onClick={() => window.open(openUrl!, '_blank', 'noopener,noreferrer')} className="flex items-center gap-2 px-4 py-2 bg-[#FF6D2A]/15 border border-[#FF6D2A]/40 text-[#FF6D2A] font-mono text-sm hover:bg-[#FF6D2A]/25 transition-all">
                <ExternalLink size={14} /> WATCH ON YOUTUBE
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sidebar rows
// ─────────────────────────────────────────────

function LiveDot({ status }: { status: ChannelStatus }) {
  if (status === 'checking') return <Loader2 size={8} className="text-[#FFA800] animate-spin shrink-0" />;
  if (status === 'offline')  return <div className="w-1.5 h-1.5 bg-[#4E6070] rounded-full shrink-0" title="Offline" />;
  if (status === 'unknown')  return <div className="w-1.5 h-1.5 bg-[#FFA800]/50 rounded-full shrink-0" title="Status unknown — click to try" />;
  return <div className="w-1.5 h-1.5 bg-[#FF3A3A] animate-pulse rounded-full shrink-0" title="Live" />;
}

function ChannelRow({ ch, active, liveStatus, onClick }: { ch: NewsChannel; active: boolean; liveStatus: ChannelStatus; onClick: () => void }) {
  const isOffline = liveStatus === 'offline';
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2 px-2 py-1.5 border-l-[2px] transition-all text-left',
        active
          ? 'border-[#FF6D2A] bg-[rgba(255,109,42,0.09)] text-[#D0D9E8]'
          : isOffline
          ? 'border-transparent text-[#2A3545] hover:text-[#4E6070] hover:bg-[#0A1020]'
          : 'border-transparent text-[#4E6070] hover:text-[#D0D9E8] hover:bg-[#0A1020] hover:border-[#1E3050]',
      )}
    >
      <span className={clsx('text-base leading-none shrink-0', isOffline && 'opacity-40')}>{ch.flag}</span>
      <div className="min-w-0 flex-1">
        <div className={clsx('text-[9px] font-mono font-bold truncate', isOffline && 'opacity-50')}>{ch.name}</div>
        <div className="flex items-center gap-1 mt-px">
          <span className="text-[6px] font-mono text-[#2A3545] border border-[#152030] px-0.5">{ch.lang}</span>
          <span className="text-[6px] font-mono text-[#2A3545] truncate">{ch.country}</span>
        </div>
      </div>
      <LiveDot status={liveStatus} />
    </button>
  );
}

function CamRow({ cam, active, onClick }: { cam: WebcamStream; active: boolean; onClick: () => void }) {
  const hasEmbed = !!(cam.embed_url || cam.player_url?.includes('youtube'));
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2 px-2 py-1.5 border-l-[2px] transition-all text-left',
        active
          ? 'border-[#00CFEB] bg-[rgba(0,207,235,0.06)] text-[#D0D9E8]'
          : 'border-transparent text-[#4E6070] hover:text-[#D0D9E8] hover:bg-[#0A1020] hover:border-[#1E3050]',
      )}
    >
      <div className="w-12 h-7 shrink-0 bg-[#0A1020] overflow-hidden">
        <ThumbnailImg src={cam.thumbnail} alt={cam.name} className="w-full h-full object-cover opacity-70" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-mono font-bold truncate">{cam.name}</div>
        <div className="flex items-center gap-1 mt-px">
          {hasEmbed
            ? <><div className="w-1 h-1 bg-[#00E676] shrink-0" /><span className="text-[6px] font-mono text-[#00E676]">EMBEDDABLE</span></>
            : <><ExternalLink size={6} className="text-[#4E6070]" /><span className="text-[6px] font-mono text-[#4E6070]">EXTERNAL</span></>
          }
          <span className="text-[6px] font-mono text-[#2A3545] truncate ml-1">{cam.city || cam.country}</span>
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────
// Main MediaPanel
// ─────────────────────────────────────────────

export const MediaPanel = memo(function MediaPanel({ defaultTab = 'news', fullPage = false }: MediaPanelProps) {
  const [tab, setTab] = useState<'cameras' | 'news'>(defaultTab);
  const [gridMode, setGridMode] = useState<GridMode>('quad');
  const [cells, setCells] = useState<(ActiveItem | null)[]>([null, null, null, null, null, null, null, null, null, null, null, null]);
  const [selectedCell, setSelectedCell] = useState<number>(0);
  const [mutedCells, setMutedCells] = useState<boolean[]>([true, true, true, true, true, true, true, true, true, true, true, true]);
  const [fullscreenItem, setFullscreenItem] = useState<ActiveItem | null>(null);
  const [regionFilter, setRegionFilter] = useState<string>('ALL');
  const [langFilter, setLangFilter] = useState<string>('ALL');
  const camScrollRef = useRef<HTMLDivElement>(null!);

  const { webcams, loading: camsLoading, refresh: refreshCams } = useFetchWebcams();
  const { status: liveStatus, videoIds: liveVideoIds, checking: liveChecking, lastChecked, checkAll: checkLive } = useLiveStatus();
  const embeddableCams = webcams.filter(c => c.embed_url || c.player_url || c.thumbnail);

  const filteredNews = NEWS_CHANNELS.filter(ch => {
    if (regionFilter !== 'ALL' && ch.region !== regionFilter) return false;
    if (langFilter !== 'ALL' && ch.lang !== langFilter) return false;
    return true;
  });

  const cfg = GRID_CONFIGS[gridMode];
  const activeCells = cells.slice(0, cfg.count);

  const assignToCell = useCallback((item: ActiveItem) => {
    const cellIdx = selectedCell;
    setCells(prev => { const n = [...prev]; n[cellIdx] = item; return n; });
    setSelectedCell(prev => {
      for (let i = 1; i <= cfg.count; i++) {
        const idx = (prev + i) % cfg.count;
        if (!cells[idx]) return idx;
      }
      return (prev + 1) % cfg.count;
    });
  }, [selectedCell, cfg.count, cells]);

  const clearCell = useCallback((idx: number) => {
    setCells(prev => { const n = [...prev]; n[idx] = null; return n; });
  }, []);

  const toggleMute = useCallback((idx: number) => {
    setMutedCells(prev => { const n = [...prev]; n[idx] = !n[idx]; return n; });
  }, []);

  if (fullscreenItem) {
    return <FullscreenPlayer item={fullscreenItem} videoId={fullscreenItem.kind === 'news' ? liveVideoIds[fullscreenItem.ch.id] : undefined} onClose={() => setFullscreenItem(null)} />;
  }

  // ── Full-page layout ──
  if (fullPage) {
    return (
      <div className="h-full flex flex-col bg-[#030711] overflow-hidden">

        {/* Toolbar */}
        <div className="h-9 bg-[#060B16] border-b border-[#152030] flex items-center px-3 gap-3 shrink-0">
          <div className="flex items-center gap-1.5 border-r border-[#152030] pr-3 shrink-0">
            <div className="w-[6px] h-[6px] bg-[#FF3A3A] animate-pulse" />
            <span className="text-[8px] font-bold text-[#FF3A3A] tracking-[2px]">LIVE MEDIA</span>
          </div>

          {/* Grid picker */}
          <div className="flex items-center gap-0.5 shrink-0">
            <span className="text-[7px] text-[#2A3545] tracking-widest mr-1">GRID</span>
            {(Object.entries(GRID_CONFIGS) as [GridMode, typeof GRID_CONFIGS[GridMode]][]).map(([mode, c]) => (
              <button key={mode} onClick={() => { setGridMode(mode); setSelectedCell(0); }}
                className={clsx('flex items-center gap-1 px-2 py-1 text-[7px] font-mono border transition-all',
                  gridMode === mode ? 'border-[#FF6D2A]/50 bg-[#FF6D2A]/10 text-[#FF6D2A]' : 'border-[#152030] text-[#4E6070] hover:text-[#D0D9E8]')}
                title={c.label}
              >
                <c.Icon size={9} /><span>{c.label}</span>
              </button>
            ))}
          </div>

          {/* Tab */}
          <div className="flex items-center gap-0.5 border-l border-[#152030] pl-3 shrink-0">
            <button onClick={() => setTab('news')} className={clsx('flex items-center gap-1 px-2 py-1 text-[7px] font-mono border transition-all',
              tab === 'news' ? 'border-[#FF6D2A]/50 bg-[#FF6D2A]/10 text-[#FF6D2A]' : 'border-[#152030] text-[#4E6070] hover:text-[#D0D9E8]')}>
              <Tv size={8} /> NEWS
            </button>
            <button onClick={() => setTab('cameras')} className={clsx('flex items-center gap-1 px-2 py-1 text-[7px] font-mono border transition-all',
              tab === 'cameras' ? 'border-[#00CFEB]/50 bg-[#00CFEB]/08 text-[#00CFEB]' : 'border-[#152030] text-[#4E6070] hover:text-[#D0D9E8]')}>
              <Camera size={8} /> CAM
            </button>
          </div>

          {/* Filters */}
          {tab === 'news' && (
            <div className="flex items-center gap-0.5 border-l border-[#152030] pl-3 overflow-hidden">
              {REGIONS.map(r => (
                <button key={r} onClick={() => setRegionFilter(r)}
                  className={clsx('px-1.5 py-0.5 text-[6px] font-mono border transition-all shrink-0',
                    regionFilter === r ? 'border-[#FF6D2A]/40 bg-[#FF6D2A]/08 text-[#FF6D2A]' : 'border-transparent text-[#2A3545] hover:text-[#4E6070]')}>
                  {r}
                </button>
              ))}
              <span className="text-[#152030] mx-1 shrink-0">│</span>
              {LANGS.map(l => (
                <button key={l} onClick={() => setLangFilter(l)}
                  className={clsx('px-1.5 py-0.5 text-[6px] font-mono border transition-all shrink-0',
                    langFilter === l ? 'border-[#00CFEB]/40 bg-[#00CFEB]/08 text-[#00CFEB]' : 'border-transparent text-[#2A3545] hover:text-[#4E6070]')}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {tab === 'news' && (
            <button
              onClick={checkLive}
              disabled={liveChecking}
              className={clsx(
                'ml-1 flex items-center gap-1 px-2 py-1 text-[6px] font-mono border transition-all shrink-0',
                liveChecking
                  ? 'border-[#FFA800]/40 text-[#FFA800]'
                  : 'border-[#152030] text-[#4E6070] hover:text-[#00E676] hover:border-[#00E67640]',
              )}
              title={lastChecked ? `Last checked: ${lastChecked.toLocaleTimeString()}` : 'Check which channels are live now'}
            >
              <RefreshCw size={8} className={liveChecking ? 'animate-spin' : ''} />
              {liveChecking ? 'CHECKING...' : lastChecked ? 'RECHECK LIVE' : 'CHECK LIVE'}
            </button>
          )}
          {tab === 'cameras' && (
            <button onClick={refreshCams} disabled={camsLoading} className="ml-1 p-1 text-[#4E6070] hover:text-[#D0D9E8] disabled:opacity-30 border border-[#152030]">
              <RefreshCw size={9} className={camsLoading ? 'animate-spin' : ''} />
            </button>
          )}

          <div className="flex-1" />
          <span className="text-[7px] text-[#2A3545] font-mono tracking-widest shrink-0">
            CELL {selectedCell + 1}/{cfg.count} · CLICK CHANNEL TO ASSIGN
          </span>
        </div>

        {/* Sidebar + Grid */}
        <div className="flex flex-1 overflow-hidden">

          {/* Sidebar */}
          <div className="w-[200px] bg-[#060B16] border-r border-[#152030] flex flex-col shrink-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#1E3050 transparent' }}>
              {tab === 'news'
                ? filteredNews.map(ch => (
                  <ChannelRow key={ch.id} ch={ch}
                    active={activeCells.some(c => c?.kind === 'news' && c.ch.id === ch.id)}
                    liveStatus={liveStatus[ch.id] ?? 'unknown'}
                    onClick={() => assignToCell({ kind: 'news', ch })}
                  />
                ))
                : camsLoading && embeddableCams.length === 0
                ? <div className="flex items-center justify-center py-8"><Loader2 size={14} className="text-[#FF6D2A]/40 animate-spin" /></div>
                : embeddableCams.length === 0
                ? <div className="flex flex-col items-center justify-center py-10 gap-2"><WifiOff size={16} className="text-[#2A3545]" /><span className="text-[8px] font-mono text-[#2A3545]">NO CAMERAS</span></div>
                : embeddableCams.map(cam => (
                  <CamRow key={cam.id} cam={cam}
                    active={activeCells.some(c => c?.kind === 'camera' && c.cam.id === cam.id)}
                    onClick={() => assignToCell({ kind: 'camera', cam })}
                  />
                ))
              }
            </div>
            <div className="border-t border-[#152030] px-3 py-2 shrink-0">
              {tab === 'news' ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-[#FF3A3A] animate-pulse rounded-full" />
                      <span className="text-[7px] font-mono text-[#4E6070]">
                        <span className="text-[#FF3A3A]">{filteredNews.length}</span> CHANNELS
                        {Object.values(liveStatus).filter(s => s === 'live').length > 0 && (
                          <> · <span className="text-[#00E676]">{Object.values(liveStatus).filter(s => s === 'live').length} LIVE</span></>
                        )}
                      </span>
                    </div>
                  </div>
                  {lastChecked && (
                    <div className="text-[6px] font-mono text-[#2A3545]">
                      CHECKED {lastChecked.toLocaleTimeString()}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-[#00E676] animate-pulse rounded-full" /><span className="text-[7px] font-mono text-[#4E6070]"><span className="text-[#00E676]">{embeddableCams.length}</span> CAMERAS</span></div>
              )}
            </div>
          </div>

          {/* Video grid */}
          <div className="flex-1 bg-[#010308] overflow-hidden"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cfg.cols}, 1fr)`,
              gridTemplateRows: `repeat(${Math.ceil(cfg.count / cfg.cols)}, 1fr)`,
              gap: '2px',
            }}
          >
            {activeCells.map((item, idx) => (
              <GridCell key={idx} item={item} selected={selectedCell === idx} cellIndex={idx}
                muted={mutedCells[idx]}
                videoId={item?.kind === 'news' ? liveVideoIds[item.ch.id] : undefined}
                onSelect={() => setSelectedCell(idx)}
                onClear={() => clearCell(idx)} onToggleMute={() => toggleMute(idx)}
                onFullscreen={() => item && setFullscreenItem(item)}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Compact floating panel ──
  return (
    <div className="flex flex-col bg-[#060B16]/95 border border-[#152030] overflow-hidden shadow-2xl" style={{ width: '480px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#152030] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-[5px] h-[5px] bg-[#FF3A3A] animate-pulse" />
          <span className="text-[8px] font-bold text-[#FF3A3A] tracking-[2px]">LIVE MEDIA</span>
          <div className="flex items-center gap-0.5 ml-2">
            <button onClick={() => setTab('news')} className={clsx('flex items-center gap-1 px-2 py-0.5 text-[7px] font-mono border transition-all', tab === 'news' ? 'border-[#FF6D2A]/50 bg-[#FF6D2A]/10 text-[#FF6D2A]' : 'border-[#152030] text-[#4E6070] hover:text-[#D0D9E8]')}><Tv size={8} /> NEWS</button>
            <button onClick={() => setTab('cameras')} className={clsx('flex items-center gap-1 px-2 py-0.5 text-[7px] font-mono border transition-all', tab === 'cameras' ? 'border-[#00CFEB]/50 bg-[#00CFEB]/08 text-[#00CFEB]' : 'border-[#152030] text-[#4E6070] hover:text-[#D0D9E8]')}><Camera size={8} /> CAM</button>
          </div>
        </div>
        {tab === 'news' && (
          <div className="flex items-center gap-0.5">
            {(['ALL', 'EN', 'FR'] as const).map(l => (
              <button key={l} onClick={() => setLangFilter(l === langFilter ? 'ALL' : l)} className={clsx('px-1.5 py-0.5 text-[6px] font-mono border transition-all', langFilter === l ? 'border-[#FF6D2A]/40 text-[#FF6D2A]' : 'border-[#152030] text-[#2A3545] hover:text-[#4E6070]')}>{l}</button>
            ))}
            <button
              onClick={checkLive}
              disabled={liveChecking}
              className={clsx(
                'flex items-center gap-0.5 px-1.5 py-0.5 text-[6px] font-mono border transition-all ml-1',
                liveChecking ? 'border-[#FFA800]/40 text-[#FFA800]' : 'border-[#152030] text-[#2A3545] hover:text-[#00E676] hover:border-[#00E67640]',
              )}
              title="Check which channels are live now"
            >
              <RefreshCw size={7} className={liveChecking ? 'animate-spin' : ''} />
              {liveChecking ? '...' : 'LIVE?'}
            </button>
          </div>
        )}
        {tab === 'cameras' && <button onClick={refreshCams} disabled={camsLoading} className="p-1 text-[#4E6070] hover:text-[#D0D9E8] disabled:opacity-30"><RefreshCw size={9} className={camsLoading ? 'animate-spin' : ''} /></button>}
      </div>

      {/* Active player */}
      {cells[0] && (
        <div className="relative shrink-0" style={{ aspectRatio: '16/9' }}>
          <GridCell item={cells[0]} selected={false} cellIndex={0} muted={mutedCells[0]}
            videoId={cells[0]?.kind === 'news' ? liveVideoIds[cells[0].ch.id] : undefined}
            onSelect={() => {}} onClear={() => clearCell(0)} onToggleMute={() => toggleMute(0)}
            onFullscreen={() => cells[0] && setFullscreenItem(cells[0])}
          />
        </div>
      )}

      {/* Channel scroll strip */}
      <div className="flex items-center gap-0.5 px-1 py-1.5 shrink-0">
        <button onClick={() => camScrollRef.current?.scrollBy({ left: -180, behavior: 'smooth' })} className="shrink-0 p-1 text-[#4E6070] hover:text-[#D0D9E8]"><ChevronLeft size={10} /></button>
        <div ref={camScrollRef} className="flex items-center gap-1 overflow-x-auto flex-1" style={{ scrollbarWidth: 'none' }}>
          {tab === 'news'
            ? NEWS_CHANNELS.filter(ch => langFilter === 'ALL' || ch.lang === langFilter).map(ch => (
              <button key={ch.id} onClick={() => setCells(prev => { const n = [...prev]; n[0] = { kind: 'news', ch }; return n; })}
                className={clsx('shrink-0 flex items-center gap-1.5 px-2 py-1 border transition-all text-[8px] font-mono',
                  cells[0]?.kind === 'news' && cells[0].ch.id === ch.id ? 'border-[#FF6D2A]/50 bg-[#FF6D2A]/10 text-[#FF6D2A]' : 'border-[#152030] text-[#4E6070] hover:text-[#D0D9E8] hover:border-[#1E3050]')}>
                <span>{ch.flag}</span><span className="truncate max-w-[70px]">{ch.name}</span>
                <div className="w-1 h-1 bg-[#FF3A3A] animate-pulse shrink-0" />
              </button>
            ))
            : embeddableCams.map(cam => (
              <button key={cam.id} onClick={() => setCells(prev => { const n = [...prev]; n[0] = { kind: 'camera', cam }; return n; })}
                className={clsx('shrink-0 flex items-center gap-1.5 px-2 py-1 border transition-all text-[8px] font-mono',
                  cells[0]?.kind === 'camera' && cells[0].cam.id === cam.id ? 'border-[#00CFEB]/50 bg-[#00CFEB]/08 text-[#00CFEB]' : 'border-[#152030] text-[#4E6070] hover:text-[#D0D9E8] hover:border-[#1E3050]')}>
                <Camera size={7} /><span className="truncate max-w-[80px]">{cam.name}</span>
              </button>
            ))
          }
        </div>
        <button onClick={() => camScrollRef.current?.scrollBy({ left: 180, behavior: 'smooth' })} className="shrink-0 p-1 text-[#4E6070] hover:text-[#D0D9E8]"><ChevronRight size={10} /></button>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────
// Toggle button
// ─────────────────────────────────────────────

export const MediaToggle = memo(function MediaToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 border text-[9px] font-mono font-bold tracking-wider transition-all',
        open ? 'bg-[#FF6D2A]/10 border-[#FF6D2A]/40 text-[#FF6D2A]' : 'bg-[#060B16]/90 border-[#152030] text-[#4E6070] hover:text-[#FF6D2A] hover:border-[#FF6D2A]/30')}
      title="Live Cameras & News"
    >
      <Camera size={11} />
      <span>MEDIA</span>
      {!open && <span className="w-1.5 h-1.5 bg-[#FF3A3A] animate-pulse" />}
    </button>
  );
});
