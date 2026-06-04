import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import api from '@/services/api';
import type { MarketSnapshot } from '@/types/market';

export function PriceChart({ marketId }: { marketId: number }) {
  const [data, setData] = useState<MarketSnapshot[]>([]);

  useEffect(() => {
    api.get(`/markets/${marketId}/snapshots`, { params: { limit: 50 } })
      .then(({ data }) => setData(data.reverse()))
      .catch(() => {});
  }, [marketId]);

  if (data.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center text-slate-500 text-xs">
        Not enough data for chart
      </div>
    );
  }

  const chartData = data.map((s) => ({
    time: new Date(s.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    yes: s.price_yes ? +(s.price_yes * 100).toFixed(1) : null,
  }));

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={{ stroke: '#1e293b' }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={{ stroke: '#1e293b' }}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#111827',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelStyle={{ color: '#94a3b8' }}
          />
          <Line
            type="monotone"
            dataKey="yes"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
