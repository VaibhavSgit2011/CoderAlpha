"use client";

import { useState } from 'react';
import { signIn, signUp, signInWithGoogle, signInWithApple } from '@/lib/firebase';
import { Loader2, KeyRound, Mail, Rocket, AlertTriangle } from 'lucide-react';

export default function AuthPortal() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all credentials.');
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        await signUp(email, password);
        // Dispatch custom bypass triggers or save display name locally if needed
        alert('Welcome! Your AlphaTrade account is successfully created.');
      }
    } catch (err: any) {
      console.error('Authentication failed:', err);
      // Map user friendly error codes
      let msg = err.message || 'An unexpected authentication error occurred.';
      if (err.code === 'auth/invalid-credential') {
        msg = 'Invalid email or password combination.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'This email address is already registered.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password must be at least 6 characters long.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    setError(null);
    setLoading(true);
    try {
      if (provider === 'google') {
        await signInWithGoogle();
      } else {
        await signInWithApple();
      }
    } catch (err: any) {
      console.error(`${provider} login failed:`, err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || `Failed to sign in with ${provider}.`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-[#090d16] select-none relative overflow-hidden font-sans p-4">
      {/* Premium background radial highlights */}
      <div className="absolute -top-40 -left-40 h-[380px] w-[380px] rounded-full bg-accent-cyan/10 blur-[130px] animate-pulse" />
      <div className="absolute -bottom-40 -right-40 h-[380px] w-[380px] rounded-full bg-accent-green/10 blur-[130px] animate-pulse" />

      {/* Core Auth Panel */}
      <div className="w-full max-w-md bg-[#131b2c]/60 border border-[#242f48]/70 backdrop-blur-xl rounded-3xl p-8 shadow-2xl relative z-10 animate-slideUp">
        
        {/* Header Branding */}
        <div className="flex flex-col items-center justify-center text-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center bg-gradient-to-tr from-[#00f0ff] to-[#00ffaa] rounded-2xl filter drop-shadow-[0_0_8px_rgba(0,240,255,0.45)] mb-4">
            <svg className="w-7 h-7 fill-[#0d1321]" viewBox="0 0 100 100">
              <path d="M40 85 L20 85 L50 20 L65 50 Z" />
              <path d="M50 20 L80 85 L65 85 L58 70 Z" fill="#0d1321" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white tracking-wide uppercase">
            AlphaTrade<span className="text-accent-green font-black">.AI</span>
          </h1>
          <p className="text-xs text-[#5b6e92] font-semibold uppercase tracking-widest mt-1">
            Global Market Intelligence Terminal
          </p>
        </div>

        {/* Tab switchers */}
        <div className="grid grid-cols-2 bg-[#090d16]/50 p-1 rounded-xl border border-[#242f48]/40 mb-6">
          <button
            onClick={() => { setIsLogin(true); setError(null); }}
            className={`py-2 rounded-lg text-xs font-black tracking-wider uppercase transition-all duration-200 cursor-pointer ${
              isLogin 
                ? 'bg-[#242f48] text-white glow-cyan-box' 
                : 'text-[#8a98b5] hover:text-white'
            }`}
          >
            Log In
          </button>
          <button
            onClick={() => { setIsLogin(false); setError(null); }}
            className={`py-2 rounded-lg text-xs font-black tracking-wider uppercase transition-all duration-200 cursor-pointer ${
              !isLogin 
                ? 'bg-[#242f48] text-white glow-green-box' 
                : 'text-[#8a98b5] hover:text-white'
            }`}
          >
            Register
          </button>
        </div>

        {/* Custom Alerts */}
        {error && (
          <div className="mb-5 flex items-start space-x-2 bg-accent-red/10 border border-accent-red/30 p-3.5 rounded-xl text-accent-red animate-fadeIn text-xs leading-relaxed font-semibold">
            <AlertTriangle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Auth form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] text-[#5b6e92] font-black uppercase tracking-wider pl-1">
                Full Name
              </label>
              <input
                type="text"
                placeholder="Enter your name..."
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="px-3.5 py-2.5 bg-[#090d16]/50 border border-[#242f48]/70 rounded-xl text-sm text-white focus:outline-none focus:border-accent-cyan/80 focus:ring-1 focus:ring-accent-cyan/20 transition-all font-semibold"
              />
            </div>
          )}

          <div className="flex flex-col space-y-1">
            <label className="text-[10px] text-[#5b6e92] font-black uppercase tracking-wider pl-1 flex items-center space-x-1.5">
              <Mail className="h-3 w-3" />
              <span>Email Address</span>
            </label>
            <input
              type="email"
              required
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-3.5 py-2.5 bg-[#090d16]/50 border border-[#242f48]/70 rounded-xl text-sm text-white focus:outline-none focus:border-accent-cyan/80 focus:ring-1 focus:ring-accent-cyan/20 transition-all font-semibold"
            />
          </div>

          <div className="flex flex-col space-y-1">
            <label className="text-[10px] text-[#5b6e92] font-black uppercase tracking-wider pl-1 flex items-center space-x-1.5">
              <KeyRound className="h-3 w-3" />
              <span>Password</span>
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="px-3.5 py-2.5 bg-[#090d16]/50 border border-[#242f48]/70 rounded-xl text-sm text-white focus:outline-none focus:border-accent-cyan/80 focus:ring-1 focus:ring-accent-cyan/20 transition-all font-semibold"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full bg-gradient-to-r ${isLogin ? 'from-[#00f0ff] to-[#00ffaa]' : 'from-[#00ffaa] to-[#00f0ff]'} hover:opacity-90 text-[#090d16] font-black text-xs tracking-wider py-3 rounded-xl transition-all duration-200 glow-cyan-box flex items-center justify-center space-x-2 select-none uppercase cursor-pointer disabled:opacity-50`}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Authenticating Session...</span>
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4 stroke-[2.5]" />
                <span>{isLogin ? 'Establish Connection' : 'Generate Account'}</span>
              </>
            )}
          </button>
        </form>

        {/* Divider separator */}
        <div className="relative flex items-center justify-center my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#242f48]/55" />
          </div>
          <span className="relative px-3 bg-[#131b2c] text-[10px] text-[#5b6e92] font-extrabold tracking-widest uppercase">
            OR CONNECT VIA
          </span>
        </div>

        {/* Social logins */}
        <div className="grid grid-cols-2 gap-3.5">
          {/* Google Button */}
          <button
            onClick={() => handleSocialLogin('google')}
            disabled={loading}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-[#090d16]/40 hover:bg-[#1a2336]/40 border border-[#242f48]/80 hover:border-white/30 rounded-xl transition-all cursor-pointer select-none"
          >
            {/* Inline premium Google logo SVG */}
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5.04c1.62 0 3.08.56 4.22 1.64l3.15-3.15C17.45 1.74 14.9 1 12 1 7.35 1 3.39 3.65 1.5 7.5l3.86 3C6.26 7.55 8.91 5.04 12 5.04z"
              />
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46c-.29 1.48-1.14 2.73-2.42 3.57l3.77 2.92c2.2-2.03 3.68-5.02 3.68-8.64z"
              />
              <path
                fill="#FBBC05"
                d="M5.36 14.5c-.24-.72-.38-1.49-.38-2.3c0-.81.14-1.59.38-2.3L1.5 6.9C.54 8.82 0 10.97 0 13.2c0 2.23.54 4.38 1.5 6.3l3.86-3z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.77-2.92c-1.05.7-2.39 1.13-4.19 1.13-3.09 0-5.74-2.51-6.64-5.46L1.5 15.8C3.39 19.65 7.35 22.3 12 23z"
              />
            </svg>
            <span className="text-xs font-black text-white tracking-wider">GOOGLE</span>
          </button>

          {/* Apple Button */}
          <button
            onClick={() => handleSocialLogin('apple')}
            disabled={loading}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-[#090d16]/40 hover:bg-[#1a2336]/40 border border-[#242f48]/80 hover:border-white/30 rounded-xl transition-all cursor-pointer select-none"
          >
            {/* Inline Apple logo SVG */}
            <svg className="h-4.5 w-4.5 fill-white" viewBox="0 0 24 24">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.51-.64.73-1.2 1.87-1.05 2.97 1.12.09 2.27-.53 3-1.42" />
            </svg>
            <span className="text-xs font-black text-white tracking-wider">APPLE</span>
          </button>
        </div>

      </div>
    </div>
  );
}
