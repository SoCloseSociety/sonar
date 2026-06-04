import { clsx } from 'clsx';

const variants: Record<string, string> = {
  green: 'bg-accent-green/20 text-accent-green border-accent-green/30',
  red: 'bg-accent-red/20 text-accent-red border-accent-red/30',
  amber: 'bg-accent-amber/20 text-accent-amber border-accent-amber/30',
  blue: 'bg-accent-blue/20 text-accent-blue border-accent-blue/30',
  purple: 'bg-accent-purple/20 text-accent-purple border-accent-purple/30',
  gray: 'bg-slate-700/30 text-slate-400 border-slate-600/30',
};

export function Badge({
  children,
  variant = 'gray',
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border',
        variants[variant] || variants.gray,
        className
      )}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: number }) {
  const variant = severity >= 8 ? 'red' : severity >= 6 ? 'amber' : severity >= 4 ? 'blue' : 'green';
  const label = severity >= 8 ? 'CRITICAL' : severity >= 6 ? 'HIGH' : severity >= 4 ? 'MEDIUM' : 'LOW';
  return <Badge variant={variant}>{label}</Badge>;
}
