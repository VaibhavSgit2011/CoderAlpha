import { Request, Response, NextFunction } from 'express';
import { validate, tickerParamSchema, generateReportSchema, chatQuerySchema } from '../../middleware/validator';
import { ValidationError } from '../../middleware/errorHandler';

describe('Validator Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};
    res = {};
    next = jest.fn() as unknown as NextFunction;
  });

  it('should successfully validate valid tickerParamSchema params', () => {
    req.params = { symbol: 'AAPL' };
    const middleware = validate(tickerParamSchema, 'params');
    
    expect(() => middleware(req as Request, res as Response, next)).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.params).toEqual({ symbol: 'AAPL' });
  });

  it('should throw ValidationError for invalid tickerParamSchema params (lowercase)', () => {
    req.params = { symbol: 'aapl' };
    const middleware = validate(tickerParamSchema, 'params');

    expect(() => middleware(req as Request, res as Response, next)).toThrow(ValidationError);
    expect(next).not.toHaveBeenCalled();
  });

  it('should throw ValidationError for invalid tickerParamSchema params (too long)', () => {
    req.params = { symbol: 'VERYLONGSYMBOL' };
    const middleware = validate(tickerParamSchema, 'params');

    expect(() => middleware(req as Request, res as Response, next)).toThrow(ValidationError);
    expect(next).not.toHaveBeenCalled();
  });

  it('should throw ValidationError for missing params', () => {
    req.params = {};
    const middleware = validate(tickerParamSchema, 'params');

    expect(() => middleware(req as Request, res as Response, next)).toThrow(ValidationError);
    expect(next).not.toHaveBeenCalled();
  });

  it('should successfully validate valid generateReportSchema body', () => {
    req.body = { ticker: 'TSLA', uid: 'user_123' };
    const middleware = validate(generateReportSchema, 'body');

    expect(() => middleware(req as Request, res as Response, next)).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ ticker: 'TSLA', uid: 'user_123' });
  });

  it('should successfully validate valid chatQuerySchema body', () => {
    req.body = { query: 'Is TSLA stock a buy right now?', ticker: 'TSLA' };
    const middleware = validate(chatQuerySchema, 'body');

    expect(() => middleware(req as Request, res as Response, next)).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ query: 'Is TSLA stock a buy right now?', ticker: 'TSLA' });
  });
});
