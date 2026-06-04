import { NavLink } from 'react-router-dom';
import {
  Globe2, BarChart3, Target, Plane, Ship,
  Settings, LogOut, LayoutDashboard, FileText,
  Tv, Brain,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

const SECTIONS = [
  {
    label: 'COMMAND',
    items: [
      { to: '/',          icon: Globe2,          label: 'GLOBE',      fkey: 'F1', end: true },
      { to: '/dashboard', icon: LayoutDashboard, label: 'DASHBOARD',  fkey: 'F2' },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { to: '/intel',   icon: FileText, label: 'INTEL',      fkey: 'F3' },
      { to: '/signals',  icon: Target,   label: 'SIGNALS',    fkey: 'F4' },
      { to: '/analysis', icon: Brain,    label: 'ANALYSIS',   fkey: 'F5' },
      { to: '/news',    icon: Tv,       label: 'MEDIA',      fkey: 'F6' },
    ],
  },
  {
    label: 'TRACKING',
    items: [
      { to: '/flights', icon: Plane,     label: 'AIRCRAFT', fkey: 'F6' },
      { to: '/vessels', icon: Ship,      label: 'VESSELS',  fkey: 'F7' },
      { to: '/markets', icon: BarChart3, label: 'MARKETS',  fkey: 'F8' },
    ],
  },
];

export function Sidebar() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <aside className="w-[52px] lg:w-[188px] bg-[#060B16] border-r border-[#152030] flex flex-col shrink-0 select-none">

      {/* ── Logo ── */}
      <div className="h-9 flex items-center border-b border-[#152030] shrink-0 overflow-hidden">
        <div className="w-[52px] flex items-center justify-center shrink-0">
          {/* Square SONAR badge */}
          <div className="w-[24px] h-[24px] bg-[#FF6D2A] flex items-center justify-center">
            <span className="text-[8px] font-black text-black tracking-tight leading-none">SN</span>
          </div>
        </div>
        <div className="hidden lg:flex flex-col justify-center flex-1 pr-3 min-w-0 gap-[1px]">
          <span className="font-black text-[#D0D9E8] text-[11px] tracking-[4px] leading-none">SONAR</span>
          <span className="text-[7px] text-[#2A3545] tracking-[2px] leading-none">TERMINAL v2.4</span>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-1">
        {SECTIONS.map((section, si) => (
          <div key={section.label} className={si > 0 ? 'mt-0.5 border-t border-[#0D1826]' : ''}>
            {/* Section header */}
            <div className="hidden lg:block px-3 pt-2 pb-0.5">
              <span className="text-[7px] font-bold text-[#2A3545] tracking-[3px]">
                {section.label}
              </span>
            </div>

            {/* Nav items */}
            {section.items.map(({ to, icon: Icon, label, fkey, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center transition-all duration-100 border-l-[2px] ${
                    isActive
                      ? 'border-[#FF6D2A] bg-[rgba(255,109,42,0.09)] text-[#FF6D2A]'
                      : 'border-transparent text-[#4E6070] hover:text-[#D0D9E8] hover:bg-[#0A1020] hover:border-[#1E3050]'
                  }`
                }
              >
                {/* Icon zone */}
                <div className="w-[50px] h-[30px] flex items-center justify-center shrink-0">
                  <Icon size={13} className="shrink-0" />
                </div>
                {/* Label + F-key */}
                <div className="hidden lg:flex items-center justify-between flex-1 pr-3 min-w-0">
                  <span className="text-[9px] tracking-[0.5px] truncate">{label}</span>
                  <span className="text-[7px] text-[#2A3545] tabular-nums ml-1 shrink-0">{fkey}</span>
                </div>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* ── System footer ── */}
      <div className="border-t border-[#152030] shrink-0">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center transition-all border-l-[2px] ${
              isActive
                ? 'border-[#FF6D2A] bg-[rgba(255,109,42,0.09)] text-[#FF6D2A]'
                : 'border-transparent text-[#4E6070] hover:text-[#D0D9E8] hover:bg-[#0A1020]'
            }`
          }
        >
          <div className="w-[50px] h-[30px] flex items-center justify-center shrink-0">
            <Settings size={13} />
          </div>
          <span className="hidden lg:block text-[9px] tracking-wider">SETTINGS</span>
        </NavLink>

        <button
          onClick={logout}
          className="flex items-center w-full border-l-[2px] border-transparent text-[#4E6070] hover:text-[#FF3A3A] hover:bg-[rgba(255,58,58,0.04)] transition-all"
        >
          <div className="w-[50px] h-[30px] flex items-center justify-center shrink-0">
            <LogOut size={13} />
          </div>
          <span className="hidden lg:block text-[9px] tracking-wider">LOGOUT</span>
        </button>

        {/* Session ID */}
        <div className="hidden lg:flex items-center px-3 py-1.5 border-t border-[#0D1826]">
          <div className="w-1.5 h-1.5 bg-[#00E676] mr-2 shrink-0 animate-pulse" />
          <span className="text-[7px] text-[#2A3545] tracking-wider">CONNECTED</span>
        </div>
      </div>
    </aside>
  );
}
