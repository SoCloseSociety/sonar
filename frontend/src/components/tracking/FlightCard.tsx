import type { Flight } from '@/types/tracking';
import { Badge } from '@/components/shared/Badge';
import { useMapStore } from '@/stores/mapStore';
import { Plane } from 'lucide-react';

export function FlightCard({ flight }: { flight: Flight }) {
  const flyTo = useMapStore((s) => s.flyTo);

  return (
    <div
      onClick={() => flyTo(flight.longitude, flight.latitude, 10)}
      className="sonar-card cursor-pointer hover:border-slate-600 transition"
    >
      <div className="flex items-center gap-3">
        <Plane
          size={16}
          className={flight.is_military ? 'text-accent-red' : flight.is_government ? 'text-accent-amber' : 'text-slate-500'}
          style={{ transform: `rotate(${flight.heading || 0}deg)` }}
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-white">
              {flight.callsign || flight.icao24}
            </span>
            {flight.is_military && <Badge variant="red">MIL</Badge>}
            {flight.is_government && <Badge variant="amber">GOV</Badge>}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-0.5">
            <span>{flight.origin_country}</span>
            {flight.altitude && <span>Alt: {Math.round(flight.altitude)}m</span>}
            {flight.velocity && <span>Spd: {Math.round(flight.velocity)}m/s</span>}
            {flight.squawk && <span className="text-accent-amber">SQK: {flight.squawk}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
