export function MapLegend() {
  return (
    <div className="absolute bottom-8 left-4 z-10 bg-sonar-surface/95 backdrop-blur border border-sonar-border rounded-lg p-3">
      <span className="text-xs font-mono text-slate-500">SEVERITY</span>
      <div className="mt-2 space-y-1">
        <LegendItem color="#10b981" label="Low (1-3)" />
        <LegendItem color="#f59e0b" label="Medium (4-6)" />
        <LegendItem color="#ef4444" label="High (7-8)" />
        <LegendItem color="#dc2626" label="Critical (9-10)" />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}
