import { lazy, Suspense, useState, useEffect, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { clsx } from 'clsx';
import api from '@/services/api';
import { Routes, Route } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomTicker } from './BottomTicker';
import { useWebSocket } from '@/hooks/useWebSocket';
import { MediaPanel, MediaToggle } from '@/components/media/MediaPanel';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[SONAR] Route crash:', error, info.componentStack); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-4 text-center p-8">
            <div className="text-2xl">&#x26A0;&#xFE0F;</div>
            <span className="text-sm font-mono text-red-400 tracking-wider">MODULE CRASH</span>
            <span className="text-xs font-mono text-slate-500 max-w-md">{this.state.error?.message}</span>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="text-xs font-mono text-cyan-400 border border-cyan-500/30 px-4 py-2 rounded-lg hover:bg-cyan-500/10 transition-colors"
            >
              RELOAD
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Lazy-load heavy components (3D globe, recharts)
const GlobeView = lazy(() => import('@/components/globe/GlobeView').then(m => ({ default: m.GlobeView })));
const DashboardView = lazy(() => import('@/components/dashboard/DashboardView').then(m => ({ default: m.DashboardView })));
const MarketList = lazy(() => import('@/components/markets/MarketList').then(m => ({ default: m.MarketList })));
const SignalList = lazy(() => import('@/components/signals/SignalList').then(m => ({ default: m.SignalList })));
const FlightPanel = lazy(() => import('@/components/tracking/FlightPanel').then(m => ({ default: m.FlightPanel })));
const VesselPanel = lazy(() => import('@/components/tracking/VesselPanel').then(m => ({ default: m.VesselPanel })));

// Lighter components loaded eagerly
import { IntelFeed } from '@/components/dashboard/IntelFeed';
const IntelPage = lazy(() => import('@/pages/IntelPage').then(m => ({ default: m.IntelPage })));
const AnalysisPage = lazy(() => import('@/pages/AnalysisPage').then(m => ({ default: m.AnalysisPage })));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        <span className="text-[10px] font-mono text-slate-500 tracking-widest">LOADING MODULE...</span>
      </div>
    </div>
  );
}

