import { env } from '../config/env';
import { retryWithBackoff } from '../utils/retry';
import { logger } from '../utils/logger';

export interface OpenRouterResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}

class OpenRouterService {
  private static instance: OpenRouterService;
  private readonly baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  
  // High quality, fast model
  private readonly defaultModel = 'google/gemini-2.5-flash';

  private constructor() {
    logger.info('[OpenRouterService] Initialized');
  }

  public static getInstance(): OpenRouterService {
    if (!OpenRouterService.instance) {
      OpenRouterService.instance = new OpenRouterService();
    }
    return OpenRouterService.instance;
  }

  /**
   * Universal completion helper calling the OpenRouter completions API.
   */
  private async postCompletion(
    messages: Array<{ role: string; content: string }>,
    options?: {
      model?: string;
      temperature?: number;
      responseFormatJson?: boolean;
    }
  ): Promise<string> {
    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0.3;
    
    return retryWithBackoff<string>(
      async () => {
        const body: Record<string, any> = {
          model,
          messages,
          temperature,
        };

        if (options?.responseFormatJson) {
          body.response_format = { type: 'json_object' };
        }

        const headers = {
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'AlphaStream AI Terminal',
        };

        logger.debug(`[OpenRouter] Requesting completion for model=${model}`);
        
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => 'no error body');
          throw new Error(`OpenRouter API returned ${response.status}: ${errText}`);
        }

        const data = (await response.json()) as OpenRouterResponse;
        const generatedText = data.choices?.[0]?.message?.content;
        
        if (!generatedText) {
          throw new Error('[OpenRouter] Model returned empty response or invalid choices structure.');
        }

        return generatedText;
      },
      {
        maxRetries: 3,
        baseDelayMs: 2000,
        retryOn: (err: any) => {
          const msg = err.message || '';
          if (msg.includes('401') || msg.includes('403')) return false;
          return true;
        }
      }
    );
  }

  /**
   * Generates a conversational chatbot reply, analyzing pinecone search matches
   * and injecting past conversation memory context.
   */
  public async getChatResponse(
    query: string,
    tickerContext: string,
    historyContext: string
  ): Promise<string> {
    const systemPrompt = 
      `You are AlphaStream AI, a elite conversational market intelligence analyst. Your answers are grounded ` +
      `in real-time scraped financial news and reddit sentiment.\n\n` +
      `Here is the latest financial data and news context:\n` +
      `${tickerContext || 'No current news context available.'}\n\n` +
      `Here are relevant past questions and answers this user asked (to provide personalized memory context):\n` +
      `${historyContext || 'No past memory logs available.'}\n\n` +
      `Answer the user's question clearly, professionally, and synthetically. Emphasize operational signals over noise. ` +
      `Format your output in professional, scannable markdown with bold headings and list items. Keep your tone direct and premium.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ];

    try {
      const response = await this.postCompletion(messages, {
        model: this.defaultModel,
        temperature: 0.5,
      });
      return response;
    } catch (err: any) {
      logger.error(`[OpenRouter] Chat generation failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Generates a fully structured deep-dive due diligence report on a given ticker,
   * returning a strict JSON structure matching the Firestore expectations, including
   * trade recommendation and reasoning.
   */
  public async generateDueDiligenceReport(
    ticker: string,
    scrapedIntel: string,
    financials: string
  ): Promise<{
    strengths: string[];
    weaknesses: string[];
    catalysts: string[];
    overall_thesis: string;
    suggested_trade: string;
    trade_reasoning: string;
  }> {
    const systemPrompt =
      `You are a Managing Director of Research at a top-tier global investment bank. ` +
      `Generate a structured due diligence dossier on ${ticker.toUpperCase()} based on real-time news, ` +
      `social sentiment, and core financial statements.\n\n` +
      `Return ONLY a valid JSON object matching the following structure:\n` +
      `{\n` +
      `  "strengths": ["Bullish signal 1", "Bullish signal 2", ...],\n` +
      `  "weaknesses": ["Bearish risk 1", "Bearish risk 2", ...],\n` +
      `  "catalysts": ["Near term catalyst 1", "Near term catalyst 2", ...],\n` +
      `  "overall_thesis": "A synthesized 3-4 sentence paragraph of your ultimate investment analysis.",\n` +
      `  "suggested_trade": "BUY | SELL | HOLD | AVOID",\n` +
      `  "trade_reasoning": "A concise 2-3 sentence paragraph explaining precisely why the user should execute this specific trade recommendation based on catalysts and valuation risks."\n` +
      `}\n\n` +
      `Do NOT include any markdown formatting, extra explanation, or HTML tags outside the JSON. Return ONLY the raw JSON object.\n\n` +
      `=== CORE FINANCIAL DATA ===\n` +
      `${financials}\n\n` +
      `=== SCALED NEWS & SENTIMENT INTEL ===\n` +
      `${scrapedIntel}`;

    const messages = [
      { role: 'user', content: systemPrompt }
    ];

    try {
      const response = await this.postCompletion(messages, {
        model: 'meta-llama/llama-3-70b-instruct', // heavier model for high-reasoning reports
        temperature: 0.2,
        responseFormatJson: true,
      });

      // Parse JSON response safely
      const parsed = JSON.parse(response);
      return {
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String) : [],
        catalysts: Array.isArray(parsed.catalysts) ? parsed.catalysts.map(String) : [],
        overall_thesis: String(parsed.overall_thesis || '').trim(),
        suggested_trade: String(parsed.suggested_trade || 'HOLD').trim().toUpperCase(),
        trade_reasoning: String(parsed.trade_reasoning || '').trim(),
      };
    } catch (err: any) {
      logger.error(`[OpenRouter] Due diligence report failed: ${err.message}`);
      throw err;
    }
  }
}

export const openRouterService = OpenRouterService.getInstance();
export default openRouterService;
