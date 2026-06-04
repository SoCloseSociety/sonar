import { useEffect } from 'react';
import { useMarketStore } from '@/stores/marketStore';

export function useMarkets() {
  const fetchMarkets = useMarketStore((s) => s.fetchMarkets);
  const markets = useMarketStore((s) => s.markets);
  const loading = useMarketStore((s) => s.loading);

  useEffect(() => {
    fetchMarkets();
    const interval = setInterval(fetchMarkets, 120_000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  return { markets, loading, fetchMarkets };
}
