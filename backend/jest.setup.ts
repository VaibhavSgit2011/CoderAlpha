// Mock environment variables for testing to satisfy Zod schema validations in env.ts
process.env.PORT = '3001';
process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.FIREBASE_PROJECT_ID = 'alphastream-test-project';
process.env.BRIGHTDATA_API_TOKEN = 'test_brightdata_token';
process.env.HUGGINGFACE_API_KEY = 'test_huggingface_api_key';
process.env.PINECONE_API_KEY = 'test_pinecone_api_key';
process.env.LOG_LEVEL = 'error';

// Mock firebase-admin globally to prevent actual Firebase SDK initialization and connections during tests
jest.mock('firebase-admin', () => {
  const mockFirestore = {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      exists: true,
      id: 'mock-doc-id',
      data: () => ({
        ticker_symbol: 'AAPL',
        current_sentiment_score: 85,
        recent_news: [],
      }),
    }),
    set: jest.fn().mockResolvedValue(true),
    update: jest.fn().mockResolvedValue(true),
    add: jest.fn().mockResolvedValue({ id: 'mock-report-id' }),
  };

  const mockAuth = {
    verifyIdToken: jest.fn().mockResolvedValue({
      uid: 'mock-user-123',
      email: 'test@example.com',
    }),
  };

  const mockApp = {
    firestore: jest.fn(() => mockFirestore),
    auth: jest.fn(() => mockAuth),
  };

  return {
    __esModule: true,
    default: {
      initializeApp: jest.fn(() => mockApp),
      apps: [],
      app: jest.fn(() => mockApp),
      credential: {
        cert: jest.fn(),
      },
    },
    initializeApp: jest.fn(() => mockApp),
    apps: [],
    app: jest.fn(() => mockApp),
    credential: {
      cert: jest.fn(),
    },
  };
});

