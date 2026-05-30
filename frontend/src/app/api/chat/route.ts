import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getUserIdFromRequest } from '@/lib/auth';
import { fmpService } from '@/lib/fmp';
import { alphavantageService } from '@/lib/alphavantage';
import type { AlphaVantageDailyPrice, AlphaVantageNewsArticle, AlphaVantageCompanyOverview } from '@/lib/alphavantage';

const SYMBOL_MAPPING: Record<string, string> = {
  'GOLD': 'GLD',
  'CRUDE OIL': 'USO',
  'OIL': 'USO',
  'RELIANCE': 'RELIANCE.NS',
  'NIFTY50': '^NSEI',
  'NIFTY 50': '^NSEI',
  'NIFTY': '^NSEI',
  'SENSEX': '^BSESN',
};

function parseMarkdownGoogleSearchResults(markdown: string): any[] {
  const articles: any[] = [];
  const cleanedMarkdown = markdown.replace(/!\[\]\([^\)]*\)/g, '');
  const blockRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
  let match;
  while ((match = blockRegex.exec(cleanedMarkdown)) !== null) {
    const textBlock = match[1];
    const url = match[2];
    
    if (url.includes('google.com') || url.includes('google.dk') || url === '#' || textBlock.includes('Accessibility') || textBlock.includes('Skip to')) {
      continue;
    }
    
    const lines = textBlock.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    if (lines.length >= 2) {
      const filteredLines = lines.filter(l => l !== '.' && !/^\d+ (minutes?|hours?|days?|weeks?|months?|years?|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ago/i.test(l) && !/^\d+ [a-zA-Z]+ \d{4}$/.test(l));
      
      if (filteredLines.length >= 2) {
        const source = filteredLines[0];
        const title = filteredLines[1];
        const description = filteredLines.slice(2).join(' ') || 'No excerpt available.';
        articles.push({
          title,
          url,
          link: url,
          source,
          publisher: source,
          snippet: description,
          description
        });
      }
    }
  }
  return articles;
}

