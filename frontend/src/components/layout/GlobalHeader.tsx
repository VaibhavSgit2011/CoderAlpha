"use client";

import SearchBar from '@/components/ui/SearchBar';
import UserMenu from '@/components/ui/UserMenu';

interface GlobalHeaderProps {
  activeTab: string;
}

export default function GlobalHeader({ activeTab }: GlobalHeaderProps) {
  // Map page titles beautifully
  const getPageTitle = (tab: string) => {
    switch (tab) {
      case 'Dashboard':
        return 'Investment Intel Hub';
      case 'Watchlist':
        return 'Interactive Watchlist';
      case 'Markets':
        return 'Global Market Terminal';
      case 'Request Report':
        return 'Dossier Generation';
      case 'AI Chatbot':
        return 'Conversational RAG Analyst';
      case 'Live News':
        return 'Live Stock News Feed';
      case 'AI Reports':
        return 'Due Diligence Vault';
      case 'Settings':
        return 'System Console Configuration';
      default:
        return 'Market Terminal';
    }
  };

  return (
    <header className="flex h-18 items-center justify-between px-8 bg-[#090d16]/75 border-b border-[#1a2336]/60 backdrop-blur-md select-none z-20 relative">
      {/* Dynamic Title block on Left */}
      <div className="flex flex-col justify-center min-w-[200px]">
        <div className="text-[10px] font-black text-[#5b6e92] uppercase tracking-widest leading-none">
          AlphaTrade Terminal
        </div>
        <h2 className="text-sm font-black text-white uppercase tracking-wider mt-1 flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 bg-accent-cyan rounded-full animate-pulse" />
          <span>{getPageTitle(activeTab)}</span>
        </h2>
      </div>

      {/* Center SearchBar */}
      <div className="flex-1 max-w-md mx-6 flex items-center">
        <SearchBar />
      </div>

      {/* Right UserMenu */}
      <UserMenu />
    </header>
  );
}