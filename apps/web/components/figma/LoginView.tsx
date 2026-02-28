import { useState } from 'react'
import { AlertCircle, Eye, EyeOff, Lock, Mail } from 'lucide-react'

export type LoginViewProps = {
  onLogin: (payload: { email: string; password: string; mfa_token?: string }) => Promise<void>
  onDevLogin?: () => Promise<void>
}

export function LoginView({ onLogin, onDevLogin }: LoginViewProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaToken, setMfaToken] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (!email.trim() || !password) throw new Error('Please fill in all fields')
      if (!email.includes('@')) throw new Error('Please enter a valid email')
      await onLogin({
        email: email.trim(),
        password,
        mfa_token: mfaToken.trim() ? mfaToken.trim() : undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl" aria-hidden="true">
              🍸
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-gray-400">Sign in to your bartender account</p>
        </div>

        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white/10 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500/50 transition-colors"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-11 py-3 bg-white/10 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500/50 transition-colors"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">MFA Token (if enabled)</label>
              <input
                value={mfaToken}
                onChange={(e) => setMfaToken(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500/50 transition-colors"
                placeholder="123456"
                inputMode="numeric"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-all shadow-lg shadow-purple-500/30"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {process.env.NEXT_PUBLIC_ALLOW_DEV_TOKEN === 'true' && onDevLogin && (
            <div className="mt-6 pt-6 border-t border-white/10">
              <button
                type="button"
                onClick={async () => {
                  setError('')
                  setLoading(true)
                  try {
                    await onDevLogin()
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Dev login failed')
                  } finally {
                    setLoading(false)
                  }
                }}
                disabled={loading}
                className="w-full py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
              >
                Local Dev Login (Dev Token)
              </button>
              <p className="mt-2 text-xs text-gray-400">
                Enabled by `NEXT_PUBLIC_ALLOW_DEV_TOKEN=true` for local-only workflows.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
