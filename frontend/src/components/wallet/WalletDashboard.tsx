import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, ExternalLink, Copy, Check, TrendingUp, TrendingDown, XCircle,
  Clock, BarChart3, RefreshCw, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Link2, Target,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useTradingStore } from '@/stores/tradingStore';
import type { Order, Position } from '@/stores/tradingStore';
import { isMetaMaskInstalled, connectWallet, signMessage } from '@/services/web3';
import api from '@/services/api';
import { formatDistanceToNow } from 'date-fns';

// ── Stat Cell ──────────────────────────────────────────────────────
function StatCell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
      <div className="text-[7px] font-mono text-[#2A3545] tracking-[2px] mb-1">{label}</div>
      <div className="text-xl font-mono font-black tabular-nums" style={{ color: color || '#D0D9E8' }}>{value}</div>
      {sub && <div className="text-[7px] font-mono text-[#2A3545] mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Position Row ──────────────────────────────────────────────────
function PositionRow({ pos, onClose }: { pos: Position; onClose: () => void }) {
  const isYes   = pos.outcome === 'YES';
  const color   = isYes ? '#00E676' : '#FF3A3A';
  const pnl     = pos.unrealized_pnl ?? 0;
  const pnlPct  = pos.avg_price > 0 ? ((pnl / (pos.avg_price * pos.size)) * 100) : 0;
  const avgC    = (pos.avg_price * 100).toFixed(0);
  const curC    = pos.current_price != null ? (pos.current_price * 100).toFixed(0) : '—';
  const totalVal = (pos.current_price ?? pos.avg_price) * pos.size;

  return (
    <div className="border-b" style={{ borderColor: '#0D1826' }}>
      <div
        className="px-4 py-3 transition-colors"
        style={{ borderLeft: `3px solid ${color}` }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#060B16'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
      >
        {/* Row 1 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1 px-2 py-0.5"
              style={{ background: `${color}12`, border: `1px solid ${color}30` }}
            >
              {isYes ? <ArrowUpRight size={10} style={{ color }} /> : <ArrowDownRight size={10} style={{ color }} />}
              <span className="text-[8px] font-mono font-black tracking-[2px]" style={{ color }}>
                {pos.outcome}
              </span>
            </div>
            <span className="text-[8px] font-mono text-[#2A3545]">
              {pos.condition_id.slice(0, 12)}...
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-base font-mono font-black tabular-nums"
              style={{ color: pnl >= 0 ? '#00E676' : '#FF3A3A' }}
            >
              {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
            </span>
            <span className="text-[8px] font-mono" style={{ color: pnl >= 0 ? '#00E67680' : '#FF3A3A80' }}>
              ({pnl >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
            </span>
          </div>
        </div>

        {/* Row 2: metrics */}
        <div className="flex items-center gap-4">
          <div className="flex-1 grid grid-cols-4 gap-2">
            {[
              { l: 'SIZE', v: `${pos.size.toFixed(1)} shares` },
              { l: 'AVG PRICE', v: `${avgC}¢` },
              { l: 'CURRENT', v: `${curC}¢`, c: color },
              { l: 'VALUE', v: `$${totalVal.toFixed(2)}` },
            ].map(({ l, v, c }) => (
              <div key={l} className="border p-1.5" style={{ borderColor: '#0D1826', background: '#030711' }}>
                <div className="text-[6px] font-mono text-[#2A3545] tracking-[2px] mb-0.5">{l}</div>
                <div className="text-[9px] font-mono font-bold tabular-nums" style={{ color: c || '#94A3B8' }}>{v}</div>
              </div>
            ))}
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-2 py-1.5 border text-[7px] font-mono tracking-wider shrink-0 transition-all"
            style={{ borderColor: '#FF3A3A30', color: '#FF3A3A60' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#FF3A3A80'; (e.currentTarget as HTMLElement).style.color = '#FF3A3A'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#FF3A3A30'; (e.currentTarget as HTMLElement).style.color = '#FF3A3A60'; }}
            title="Close position"
          >
            <XCircle size={9} /> SELL
          </button>
        </div>

        {/* Price bar: avg → current */}
        {pos.current_price != null && (
          <div className="mt-2">
            <div className="flex justify-between text-[6px] font-mono text-[#2A3545] mb-1">
              <span>0¢</span>
              <span style={{ color: '#4E6070' }}>AVG {avgC}¢</span>
              <span style={{ color }}>NOW {curC}¢</span>
              <span>100¢</span>
            </div>
            <div className="h-[3px] bg-[#0D1826] rounded-full relative overflow-hidden">
              {/* Current price bar */}
              <div
                className="h-full rounded-full"
                style={{ width: `${pos.current_price * 100}%`, background: color, opacity: 0.6 }}
              />
              {/* Avg price line */}
              <div
                className="absolute top-0 h-full w-0.5"
                style={{ left: `${pos.avg_price * 100}%`, background: '#4E6070' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Order Row ────────────────────────────────────────────────────
function OrderRow({ order, onCancel }: { order: Order; onCancel: (id: number) => void }) {
  const isYes = order.outcome === 'YES';
  const dirColor = isYes ? '#00E676' : '#FF3A3A';
  const statusColor = order.status === 'filled'    ? '#00E676'
                    : order.status === 'pending'   ? '#FFA800'
                    : order.status === 'cancelled' ? '#4E6070'
                    : '#FF3A3A';
  const timeAgo = (() => {
    try { return formatDistanceToNow(new Date(order.created_at), { addSuffix: true }); }
    catch { return ''; }
  })();

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 border-b transition-colors"
      style={{ borderColor: '#0D1826' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#060B16'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
    >
      {/* Outcome badge */}
      <div
        className="flex items-center gap-1 px-1.5 py-0.5 shrink-0"
        style={{ background: `${dirColor}12`, border: `1px solid ${dirColor}30` }}
      >
        <span className="text-[7px] font-mono font-black" style={{ color: dirColor }}>{order.outcome}</span>
      </div>

      {/* Order info */}
      <div className="flex-1 min-w-0">
        <div className="text-[9px] font-mono text-[#94A3B8]">
          {order.side} @ <span className="font-bold tabular-nums">{(order.price * 100).toFixed(0)}¢</span>
          {' '}× <span className="tabular-nums">{order.size}</span>
        </div>
        <div className="text-[7px] font-mono text-[#2A3545] mt-0.5 flex items-center gap-1">
          <Clock size={6} /> {timeAgo}
          {order.tx_hash && (
            <a
              href={`https://polygonscan.com/tx/${order.tx_hash}`}
              target="_blank" rel="noopener noreferrer"
              className="ml-1 flex items-center gap-0.5 text-[#00CFEB] hover:underline"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink size={6} /> TX
            </a>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[8px] font-mono font-black tracking-wider" style={{ color: statusColor }}>
          {String(order.status || '').toUpperCase()}
        </span>
        {order.status === 'pending' && (
          <button
            onClick={() => onCancel(order.id)}
            className="p-1 text-[#2A3545] hover:text-[#FF3A3A] transition-colors"
            title="Cancel order"
          >
            <XCircle size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────
export function WalletDashboard() {
  const navigate   = useNavigate();
  const user       = useAuthStore((s) => s.user);
  const walletAuth = useAuthStore((s) => s.walletAuth);
  const orders     = useTradingStore((s) => s.orders);
  const positions  = useTradingStore((s) => s.positions);
  const cancelOrder = useTradingStore((s) => s.cancelOrder);
  const placeOrder  = useTradingStore((s) => s.placeOrder);
  const loading    = useTradingStore((s) => s.loading);

  const [connecting, setConnecting]  = useState(false);
  const [error, setError]            = useState('');
  const [copied, setCopied]          = useState(false);
  const [refreshing, setRefreshing]  = useState(false);
  const [activeTab, setActiveTab]    = useState<'positions' | 'orders'>('positions');

  const walletAddress = user?.wallet_address;
  const isConnected   = !!walletAddress;

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      useTradingStore.getState().fetchPositions(),
      useTradingStore.getState().fetchOrders(),
    ]);
    setRefreshing(false);
  };

  useEffect(() => {
    if (!isConnected) return;
    useTradingStore.getState().fetchPositions();
    useTradingStore.getState().fetchOrders();
    const iv = setInterval(() => {
      useTradingStore.getState().fetchPositions();
      useTradingStore.getState().fetchOrders();
    }, 30000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const handleConnect = async () => {
    if (!isMetaMaskInstalled()) {
      setError('MetaMask is not installed. Install it at metamask.io');
      return;
    }
    setError('');
    setConnecting(true);
    try {
      const address = await connectWallet();
      const { data: nonceData } = await api.get('/auth/nonce', { params: { wallet: address } });
      const signature = await signMessage(nonceData.message);
      await walletAuth(address, signature);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const copyAddress = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncate = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`;

  const portfolio = useMemo(() => {
    const totalValue   = positions.reduce((s, p) => s + (p.current_price ?? p.avg_price) * p.size, 0);
    const totalPnl     = positions.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0);
    const pnlPct       = totalValue > 0 ? ((totalPnl / totalValue) * 100) : 0;
    const winners      = positions.filter(p => (p.unrealized_pnl ?? 0) > 0).length;
    const filledOrders = orders.filter(o => o.status === 'filled').length;
    const pendingOrders = orders.filter(o => o.status === 'pending').length;
    const totalBet     = orders.filter(o => o.status === 'filled').reduce((s, o) => s + o.price * o.size, 0);
    return { totalValue, totalPnl, pnlPct, winners, filledOrders, pendingOrders, totalBet };
  }, [positions, orders]);

  // ── Not connected ──
  if (!isConnected) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center p-8"
        style={{ background: '#030711' }}
      >
        <div className="w-full max-w-md space-y-4">
          {/* Header */}
          <div className="text-center mb-6">
            <div
              className="inline-flex items-center justify-center w-16 h-16 border mb-4"
              style={{ borderColor: '#152030', background: '#060B16' }}
            >
              <Wallet size={28} style={{ color: '#FF6D2A' }} />
            </div>
            <h2 className="text-[13px] font-mono font-black tracking-[4px] text-[#D0D9E8] mb-2">
              CONNECT WALLET
            </h2>
            <p className="text-[10px] font-mono text-[#4E6070] leading-relaxed">
              Connect your Ethereum wallet to track your Polymarket positions, manage orders, and view portfolio performance.
            </p>
          </div>

          {/* Connect button */}
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full flex items-center justify-center gap-3 py-3.5 border transition-all font-mono text-[11px] font-black tracking-[3px]"
            style={{
              borderColor: '#FF6D2A40',
              background: 'rgba(255,109,42,0.08)',
              color: connecting ? '#FF6D2A80' : '#FF6D2A',
            }}
            onMouseEnter={e => { if (!connecting) (e.currentTarget as HTMLElement).style.background = 'rgba(255,109,42,0.15)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,109,42,0.08)'; }}
          >
            {/* MetaMask fox SVG inline */}
            <svg width="20" height="20" viewBox="0 0 35.4 33.2" className="shrink-0">
              <path d="M33.6 0L19.9 10.2l2.5-6L33.6 0z" fill="#E17726" />
              <path d="M1.8 0l13.5 10.3-2.4-6L1.8 0zM28.7 24l-3.6 5.5 7.8 2.1 2.2-7.5h-6.4zM0.3 24.1l2.2 7.5 7.7-2.1-3.6-5.5H0.3z" fill="#E27625" />
              <path d="M9.8 14.6l-2.2 3.3 7.8.3-.3-8.3-5.3 4.7zM25.6 14.6l-5.4-4.8-.2 8.4 7.8-.3-2.2-3.3z" fill="#E27625" />
              <path d="M10.2 29.5l4.7-2.3-4-3.2-.7 5.5zM20.5 27.2l4.7 2.3-.7-5.5-4 3.2z" fill="#E27625" />
            </svg>
            {connecting ? 'CONNECTING...' : 'CONNECT METAMASK'}
          </button>

          {error && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 border"
              style={{ background: 'rgba(255,58,58,0.08)', borderColor: 'rgba(255,58,58,0.3)' }}
            >
              <AlertTriangle size={12} style={{ color: '#FF3A3A' }} className="shrink-0 mt-0.5" />
              <p className="text-[9px] font-mono text-[#FF3A3A]">{error}</p>
            </div>
          )}

          <div className="border-t pt-4" style={{ borderColor: '#0D1826' }}>
            <p className="text-[8px] font-mono text-[#2A3545] text-center leading-relaxed">
              Supports MetaMask and EIP-1193 compatible wallets. Your signature is used for authentication only — no funds are accessed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Connected ──
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#030711' }}>

      {/* ── Header ── */}
      <div
        className="px-4 pt-3 pb-2 border-b shrink-0"
        style={{ borderColor: '#152030', background: '#060B16' }}
      >
        {/* Title + refresh */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wallet size={14} style={{ color: '#FF6D2A' }} />
            <span className="text-[11px] font-mono font-black tracking-[3px] text-[#D0D9E8]">PORTFOLIO</span>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-[#00E676] rounded-full animate-pulse" />
              <span className="text-[7px] font-mono text-[#00E676]">CONNECTED</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/markets')}
              className="flex items-center gap-1 px-2 py-1 border text-[8px] font-mono tracking-wider transition-all"
              style={{ borderColor: '#00E67630', color: '#00E676', background: 'rgba(0,230,118,0.06)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,230,118,0.12)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,230,118,0.06)'; }}
            >
              <Target size={9} /> NEW BET
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="flex items-center gap-1 px-2 py-1 border text-[8px] font-mono tracking-widest transition-all"
              style={{ borderColor: '#152030', color: '#4E6070' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#D0D9E8'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#4E6070'; }}
            >
              <RefreshCw size={9} className={refreshing ? 'animate-spin' : ''} />
              REFRESH
            </button>
          </div>
        </div>

        {/* Wallet address */}
        <div
          className="flex items-center gap-3 px-3 py-2 border mb-3"
          style={{ borderColor: '#152030', background: '#030711' }}
        >
          <div
            className="w-8 h-8 flex items-center justify-center border shrink-0"
            style={{ borderColor: '#152030', background: '#060B16' }}
          >
            <Wallet size={14} style={{ color: '#FF6D2A' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-mono font-bold text-[#D0D9E8] tracking-wider">
              {truncate(walletAddress)}
            </div>
            <div className="text-[7px] font-mono text-[#2A3545] mt-0.5">
              {user?.username || 'Anonymous'} · Ethereum Mainnet
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={copyAddress} className="p-1.5 text-[#4E6070] hover:text-[#D0D9E8] transition-colors" title="Copy address">
              {copied ? <Check size={12} style={{ color: '#00E676' }} /> : <Copy size={12} />}
            </button>
            <a href={`https://etherscan.io/address/${walletAddress}`} target="_blank" rel="noopener noreferrer"
              className="p-1.5 text-[#4E6070] hover:text-[#00CFEB] transition-colors" title="View on Etherscan">
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* Stats strip */}
        <div
          className="grid grid-cols-4 divide-x divide-[#0D1826]"
          style={{ border: '1px solid #0D1826', background: '#030711' }}
        >
          <StatCell
            label="PORTFOLIO VALUE"
            value={`$${portfolio.totalValue.toFixed(2)}`}
            sub={`${positions.length} positions`}
            color="#D0D9E8"
          />
          <StatCell
            label="UNREALIZED P&L"
            value={`${portfolio.totalPnl >= 0 ? '+' : ''}$${portfolio.totalPnl.toFixed(2)}`}
            sub={`${portfolio.pnlPct >= 0 ? '+' : ''}${portfolio.pnlPct.toFixed(1)}%`}
            color={portfolio.totalPnl >= 0 ? '#00E676' : '#FF3A3A'}
          />
          <StatCell
            label="FILLED ORDERS"
            value={String(portfolio.filledOrders)}
            sub={`${portfolio.pendingOrders} pending`}
            color="#D0D9E8"
          />
          <StatCell
            label="TOTAL BET"
            value={`$${portfolio.totalBet.toFixed(2)}`}
            sub="total deployed"
            color="#FF6D2A"
          />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div
        className="flex items-center gap-0 border-b shrink-0"
        style={{ borderColor: '#152030', background: '#060B16' }}
      >
        {[
          { key: 'positions' as const, label: 'POSITIONS', count: positions.length, Icon: BarChart3 },
          { key: 'orders' as const, label: 'ORDER HISTORY', count: orders.length, Icon: Clock },
        ].map(({ key, label, count, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="flex items-center gap-1.5 px-4 py-2.5 border-b-2 text-[9px] font-mono font-bold tracking-[2px] transition-all"
            style={activeTab === key
              ? { borderColor: '#FF6D2A', color: '#FF6D2A', background: 'rgba(255,109,42,0.06)' }
              : { borderColor: 'transparent', color: '#4E6070' }
            }
          >
            <Icon size={10} />
            {label}
            <span className="ml-1 opacity-60">{count}</span>
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">

        {/* POSITIONS */}
        {activeTab === 'positions' && (
          positions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-4">
              <BarChart3 size={28} style={{ color: '#152030' }} />
              <div className="text-center">
                <div className="text-[10px] font-mono text-[#4E6070] mb-1">NO OPEN POSITIONS</div>
                <div className="text-[9px] font-mono text-[#2A3545]">
                  Place your first bet on the markets page
                </div>
              </div>
              <button
                onClick={() => navigate('/markets')}
                className="flex items-center gap-2 px-4 py-2 border text-[9px] font-mono tracking-wider transition-all"
                style={{ borderColor: '#00E67640', color: '#00E676', background: 'rgba(0,230,118,0.06)' }}
              >
                <Target size={10} /> BROWSE MARKETS
              </button>
            </div>
          ) : (
            <>
              {/* Winner/loser summary bar */}
              <div
                className="flex items-center justify-between px-4 py-2 border-b"
                style={{ borderColor: '#0D1826', background: '#040C18' }}
              >
                <span className="text-[7px] font-mono text-[#2A3545]">
                  <span className="text-[#00E676]">{portfolio.winners}</span> winning ·
                  <span className="text-[#FF3A3A] ml-1">{positions.length - portfolio.winners}</span> losing
                </span>
                <span className="text-[7px] font-mono text-[#2A3545] tracking-wider">SORTED BY P&L ↓</span>
              </div>
              {[...positions]
                .sort((a, b) => (b.unrealized_pnl ?? 0) - (a.unrealized_pnl ?? 0))
                .map(pos => (
                  <PositionRow
                    key={pos.id}
                    pos={pos}
                    onClose={async () => {
                      try {
                        await placeOrder({
                          condition_id: pos.condition_id,
                          side: 'SELL',
                          outcome: pos.outcome,
                          price: pos.current_price || pos.avg_price,
                          size: pos.size,
                        });
                      } catch { /* handled in store */ }
                    }}
                  />
                ))
              }
            </>
          )
        )}

        {/* ORDER HISTORY */}
        {activeTab === 'orders' && (
          orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Clock size={28} style={{ color: '#152030' }} />
              <div className="text-[10px] font-mono text-[#4E6070]">NO ORDER HISTORY</div>
            </div>
          ) : (
            <>
              {/* Order status summary */}
              <div
                className="flex items-center gap-4 px-4 py-2 border-b"
                style={{ borderColor: '#0D1826', background: '#040C18' }}
              >
                {[
                  { label: 'FILLED', count: orders.filter(o => o.status === 'filled').length, color: '#00E676' },
                  { label: 'PENDING', count: orders.filter(o => o.status === 'pending').length, color: '#FFA800' },
                  { label: 'CANCELLED', count: orders.filter(o => o.status === 'cancelled').length, color: '#4E6070' },
                  { label: 'FAILED', count: orders.filter(o => o.status === 'failed').length, color: '#FF3A3A' },
                ].map(({ label, count, color }) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    <span className="text-[7px] font-mono" style={{ color }}>
                      {count} {label}
                    </span>
                  </div>
                ))}
              </div>
              {orders.slice(0, 50).map(order => (
                <OrderRow key={order.id} order={order} onCancel={cancelOrder} />
              ))}
            </>
          )
        )}
      </div>

      {/* ── Footer quick links ── */}
      <div
        className="px-4 py-2 border-t shrink-0 flex items-center gap-3"
        style={{ borderColor: '#152030', background: '#060B16' }}
      >
        <span className="text-[7px] font-mono text-[#2A3545] tracking-widest flex items-center gap-1">
          <Link2 size={7} /> QUICK LINKS
        </span>
        {[
          { label: 'POLYMARKET', url: 'https://polymarket.com' },
          { label: 'ETHERSCAN', url: `https://etherscan.io/address/${walletAddress}` },
          { label: 'POLYGONSCAN', url: `https://polygonscan.com/address/${walletAddress}` },
        ].map(({ label, url }) => (
          <a
            key={label}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[7px] font-mono tracking-wider transition-colors"
            style={{ color: '#2A3545' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#00CFEB'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#2A3545'; }}
          >
            <ExternalLink size={7} /> {label}
          </a>
        ))}
        <div className="flex-1" />
        <span className="text-[7px] font-mono text-[#2A3545]">
          {positions.length} positions · {orders.length} orders
        </span>
      </div>
    </div>
  );
}
