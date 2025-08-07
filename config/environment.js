"use strict";
/**
 * Environment Configuration
 * Centralizes all environment variable handling
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnvironment = validateEnvironment;
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
const environment = {
    // Server Configuration
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || 'localhost',
    nodeEnv: process.env.NODE_ENV || 'development',
    // Platform Configuration
    enableWhatsApp: process.env.ENABLE_WHATSAPP === 'true' || true,
    enableInstagram: process.env.ENABLE_INSTAGRAM === 'true' || false,
    platform: process.env.PLATFORM || 'whatsapp',
    // Firebase Configuration
    firebase: {
        serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        clientId: process.env.FIREBASE_CLIENT_ID,
        authUri: process.env.FIREBASE_AUTH_URI,
        tokenUri: process.env.FIREBASE_TOKEN_URI,
        authProviderX509CertUrl: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
        clientX509CertUrl: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    },
    // Redis Configuration
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
    },
    // AI Configuration
    ai: {
        geminiApiKey: process.env.GEMINI_API_KEY || '',
        geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        responseTimeout: parseInt(process.env.AI_RESPONSE_TIMEOUT || '30000', 10),
        maxTokens: parseInt(process.env.AI_MAX_TOKENS || '1000', 10),
    },
    // Logging Configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        logToFile: process.env.LOG_TO_FILE === 'true' || true,
        logFile: process.env.LOG_FILE || 'logs/app.log',
        logRequests: process.env.LOG_REQUESTS === 'true' || false,
        logResponses: process.env.LOG_RESPONSES === 'true' || false,
        logWhatsAppMessages: process.env.LOG_WHATSAPP_MESSAGES === 'true' || false,
    },
    // CORS Configuration
    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000',
    },
    // Rate Limiting
    rateLimit: {
        window: parseInt(process.env.RATE_LIMIT_WINDOW || '15', 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    },
    // WhatsApp Configuration
    whatsapp: {
        sessionTimeout: parseInt(process.env.WHATSAPP_SESSION_TIMEOUT || '300000', 10),
        maxRetries: parseInt(process.env.WHATSAPP_MAX_RETRIES || '3', 10),
        retryDelay: parseInt(process.env.WHATSAPP_RETRY_DELAY || '5000', 10),
        puppeteerHeadless: process.env.WHATSAPP_PUPPETEER_HEADLESS !== 'false',
    },
    // Paths
    paths: {
        userDataPath: process.env.USER_DATA_PATH || './data_v2',
        uploadsDir: process.env.UPLOADS_DIR || './data_v2/uploads',
        logsDir: 'logs',
    },
    // Security
    security: {
        apiSecretKey: process.env.API_SECRET_KEY || 'default-secret-key-change-in-production',
        jwtSecret: process.env.JWT_SECRET || 'jwt-secret-change-in-production',
        apiKeySecret: process.env.API_KEY_SECRET || 'api-key-secret-change-in-production',
    },
    // Webhooks
    webhooks: {
        secret: process.env.WEBHOOK_SECRET || 'webhook-secret-change-in-production',
        url: process.env.WEBHOOK_URL || 'http://localhost:3000/webhooks',
    },
};
// Validation
function validateEnvironment() {
    const requiredVars = [];
    // Check Firebase configuration
    if (!environment.firebase.serviceAccountPath && !environment.firebase.projectId) {
        requiredVars.push('FIREBASE_SERVICE_ACCOUNT_PATH or Firebase environment variables');
    }
    // Check AI configuration for production
    if (environment.nodeEnv === 'production' && !environment.ai.geminiApiKey) {
        requiredVars.push('GEMINI_API_KEY');
    }
    if (requiredVars.length > 0) {
        console.warn('⚠️  Missing environment variables:', requiredVars.join(', '));
        console.warn('⚠️  Some features may not work correctly');
    }
}
// Export configuration
exports.default = environment;
// Validate on import
validateEnvironment();
//# sourceMappingURL=environment.js.map