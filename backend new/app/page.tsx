// src/app/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { fetchTickerData } from '@/lib/api';
import Header from '@/components/Header';
import Watchlist from '@/components/Watchlist';
import PriceChart from '@/components/PriceChart';
import NewsFeed from '@/components/NewsFeed';
import AIReport from '@/components/AIReport';
import AIChat from '@/components/AIChat';

export default function Dashboard() {
  const { selectedTicker, setSelectedTicker } = useStore();
  const [tickerData, setTickerData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (selectedTicker) {
      loadTickerData();
    }
  }, [selectedTicker]);

  const loadTickerData = async () => {
    try {
      setLoading(true);
      const response = await fetchTickerData(selectedTicker!);
      setTickerData(response.data);
    } catch (error) {
      console.error('Failed to load ticker data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-midnight">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Watchlist */}
          <div className="lg:col-span-1">
            <div className="card h-screen sticky top-24 overflow-hidden">
              <Watchlist />
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-8">
            {selectedTicker && tickerData && (
              <>
                {/* Price Chart */}
                <PriceChart
                  symbol={selectedTicker}
                  currentPrice={tickerData.price}
                  high={tickerData.high}
                  low={tickerData.low}
                />

                {/* Key Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="card p-4">
                    <p className="text-gray-400 text-sm mb-1">Market Cap</p>
                    <p className="text-white text-lg font-semibold">
                      ${(tickerData.marketCap / 1e12).toFixed(2)}T
                    </p>
                  </div>
                  <div className="card p-4">
                    <p className="text-gray-400 text-sm mb-1">P/E Ratio</p>
                    <p className="text-white text-lg font-semibold">
                      {tickerData.pe?.toFixed(1)}
                    </p>
                  </div>
                  <div className="card p-4">
                    <p className="text-gray-400 text-sm mb-1">EPS</p>
                    <p className="text-white text-lg font-semibold">
                      ${tickerData.eps?.toFixed(2)}
                    </p>
                  </div>
                  <div className="card p-4">
                    <p className="text-gray-400 text-sm mb-1">Volume</p>
                    <p className="text-white text-lg font-semibold">
                      {(tickerData.volume / 1e6).toFixed(1)}M
                    </p>
                  </div>
                </div>

                {/* News Feed */}
                <NewsFeed ticker={selectedTicker} />

                {/* Two Column Layout for Report and Chat */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* AI Report */}
                  <AIReport ticker={selectedTicker} />

                  {/* AI Chat */}
                  <div className="h-96">
                    <AIChat
                      ticker={selectedTicker}
                      context={`Current price: $${tickerData.price}, Change: ${tickerData.change}%`}
                    />
                  </div>
                </div>
              </>
            )}

            {!selectedTicker && (
              <div className="card p-12 text-center">
                <h2 className="text-2xl font-bold text-white mb-4">
                  Welcome to AlphaStream AI
                </h2>
                <p className="text-gray-400 mb-6">
                  Select a ticker from your watchlist to get started with real-time
                  analysis, AI insights, and market intelligence.
                </p>
                <div className="inline-block bg-gradient-to-r from-accent to-blue-400 p-1 rounded-lg">
                  <div className="bg-midnight px-8 py-4 rounded-md">
                    <p className="text-accent font-semibold">
                      👈 Choose a stock from the watchlist
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-accent/20 bg-gradient-dark/50 backdrop-blur-md mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-400 text-sm">
            <p>AlphaStream AI © 2024 | Powered by Bright Data, OpenRouter & Firebase</p>
            <p className="mt-2 text-xs">
              Real-time financial intelligence for institutional-grade analysis
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
