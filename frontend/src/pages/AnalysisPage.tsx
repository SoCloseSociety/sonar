import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Brain, Shield, Handshake, BarChart3, Eye, Terminal,
  Zap, Globe, Gauge, Megaphone, TrendingUp, TrendingDown,
  Activity, Clock, RefreshCw, ChevronDown, ChevronUp,
  AlertTriangle, Target, Loader2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '@/services/api';

interface AgentAssessment {
  agent_id: string;
  agent_name: string;
  agent_icon: string;
  assessment: string;
  severity_estimate: number;
  confidence: number;
  direction: string;
  key_factors?: string[];
  prediction: string;
  prediction_probability: number;
  dissent?: string | null;
}

interface Analysis {
  id: number;
  event_id: number | null;
  market_id: number | null;
  analysis_type: string;
  title: string;
  summary: string;
  agent_assessments: { agents: AgentAssessment[] } | null;
  consensus_severity: number;
  consensus_confidence: number;
  consensus_direction: string;
  prediction: string;
  prediction_probability: number;
  prediction_timeframe: string;
  agent_count: number;
  model_used: string | null;
  processing_time_ms: number | null;
  categories: string[] | null;
  created_at: string;
}

interface AnalysisStats {
  total_analyses: number;
  analyses_24h: number;
  avg_confidence_7d: number;
  direction_distribution: Record<string, number>;
  avg_accuracy: number | null;
  agent_count: number;
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  shield: Shield, handshake: Handshake, chart: BarChart3,
  eye: Eye, terminal: Terminal, bolt: Zap,
  globe: Globe, gauge: Gauge, megaphone: Megaphone, brain: Brain,
};

