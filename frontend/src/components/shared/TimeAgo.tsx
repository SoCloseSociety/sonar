import { formatDistanceToNow } from 'date-fns';

export function TimeAgo({ date }: { date: string }) {
  try {
    const d = new Date(date);
    return (
      <span className="text-slate-500 text-xs font-mono" title={d.toLocaleString()}>
        {formatDistanceToNow(d, { addSuffix: true })}
      </span>
    );
  } catch {
    return <span className="text-slate-500 text-xs">--</span>;
  }
}
