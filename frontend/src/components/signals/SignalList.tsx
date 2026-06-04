import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Signal } from '@/types/signal';
import api from '@/services/api';
import { getSocket } from '@/services/socket';
import { formatDistanceToNow } from 'date-fns';
import {
  TrendingUp, TrendingDown, Zap, Clock, X, Target,
  ArrowUpRight, ArrowDownRight, ChevronRight,
  Info, Gauge, BookOpen, RefreshCw, ExternalLink, HelpCircle,
} from 'lucide-react';

type FilterType = 'all' | 'buy' | 'sell' | 'urgent' | 'strong';

// ── Helpers ──────────────────────────────────────────────────────
function edgeColor(edge: number): string {
  if (edge >= 15) return '#00E676';
  if (edge >= 8)  return '#FF6D2A';
  if (edge >= 3)  return '#FFA800';
  return '#4E6070';
}

function edgeLabel(edge: number): string {
  if (edge >= 15) return 'STRONG';
  if (edge >= 8)  return 'SOLID';
  if (edge >= 3)  return 'WEAK';
  return 'SLIM';
}

function sensitivityBadge(s: string | undefined) {
  if (s === 'urgent') return { label: 'URGENT', color: '#FF3A3A', bg: 'rgba(255,58,58,0.12)' };
  if (s === 'high')   return { label: 'TIME-SENSITIVE', color: '#FF6D2A', bg: 'rgba(255,109,42,0.1)' };
  return null;
}

function timeAgo(ts: string): string {
  try { return formatDistanceToNow(new Date(ts), { addSuffix: true }); }
  catch { return '—'; }
}

function isNew(ts: string): boolean {
  try { return Date.now() - new Date(ts).getTime() < 5 * 60 * 1000; }
  catch { return false; }
}

function polymarketUrl(conditionId: string): string {
  return `https://polymarket.com/event/${conditionId}`;
}

