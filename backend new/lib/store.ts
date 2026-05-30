// src/lib/store.ts
import create from 'zustand';

interface TickerData {
  symbol: string;
  price: number;
  change: number;
  percentChange: number;
  high: number;
  low: number;
  volume: number;
  sentiment: number;
  timestamp: number;
}

interface AppStore {
  // User state
  userId: string | null;
  setUserId: (id: string | null) => void;

  // Watchlist
  watchlist: string[];
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;

  // Selected ticker
  selectedTicker: string | null;
  setSelectedTicker: (symbol: string | null) => void;

  // Ticker data
  tickerData: Map<string, TickerData>;
  setTickerData: (symbol: string, data: TickerData) => void;

  // Loading states
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Chat
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  addChatMessage: (role: 'user' | 'assistant', content: string) => void;
  clearChat: () => void;
}

export const useStore = create<AppStore>((set) => ({
  userId: null,
  setUserId: (id) => set({ userId: id }),

  watchlist: ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA'],
  addToWatchlist: (symbol) =>
    set((state) => ({
      watchlist: Array.from(new Set([...state.watchlist, symbol])),
    })),
  removeFromWatchlist: (symbol) =>
    set((state) => ({
      watchlist: state.watchlist.filter((s) => s !== symbol),
    })),

  selectedTicker: 'AAPL',
  setSelectedTicker: (symbol) => set({ selectedTicker: symbol }),

  tickerData: new Map(),
  setTickerData: (symbol, data) =>
    set((state) => {
      const newMap = new Map(state.tickerData);
      newMap.set(symbol, data);
      return { tickerData: newMap };
    }),

  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),

  chatMessages: [],
  addChatMessage: (role, content) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, { role, content }],
    })),
  clearChat: () => set({ chatMessages: [] }),
}));
