"use client";

import { useEffect, useState } from 'react';
import { ChevronDown, LogOut, Loader2, X, ShieldAlert, Key } from 'lucide-react';
import { auth, logOut, signIn, signUp } from '@/lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';

export default function UserMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [mockUserActive, setMockUserActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  
  // Interactive Login modal states
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [emailInput, setEmailInput] = useState('dev@alphatrade.ai');
  const [passwordInput, setPasswordInput] = useState('password123');
  const [isSignUpMode, setIsSignUpMode] = useState(false);

  // Sync real Firebase Auth and Mock Dev Auth Bypass
  const checkConnection = () => {
    const isMock = typeof window !== 'undefined' && localStorage.getItem('alphatrade_mock_auth') === 'true';
    setMockUserActive(isMock);
  };

  useEffect(() => {
    window.addEventListener('alphatrade_auth_change', checkConnection);
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      checkConnection();
      setLoading(false);
    });

    checkConnection();

    return () => {
      window.removeEventListener('alphatrade_auth_change', checkConnection);
      unsubscribe();
    };
  }, []);

  // Main Authentication flow (supports both sign-in and sign-up with bypass fallbacks)
  const handleConnect = async (email = emailInput, password = passwordInput) => {
    setConnecting(true);
    try {
      if (isSignUpMode) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      localStorage.removeItem('alphatrade_mock_auth');
      window.dispatchEvent(new Event('alphatrade_auth_change'));
      setShowLoginModal(false);
      alert(`Connected successfully as ${email}!`);
    } catch (err: any) {
      if (err.code === 'auth/configuration-not-found') {
        // Switch to Dev Auth Bypass Mode if Email/Password auth is disabled in the console
        localStorage.setItem('alphatrade_mock_auth', 'true');
        window.dispatchEvent(new Event('alphatrade_auth_change'));
        setShowLoginModal(false);
        alert('Firebase Email/Password Auth is disabled in the Firebase Console.\n\nSwitched to Dev Auth Bypass Mode. Connected successfully!');
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        if (!isSignUpMode) {
          // Auto sign up/provision account if user not found in login mode
          try {
            await signUp(email, password);
            localStorage.removeItem('alphatrade_mock_auth');
            window.dispatchEvent(new Event('alphatrade_auth_change'));
            setShowLoginModal(false);
            alert('Backend Account provisioned and connected successfully!');
            return;
          } catch (signUpErr: any) {
            if (signUpErr.code === 'auth/configuration-not-found') {
              localStorage.setItem('alphatrade_mock_auth', 'true');
              window.dispatchEvent(new Event('alphatrade_auth_change'));
              setShowLoginModal(false);
              alert('Firebase Email/Password Auth is disabled in the Firebase Console.\n\nSwitched to Dev Auth Bypass Mode. Connected successfully!');
              return;
            }
          }
        }
        console.error('Auth failed:', err);
        alert(`Authentication error: ${err.message}`);
      } else {
        console.error('Sign in failed:', err);
        alert(`Connection error: ${err.message}`);
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('alphatrade_mock_auth');
      window.dispatchEvent(new Event('alphatrade_auth_change'));
      await logOut();
      setUser(null);
      setMockUserActive(false);
      setShowDropdown(false);
      alert('Signed out successfully.');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex h-8 w-8 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-accent-cyan" />
      </div>
    );
  }

  const isLoggedIn = user !== null || mockUserActive;
  const emailDisplay = user?.email || (mockUserActive ? 'dev@alphatrade.ai (Dev Bypass)' : 'guest@alphatrade.ai');
  const nameDisplay = user?.displayName || emailDisplay.split('@')[0];

  return (
    <div className="flex items-center space-x-3 select-none relative z-50">
      
      {/* CASE 1: Not Logged In -> Show glassmorphic CONNECT IDENTITY trigger */}
      {!isLoggedIn ? (
        <button
          onClick={() => setShowLoginModal(true)}
          className="px-4 py-2 bg-gradient-to-tr from-[#00ffaa] to-[#00f0ff] hover:from-[#00ffaa]/90 hover:to-[#00f0ff]/90 text-[#090d16] text-xs font-black tracking-wider rounded-xl transition-all duration-200 glow-green-box cursor-pointer select-none flex items-center space-x-1.5 uppercase font-sans border border-transparent"
        >
          <Key className="h-3.5 w-3.5" />
          <span>Connect Identity</span>
        </button>
      ) : (
        /* CASE 2: Logged In -> Show user avatar & dropdown trigger */
        <div 
          onClick={() => setShowDropdown(prev => !prev)}
          className="flex items-center space-x-2.5 p-1 px-2.5 bg-[#131b2c]/65 border border-[#242f48]/70 hover:border-accent-cyan/40 hover:bg-[#1a2336]/30 rounded-xl cursor-pointer transition-all duration-200"
        >
          <img 
            src={user?.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop&crop=face"} 
            alt="User profile" 
            className="h-6.5 w-6.5 rounded-lg object-cover border border-[#242f48]"
          />
          <span className="text-xs font-extrabold text-white uppercase tracking-wider hidden md:inline">
            {nameDisplay}
          </span>
          <ChevronDown className="h-3 w-3 text-[#8a98b5] hidden md:inline transition-transform duration-200" />
        </div>
      )}

      {/* Disconnect/Sign-out Dropdown overlay */}
      {showDropdown && isLoggedIn && (
        <div className="absolute right-0 top-11 bg-[#131b2c]/95 border border-[#242f48] rounded-xl p-2 w-52 shadow-2xl z-50 animate-fadeIn backdrop-blur-xl">
          <div className="px-3 py-2.5 border-b border-[#242f48]/40 mb-1">
            <div className="text-[9px] text-[#5b6e92] font-black uppercase tracking-widest">Active Account</div>
            <div className="text-[11px] text-white font-extrabold truncate mt-0.5">{emailDisplay}</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-2 px-3 py-2 text-xs font-black text-accent-red hover:bg-accent-red/10 rounded-lg transition-colors text-left cursor-pointer uppercase tracking-wider"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Secure Log Out</span>
          </button>
        </div>
      )}

      {/* Premium Glassmorphic Authentication Overlay Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-[#060a13]/85 backdrop-blur-md flex items-center justify-center z-50 animate-fadeIn p-4">
          <div className="bg-[#0f1624]/90 border border-[#242f48] rounded-2xl p-6 w-full max-w-md shadow-2xl relative overflow-hidden glow-blue-box">
            {/* Ambient Background Glows */}
            <div className="absolute -top-24 -left-24 h-48 w-48 bg-accent-cyan/15 rounded-full blur-[60px] pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 h-48 w-48 bg-accent-green/10 rounded-full blur-[60px] pointer-events-none" />

            {/* Close Button */}
            <button 
              onClick={() => setShowLoginModal(false)}
              className="absolute right-4 top-4 p-1.5 bg-[#121824]/60 border border-[#242f48]/70 hover:border-accent-red/50 hover:bg-[#1a2336]/60 rounded-lg text-[#8a98b5] hover:text-white transition-all cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Modal Title */}
            <div className="text-center mb-6">
              <h3 className="text-sm font-extrabold text-white uppercase tracking-widest flex items-center justify-center space-x-2">
                <span className="w-2.5 h-2.5 bg-accent-cyan rounded-full animate-ping mr-1" />
                <span>AlphaTrade Identity Core</span>
              </h3>
              <p className="text-[11px] text-[#8a98b5] mt-1.5 font-semibold">
                {isSignUpMode ? 'Provision a new credentials database key' : 'Connect to the Firebase & Node.js Intelligence Grid'}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={(e) => { e.preventDefault(); handleConnect(); }} className="space-y-4">
              <div className="flex flex-col">
                <span className="text-[10px] text-[#5b6e92] font-extrabold mb-1 uppercase tracking-wider">Email Address</span>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="px-3.5 py-2.5 bg-[#090d16]/70 border border-[#242f48] rounded-xl text-xs text-white focus:outline-none focus:border-accent-cyan/80 focus:ring-1 focus:ring-accent-cyan/30 font-semibold"
                  placeholder="dev@alphatrade.ai"
                  required
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] text-[#5b6e92] font-extrabold mb-1 uppercase tracking-wider">Password</span>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="px-3.5 py-2.5 bg-[#090d16]/70 border border-[#242f48] rounded-xl text-xs text-white focus:outline-none focus:border-accent-cyan/80 focus:ring-1 focus:ring-accent-cyan/30 font-semibold"
                  placeholder="••••••••"
                  required
                />
              </div>

              {/* Toggle Mode */}
              <div className="flex justify-between items-center text-[10px] font-extrabold">
                <span 
                  onClick={() => setIsSignUpMode(prev => !prev)}
                  className="text-accent-cyan hover:text-white cursor-pointer transition-colors"
                >
                  {isSignUpMode ? 'ALREADY REGISTERED? LOG IN' : 'NEW TO ENGINE? CREATE KEY'}
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="submit"
                  disabled={connecting}
                  className="w-full bg-gradient-to-tr from-[#00ffaa] to-[#00f0ff] hover:from-[#00ffaa]/90 hover:to-[#00f0ff]/90 text-[#090d16] text-xs font-black tracking-wider py-3 rounded-xl transition-all duration-200 glow-green-box cursor-pointer flex items-center justify-center space-x-2 select-none uppercase disabled:opacity-50"
                >
                  {connecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Authenticating Core...</span>
                    </>
                  ) : (
                    <span>{isSignUpMode ? 'PROVISION KEY & CONNECT' : 'AUTHENTICATE & CONNECT'}</span>
                  )}
                </button>

                {/* Quick Connect / Auto-Fill */}
                <button
                  type="button"
                  onClick={() => {
                    setEmailInput('dev@alphatrade.ai');
                    setPasswordInput('password123');
                    setIsSignUpMode(false);
                    handleConnect('dev@alphatrade.ai', 'password123');
                  }}
                  className="w-full bg-[#1b253b]/60 hover:bg-[#2d3b59]/80 border border-[#2d3b59] hover:border-accent-cyan/60 text-[10px] font-extrabold tracking-wider text-[#e2e8f0] py-2.5 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center space-x-1 select-none uppercase"
                >
                  <span>Quick Dev Connection</span>
                </button>
              </div>
            </form>

            {/* Developer Credentials Help Info */}
            <div className="mt-5 p-3 bg-[#090d16]/50 border border-[#242f48]/70 rounded-xl flex items-start space-x-2">
              <ShieldAlert className="h-4 w-4 text-accent-amber shrink-0 mt-0.5" />
              <div>
                <div className="text-[10px] font-extrabold text-[#8a98b5] uppercase tracking-wider">Developer Credentials</div>
                <p className="text-[9.5px] text-[#5b6e92] font-semibold mt-1">
                  Use the pre-seeded credentials below or input your custom credentials to create an active account.
                </p>
                <div className="text-[9.5px] text-white font-mono mt-1.5 space-y-0.5">
                  <div>Email: <span className="text-accent-cyan font-bold">dev@alphatrade.ai</span></div>
                  <div>Pass: <span className="text-accent-cyan font-bold">password123</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
