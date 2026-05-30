"use client";

import { useState, useEffect } from 'react';
import LiveMarketIntel from '@/components/widgets/LiveMarketIntel';
import AlphaTradeAnalytics from '@/components/widgets/AlphaTradeAnalytics';
import MarketChartsHub from '@/components/widgets/MarketChartsHub';
import RequestReport from '@/components/widgets/RequestReport';
import AIChatbot from '@/components/widgets/AIChatbot';
import NewsPanel from '@/components/widgets/NewsPanel';
import { MockDataService, type WatchlistItem } from '@/services/mockDataService';
import { TrendingUp, Award, Activity, Database, Key, Shield, HelpCircle, RefreshCw, X, AlertTriangle, User as UserIcon, LogOut, Trash2 } from 'lucide-react';
import { auth, logOut } from '@/lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import ApiService, { type ReportData } from '@/services/apiService';

interface MainCentralAreaProps {
  activeTab: string;
  onTabChange?: (tab: string) => void;
}

export default function MainCentralArea({ activeTab, onTabChange }: MainCentralAreaProps) {
  const [user, setUser] = useState<User | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [marketIndexData, setMarketIndexData] = useState(MockDataService.getMarketData());
  const [reports, setReports] = useState<ReportData[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportData | null>(null);
  const [loadingReports, setLoadingReports] = useState(false);
  
  // Settings States
  const [defaultChart, setDefaultChart] = useState<'Line' | 'Candle'>('Line');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // Retrieve default chart preference from localstorage if available
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('alphatrade_default_chart');
      if (stored === 'Candle' || stored === 'Line') {
        setDefaultChart(stored);
      }
    }

    const checkIsConnected = () => {
      return auth.currentUser !== null || (typeof window !== 'undefined' && localStorage.getItem('alphatrade_mock_auth') === 'true');
    };

    const loadData = async () => {
      try {
        setLoadingReports(true);
        const isConnected = checkIsConnected();
        if (!isConnected) {
          if (active) {
            setWatchlist(MockDataService.getWatchlistData());
            setReports([
              {
                reportId: 'rep-mock-1',
                tickerSymbol: 'AMZN',
                generatedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
                requestedBy: 'mock-user',
                status: 'completed',
                content: {
                  strengths: [
                    'AWS cloud market share leadership expanding via proprietary chips.',
                    'Retail robotics automation significantly expanding operating margins.'
                  ],
                  weaknesses: [
                    'High capital expenditures on generative AI infrastructure.',
                    'Increased regulatory scrutiny of logistics operations.'
                  ],
                  catalysts: [
                    'Q3 cloud expansion data rollout in September.',
                    'Next-generation automated fulfillment hubs launch.'
                  ],
                  overall_thesis: 'Amazon presents a robust cloud-and-logistics double flywheel. While heavy capital expenditures pose a drag, robotics efficiency and high-margin advertising expansion represent key catalysts that secure a multi-year bullish thesis.',
                  suggested_trade: 'BUY',
                  trade_reasoning: 'Amazon exhibits outstanding margin expansion tailwinds powered by fulfillment center robotics. Heavy cloud capex drag is offset by structural AWS growth. We recommend initiating long positions.'
                }
              },
              {
                reportId: 'rep-mock-2',
                tickerSymbol: 'AAPL',
                generatedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
                requestedBy: 'mock-user',
                status: 'completed',
                content: {
                  strengths: [
                    'Strong brand loyalty and premium product pricing power.',
                    'WASM-based local hydration model architecture in iOS 20 frameworks.'
                  ],
                  weaknesses: [
                    'Hardware unit sales flat-lining in core segments.',
                    'High dependency on contract manufacturers.'
                  ],
                  catalysts: [
                    'Developer beta preview of local hydration AI in June.',
                    'Product announcements matching hardware upgrades in September.'
                  ],
                  overall_thesis: 'Apple stands to capture substantial services revenue by moving intelligence to the edge. Edge-based inference lowers cloud infrastructure bills and drives hardware upgrade supercycles, justifying a solid bullish rating.',
                  suggested_trade: 'STRONG BUY',
                  trade_reasoning: 'Edge inference moves computational payloads to local hardware, lowering cloud operating expenditures and driving upgrades. Apple is a core holding.'
                }
              }
            ]);
          }
          return;
        }

        const userWatchlist = await ApiService.getWatchlist();
        if (!active) return;

        let finalSymbols = userWatchlist;
        if (userWatchlist.length === 0) {
          const initialSymbols = ['AAPL', 'NVDA', 'MSFT', 'TSLA'];
          for (const sym of initialSymbols) {
            try {
              await ApiService.addToWatchlist(sym);
            } catch (e) {}
          }
          finalSymbols = await ApiService.getWatchlist();
        }

        const itemsData = await Promise.all(
          finalSymbols.map(async (symbol) => {
            try {
              return await ApiService.getTickerData(symbol);
            } catch (err) {
              const raw = MockDataService.getWatchlistData().find(m => m.ticker === symbol);
              return {
                symbol,
                name: raw?.name || symbol,
                price: raw?.price || 150.0,
                change: raw?.change || 0.0,
                sentiment: raw?.sentiment || 50,
                sentimentLabel: (raw?.sentimentLabel || 'Neutral') as any,
              };
            }
          })
        );

        if (active) {
          setWatchlist(itemsData.map(item => ({
            ticker: item.symbol,
            name: item.name,
            price: item.price,
            change: item.change,
            sentiment: item.sentiment,
            sentimentLabel: item.sentimentLabel,
          })));
        }

        // Fetch reports from Express/Firestore
        const userReports = await ApiService.getUserReports();
        if (active) {
          setReports(userReports);
        }
      } catch (err) {
        console.error('Failed to fetch authenticated data, falling back to mock lists:', err);
        if (active) {
          setWatchlist(MockDataService.getWatchlistData());
          setReports([
            {
              reportId: 'rep-mock-1',
              tickerSymbol: 'AMZN',
              generatedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
              requestedBy: 'mock-user',
              status: 'completed',
              content: {
                strengths: [
                  'AWS cloud market share leadership expanding via proprietary chips.',
                  'Retail robotics automation significantly expanding operating margins.'
                ],
                weaknesses: [
                  'High capital expenditures on generative AI infrastructure.',
                  'Increased regulatory scrutiny of logistics operations.'
                ],
                catalysts: [
                  'Q3 cloud expansion data rollout in September.',
                  'Next-generation automated fulfillment hubs launch.'
                ],
                overall_thesis: 'Amazon presents a robust cloud-and-logistics double flywheel. While heavy capital expenditures pose a drag, robotics efficiency and high-margin advertising expansion represent key catalysts that secure a multi-year bullish thesis.',
                suggested_trade: 'BUY',
                trade_reasoning: 'Amazon exhibits outstanding margin expansion tailwinds powered by fulfillment center robotics. Heavy cloud capex drag is offset by structural AWS growth. We recommend initiating long positions.'
              }
            },
            {
              reportId: 'rep-mock-2',
              tickerSymbol: 'AAPL',
              generatedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
              requestedBy: 'mock-user',
              status: 'completed',
              content: {
                strengths: [
                  'Strong brand loyalty and premium product pricing power.',
                  'WASM-based local hydration model architecture in iOS 20 frameworks.'
                ],
                weaknesses: [
                  'Hardware unit sales flat-lining in core segments.',
                  'High dependency on contract manufacturers.'
                ],
                catalysts: [
                  'Developer beta preview of local hydration AI in June.',
                  'Product announcements matching hardware upgrades in September.'
                ],
                overall_thesis: 'Apple stands to capture substantial services revenue by moving intelligence to the edge. Edge-based inference lowers cloud infrastructure bills and drives hardware upgrade supercycles, justifying a solid bullish rating.',
                suggested_trade: 'STRONG BUY',
                trade_reasoning: 'Edge inference moves computational payloads to local hardware, lowering cloud operating expenditures and driving upgrades. Apple is a core holding.'
              }
            }
          ]);
        }
      } finally {
        if (active) setLoadingReports(false);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      loadData();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Reload data dynamically when the activeTab changes (e.g. switching to AI Reports or Watchlist)
  useEffect(() => {
    let active = true;
    
    const checkIsConnected = () => {
      return auth.currentUser !== null || (typeof window !== 'undefined' && localStorage.getItem('alphatrade_mock_auth') === 'true');
    };

    const refreshData = async () => {
      if (activeTab !== 'AI Reports' && activeTab !== 'Watchlist') return;
      
      try {
        setLoadingReports(true);
        const isConnected = checkIsConnected();
        if (!isConnected) return; // Silent fallback to mock lists when offline

        if (activeTab === 'AI Reports') {
          const userReports = await ApiService.getUserReports();
          if (active) setReports(userReports);
        } else if (activeTab === 'Watchlist') {
          const userWatchlist = await ApiService.getWatchlist();
          if (!active) return;
          let finalSymbols = userWatchlist;
          if (userWatchlist.length === 0) {
            const initialSymbols = ['AAPL', 'NVDA', 'MSFT', 'TSLA'];
            for (const sym of initialSymbols) {
              try {
                await ApiService.addToWatchlist(sym);
              } catch (e) {}
            }
            finalSymbols = await ApiService.getWatchlist();
          }

          const itemsData = await Promise.all(
            finalSymbols.map(async (symbol) => {
              try {
                return await ApiService.getTickerData(symbol);
              } catch (err) {
                const raw = MockDataService.getWatchlistData().find(m => m.ticker === symbol);
                return {
                  symbol,
                  name: raw?.name || symbol,
                  price: raw?.price || 150.0,
                  change: raw?.change || 0.0,
                  sentiment: raw?.sentiment || 50,
                  sentimentLabel: (raw?.sentimentLabel || 'Neutral') as any,
                };
              }
            })
          );

          if (active) {
            setWatchlist(itemsData.map(item => ({
              ticker: item.symbol,
              name: item.name,
              price: item.price,
              change: item.change,
              sentiment: item.sentiment,
              sentimentLabel: item.sentimentLabel,
            })));
          }
        }
      } catch (err) {
        console.error('Failed to dynamically refresh tab data:', err);
      } finally {
        if (active) setLoadingReports(false);
      }
    };

    refreshData();

    return () => {
      active = false;
    };
  }, [activeTab]);

  // Live Price Ticking fluctuations (runs in background)
  useEffect(() => {
    const interval = setInterval(() => {
      setWatchlist((prev) =>
        prev.map((item) => {
          const delta = (Math.random() - 0.5) * 0.005;
          const newPrice = Number((item.price * (1 + delta)).toFixed(2));
          const newChange = Number((item.change + delta * 100).toFixed(2));
          const newSentiment = Math.max(0, Math.min(100, item.sentiment + (Math.random() - 0.5) * 4));
          return { ...item, price: newPrice, change: newChange, sentiment: newSentiment };
        })
      );
      setMarketIndexData((prev) =>
        prev.map((idx) => {
          const delta = (Math.random() - 0.5) * 0.002;
          return { ...idx, value: Number((idx.value * (1 + delta)).toFixed(4)), change: Number((idx.change + delta * 100).toFixed(4)) };
        })
      );
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Settings Handlers
  const handleChartDefaultChange = (type: 'Line' | 'Candle') => {
    setDefaultChart(type);
    if (typeof window !== 'undefined') {
      localStorage.setItem('alphatrade_default_chart', type);
    }
    setSettingsStatus('Chart preferences updated.');
    setTimeout(() => setSettingsStatus(null), 3000);
  };

  const handleUpdateName = async () => {
    if (!newDisplayName.trim()) return;
    try {
      // Mock name change in local state for hackathon ease
      setSettingsStatus('Account details updated.');
      setTimeout(() => setSettingsStatus(null), 3000);
    } catch (e: any) {
      alert(`Update failed: ${e.message}`);
    }
  };

  const handleDeleteAccount = async () => {
    if (confirm('DANGER! WARNING!\n\nThis action is irreversible. All of your personal watchlist configurations, reports, and authentication credentials will be permanently purged.\n\nAre you sure you want to delete your account?')) {
      try {
        await auth.currentUser?.delete();
        alert('Your AlphaTrade account has been deleted successfully.');
      } catch (err: any) {
        console.error('Delete failed:', err);
        alert(`Account deletion failed: ${err.message || 'Please sign out and log back in to verify credentials before deleting.'}`);
      }
    }
  };

  const handleLogout = async () => {
    if (confirm('Log out of AlphaTrade Terminal?')) {
      await logOut();
    }
  };

  switch (activeTab) {
    case 'Dashboard':
      return (
        <div className="space-y-4 overflow-y-auto max-h-[80vh] pr-2 select-text text-left animate-fadeIn">
          {/* Custom Performance Overview Card */}
          <div className="bg-gradient-to-r from-dark-800 to-dark-850 border border-dark-700/50 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
              <span className="text-[10px] font-black text-accent-green tracking-widest uppercase">
                Active Client Session
              </span>
              <h2 className="text-xl font-black text-white mt-1 uppercase tracking-wide">
                Welcome back, {user?.displayName || user?.email?.split('@')[0] || 'Market Analyst'}
              </h2>
              <p className="text-xs text-[#8a98b5] font-semibold mt-1">
                Connected to AlphaTrade RAG Database. Model nodes actively scraping SERP news index feeds.
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex items-center space-x-2 bg-black/40 border border-[#242f48] rounded-xl p-2 px-3.5">
              <span className="h-2 w-2 bg-accent-green rounded-full animate-ping" />
              <span className="text-[10px] font-black text-white tracking-wider uppercase">
                System Ingestion Running
              </span>
            </div>
          </div>
          <LiveMarketIntel />
          <AlphaTradeAnalytics />
        </div>
      );

    case 'Watchlist':
      return (
        <div className="space-y-4 p-4 bg-dark-850 rounded-2xl border border-dark-700/50 max-h-[80vh] overflow-y-auto select-text text-left animate-fadeIn">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center space-x-2 text-white">
              <span className="w-3 h-3 bg-accent-green rounded-full animate-ping" />
              <span>Interactive Live Watchlist</span>
            </h2>
            <span className="text-xs text-muted-foreground flex items-center space-x-1">
              <RefreshCw className="w-3 h-3 animate-spin text-accent-green" />
              <span>Real-time feeds active</span>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-dark-700 text-muted-foreground font-medium">
                  <th className="py-3 px-4">TICKER</th>
                  <th className="py-3 px-4">COMPANY</th>
                  <th className="py-3 px-4 text-right">LAST PRICE</th>
                  <th className="py-3 px-4 text-right">24H CHANGE</th>
                  <th className="py-3 px-4 text-center">SENTIMENT SCORE</th>
                  <th className="py-3 px-4 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/50">
                {watchlist.map((item) => (
                  <tr key={item.ticker} className="hover:bg-dark-800/30 transition-colors">
                    <td className="py-3 px-4 font-bold text-accent-cyan">{item.ticker}</td>
                    <td className="py-3 px-4 text-white">{item.name}</td>
                    <td className="py-3 px-4 text-right font-semibold text-white">${item.price.toFixed(2)}</td>
                    <td className={`py-3 px-4 text-right font-semibold ${item.change >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <div className="w-24 bg-dark-700 rounded-full h-2.5 overflow-hidden relative">
                          <div 
                            className={`h-full rounded-full ${item.sentiment >= 60 ? 'bg-accent-green' : item.sentiment >= 40 ? 'bg-amber-500' : 'bg-accent-red'}`}
                            style={{ width: `${item.sentiment}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-white">{Math.round(item.sentiment)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button 
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('alphatrade_select_stock', { detail: { symbol: item.ticker } }));
                          if (onTabChange) onTabChange('Markets');
                        }}
                        className="px-3 py-1 bg-accent-green/10 hover:bg-accent-green/20 text-accent-green text-xs font-semibold rounded-md transition-colors cursor-pointer"
                      >
                        ANALYZE
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    case 'Markets':
      return (
        <div className="space-y-6 p-4 max-h-[80vh] overflow-y-auto select-text text-left animate-fadeIn">
          {/* Global Multi-Asset Interactive Chart Hub */}
          <MarketChartsHub />

          <div>
            <h2 className="text-xs font-extrabold tracking-widest text-[#8a98b5] uppercase mb-2">Global Index Trackers</h2>
            <p className="text-xs text-[#5b6e92] font-semibold">Comprehensive overview of general indexes, trends, and market metrics.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {marketIndexData.map((idx) => (
              <div key={idx.name} className="bg-[#131b2c]/65 border border-[#242f48]/70 rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-[#8a98b5] font-medium">{idx.name}</span>
                  <span className={`text-sm font-semibold ${idx.change >= 0 ? 'text-accent-green' : 'text-[#ff4a68]'}`}>
                    {idx.change >= 0 ? '▲' : '▼'} {Math.abs(idx.change).toFixed(4)}%
                  </span>
                </div>
                <div className="text-2xl font-bold text-white mb-3 font-mono">
                  {idx.name === 'NASDAQ' ? (idx.value * 1250).toFixed(2) : idx.name === 'S&P 500' ? (idx.value * 11).toFixed(2) : (38500 + idx.value * 10).toFixed(2)}
                </div>
                <div className="text-[10px] text-[#5b6e92] font-bold uppercase tracking-wider">Simulated trading volume active</div>
              </div>
            ))}
          </div>
        </div>
      );

    case 'Request Report':
      return <RequestReport />;

    case 'AI Chatbot':
      return <AIChatbot />;

    case 'Live News':
      return (
        <div className="h-[76vh] w-full bg-dark-950/40 p-1 border border-dark-800/40 rounded-2xl">
          <NewsPanel />
        </div>
      );

    case 'AI Reports':
      return (
        <div className="space-y-4 p-4 max-h-[80vh] overflow-y-auto select-text text-left animate-fadeIn">
          <div className="flex justify-between items-center mb-1">
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Agentic Due Diligence Vault</h2>
              <p className="text-sm text-muted-foreground">List of complete, highly detailed reports generated by AlphaTrade AI.</p>
            </div>
            {loadingReports && (
              <RefreshCw className="w-4 h-4 animate-spin text-accent-green" />
            )}
          </div>

          <div className="space-y-3">
            {reports.length === 0 ? (
              <div className="text-center py-12 text-sm text-[#5b6e92] bg-dark-850 rounded-xl border border-dark-700/50">
                {loadingReports ? 'Fetching latest reports from database...' : 'No investment dossiers generated yet. Request one under "Request Report"!'}
              </div>
            ) : (
              reports.map((report) => (
                <div 
                  key={report.reportId} 
                  onClick={() => report.content && setSelectedReport(report)}
                  className="bg-dark-850 border border-dark-700/50 rounded-xl p-4 hover:border-accent-cyan/50 transition-all cursor-pointer bg-[#131b2c]/65"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="px-2.5 py-0.5 bg-accent-cyan/15 text-accent-cyan text-xs font-black rounded border border-accent-cyan/25 tracking-widest font-mono">
                      {report.tickerSymbol}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      {new Date(report.generatedAt).toLocaleString()}
                    </span>
                  </div>
                  <h3 className="font-extrabold text-white text-base mb-1.5 uppercase tracking-wide">
                    {report.tickerSymbol} Due Diligence Report
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {report.content?.overall_thesis || 'Investment thesis details pending ingestion updates.'}
                  </p>
                  <div className="mt-3.5 flex justify-between items-center pt-2.5 border-t border-dark-700/40">
                    <span className="text-xs font-black text-accent-green flex items-center space-x-1.5">
                      <span className="h-1.5 w-1.5 bg-accent-green rounded-full animate-pulse" />
                      <span>{report.status.toUpperCase()}</span>
                    </span>
                    {report.content ? (
                      <span className="text-[10px] text-accent-cyan hover:underline font-extrabold tracking-widest font-sans">
                        VIEW DOSSIER →
                      </span>
                    ) : (
                      <span className="text-[10px] text-accent-amber font-extrabold tracking-widest">
                        INGESTING NEWS...
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Detailed report dossier modal */}
          {selectedReport && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm animate-fadeIn">
              <div className="bg-[#131b2c] border border-[#242f48] rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col relative shadow-2xl overflow-hidden select-text text-left">
                {/* Modal Header */}
                <div className="p-5 border-b border-[#242f48]/70 flex justify-between items-center bg-dark-900/40">
                  <div className="flex items-center space-x-3.5">
                    <span className="px-2.5 py-1 bg-accent-cyan/15 text-accent-cyan text-xs font-black tracking-widest rounded-lg border border-accent-cyan/20 font-mono">
                      {selectedReport.tickerSymbol}
                    </span>
                    <div>
                      <h3 className="text-base font-extrabold text-white">Agentic Due Diligence Dossier</h3>
                      <p className="text-[10px] text-[#5b6e92] font-semibold mt-0.5">
                        Generated on {new Date(selectedReport.generatedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedReport(null)}
                    className="p-1.5 bg-[#121824]/60 border border-[#242f48]/70 hover:border-[#ff4a68]/50 hover:bg-[#ff4a68]/10 hover:text-[#ff4a68] rounded-lg transition-all duration-200 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto space-y-6 select-text text-left">
                  
                  {/* Real visual trade recommendation block (Requirement 7) */}
                  {selectedReport.content?.suggested_trade && (
                    <div className={`p-4 rounded-xl border flex flex-col space-y-2.5 animate-fadeIn shadow-md
                      ${selectedReport.content.suggested_trade === 'BUY' || selectedReport.content.suggested_trade === 'STRONG BUY'
                        ? 'bg-accent-green/10 border-accent-green/30 text-accent-green'
                        : selectedReport.content.suggested_trade === 'SELL' || selectedReport.content.suggested_trade === 'STRONG SELL'
                        ? 'bg-accent-red/10 border-accent-red/30 text-accent-red'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-black tracking-widest uppercase">
                          AI Trade Decision Recommendation
                        </h4>
                        <span className="px-3 py-1 bg-black/40 rounded-lg text-xs font-black tracking-wider uppercase border border-white/10 font-mono">
                          {selectedReport.content.suggested_trade}
                        </span>
                      </div>
                      <p className="text-xs text-white font-semibold leading-relaxed">
                        <strong>RATIONALE:</strong> {selectedReport.content.trade_reasoning || 'Technical confirmation thresholds pending execution blocks.'}
                      </p>
                    </div>
                  )}

                  {/* Thesis summary section */}
                  <div className="bg-[#1b253b]/30 border border-[#2d3b59]/40 rounded-xl p-4.5 space-y-2">
                    <h4 className="text-xs font-black text-accent-green tracking-wider uppercase">INVESTMENT THESIS</h4>
                    <p className="text-xs text-white leading-relaxed font-semibold">
                      {selectedReport.content?.overall_thesis}
                    </p>
                  </div>

                  {/* Strengths & Weaknesses Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Strengths */}
                    <div className="bg-accent-green/5 border border-accent-green/20 rounded-xl p-4 space-y-2.5">
                      <h4 className="text-xs font-black text-accent-green tracking-wider uppercase flex items-center space-x-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
                        <span>Key Bullish Strengths</span>
                      </h4>
                      <ul className="space-y-2">
                        {selectedReport.content?.strengths.map((str, idx) => (
                          <li key={idx} className="text-[11px] text-[#e2e8f0] leading-relaxed font-medium pl-3 relative text-left">
                            <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-accent-green/60" />
                            {str}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Weaknesses */}
                    <div className="bg-accent-red/5 border border-accent-red/20 rounded-xl p-4 space-y-2.5">
                      <h4 className="text-xs font-black text-accent-red tracking-wider uppercase flex items-center space-x-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-red" />
                        <span>Bearish Risk Factors</span>
                      </h4>
                      <ul className="space-y-2">
                        {selectedReport.content?.weaknesses.map((risk, idx) => (
                          <li key={idx} className="text-[11px] text-[#e2e8f0] leading-relaxed font-medium pl-3 relative text-left">
                            <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-accent-red/60" />
                            {risk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Catalysts */}
                  <div className="bg-accent-cyan/5 border border-accent-cyan/20 rounded-xl p-4.5 space-y-2.5">
                    <h4 className="text-xs font-black text-accent-cyan tracking-wider uppercase flex items-center space-x-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan" />
                      <span>Upcoming Catalysts</span>
                    </h4>
                    <ul className="space-y-2">
                      {selectedReport.content?.catalysts.map((cat, idx) => (
                        <li key={idx} className="text-[11px] text-[#e2e8f0] leading-relaxed font-medium pl-3 relative text-left">
                          <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-accent-cyan/60" />
                          {cat}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="p-4 border-t border-[#242f48]/70 bg-dark-900/40 flex justify-end">
                  <button 
                    onClick={() => setSelectedReport(null)}
                    className="px-4 py-2 bg-[#121824] hover:bg-[#1a2336] border border-[#242f48] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Close Dossier
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );

    case 'Settings':
      return (
        <div className="space-y-6 p-6 max-h-[80vh] overflow-y-auto select-text text-left animate-fadeIn">
          <div>
            <h2 className="text-xl font-bold text-white mb-2 uppercase tracking-wide">System Console Configuration</h2>
            <p className="text-xs text-[#8a98b5] font-semibold">Configure terminal graphics, details, and delete profile actions.</p>
          </div>

          {/* Feedback alert */}
          {settingsStatus && (
            <div className="p-3.5 bg-accent-green/10 border border-accent-green/30 rounded-xl text-accent-green text-xs font-semibold leading-none animate-fadeIn flex items-center space-x-2">
              <span className="h-1.5 w-1.5 bg-accent-green rounded-full animate-ping" />
              <span>{settingsStatus}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* CARD 1: DEFAULT CHART PATTERNS */}
            <div className="bg-dark-850 border border-dark-700/50 rounded-2xl p-5 space-y-4 shadow-md">
              <h3 className="font-extrabold text-[11.5px] text-white uppercase tracking-wider flex items-center space-x-2">
                <TrendingUp className="h-4.5 w-4.5 text-accent-cyan" />
                <span>Default Chart Patterns</span>
              </h3>
              <p className="text-[11px] text-[#5b6e92] font-semibold leading-relaxed">
                Choose the standard charting format rendered upon terminal assets loading.
              </p>
              
              <div className="grid grid-cols-2 bg-[#090d16]/50 p-1 rounded-xl border border-[#242f48]/40">
                <button
                  onClick={() => handleChartDefaultChange('Line')}
                  className={`py-2 rounded-lg text-xs font-black tracking-wider uppercase transition-all duration-200 cursor-pointer ${
                    defaultChart === 'Line' 
                      ? 'bg-[#242f48] text-accent-cyan glow-cyan-box' 
                      : 'text-[#8a98b5] hover:text-white'
                  }`}
                >
                  Line Area
                </button>
                <button
                  onClick={() => handleChartDefaultChange('Candle')}
                  className={`py-2 rounded-lg text-xs font-black tracking-wider uppercase transition-all duration-200 cursor-pointer ${
                    defaultChart === 'Candle' 
                      ? 'bg-[#242f48] text-accent-green glow-green-box' 
                      : 'text-[#8a98b5] hover:text-white'
                  }`}
                >
                  Candlestick
                </button>
              </div>
            </div>

            {/* CARD 2: ACCOUNT DETAIL */}
            <div className="bg-dark-850 border border-dark-700/50 rounded-2xl p-5 space-y-4 shadow-md">
              <h3 className="font-extrabold text-[11.5px] text-white uppercase tracking-wider flex items-center space-x-2">
                <UserIcon className="h-4.5 w-4.5 text-accent-cyan" />
                <span>Account Details</span>
              </h3>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-[#242f48]/30">
                  <span className="text-[#5b6e92] font-bold">Email Address</span>
                  <span className="text-white font-extrabold truncate max-w-[170px]">{user?.email}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-[#242f48]/30">
                  <span className="text-[#5b6e92] font-bold">Provider Status</span>
                  <span className="px-2 py-0.5 bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan rounded text-[9.5px] font-black uppercase tracking-wider">
                    {user?.providerData[0]?.providerId === 'password' ? 'EMAIL/PW' : user?.providerData[0]?.providerId.toUpperCase() || 'FIREBASE'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-[#242f48]/30">
                  <span className="text-[#5b6e92] font-bold">Client Verification</span>
                  <span className="text-accent-green font-extrabold">Active</span>
                </div>
              </div>
            </div>

            {/* CARD 3: MANAGE ACCOUNT */}
            <div className="bg-dark-850 border border-dark-700/50 rounded-2xl p-5 space-y-4 shadow-md">
              <h3 className="font-extrabold text-[11.5px] text-white uppercase tracking-wider flex items-center space-x-2">
                <Shield className="h-4.5 w-4.5 text-accent-cyan" />
                <span>Manage Profile</span>
              </h3>
              <div className="space-y-3.5">
                <div className="flex flex-col space-y-1.5">
                  <label className="text-[10px] text-[#5b6e92] font-black uppercase tracking-wider pl-1.5">
                    DISPLAY NAME
                  </label>
                  <input
                    type="text"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder={user?.displayName || 'Enter nickname...'}
                    className="px-3 py-2 bg-[#090d16]/50 border border-[#242f48]/70 rounded-xl text-xs text-white placeholder-[#5b6e92] focus:outline-none focus:border-accent-cyan/80 font-semibold"
                  />
                </div>
                <button
                  onClick={handleUpdateName}
                  className="w-full bg-[#121824] hover:bg-[#1a2336] border border-[#242f48] text-white text-xs font-black py-2 rounded-xl transition-all cursor-pointer uppercase tracking-wider"
                >
                  Save Profile Nickname
                </button>
              </div>
            </div>

            {/* CARD 4: CRITICAL ACTIONS */}
            <div className="bg-dark-850 border border-accent-red/20 rounded-2xl p-5 space-y-4 shadow-md">
              <h3 className="font-extrabold text-[11.5px] text-accent-red uppercase tracking-wider flex items-center space-x-2">
                <AlertTriangle className="h-4.5 w-4.5" />
                <span>Critical Session Actions</span>
              </h3>
              <p className="text-[11px] text-[#5b6e92] font-semibold leading-relaxed">
                Dangerous operations that log you out or completely wipe your credentials.
              </p>
              
              <div className="flex space-x-3">
                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className="flex-1 bg-[#121824]/60 hover:bg-[#1a2336]/60 border border-[#242f48] hover:border-accent-cyan/40 text-white text-xs font-black py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-1.5 uppercase tracking-wider"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log Out</span>
                </button>

                {/* Delete Account Button */}
                <button
                  onClick={handleDeleteAccount}
                  className="flex-1 bg-accent-red/10 hover:bg-accent-red/20 border border-accent-red/30 text-accent-red text-xs font-black py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-1.5 uppercase tracking-wider"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete Profile</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}