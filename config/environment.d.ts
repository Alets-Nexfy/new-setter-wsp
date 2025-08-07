/**
 * Environment Configuration
 * Centralizes all environment variable handling
 */
export interface EnvironmentConfig {
    port: number;
    host: string;
    nodeEnv: string;
    enableWhatsApp: boolean;
    enableInstagram: boolean;
    platform: string;
    firebase: {
        serviceAccountPath?: string;
        projectId?: string;
        privateKeyId?: string;
        privateKey?: string;
        clientEmail?: string;
        clientId?: string;
        authUri?: string;
        tokenUri?: string;
        authProviderX509CertUrl?: string;
        clientX509CertUrl?: string;
    };
    redis: {
        url: string;
        host: string;
        port: number;
        password?: string;
    };
    ai: {
        geminiApiKey: string;
        geminiModel: string;
        responseTimeout: number;
        maxTokens: number;
    };
    logging: {
        level: string;
        logToFile: boolean;
        logFile: string;
        logRequests: boolean;
        logResponses: boolean;
        logWhatsAppMessages: boolean;
    };
    cors: {
        origin: string;
    };
    rateLimit: {
        window: number;
        maxRequests: number;
    };
    whatsapp: {
        sessionTimeout: number;
        maxRetries: number;
        retryDelay: number;
        puppeteerHeadless: boolean;
    };
    paths: {
        userDataPath: string;
        uploadsDir: string;
        logsDir: string;
    };
    security: {
        apiSecretKey: string;
        jwtSecret: string;
        apiKeySecret: string;
    };
    webhooks: {
        secret: string;
        url: string;
    };
}
declare const environment: EnvironmentConfig;
export declare function validateEnvironment(): void;
export default environment;
//# sourceMappingURL=environment.d.ts.map