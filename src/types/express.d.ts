import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        role?: string;
        [key: string]: any;
      };
      sessionId?: string;
      platform?: string;
    }
  }
}

export {};