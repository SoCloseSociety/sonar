import type { SonarEvent } from '@/types/event';
import { SeverityBadge, Badge } from '@/components/shared/Badge';
import { TimeAgo } from '@/components/shared/TimeAgo';

export function EventDetail({ event }: { event: SonarEvent }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <SeverityBadge severity={event.severity} />
        {event.category && <Badge>{event.category.replace('_', ' ')}</Badge>}
        <Badge variant="blue">Impact: {event.impact_score}</Badge>
      </div>

      <h2 className="text-lg text-white font-medium">
        {event.summary || 'No summary available'}
      </h2>

      {event.image_url && /^https?:\/\//.test(event.image_url) && (
        <img
          src={event.image_url}
          alt=""
          className="w-full max-h-64 object-cover rounded border border-white/[0.06]"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}

      {event.raw_text && (
        <p className="text-sm text-slate-300 leading-relaxed">{event.raw_text}</p>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-slate-500">Source</span>
          <p className="text-white font-mono">{event.source}</p>
        </div>
        <div>
          <span className="text-slate-500">Country</span>
          <p className="text-white">{event.country || 'Unknown'}</p>
        </div>
        <div>
          <span className="text-slate-500">Confidence</span>
          <p className="text-white font-mono">{(event.confidence * 100).toFixed(0)}%</p>
        </div>
        <div>
          <span className="text-slate-500">Time</span>
          <TimeAgo date={event.created_at} />
        </div>
      </div>

      {event.keywords && event.keywords.length > 0 && (
        <div>
          <span className="text-xs text-slate-500">Keywords</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {event.keywords.map((kw) => (
              <Badge key={kw} variant="gray">{kw}</Badge>
            ))}
          </div>
        </div>
      )}

      {event.source_url && (
        <a
          href={event.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-green text-sm hover:underline"
        >
          View source
        </a>
      )}
    </div>
  );
}
