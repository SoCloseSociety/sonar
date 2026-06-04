import { X, ExternalLink, AlertTriangle, Clock, MapPin, Radio, Zap, Tag, Users, Building, TrendingUp, TrendingDown, Minus, Play } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';
import api from '@/services/api';

interface GlobeEvent {
  id: number;
  lat: number;
  lng: number;
  severity: number;
  category: string;
  summary: string;
  source: string;
  source_url?: string;
  created_at: string;
  country?: string;
  impact_score?: number;
  keywords?: string[];
  image_url?: string;
  video_url?: string;
}

interface FullEventDetail {
  entities?: Record<string, string[]>;
  raw_text?: string;
  market_direction?: string;
  confidence?: number;
  image_url?: string;
  video_url?: string;
  media_urls?: string[];
}

interface Props {
  event: GlobeEvent;
  onClose: () => void;
}

const severityConfig: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'CRITICAL', color: '#dc2626', bg: 'bg-red-500/10' },
  high: { label: 'HIGH', color: '#ef4444', bg: 'bg-orange-500/10' },
  medium: { label: 'MEDIUM', color: '#f59e0b', bg: 'bg-amber-500/10' },
  low: { label: 'LOW', color: '#10b981', bg: 'bg-green-500/10' },
  info: { label: 'INFO', color: '#06b6d4', bg: 'bg-cyan-500/10' },
};

const CATEGORY_EMOJIS: Record<string, string> = {
  MILITARY_CONFLICT: '\u2694\uFE0F',
  DIPLOMATIC: '\uD83C\uDFF3\uFE0F',
  ECONOMIC_POLICY: '\uD83D\uDCC8',
  NATURAL_DISASTER: '\uD83C\uDF0A',
  NUCLEAR: '\u2622\uFE0F',
  SANCTIONS: '\uD83D\uDEAB',
  ELECTION: '\uD83D\uDDF3\uFE0F',
  TERRORISM: '\uD83D\uDCA3',
  CYBER_ATTACK: '\uD83D\uDEE1\uFE0F',
  MARITIME_SECURITY: '\u2693',
  EARTHQUAKE: '\uD83C\uDF0B',
  WEATHER: '\u26C8\uFE0F',
  FIRE: '\uD83D\uDD25',
  AVIATION_INCIDENT: '\u2708\uFE0F',
  ENERGY_COMMODITIES: '\u26FD',
  PANDEMIC_HEALTH: '\uD83C\uDFE5',
  POLITICAL_DOMESTIC: '\uD83C\uDFDB\uFE0F',
  INFRASTRUCTURE: '\uD83C\uDFD7\uFE0F',
};

function getSevLevel(s: number) {
  if (s >= 9) return 'critical';
  if (s >= 7) return 'high';
  if (s >= 5) return 'medium';
  if (s >= 3) return 'low';
  return 'info';
}

