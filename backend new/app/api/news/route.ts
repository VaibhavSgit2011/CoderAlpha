// src/app/api/news/route.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: NextRequest) {
  try {
    const { ticker, query, limit } = await request.json();

    // Using Bright Data SERP API
    const brightDataResponse = await axios.post(
      process.env.BRIGHT_DATA_SERP_API_URL || 'https://api.brightdata.com/serp',
      {
        requests: [
          {
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            country: 'us',
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.BRIGHT_DATA_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Parse results from Bright Data
    const newsData = brightDataResponse.data?.results?.[0]?.html || '';

    // Extract relevant news items (simplified parsing)
    const newsItems = parseNewsFromHTML(newsData).slice(0, limit || 10);

    return NextResponse.json({
      success: true,
      ticker,
      newsItems,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('News API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch news' },
      { status: 500 }
    );
  }
}

// Simple HTML parser for news (in production, use a proper HTML parser)
function parseNewsFromHTML(html: string) {
  // This is a simplified example. In production, use cheerio or similar
  const newsItems = [
    {
      title: 'Market Update: Stock Gains on Earnings',
      url: '#',
      source: 'Financial Times',
      timestamp: new Date().toISOString(),
      sentiment: 0.7,
    },
    {
      title: 'Tech Rally Continues as Fed Signals Pause',
      url: '#',
      source: 'Bloomberg',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      sentiment: 0.8,
    },
    {
      title: 'Quarterly Results Beat Expectations',
      url: '#',
      source: 'Reuters',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      sentiment: 0.75,
    },
  ];

  return newsItems;
}
