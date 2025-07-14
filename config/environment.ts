import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment schema validation
const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  HOST: z.string().default('localhost'),
  
  // Firebase Configuration
  FIREBASE_PROJECT_ID: z.string(),
  FIREBASE_PRIVATE_KEY: z.string(),
  FIREBASE_CLIENT_EMAIL: z.string(),
  FIREBASE_STORAGE_BUCKET: z.string().optional(),
  
  // Redis Configuration
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  
  // WhatsApp Configuration
  WHATSAPP_SESSION_PATH: z.string().default('./sessions'),
  WHATSAPP_HEADLESS: z.string().transform(val => val === 'true').default('true'),
  WHATSAPP_USER_AGENT: z.string().optional(),
  
  // Instagram Configuration
  INSTAGRAM_SESSION_PATH: z.string().default('./instagram-sessions'),
  INSTAGRAM_HEADLESS: z.string().transform(val => val === 'true').default('true'),
  
  // AI Configuration
  GEMINI_API_KEY: z.string(),
  GEMINI_MODEL: z.string().default('gemini-pro'),
  
  // Security
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('24h'),
  API_KEY_SECRET: z.string(),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE_PATH: z.string().default('./logs'),
  
  // File Upload
  MAX_FILE_SIZE: z.string().transform(Number).default('10485760'), // 10MB
  UPLOAD_PATH: z.string().default('./uploads'),
  
  // WebSocket
  WS_PORT: z.string().transform(Number).default('3001'),
  
  // External APIs
  WEBHOOK_URL: z.string().optional(),
  WEBHOOK_SECRET: z.string().optional(),
});

// Validate and parse environment variables
const envParseResult = envSchema.safeParse(process.env);

if (!envParseResult.success) {
  console.error('❌ Invalid environment variables:');
  console.error(envParseResult.error.format());
  process.exit(1);
}

export const env = envParseResult.data;

// Environment helper functions
export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

// Configuration objects
export const serverConfig = {
  port: env.PORT,
  host: env.HOST,
  nodeEnv: env.NODE_ENV,
} as const;

export const firebaseConfig = {
  projectId: env.FIREBASE_PROJECT_ID,
  privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  clientEmail: env.FIREBASE_CLIENT_EMAIL,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
} as const;

export const redisConfig = {
  url: env.REDIS_URL,
  password: env.REDIS_PASSWORD,
} as const;

export const whatsappConfig = {
  sessionPath: env.WHATSAPP_SESSION_PATH,
  headless: env.WHATSAPP_HEADLESS,
  userAgent: env.WHATSAPP_USER_AGENT,
} as const;

export const instagramConfig = {
  sessionPath: env.INSTAGRAM_SESSION_PATH,
  headless: env.INSTAGRAM_HEADLESS,
} as const;

export const aiConfig = {
  geminiApiKey: env.GEMINI_API_KEY,
  geminiModel: env.GEMINI_MODEL,
} as const;

export const securityConfig = {
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  apiKeySecret: env.API_KEY_SECRET,
} as const;

export const rateLimitConfig = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
} as const;

export const loggingConfig = {
  level: env.LOG_LEVEL,
  filePath: env.LOG_FILE_PATH,
} as const;

export const uploadConfig = {
  maxFileSize: env.MAX_FILE_SIZE,
  uploadPath: env.UPLOAD_PATH,
} as const;

export const wsConfig = {
  port: env.WS_PORT,
} as const; 