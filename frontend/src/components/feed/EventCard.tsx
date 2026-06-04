import { memo } from 'react';
import type { SonarEvent } from '@/types/event';
import { getSeverityColor } from '@/types/event';
import { SeverityBadge, Badge } from '@/components/shared/Badge';
import { TimeAgo } from '@/components/shared/TimeAgo';
import { useMapStore } from '@/stores/mapStore';
import { useEventStore } from '@/stores/eventStore';
import { clsx } from 'clsx';
import {
  Crosshair, Globe2, TrendingUp, TrendingDown, Minus,
  MapPin, ExternalLink, Zap,
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, string> = {
  MILITARY_CONFLICT: '\u2694\uFE0F',
  DIPLOMATIC: '\uD83C\uDFF3\uFE0F',
  ECONOMIC_POLICY: '\uD83D\uDCC8',
  NATURAL_DISASTER: '\uD83C\uDF0A',
  NUCLEAR: '\u2622\uFE0F',
  SANCTIONS: '\uD83D\uDEAB',
  ELECTION: '\uD83D\uDDF3\uFE0F',
  CRYPTO_MARKET: '\u20BF',
  ENERGY_COMMODITIES: '\u26FD',
  TERRORISM: '\uD83D\uDCA3',
  CYBER_ATTACK: '\uD83D\uDCBB',
  TRADE_DISRUPTION: '\uD83D\uDEA2',
  MARITIME_SECURITY: '\u2693',
  AVIATION_INCIDENT: '\u2708\uFE0F',
  INFRASTRUCTURE: '\uD83C\uDFD7\uFE0F',
  PANDEMIC_HEALTH: '\uD83C\uDFE5',
  TECHNOLOGY: '\uD83D\uDD2C',
  POLITICAL_DOMESTIC: '\uD83C\uDFDB\uFE0F',
  EARTHQUAKE: '\uD83C\uDF0B',
  WEATHER: '\u26C8\uFE0F',
  FIRE: '\uD83D\uDD25',
  CYBER: '\uD83D\uDEE1\uFE0F',
};

function MarketIndicator({ direction }: { direction: string }) {
  if (direction === 'up' || direction === 'bullish') return <TrendingUp size={10} className="text-green-400" />;
  if (direction === 'down' || direction === 'bearish') return <TrendingDown size={10} className="text-red-400" />;
  return <Minus size={10} className="text-slate-500" />;
}

export const EventCard = memo(function EventCard({ event, compact = false }: { event: SonarEvent; compact?: boolean }) {
  const flyTo = useMapStore((s) => s.flyTo);
  const setSelectedEvent = useEventStore((s) => s.setSelectedEvent);
  const sevColor = getSeverityColor(event.severity);
  const catIcon = CATEGORY_ICONS[event.category || ''] || '\uD83D\uDD34';

  const handleClick = () => {
    if (event.latitude && event.longitude) {
      flyTo(event.longitude, event.latitude, 8);
    }
    setSelectedEvent(event);
  };

  const hasMarketImpact = event.market_direction && Object.keys(event.market_direction).length > 0;

  if (compact) {
    return (
      <div
        onClick={handleClick}
        className={clsx(
          'sonar-card cursor-pointer hover:border-slate-600 transition-all p-2.5 group',
          event.severity >= 8 && 'border-accent-red/30 hover:border-accent-red/50',
        )}
      >
        <div className="flex gap-2">
          <div className="w-0.5 rounded-full shrink-0" style={{ backgroundColor: sevColor }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs">{catIcon}</span>
              <SeverityBadge severity={event.severity} />
              {event.country && <span className="text-[9px] text-slate-500 font-mono">{event.country}</span>}
            </div>
            <p className="text-xs text-slate-200 leading-snug line-clamp-2">
              {event.summary || event.raw_text?.slice(0, 120)}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] text-slate-600 font-mono">{event.source}</span>
              <TimeAgo date={event.created_at} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={clsx(
        'sonar-card cursor-pointer hover:border-slate-600 transition-all group relative overflow-hidden',
        event.severity >= 8 && 'border-accent-red/30 hover:border-accent-red/50',
      )}
    >
      {/* Severity accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" style={{ backgroundColor: sevColor }} />

      <div className="pl-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm">{catIcon}</span>
            <SeverityBadge severity={event.severity} />
            {event.category && (
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                {event.category.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {event.impact_score > 0 && (
              <div className="flex items-center gap-1" title="Impact Score">
                <Zap size={10} style={{ color: sevColor }} />
                <span className="text-[10px] font-mono tabular-nums" style={{ color: sevColor }}>
                  {event.impact_score}
                </span>
              </div>
            )}
            <TimeAgo date={event.created_at} />
          </div>
        </div>

        {/* Summary */}
        <p className="text-sm text-slate-200 leading-relaxed mb-2">
          {event.summary || event.raw_text?.slice(0, 200)}
        </p>

        {/* Keywords */}
        {event.keywords && event.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {event.keywords.slice(0, 5).map((kw) => (
              <Badge key={kw} variant="gray" className="text-[9px]">{kw}</Badge>
            ))}
          </div>
        )}

        {/* Market Impact */}
        {hasMarketImpact && (
          <div className="flex items-center gap-3 mb-2 p-1.5 bg-[#0a0e17]/50 rounded">
            {Object.entries(event.market_direction!).slice(0, 4).map(([market, dir]) => (
              <div key={market} className="flex items-center gap-1">
                <MarketIndicator direction={dir} />
                <span className="text-[9px] font-mono text-slate-400">{market}</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Globe2 size={10} className="text-slate-600" />
              <span className="text-[10px] font-mono text-slate-500">{event.source}</span>
            </div>
            {event.country && (
              <div className="flex items-center gap-1">
                <MapPin size={10} className="text-slate-600" />
                <span className="text-[10px] text-slate-500">{event.country}</span>
              </div>
            )}
            {event.confidence > 0 && (
              <span className="text-[9px] font-mono text-slate-600">
                CONF: {(event.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {event.latitude && event.longitude && (
              <button className="text-[9px] text-cyan-400 font-mono flex items-center gap-1 hover:text-cyan-300">
                <Crosshair size={10} /> LOCATE
              </button>
            )}
            {event.source_url && (
              <a
                href={event.source_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[9px] text-slate-400 font-mono flex items-center gap-1 hover:text-white"
              >
                <ExternalLink size={10} /> SOURCE
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