// ── Guide Panel ──────────────────────────────────────────────────
function GuidePanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="border-b shrink-0" style={{ borderColor: '#152030', background: '#040C18' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: '#0D1826' }}>
        <div className="flex items-center gap-2">
          <BookOpen size={11} style={{ color: '#00CFEB' }} />
          <span className="text-[9px] font-mono font-bold tracking-[3px] text-[#00CFEB]">COMMENT LIRE LES SIGNAUX</span>
        </div>
        <button onClick={onClose} className="text-[#2A3545] hover:text-[#4E6070] transition-colors">
          <X size={12} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-px p-px" style={{ background: '#0D1826' }}>

        <div className="px-4 py-3" style={{ background: '#040C18' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <HelpCircle size={10} style={{ color: '#FFA800' }} />
            <span className="text-[8px] font-mono font-bold tracking-[2px] text-[#FFA800]">QU'EST-CE QU'UN SIGNAL?</span>
          </div>
          <p className="text-[10px] font-mono text-[#7A8FA8] leading-relaxed">
            SONAR détecte un événement réel (ex: missile lancé, sanctions annoncées) et compare avec le prix
            d'un marché de prédiction Polymarket. Si le marché n'a pas encore réagi,{' '}
            <span className="text-[#D0D9E8]">il y a une opportunité de profit</span>.
          </p>
        </div>

        <div className="px-4 py-3" style={{ background: '#040C18' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Gauge size={10} style={{ color: '#FF6D2A' }} />
            <span className="text-[8px] font-mono font-bold tracking-[2px] text-[#FF6D2A]">EDGE % — PROFIT ATTENDU</span>
          </div>
          <p className="text-[10px] font-mono text-[#7A8FA8] leading-relaxed">
            Écart entre le prix actuel du marché et la valeur estimée par l'IA.{' '}
            <span className="text-[#00E676]">+15% EDGE</span> = achetez à 45¢, vendez à 60¢ = +15¢ de profit.
          </p>
          <div className="flex items-center gap-3 mt-2">
            {([['≥15%', '#00E676', 'FORT'], ['≥8%', '#FF6D2A', 'BON'], ['≥3%', '#FFA800', 'FAIBLE']] as const).map(([val, color, lbl]) => (
              <div key={lbl} className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                <span className="text-[8px] font-mono" style={{ color }}>{val} {lbl}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 py-3" style={{ background: '#040C18' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp size={10} style={{ color: '#00E676' }} />
            <span className="text-[8px] font-mono font-bold tracking-[2px] text-[#00E676]">BUY YES / BUY NO</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="text-[8px] font-mono font-bold px-1.5 py-px shrink-0" style={{ background: 'rgba(0,230,118,0.12)', color: '#00E676' }}>
                BUY YES ▲
              </span>
              <p className="text-[10px] font-mono text-[#7A8FA8]">
                L'IA pense que la question se réalisera. Le marché sous-estime → achetez des parts YES.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[8px] font-mono font-bold px-1.5 py-px shrink-0" style={{ background: 'rgba(255,58,58,0.12)', color: '#FF3A3A' }}>
                BUY NO ▼
              </span>
              <p className="text-[10px] font-mono text-[#7A8FA8]">
                L'IA pense que la question NE se réalisera PAS. Le marché surestime → achetez des parts NO.
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 py-3" style={{ background: '#040C18' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <ExternalLink size={10} style={{ color: '#00CFEB' }} />
            <span className="text-[8px] font-mono font-bold tracking-[2px] text-[#00CFEB]">COMMENT MISER?</span>
          </div>
          <p className="text-[10px] font-mono text-[#7A8FA8] leading-relaxed">
            Cliquez sur un signal pour voir <span className="text-[#D0D9E8]">la question exacte du marché</span>.
            Puis cliquez <span className="text-[#00E676]">BET YES/NO</span> pour aller directement sur
            Polymarket.com et parier. Connectez votre wallet MetaMask sur Polymarket.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Signal Row ───────────────────────────────────────────────────
function SignalRow({
  signal,
  selected,
  onSelect,
  rank,
}: {
  signal: Signal;
  selected: boolean;
  onSelect: (s: Signal) => void;
  rank: number;
}) {
  const isUp     = signal.direction === 'BUY_YES';
  const edge     = signal.edge_pct ?? 0;
  const conf     = signal.confidence ?? 0;
  const price    = signal.current_price != null ? (signal.current_price * 100).toFixed(0) : '—';
  const fair     = signal.estimated_fair_value != null ? (signal.estimated_fair_value * 100).toFixed(0) : '—';
  const ec       = edgeColor(edge);
  const eLbl     = edgeLabel(edge);
  const sens     = sensitivityBadge(signal.time_sensitivity);
  const dirColor = isUp ? '#00E676' : '#FF3A3A';
  const fresh    = isNew(signal.created_at);

  return (
    <div
      onClick={() => onSelect(signal)}
      className="cursor-pointer border-b group"
      style={{
        borderColor: '#0D1826',
        background: selected ? 'rgba(255,109,42,0.05)' : undefined,
      }}
    >
      <div
        className="px-4 py-3 transition-colors"
        style={{ borderLeft: `3px solid ${selected ? '#FF6D2A' : 'transparent'}` }}
        onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = '#060B16'; }}
        onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = ''; }}
      >
        {/* Row 1: rank + direction + edge + badges + time */}
        <div className="flex items-center gap-3 mb-2">
          <div className="text-[9px] font-mono text-[#2A3545] w-5 shrink-0 text-right">#{rank}</div>

          <div
            className="flex items-center gap-1 px-2 py-0.5 shrink-0"
            style={{ background: `${dirColor}12`, border: `1px solid ${dirColor}30` }}
          >
            {isUp
              ? <ArrowUpRight size={10} style={{ color: dirColor }} />
              : <ArrowDownRight size={10} style={{ color: dirColor }} />
            }
            <span className="text-[8px] font-mono font-black tracking-[2px]" style={{ color: dirColor }}>
              {isUp ? 'BUY YES' : 'BUY NO'}
            </span>
          </div>

          <div className="flex items-baseline gap-1 shrink-0">
            <span className="text-lg font-mono font-black tabular-nums leading-none" style={{ color: ec }}>
              {edge > 0 ? '+' : ''}{edge.toFixed(1)}%
            </span>
            <span className="text-[7px] font-mono tracking-widest" style={{ color: `${ec}80` }}>{eLbl}</span>
          </div>

          <div className="flex-1" />

          {fresh && (
            <span className="text-[7px] font-black tracking-widest px-1.5 py-px animate-pulse"
              style={{ background: 'rgba(0,207,235,0.15)', color: '#00CFEB', border: '1px solid rgba(0,207,235,0.3)' }}>
              NEW
            </span>
          )}

          {sens && (
            <span className="text-[7px] font-black tracking-widest px-1.5 py-px"
              style={{ color: sens.color, background: sens.bg, border: `1px solid ${sens.color}30` }}>
              {sens.label}
            </span>
          )}

          <span className="text-[8px] font-mono text-[#2A3545] hidden sm:block shrink-0">
            {timeAgo(signal.created_at)}
          </span>

          <ChevronRight size={11} className="text-[#2A3545] shrink-0" />
        </div>

        {/* Row 2: THE MARKET QUESTION (most important) */}
        <div className="ml-8 space-y-1">
          {signal.market_question ? (
            <p className="text-[11px] font-mono text-[#D0D9E8] leading-snug font-semibold">
              {signal.market_question.length > 120
                ? signal.market_question.slice(0, 120) + '…'
                : signal.market_question}
            </p>
          ) : null}

          {/* Reasoning below the question */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              {signal.reasoning && (
                <p className="text-[9px] font-mono text-[#4E6070] leading-relaxed line-clamp-1">
                  {signal.reasoning}
                </p>
              )}
              {!signal.market_question && !signal.reasoning && (
                <p className="text-[10px] font-mono text-[#2A3545] italic">
                  {signal.signal_type?.replace(/_/g, ' ')} — market #{signal.market_id ?? '—'}
                </p>
              )}
            </div>

            {/* Metric strip */}
            <div className="flex items-center gap-3 shrink-0 hidden sm:flex">
              <div className="text-center">
                <div className="text-[8px] font-mono text-[#2A3545] mb-0.5">PRIX → CIBLE</div>
                <div className="flex items-center gap-1 text-[9px] font-mono tabular-nums">
                  <span className="text-[#4E6070]">{price}¢</span>
                  <span className="text-[#2A3545]">→</span>
                  <span className="font-bold" style={{ color: dirColor }}>{fair}¢</span>
                </div>
              </div>

              <div className="text-center w-16">
                <div className="text-[8px] font-mono text-[#2A3545] mb-0.5">CONFIANCE</div>
                <div className="flex items-center gap-1">
                  <div className="flex-1 h-[3px] bg-[#0D1826] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${conf * 100}%`, background: ec }} />
                  </div>
                  <span className="text-[8px] font-mono tabular-nums" style={{ color: ec }}>
                    {(conf * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detail Panel ─────────────────────────────────────────────────
function SignalDetail({ signal, onClose }: { signal: Signal; onClose: () => void }) {
  const navigate = useNavigate();
  const isUp      = signal.direction === 'BUY_YES';
  const edge      = signal.edge_pct ?? 0;
  const conf      = signal.confidence ?? 0;
  const price     = signal.current_price != null ? (signal.current_price * 100).toFixed(0) : '—';
  const fair      = signal.estimated_fair_value != null ? (signal.estimated_fair_value * 100).toFixed(0) : '—';
  const ec        = edgeColor(edge);
  const dirColor  = isUp ? '#00E676' : '#FF3A3A';
  const sens      = sensitivityBadge(signal.time_sensitivity);

  const priceCents = signal.current_price != null ? signal.current_price * 100 : null;
  const fairCents  = signal.estimated_fair_value != null ? signal.estimated_fair_value * 100 : null;
  const impliedProb = signal.estimated_fair_value != null ? (signal.estimated_fair_value * 100).toFixed(0) : null;

  const polyUrl = signal.market_condition_id ? polymarketUrl(signal.market_condition_id) : null;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#060B16' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: '#152030' }}>
        <span className="text-[9px] font-mono font-bold tracking-[3px] text-[#FF6D2A]">ANALYSE DU SIGNAL</span>
        <button onClick={onClose} className="text-[#4E6070] hover:text-[#D0D9E8] transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* ── THE BET: market question ── */}
        <div className="border rounded p-3" style={{ borderColor: '#152030', background: '#030711' }}>
          <div className="text-[7px] font-mono text-[#4E6070] tracking-[2px] mb-2 flex items-center gap-1">
            <Target size={8} style={{ color: '#FF6D2A' }} />
            SUR QUOI PARIEZ-VOUS?
          </div>
          {signal.market_question ? (
            <p className="text-[12px] font-mono text-[#D0D9E8] leading-relaxed font-semibold">
              {signal.market_question}
            </p>
          ) : (
            <p className="text-[11px] font-mono text-[#4E6070] italic">
              Marché #{signal.market_id ?? '—'} (question non disponible)
            </p>
          )}
          {signal.market_category && (
            <div className="mt-1.5">
              <span className="text-[7px] font-mono px-1.5 py-px" style={{ background: 'rgba(255,109,42,0.1)', color: '#FF6D2A', border: '1px solid rgba(255,109,42,0.2)' }}>
                {String(signal.market_category || '').toUpperCase()}
              </span>
            </div>
          )}
          {polyUrl && (
            <a
              href={polyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 mt-2 text-[8px] font-mono text-[#00CFEB] hover:text-[#6DD5FA] transition-colors"
            >
              <ExternalLink size={9} />
              Voir le marché sur Polymarket
            </a>
          )}
        </div>

        {/* ── VERDICT hero ── */}
        <div className="border rounded p-4" style={{ borderColor: `${dirColor}25`, background: `${dirColor}06` }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {isUp ? <TrendingUp size={16} style={{ color: dirColor }} /> : <TrendingDown size={16} style={{ color: dirColor }} />}
              <span className="text-xs font-mono font-black tracking-[2px]" style={{ color: dirColor }}>
                {isUp ? 'ACHETEZ YES — ÇA VA ARRIVER' : "ACHETEZ NO — ÇA N'ARRIVERA PAS"}
              </span>
            </div>
            {sens && (
              <span className="text-[7px] font-black tracking-widest px-1.5 py-px border"
                style={{ color: sens.color, background: sens.bg, borderColor: `${sens.color}30` }}>
                {sens.label}
              </span>
            )}
          </div>

          <div className="flex items-end gap-3">
            <div>
              <div className="text-[8px] font-mono text-[#4E6070] tracking-[2px] mb-1">EDGE ATTENDU</div>
              <div className="text-4xl font-mono font-black tabular-nums leading-none" style={{ color: ec }}>
                {edge > 0 ? '+' : ''}{edge.toFixed(1)}%
              </div>
              <div className="text-[8px] font-mono mt-1" style={{ color: `${ec}80` }}>{edgeLabel(edge)} OPPORTUNITÉ</div>
            </div>

            <div className="flex-1">
              <div className="text-[8px] font-mono text-[#4E6070] mb-1.5 tracking-[2px]">COMMENT GAGNER</div>
              {priceCents !== null && fairCents !== null ? (
                <div className="text-[10px] font-mono text-[#7A8FA8] leading-relaxed">
                  Achetez à <span className="text-[#D0D9E8] font-bold">{priceCents.toFixed(0)}¢</span>,
                  {' '}récupérez <span style={{ color: dirColor }} className="font-bold">{fairCents.toFixed(0)}¢</span>
                  {' '}si l'IA a raison.
                  <br />
                  <span style={{ color: ec }}>+{edge.toFixed(1)}¢ de profit par part.</span>
                </div>
              ) : (
                <div className="text-[10px] font-mono text-[#4E6070]">Pas de données de prix</div>
              )}
            </div>
          </div>
        </div>

        {/* ── Linked event (what triggered the signal) ── */}
        {signal.event_summary && (
          <div className="border rounded p-3" style={{ borderColor: '#152030', background: 'rgba(0,207,235,0.02)' }}>
            <div className="text-[7px] font-mono text-[#00CFEB] tracking-[2px] mb-1.5 flex items-center gap-1">
              <Zap size={8} style={{ color: '#00CFEB' }} />
              ÉVÉNEMENT DÉCLENCHEUR
            </div>
            <p className="text-[10px] font-mono text-[#7A8FA8] leading-relaxed">{signal.event_summary}</p>
          </div>
        )}

        {/* ── Probability bar ── */}
        {impliedProb && (
          <div className="border rounded p-3" style={{ borderColor: '#152030', background: '#030711' }}>
            <div className="text-[8px] font-mono text-[#4E6070] tracking-[2px] mb-2">PROBABILITÉ ESTIMÉE PAR L'IA</div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-[8px] font-mono mb-1">
                  <span className="text-[#4E6070]">NON (0%)</span>
                  <span className="font-bold" style={{ color: ec }}>{impliedProb}% OUI</span>
                  <span className="text-[#4E6070]">OUI (100%)</span>
                </div>
                <div className="h-2 bg-[#0D1826] rounded-full overflow-hidden relative">
                  {priceCents !== null && (
                    <div className="absolute top-0 h-full w-0.5 bg-[#4E6070]" style={{ left: `${priceCents}%` }} />
                  )}
                  <div className="h-full rounded-full opacity-40" style={{ width: `${impliedProb}%`, background: ec }} />
                </div>
                <div className="flex justify-between text-[7px] font-mono mt-1 text-[#2A3545]">
                  <span>MARCHÉ: {price}¢</span>
                  <span style={{ color: ec }}>IA: {fair}¢</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Confidence ── */}
        <div className="border rounded p-3" style={{ borderColor: '#152030', background: '#030711' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[8px] font-mono text-[#4E6070] tracking-[2px]">CONFIANCE DU MODÈLE</span>
            <span className="text-[10px] font-mono font-bold" style={{ color: ec }}>{(conf * 100).toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-[#0D1826] rounded-full overflow-hidden mb-1">
            <div className="h-full rounded-full" style={{ width: `${conf * 100}%`, background: `linear-gradient(90deg, ${ec}80, ${ec})` }} />
          </div>
          <div className="text-[8px] font-mono text-[#2A3545]">
            {conf >= 0.8 ? 'HAUTE CONFIANCE — signal fort, taille de position normale'
              : conf >= 0.6 ? 'CONFIANCE MODÉRÉE — signal valide, prudence recommandée'
              : 'FAIBLE CONFIANCE — signal spéculatif, petite position seulement'}
          </div>
        </div>

        {/* ── AI reasoning ── */}
        {signal.reasoning && (
          <div className="border rounded p-3" style={{ borderColor: '#00CFEB20', background: 'rgba(0,207,235,0.03)' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Info size={9} style={{ color: '#00CFEB' }} />
              <div className="text-[8px] font-mono text-[#00CFEB] tracking-[2px]">ANALYSE IA</div>
            </div>
            <p className="text-[11px] font-mono text-[#94A3B8] leading-relaxed">{signal.reasoning}</p>
          </div>
        )}

        {/* ── Meta grid ── */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'PRIX MARCHÉ', value: `${price}¢`, sub: 'prix actuel de trading', color: '#D0D9E8' },
            { label: 'VALEUR JUSTE IA', value: `${fair}¢`, sub: 'où le prix devrait être', color: dirColor },
            { label: 'CONFIANCE', value: `${(conf * 100).toFixed(0)}%`, sub: 'certitude du modèle', color: ec },
            { label: 'STATUT', value: String(signal.status || '').toUpperCase(), sub: 'état du signal', color: signal.status === 'active' ? '#00E676' : '#4E6070' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="border rounded p-2.5" style={{ borderColor: '#152030', background: '#030711' }}>
              <div className="text-[7px] font-mono text-[#2A3545] tracking-[2px] mb-0.5">{label}</div>
              <div className="text-sm font-mono font-bold tabular-nums" style={{ color }}>{value}</div>
              <div className="text-[7px] font-mono text-[#2A3545] mt-0.5">{sub}</div>
            </div>
          ))}
        </div>

        {/* ── Type + Meta ── */}
        <div className="border rounded divide-y divide-[#0D1826]" style={{ borderColor: '#152030' }}>
          <div className="flex justify-between items-center px-3 py-2">
            <span className="text-[8px] font-mono text-[#4E6070]">TYPE DE SIGNAL</span>
            <span className="text-[9px] font-mono font-bold text-[#FF6D2A]">
              {(signal.signal_type || '').replace(/_/g, ' ')}
            </span>
          </div>
          <div className="flex justify-between items-center px-3 py-2">
            <span className="text-[8px] font-mono text-[#4E6070]">URGENCE</span>
            <span className="text-[9px] font-mono font-bold" style={{
              color: signal.time_sensitivity === 'urgent' ? '#FF3A3A'
                   : signal.time_sensitivity === 'high'   ? '#FF6D2A'
                   : '#4E6070'
            }}>
              {String(signal.time_sensitivity || 'NORMAL').toUpperCase()}
            </span>
          </div>
          {signal.event_id && (
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-[8px] font-mono text-[#4E6070]">ÉVÉNEMENT LIÉ</span>
              <span className="text-[9px] font-mono text-[#00CFEB]">ÉVÉNEMENT #{signal.event_id}</span>
            </div>
          )}
          {signal.market_condition_id && (
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-[8px] font-mono text-[#4E6070]">CONDITION ID</span>
              <span className="text-[8px] font-mono text-[#2A3545] truncate max-w-[120px]">{signal.market_condition_id}</span>
            </div>
          )}
          <div className="flex justify-between items-center px-3 py-2">
            <span className="text-[8px] font-mono text-[#4E6070]">GÉNÉRÉ</span>
            <span className="text-[9px] font-mono text-[#4E6070]">{timeAgo(signal.created_at)}</span>
          </div>
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="px-4 py-3 border-t space-y-2 shrink-0" style={{ borderColor: '#152030' }}>
        {signal.market_id ? (
          <>
            <button
              onClick={() => navigate(`/markets?signal=${signal.market_id}&outcome=${isUp ? 'YES' : 'NO'}&price=${fair}`)}
              className="flex items-center justify-center gap-2 w-full py-2.5 font-mono text-[11px] font-black tracking-[3px] border transition-all cursor-pointer"
              style={{ color: dirColor, borderColor: `${dirColor}40`, background: `${dirColor}12` }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${dirColor}25`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${dirColor}12`; }}
            >
              <Target size={12} />
              {isUp ? '▲ PLACER UN TRADE OUI' : '▼ PLACER UN TRADE NON'} — {fair}¢
            </button>
            <div className="flex gap-2">
              {polyUrl && (
                <a href={polyUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[8px] font-mono text-[#4E6070] border border-[#152030] hover:text-[#D0D9E8] hover:border-[#2A3545] transition-colors no-underline">
                  <ExternalLink size={8} /> POLYMARKET.COM
                </a>
              )}
            </div>
          </>
        ) : (
          <div className="w-full py-2.5 font-mono text-[10px] text-center text-[#2A3545] border border-[#152030]">
            Pas de marche lie -- signal d'alerte uniquement
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stats Strip ──────────────────────────────────────────────────
function StatCell({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-3 py-2">
      <div className="text-[10px] font-mono font-black tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[7px] font-mono text-[#2A3545] tracking-wider mt-px">{label}</div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────
export function SignalList() {
  const [signals, setSignals]               = useState<Signal[]>([]);
  const [loading, setLoading]               = useState(true);
  const [filter, setFilter]                 = useState<FilterType>('all');
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [showGuide, setShowGuide]           = useState(true);
  const [refreshing, setRefreshing]         = useState(false);

  const fetchSignals = () => {
    setRefreshing(true);
    api.get('/signals')
      .then(({ data }) => setSignals(data))
      .catch(() => {})
      .finally(() => { setLoading(false); setRefreshing(false); });
  };

  useEffect(() => {
    fetchSignals();
    const socket = getSocket();
    const onNew = (signal: Signal) =>
      setSignals(prev => prev.find(s => s.id === signal.id) ? prev : [signal, ...prev]);
    socket.on('new_signal', onNew);
    return () => { socket.off('new_signal', onNew); };
  }, []);

  const stats = useMemo(() => {
    const buy     = signals.filter(s => s.direction === 'BUY_YES').length;
    const sell    = signals.filter(s => s.direction === 'BUY_NO').length;
    const urgent  = signals.filter(s => s.time_sensitivity === 'urgent').length;
    const strong  = signals.filter(s => s.signal_type === 'STRONG_MISPRICING').length;
    const avgEdge = signals.length > 0
      ? signals.reduce((a, s) => a + (s.edge_pct ?? 0), 0) / signals.length : 0;
    const topEdge = signals.length > 0
      ? Math.max(...signals.map(s => s.edge_pct ?? 0)) : 0;
    return { buy, sell, urgent, strong, avgEdge, topEdge };
  }, [signals]);

  const filtered = useMemo(() => {
    const base = (() => {
      switch (filter) {
        case 'buy':    return signals.filter(s => s.direction === 'BUY_YES');
        case 'sell':   return signals.filter(s => s.direction === 'BUY_NO');
        case 'urgent': return signals.filter(s => s.time_sensitivity === 'urgent');
        case 'strong': return signals.filter(s => s.signal_type === 'STRONG_MISPRICING');
        default:       return signals;
      }
    })();
    return [...base].sort((a, b) => (b.edge_pct ?? 0) - (a.edge_pct ?? 0));
  }, [signals, filter]);

  const FILTERS: { key: FilterType; label: string; count: number; color: string }[] = [
    { key: 'all',    label: 'TOUS',        count: signals.length, color: '#FF6D2A' },
    { key: 'buy',    label: '▲ PARIER OUI', count: stats.buy,    color: '#00E676' },
    { key: 'sell',   label: '▼ PARIER NON', count: stats.sell,   color: '#FF3A3A' },
    { key: 'urgent', label: '⚡ URGENT',    count: stats.urgent, color: '#FF3A3A' },
    { key: 'strong', label: '◉ FORT',       count: stats.strong, color: '#FFA800' },
  ];

  return (
    <div className="h-full flex overflow-hidden" style={{ background: '#030711' }}>

      {/* ── Left: List ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        <div className="px-4 pt-3 pb-2 border-b shrink-0" style={{ borderColor: '#152030', background: '#060B16' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target size={14} style={{ color: '#FF6D2A' }} />
              <span className="text-[11px] font-mono font-black tracking-[3px] text-[#D0D9E8]">SIGNAUX DE TRADING IA</span>
              {stats.urgent > 0 && (
                <span className="flex items-center gap-1 text-[8px] font-black tracking-widest px-1.5 py-px border animate-pulse"
                  style={{ color: '#FF3A3A', borderColor: '#FF3A3A40', background: 'rgba(255,58,58,0.1)' }}>
                  <Zap size={8} /> {stats.urgent} URGENT
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchSignals}
                disabled={refreshing}
                className="flex items-center gap-1 px-2 py-1 border transition-all text-[8px] font-mono tracking-widest"
                style={{ borderColor: '#152030', color: '#4E6070' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#D0D9E8'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#4E6070'; }}
              >
                <RefreshCw size={9} className={refreshing ? 'animate-spin' : ''} />
                REFRESH
              </button>
              <button
                onClick={() => setShowGuide(v => !v)}
                className="flex items-center gap-1 px-2 py-1 border transition-all text-[8px] font-mono tracking-widest"
                style={{
                  borderColor: showGuide ? '#00CFEB40' : '#152030',
                  color: showGuide ? '#00CFEB' : '#4E6070',
                  background: showGuide ? 'rgba(0,207,235,0.06)' : 'transparent',
                }}
              >
                <Info size={9} /> GUIDE
              </button>
            </div>
          </div>

          {/* Stats strip */}
          <div className="flex items-stretch divide-x divide-[#0D1826] mb-2" style={{ border: '1px solid #0D1826', background: '#030711' }}>
            <StatCell label="SIGNAUX"    value={signals.length}               color="#D0D9E8" />
            <StatCell label="▲ OUI"      value={stats.buy}                    color="#00E676" />
            <StatCell label="▼ NON"      value={stats.sell}                   color="#FF3A3A" />
            <StatCell label="URGENT ⚡"  value={stats.urgent}                 color="#FF3A3A" />
            <StatCell label="EDGE MOY"   value={`${stats.avgEdge.toFixed(1)}%`} color="#FF6D2A" />
            <StatCell label="BEST EDGE"  value={`+${stats.topEdge.toFixed(1)}%`} color="#00E676" />
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            {FILTERS.map(({ key, label, count, color }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className="px-2.5 py-1 text-[8px] font-mono font-bold tracking-[1px] border transition-all"
                style={filter === key
                  ? { color, borderColor: `${color}40`, background: `${color}12` }
                  : { color: '#2A3545', borderColor: '#0D1826', background: 'transparent' }
                }
                onMouseEnter={e => { if (filter !== key) (e.currentTarget as HTMLElement).style.color = '#D0D9E8'; }}
                onMouseLeave={e => { if (filter !== key) (e.currentTarget as HTMLElement).style.color = '#2A3545'; }}
              >
                {label}
                <span className="ml-1.5 opacity-60">{count}</span>
              </button>
            ))}
            <div className="flex-1" />
            <span className="text-[7px] font-mono text-[#2A3545] tracking-wider">TRIÉ PAR EDGE ↓</span>
          </div>
        </div>

        {/* Guide */}
        {showGuide && <GuidePanel onClose={() => setShowGuide(false)} />}

        {/* Column header */}
        <div className="flex items-center gap-2 px-4 py-1.5 border-b" style={{ borderColor: '#0D1826', background: '#040C18' }}>
          <div className="w-5 text-[6px] font-mono text-[#1A2535]">#</div>
          <div className="w-24 text-[6px] font-mono text-[#2A3545] tracking-wider">DIRECTION</div>
          <div className="w-20 text-[6px] font-mono text-[#2A3545] tracking-wider">EDGE %</div>
          <div className="flex-1 text-[6px] font-mono text-[#2A3545] tracking-wider">QUESTION DU MARCHÉ / ANALYSE</div>
          <div className="w-24 text-right text-[6px] font-mono text-[#2A3545] tracking-wider hidden sm:block">PRIX → CIBLE</div>
          <div className="w-20 text-right text-[6px] font-mono text-[#2A3545] tracking-wider hidden sm:block">CONFIANCE</div>
          <div className="w-4" />
        </div>

        {/* Signal rows */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="flex flex-col items-center gap-3">
                <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#FF6D2A30', borderTopColor: '#FF6D2A' }} />
                <span className="text-[9px] font-mono text-[#2A3545] tracking-widest">SCAN DES MARCHÉS...</span>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <Target size={28} style={{ color: '#2A3545' }} />
              <span className="text-[10px] font-mono text-[#4E6070]">AUCUN SIGNAL DÉTECTÉ</span>
              <span className="text-[9px] font-mono text-[#2A3545] text-center max-w-xs leading-relaxed">
                Les signaux s'activent automatiquement quand l'IA détecte un décalage entre les événements réels et les marchés de prédiction.
              </span>
              <button
                onClick={fetchSignals}
                className="flex items-center gap-1.5 px-3 py-1.5 border text-[9px] font-mono tracking-wider"
                style={{ borderColor: '#152030', color: '#4E6070' }}
              >
                <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
                RAFRAÎCHIR
              </button>
            </div>
          ) : (
            filtered.map((signal, i) => (
              <SignalRow
                key={signal.id}
                signal={signal}
                selected={selectedSignal?.id === signal.id}
                onSelect={setSelectedSignal}
                rank={i + 1}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right: Detail panel ── */}
      {selectedSignal && (
        <div className="w-80 border-l shrink-0 hidden lg:flex flex-col" style={{ borderColor: '#152030' }}>
          <SignalDetail signal={selectedSignal} onClose={() => setSelectedSignal(null)} />
        </div>
      )}
    </div>
  );
}
