"use client";

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { MockDataService, type WatchlistItem } from '@/services/mockDataService';
import ApiService from '@/services/apiService';

interface WatchlistItemWithData extends WatchlistItem {
  id: string;
}

export default function WatchlistPanel() {
  const [watchlist, setWatchlist] = useState<WatchlistItemWithData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    let refreshInterval: NodeJS.Timeout;

    const checkIsConnected = () => {
      return auth.currentUser !== null || (typeof window !== 'undefined' && localStorage.getItem('alphatrade_mock_auth') === 'true');
    };

    const loadWatchlist = async (isSilent = false) => {
      if (!isSilent) setLoading(true);
      try {
        const isConnected = checkIsConnected();
        if (isConnected) {
          // Connected Mode: Load watchlist from Express Backend API
          let symbols = await ApiService.getWatchlist();
          
          if (active && symbols.length === 0) {
            // Provision empty watchlist with the high-fidelity screenshot symbols
            const initialSymbols = ['AAPL', 'NVDA', 'MSFT', 'TSLA'];
            for (const sym of initialSymbols) {
              try {
                await ApiService.addToWatchlist(sym);
              } catch (e) {
                console.error(`Failed to add ${sym} to watchlist on backend:`, e);
              }
            }
            symbols = await ApiService.getWatchlist();
          }

          if (!active) return;

          // Fetch full data for each symbol in parallel
          const itemsData = await Promise.all(
            symbols.map(async (symbol) => {
              try {
                const data = await ApiService.getTickerData(symbol);
                return data;
              } catch (err) {
                console.error(`Failed to fetch ticker data for ${symbol}:`, err);
                // Graceful fallback to mock data structure
                const rawData = MockDataService.getWatchlistData().find(m => m.ticker === symbol);
                return {
                  symbol,
                  name: rawData?.name || symbol,
                  price: rawData?.price || 150.00,
                  change: rawData?.change || 0.00,
                  sentiment: rawData?.sentiment || 50,
                  sentimentLabel: (rawData?.sentimentLabel || 'Neutral') as any,
                };
              }
            })
          );

          if (active) {
            setWatchlist(
              itemsData.map((item, index) => ({
                id: `watchlist-${item.symbol}-${index}`,
                ticker: item.symbol,
                name: item.name,
                price: item.price,
                change: item.change,
                sentiment: item.sentiment,
                sentimentLabel: item.sentimentLabel,
              }))
            );
          }
        } else {
          // Offline Mock Mode: Load static screenshot-aligned data
          const rawData = MockDataService.getWatchlistData();
          const screenshotAlignedData = rawData
            .filter(item => ['AAPL', 'NVDA', 'MSFT', 'TSLA'].includes(item.ticker))
            .map(item => {
              if (item.ticker === 'AAPL') return { ...item, name: 'Appie', price: 799.90, change: -11.30, sentiment: 78 };
              if (item.ticker === 'NVDA') return { ...item, name: 'Nvidia', price: 323.75, change: 85.50, sentiment: 85 };
              if (item.ticker === 'MSFT') return { ...item, name: 'Microsoft', price: 125.30, change: 13.30, sentiment: 85 };
              if (item.ticker === 'TSLA') return { ...item, name: 'Tesla', price: 29.40, change: -4.78, sentiment: 42 };
              return item;
            });

          if (active) {
            setWatchlist(
              screenshotAlignedData.map((item, index) => ({
                ...item,
                id: `watchlist-mock-${index}`,
              }))
            );
          }
        }
      } catch (err) {
        console.error('Failed to load watchlist, falling back to mock mode:', err);
        if (active) {
          const rawData = MockDataService.getWatchlistData();
          const screenshotAlignedData = rawData
            .filter(item => ['AAPL', 'NVDA', 'MSFT', 'TSLA'].includes(item.ticker))
            .map(item => {
              if (item.ticker === 'AAPL') return { ...item, name: 'Appie', price: 799.90, change: -11.30, sentiment: 78 };
              if (item.ticker === 'NVDA') return { ...item, name: 'Nvidia', price: 323.75, change: 85.50, sentiment: 85 };
              if (item.ticker === 'MSFT') return { ...item, name: 'Microsoft', price: 125.30, change: 13.30, sentiment: 85 };
              if (item.ticker === 'TSLA') return { ...item, name: 'Tesla', price: 29.40, change: -4.78, sentiment: 42 };
              return item;
            });

          setWatchlist(
            screenshotAlignedData.map((item, index) => ({
              ...item,
              id: `watchlist-mock-${index}`,
            }))
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    const handleAuthChange = () => {
      loadWatchlist(false);
    };

    window.addEventListener('alphatrade_auth_change', handleAuthChange);

    const unsubscribe = onAuthStateChanged(auth, () => {
      loadWatchlist(false);
      
      // Setup periodic refresh
      if (refreshInterval) clearInterval(refreshInterval);
      refreshInterval = setInterval(() => {
        const isConnected = checkIsConnected();
        if (isConnected) {
          loadWatchlist(true);
        } else {
          setWatchlist((prev) =>
            prev.map((item) => {
              const delta = (Math.random() - 0.5) * 0.005;
              const newPrice = Number((item.price * (1 + delta)).toFixed(2));
              const newChange = Number((item.change + delta * 100).toFixed(2));
              return {
                ...item,
                price: newPrice,
                change: newChange,
              };
            })
          );
        }
      }, 10000);
    });

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('alphatrade_auth_change', handleAuthChange);
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, []);

  if (loading) {
    return (
      <section className="p-4 border-t border-dark-700 bg-dark-900/20">
        <h2 className="mb-4 text-xs font-extrabold tracking-widest text-[#8a98b5] uppercase">WATCHLIST</h2>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-green mx-auto" />
        </div>
      </section>
    );
  }

  return (
    <section className="p-4 border-t border-dark-700 bg-dark-900/20">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xs font-extrabold tracking-widest text-[#8a98b5] uppercase">WATCHLIST</h2>
        <span className="text-[#455470] cursor-pointer hover:text-white transition-colors text-xs font-extrabold">•••</span>
      </div>
      <div className="space-y-4">
        <div className="flex justify-between text-[10px] font-bold text-[#455470] uppercase px-1">
          <span>Ticker</span>
          <span className="mr-8">Price</span>
          <span>Sentiment Gauge</span>
        </div>
        <div className="space-y-3.5">
          {watchlist.map((item) => (
            <WatchlistRow key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

interface WatchlistItemProps {
  item: WatchlistItemWithData;
}

function WatchlistRow({ item }: WatchlistItemProps) {
  const handleRowClick = () => {
    window.dispatchEvent(new CustomEvent('alphatrade_select_stock', { detail: { symbol: item.ticker } }));
    window.dispatchEvent(new CustomEvent('alphatrade_change_tab', { detail: { tab: 'Markets' } }));
  };

  return (
    <div 
      onClick={handleRowClick}
      className="flex items-center justify-between p-1.5 rounded-xl transition-all duration-200 cursor-pointer hover:bg-dark-800/50 hover:border-dark-700 border border-transparent"
    >
      {/* Symbol & Name Column */}
      <div className="flex items-center space-x-3 w-1/3">
        <div className="flex h-9 w-9 items-center justify-center bg-dark-800 border border-dark-700/50 rounded-lg select-none">
          <CompanyLogo ticker={item.ticker} />
        </div>
        <div>
          <div className="font-bold text-sm text-white select-all">{item.ticker}</div>
          <div className="text-[11px] text-[#455470] font-semibold truncate max-w-[70px]">{item.name}</div>
        </div>
      </div>

      {/* Price & Change Column */}
      <div className="text-right w-1/4 pr-2">
        <div className="font-bold text-sm text-white">${item.price.toFixed(2)}</div>
        <div className={`text-[11px] font-bold ${item.change >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
          {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
        </div>
      </div>

      {/* Radial Semi-Circular SVG Sentiment Gauge */}
      <div className="w-1/3 flex flex-col items-center select-none">
        <RadialSentimentGauge value={item.sentiment} />
      </div>
    </div>
  );
}

/* Custom branded SVG logos to match the screenshot exactly */
function CompanyLogo({ ticker }: { ticker: string }) {
  if (ticker === 'AAPL') {
    return (
      <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.2.67-2.92 1.49-.62.71-1.16 1.85-1.01 2.96 1.12.09 2.27-.57 2.94-1.39z"/>
      </svg>
    );
  }
  if (ticker === 'NVDA') {
    return (
      <svg className="w-5 h-5 stroke-[#76b900] fill-none" viewBox="0 0 24 24" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6a6 6 0 0 0-6 6c0 1.5.5 3 1.5 4l4.5-4.5" />
        <circle cx="12" cy="12" r="2" fill="#76b900" />
      </svg>
    );
  }
  if (ticker === 'MSFT') {
    return (
      <div className="grid grid-cols-2 gap-0.5 w-4.5 h-4.5">
        <div className="bg-[#f25022] w-2 h-2" />
        <div className="bg-[#7fba00] w-2 h-2" />
        <div className="bg-[#00a4ef] w-2 h-2" />
        <div className="bg-[#ffb900] w-2 h-2" />
      </div>
    );
  }
  if (ticker === 'TSLA') {
    return (
      <svg className="w-5 h-5 fill-[#e82127]" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.6 15.6h-3.2v-1.2h3.2v1.2zm1.8-3.1H8.6v-1.1h6.8v1.1zm2.3-3H6.3V10h11.4v1.5zm.9-2.9H5.4V7.1h13.2v1.5z" className="opacity-0"/>
        {/* Customized Tesla T vector */}
        <path d="M12 6.5c2.3 0 4 .3 5.5.9-.2.5-.5 1-1.2 1.4-1.2-.5-2.7-.8-4.3-.8s-3.1.3-4.3.8c-.7-.4-1-.9-1.2-1.4 1.5-.6 3.2-.9 5.5-.9zm5.3 3c-.1.3-.4.8-.8 1.1-1.3-.9-2.9-1.4-4.5-1.4s-3.2.5-4.5 1.4c-.4-.3-.7-.8-.8-1.1 1.7-1 3.8-1.5 5.3-1.5s3.6.5 5.3 1.5zm-5.3 2.1c.9 0 1.8.2 2.6.5.1.5.1 1.1-.1 1.6-.7-.6-1.6-.9-2.5-.9s-1.8.3-2.5.9c-.2-.5-.2-1.1-.1-1.6.8-.3 1.7-.5 2.6-.5zm0 2.2c.4 0 .8.1 1.2.2v3.7c0 .9-.5 1.4-1.2 1.4s-1.2-.5-1.2-1.4v-3.7c.4-.1.8-.2 1.2-.2z"/>
      </svg>
    );
  }
  return null;
}

/* Radial Gauge with trigonometry to find circle endpoint, shadows, and color states */
function RadialSentimentGauge({ value }: { value: number }) {
  const isBullish = value >= 60;
  const isNeutral = value >= 40 && value < 60;
  const isBearish = value < 40;

  const color = isBullish ? '#00ffaa' : isNeutral ? '#f59e0b' : '#ff4a68';
  const filterGlow = isBullish 
    ? 'drop-shadow(0 0 5px rgba(0,255,170,0.6))' 
    : isNeutral 
      ? 'drop-shadow(0 0 5px rgba(245,158,11,0.6))' 
      : 'drop-shadow(0 0 5px rgba(255,74,104,0.6))';

  // Svg semi-circle arc length parameters
  const radius = 35;
  const circumference = Math.PI * radius; // 109.95
  const strokeDashoffset = circumference - (value / 100) * circumference;

  // Endpoint indicator coordinate computation: angle in radians
  const angle = Math.PI - (value / 100) * Math.PI;
  const endX = 50 + radius * Math.cos(angle);
  const endY = 50 - radius * Math.sin(angle);

  return (
    <div className="flex flex-col items-center justify-center relative w-full h-18">
      {/* SVG Radial Semi-Circle */}
      <svg className="w-full h-full" viewBox="0 0 100 55">
        {/* Background Arc Track */}
        <path
          d="M 15 50 A 35 35 0 0 1 85 50"
          fill="none"
          stroke="#1e293b"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Glowing Progress Arc overlay */}
        <path
          d="M 15 50 A 35 35 0 0 1 85 50"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ filter: filterGlow }}
        />
        {/* Small glowing circle node at the progress endpoint */}
        <circle
          cx={endX}
          cy={endY}
          r="4.5"
          fill="#ffffff"
          stroke={color}
          strokeWidth="2"
          style={{ filter: filterGlow }}
        />
      </svg>
      {/* Center Value Text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
        <span className="font-extrabold text-white text-xs leading-none">{Math.round(value)}%</span>
      </div>

      {/* Legend Indicator labels */}
      <div className="flex justify-between w-full text-[7px] font-extrabold tracking-widest mt-1">
        <span className={isBullish ? 'text-accent-green glow-green-text' : 'text-[#455470]'}>BULLISH</span>
        <span className={isNeutral ? 'text-accent-amber' : 'text-[#455470]'}>NEUTRAL</span>
        <span className={isBearish ? 'text-[#ff4a68]' : 'text-[#455470]'}>BEARISH</span>
      </div>
    </div>
  );
}