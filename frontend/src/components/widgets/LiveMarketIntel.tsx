"use client";

import { useState, useEffect } from 'react';
import { MockDataService, type MarketIndex } from '@/services/mockDataService';

export default function LiveMarketIntel() {
  const [marketData, setMarketData] = useState<MarketIndex[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Initial client-side aligned data to perfectly prevent SSR mismatches
    const initialAligned = MockDataService.getMarketData().map(idx => {
      if (idx.name === 'S&P 500') return { ...idx, change: 456.50, value: 1337.53, trend: [1200, 1250, 1220, 1280, 1260, 1310, 1290, 1340, 1315, 1337] };
      if (idx.name === 'NASDAQ') return { ...idx, change: 13.93, value: 1378.89, trend: [1150, 1200, 1180, 1260, 1220, 1290, 1270, 1350, 1330, 1378] };
      if (idx.name === 'DJI') return { ...idx, change: -3.39, value: 1568.13, trend: [1420, 1460, 1430, 1490, 1450, 1510, 1480, 1540, 1510, 1568] };
      return idx;
    });
    setMarketData(initialAligned);

    const interval = setInterval(() => {
      setMarketData((prev) =>
        prev.map((idx) => {
          const delta = (Math.random() - 0.5) * 0.001;
          const newValue = Number((idx.value * (1 + delta)).toFixed(2));
          const lastTrendVal = idx.trend[idx.trend.length - 1];
          const newTrendVal = Math.max(1000, Math.min(1600, lastTrendVal + (Math.random() - 0.5) * 12));
          
          return {
            ...idx,
            value: newValue,
            trend: [...idx.trend.slice(1), newTrendVal]
          };
        })
      );
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Premium pulsing glassmorphic skeletons during Server-Side Rendering (SSR)
  if (!mounted) {
    return (
      <section className="p-1.5 select-none">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xs font-extrabold tracking-widest text-[#8a98b5] uppercase">LIVE MARKET INTEL</h2>
          <span className="text-[#455470] text-xs font-extrabold">•••</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div 
              key={n} 
              className="bg-[#131b2c]/65 border border-[#242f48]/70 rounded-xl p-4 h-[216px] flex flex-col justify-between animate-pulse"
            >
              <div className="h-4 w-28 bg-[#242f48]/50 rounded" />
              <div className="h-24 bg-[#242f48]/30 rounded-lg mt-4" />
              <div className="h-3 w-16 bg-[#242f48]/50 rounded mt-4" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="p-1.5 select-none">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-xs font-extrabold tracking-widest text-[#8a98b5] uppercase">LIVE MARKET INTEL</h2>
        <span className="text-[#455470] cursor-pointer hover:text-white transition-colors text-xs font-extrabold">•••</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {marketData.map((item) => (
          <MarketIndexCard key={item.name} item={item} />
        ))}
      </div>
    </section>
  );
}

interface MarketIndexCardProps {
  item: MarketIndex;
}

function MarketIndexCard({ item }: MarketIndexCardProps) {
  const isPositive = item.change >= 0;
  const changeColor = isPositive ? 'text-accent-green' : 'text-[#ff4a68]';
  const strokeColor = isPositive ? '#00ffaa' : '#ff4a68';

  return (
    <div className="bg-[#131b2c]/65 border border-[#242f48]/70 rounded-xl p-4 flex flex-col relative overflow-hidden transition-all duration-200 hover:border-[#242f48]">
      {/* Index Heading Row */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-extrabold text-sm text-white flex items-center space-x-2">
          <span className={`w-2.2 h-2.2 rounded-full ${isPositive ? 'bg-accent-green' : 'bg-[#ff4a68]'}`} />
          <span>{item.name}</span>
        </h3>
        <span className={`text-xs font-extrabold ${changeColor} flex items-center space-x-1`}>
          <span>{isPositive ? '▲' : '▼'}</span>
          <span>{Math.abs(item.change)}%</span>
        </span>
      </div>

      {/* Price Graph area */}
      <div className="h-32 mt-2 relative">
        <MarketAreaChart trend={item.trend} isPositive={isPositive} currentValue={item.value} />
      </div>

      {/* Timeline X-Axis */}
      <div className="flex justify-between text-[8.5px] font-extrabold text-[#455470] tracking-wider mt-2.5 px-0.5">
        <span>{item.name === 'NASDAQ' ? '12en' : '12am'}</span>
        <span>{item.name === 'NASDAQ' ? '19h' : item.name === 'DJI' ? '16h' : '13h'}</span>
        <span>6m</span>
        <span>{item.name === 'NASDAQ' ? 'Sen' : 'Sun'}</span>
      </div>
    </div>
  );
}

function MarketAreaChart({ trend, isPositive, currentValue }: { trend: number[]; isPositive: boolean; currentValue: number }) {
  if (!trend || trend.length === 0) return null;
  
  // Align scales to match screenshot labels
  const minVal = 1000;
  const maxVal = 1600;
  const range = maxVal - minVal;

  const strokeColor = isPositive ? '#00ffaa' : '#ff4a68';
  const glowFilter = isPositive ? 'drop-shadow(0 0 4px rgba(0,255,170,0.5))' : 'drop-shadow(0 0 4px rgba(255,74,104,0.5))';

  // Map 10 coordinates to 100x80 SVG box
  const points = trend
    .map((val, idx) => {
      const x = (idx / (trend.length - 1)) * 100;
      const y = 80 - ((val - minVal) / range) * 60 - 10; // Keep boundaries
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Peak node coordinates
  const lastIdx = trend.length - 1;
  const peakX = 100;
  const peakY = 80 - ((currentValue - minVal) / range) * 60 - 10;

  return (
    <div className="w-full h-full relative">
      {/* Absolute price metrics grid overlays */}
      <div className="absolute left-0 top-0 text-[8px] font-bold text-[#455470]">1500.00</div>
      <div className="absolute left-0 top-1/2 -translate-y-1/2 text-[8px] font-bold text-[#455470]">1300.00</div>
      <div className="absolute left-0 bottom-0 text-[8px] font-bold text-[#455470]">1200.00</div>

      {/* Glowing Peak value tag overlay */}
      <div 
        className="absolute right-0 select-none z-10 filter drop-shadow-[0_0_8px_rgba(0,255,170,0.3)] transition-all duration-300"
        style={{ top: `${Math.max(5, Math.min(85, (peakY / 80) * 100 - 10))}%` }}
      >
        <span className={`text-[9.5px] font-extrabold px-1.5 py-0.5 rounded text-dark-950 font-mono`} style={{ backgroundColor: strokeColor }}>
          {currentValue.toFixed(2)}
        </span>
      </div>

      <svg className="w-full h-full" viewBox="0 0 100 80" preserveAspectRatio="none">
        <defs>
          <linearGradient id={isPositive ? "area-pos" : "area-neg"} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isPositive ? "#00ffaa" : "#ff4a68"} stopOpacity="0.22" />
            <stop offset="100%" stopColor={isPositive ? "#00ffaa" : "#ff4a68"} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        
        {/* Horizontal gridlines */}
        <line x1="12" y1="10" x2="88" y2="10" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />
        <line x1="12" y1="40" x2="88" y2="40" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />
        <line x1="12" y1="70" x2="88" y2="70" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />

        {/* Filled gradient path */}
        <polygon
          fill={`url(#${isPositive ? "area-pos" : "area-neg"})`}
          points={`0,80 ${points} 100,80`}
        />

        {/* Core line path */}
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
          style={{ filter: glowFilter }}
        />

        {/* Highlight circle node on peak */}
        <circle
          cx={peakX}
          cy={peakY}
          r="3"
          fill="#ffffff"
          stroke={strokeColor}
          strokeWidth="1.5"
          style={{ filter: glowFilter }}
        />
      </svg>
    </div>
  );
}