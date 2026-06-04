import { memo } from 'react';
import type { TrackingAnomaly } from '@/types/tracking';
import { clsx } from 'clsx';
import {
  AlertTriangle, Plane, Ship, Eye, EyeOff,
  Navigation, MapPin, Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const ANOMALY_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  military_flight: { icon: Plane, color: '#ef4444', label: 'MILITARY FLIGHT' },
  military_vessel: { icon: Ship, color: '#ef4444', label: 'MILITARY VESSEL' },
  dark_vessel: { icon: EyeOff, color: '#a855f7', label: 'DARK VESSEL' },
  chokepoint: { icon: Navigation, color: '#f97316', label: 'CHOKEPOINT TRANSIT' },
  speed_anomaly: { icon: AlertTriangle, color: '#f59e0b', label: 'SPEED ANOMALY' },
  heading_change: { icon: Navigation, color: '#3b82f6', label: 'HEADING CHANGE' },
  squawk_alert: { icon: AlertTriangle, color: '#dc2626', label: 'SQUAWK ALERT' },
};

const DEFAULT_CONFIG = { icon: Eye, color: '#64748b', label: 'ANOMALY' };

export const WhaleTradeCard = memo(function WhaleTradeCard({
  anomaly,
  onClick,
}: {
  anomaly: TrackingAnomaly;
  onClick?: (a: TrackingAnomaly) => void;
}) {
  const config = ANOMALY_TYPE_CONFIG[anomaly.anomaly_type || ''] || DEFAULT_CONFIG;
  const Icon = config.icon;
  const isCritical = anomaly.severity >= 8;
  const isHigh = anomaly.severity >= 6;

  const timeAgo = (() => {
    try { return formatDistanceToNow(new Date(anomaly.detected_at), { addSuffix: true }); }
    catch { return ''; }
  })();

  return (
    <div
      onClick={() => onClick?.(anomaly)}
      className={clsx(
        'relative rounded-xl p-3.5 transition-all duration-200 cursor-pointer group overflow-hidden',
        'bg-[#0d1117] border',
        isCritical ? 'border-red-500/30 hover:border-red-500/50' :
        isHigh ? 'border-orange-500/20 hover:border-orange-500/40' :
        'border-sonar-border/40 hover:border-sonar-border/70',
      )}
    >
      {/* Severity glow bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
        style={{ backgroundColor: config.color }}
      />

      <div className="flex items-start gap-3 pl-1">
        {/* Icon */}
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${config.color}12`, border: `1px solid ${config.color}20` }}
        >
          <Icon size={16} style={{ color: config.color }} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Top row */}
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[8px] font-mono font-bold tracking-widest"
              style={{ color: config.color }}
            >
              {config.label}
            </span>
            <span className={clsx(
              'text-[8px] font-mono font-bold px-1.5 py-0.5 rounded',
              isCritical ? 'text-red-400 bg-red-500/10' :
              isHigh ? 'text-orange-400 bg-orange-500/10' :
              'text-amber-400 bg-amber-500/10'
            )}>
              SEV {anomaly.severity}
            </span>
            {anomaly.entity_type && (
              <span className="text-[8px] font-mono text-slate-600 flex items-center gap-1">
                {anomaly.entity_type === 'flight' ? <Plane size={7} /> : <Ship size={7} />}
                {anomaly.entity_id}
              </span>
            )}
          </div>

          {/* Description */}
          {anomaly.description && (
            <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-2">
              {anomaly.description}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-[8px] font-mono text-slate-600 flex items-center gap-1">
              <Clock size={7} /> {timeAgo}
            </span>
            <span className="text-[8px] font-mono text-cyan-500/50 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <MapPin size={7} /> LOCATE
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
