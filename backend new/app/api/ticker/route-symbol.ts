// src/app/api/ticker/[symbol]/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Mock market data (in production, integrate with TradingView API or similar)
const mockTickerData: Record<string, any> = {
  AAPL: {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 189.95,
    change: 2.45,
    percentChange: 1.31,
    high: 191.50,
    low: 187.20,
    open: 187.80,
    close: 189.95,
    volume: 52_840_000,
    marketCap: 2.95e12,
    pe: 28.5,
    eps: 6.67,
    sentiment: 75,
    timestamp: new Date().toISOString(),
  },
  GOOGL: {
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    price: 140.23,
    change: 1.82,
    percentChange: 1.31,
    high: 142.10,
    low: 138.50,
    open: 138.75,
    close: 140.23,
    volume: 18_320_000,
    marketCap: 1.8e12,
    pe: 24.2,
    eps: 5.79,
    sentiment: 72,
    timestamp: new Date().toISOString(),
  },
  MSFT: {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    price: 378.91,
    change: 3.15,
    percentChange: 0.84,
    high: 381.20,
    low: 375.80,
    open: 376.20,
    close: 378.91,
    volume: 15_620_000,
    marketCap: 2.82e12,
    pe: 32.1,
    eps: 11.80,
    sentiment: 78,
    timestamp: new Date().toISOString(),
  },
  TSLA: {
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    price: 242.84,
    change: -5.23,
    percentChange: -2.10,
    high: 249.50,
    low: 240.30,
    open: 247.80,
    close: 242.84,
    volume: 98_540_000,
    marketCap: 768e9,
    pe: 68.5,
    eps: 3.54,
    sentiment: 58,
    timestamp: new Date().toISOString(),
  },
  NVDA: {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    price: 875.28,
    change: 12.45,
    percentChange: 1.44,
    high: 879.50,
    low: 862.80,
    open: 865.20,
    close: 875.28,
    volume: 32_840_000,
    marketCap: 2.15e12,
    pe: 61.2,
    eps: 14.32,
    sentiment: 82,
    timestamp: new Date().toISOString(),
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const symbol = params.symbol.toUpperCase();

    // Return mock data or integrate with real API
    const data = mockTickerData[symbol] || {
      symbol,
      error: 'Ticker not found',
    };

    // Add some randomization for demonstration
    if (data.symbol) {
      const randomChange = (Math.random() - 0.5) * 5;
      data.change = Number((Math.random() - 0.5) * 10).toFixed(2);
      data.percentChange = Number(
        ((data.change / data.price) * 100).toFixed(2)
      );
      data.high = Number((data.price * 1.02).toFixed(2));
      data.low = Number((data.price * 0.98).toFixed(2));
      data.volume = Math.floor(Math.random() * 100_000_000);
    }

    return NextResponse.json({
      success: true,
      data,
      source: 'mock-api', // Change to 'tradingview' when integrated
    });
  } catch (error) {
    console.error('Ticker API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch ticker data' },
      { status: 500 }
    );
  }
}
