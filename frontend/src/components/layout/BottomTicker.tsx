import { memo } from 'react';
import { useEventStore } from '@/stores/eventStore';

const SOURCE_LABELS: Record<string, string> = {
  reuters: 'REUTERS', ap: 'AP NEWS', afp: 'AFP',
  bbc: 'BBC', aljazeera: 'AL JAZ', cnn: 'CNN',
  gdelt: 'GDELT', acled: 'ACLED', usgs: 'USGS',
  noaa: 'NOAA', nasa: 'NASA', firms: 'FIRMS',
  twitter: 'TWTTR', telegram: 'TGRAM', reddit: 'RDDT',
  rss: 'RSS', osint: 'OSINT',
  government_feeds: 'GOVT', government: 'GOVT',
  earthquake: 'SEISMIC', weather_alerts: 'WTHR',
  fire_satellite: 'FIRESAT', flight_tracker: 'ADS-B',
  vessel_tracker: 'AIS', aisstream: 'AIS',
  nuclear: 'NUCLEAR', cyber_threats: 'CYBER',
  sanctions_trade: 'SANCT', conflict_monitor: 'CNFLCT',
};

function getSourceLabel(source: unknown): string {
  if (!source || typeof source !== 'string') return 'FEED';
  const base = source.split(':')[0].toLowerCase().replace(/[^a-z_]/g, '').replace(/_\d+$/, '');
  if (SOURCE_LABELS[base]) return SOURCE_LABELS[base];
  const parts = base.split('_');
  for (let i = parts.length; i >= 1; i--) {
    const key = parts.slice(0, i).join('_');
    if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  }
  return String(base).toUpperCase().slice(0, 8) || 'FEED';
}

// F-key shortcuts shown on the right end
const FKEYS = [
  { key: 'F1', label: 'GLOBE' },
  { key: 'F2', label: 'MAP'   },
  { key: 'F3', label: 'DASH'  },
  { key: 'F5', label: 'INTEL' },
  { key: 'F6', label: 'SIG'   },
  { key: 'F11', label: 'MKT'  },
];

export const BottomTicker = memo(function BottomTicker() {
  const events = useEventStore((s) => s.events);
  const tickerItems = events.slice(0, 30);
  if (tickerItems.length === 0) return null;

  return (
    <div className="h-6 bg-[#030711] border-t border-[#152030] flex items-center overflow-hidden shrink-0">

      {/* ── LIVE badge ── */}
      <div className="flex items-center gap-1.5 px-2.5 border-r border-[#152030] h-full bg-[#060B16] shrink-0">
        <div className="w-[6px] h-[6px] bg-[#FF6D2A] animate-pulse" />
        <span className="text-[7px] font-bold text-[#FF6D2A] tracking-[2px]">LIVE</span>
      </div>

      {/* ── Scrolling news wire ── */}
      <div className="flex-1 overflow-hidden relative">
        <div className="flex gap-5 whitespace-nowrap ticker-scroll">
          {[...tickerItems, ...tickerItems].map((event, i) => {
            const isCritical = event.severity >= 8;
            const isHigh     = event.severity >= 6;
            return (
              <span key={`${event.id}-${i}`} className="inline-flex items-center gap-1.5 text-[9px]">
                {/* FLASH badge for critical */}
                {isCritical && (
                  <span className="text-[7px] font-black text-[#FF3A3A] bg-[rgba(255,58,58,0.12)] border border-[#FF3A3A]/35 px-1 leading-4 tracking-widest">
                    FLASH
                  </span>
                )}
                {/* Source label */}
                <span
                  className="font-bold tracking-wider"
                  style={{ color: isCritical ? '#FF3A3A' : isHigh ? '#FF6D2A' : '#4E6070' }}
                >
                  [{getSourceLabel(event.source)}]
                </span>
                {/* Event text */}
                <span
                  className="max-w-[280px] truncate"
                  style={{ color: isCritical ? '#D0D9E8' : isHigh ? '#94A3B8' : '#4E6070' }}
                >
                  {event.summary || event.raw_text?.slice(0, 80)}
                </span>
                {/* Separator */}
                <span className="text-[#2A3545]">◆</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* ── F-Key shortcut panel ── */}
      <div className="hidden xl:flex items-center h-full border-l border-[#152030] shrink-0">
        {FKEYS.map(({ key, label }) => (
          <div
            key={key}
            className="flex items-center gap-0.5 px-2 border-r border-[#152030] h-full"
          >
            <span className="text-[7px] font-bold text-[#FF6D2A]/50">{key}</span>
            <span className="text-[#2A3545] mx-px">·</span>
            <span className="text-[7px] text-[#2A3545]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
