import express from 'express';
import supertest from 'supertest';
import { healthRouter } from '../../routes/health';

describe('Health Check Route Integration', () => {
  let testApp: express.Express;

  beforeAll(() => {
    // Create an isolated express instance to test the health route
    testApp = express();
    testApp.use('/api/health', healthRouter);
  });

  it('should return 200 OK and aggregated system health statuses', async () => {
    const response = await supertest(testApp).get('/api/health');

    expect(response.status).toBe(200);
    
    // Core payload checks
    expect(response.body).toHaveProperty('status');
    expect(response.body.status).toBe('ok');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('version');
    
    // Service state checks (mocked behavior)
    expect(response.body).toHaveProperty('services');
    expect(response.body.services).toHaveProperty('brightdata');
    expect(response.body.services.brightdata).toHaveProperty('serp');
    expect(response.body.services.brightdata.serp).toBe('CLOSED');
    
    expect(response.body.services).toHaveProperty('huggingface');
    expect(response.body.services.huggingface).toHaveProperty('triage');
    expect(response.body.services.huggingface.triage).toBe('CLOSED');
    
    expect(response.body.services).toHaveProperty('firestore');
    expect(response.body.services.firestore).toBe('connected');

    // Pipeline checks
    expect(response.body).toHaveProperty('pipeline');
    expect(response.body.pipeline).toHaveProperty('lastIngestionRun');
    expect(response.body.pipeline).toHaveProperty('errors');
  });
});
