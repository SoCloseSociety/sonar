import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const register = useAuthStore((s) => s.register);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(email, username, password);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Registration failed';
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
          <p className="text-slate-400 font-mono text-sm">Create Account</p>
        </div>

        <div className="sonar-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-sonar-bg border border-sonar-border rounded-lg px-4 py-2.5 text-white focus:border-accent-green focus:outline-none transition"
                minLength={3}
                required
              />
            </div>
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
                minLength={8}
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
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-4">
            Already have an account?{' '}
            <Link to="/login" className="text-accent-green hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