function MarketDirection({ direction }: { direction: string }) {
  const upper = String(direction || '').toUpperCase();
  if (upper.includes('BUY') || upper.includes('YES') || upper.includes('UP') || upper.includes('BULLISH')) {
    return (
      <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5">
        <TrendingUp size={9} /> {direction}
      </span>
    );
  }
  if (upper.includes('SELL') || upper.includes('NO') || upper.includes('DOWN') || upper.includes('BEARISH')) {
    return (
      <span className="flex items-center gap-1 text-[9px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-0.5">
        <TrendingDown size={9} /> {direction}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[9px] font-mono text-slate-400 bg-slate-500/10 border border-slate-500/20 rounded px-2 py-0.5">
      <Minus size={9} /> {direction}
    </span>
  );
}

export function GlobeDetail({ event, onClose }: Props) {
  const sev = severityConfig[getSevLevel(event.severity)] || severityConfig.info;
  const [detail, setDetail] = useState<FullEventDetail | null>(null);

  // Fetch full event data for entities, raw_text, market_direction
  useEffect(() => {
    let cancelled = false;
    api.get(`/events/${event.id}`).then(({ data }) => {
      if (!cancelled) {
        // Sanitize: ensure string fields are actually strings (API may return objects)
        const safe: FullEventDetail = {
          entities: data.entities && typeof data.entities === 'object' && !Array.isArray(data.entities) ? data.entities : undefined,
          raw_text: typeof data.raw_text === 'string' ? data.raw_text : undefined,
          market_direction: typeof data.market_direction === 'string' ? data.market_direction : undefined,
          confidence: typeof data.confidence === 'number' ? data.confidence : undefined,
          image_url: typeof data.image_url === 'string' ? data.image_url : undefined,
          video_url: typeof data.video_url === 'string' ? data.video_url : undefined,
          media_urls: Array.isArray(data.media_urls) ? data.media_urls.filter((u: unknown) => typeof u === 'string') : undefined,
        };
        setDetail(safe);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [event.id]);

  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(event.created_at), { addSuffix: true });
    } catch {
      return '';
    }
  })();

  const keywords = Array.isArray(event.keywords) ? event.keywords : [];
  const entities = detail?.entities;
  const hasEntities = entities && Object.values(entities).some(arr => arr.length > 0);
  const rawText = detail?.raw_text;

  return (
    <div className="absolute bottom-4 right-4 z-30 w-88 animate-slide-in" style={{ width: '22rem' }}>
      <div className="sonar-detail-panel max-h-[80vh] flex flex-col">
        {/* Severity accent bar */}
        <div className="h-[3px] shrink-0" style={{ background: `linear-gradient(to right, ${sev.color}, ${sev.color}33, transparent)` }} />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle size={12} style={{ color: sev.color }} />
            <span className="text-[10px] font-mono tracking-widest font-bold" style={{ color: sev.color }}>
              {sev.label}
            </span>
            <span className="text-[9px] font-mono text-slate-600">SEV {event.severity}/10</span>
            {detail?.confidence != null && (
              <span className="text-[8px] font-mono text-slate-600">· CONF {Math.round(detail.confidence * 100)}%</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors p-1 hover:bg-white/[0.05] rounded"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1">
          <div className="p-4 space-y-3">
            {/* Category + Country */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[9px] font-mono tracking-wider px-2.5 py-1 rounded-full font-bold border flex items-center gap-1.5"
                style={{ color: sev.color, borderColor: `${sev.color}30`, background: `${sev.color}10` }}
              >
                {CATEGORY_EMOJIS[event.category] && (
                  <span className="text-[10px]">{CATEGORY_EMOJIS[event.category]}</span>
                )}
                {event.category.replace(/_/g, ' ')}
              </span>
              {event.country && (
                <span className="text-[9px] font-mono text-slate-400 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
                  {event.country}
                </span>
              )}
              {detail?.market_direction && (
                <MarketDirection direction={detail.market_direction} />
              )}
            </div>

            {/* Summary */}
            <p className="text-[12px] text-slate-200 leading-relaxed font-sans">
              {event.summary || 'No summary available'}
            </p>

            {/* Media: image from event or full detail */}
            {(() => {
              const isHttpUrl = (u: unknown): u is string =>
                typeof u === 'string' && /^https?:\/\//.test(u);
              const imgUrl = detail?.image_url || event.image_url;
              const vidUrl = detail?.video_url || event.video_url;
              const extraImgs = detail?.media_urls?.filter(u => u !== imgUrl) || [];
              if (isHttpUrl(imgUrl)) {
                return (
                  <div className="space-y-1">
                    <div className="text-[7px] font-mono text-slate-600 tracking-widest">MEDIA</div>
                    <img
                      src={imgUrl}
                      alt=""
                      className="w-full max-h-48 object-cover border border-white/[0.06] rounded"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {extraImgs.filter(isHttpUrl).slice(0, 3).length > 0 && (
                      <div className="flex gap-1">
                        {extraImgs.filter(isHttpUrl).slice(0, 3).map((u, i) => (
                          <img key={i} src={u} alt="" className="w-16 h-12 object-cover border border-white/[0.04] rounded"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              if (isHttpUrl(vidUrl)) {
                return (
                  <div className="space-y-1">
                    <div className="text-[7px] font-mono text-slate-600 tracking-widest">VIDEO</div>
                    <a href={vidUrl} target="_blank" rel="noopener noreferrer"
                       className="flex items-center gap-2 p-2 bg-white/[0.03] border border-white/[0.06] rounded hover:bg-white/[0.06] transition-colors">
                      <Play size={14} className="text-cyan-400" />
                      <span className="text-[9px] font-mono text-slate-400">PLAY VIDEO</span>
                    </a>
                  </div>
                );
              }
              return null;
            })()}

            {/* Raw text excerpt — first 300 chars if different from summary */}
            {rawText && rawText !== event.summary && rawText.length > 50 && (
              <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
                <div className="text-[7px] font-mono text-slate-600 tracking-widest mb-1.5">ORIGINAL SOURCE TEXT</div>
                <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-4 font-sans">
                  {rawText.slice(0, 400)}
                  {rawText.length > 400 ? '…' : ''}
                </p>
              </div>
            )}

            {/* Entities */}
            {hasEntities && (
              <div className="space-y-1.5">
                <div className="text-[7px] font-mono text-slate-600 tracking-widest">ENTITIES DETECTED</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(entities!).map(([type, values]) => {
                    if (!Array.isArray(values) || values.length === 0) return null;
                    const icon = type === 'persons' || type === 'people' ? (
                      <Users size={7} className="text-slate-400" />
                    ) : type === 'organizations' || type === 'orgs' ? (
                      <Building size={7} className="text-slate-400" />
                    ) : (
                      <MapPin size={7} className="text-slate-400" />
                    );
                    return values.slice(0, 4).map((v: string) => (
                      <span key={`${type}-${v}`} className="inline-flex items-center gap-0.5 text-[8px] font-mono text-slate-300 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5">
                        {icon} {v}
                      </span>
                    ));
                  })}
                </div>
              </div>
            )}

            {/* Keywords */}
            {keywords.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Tag size={9} className="text-slate-600" />
                {keywords.slice(0, 6).map((k, i) => (
                  <span key={i} className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/[0.04]">
                    {k}
                  </span>
                ))}
              </div>
            )}

            {/* Metadata grid */}
            <div className="detail-grid">
              <div className="flex items-center gap-1.5">
                <Radio size={10} className="text-slate-500" />
                <div>
                  <div className="text-[7px] font-mono text-slate-600 tracking-widest">SOURCE</div>
                  <div className="text-[10px] font-mono text-slate-300">{event.source}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock size={10} className="text-slate-500" />
                <div>
                  <div className="text-[7px] font-mono text-slate-600 tracking-widest">TIME</div>
                  <div className="text-[10px] font-mono text-slate-300">{timeAgo}</div>
                </div>
              </div>
              {(event.impact_score ?? 0) > 0 && (
                <div className="flex items-center gap-1.5">
                  <Zap size={10} style={{ color: sev.color }} />
                  <div className="flex-1">
                    <div className="text-[7px] font-mono text-slate-600 tracking-widest">IMPACT</div>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-[3px] bg-white/[0.06] rounded-full overflow-hidden max-w-[60px]">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (event.impact_score || 0) * 10)}%`, background: sev.color }} />
                      </div>
                      <span className="text-[9px] font-mono font-bold tabular-nums" style={{ color: sev.color }}>{event.impact_score}/10</span>
                    </div>
                  </div>
                </div>
              )}
              {(Math.abs(event.lat) > 0.001 || Math.abs(event.lng) > 0.001) && (
                <div className="flex items-center gap-1.5">
                  <MapPin size={10} className="text-slate-500" />
                  <div>
                    <div className="text-[7px] font-mono text-slate-600 tracking-widest">COORDS</div>
                    <div className="text-[10px] font-mono text-cyan-400/70 tabular-nums">
                      {event.lat.toFixed(3)}°, {event.lng.toFixed(3)}°
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-white/[0.06] flex justify-between items-center shrink-0">
          <span className="text-[8px] font-mono text-slate-600 tabular-nums">
            ID: {event.id}
          </span>
          {event.source_url && (
            <a
              href={event.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[9px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              <ExternalLink size={10} />
              FULL SOURCE
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
