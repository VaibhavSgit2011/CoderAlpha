// src/app/api/ai/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: NextRequest) {
  try {
    const { message, context, conversationHistory } = await request.json();

    const systemPrompt = `You are AlphaStream AI, an intelligent financial assistant. 
You have access to real-time market data, news, and sentiment analysis.
Provide concise, actionable insights. Be specific about data and sources.
Keep responses under 500 tokens unless asked for detailed analysis.`;

    // Build conversation with history
    const messages = [
      ...conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: `${context ? `Context: ${context}\n\n` : ''}${message}`,
      },
    ];

    // Call OpenRouter API
    const aiResponse = await axios.post(
      process.env.OPENROUTER_API_URL || 'https://openrouter.io/api/v1/chat/completions',
      {
        model: 'openai/gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
      }
    );

    const reply = aiResponse.data.choices[0].message.content;

    return NextResponse.json({
      success: true,
      reply,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Chat API error:', error);

    // Fallback response
    const fallbackResponses: Record<string, string> = {
      'what': 'I can help you analyze stocks, interpret market news, and generate investment reports. What ticker would you like to explore?',
      'how': 'I analyze financial news, market data, and sentiment to provide actionable insights for your investment decisions.',
      'default': 'I\'m having trouble connecting to the analysis engine right now. Please try again in a moment.',
    };

    const reply = fallbackResponses.default;

    return NextResponse.json(
      {
        success: false,
        reply,
        error: 'Using fallback response',
      },
      { status: 200 }
    );
  }
}
