import { useEffect, useMemo } from 'react';
import { useEventStore } from '@/stores/eventStore';
import { EventCard } from './EventCard';
import { FeedFilters } from './FeedFilters';
import { Spinner } from '@/components/shared/Spinner';
import { Activity } from 'lucide-react';

export function EventFeed({ compact = false }: { compact?: boolean }) {
  const events = useEventStore((s) => s.events);
  const loading = useEventStore((s) => s.loading);
  const filters = useEventStore((s) => s.filters);

  useEffect(() => {
    useEventStore.getState().fetchEvents();
    const interval = setInterval(() => useEventStore.getState().fetchEvents(), 90000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    let critical = 0, high = 0;
    for (const e of events) {
      if (e.severity >= 9) critical++;
      else if (e.severity >= 7) high++;
    }
    return { critical, high, total: events.length };
  }, [events]);

  const hasActiveFilters = filters.category || filters.minSeverity > 0 || filters.source || filters.country || filters.hours !== 48;

  return (
    <div className={compact ? 'h-full flex flex-col' : 'h-full flex flex-col'}>
      {!compact && <FeedFilters />}

      {/* Stats bar */}
      <div className={compact ? 'px-3 py-2' : 'px-4 py-1.5'}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={10} className="text-cyan-500/60" />
            <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              Live Feed
            </h3>
            <div className="live-dot" />
          </div>
          <div className="flex items-center gap-3 text-[9px] font-mono">
            {stats.critical > 0 && (
              <span className="text-red-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {stats.critical} CRIT
              </span>
            )}
            {stats.high > 0 && (
              <span className="text-orange-400">{stats.high} HIGH</span>
            )}
            <span className="text-slate-600">{stats.total} total</span>
            {hasActiveFilters && (
              <span className="text-cyan-400/50">FILTERED</span>
            )}
          </div>
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto space-y-1.5 px-3 pb-2">
        {loading && events.length === 0 ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <span className="text-slate-600 text-[10px] font-mono tracking-widest">
              {hasActiveFilters ? 'NO EVENTS MATCH FILTERS' : 'SOURCES SCANNING...'}
            </span>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  useEventStore.getState().setFilter('minSeverity', 0);
                  useEventStore.getState().setFilter('category', undefined);
                  useEventStore.getState().setFilter('source', undefined);
                  useEventStore.getState().setFilter('country', undefined);
                  useEventStore.getState().setFilter('hours', 48);
                  useEventStore.getState().fetchEvents();
                }}
                className="text-[9px] font-mono text-cyan-400 hover:text-cyan-300"
              >
                CLEAR FILTERS
              </button>
            )}
          </div>
        ) : (
          events.map((event) => (
            <EventCard key={event.id} event={event} compact={compact} />
          ))
        )}
      </div>
    </div>
  );
}
