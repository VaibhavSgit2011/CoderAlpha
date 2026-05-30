// src/lib/api.ts
import axios from 'axios';

// Bright Data SERP API
export const fetchFinancialNews = async (ticker: string) => {
  try {
    const response = await axios.post('/api/news', {
      ticker,
      query: `${ticker} financial news stock market`,
      limit: 10,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching news:', error);
    throw error;
  }
};

// Get ticker data from mock/real API
export const fetchTickerData = async (symbol: string) => {
  try {
    const response = await axios.get(`/api/ticker/${symbol}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching ticker data:', error);
    throw error;
  }
};

// OpenRouter API for AI analysis
export const generateAIReport = async (
  ticker: string,
  newsData: string,
  marketData: string
) => {
  try {
    const response = await axios.post('/api/ai/report', {
      ticker,
      newsData,
      marketData,
    });
    return response.data;
  } catch (error) {
    console.error('Error generating AI report:', error);
    throw error;
  }
};

// OpenRouter API for chatbot
export const chatWithAI = async (
  message: string,
  context: string,
  conversationHistory: Array<{ role: string; content: string }>
) => {
  try {
    const response = await axios.post('/api/ai/chat', {
      message,
      context,
      conversationHistory,
    });
    return response.data;
  } catch (error) {
    console.error('Error in chat:', error);
    throw error;
  }
};

// Save to Firebase
export const saveTickerDataToFirebase = async (
  userId: string,
  ticker: string,
  data: any
) => {
  try {
    const response = await axios.post('/api/firebase/save', {
      userId,
      ticker,
      data,
    });
    return response.data;
  } catch (error) {
    console.error('Error saving to Firebase:', error);
    throw error;
  }
};

// Fetch ticker data from Firebase
export const fetchTickerDataFromFirebase = async (
  userId: string,
  ticker: string
) => {
  try {
    const response = await axios.get(
      `/api/firebase/ticker?userId=${userId}&ticker=${ticker}`
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching from Firebase:', error);
    throw error;
  }
};
