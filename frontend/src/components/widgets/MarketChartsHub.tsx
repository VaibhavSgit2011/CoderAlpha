"use client";

import { useState, useEffect } from 'react';
import { Search, Activity } from 'lucide-react';

// =============================================================================
// Widget Implementation — Isolated TradingView Terminal
// =============================================================================

export default function MarketChartsHub() {
  const [mounted, setMounted] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState<string>('AAPL');
  const [searchInput, setSearchInput] = useState<string>('');
  const [chartLoading, setChartLoading] = useState<boolean>(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  // When symbol changes, trigger loading animation state
  useEffect(() => {
    setChartLoading(true);
  }, [activeSymbol]);

  // ── TradingView Symbol Mapping ─────────────────────────────────────────────
  const getTradingViewSymbol = (sym: string) => {
    // Sanitization: Ensure symbol contains only alphanumeric, slash, or hyphen characters
    const s = sym.toUpperCase().replace(/[^A-Z0-9/\-]/g, '').trim();
    if (!s) return 'NASDAQ:AAPL';

    const clean = s.replace('/', '');
    
    // Known Crypto Tickers (auto-resolve to Coinbase USD pair)
    const CRYPTO_TICKERS = [
      'BTC', 'ETH', 'SOL', 'ADA', 'DOGE', 'XRP', 'DOT', 'LINK', 'LTC', 'AVAX', 
      'UNI', 'BCH', 'SHIB', 'NEAR', 'MATIC', 'ALGO', 'ICP', 'FIL', 'TRX', 'XLM'
    ];
    
    if (CRYPTO_TICKERS.includes(clean)) {
      return `COINBASE:${clean}USD`;
    }
    
    // If it already has USD/USDT suffix for crypto
    if ((clean.endsWith('USD') || clean.endsWith('USDT')) && clean.length > 4) {
      if (clean.endsWith('USDT')) {
        return `BINANCE:${clean}`;
      }
      return `COINBASE:${clean}`;
    }

    // Dynamic Forex Mapping: e.g. EURUSD -> FX:EURUSD, USDJPY -> FX:USDJPY
    const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'HKD', 'SGD'];
    const looksLikeForex = clean.length === 6 && (
      CURRENCY_CODES.includes(clean.slice(0, 3)) || 
      CURRENCY_CODES.includes(clean.slice(3))
    );

    if (looksLikeForex) {
      return `FX:${clean}`;
    }

    // Known Stock Exchange Mapping
    const NASDAQ_STOCKS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'GOOG', 'META', 'NFLX', 'AMD', 'INTC', 'PYPL', 'ADBE', 'QCOM', 'CSCO', 'PEP', 'COST'];
    const NYSE_STOCKS = ['BABA', 'TSM', 'NIO', 'DIS', 'V', 'MA', 'JPM', 'BAC', 'WMT', 'PG', 'KO', 'XOM', 'CVX', 'LLY', 'UNH'];

    if (NASDAQ_STOCKS.includes(clean)) {
      return `NASDAQ:${clean}`;
    }
    if (NYSE_STOCKS.includes(clean)) {
      return `NYSE:${clean}`;
    }

    // Fallback: Let TradingView auto-resolve the raw symbol
    return clean;
  };

  // Listen for programmatic stock selection event (e.g. from watchlist / dashboard clicks)
  useEffect(() => {
    const handleSelectStock = (e: Event) => {
      const customEvent = e as CustomEvent<{ symbol: string }>;
      if (!customEvent.detail || !customEvent.detail.symbol) return;
      
      const rawSymbol = customEvent.detail.symbol.toUpperCase();
      const sanitized = rawSymbol.replace(/[^A-Z0-9/\-]/g, '').trim();
      if (sanitized) {
        setActiveSymbol(sanitized);
      }
    };

    window.addEventListener('alphatrade_select_stock', handleSelectStock);
    return () => {
      window.removeEventListener('alphatrade_select_stock', handleSelectStock);
    };
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Sanitization: Allow only alphanumeric, slash, and hyphen
    const cleanSym = searchInput.trim().toUpperCase().replace(/[^A-Z0-9/\-]/g, '');
    if (cleanSym) {
      setActiveSymbol(cleanSym);
      setSearchInput('');
    }
  };

  const QUICK_ACCESS_PILLS = [
    { label: 'AAPL', symbol: 'AAPL' },
    { label: 'NVDA', symbol: 'NVDA' },
    { label: 'TSLA', symbol: 'TSLA' },
    { label: 'BTC/USD', symbol: 'BTC' },
    { label: 'ETH/USD', symbol: 'ETH' },
    { label: 'EUR/USD', symbol: 'EURUSD' },
    { label: 'USD/JPY', symbol: 'USDJPY' },
  ];

  const tvSymbol = getTradingViewSymbol(activeSymbol);
  
  const chartEmbedUrl = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=${encodeURIComponent(tvSymbol)}&interval=D&hidesidetoolbar=1&symboledit=1&saveimage=1&toolbarbg=131b2c&theme=dark&style=1&timezone=Etc%2FUTC&locale=en`;

  // Server-side rendering hydration shield to guarantee SSR stability in Next.js
  if (!mounted) {
    return (
      <div className="bg-[#131b2c]/65 border border-[#242f48]/70 rounded-xl p-5 min-h-[800px] flex flex-col items-center justify-center space-y-3 relative overflow-hidden backdrop-blur-md">
        <Activity className="h-8 w-8 text-accent-cyan animate-pulse filter drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]" />
        <span className="text-[11px] font-black text-[#8a98b5] uppercase tracking-widest font-sans">
          Initializing Chart Station Engine...
        </span>
      </div>
    );
  }

  return (
    <div className="bg-[#131b2c]/65 border border-[#242f48]/70 rounded-xl p-5 flex flex-col h-full space-y-4 select-none relative overflow-hidden backdrop-blur-md">
      <div 
        className="absolute -top-40 -right-40 h-80 w-80 rounded-full blur-[120px] opacity-10 pointer-events-none transition-all duration-1000 bg-accent-cyan animate-pulse"
      />

      {/* Modern Trading Control Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-[#242f48]/40">
        
        {/* Left Side Branding and Active Symbol Status */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2">
            <Activity className="h-5 w-5 text-accent-cyan filter drop-shadow-[0_0_6px_rgba(0,240,255,0.4)] animate-pulse" />
            <h2 className="text-xs font-extrabold text-white uppercase tracking-widest font-sans">
              TradingView Chart Terminal
            </h2>
          </div>
          <span className="text-[10px] font-black text-accent-cyan tracking-widest border border-accent-cyan/35 px-2.5 py-1 rounded bg-accent-cyan/10 uppercase font-mono shadow-[0_0_8px_rgba(0,240,255,0.15)]">
            {tvSymbol}
          </span>
        </div>

        {/* Center / Right Search Options & quick pills */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          
          {/* Quick Access Pills */}
          <div className="flex flex-wrap gap-1 bg-[#090d16]/30 p-1 rounded-xl border border-[#242f48]/30 overflow-x-auto max-w-[340px] sm:max-w-none">
            {QUICK_ACCESS_PILLS.map((pill) => (
              <button
                key={pill.symbol}
                onClick={() => setActiveSymbol(pill.symbol)}
                className={`px-2.5 py-1 rounded-lg text-[9.5px] font-extrabold tracking-wider uppercase transition-all duration-200 cursor-pointer ${
                  activeSymbol === pill.symbol || activeSymbol.replace('/', '') === pill.symbol
                    ? 'bg-gradient-to-tr from-[#00f0ff] to-[#00ffaa] text-[#0d1321] font-black shadow-[0_0_10px_rgba(0,240,255,0.3)]'
                    : 'text-[#8a98b5] hover:text-white hover:bg-[#1a2336]/40'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Glowing Stock Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:flex-initial">
            <input
              type="text"
              placeholder="Search symbol (e.g. AAPL, AMZN, BTCUSD)..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full sm:w-[260px] pl-8 pr-3 py-1.5 bg-[#090d16]/70 border border-[#242f48]/70 rounded-xl text-[11px] text-white placeholder-[#5b6e92] focus:outline-none focus:border-accent-cyan/85 font-semibold focus:shadow-[0_0_10px_rgba(0,240,255,0.25)] transition-all duration-200"
            />
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#5b6e92]" />
          </form>
        </div>

      </div>

      {/* Main Full-Width Immersive Chart Viewport with Smooth Glass Loading Overlay */}
      <div className="bg-[#090d16]/40 border border-[#242f48]/50 rounded-xl overflow-hidden shadow-2xl relative flex-1 min-h-[2400px]">
        {chartLoading && (
          <div className="absolute inset-0 bg-[#0d1321]/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-3 z-30 transition-all duration-500">
            <Activity className="h-7 w-7 text-accent-cyan animate-pulse filter drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]" />
            <span className="text-[10px] font-black text-[#8a98b5] tracking-widest uppercase font-mono">
              Loading Live {activeSymbol} Chart...
            </span>
          </div>
        )}
        <iframe
          key={activeSymbol}
          title="TradingView Interactive Chart"
          src={chartEmbedUrl}
          width="100%"
          height="100%"
          style={{ border: 'none' }}
          allowFullScreen
          onLoad={() => setChartLoading(false)}
        />
      </div>

    </div>
  );
}
