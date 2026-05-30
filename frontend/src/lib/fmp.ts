export interface FmpQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  marketCap: number;
}

export interface FmpCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 1.5);
  }
}

class FmpService {
  private static instance: FmpService;
  private readonly baseUrl = 'https://financialmodelingprep.com/api/v3';
  private readonly apiKey = process.env.FMP_API_KEY || 'tGlk1WrG9p4lvED77hUZMqUPDt58J7nL';
  
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly defaultCacheDurationMs = 5 * 60 * 1000; // 5 minutes for history
  private readonly quoteCacheDurationMs = 15 * 1000;       // 15 seconds for real-time quotes

  private constructor() {
    console.log('[FmpService] Initialized with Financial Modeling Prep integration');
  }

  public static getInstance(): FmpService {
    if (!FmpService.instance) {
      FmpService.instance = new FmpService();
    }
    return FmpService.instance;
  }

  private getCachedData<T>(key: string, durationMs: number): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    const isExpired = Date.now() - cached.timestamp > durationMs;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data as T;
  }

  private setCachedData<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  public async fetchGlobalQuote(symbol: string): Promise<FmpQuote | null> {
    const cleanSymbol = symbol.trim().toUpperCase().replace(/\//g, '');
    const cacheKey = `fmp_quote_${cleanSymbol}`;
    
    const cached = this.getCachedData<FmpQuote>(cacheKey, this.quoteCacheDurationMs);
    if (cached) {
      return cached;
    }

    try {
      const quoteData = await retryWithBackoff<FmpQuote>(
        async () => {
          const url = `${this.baseUrl}/quote/${cleanSymbol}?apikey=${this.apiKey}`;
          const response = await fetch(url);
          
          if (!response.ok) {
            throw new Error(`FMP returned HTTP ${response.status}`);
          }

          const data = (await response.json()) as any;
          if (!Array.isArray(data) || data.length === 0) {
            throw new Error(`Empty response from FMP for symbol ${cleanSymbol}`);
          }

          const rawQuote = data[0];
          return {
            symbol: String(rawQuote.symbol || cleanSymbol),
            name: String(rawQuote.name || ''),
            price: Number(rawQuote.price || 0),
            high: Number(rawQuote.dayHigh || 0),
            low: Number(rawQuote.dayLow || 0),
            volume: Number(rawQuote.volume || 0),
            change: Number(rawQuote.change || 0),
            changePercent: Number(rawQuote.changesPercentage || 0),
            marketCap: Number(rawQuote.marketCap || 0),
          };
        }
      );

      this.setCachedData(cacheKey, quoteData);
      return quoteData;
    } catch (err: any) {
      console.warn(`[FmpService] Quote fetch failed for ${cleanSymbol}: ${err.message}`);
      return null;
    }
  }

  public async fetchDailyTimeSeries(symbol: string, limit = 30): Promise<FmpCandle[] | null> {
    const cleanSymbol = symbol.trim().toUpperCase().replace(/\//g, '');
    const cacheKey = `fmp_history_${cleanSymbol}_${limit}`;

    const cached = this.getCachedData<FmpCandle[]>(cacheKey, this.defaultCacheDurationMs);
    if (cached) {
      return cached;
    }

    try {
      const candlesData = await retryWithBackoff<FmpCandle[]>(
        async () => {
          const url = `${this.baseUrl}/historical-price-full/${cleanSymbol}?timeseries=${limit}&apikey=${this.apiKey}`;
          const response = await fetch(url);
          
          if (!response.ok) {
            throw new Error(`FMP historical returned HTTP ${response.status}`);
          }

          const data = (await response.json()) as any;
          const rawHistory = data.historical;
          
          if (!Array.isArray(rawHistory) || rawHistory.length === 0) {
            throw new Error(`No historical series found for symbol ${cleanSymbol}`);
          }

          return rawHistory
            .slice(0, limit)
            .reverse()
            .map((c: any) => ({
              time: String(c.date),
              open: Number(c.open || 0),
              high: Number(c.high || 0),
              low: Number(c.low || 0),
              close: Number(c.close || 0),
              volume: Number(c.volume || 0),
            }));
        }
      );

      this.setCachedData(cacheKey, candlesData);
      return candlesData;
    } catch (err: any) {
      console.warn(`[FmpService] Historical fetch failed for ${cleanSymbol}: ${err.message}`);
      return null;
    }
  }
}

export const fmpService = FmpService.getInstance();
export default fmpService;
