import { useState, memo } from 'react';
import { Filter, Shield, Eye, EyeOff, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { clsx } from 'clsx';

export type QualityMode = 'all' | 'verified' | 'critical';
export type ViewMode = 'standard' | 'strategic' | 'military';

interface Props {
  qualityMode: QualityMode;
  viewMode: ViewMode;
  onQualityChange: (mode: QualityMode) => void;
  onViewModeChange: (mode: ViewMode) => void;
}

const SEV_LEGEND = [
  { label: 'CRITICAL', color: '#dc2626', min: 9 },
  { label: 'HIGH', color: '#ef4444', min: 7 },
  { label: 'MEDIUM', color: '#f59e0b', min: 5 },
  { label: 'LOW', color: '#10b981', min: 3 },
  { label: 'INFO', color: '#06b6d4', min: 0 },
];

const CAT_LEGEND = [
  { label: 'MILITARY', color: '#ef4444', symbol: '⚔️' },
  { label: 'NUCLEAR', color: '#a855f7', symbol: '☢️' },
  { label: 'TERRORISM', color: '#dc2626', symbol: '💣' },
  { label: 'MARITIME', color: '#3b82f6', symbol: '⚓' },
  { label: 'AVIATION', color: '#f59e0b', symbol: '✈️' },
  { label: 'CYBER', color: '#8b5cf6', symbol: '🛡️' },
  { label: 'SEISMIC', color: '#f97316', symbol: '🌋' },
  { label: 'WEATHER', color: '#38bdf8', symbol: '⛈️' },
  { label: 'FIRE', color: '#ef4444', symbol: '🔥' },
  { label: 'DIPLOMATIC', color: '#3b82f6', symbol: '🏳️' },
];

const TRACKING_LEGEND = [
  { label: 'MIL AIRCRAFT', color: '#ef4444', size: 10 },
  { label: 'CIV AIRCRAFT', color: '#94a3b8', size: 8 },
  { label: 'MIL VESSEL', color: '#ef4444', size: 9 },
  { label: 'DARK VESSEL', color: '#f97316', size: 9 },
  { label: 'CIV VESSEL', color: '#3b82f6', size: 7 },
  { label: 'WEBCAM', color: '#06b6d4', size: 7 },
  { label: 'MIL BASE', color: '#f59e0b', size: 8 },
  { label: 'NUCLEAR SITE', color: '#a855f7', size: 9 },
];

const INFRA_LEGEND = [
  { label: 'OIL & GAS', color: '#f97316', symbol: '🛢️' },
  { label: 'LNG & GAS HUB', color: '#3b82f6', symbol: '🔵' },
  { label: 'ENERGY / DAM', color: '#eab308', symbol: '⚡' },
  { label: 'CHOKEPOINT', color: '#ef4444', symbol: '⚓' },
  { label: 'MINING', color: '#10b981', symbol: '💎' },
  { label: 'WATER INFRA', color: '#06b6d4', symbol: '💧' },
  { label: 'TECH / SEMI', color: '#ec4899', symbol: '🔬' },
  { label: 'PORT', color: '#8b5cf6', symbol: '🏗️' },
  { label: 'SUBMARINE CABLE', color: '#14b8a6', symbol: '🌐' },
];

const QUALITY_OPTIONS: { mode: QualityMode; label: string; desc: string; color: string }[] = [
  { mode: 'all', label: 'ALL INTEL', desc: 'All sources including unverified', color: '#64748b' },
  { mode: 'verified', label: 'VERIFIED', desc: 'Sev ≥5 + trusted sources only', color: '#3b82f6' },
  { mode: 'critical', label: 'CRITICAL', desc: 'Severity ≥8 confirmed events', color: '#ef4444' },
];

const VIEW_OPTIONS: { mode: ViewMode; label: string; icon: React.ElementType; desc: string }[] = [
  { mode: 'standard', label: 'STANDARD', icon: Eye, desc: 'All layers visible' },
  { mode: 'military', label: 'MILITARY', icon: Shield, desc: 'Military activity only' },
  { mode: 'strategic', label: 'STRATEGIC', icon: Filter, desc: 'Strategic points + conflicts' },
];

export const GlobeLegend = memo(function GlobeLegend({
  qualityMode,
  viewMode,
  onQualityChange,
  onViewModeChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'filter' | 'legend'>('filter');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-2 bg-black/80 backdrop-blur-xl border border-white/[0.08] rounded-lg hover:border-cyan-500/30 transition-all"
        title="Legend & Filters"
      >
        <Filter size={12} className="text-cyan-400" />
        <div className="flex items-center gap-1">
          {qualityMode !== 'all' && (
            <span className="text-[7px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1 rounded">
              {String(qualityMode).toUpperCase()}
            </span>
          )}
          {viewMode !== 'standard' && (
            <span className="text-[7px] font-mono font-bold text-red-400 bg-red-500/10 px-1 rounded">
              {String(viewMode).toUpperCase()}
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="bg-black/90 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl w-56">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <Filter size={11} className="text-cyan-400" />
          <span className="text-[9px] font-mono font-bold text-white tracking-[2px]">INTEL FILTER</span>
        </div>
        <button onClick={() => setOpen(false)} className="p-0.5 hover:bg-white/[0.05] rounded transition-colors">
          <ChevronDown size={10} className="text-slate-500 rotate-90" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.04]">
        {([
          { id: 'filter', label: 'FILTERS' },
          { id: 'legend', label: 'LEGEND' },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex-1 py-1.5 text-[8px] font-mono tracking-[1.5px] transition-all',
              activeTab === tab.id
                ? 'text-cyan-400 bg-cyan-500/[0.06] border-b border-cyan-400'
                : 'text-slate-500 hover:text-slate-300'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        {activeTab === 'filter' && (
          <div className="p-2 space-y-3">
            {/* Quality / Noise filter */}
            <div>
              <div className="text-[7px] font-mono text-slate-500 tracking-[2px] mb-1.5 px-1">
                SIGNAL QUALITY
              </div>
              <div className="space-y-0.5">
                {QUALITY_OPTIONS.map(opt => (
                  <button
                    key={opt.mode}
                    onClick={() => onQualityChange(opt.mode)}
                    className={clsx(
                      'w-full flex items-start gap-2 px-2 py-1.5 rounded-md transition-all text-left',
                      qualityMode === opt.mode
                        ? 'bg-white/[0.06] border border-white/[0.08]'
                        : 'hover:bg-white/[0.03]'
                    )}
                  >
                    <div
                      className="w-2 h-2 rounded-full mt-0.5 shrink-0"
                      style={{ background: opt.color, opacity: qualityMode === opt.mode ? 1 : 0.4 }}
                    />
                    <div>
                      <div className="text-[9px] font-mono font-bold" style={{ color: qualityMode === opt.mode ? opt.color : '#64748b' }}>
                        {opt.label}
                      </div>
                      <div className="text-[7px] font-mono text-slate-600 leading-tight mt-0.5">{opt.desc}</div>
                    </div>
                    {qualityMode === opt.mode && (
                      <div className="ml-auto shrink-0">
                        <div className="w-1 h-1 rounded-full" style={{ background: opt.color }} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* View mode */}
            <div>
              <div className="text-[7px] font-mono text-slate-500 tracking-[2px] mb-1.5 px-1">
                VIEW MODE
              </div>
              <div className="space-y-0.5">
                {VIEW_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.mode}
                      onClick={() => onViewModeChange(opt.mode)}
                      className={clsx(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-all text-left',
                        viewMode === opt.mode
                          ? 'bg-cyan-500/[0.08] border border-cyan-500/20'
                          : 'hover:bg-white/[0.03]'
                      )}
                    >
                      <Icon
                        size={11}
                        className={viewMode === opt.mode ? 'text-cyan-400' : 'text-slate-600'}
                      />
                      <div className="flex-1">
                        <span className={clsx(
                          'text-[9px] font-mono font-bold',
                          viewMode === opt.mode ? 'text-cyan-400' : 'text-slate-500'
                        )}>
                          {opt.label}
                        </span>
                        <div className="text-[7px] font-mono text-slate-600">{opt.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active filters badge */}
            {(qualityMode !== 'all' || viewMode !== 'standard') && (
              <div className="px-2 py-1.5 bg-amber-500/5 border border-amber-500/15 rounded-md flex items-center gap-1.5">
                <Info size={9} className="text-amber-400 shrink-0" />
                <span className="text-[7px] font-mono text-amber-400/80">
                  Filters active — some data hidden
                </span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'legend' && (
          <div className="p-2 space-y-3">
            {/* Severity legend */}
            <div>
              <div className="text-[7px] font-mono text-slate-500 tracking-[2px] mb-1.5 px-1">SEVERITY</div>
              <div className="space-y-0.5 px-1">
                {SEV_LEGEND.map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color, boxShadow: `0 0 4px ${s.color}60` }} />
                    <span className="text-[9px] font-mono" style={{ color: s.color }}>{s.label}</span>
                    <span className="text-[7px] font-mono text-slate-700 ml-auto">
                      {s.min === 9 ? '9-10' : s.min === 0 ? '1-2' : `${s.min}-${s.min + 1}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Categories */}
            <div>
              <div className="text-[7px] font-mono text-slate-500 tracking-[2px] mb-1.5 px-1">CATEGORIES</div>
              <div className="grid grid-cols-2 gap-0.5 px-1">
                {CAT_LEGEND.map(c => (
                  <div key={c.label} className="flex items-center gap-1.5">
                    <span className="text-[10px] leading-none">{c.symbol}</span>
                    <span className="text-[7px] font-mono text-slate-500 truncate">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tracking */}
            <div>
              <div className="text-[7px] font-mono text-slate-500 tracking-[2px] mb-1.5 px-1">TRACKING</div>
              <div className="space-y-0.5 px-1">
                {TRACKING_LEGEND.map(t => (
                  <div key={t.label} className="flex items-center gap-2">
                    <div
                      className="rounded-full shrink-0"
                      style={{
                        width: t.size, height: t.size,
                        background: t.color,
                        boxShadow: `0 0 3px ${t.color}50`,
                      }}
                    />
                    <span className="text-[8px] font-mono text-slate-400">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Infrastructure */}
            <div>
              <div className="text-[7px] font-mono text-slate-500 tracking-[2px] mb-1.5 px-1">INFRASTRUCTURE</div>
              <div className="grid grid-cols-2 gap-0.5 px-1">
                {INFRA_LEGEND.map(i => (
                  <div key={i.label} className="flex items-center gap-1.5">
                    <span className="text-[10px] leading-none">{i.symbol}</span>
                    <span className="text-[7px] font-mono text-slate-500 truncate">{i.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Globe colors */}
            <div>
              <div className="text-[7px] font-mono text-slate-500 tracking-[2px] mb-1.5 px-1">CONFLICT OVERLAY</div>
              <div className="space-y-0.5 px-1 text-[7px] font-mono text-slate-500">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-2 rounded" style={{ background: 'rgba(220,38,38,0.25)' }} />
                  <span>Active conflict zone</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-2 rounded" style={{ background: 'rgba(220,38,38,0.18)' }} />
                  <span>Critical severity country</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-2 rounded" style={{ background: 'rgba(245,158,11,0.08)' }} />
                  <span>Medium severity country</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
