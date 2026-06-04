import { useEffect, useCallback, useMemo, useRef, useState, memo } from 'react';
import { useEventStore } from '@/stores/eventStore';
import { useMapStore } from '@/stores/mapStore';
import { getSocket } from '@/services/socket';
import type { SonarEvent } from '@/types/event';
import {
  AlertTriangle, Clock, MapPin, Radio, ExternalLink,
  Crosshair, Zap, Filter, Search, Users, Building, Play,
  ChevronDown, ChevronUp, Globe, Shield, Flame, Image as ImageIcon,
  Video, X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { clsx } from 'clsx';

const isHttpUrl = (u: unknown): u is string =>
  typeof u === 'string' && /^https?:\/\//.test(u);

// ── Severity config ───────────────────────────────────────────
const SEV_CONFIG: Record<string, { color: string; label: string; border: string; bg: string }> = {
  critical: { color: '#FF3A3A', label: 'CRIT', border: '#FF3A3A', bg: 'rgba(255,58,58,0.06)' },
  high:     { color: '#FF6D2A', label: 'HIGH', border: '#FF6D2A', bg: 'rgba(255,109,42,0.04)' },
  medium:   { color: '#FFA800', label: 'MED',  border: '#FFA800', bg: 'rgba(255,168,0,0.03)' },
  low:      { color: '#00E676', label: 'LOW',  border: '#00E676', bg: 'transparent' },
};

function getSevLevel(s: number) {
  if (s >= 8) return 'critical';
  if (s >= 6) return 'high';
  if (s >= 4) return 'medium';
  return 'low';
}

// ── Category visuals ──────────────────────────────────────────
const CATEGORY_VISUAL: Record<string, { emoji: string; color: string }> = {
  MILITARY_CONFLICT:  { emoji: '⚔️',  color: '#FF3A3A' },
  DIPLOMATIC:         { emoji: '🏳️', color: '#00CFEB' },
  ECONOMIC_POLICY:    { emoji: '📈',  color: '#00E676' },
  NATURAL_DISASTER:   { emoji: '🌊',  color: '#FFA800' },
  NUCLEAR:            { emoji: '☢️',  color: '#a855f7' },
  SANCTIONS:          { emoji: '🚫',  color: '#FF6D2A' },
  ELECTION:           { emoji: '🗳️', color: '#6366f1' },
  CRYPTO_MARKET:      { emoji: '₿',   color: '#FFA800' },
  ENERGY_COMMODITIES: { emoji: '⛽',  color: '#FF6D2A' },
  TERRORISM:          { emoji: '💣',  color: '#FF3A3A' },
  CYBER_ATTACK:       { emoji: '🛡️', color: '#a855f7' },
  MARITIME_SECURITY:  { emoji: '⚓',  color: '#00CFEB' },
  AVIATION_INCIDENT:  { emoji: '✈️',  color: '#FFA800' },
  EARTHQUAKE:         { emoji: '🌋',  color: '#FF6D2A' },
  WEATHER:            { emoji: '⛈️', color: '#38bdf8' },
  FIRE:               { emoji: '🔥',  color: '#FF3A3A' },
  TECHNOLOGY:         { emoji: '🔬',  color: '#00CFEB' },
  POLITICAL_DOMESTIC: { emoji: '🏛️', color: '#6366f1' },
  PANDEMIC_HEALTH:    { emoji: '🏥',  color: '#00E676' },
  INFRASTRUCTURE:     { emoji: '🏗️', color: '#94a3b8' },
};
const DEFAULT_VISUAL = { emoji: '🔴', color: '#4E6070' };

// ── Source icons & metadata ───────────────────────────────────
interface SourceMeta {
  icon: string;
  label: string;
  color: string;
  cred: number;
  type: 'agency' | 'social' | 'gov' | 'osint' | 'rss';
}

const SOURCE_META: Record<string, SourceMeta> = {
  // Wire agencies
  reuters:   { icon: '📡', label: 'Reuters',      color: '#FF6D2A', cred: 5, type: 'agency' },
  ap:        { icon: '📡', label: 'AP News',       color: '#FF3A3A', cred: 5, type: 'agency' },
  afp:       { icon: '📡', label: 'AFP',           color: '#3b82f6', cred: 5, type: 'agency' },
  // Major outlets
  bbc:       { icon: '📺', label: 'BBC',           color: '#dc2626', cred: 4, type: 'agency' },
  aljazeera: { icon: '📺', label: 'Al Jazeera',    color: '#f59e0b', cred: 4, type: 'agency' },
  cnn:       { icon: '📺', label: 'CNN',           color: '#dc2626', cred: 4, type: 'agency' },
  nytimes:   { icon: '📰', label: 'NY Times',      color: '#94a3b8', cred: 4, type: 'agency' },
  guardian:  { icon: '📰', label: 'The Guardian',   color: '#10b981', cred: 4, type: 'agency' },
  ft:        { icon: '📰', label: 'Financial Times',color: '#f59e0b', cred: 4, type: 'agency' },
  // Social
  twitter:   { icon: '𝕏',  label: 'X/Twitter',     color: '#94a3b8', cred: 2, type: 'social' },
  x:         { icon: '𝕏',  label: 'X/Twitter',     color: '#94a3b8', cred: 2, type: 'social' },
  telegram:  { icon: '✈️', label: 'Telegram',      color: '#0088cc', cred: 2, type: 'social' },
  reddit:    { icon: '🔗', label: 'Reddit',        color: '#ff4500', cred: 2, type: 'social' },
  // Gov / Science
  usgs:      { icon: '🌍', label: 'USGS',          color: '#10b981', cred: 5, type: 'gov' },
  noaa:      { icon: '🌡️', label: 'NOAA',         color: '#38bdf8', cred: 5, type: 'gov' },
  nasa:      { icon: '🚀', label: 'NASA',          color: '#3b82f6', cred: 5, type: 'gov' },
  firms:     { icon: '🔥', label: 'NASA FIRMS',    color: '#ef4444', cred: 5, type: 'gov' },
  // OSINT / Data
  gdelt:     { icon: '🔎', label: 'GDELT',         color: '#6366f1', cred: 3, type: 'osint' },
  acled:     { icon: '📊', label: 'ACLED',          color: '#f59e0b', cred: 3, type: 'osint' },
  cyber_threats: { icon: '🛡️', label: 'Cyber Intel', color: '#a855f7', cred: 4, type: 'osint' },
  // Think tanks & Analysis
  csis:      { icon: '🏛️', label: 'CSIS',          color: '#6366f1', cred: 4, type: 'osint' },
  brookings: { icon: '🏛️', label: 'Brookings',     color: '#6366f1', cred: 4, type: 'osint' },
  rand:      { icon: '🏛️', label: 'RAND',          color: '#6366f1', cred: 4, type: 'osint' },
  sipri:     { icon: '🏛️', label: 'SIPRI',         color: '#a855f7', cred: 5, type: 'osint' },
  chathamhouse: { icon: '🏛️', label: 'Chatham House', color: '#6366f1', cred: 4, type: 'osint' },
  carnegie:  { icon: '🏛️', label: 'Carnegie',      color: '#6366f1', cred: 4, type: 'osint' },
  bellingcat:{ icon: '🔍', label: 'Bellingcat',     color: '#f59e0b', cred: 4, type: 'osint' },
  hrw:       { icon: '⚖️', label: 'HRW',           color: '#10b981', cred: 4, type: 'osint' },
  amnesty:   { icon: '⚖️', label: 'Amnesty',       color: '#10b981', cred: 4, type: 'osint' },
  icg:       { icon: '🌍', label: 'Crisis Group',   color: '#FF6D2A', cred: 4, type: 'osint' },
  // Conflict monitors
  conflict_monitor: { icon: '⚔️', label: 'Conflict Intel', color: '#FF3A3A', cred: 4, type: 'osint' },
  government:{ icon: '🏛️', label: 'Government',    color: '#38bdf8', cred: 5, type: 'gov' },
  sanctions: { icon: '🚫', label: 'Sanctions',      color: '#FF6D2A', cred: 4, type: 'osint' },
  shodan:    { icon: '🖥️', label: 'Shodan',        color: '#a855f7', cred: 3, type: 'osint' },
  // Tracking
  aisstream: { icon: '🚢', label: 'AIS',           color: '#3b82f6', cred: 4, type: 'osint' },
  opensky:   { icon: '✈️', label: 'OpenSky',       color: '#38bdf8', cred: 4, type: 'osint' },
  youtube_live: { icon: '📺', label: 'YouTube Live', color: '#dc2626', cred: 3, type: 'social' },
  polymarket:{ icon: '📈', label: 'Polymarket',     color: '#FFA800', cred: 4, type: 'osint' },
  // RSS
  rss:       { icon: '📡', label: 'RSS Feed',      color: '#FF6D2A', cred: 3, type: 'rss' },
  osint:     { icon: '🔎', label: 'OSINT',         color: '#00CFEB', cred: 3, type: 'osint' },
};

function getSourceMeta(source: string): SourceMeta {
  if (!source) return { icon: '📡', label: 'Unknown', color: '#4E6070', cred: 2, type: 'rss' };
  const lower = source.toLowerCase().replace(/[^a-z_]/g, '');
  // Check direct match first
  if (SOURCE_META[lower]) return SOURCE_META[lower];
  // Check partial match (e.g. "gdelt:aol.com" → match "gdelt")
  for (const [key, meta] of Object.entries(SOURCE_META)) {
    if (lower.includes(key)) return { ...meta, label: source.split(':')[0] || meta.label };
  }
  return { icon: '📡', label: source.split(':')[0] || source, color: '#4E6070', cred: 3, type: 'rss' };
}

/** Extract username from source string if present (e.g. "twitter:@user" → "@user") */
function extractUsername(source: string): string | null {
  if (!source) return null;
  const parts = source.split(':');
  if (parts.length >= 2) {
    const user = parts.slice(1).join(':').trim();
    if (user && user !== source) return user.startsWith('@') ? user : `@${user}`;
  }
  return null;
}

// ── Country flag emoji ────────────────────────────────────────
const COUNTRY_CODES: Record<string, string> = {
  'United States': 'US', 'USA': 'US', 'US': 'US',
  'United Kingdom': 'GB', 'UK': 'GB', 'Russia': 'RU', 'China': 'CN',
  'France': 'FR', 'Germany': 'DE', 'Japan': 'JP', 'India': 'IN',
  'Brazil': 'BR', 'Canada': 'CA', 'Australia': 'AU', 'Italy': 'IT',
  'Spain': 'ES', 'Mexico': 'MX', 'South Korea': 'KR', 'North Korea': 'KP',
  'Turkey': 'TR', 'Iran': 'IR', 'Iraq': 'IQ', 'Syria': 'SY',
  'Israel': 'IL', 'Palestine': 'PS', 'Saudi Arabia': 'SA', 'UAE': 'AE',
  'Egypt': 'EG', 'Nigeria': 'NG', 'South Africa': 'ZA', 'Kenya': 'KE',
  'Ukraine': 'UA', 'Poland': 'PL', 'Taiwan': 'TW', 'Pakistan': 'PK',
  'Afghanistan': 'AF', 'Lebanon': 'LB', 'Yemen': 'YE', 'Libya': 'LY',
  'Sudan': 'SD', 'Somalia': 'SO', 'Ethiopia': 'ET', 'Indonesia': 'ID',
  'Colombia': 'CO', 'Venezuela': 'VE', 'Argentina': 'AR', 'Chile': 'CL',
  'Peru': 'PE', 'Morocco': 'MA', 'Algeria': 'DZ', 'Tunisia': 'TN',
  'Thailand': 'TH', 'Vietnam': 'VN', 'Philippines': 'PH', 'Malaysia': 'MY',
  'Myanmar': 'MM', 'Bangladesh': 'BD', 'Nepal': 'NP', 'Sri Lanka': 'LK',
  'Georgia': 'GE', 'Armenia': 'AM', 'Azerbaijan': 'AZ',
  'Serbia': 'RS', 'Kosovo': 'XK', 'Albania': 'AL', 'Bosnia': 'BA',
  'Greece': 'GR', 'Romania': 'RO', 'Hungary': 'HU', 'Czech Republic': 'CZ',
  'Sweden': 'SE', 'Norway': 'NO', 'Finland': 'FI', 'Denmark': 'DK',
  'Netherlands': 'NL', 'Belgium': 'BE', 'Switzerland': 'CH', 'Austria': 'AT',
  'Portugal': 'PT', 'Ireland': 'IE', 'New Zealand': 'NZ',
  'Singapore': 'SG', 'Cambodia': 'KH', 'Laos': 'LA', 'Mongolia': 'MN',
  'Cuba': 'CU', 'Haiti': 'HT', 'Guatemala': 'GT', 'Honduras': 'HN',
  'Nicaragua': 'NI', 'Panama': 'PA', 'Ecuador': 'EC', 'Bolivia': 'BO',
  'Paraguay': 'PY', 'Uruguay': 'UY', 'DR Congo': 'CD', 'DRC': 'CD',
  'Congo': 'CG', 'Cameroon': 'CM', 'Chad': 'TD', 'Mali': 'ML',
  'Niger': 'NE', 'Burkina Faso': 'BF', 'Senegal': 'SN', 'Ghana': 'GH',
  'Mozambique': 'MZ', 'Tanzania': 'TZ', 'Uganda': 'UG', 'Rwanda': 'RW',
  'Angola': 'AO', 'South Sudan': 'SS', 'Ivory Coast': 'CI',
  'Central African Republic': 'CF', 'Djibouti': 'DJ',
  'Jordan': 'JO', 'Oman': 'OM', 'Qatar': 'QA', 'Bahrain': 'BH',
  'Kuwait': 'KW', 'Belarus': 'BY', 'Moldova': 'MD', 'Cyprus': 'CY',
  'Latvia': 'LV', 'Lithuania': 'LT', 'Estonia': 'EE',
  'Bulgaria': 'BG', 'Slovakia': 'SK', 'Slovenia': 'SI', 'Croatia': 'HR',
  'Montenegro': 'ME', 'North Macedonia': 'MK', 'Iceland': 'IS',
  'Europe': 'EU', 'Middle East': 'UN',
};

function getFlag(country: unknown): string {
  if (!country || typeof country !== 'string') return '';
  if (country.length === 2) {
    const u = country.toUpperCase();
    if (/^[A-Z]{2}$/.test(u))
      return String.fromCodePoint(0x1F1E6 + u.charCodeAt(0) - 65, 0x1F1E6 + u.charCodeAt(1) - 65);
  }
  const code = COUNTRY_CODES[country] || COUNTRY_CODES[country.toUpperCase()];
  if (code) {
    return String.fromCodePoint(0x1F1E6 + code.charCodeAt(0) - 65, 0x1F1E6 + code.charCodeAt(1) - 65);
  }
  return '';
}

// ── Media lightbox ────────────────────────────────────────────
function MediaLightbox({ url, type, onClose }: { url: string; type: 'image' | 'video'; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 p-2 text-[#4E6070] hover:text-white z-10">
        <X size={20} />
      </button>
      {type === 'image' ? (
        <img src={url} alt="" className="max-w-[90vw] max-h-[90vh] object-contain" onClick={e => e.stopPropagation()} />
      ) : (
        <div className="w-[80vw] max-w-[900px] aspect-video" onClick={e => e.stopPropagation()}>
          {url.includes('youtube') || url.includes('youtu.be') ? (
            <iframe src={url.replace('watch?v=', 'embed/')} className="w-full h-full" allow="autoplay" allowFullScreen title="Video" />
          ) : (
            <video src={url} controls autoPlay className="w-full h-full" />
          )}
        </div>
      )}
    </div>
  );
}

// ── Event card component (memoized to avoid re-renders on parent update) ──
const EventCard = memo(function EventCard({ event, compact, isNew, onClick }: {
  event: SonarEvent;
  compact: boolean;
  isNew: boolean;
  onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; type: 'image' | 'video' } | null>(null);

  const sevLevel = getSevLevel(event.severity);
  const sev = SEV_CONFIG[sevLevel];
  const catVis = CATEGORY_VISUAL[event.category || ''] || DEFAULT_VISUAL;
  const flag = getFlag(event.country || '');
  const sourceMeta = getSourceMeta(event.source);
  const username = extractUsername(event.source);
  const entities = (event.entities && typeof event.entities === 'object' && !Array.isArray(event.entities))
    ? event.entities as Record<string, string[]>
    : null;
  const hasMedia = !!(event.image_url || event.video_url || (event.media_urls && event.media_urls.length > 0));
  const timeAgo = (() => {
    try { return formatDistanceToNow(new Date(event.created_at), { addSuffix: true }); }
    catch { return ''; }
  })();

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  return (
    <>
      {lightbox && <MediaLightbox url={lightbox.url} type={lightbox.type} onClose={() => setLightbox(null)} />}
      <div
        onClick={onClick}
        className={clsx(
          'border-b border-[#0D1826] hover:bg-[#0A1020] transition-all cursor-pointer group',
          'border-l-[2px]',
          isNew && 'animate-[slideIn_0.4s_ease-out]',
          event.severity >= 8 && 'relative',
        )}
        style={{ borderLeftColor: sev.border, background: isNew ? sev.bg : undefined }}
      >
        {/* Critical event pulse line */}
        {event.severity >= 8 && (
          <div className="absolute top-0 left-0 right-0 h-[1px] animate-pulse" style={{ background: `linear-gradient(90deg, ${sev.color}40, transparent)` }} />
        )}

        <div className="px-3 py-2">
          <div className="flex gap-2.5">
            {/* Category indicator */}
            <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
              <div
                className="w-9 h-9 flex items-center justify-center relative"
                style={{ background: `${catVis.color}10`, border: `1px solid ${catVis.color}25` }}
              >
                <span className="text-sm leading-none">{catVis.emoji}</span>
                {isNew && (
                  <span className="absolute -top-1.5 -right-1.5 text-[5px] font-black text-[#FF6D2A] bg-[#FF6D2A]/15 border border-[#FF6D2A]/40 px-0.5 py-px animate-pulse tracking-wider">
                    NEW
                  </span>
                )}
              </div>
              {/* Severity bar */}
              <div className="w-1 flex-1 min-h-[12px] bg-[#0D1826] overflow-hidden">
                <div className="w-full transition-all" style={{ height: `${Math.min(event.severity * 10, 100)}%`, background: sev.color }} />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Top meta row */}
              <div className="flex items-center gap-1.5 mb-0.5">
                {event.severity >= 7 && <AlertTriangle size={9} style={{ color: sev.color }} className="shrink-0" />}
                <span className="text-[8px] font-black tracking-wider" style={{ color: sev.color }}>{sev.label}</span>
                {event.category && (
                  <span className="text-[7px] tracking-wider font-bold" style={{ color: catVis.color }}>
                    {event.category.replace(/_/g, ' ')}
                  </span>
                )}
                {event.country && (
                  <span className="text-[7px] text-[#2A3545] flex items-center gap-0.5 shrink-0">
                    {flag ? <span className="text-[9px]">{flag}</span> : <Globe size={6} />}
                    <span className="hidden sm:inline">{event.country}</span>
                  </span>
                )}
                <span className="ml-auto text-[7px] text-[#2A3545] tabular-nums flex items-center gap-0.5 shrink-0">
                  <Clock size={6} />
                  {timeAgo}
                </span>
              </div>

              {/* Event text */}
              <p className={clsx(
                'text-[10px] leading-[1.6]',
                event.severity >= 7 ? 'text-[#D0D9E8]' : 'text-[#6B7F94]',
                !expanded && (compact ? 'line-clamp-2' : 'line-clamp-3')
              )}>
                {event.summary || event.raw_text?.slice(0, 200)}
              </p>

              {/* Media embed - prominent placement */}
              {hasMedia && !compact && (
                <div className="flex gap-1.5 mt-1.5 overflow-x-auto">
                  {isHttpUrl(event.image_url) && !imgError && (
                    <div
                      className="shrink-0 cursor-pointer group/img relative overflow-hidden border border-[#152030] hover:border-[#FF6D2A]/40 transition-all"
                      onClick={(e) => { e.stopPropagation(); setLightbox({ url: event.image_url!, type: 'image' }); }}
                    >
                      <img
                        src={event.image_url}
                        alt=""
                        loading="lazy"
                        className="w-[120px] h-[72px] object-cover transition-transform group-hover/img:scale-105"
                        onError={() => setImgError(true)}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity flex items-end p-1">
                        <span className="text-[6px] font-mono text-white flex items-center gap-0.5"><ImageIcon size={6} /> VIEW</span>
                      </div>
                    </div>
                  )}
                  {isHttpUrl(event.video_url) && (
                    <div
                      className="shrink-0 cursor-pointer group/vid relative w-[120px] h-[72px] bg-[#0A1020] border border-[#152030] hover:border-[#FF6D2A]/40 transition-all flex items-center justify-center"
                      onClick={(e) => { e.stopPropagation(); setLightbox({ url: event.video_url!, type: 'video' }); }}
                    >
                      <div className="w-8 h-8 rounded-full bg-[#FF6D2A]/20 flex items-center justify-center group-hover/vid:bg-[#FF6D2A]/30 transition-all">
                        <Play size={14} className="text-[#FF6D2A] ml-0.5" fill="#FF6D2A" />
                      </div>
                      <span className="absolute bottom-1 left-1 text-[5px] font-mono text-[#4E6070] flex items-center gap-0.5"><Video size={5} /> VIDEO</span>
                    </div>
                  )}
                  {(event.media_urls || []).slice(0, 3).map((mUrl, i) => (
                    isHttpUrl(mUrl) && !mUrl.includes(event.image_url || '') && (
                      <div
                        key={i}
                        className="shrink-0 cursor-pointer overflow-hidden border border-[#152030] hover:border-[#FF6D2A]/40 transition-all"
                        onClick={(e) => { e.stopPropagation(); setLightbox({ url: mUrl, type: 'image' }); }}
                      >
                        <img
                          src={mUrl}
                          alt=""
                          loading="lazy"
                          className="w-[72px] h-[72px] object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
                        />
                      </div>
                    )
                  ))}
                </div>
              )}

              {/* Entities */}
              {entities && Object.keys(entities).length > 0 && !compact && (
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {Object.entries(entities).slice(0, 4).map(([type, values]) => {
                    if (!Array.isArray(values) || values.length === 0) return null;
                    const Icon = type === 'persons' || type === 'people' ? Users
                      : type === 'organizations' || type === 'orgs' ? Building
                      : type === 'assets_impacted' ? Shield
                      : MapPin;
                    const entityColor = type === 'persons' || type === 'people' ? '#00CFEB'
                      : type === 'organizations' || type === 'orgs' ? '#FF6D2A'
                      : type === 'assets_impacted' ? '#a855f7'
                      : '#4E6070';
                    return values.slice(0, 3).filter((v: unknown) => typeof v === 'string' && v).map((v: string) => (
                      <span
                        key={`${type}-${v}`}
                        className="inline-flex items-center gap-0.5 text-[7px] px-1.5 py-0.5 transition-colors"
                        style={{ color: entityColor, background: `${entityColor}08`, border: `1px solid ${entityColor}20` }}
                      >
                        <Icon size={7} /> {v}
                      </span>
                    ));
                  })}
                </div>
              )}

              {/* Keywords */}
              {event.keywords && event.keywords.length > 0 && expanded && (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {event.keywords.map((kw, i) => (
                    <span key={i} className="text-[6px] font-mono text-[#2A3545] bg-[#0A1020] border border-[#152030] px-1 py-px">
                      #{kw}
                    </span>
                  ))}
                </div>
              )}

              {/* Impact bar */}
              {event.impact_score >= 5 && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Zap size={7} style={{ color: catVis.color }} />
                  <div className="h-[3px] bg-[#0D1826] w-20 overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${Math.min(event.impact_score * 10, 100)}%`, background: `linear-gradient(90deg, ${catVis.color}, ${catVis.color}80)` }}
                    />
                  </div>
                  <span className="text-[7px] tabular-nums font-bold" style={{ color: catVis.color }}>
                    {event.impact_score}/10
                  </span>
                </div>
              )}

              {/* Footer: source + credibility + actions */}
              <div className="flex items-center gap-2 mt-1.5">
                {/* Source with icon */}
                <span className="flex items-center gap-1 shrink-0">
                  <span className="text-[9px] leading-none">{sourceMeta.icon}</span>
                  <span className="text-[7px] font-bold" style={{ color: sourceMeta.color }}>{sourceMeta.label}</span>
                  {username && (
                    <span className="text-[7px] text-[#4E6070]/70 font-mono">{username}</span>
                  )}
                  {/* Credibility dots */}
                  <span className="flex items-center gap-[2px] ml-0.5">
                    {[1,2,3,4,5].map(i => (
                      <span
                        key={i}
                        className="inline-block w-[3px] h-[3px] transition-colors"
                        style={{ background: i <= sourceMeta.cred ? sourceMeta.color : '#152030' }}
                      />
                    ))}
                  </span>
                  {/* Source type badge */}
                  <span className={clsx(
                    'text-[5px] font-mono font-bold tracking-wider px-1 py-px border',
                    sourceMeta.type === 'gov' ? 'text-[#00E676] border-[#00E676]/20 bg-[#00E676]/05' :
                    sourceMeta.type === 'agency' ? 'text-[#00CFEB] border-[#00CFEB]/20 bg-[#00CFEB]/05' :
                    sourceMeta.type === 'social' ? 'text-[#a855f7] border-[#a855f7]/20 bg-[#a855f7]/05' :
                    'text-[#4E6070] border-[#152030]'
                  )}>
                    {String(sourceMeta.type).toUpperCase()}
                  </span>
                </span>

                {event.country && (
                  <span className="text-[7px] text-[#2A3545] flex items-center gap-0.5 shrink-0">
                    {flag ? <span className="text-[9px]">{flag}</span> : <MapPin size={6} />}
                    {event.country}
                  </span>
                )}

                <div className="flex-1" />

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {hasMedia && compact && (
                    <span className="text-[7px] text-[#FF6D2A]/50 flex items-center gap-0.5">
                      <ImageIcon size={6} />
                    </span>
                  )}
                  {event.latitude && event.longitude && (
                    <span className="text-[7px] text-[#FF6D2A]/50 flex items-center gap-0.5 hover:text-[#FF6D2A] transition-colors">
                      <Crosshair size={7} /> LOCATE
                    </span>
                  )}
                  {event.source_url && (
                    <a
                      href={event.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#2A3545] hover:text-[#FF6D2A] transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={8} />
                    </a>
                  )}
                  {(event.summary?.length ?? 0) > 120 && (
                    <button onClick={handleExpand} className="text-[#2A3545] hover:text-[#FF6D2A] transition-colors">
                      {expanded ? <ChevronUp size={8} /> : <ChevronDown size={8} />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

// ── Main Feed component ───────────────────────────────────────
export function IntelFeed({ compact = false }: { compact?: boolean }) {
  const { events, loading, setSelectedEvent, newEventIds } = useEventStore();
  const flyTo = useMapStore((s) => s.flyTo);

  const [minSev, setMinSev]           = useState(0);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy]           = useState<'time' | 'severity'>('time');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    useEventStore.getState().fetchEvents();
    const socket = getSocket();
    const handleNew = () => { useEventStore.getState().fetchEvents(); };
    socket.on('new_event', handleNew);
    const iv = setInterval(() => useEventStore.getState().fetchEvents(), 300000);
    return () => { socket.off('new_event', handleNew); clearInterval(iv); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = useCallback((event: SonarEvent) => {
    setSelectedEvent(event);
    if (event.latitude && event.longitude) flyTo(event.longitude, event.latitude, 8);
  }, [setSelectedEvent, flyTo]);

  const topCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) if (e.category) counts[e.category] = (counts[e.category] || 0) + 1;
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 6).map(([c]) => c);
  }, [events]);

  // Stats
  const stats = useMemo(() => {
    const critCount = events.filter(e => e.severity >= 8).length;
    const highCount = events.filter(e => e.severity >= 6 && e.severity < 8).length;
    const withMedia = events.filter(e => e.image_url || e.video_url).length;
    const sourceCount = new Set(events.map(e => (e.source || '').split(':')[0])).size;
    return { critCount, highCount, withMedia, sourceCount };
  }, [events]);

  const filteredEvents = useMemo(() => {
    let list = events;
    if (minSev > 0) list = list.filter(e => e.severity >= minSev);
    if (selectedCat) list = list.filter(e => e.category === selectedCat);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e =>
        (e.summary || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q) ||
        (e.country || '').toLowerCase().includes(q) ||
        (e.source || '').toLowerCase().includes(q) ||
        (e.raw_text || '').toLowerCase().includes(q) ||
        (e.keywords || []).some(kw => kw.toLowerCase().includes(q))
      );
    }
    // Sort
    if (sortBy === 'severity') {
      list = [...list].sort((a, b) => b.severity - a.severity || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list.slice(0, compact ? 60 : 200);
  }, [events, compact, minSev, selectedCat, searchQuery, sortBy]);

  const SEV_FILTERS = [
    { min: 0, label: 'ALL', count: events.length },
    { min: 4, label: 'MED+', count: events.filter(e => e.severity >= 4).length },
    { min: 7, label: 'HIGH+', count: events.filter(e => e.severity >= 7).length },
    { min: 8, label: 'CRIT', count: events.filter(e => e.severity >= 8).length },
  ];

  return (
    <div className="h-full flex flex-col bg-[#030711]">
      {/* ── Header ── */}
      <div className="px-3 py-2 border-b border-[#152030] shrink-0" style={{ borderLeft: '2px solid #FF6D2A' }}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Radio size={11} color="#FF6D2A" />
            <span className="text-[9px] font-bold tracking-[2px] text-[#FF6D2A]">INTEL FEED</span>
            <div className="live-dot ml-1" />
          </div>
          <div className="flex items-center gap-2">
            {/* Quick stats */}
            {stats.critCount > 0 && (
              <span className="flex items-center gap-0.5 text-[7px] font-bold text-[#FF3A3A] bg-[#FF3A3A]/08 border border-[#FF3A3A]/20 px-1 py-px">
                <Flame size={6} /> {stats.critCount} CRIT
              </span>
            )}
            {stats.highCount > 0 && (
              <span className="flex items-center gap-0.5 text-[7px] text-[#FF6D2A] bg-[#FF6D2A]/08 border border-[#FF6D2A]/20 px-1 py-px">
                {stats.highCount} HIGH
              </span>
            )}
            <span className="text-[7px] text-[#2A3545] tabular-nums">{filteredEvents.length}/{events.length}</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-1.5">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#2A3545]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events, countries, sources, keywords..."
            className="t-input pl-7 pr-16"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-[#4E6070] hover:text-[#D0D9E8]"
            >
              <X size={8} />
            </button>
          )}
          {/* Sort toggle */}
          <button
            onClick={() => setSortBy(s => s === 'time' ? 'severity' : 'time')}
            className={clsx(
              'absolute right-1.5 top-1/2 -translate-y-1/2 text-[6px] font-mono font-bold px-1 py-0.5 border transition-all',
              sortBy === 'severity'
                ? 'text-[#FF6D2A] border-[#FF6D2A]/30 bg-[#FF6D2A]/08'
                : 'text-[#2A3545] border-transparent hover:text-[#4E6070]'
            )}
            title={`Sort by ${sortBy === 'time' ? 'severity' : 'time'}`}
          >
            {sortBy === 'time' ? '⏱ TIME' : '⚡ SEV'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 flex-wrap">
          <Filter size={8} className="text-[#2A3545] shrink-0" />
          {SEV_FILTERS.map(f => (
            <button
              key={f.min}
              onClick={() => setMinSev(f.min)}
              className={clsx(
                'text-[7px] font-bold px-1.5 py-0.5 transition-all tracking-wider flex items-center gap-0.5',
                minSev === f.min
                  ? 'text-[#FF6D2A] bg-[rgba(255,109,42,0.10)] border border-[#FF6D2A]/30'
                  : 'text-[#2A3545] hover:text-[#4E6070] border border-transparent'
              )}
            >
              {f.label}
              <span className="text-[5px] opacity-60">{f.count}</span>
            </button>
          ))}
          {topCategories.length > 0 && <div className="w-px h-3 bg-[#152030] mx-0.5" />}
          {topCategories.map(cat => {
            const vis = CATEGORY_VISUAL[cat] || DEFAULT_VISUAL;
            const active = selectedCat === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCat(active ? null : cat)}
                className={clsx(
                  'text-[7px] px-1.5 py-0.5 transition-all flex items-center gap-0.5',
                  active
                    ? 'font-bold border'
                    : 'text-[#2A3545] hover:text-[#4E6070] border border-transparent'
                )}
                style={active ? { color: vis.color, borderColor: `${vis.color}30`, background: `${vis.color}08` } : undefined}
              >
                <span className="text-[7px]">{vis.emoji}</span>
                {cat.replace(/_/g, ' ').slice(0, 10)}
              </button>
            );
          })}
        </div>

        {/* Source stats ticker */}
        <div className="flex items-center gap-2 mt-1.5 overflow-hidden">
          <span className="text-[6px] font-mono text-[#2A3545] tracking-wider shrink-0">SOURCES</span>
          <div className="flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {stats.sourceCount > 0 && (
              <span className="text-[6px] text-[#4E6070] font-mono shrink-0">{stats.sourceCount} active</span>
            )}
            {stats.withMedia > 0 && (
              <span className="text-[6px] text-[#FF6D2A]/50 font-mono flex items-center gap-0.5 shrink-0">
                <ImageIcon size={5} /> {stats.withMedia} media
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Feed rows ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#1E3050 transparent' }}
      >
        {loading && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-6 h-6 border-2 border-[#FF6D2A]/20 border-t-[#FF6D2A] rounded-full animate-spin" />
            <span className="text-[9px] font-mono text-[#2A3545] tracking-[3px] animate-pulse">SCANNING SOURCES</span>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Radio size={24} color="#2A3545" />
            <p className="text-[10px] text-[#2A3545] tracking-wider">AWAITING INTELLIGENCE...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Search size={20} color="#2A3545" />
            <p className="text-[10px] text-[#2A3545] tracking-wider">NO MATCHING EVENTS</p>
            <button
              onClick={() => { setSearchQuery(''); setMinSev(0); setSelectedCat(null); }}
              className="text-[8px] text-[#FF6D2A] hover:text-[#FF6D2A]/80 font-mono"
            >
              CLEAR FILTERS
            </button>
          </div>
        ) : (
          filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              compact={compact}
              isNew={newEventIds.has(event.id)}
              onClick={() => handleClick(event)}
            />
          ))
        )}
      </div>

      {/* CSS animation for new events */}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
