import { TimeAgo } from '@/components/shared/TimeAgo';
import { SeverityBadge } from '@/components/shared/Badge';
import type { SonarEvent } from '@/types/event';
import { useEventStore } from '@/stores/eventStore';

export function AlertHistory() {
  const events = useEventStore((s) => s.events);
  const highSeverity = events.filter((e) => e.severity >= 6).slice(0, 10);

  return (
    <div className="sonar-card">
      <h3 className="text-xs font-mono text-slate-500 uppercase mb-3">Recent Alerts</h3>
      {highSeverity.length === 0 ? (
        <p className="text-xs text-slate-600">No high-severity events recently.</p>
      ) : (
        <div className="space-y-2">
          {highSeverity.map((e) => (
            <div key={e.id} className="flex items-start gap-2">
              <SeverityBadge severity={e.severity} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-300 truncate">{e.summary || e.source}</p>
                <TimeAgo date={e.created_at} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
