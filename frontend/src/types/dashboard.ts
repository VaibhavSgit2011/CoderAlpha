import type { FieldValue, Timestamp } from 'firebase/firestore';

export interface WatchlistItem {
  ticker: string;
  name: string;
  price: number;
  change: number;
  sentiment: number; // 0-100
  sentimentLabel: 'Bullish' | 'Neutral' | 'Bearish';
}

export interface MarketIndex {
  name: string;
  value: number;
  change: number;
  trend: number[];
}

export interface AnalyticsCard {
  id: number;
  title: string;
  summary: string;
  icons: string[];
}

export interface Report {
  report_id: string;
  ticker_symbol: string;
  generated_at: FieldValue | Timestamp;
  requested_by: string; // user ID
  content: {
    strengths: string[];
    weaknesses: string[];
    catalysts: string[];
    overall_thesis: string;
  };
}

export interface UserWatchlistItem {
  id: string;
  ticker: string;
  addedAt: FieldValue | Timestamp;
}
