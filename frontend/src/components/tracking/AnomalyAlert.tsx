import type { TrackingAnomaly } from '@/types/tracking';
import { SeverityBadge } from '@/components/shared/Badge';
import { TimeAgo } from '@/components/shared/TimeAgo';
import { AlertTriangle } from 'lucide-react';

export function AnomalyAlert({ anomaly }: { anomaly: TrackingAnomaly }) {
  return (
    <div className="sonar-card border-accent-amber/30">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="text-accent-amber shrink-0 mt-0.5" />
        <div>
          <div className="flex items-center gap-2 mb-1">
            <SeverityBadge severity={anomaly.severity} />
            <span className="text-[10px] font-mono text-slate-500 uppercase">
              {anomaly.anomaly_type?.replace('_', ' ')}
            </span>
          </div>
          <p className="text-xs text-slate-300">{anomaly.description}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-slate-500">
              {anomaly.entity_type}: {anomaly.entity_id}
            </span>
            <TimeAgo date={anomaly.detected_at} />
          </div>
        </div>
      </div>
    </div>
  );
}