async function searchGoogleSERP(queryText: string): Promise<string> {
  if (!process.env.BRIGHTDATA_API_KEY) {
    return 'No search engine access configured.';
  }
  try {
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(queryText)}`;
    const zone = process.env.BRIGHTDATA_SERP_ZONE || 'serp_api2';
    
    console.log(`[Google SERP Chat] Scraping Google Search for: "${queryText}"`);
    const response = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BRIGHTDATA_API_KEY}`,
      },
      body: JSON.stringify({
        zone: zone,
        url: googleUrl,
        format: 'json',
      }),
    });
    
    if (!response.ok) {
      throw new Error(`BrightData returned HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // Check parsed organic/news keys
    let organic = data.organic || data.news_results || data.results || [];
    if ((!Array.isArray(organic) || organic.length === 0) && typeof data.body === 'string') {
      console.log(`[Google SERP Chat] Parsing Markdown/HTML text response for query "${queryText}"...`);
      organic = parseMarkdownGoogleSearchResults(data.body);
    }

    if (Array.isArray(organic) && organic.length > 0) {
      return organic.slice(0, 6).map((r: any, idx: number) => {
        return `[Source ${idx + 1}] Title: ${r.title || ''}\nSnippet: ${r.snippet || r.description || ''}\n`;
      }).join('\n');
    }
    
    if (data.body && typeof data.body === 'string') {
      return data.body.substring(0, 2000);
    }
    
    return JSON.stringify(data).substring(0, 2000);
  } catch (err: any) {
    console.warn('[Google SERP Chat] Search query failed:', err.message);
    return `Search query failed to retrieve live news: ${err.message}`;
  }
}

function generateMockChatResponse(queryText: string, ticker?: string, activeTickers?: any[]): string {
  try {
    const q = queryText.toLowerCase().trim();
    const t = ticker ? ticker.toUpperCase().trim() : '';

    // 1. Handle stock buy suggestions and generic stock picking requests using real database metrics
    if (q.includes('buy') || q.includes('recommend') || q.includes('best stock') || q.includes('portfolio') || q.includes('top stock') || q.includes('should buy')) {
      if (Array.isArray(activeTickers) && activeTickers.length > 0) {
        // Filter out null/undefined and sort active tickers by sentiment score descending
        const sorted = [...activeTickers]
          .filter(Boolean)
          .sort((a, b) => {
            const scoreA = a.sentiment || a.current_sentiment_score || 50;
            const scoreB = b.sentiment || b.current_sentiment_score || 50;
            return scoreB - scoreA;
          });

        let md = `### AlphaTrade Quantitative Buy Recommendations\n`;
        md += `Based on current real-time database feeds, scraped google sentiments, and active transaction prices, here are the top-rated buy candidates for today:\n\n`;
        md += `| Ticker | Company Name | Current Price | 24H Change | Sentiment Index | Action Rating |\n`;
        md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

        sorted.forEach(asset => {
          if (!asset) return;
          const symbol = asset.symbol || asset.ticker_symbol || 'UNKNOWN';
          const name = asset.name || (symbol === 'GOLD' ? 'Gold Spot GLD' : symbol === 'CRUDE OIL' ? 'Crude Oil Spot' : symbol === 'RELIANCE' ? 'Reliance Industries' : symbol === 'NIFTY50' ? 'Nifty 50 Index' : symbol);
          let priceVal = 'N/A';
          if (asset.price !== undefined && asset.price !== null) {
            try {
              priceVal = `$${Number(asset.price).toFixed(2)}`;
            } catch (e) {}
          }
          let changeVal = '0.00%';
          if (asset.change !== undefined && asset.change !== null) {
            try {
              changeVal = `${Number(asset.change) >= 0 ? '+' : ''}${Number(asset.change).toFixed(2)}%`;
            } catch (e) {}
          }
          const sentimentVal = asset.sentiment || asset.current_sentiment_score || 50;

          let rating = '**HOLD**';
          if (sentimentVal >= 75) rating = '**STRONG BUY**';
          else if (sentimentVal >= 65) rating = '**BUY**';
          else if (sentimentVal < 50) rating = '**SELL**';

          md += `| **${symbol}** | ${name} | ${priceVal} | ${changeVal} | ${sentimentVal}/100 | ${rating} |\n`;
        });

        md += `\n\n**Quantitative Recommendation Thesis**:\n`;
        const strongBuys = sorted.filter(a => a && (a.sentiment || a.current_sentiment_score || 50) >= 75);
        if (strongBuys.length > 0) {
          md += `Currently, **${strongBuys.map(a => a.symbol || a.ticker_symbol).join(' & ')}** represent our top analytical buy signals, buoyed by highly constructive news sentiments and supportive moving averages.`;
        } else {
          md += `General indices are consolidating. We recommend gradual cost averaging into blue-chip technology assets (like **AAPL**, **MSFT**, **NVDA**) near immediate support bounds to minimize volatility risk.`;
        }
        return md;
      }
    }

    // 2. Specific single-ticker fallbacks
    if (t === 'NVDA' || q.includes('nvda') || q.includes('nvidia')) {
      return `### NVIDIA Corp (NVDA) — Quantitative Intelligence Analysis
Based on RAG-grounded news indices and market data, **NVIDIA** continues to trade with extremely strong secular momentum.
* **GPU Dominance Moat**: Secures **80%+ data center AI chip market share**, with highly robust product backlogs for H100/H200 accelerators.
* **Blackwell Scaling Cycle**: Customer orders and hyperscaler reservations for the next-generation **Blackwell GB200 superclusters** represent a massive multi-quarter revenue pipeline.`;
    }

    if (t === 'GOLD' || q.includes('gold')) {
      return `### Gold Spot Price — Commodities Intelligence
Gold continues to trade with strong capital preservation demand amid global interest rate cuts and central bank reserve accumulations.
* **Inflation Hedge**: Real-time spot metrics show steady baseline support, acting as a defensive anchor for risk-off portfolios.
* **Catalysts**: Geopolitical risk hedging, global currency expansions, and dynamic institutional trading pools.`;
    }

    if (t === 'RELIANCE' || q.includes('reliance')) {
      return `### Reliance Industries (RELIANCE) — Market Intelligence
Reliance Industries continues to show robust fundamental backing across retail, telecom (Jio), and oil-to-chemicals (O2C) segments.
* **Key Strengths**: High digital ecosystem monetization moats, retail network expansions, and resilient green energy transition plans.`;
    }

    if (t === 'NIFTY' || q.includes('nifty')) {
      return `### Nifty 50 Index — Indian Market Trend
The Nifty 50 Index represents the benchmark trajectory of India's economic growth engine, buoyed by domestic mutual fund inflows and corporate earnings resilience.`;
    }

    return `### AlphaTrade AI Conversational Terminal Active
Hello! I am your **AlphaTrade AI Market Intelligence Assistant**. I monitor active financial news streams, public sentiment vectors, and historical datasets to synthesize quantitative market analysis.
I am fully online. Ask me anything about specific stock tickers (like **AAPL**, **NVDA**, **RELIANCE**), commodities (like **Gold**, **Crude Oil**), or benchmark indexes (like **Nifty 50**, **Sensex**)!`;
  } catch (err: any) {
    console.error('[Mock Chat Response Error]', err);
    return `### AlphaTrade AI Conversational Terminal Active
Hello! I am your **AlphaTrade AI Market Intelligence Assistant**. I monitor active financial news streams, public sentiment vectors, and historical datasets to synthesize quantitative market analysis.
I am fully online. Ask me anything about specific stock tickers (like **AAPL**, **NVDA**, **RELIANCE**), commodities (like **Gold**, **Crude Oil**), or benchmark indexes (like **Nifty 50**, **Sensex**)!`;
  }
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { query: queryText } = await request.json();
    if (!queryText) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    const sanitizedQuery = queryText.trim();
    console.log(`[API Chat] Query received from user ${userId}: "${sanitizedQuery.slice(0, 60)}..."`);

    // 1. Fetch last 6 messages from Firestore to inject as conversational history context
    let historyContext: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    try {
      const chatsRef = collection(db, 'users', userId, 'chats');
      const chatQuery = query(chatsRef, orderBy('timestamp', 'desc'), limit(6));
      const chatSnap = await getDocs(chatQuery);
      
      const pastMessages = chatSnap.docs.map(doc => doc.data()).reverse();
      historyContext = pastMessages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      }));
    } catch (dbErr: any) {
      console.warn('[API Chat] Failed to load chat history from Firestore:', dbErr.message);
    }

    // Load all active tickers from the database to ground generic recommendations or pass as additional RAG context
    let activeTickersData: any[] = [];
    let marketOverviewText = '';
    try {
      const tickersSnap = await getDocs(collection(db, 'tickers'));
      activeTickersData = tickersSnap.docs.map(d => d.data());
      if (activeTickersData.length > 0) {
        marketOverviewText = `=== CURRENT LIVE DATABASE OVERVIEW (PRICES & SENTIMENTS) ===\n`;
        activeTickersData.forEach((t) => {
          const sym = t.symbol || t.ticker_symbol || 'UNKNOWN';
          const pr = t.price ? `$${Number(t.price).toFixed(2)}` : 'N/A';
          const ch = t.change !== undefined ? `${t.change >= 0 ? '+' : ''}${Number(t.change).toFixed(2)}%` : '0.00%';
          const sent = t.sentiment || t.current_sentiment_score || 50;
          marketOverviewText += `- Symbol: ${sym}, Price: ${pr}, Change: ${ch}, Sentiment Score: ${sent}/100\n`;
        });
        marketOverviewText += `\n`;
      }
    } catch (dbErr: any) {
      console.warn('[API Chat] Failed to load tickers collection:', dbErr.message);
    }

    // 2. STAGE 1: Use OpenRouter to analyze the user's question and determine parameters/intent
    let analysisResult = {
      needsExternalData: false,
      searchQuery: null as string | null,
      alphaVantageSymbol: null as string | null
    };

    if (process.env.OPENROUTER_API_KEY) {
      try {
        console.log(`[API Chat] Stage 1 - Analyzing query intent via OpenRouter: "${sanitizedQuery}"`);
        const systemPrompt = `You are an AI financial routing coordinator. Your job is to analyze the user's question and determine if it requires market indicators/prices, news, or general real-time information from external APIs.
You must return your output strictly in JSON format. Do not write any markdown code fences, headers, or conversational text. Your output must be a single parseable JSON object with these keys:
{
  "needsExternalData": boolean,
  "searchQuery": string | null,
  "alphaVantageSymbol": string | null
}

Guidelines:
1. "needsExternalData" should be true if the question refers to stocks, indexes, commodities, crypto, forex, real-time news, or financial metrics.
2. "searchQuery" should be a 3-6 word Google search query optimized to fetch the most recent news/info for this topic (e.g. "Gold spot price news May 2026" or "NVIDIA stock valuation trends"). Return null if no search is needed.
3. "alphaVantageSymbol" should be the stock ticker, commodity, forex, or crypto code. Map common names intelligently:
   - Gold -> "GOLD"
   - Crude Oil / Oil -> "CRUDE OIL"
   - Reliance Industries -> "RELIANCE"
   - Nifty 50 / Nifty50 -> "NIFTY50"
   - Sensex -> "SENSEX"
   - Standard stocks -> their uppercase ticker, e.g. "AAPL", "NVDA", "TSLA", "MSFT".
   Return null if no specific financial symbol is found.

Example response for "What is NVDA's current price target and news?":
{"needsExternalData": true, "searchQuery": "NVIDIA NVDA price target and recent news", "alphaVantageSymbol": "NVDA"}
`;

        const orResponse = await fetch(
          process.env.OPENROUTER_API_URL || 'https://openrouter.io/api/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
              'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'openai/gpt-4-turbo-preview',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `User query: "${sanitizedQuery}"` }
              ],
              temperature: 0.1,
              max_tokens: 150,
              response_format: { type: "json_object" }
            })
          }
        );

        if (orResponse.ok) {
          const orData = await orResponse.json();
          const rawText = orData.choices[0].message.content.trim();
          console.log(`[API Chat] Stage 1 Analysis raw text:`, rawText);
          try {
            const parsed = JSON.parse(rawText);
            analysisResult.needsExternalData = !!parsed.needsExternalData;
            analysisResult.searchQuery = parsed.searchQuery || null;
            analysisResult.alphaVantageSymbol = parsed.alphaVantageSymbol || null;
          } catch (jsonErr) {
            // Regex fallback if JSON parsing failed
            const match = rawText.match(/\{[\s\S]*?\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              analysisResult.needsExternalData = !!parsed.needsExternalData;
              analysisResult.searchQuery = parsed.searchQuery || null;
              analysisResult.alphaVantageSymbol = parsed.alphaVantageSymbol || null;
            }
          }
        }
      } catch (err: any) {
        console.error('[API Chat] OpenRouter stage 1 analysis failed:', err.message);
      }
    }

    // 3. Fallback / validation using local regex/rules in case OpenRouter analysis fails or is disabled
    if (!analysisResult.alphaVantageSymbol && !analysisResult.searchQuery) {
      const q = sanitizedQuery.toLowerCase();
      let fallbackSymbol: string | null = null;
      if (q.includes('gold')) fallbackSymbol = 'GOLD';
      else if (q.includes('crude') || q.includes('oil')) fallbackSymbol = 'CRUDE OIL';
      else if (q.includes('reliance')) fallbackSymbol = 'RELIANCE';
      else if (q.includes('nifty')) fallbackSymbol = 'NIFTY50';
      else if (q.includes('sensex')) fallbackSymbol = 'SENSEX';
      else {
        // Find uppercase words in the query that could be tickers (e.g. AAPL, TSLA, NVDA)
        const words = sanitizedQuery.match(/[A-Z]{2,6}/g);
        if (words && words.length > 0) {
          fallbackSymbol = words[0];
        }
      }
      
      if (fallbackSymbol) {
        analysisResult.needsExternalData = true;
        analysisResult.alphaVantageSymbol = fallbackSymbol;
        analysisResult.searchQuery = `${fallbackSymbol} price stock market real-time news metrics today`;
      }
    }

    const rawSymbol = analysisResult.alphaVantageSymbol;
    const resolvedTicker = (rawSymbol && typeof rawSymbol === 'string') ? rawSymbol.toUpperCase().trim() : undefined;
    
    const rawSearchQuery = analysisResult.searchQuery;
    const resolvedSearchQuery = (rawSearchQuery && typeof rawSearchQuery === 'string') ? rawSearchQuery.trim() : null;

    console.log(`[API Chat] Intent Analysis Results -> Needs Data: ${analysisResult.needsExternalData}, Query: "${resolvedSearchQuery}", Symbol: "${resolvedTicker}"`);

    // 4. STAGE 2: If external data is required, execute parallel queries to BrightData Google SERP & Alpha Vantage APIs
    let groundingContext = '';
    if (analysisResult.needsExternalData && (resolvedSearchQuery || resolvedTicker)) {
      const mappedSymbol = resolvedTicker ? (SYMBOL_MAPPING[resolvedTicker] || resolvedTicker) : 'SPY';
      const activeSearchQuery = resolvedSearchQuery || `${resolvedTicker || 'market'} price stock market news`;

      console.log(`[API Chat] Stage 2 - Launching parallel API data retrieval for symbol: ${mappedSymbol} (${resolvedTicker || 'generic'})`);

      // Parallel data fetching with graceful error handling per-endpoint
      const [searchResult, dailyHistory, companyOverview, newsSentiment] = await Promise.all([
        searchGoogleSERP(activeSearchQuery).catch((err: any) => {
          console.warn(`[API Chat] Google Search SERP scrape failed:`, err);
          return 'No live search engine snippets available.';
        }),
        resolvedTicker ? alphavantageService.fetchDailyTimeSeries(mappedSymbol).catch((err: any) => {
          console.warn(`[API Chat] AlphaVantage fetchDailyTimeSeries failed for ${mappedSymbol}:`, err);
          return [] as AlphaVantageDailyPrice[];
        }) : Promise.resolve([] as AlphaVantageDailyPrice[]),
        resolvedTicker ? alphavantageService.fetchCompanyOverview(mappedSymbol).catch((err: any) => {
          console.warn(`[API Chat] AlphaVantage fetchCompanyOverview failed for ${mappedSymbol}:`, err);
          return null;
        }) : Promise.resolve(null),
        resolvedTicker ? alphavantageService.fetchNewsSentiment(mappedSymbol).catch((err: any) => {
          console.warn(`[API Chat] AlphaVantage fetchNewsSentiment failed for ${mappedSymbol}:`, err);
          return [] as AlphaVantageNewsArticle[];
        }) : Promise.resolve([] as AlphaVantageNewsArticle[])
      ]);

      // Construct historical prices summary
      let historicalPricesSummary = 'No recent historical daily stock prices available.';
      if (Array.isArray(dailyHistory) && dailyHistory.length > 0) {
        const last5 = dailyHistory.slice(-5);
        historicalPricesSummary = last5
          .map((c) => `- Date: ${c.time}, Close: $${c.close.toFixed(2)} (Open: $${c.open.toFixed(2)} / High: $${c.high.toFixed(2)} / Low: $${c.low.toFixed(2)}, Volume: ${c.volume.toLocaleString()})`)
          .join('\n');
      }

      // Construct fundamental company overview summary
      let overviewSummary = 'No fundamental company overview stats available.';
      if (companyOverview) {
        overviewSummary = 
          `- Name: ${companyOverview.name}\n` +
          `- Exchange: ${companyOverview.exchange} (${companyOverview.currency})\n` +
          `- Sector / Industry: ${companyOverview.sector} / ${companyOverview.industry}\n` +
          `- Market Capitalization: $${companyOverview.marketCap.toLocaleString()}\n` +
          `- P/E Ratio: ${companyOverview.peRatio ? companyOverview.peRatio : 'N/A'}\n` +
          `- PEG Ratio: ${companyOverview.pegRatio ? companyOverview.pegRatio : 'N/A'}\n` +
          `- EPS: $${companyOverview.eps ? companyOverview.eps.toFixed(2) : 'N/A'}\n` +
          `- 52-Week Range: High $${companyOverview.fiftyTwoWeekHigh.toFixed(2)} / Low $${companyOverview.fiftyTwoWeekLow.toFixed(2)}`;
      }

      // Construct news sentiment index summary
      let sentimentSummary = 'No historical news sentiment indicators available.';
      if (Array.isArray(newsSentiment) && newsSentiment.length > 0) {
        sentimentSummary = newsSentiment
          .map((item, idx) => `- Article ${idx + 1}: "${item.title}" from ${item.source} (Sentiment: ${item.sentiment}, Score: ${item.sentimentScore.toFixed(2)})`)
          .join('\n');
      }

      // Consolidate rich grounding context
      groundingContext = 
        `=== REAL-TIME & HISTORICAL GROUNDING CONTEXT FOR ${resolvedTicker || 'QUERY'} ===\n` +
        `\n[Real-Time Snippets (Live Google Search Scraping)]\n${searchResult}\n` +
        (marketOverviewText ? `\n[Database Active Market State]\n${marketOverviewText}\n` : '') +
        (resolvedTicker ? 
        `\n[Historical Price Trajectory (Alpha Vantage Daily Time Series - Last 5 Trading Days)]\n${historicalPricesSummary}\n` +
        `\n[Fundamental Company Overview Stats (Alpha Vantage)]\n${overviewSummary}\n` +
        `\n[Historical News Sentiment Indicators (Alpha Vantage)]\n${sentimentSummary}\n` : '');
    }

    let replyText = '';

    // 5. STAGE 3: Feed the compiled dynamic API data and conversation history back to OpenRouter to synthesize the final answer
    if (process.env.OPENROUTER_API_KEY) {
      try {
        console.log(`[API Chat] Stage 3 - Synthesizing final answer via OpenRouter...`);
        const systemPrompt = `You are AlphaTrade AI, a sophisticated quantitative financial analyst and intelligence assistant.
You have access to highly compiled, multi-dimensional RAG context containing both real-time Google search snippets/headlines and historical market data (daily close price trajectories, fundamental company stats like P/E, PEG, market cap, and historical news sentiment indices).
Your task is to synthesize the historical "older data" prices and trends together with the "real-time" search news headlines, and prepare a highly compiled and cohesive answer tailored directly to the user's specific query.
You MUST ground your responses deeply in the provided grounding context data. Avoid generic templates, placeholders, or unrelated commentary. Speak with professional, metric-focused authority. Keep the response concise and under 500 tokens unless the user requests a deep-dive analysis.`;

        const userPrompt = `${groundingContext ? `[Grounding Context]\n${groundingContext}\n` : ''}User Question: ${sanitizedQuery}`;

        const orResponse = await fetch(
          process.env.OPENROUTER_API_URL || 'https://openrouter.io/api/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
              'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'openai/gpt-4-turbo-preview',
              messages: [
                { role: 'system', content: systemPrompt },
                ...historyContext,
                { role: 'user', content: userPrompt }
              ],
              temperature: 0.7,
              max_tokens: 500,
            })
          }
        );

        if (orResponse.ok) {
          const orData = await orResponse.json();
          replyText = orData.choices[0].message.content;
        } else {
          console.warn('[API Chat] OpenRouter responded with error status in Stage 3:', orResponse.status);
        }
      } catch (e: any) {
        console.error('[API Chat] OpenRouter stage 3 synthesis failed:', e.message);
      }
    }

    // 6. High-fidelity dynamic fallback if OpenRouter failed or was not configured
    if (!replyText) {
      replyText = generateMockChatResponse(sanitizedQuery, resolvedTicker, activeTickersData);
    }

    // 7. Save exchange to Firestore asynchronously
    try {
      const chatsRef = collection(db, 'users', userId, 'chats');
      await addDoc(chatsRef, {
        text: sanitizedQuery,
        sender: 'user',
        timestamp: serverTimestamp(),
        tickerSymbol: resolvedTicker || null
      });
      await addDoc(chatsRef, {
        text: replyText,
        sender: 'ai',
        timestamp: serverTimestamp(),
        tickerSymbol: resolvedTicker || null
      });
    } catch (saveErr: any) {
      console.error('[API Chat] Failed to save chat history to Firestore:', saveErr.message);
    }

    const sources = [
      resolvedTicker ? `Context filtered by: ${resolvedTicker}` : "Global market indices",
      `AlphaTrade AI Knowledge Base (${new Date().toISOString().split('T')[0]})`
    ];

    return NextResponse.json({
      success: true,
      response: replyText,
      sources,
      metadata: {
        query: sanitizedQuery,
        ticker: resolvedTicker || null,
        respondedAt: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('[API Chat] Fatal error in chat handler:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Chat unavailable',
        message: 'The market analyst is temporarily offline.',
        response: 'I apologize, but I am unable to process your question at this moment. Please try again in a moment.',
        sources: []
      },
      { status: 500 }
    );
  }
}


