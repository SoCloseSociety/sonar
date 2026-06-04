import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { isMetaMaskInstalled, connectWallet, signMessage } from '@/services/web3';
import api from '@/services/api';

export function WalletConnect() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const walletAuth = useAuthStore((s) => s.walletAuth);

  const handleConnect = async () => {
    if (!isMetaMaskInstalled()) {
      setError('MetaMask is not installed');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const address = await connectWallet();
      const { data: nonceData } = await api.get('/auth/nonce', {
        params: { wallet: address },
      });
      const signature = await signMessage(nonceData.message);
      await walletAuth(address, signature);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Wallet connection failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleConnect}
        disabled={loading}
        className="w-full bg-accent-purple/20 hover:bg-accent-purple/30 text-accent-purple border border-accent-purple/30 font-semibold rounded-lg py-2.5 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M18.5 3.5l-7.8 5.8L12.4 5l6.1-1.5zM1.5 3.5L9.2 9.4 7.6 5 1.5 3.5zM15.9 13.5l-2.2 3.3 4.7 1.3 1.3-4.6h-3.8zM0.3 13.5l1.3 4.6 4.7-1.3-2.2-3.3H0.3z" />
        </svg>
        {loading ? 'Connecting...' : 'Connect with MetaMask'}
      </button>
      {error && (
        <p className="text-accent-red text-xs mt-2 text-center">{error}</p>
      )}
    </div>
  );
}
