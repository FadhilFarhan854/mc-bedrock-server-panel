'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Server, Lock, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Login failed');
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-14 h-14 bg-green-500/20 rounded-2xl flex items-center justify-center border border-green-500/30">
            <Server className="w-7 h-7 text-green-400" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-white">Bedrock Panel</h1>
            <p className="text-sm text-slate-500 mt-0.5">Sign in to manage your server</p>
          </div>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-panel-card border border-panel-border rounded-2xl p-6 space-y-4"
        >
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter panel password"
                autoFocus
                required
                className="w-full bg-panel-bg border border-panel-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 transition-colors"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in…
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-4">
          Set <code className="font-mono text-slate-500">PANEL_PASSWORD</code> in{' '}
          <code className="font-mono text-slate-500">.env.local</code>
        </p>
      </div>
    </div>
  );
}
