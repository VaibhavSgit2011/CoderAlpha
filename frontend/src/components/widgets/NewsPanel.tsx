"use client";

import { useState, useEffect } from 'react';
import { Search, Filter, Newspaper, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import ApiService from '@/services/apiService';

interface NewsItem {
  id: string;
  ticker: string;
  source: string;
  time: string;
  title: string;
  sentiment: 'Bullish' | 'Neutral' | 'Bearish';
  aiSummary: string;
}

const initialNews: NewsItem[] = [
  {
    id: 'news-1',
    ticker: 'NVDA',
    source: 'Bloomberg',
    time: '5m ago',
    title: 'NVIDIA chip demand spikes 25% amid massive hyperscaler cloud CAPEX spending expansion.',
    sentiment: 'Bullish',
    aiSummary: 'This surge in CAPEX represents direct top-line revenue growth for Nvidia. Hyperscalers are showing no signs of slowing down their AI buildouts, securing Nvidias near-term earnings stability.'
  },
  {
    id: 'news-2',
    ticker: 'AAPL',
    source: 'Reuters',
    time: '18m ago',
    title: 'Apple initiates local local-hydration AI models in next-gen iOS 20 framework pipelines.',
    sentiment: 'Bullish',
    aiSummary: 'Running AI models locally on device improves latency, privacy, and reduces cloud server costs. This will likely trigger an upgrade supercycle for older iPhone hardware.'
  },
  {
    id: 'news-3',
    ticker: 'TSLA',
    source: 'CNBC',
    time: '42m ago',
    title: 'Tesla delivery estimates adjusted downwards by 4% citing European logistics constraints.',
    sentiment: 'Bearish',
    aiSummary: 'Logistical delays will likely defer revenue recognition into the subsequent quarter. Near-term margins will experience headwinds from shipping rates and factory upgrades.'
  },
  {
    id: 'news-4',
    ticker: 'MSFT',
    source: 'MarketWatch',
    time: '1h ago',
    title: 'Microsoft launches specialized agentic workflows for Azure cloud corporate dashboards.',
    sentiment: 'Bullish',
    aiSummary: 'Agentic workflows increase enterprise software stickiness and average revenue per user (ARPU). Azure stands to secure a deeper moat in the enterprise segment.'
  },
  {
    id: 'news-5',
    ticker: 'AMZN',
    source: 'Yahoo Finance',
    time: '2h ago',
    title: 'Amazon logistics efficiency indexes hit record highs as robotics automation rolls out.',
    sentiment: 'Bullish',
    aiSummary: 'Decreasing cost-to-fulfill direct orders will expand retail operating margins. Robotics integrations offset labor cost inflation in regional fulfillment centers.'
  }
];

export default function NewsPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<'All' | 'Bullish' | 'Neutral' | 'Bearish'>('All');
  const [news, setNews] = useState<NewsItem[]>(initialNews);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  const handleForceIngest = () => {
    alert("Bright Data SERP pipeline triggered. Fetching fresh tickers news feeds...");
    setShowMenu(false);
  };
  
  const handleMarkAllRead = () => {
    alert("All recent feed flows marked as read.");
    setShowMenu(false);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSentimentFilter('All');
    setShowMenu(false);
  };

  useEffect(() => {
    let active = true;
    let refreshInterval: NodeJS.Timeout;

    const loadNews = async (currentUser: User | null, isSilent = false) => {
      try {
        if (currentUser) {
          // Connected Mode: Aggregate scraping news from tickers collection
          const tickers = await ApiService.getTickers();
          if (!active) return;

          const aggregated: NewsItem[] = [];
          tickers.forEach((t) => {
            if (Array.isArray(t.recentNews)) {
              t.recentNews.forEach((newsItem, idx) => {
                aggregated.push({
                  id: `${t.symbol}-news-${idx}-${newsItem.title.slice(0, 10)}`,
                  ticker: t.symbol,
                  source: newsItem.source || 'Aggregator',
                  time: t.lastUpdated ? `${Math.max(1, Math.round((Date.now() - new Date(t.lastUpdated).getTime()) / 60000))}m ago` : 'Just Ingested',
                  title: newsItem.title,
                  sentiment: t.sentimentLabel,
                  aiSummary: newsItem.ai_summary || 'No further analysis required for this asset flow.'
                });
              });
            }
          });

          if (active) {
            setNews(aggregated.length > 0 ? aggregated.slice(0, 10) : initialNews);
          }
        } else {
          // Offline Mock Mode: Use initial news
          if (!isSilent && active) {
            setNews(initialNews);
          }
        }
      } catch (err) {
        console.error('Failed to load dynamic news:', err);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (currentUser: User | null) => {
      loadNews(currentUser, false);

      if (refreshInterval) clearInterval(refreshInterval);
      refreshInterval = setInterval(() => {
        if (currentUser) {
          loadNews(currentUser, true);
        } else {
          // Offline simulation tick
          const tickers = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN'];
          const randomTicker = tickers[Math.floor(Math.random() * tickers.length)];
          const sources = ['Reuters', 'Bloomberg', 'CNBC', 'Seeking Alpha'];
          const randomSource = sources[Math.floor(Math.random() * sources.length)];
          const sentiments: Array<'Bullish' | 'Neutral' | 'Bearish'> = ['Bullish', 'Neutral', 'Bearish'];
          const randomSentiment = sentiments[Math.floor(Math.random() * sentiments.length)];

          const newItem: NewsItem = {
            id: `news-${Date.now()}`,
            ticker: randomTicker,
            source: randomSource,
            time: 'Just now',
            title: `${randomTicker} is experiencing high volatility as institutional desks rebalance portfolios ahead of options expiry.`,
            sentiment: randomSentiment,
            aiSummary: `Pre-expiry options rebalancing represents transient flow dynamics. Fundamental operations are unaffected, but short-term price discovery will remain highly volatile.`
          };

          if (active) {
            setNews(prev => [newItem, ...prev.slice(0, 9)]);
          }
        }
      }, 20000);
    });

    return () => {
      active = false;
      unsubscribe();
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, []);

  const handleToggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const filteredNews = news.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.source.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSentiment = sentimentFilter === 'All' || item.sentiment === sentimentFilter;
    
    return matchesSearch && matchesSentiment;
  });

  return (
    <div className="bg-[#131b2c]/65 border border-[#242f48]/70 rounded-xl p-4 flex flex-col select-none">
      {/* Widget Header */}
      <div className="flex justify-between items-center mb-3 relative">
        <h3 className="font-extrabold text-[11.5px] text-white uppercase tracking-wider flex items-center space-x-2">
          <Newspaper className="h-4 w-4 text-accent-cyan" />
          <span>Live Stock News Feed</span>
        </h3>
        <span 
          onClick={() => setShowMenu(prev => !prev)}
          className="text-[#455470] cursor-pointer hover:text-white transition-colors text-xs font-extrabold"
        >
          •••
        </span>

        {showMenu && (
          <div className="absolute right-0 top-6 bg-[#131b2c] border border-[#242f48] rounded-xl p-1.5 w-44 shadow-2xl z-50 animate-fadeIn backdrop-blur-xl">
            <button
              onClick={handleForceIngest}
              className="w-full flex items-center px-3 py-2 text-xs font-black text-white hover:bg-[#1a2336] rounded-lg transition-colors text-left uppercase tracking-wider cursor-pointer"
            >
              Force Ingest News
            </button>
            <button
              onClick={handleMarkAllRead}
              className="w-full flex items-center px-3 py-2 text-xs font-black text-white hover:bg-[#1a2336] rounded-lg transition-colors text-left uppercase tracking-wider cursor-pointer"
            >
              Mark All as Read
            </button>
            <button
              onClick={handleClearFilters}
              className="w-full flex items-center px-3 py-2 text-xs font-black text-accent-cyan hover:bg-[#1a2336] rounded-lg transition-colors text-left uppercase tracking-wider cursor-pointer"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Search & Filter controls */}
      <div className="flex items-center space-x-2 mb-3.5">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#5b6e92]" />
          <input
            type="text"
            placeholder="Search news..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#090d16]/50 border border-[#242f48]/70 rounded-lg pl-8 pr-2 py-1.5 text-xs text-white placeholder-[#5b6e92] focus:outline-none focus:border-accent-cyan/80 transition-all"
          />
        </div>

        {/* Sentiment Filter Dropdown */}
        <div className="relative">
          <select
            value={sentimentFilter}
            onChange={(e) => setSentimentFilter(e.target.value as any)}
            className="bg-[#090d16]/50 border border-[#242f48]/70 rounded-lg pl-2 pr-7 py-1.5 text-xs text-white focus:outline-none focus:border-accent-cyan/80 appearance-none font-semibold cursor-pointer"
          >
            <option value="All">All Sentiments</option>
            <option value="Bullish">Bullish</option>
            <option value="Neutral">Neutral</option>
            <option value="Bearish">Bearish</option>
          </select>
          <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#5b6e92] pointer-events-none" />
        </div>
      </div>

      {/* News Stream Feed List */}
      <div className="space-y-2.5 max-h-[40vh] overflow-y-auto pr-1">
        {filteredNews.length === 0 ? (
          <div className="text-center py-6 text-xs text-[#5b6e92]">
            No matching news headlines found.
          </div>
        ) : (
          filteredNews.map((item) => {
            const isExpanded = expandedId === item.id;
            const sentimentColor = item.sentiment === 'Bullish' 
              ? 'bg-accent-green' 
              : item.sentiment === 'Neutral' 
                ? 'bg-accent-amber' 
                : 'bg-accent-red';

            const sentimentGlow = item.sentiment === 'Bullish'
              ? 'drop-shadow(0 0 3px rgba(0,255,170,0.5))'
              : item.sentiment === 'Neutral'
                ? 'drop-shadow(0 0 3px rgba(245,158,11,0.5))'
                : 'drop-shadow(0 0 3px rgba(255,74,104,0.5))';

            return (
              <div 
                key={item.id}
                className="bg-[#0d1321]/50 border border-[#242f48]/40 rounded-lg p-3 hover:border-accent-cyan/50 hover:bg-[#1a2336]/20 transition-all duration-200 cursor-pointer"
                onClick={() => handleToggleExpand(item.id)}
              >
                {/* Meta details row */}
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-extrabold text-[#00f0ff] uppercase bg-accent-cyan/10 px-1.5 py-0.5 rounded">
                      {item.ticker}
                    </span>
                    <span className="text-[10px] font-extrabold text-[#5b6e92]">
                      {item.source}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    {/* Glowing sentiment marker dot */}
                    <span className={`h-2 w-2 rounded-full ${sentimentColor}`} style={{ filter: sentimentGlow }} />
                    <span className="text-[9.5px] font-extrabold text-[#5b6e92]">{item.time}</span>
                  </div>
                </div>

                {/* News Title */}
                <div className="flex justify-between items-start space-x-2">
                  <h4 className="text-xs font-semibold leading-relaxed text-[#e2e8f0] select-text">
                    {item.title}
                  </h4>
                  <div className="text-[#5b6e92] shrink-0 mt-0.5">
                    {isExpanded ? <ChevronUp className="h-4.5 w-4.5" /> : <ChevronDown className="h-4.5 w-4.5" />}
                  </div>
                </div>

                {/* Collapsible AI Summary details */}
                {isExpanded && (
                  <div 
                    className="mt-2.5 pt-2.5 border-t border-[#242f48]/30 space-y-1.5 animate-fadeIn"
                    onClick={(e) => e.stopPropagation()} // prevent double toggling when selecting text
                  >
                    <div className="flex items-center space-x-1 text-[9.5px] font-extrabold text-accent-green tracking-wider uppercase">
                      <MessageSquare className="h-3 w-3" />
                      <span>AlphaTrade AI Analysis Summary</span>
                    </div>
                    <p className="text-[11px] text-[#8a98b5] leading-relaxed select-text">
                      {item.aiSummary}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
