import type { Vessel } from '@/types/tracking';
import { Badge } from '@/components/shared/Badge';
import { useMapStore } from '@/stores/mapStore';
import { Ship } from 'lucide-react';

export function VesselCard({ vessel }: { vessel: Vessel }) {
  const flyTo = useMapStore((s) => s.flyTo);

  return (
    <div
      onClick={() => flyTo(vessel.longitude, vessel.latitude, 10)}
      className="sonar-card cursor-pointer hover:border-slate-600 transition"
    >
      <div className="flex items-center gap-3">
        <Ship
          size={16}
          className={vessel.is_military ? 'text-accent-red' : 'text-accent-blue'}
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-white">
              {vessel.vessel_name || vessel.mmsi}
            </span>
            {vessel.is_military && <Badge variant="red">MIL</Badge>}
            {vessel.is_dark && <Badge variant="amber">DARK</Badge>}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-0.5">
            {vessel.flag && <span>{vessel.flag}</span>}
            {vessel.speed != null && <span>Spd: {vessel.speed.toFixed(1)}kn</span>}
            {vessel.destination && <span>Dest: {vessel.destination}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