export function MainLayout() {
  useWebSocket(); // real-time updates

  return (
    <div className="h-screen flex overflow-hidden bg-[#030711] scanlines">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <BottomTicker />
        <main className="flex-1 overflow-hidden">
          <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<CommandView />} />
              <Route path="/dashboard" element={<DashboardView />} />
              <Route path="/intel" element={<IntelPage />} />
              <Route path="/signals" element={<SignalList />} />
              <Route path="/analysis" element={<AnalysisPage />} />
              <Route path="/news" element={<NewsView />} />
              <Route path="/flights" element={<FlightPanel />} />
              <Route path="/vessels" element={<VesselPanel />} />
              <Route path="/markets" element={<MarketList />} />
              <Route path="/settings" element={<SettingsView />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

/** Main command center: 3D Globe + side intel feed */
function CommandView() {
  const [showMedia, setShowMedia] = useState(false);

  return (
    <div className="h-full flex">
      <div className="flex-1 relative">
        <GlobeView />
        {/* Media toggle button */}
        <div className="absolute top-14 left-4 z-30">
          <MediaToggle open={showMedia} onToggle={() => setShowMedia(s => !s)} />
        </div>
        {/* Floating unified media panel */}
        {showMedia && (
          <div className="absolute top-24 left-4 z-30 animate-slide-in">
            <MediaPanel />
          </div>
        )}
      </div>
      <div className="w-80 border-l border-sonar-border/40 overflow-y-auto hidden xl:flex flex-col bg-[#0d1117]/60">
        <IntelFeed compact />
      </div>
    </div>
  );
}

/** Live News + Cameras full page */
function NewsView() {
  return <MediaPanel defaultTab="news" fullPage />;
}

function SettingsView() {
  const [minSeverity, setMinSeverity] = useState(6);
  const [confidence, setConfidence] = useState(70);
  const [scanInterval, setScanInterval] = useState(120);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sources, setSources] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get('/settings').then(({ data }) => {
      if (data.min_alert_severity != null) setMinSeverity(data.min_alert_severity);
      if (data.confidence_threshold != null) setConfidence(data.confidence_threshold);
      if (data.scan_interval != null) setScanInterval(data.scan_interval);
    }).catch(() => {});
    api.get('/dashboard/sources').then(({ data }) => {
      const src: Record<string, string> = {};
      if (Array.isArray(data)) {
        for (const s of data) src[s.name || s.source || ''] = s.status || 'ACTIVE';
      }
      setSources(src);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings', {
        min_alert_severity: minSeverity,
        confidence_threshold: confidence,
        scan_interval: scanInterval,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const sevColor = minSeverity >= 8 ? '#ef4444' : minSeverity >= 6 ? '#f59e0b' : '#10b981';
  const sevLabel = minSeverity >= 9 ? 'CRITICAL+' : minSeverity >= 7 ? 'HIGH+' : minSeverity >= 5 ? 'MEDIUM+' : 'ALL';

  return (
    <div className="p-6 max-w-4xl mx-auto overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-mono font-bold text-white flex items-center gap-2">
          <span className="text-cyan-400">///</span> SYSTEM CONFIGURATION
        </h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className={clsx(
            'px-4 py-2 rounded-lg font-mono text-[11px] tracking-wider transition-all border',
            saved
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
              : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20'
          )}
        >
          {saved ? '✓ SAVED' : saving ? 'SAVING...' : 'SAVE CONFIG'}
        </button>
      </div>

      <div className="grid gap-4">
        <div className="sonar-card">
          <h3 className="text-[10px] font-mono text-slate-400 mb-4 tracking-[2px]">ALERT PREFERENCES</h3>
          <div className="space-y-5">
            {/* Min alert severity */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-mono text-slate-400">MIN ALERT SEVERITY</label>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded" style={{ color: sevColor, background: `${sevColor}15` }}>
                  {minSeverity}/10 — {sevLabel}
                </span>
              </div>
              <input
                type="range" min={1} max={10} value={minSeverity}
                onChange={(e) => setMinSeverity(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none bg-[#1a1f2e] cursor-pointer accent-cyan-500"
              />
              <div className="flex justify-between text-[8px] font-mono text-slate-600 mt-1">
                <span>1 (ALL)</span><span>5 (MED)</span><span>8 (HIGH)</span><span>10 (CRIT)</span>
              </div>
            </div>

            {/* Confidence threshold */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-mono text-slate-400">SIGNAL CONFIDENCE THRESHOLD</label>
                <span className="text-xs font-mono text-cyan-400 font-bold">{confidence}%</span>
              </div>
              <input
                type="range" min={10} max={100} step={5} value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none bg-[#1a1f2e] cursor-pointer accent-cyan-500"
              />
              <div className="flex justify-between text-[8px] font-mono text-slate-600 mt-1">
                <span>10%</span><span>50%</span><span>75%</span><span>100%</span>
              </div>
            </div>

            {/* Scan interval */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-mono text-slate-400">SCAN INTERVAL (SECONDS)</label>
                <span className="text-xs font-mono text-cyan-400 font-bold">{scanInterval}s</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number" min={30} max={600} step={30} value={scanInterval}
                  onChange={(e) => setScanInterval(Math.max(30, Math.min(600, Number(e.target.value))))}
                  className="w-24 px-2 py-1 bg-white/[0.03] border border-sonar-border/20 rounded text-[11px] font-mono text-slate-300 focus:outline-none focus:border-cyan-500/30"
                />
                <span className="text-[9px] font-mono text-slate-600">Range: 30–600s</span>
              </div>
            </div>
          </div>
        </div>

        <div className="sonar-card">
          <h3 className="text-[10px] font-mono text-slate-400 mb-4 tracking-[2px]">DATA SOURCES STATUS</h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.keys(sources).length > 0 ? (
              Object.entries(sources).map(([name, status]) => (
                <div key={name} className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                  <span className="text-[10px] font-mono text-slate-400 capitalize">{name.replace(/_/g, ' ')}</span>
                  <span className={`text-[9px] font-mono font-bold ${status === 'active' || status === 'ACTIVE' ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {String(status).toUpperCase()}
                  </span>
                </div>
              ))
            ) : (
              [
                { label: 'RSS / GDELT', active: true }, { label: 'Flight tracking', active: true },
                { label: 'Vessel tracking', active: true }, { label: 'Polymarket', active: true },
                { label: 'YouTube Live', active: true }, { label: 'Reddit OSINT', active: true },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                  <span className="text-[10px] font-mono text-slate-400">{s.label}</span>
                  <span className="text-[9px] font-mono font-bold text-emerald-400">ACTIVE</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
