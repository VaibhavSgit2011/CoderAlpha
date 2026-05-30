"use client";

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import GlobalHeader from '@/components/layout/GlobalHeader';
import LeftSidebar from '@/components/layout/LeftSidebar';
import MainCentralArea from '@/components/layout/MainCentralArea';
import AuthPortal from '@/components/ui/AuthPortal';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<string>('Dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen to Firebase Auth state shifts
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Listen for cross-tab or widget-initiated navigation shifts
  useEffect(() => {
    const handleTabChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab: string }>;
      if (customEvent.detail && customEvent.detail.tab) {
        setActiveTab(customEvent.detail.tab);
      }
    };
    window.addEventListener('alphatrade_change_tab', handleTabChange);
    return () => {
      window.removeEventListener('alphatrade_change_tab', handleTabChange);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#090d16] flex-col space-y-4">
        <div className="relative flex items-center justify-center">
          <div className="absolute h-16 w-16 rounded-full border-4 border-accent-cyan/10 animate-pulse" />
          <Loader2 className="h-10 w-10 animate-spin text-accent-cyan" />
        </div>
        <span className="text-xs font-black text-[#5b6e92] tracking-widest uppercase animate-pulse">
          Synchronizing Security Layer...
        </span>
      </div>
    );
  }

  // Enforce connected backend only landing guard
  if (!user) {
    return <AuthPortal />;
  }

  return (
    <div className="flex min-h-screen bg-dark-950 text-white select-none overflow-hidden font-sans">
      {/* Dynamic Left sidebar navigation */}
      <LeftSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="flex-1 flex flex-col overflow-hidden bg-dark-900">
        {/* Dynamic header with page titles */}
        <GlobalHeader activeTab={activeTab} />
        
        {/* Full-width premium central workspace */}
        <main className="flex-1 overflow-hidden p-4">
          <div className="h-full w-full bg-dark-950/40 rounded-2xl border border-dark-800/40 p-1">
            <MainCentralArea activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        </main>
      </div>
    </div>
  );
}