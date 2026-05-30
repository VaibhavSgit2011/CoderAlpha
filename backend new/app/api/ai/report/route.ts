// src/app/api/ai/report/route.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: NextRequest) {
  try {
    const { ticker, newsData, marketData } = await request.json();

    // Prepare context for OpenRouter
    const systemPrompt = `You are a senior financial analyst with expertise in equity research and market analysis. 
Your reports are institutional-grade, data-driven, and objective. Provide clear actionable insights.
Format your response in markdown with sections for: Executive Summary, Bullish Factors, Bearish Factors, Catalysts, and Investment Thesis.`;

    const userPrompt = `Generate a professional investment report for ${ticker}:

Market Data:
${JSON.stringify(marketData, null, 2)}

Recent News & Sentiment:
${newsData}

Provide a structured analysis suitable for institutional investors.`;

    // Call OpenRouter API
    const aiResponse = await axios.post(
      process.env.OPENROUTER_API_URL || 'https://openrouter.io/api/v1/chat/completions',
      {
        model: 'openai/gpt-4-turbo-preview', // Or use 'anthropic/claude-3-sonnet'
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
      }
    );

    const reportContent = aiResponse.data.choices[0].message.content;

    return NextResponse.json({
      success: true,
      ticker,
      report: reportContent,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('AI Report API error:', error);

    // Fallback response for demo
    const fallbackReport = `# Investment Report for ${request.body ? JSON.parse(request.body).ticker : 'TICKER'}

## Executive Summary
Unable to generate AI report at this time. This is a demonstration of the report structure.

## Market Analysis
- **Current Status**: Analyzing recent market movements
- **Sentiment**: Monitoring investor sentiment indicators
- **Catalysts**: Tracking upcoming events and announcements

## Key Metrics
- Price Target: Pending analysis
- Risk Assessment: Medium
- Time Horizon: 6-12 months

## Recommendation
Monitor for entry points on weakness.`;

    return NextResponse.json(
      {
        success: false,
        ticker: 'UNKNOWN',
        report: fallbackReport,
        error: 'Using fallback report structure',
      },
      { status: 200 }
    );
  }
}