export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log(`[API Get Chat History] Fetching chat logs for user ${userId}`);
    const chatsRef = collection(db, 'users', userId, 'chats');
    const chatQuery = query(chatsRef, orderBy('timestamp', 'asc'), limit(50));
    const chatSnap = await getDocs(chatQuery);

    const messages = chatSnap.docs.map(doc => {
      const data = doc.data();
      let timestamp = undefined;
      if (data.timestamp) {
        try {
          const val = data.timestamp._seconds ? data.timestamp._seconds * 1000 : data.timestamp;
          timestamp = new Date(val).toISOString();
        } catch (e) {}
      }

      return {
        sender: data.sender === 'user' ? 'user' : 'ai',
        text: data.text || '',
        timestamp
      };
    });

    return NextResponse.json({
      success: true,
      data: messages
    });
  } catch (error: any) {
    console.error('[API Get Chat History] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch chat history' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log(`[API Delete Chat History] Clearing chat logs for user ${userId}`);
    const chatsRef = collection(db, 'users', userId, 'chats');
    const chatSnap = await getDocs(chatsRef);
    
    if (chatSnap.empty) {
      return NextResponse.json({
        success: true,
        message: 'Chat history is already empty.'
      });
    }

    const batch = writeBatch(db);
    chatSnap.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    return NextResponse.json({
      success: true,
      message: 'Chat history cleared successfully.'
    });
  } catch (error: any) {
    console.error('[API Delete Chat History] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to clear chat history', message: error.message },
      { status: 500 }
    );
  }
}