const DIR_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  escalation:      { color: '#FF3A3A', icon: TrendingUp,   label: 'ESCALATION' },
  'de-escalation': { color: '#00E676', icon: TrendingDown,  label: 'DE-ESCALATION' },
  stable:          { color: '#00CFEB', icon: Activity,       label: 'STABLE' },
  volatile:        { color: '#FFA800', icon: AlertTriangle,  label: 'VOLATILE' },
};

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-[4px] bg-[#0D1826] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.round(value * 100)}%`, backgroundColor: color }} />
      </div>
      <span className="text-[9px] tabular-nums font-mono w-8 text-right" style={{ color }}>
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function AgentCard({ agent, isExpanded, onToggle }: {
  agent: AgentAssessment; isExpanded: boolean; onToggle: () => void;
}) {
  const IconComp = AGENT_ICONS[agent.agent_icon] || Brain;
  const dir = DIR_CONFIG[agent.direction] || DIR_CONFIG.stable;
  const sevColor = agent.severity_estimate >= 8 ? '#FF3A3A' : agent.severity_estimate >= 6 ? '#FF6D2A' : agent.severity_estimate >= 4 ? '#FFA800' : '#00E676';

  return (
    <div className="bg-[#060B16] border border-[#152030] hover:border-[#1a2a40] transition-colors">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <IconComp size={12} style={{ color: dir.color }} />
        <span className="text-[9px] font-bold text-[#D0D9E8] tracking-wider flex-1 truncate">
          {agent.agent_name.toUpperCase()}
        </span>
        <span className="text-[8px] font-mono px-1.5 py-0.5 shrink-0" style={{ color: sevColor, background: `${sevColor}15` }}>
          SEV {agent.severity_estimate}
        </span>
        <span className="text-[8px] font-mono px-1.5 py-0.5 shrink-0" style={{ color: dir.color, background: `${dir.color}15` }}>
          {dir.label}
        </span>
        <span className="text-[8px] tabular-nums text-[#4E6070]">{(agent.confidence * 100).toFixed(0)}%</span>
        {isExpanded ? <ChevronUp size={10} className="text-[#4E6070]" /> : <ChevronDown size={10} className="text-[#4E6070]" />}
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-[#0D1826]">
          <p className="text-[9px] text-[#a0aec0] leading-relaxed pt-2">{agent.assessment}</p>
          {agent.key_factors && agent.key_factors.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {agent.key_factors.map((f, i) => (
                <span key={i} className="text-[7px] px-1.5 py-0.5 bg-[#0D1826] text-[#4E6070] border border-[#152030]">{f}</span>
              ))}
            </div>
          )}
          <div className="text-[8px] text-[#6B7280]">
            <Target size={8} className="inline mr-1" style={{ color: dir.color }} />
            <span className="text-[#D0D9E8]">{agent.prediction}</span>
          </div>
          {agent.dissent && agent.dissent !== 'None' && (
            <div className="text-[8px] text-[#FFA800] bg-[#FFA80008] border border-[#FFA80020] px-2 py-1">
              DISSENT: {agent.dissent}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnalysisCard({ analysis }: { analysis: Analysis }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const agents = analysis.agent_assessments?.agents || [];
  const dir = DIR_CONFIG[analysis.consensus_direction] || DIR_CONFIG.stable;
  const DirIcon = dir.icon;
  const sevColor = analysis.consensus_severity >= 8 ? '#FF3A3A' : analysis.consensus_severity >= 6 ? '#FF6D2A' : '#FFA800';
  const ago = (() => { try { return formatDistanceToNow(new Date(analysis.created_at), { addSuffix: true }); } catch { return ''; } })();

  // Direction vote breakdown
  const dirVotes: Record<string, number> = {};
  agents.forEach(a => { dirVotes[a.direction] = (dirVotes[a.direction] || 0) + 1; });

  return (
    <div className="border border-[#152030] bg-[#060B16]" style={{ borderLeft: `3px solid ${dir.color}` }}>
      {/* Header */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <DirIcon size={14} style={{ color: dir.color }} />
          <span className="text-[10px] font-black tracking-[2px]" style={{ color: dir.color }}>{dir.label}</span>
          <span className="text-[8px] text-[#2A3545] tracking-wider ml-auto">{analysis.analysis_type.replace('_', ' ').toUpperCase()}</span>
          <Clock size={8} className="text-[#2A3545]" />
          <span className="text-[7px] text-[#2A3545]">{ago}</span>
        </div>
        <h3 className="text-[11px] text-[#D0D9E8] font-bold leading-tight line-clamp-2">{analysis.title}</h3>

        {/* Consensus metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[7px] text-[#2A3545] tracking-wider">SEVERITY</div>
            <div className="text-[20px] font-black tabular-nums leading-none" style={{ color: sevColor }}>
              {analysis.consensus_severity.toFixed(1)}
            </div>
          </div>
          <div>
            <div className="text-[7px] text-[#2A3545] tracking-wider">CONFIDENCE</div>
            <ConfidenceBar value={analysis.consensus_confidence} color={dir.color} />
          </div>
          <div>
            <div className="text-[7px] text-[#2A3545] tracking-wider">PREDICTION</div>
            <div className="text-[11px] font-bold tabular-nums" style={{ color: '#00CFEB' }}>
              {(analysis.prediction_probability * 100).toFixed(0)}%
              <span className="text-[7px] text-[#2A3545] ml-1">{analysis.prediction_timeframe}</span>
            </div>
          </div>
        </div>

        {/* Direction votes */}
        <div className="flex gap-2">
          {Object.entries(dirVotes).sort((a, b) => b[1] - a[1]).map(([d, count]) => {
            const dc = DIR_CONFIG[d] || DIR_CONFIG.stable;
            return (
              <div key={d} className="flex items-center gap-1 px-2 py-0.5" style={{ background: `${dc.color}10`, border: `1px solid ${dc.color}20` }}>
                <span className="text-[8px] font-bold" style={{ color: dc.color }}>{count}</span>
                <span className="text-[7px]" style={{ color: dc.color }}>{dc.label}</span>
              </div>
            );
          })}
          <span className="text-[7px] text-[#2A3545] self-center ml-auto">{agents.length} AGENTS</span>
        </div>

        {/* Prediction text */}
        {analysis.prediction && (
          <div className="text-[9px] text-[#a0aec0] leading-relaxed bg-[#0A1020] px-3 py-2 border-l-2" style={{ borderColor: dir.color }}>
            {analysis.prediction}
          </div>
        )}

        {/* Expand agents */}
        <button onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[8px] text-[#4E6070] hover:text-[#D0D9E8] transition-colors tracking-wider">
          <Brain size={10} />
          {expanded ? 'HIDE' : 'SHOW'} AGENT ASSESSMENTS
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
      </div>

      {/* Agent cards */}
      {expanded && (
        <div className="px-3 pb-3 space-y-1">
          {agents.sort((a, b) => b.confidence - a.confidence).map(agent => (
            <AgentCard
              key={agent.agent_id}
              agent={agent}
              isExpanded={expandedAgent === agent.agent_id}
              onToggle={() => setExpandedAgent(expandedAgent === agent.agent_id ? null : agent.agent_id)}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      {analysis.processing_time_ms && (
        <div className="px-4 py-1.5 border-t border-[#0D1826] flex items-center gap-3 text-[7px] text-[#2A3545]">
          <span>MODEL: {analysis.model_used || 'rule-based'}</span>
          <span>TIME: {analysis.processing_time_ms}ms</span>
          {analysis.categories && <span>CATS: {analysis.categories.join(', ')}</span>}
        </div>
      )}
    </div>
  );
}

export function AnalysisPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [stats, setStats] = useState<AnalysisStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggerTopic, setTriggerTopic] = useState('');
  const [triggering, setTriggering] = useState(false);
  const mountedRef = useRef(true);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const load = async () => {
      try {
        const [aRes, sRes] = await Promise.allSettled([
          api.get('/analysis', { params: { limit: 20 } }),
          api.get('/analysis/stats'),
        ]);
        if (!mountedRef.current) return;
        if (aRes.status === 'fulfilled') setAnalyses(aRes.value.data);
        if (sRes.status === 'fulfilled') setStats(sRes.value.data);
      } catch { /* ignore */ }
      if (mountedRef.current) setLoading(false);
    };
    load();
    const iv = setInterval(load, 30000);
    return () => {
      mountedRef.current = false;
      clearInterval(iv);
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    };
  }, []);

  const triggerSituation = async () => {
    if (!triggerTopic.trim() || triggering) return;
    setTriggering(true);
    try {
      await api.post('/analysis/situation', null, { params: { topic: triggerTopic, hours: 48 } });
      setTriggerTopic('');
      // Reload after a delay; track timer so unmount cancels it.
      reloadTimerRef.current = setTimeout(async () => {
        try {
          const res = await api.get('/analysis', { params: { limit: 20 } });
          if (mountedRef.current) setAnalyses(res.data);
        } catch { /* ignore */ }
        if (mountedRef.current) setTriggering(false);
      }, 60000); // analyses take ~50s
    } catch {
      if (mountedRef.current) setTriggering(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#030711] p-4 space-y-3" style={{ fontFamily: 'ui-monospace, monospace' }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-[3px] h-5 bg-[#a855f7]" />
        <Brain size={14} className="text-[#a855f7]" />
        <span className="text-[11px] font-black text-[#D0D9E8] tracking-[3px]">CONSENSUS INTELLIGENCE ENGINE</span>
        <div className="flex-1" />
        {stats && (
          <div className="flex items-center gap-4 text-[8px] text-[#4E6070]">
            <span>{stats.total_analyses} ANALYSES</span>
            <span>{stats.agent_count} AGENTS</span>
            <span>AVG CONF: {(stats.avg_confidence_7d * 100).toFixed(0)}%</span>
          </div>
        )}
      </div>

      {/* Trigger new analysis */}
      <div className="flex items-center gap-2 bg-[#060B16] border border-[#152030] px-3 py-2">
        <Brain size={12} className="text-[#a855f7] shrink-0" />
        <input
          type="text"
          value={triggerTopic}
          onChange={e => setTriggerTopic(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && triggerSituation()}
          placeholder="Enter topic for situation analysis (e.g. Iran war, Taiwan strait, Ukraine...)..."
          className="flex-1 bg-transparent text-[10px] text-[#D0D9E8] placeholder-[#2A3545] outline-none font-mono"
        />
        <button
          onClick={triggerSituation}
          disabled={!triggerTopic.trim() || triggering}
          className="px-3 py-1 text-[8px] font-bold tracking-wider bg-[#a855f7]/10 text-[#a855f7] border border-[#a855f7]/30 hover:bg-[#a855f7]/20 disabled:opacity-30 transition-colors flex items-center gap-1"
        >
          {triggering ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
          {triggering ? 'ANALYZING...' : 'ANALYZE'}
        </button>
      </div>

      {/* Stats bar */}
      {stats && stats.direction_distribution && Object.keys(stats.direction_distribution).length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {(['escalation', 'volatile', 'stable', 'de-escalation'] as const).map(d => {
            const count = stats.direction_distribution[d] || 0;
            const dc = DIR_CONFIG[d] || DIR_CONFIG.stable;
            const DIcon = dc.icon;
            return (
              <div key={d} className="bg-[#060B16] border border-[#152030] px-3 py-2 text-center">
                <DIcon size={12} style={{ color: dc.color }} className="mx-auto mb-1" />
                <div className="text-[16px] font-black tabular-nums" style={{ color: dc.color }}>{count}</div>
                <div className="text-[7px] text-[#2A3545] tracking-wider">{dc.label}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Analyses list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="text-[#a855f7] animate-spin" />
        </div>
      ) : analyses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Brain size={32} className="text-[#2A3545]" />
          <p className="text-[10px] text-[#2A3545] tracking-wider">NO ANALYSES YET</p>
          <p className="text-[8px] text-[#1a2535]">Enter a topic above to trigger a multi-agent analysis</p>
        </div>
      ) : (
        <div className="space-y-3">
          {analyses.map(a => <AnalysisCard key={a.id} analysis={a} />)}
        </div>
      )}
    </div>
  );
}
