import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { WalletConnect } from './WalletConnect';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sonar-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-accent-green/20 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-accent-green animate-pulse" />
            </div>
            <h1 className="text-3xl font-mono font-bold text-white">SONAR</h1>
          </div>
          <p className="text-slate-400 font-mono text-sm">Intelligence Terminal</p>
        </div>

        <div className="sonar-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-sonar-bg border border-sonar-border rounded-lg px-4 py-2.5 text-white focus:border-accent-green focus:outline-none transition"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-sonar-bg border border-sonar-border rounded-lg px-4 py-2.5 text-white focus:border-accent-green focus:outline-none transition"
                required
              />
            </div>

            {error && (
              <div className="text-accent-red text-sm bg-accent-red/10 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent-green hover:bg-accent-green/90 text-sonar-bg font-semibold rounded-lg py-2.5 transition disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-sonar-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-sonar-surface px-3 text-sm text-slate-500">or</span>
            </div>
          </div>

          <WalletConnect />

          <p className="text-center text-sm text-slate-500 mt-4">
            No account?{' '}
            <Link to="/register" className="text-accent-green hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
