import type { WatchlistItem, MarketIndex, AnalyticsCard } from '@/types/dashboard';

// Mock data generation functions
export class MockDataService {
  private static tickers: WatchlistItem[] = [
    {
      ticker: 'AAPL',
      name: 'Apple',
      price: 198.50,
      change: -1.30,
      sentiment: 78,
      sentimentLabel: 'Bullish',
    },
    {
      ticker: 'NVDA',
      name: 'Nvidia',
      price: 135.40,
      change: 3.25,
      sentiment: 85,
      sentimentLabel: 'Bullish',
    },
    {
      ticker: 'MSFT',
      name: 'Microsoft',
      price: 425.30,
      change: 1.80,
      sentiment: 72,
      sentimentLabel: 'Bullish',
    },
    {
      ticker: 'TSLA',
      name: 'Tesla',
      price: 178.60,
      change: -2.45,
      sentiment: 42,
      sentimentLabel: 'Neutral',
    },
    {
      ticker: 'AMZN',
      name: 'Amazon',
      price: 185.20,
      change: 5.40,
      sentiment: 68,
      sentimentLabel: 'Bullish',
    },
    {
      ticker: 'GOOGL',
      name: 'Google',
      price: 165.30,
      change: 2.10,
      sentiment: 75,
      sentimentLabel: 'Bullish',
    },
    {
      ticker: 'META',
      name: 'Meta',
      price: 485.90,
      change: -3.20,
      sentiment: 55,
      sentimentLabel: 'Neutral',
    },
    {
      ticker: 'NFLX',
      name: 'Netflix',
      price: 685.40,
      change: 12.80,
      sentiment: 82,
      sentimentLabel: 'Bullish',
    }
  ];

  private static marketIndices: MarketIndex[] = [
    { name: 'S&P 500', value: 456.5, change: 0.4565, trend: Array(30).fill(0).map(() => Math.random() * 100) },
    { name: 'NASDAQ', value: 13.93, change: 0.1393, trend: Array(30).fill(0).map(() => Math.random() * 100) },
    { name: 'DJI', value: -3.39, change: -0.0339, trend: Array(30).fill(0).map(() => Math.random() * 100) }
  ];

  private static analyticsCards: AnalyticsCard[] = [
    {
      id: 1,
      title: 'Tech Sector Resilience',
      summary: 'AI predicts sustained growth in semiconductor and cloud computing sectors based on recent earnings calls and patent filings.',
      icons: ['TrendingUp', 'Zap', 'Microchip'],
    },
    {
      id: 2,
      title: 'NVDA Earnings Impact',
      summary: 'Detailed analysis ready: NVIDIA\'s Q3 earnings exceeded expectations by 23%, driven by AI data center demand.',
      icons: ['ChartLine', 'DollarSign', 'Target'],
    },
    {
      id: 3,
      title: 'Market Volatility Alert',
      summary: 'Increased correlation observed between tech stocks and crypto markets suggesting potential sector rotation.',
      icons: ['Zap', 'GitBranch', 'RefreshCw'],
    },
    {
      id: 4,
      title: 'Fed Policy Outlook',
      summary: 'Market pricing in 75bps cut by December as inflation data continues to cool faster than expected.',
      icons: ['Building', 'Percent', 'ArrowDown'],
    },
    {
      id: 5,
      title: 'Retail Earnings Preview',
      summary: 'Upcoming retail earnings show mixed signals with e-commerce growth offsetting brick-and-mortar declines.',
      icons: ['ShoppingCart', 'Home', 'TrendingUp'],
    },
    {
      id: 6,
      title: 'Energy Transition',
      summary: 'Renewable energy investments surging as corporations commit to net-zero targets ahead of schedule.',
      icons: ['Sun', 'Wind', 'TrendingUp'],
    }
  ];

  static getWatchlistData(): WatchlistItem[] {
    return [...this.tickers];
  }

  static getMarketData(): MarketIndex[] {
    return [...this.marketIndices];
  }

  static getAnalyticsData(): AnalyticsCard[] {
    return [...this.analyticsCards];
  }

  static simulateRealTimeUpdates() {
    // Simulate price fluctuations
    this.tickers = this.tickers.map(ticker => {
      const newPrice = Number((ticker.price * (1 + (Math.random() - 0.5) * 0.03)).toFixed(2));
      const newChange = Number(((newPrice / ticker.price - 1) * 100).toFixed(2));
      const newSentiment = Math.max(0, Math.min(100, ticker.sentiment + (Math.random() - 0.5) * 15));
      return {
        ...ticker,
        price: newPrice,
        change: newChange,
        sentiment: newSentiment,
        sentimentLabel: newSentiment >= 60 ? 'Bullish' as const : newSentiment >= 40 ? 'Neutral' as const : 'Bearish' as const,
      };
    });

    // Simulate market index fluctuations
    this.marketIndices = this.marketIndices.map(index => {
      const newValue = Number((index.value * (1 + (Math.random() - 0.5) * 0.02)).toFixed(4));
      const newChange = Number(((newValue / index.value - 1) * 100).toFixed(4));
      return {
        ...index,
        value: newValue,
        change: newChange,
        trend: [...index.trend.slice(1), index.trend[index.trend.length - 1] + (Math.random() - 0.5) * 3],
      };
    });
  }

  static getRandomNews(ticker: string): Array<{ title: string; url: string; ai_summary: string; source: string }> {
    const sources = ['Bloomberg', 'Reuters', 'CNBC', 'MarketWatch', 'Yahoo Finance', 'Seeking Alpha'];
    const sentiments = ['positive', 'negative', 'neutral'];
    
    return Array.from({ length: 3 }, (_, i) => ({
      title: `${ticker} shows ${sentiments[Math.floor(Math.random() * sentiments.length)]} momentum amid market volatility`,
      url: `https://example.com/news/${ticker.toLowerCase()}-${i}`,
      ai_summary: `${ticker} stock is experiencing ${sentiments[Math.floor(Math.random() * sentiments.length)]} sentiment based on recent market analysis and trading patterns.`,
      source: sources[Math.floor(Math.random() * sources.length)]
    }));
  }
}

// Re-export types from the canonical source
export type { WatchlistItem, MarketIndex, AnalyticsCard } from '@/types/dashboard';