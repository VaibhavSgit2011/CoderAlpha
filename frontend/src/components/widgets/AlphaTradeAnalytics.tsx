"use client";

import { useEffect, useState } from 'react';
import { MockDataService, type AnalyticsCard } from '@/services/mockDataService';
import { TrendingUp, Zap, Cpu, Activity, DollarSign, Target, RefreshCw, GitBranch, Shield, ShoppingCart, Home, Sun, Wind } from 'lucide-react';

interface AnalyticsCardProps {
  card: AnalyticsCard;
  isLoading?: boolean;
}

export default function AlphaTradeAnalytics() {
  const [cards] = useState<AnalyticsCard[]>(MockDataService.getAnalyticsData());
  const [loadingIds, setLoadingIds] = useState<number[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const randomCard = cards[Math.floor(Math.random() * cards.length)];
      setLoadingIds((prev) =>
        prev.includes(randomCard.id)
          ? prev.filter((id) => id !== randomCard.id)
          : [...prev, randomCard.id]
      );
    }, 8000);

    return () => clearInterval(interval);
  }, [cards]);

  return (
    <section className="p-1.5 select-none">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-xs font-extrabold tracking-widest text-[#8a98b5] uppercase">ALPHA TRADE ANALYTICS</h2>
        <span className="text-[#455470] cursor-pointer hover:text-white transition-colors text-xs font-extrabold">•••</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <AnalyticsInsightCard
            key={card.id}
            card={card}
            isLoading={loadingIds.includes(card.id)}
          />
        ))}
      </div>
    </section>
  );
}

function AnalyticsInsightCard({ card, isLoading = false }: AnalyticsCardProps) {
  return (
    <div className="bg-[#131b2c]/65 border border-[#242f48]/70 rounded-xl p-4.5 flex flex-col justify-between h-48 select-none hover:border-accent-green/50 hover:bg-[#1a2336]/40 transition-all duration-200 group cursor-pointer">
      {/* Title & Description row */}
      <div>
        <div className="flex justify-between items-start">
          <h3 className="font-extrabold text-sm text-white group-hover:text-accent-green transition-colors duration-200">{card.title}</h3>
          {isLoading && (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-cyan opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-cyan"></span>
            </span>
          )}
        </div>
        <p className="text-[12px] text-[#8a98b5] mt-1.5 leading-relaxed line-clamp-2 select-text">{card.summary}</p>
      </div>

      {/* Footer controls: Icons on left, centered button on bottom */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#242f48]/30">
        {/* Left indicators */}
        <div className="flex items-center space-x-2">
          {card.icons.map((icon, index) => (
            <div key={index} className="flex h-6 w-6 items-center justify-center bg-[#242f48]/40 border border-[#242f48]/30 rounded-md text-[#8a98b5]">
              <IconRenderer name={icon} />
            </div>
          ))}
        </div>

        {/* Centered Report Trigger button matching the screenshot */}
        <button 
          onClick={() => alert(`Opening dossier file: ${card.title}`)}
          className="px-4 py-1.5 bg-[#242f48]/60 hover:bg-[#2d3b59]/80 border border-[#2d3b59] hover:border-accent-green/60 text-[9.5px] font-extrabold tracking-wider text-[#e2e8f0] rounded-xl transition-all duration-200 cursor-pointer"
        >
          VIEW FULL REPORT
        </button>

      </div>
    </div>
  );
}

/* Custom mapping of Lucide icons based on string names */
function IconRenderer({ name }: { name: string }) {
  const iconMap: Record<string, React.ReactNode> = {
    TrendingUp: <TrendingUp className="h-3.5 w-3.5 text-accent-green" />,
    Zap: <Zap className="h-3.5 w-3.5 text-accent-cyan" />,
    Microchip: <Cpu className="h-3.5 w-3.5 text-accent-amber" />,
    ChartLine: <Activity className="h-3.5 w-3.5 text-accent-green" />,
    DollarSign: <DollarSign className="h-3.5 w-3.5 text-accent-cyan" />,
    Target: <Target className="h-3.5 w-3.5 text-accent-red" />,
    GitBranch: <GitBranch className="h-3.5 w-3.5 text-accent-cyan" />,
    RefreshCw: <RefreshCw className="h-3.5 w-3.5 text-accent-green animate-spin-slow" />,
    Building: <Activity className="h-3.5 w-3.5 text-accent-amber" />,
    Percent: <TrendingUp className="h-3.5 w-3.5 text-accent-green" />,
    ArrowDown: <TrendingUp className="h-3.5 w-3.5 text-[#ff4a68] rotate-180" />,
    ShoppingCart: <ShoppingCart className="h-3.5 w-3.5 text-accent-green" />,
    Home: <Home className="h-3.5 w-3.5 text-accent-cyan" />,
    Sun: <Sun className="h-3.5 w-3.5 text-accent-amber" />,
    Wind: <Wind className="h-3.5 w-3.5 text-accent-cyan" />,
  };

  return iconMap[name] || <Zap className="h-3.5 w-3.5 text-accent-cyan" />;
}
