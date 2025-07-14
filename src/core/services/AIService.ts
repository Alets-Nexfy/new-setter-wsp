import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { LoggerService } from './LoggerService';
import { CacheService } from './CacheService';
import { aiConfig } from '@/config/environment';

export interface AIResponse {
  id: string;
  content: string;
  model: string;
  tokens: number;
  processingTime: number;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface AIContext {
  sessionId: string;
  userId: string;
  platform: 'whatsapp' | 'instagram';
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  userPreferences?: {
    language?: string;
    tone?: 'formal' | 'casual' | 'friendly' | 'professional';
    responseLength?: 'short' | 'medium' | 'long';
  };
  businessContext?: {
    companyName?: string;
    industry?: string;
    services?: string[];
    targetAudience?: string;
  };
}

export interface GenerateResponseOptions {
  prompt: string;
  context: AIContext;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
}

export class AIService {
  private static instance: AIService;
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private logger: LoggerService;
  private cache: CacheService;

  private constructor() {
    this.genAI = new GoogleGenerativeAI(aiConfig.geminiApiKey);
    this.model = this.genAI.getGenerativeModel({ model: aiConfig.geminiModel });
    this.logger = LoggerService.getInstance();
    this.cache = CacheService.getInstance();
  }

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  public async generateResponse(options: GenerateResponseOptions): Promise<AIResponse> {
    const startTime = Date.now();
    const responseId = `ai_response_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(options);
      const cached = await this.cache.getJSON<AIResponse>(cacheKey);
      if (cached) {
        this.logger.info('AI response served from cache', {
          responseId,
          sessionId: options.context.sessionId,
          cacheKey,
        });
        return cached;
      }

      // Build prompt with context
      const fullPrompt = this.buildPrompt(options);

      // Generate response
      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      // Get usage statistics
      const usageMetadata = result.response.usageMetadata;
      const tokens = usageMetadata?.totalTokenCount || 0;

      const processingTime = Date.now() - startTime;

      const aiResponse: AIResponse = {
        id: responseId,
        content: text,
        model: aiConfig.geminiModel,
        tokens,
        processingTime,
        confidence: this.calculateConfidence(text),
        metadata: {
          promptTokens: usageMetadata?.promptTokenCount,
          responseTokens: usageMetadata?.candidatesTokenCount,
          safetyRatings: response.safetyRatings,
        },
      };

      // Cache the response
      await this.cache.setJSON(cacheKey, aiResponse, 3600); // 1 hour

      this.logger.info('AI response generated successfully', {
        responseId,
        sessionId: options.context.sessionId,
        tokens,
        processingTime,
        model: aiConfig.geminiModel,
      });

      return aiResponse;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Failed to generate AI response', {
        responseId,
        sessionId: options.context.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
      });

      throw error;
    }
  }

  public async generateConversationalResponse(
    message: string,
    context: AIContext
  ): Promise<AIResponse> {
    const options: GenerateResponseOptions = {
      prompt: message,
      context,
      temperature: 0.7,
      maxTokens: 500,
    };

    return this.generateResponse(options);
  }

  public async generateAutoReply(
    message: string,
    context: AIContext
  ): Promise<AIResponse> {
    const autoReplyPrompt = `Generate a helpful and professional auto-reply for this message: "${message}". 
    The reply should be friendly, informative, and encourage further conversation.`;

    const options: GenerateResponseOptions = {
      prompt: autoReplyPrompt,
      context,
      temperature: 0.8,
      maxTokens: 200,
    };

    return this.generateResponse(options);
  }

  public async analyzeSentiment(message: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    confidence: number;
    emotions: string[];
    score: number;
  }> {
    try {
      const prompt = `Analyze the sentiment of this message: "${message}". 
      Return a JSON response with:
      - sentiment: "positive", "negative", or "neutral"
      - confidence: number between 0 and 1
      - emotions: array of detected emotions
      - score: sentiment score between -1 and 1`;

      const options: GenerateResponseOptions = {
        prompt,
        context: {
          sessionId: 'sentiment_analysis',
          userId: 'system',
          platform: 'whatsapp',
        },
        temperature: 0.3,
        maxTokens: 200,
      };

      const response = await this.generateResponse(options);
      
      try {
        const analysis = JSON.parse(response.content);
        return {
          sentiment: analysis.sentiment || 'neutral',
          confidence: analysis.confidence || 0.5,
          emotions: analysis.emotions || [],
          score: analysis.score || 0,
        };
      } catch (parseError) {
        // Fallback to basic sentiment analysis
        const lowerMessage = message.toLowerCase();
        const positiveWords = ['good', 'great', 'excellent', 'amazing', 'love', 'happy', 'thanks', 'thank you'];
        const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'angry', 'sad', 'disappointed'];

        const positiveCount = positiveWords.filter(word => lowerMessage.includes(word)).length;
        const negativeCount = negativeWords.filter(word => lowerMessage.includes(word)).length;

        let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
        let score = 0;

        if (positiveCount > negativeCount) {
          sentiment = 'positive';
          score = Math.min(positiveCount / 10, 1);
        } else if (negativeCount > positiveCount) {
          sentiment = 'negative';
          score = -Math.min(negativeCount / 10, 1);
        }

        return {
          sentiment,
          confidence: 0.6,
          emotions: [],
          score,
        };
      }

    } catch (error) {
      this.logger.error('Failed to analyze sentiment', {
        message: message.substring(0, 100),
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        sentiment: 'neutral',
        confidence: 0.5,
        emotions: [],
        score: 0,
      };
    }
  }

  public async summarizeConversation(
    messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>
  ): Promise<AIResponse> {
    try {
      const conversationText = messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      const prompt = `Summarize this conversation in a concise way, highlighting the main points and any action items:

${conversationText}

Provide a summary that includes:
- Main topics discussed
- Key decisions or agreements
- Action items or next steps
- Overall sentiment of the conversation`;

      const options: GenerateResponseOptions = {
        prompt,
        context: {
          sessionId: 'conversation_summary',
          userId: 'system',
          platform: 'whatsapp',
        },
        temperature: 0.5,
        maxTokens: 300,
      };

      return this.generateResponse(options);

    } catch (error) {
      this.logger.error('Failed to summarize conversation', {
        messageCount: messages.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async generateFollowUpQuestions(
    message: string,
    context: AIContext
  ): Promise<string[]> {
    try {
      const prompt = `Based on this message: "${message}", generate 3-5 relevant follow-up questions that would help continue the conversation naturally. 
      Return only the questions, one per line, without numbering.`;

      const options: GenerateResponseOptions = {
        prompt,
        context,
        temperature: 0.8,
        maxTokens: 200,
      };

      const response = await this.generateResponse(options);
      const questions = response.content
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0 && !q.match(/^\d+\./));

      return questions.slice(0, 5); // Limit to 5 questions

    } catch (error) {
      this.logger.error('Failed to generate follow-up questions', {
        message: message.substring(0, 100),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  private buildPrompt(options: GenerateResponseOptions): string {
    const { prompt, context } = options;

    let fullPrompt = '';

    // Add business context if available
    if (context.businessContext) {
      fullPrompt += `Business Context:
- Company: ${context.businessContext.companyName || 'Not specified'}
- Industry: ${context.businessContext.industry || 'Not specified'}
- Services: ${context.businessContext.services?.join(', ') || 'Not specified'}
- Target Audience: ${context.businessContext.targetAudience || 'Not specified'}

`;
    }

    // Add user preferences
    if (context.userPreferences) {
      fullPrompt += `User Preferences:
- Language: ${context.userPreferences.language || 'English'}
- Tone: ${context.userPreferences.tone || 'friendly'}
- Response Length: ${context.userPreferences.responseLength || 'medium'}

`;
    }

    // Add conversation history if available
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      fullPrompt += 'Conversation History:\n';
      context.conversationHistory.slice(-5).forEach(msg => {
        fullPrompt += `${msg.role}: ${msg.content}\n`;
      });
      fullPrompt += '\n';
    }

    // Add the main prompt
    fullPrompt += `Current Message: ${prompt}

Please provide a helpful, relevant, and contextually appropriate response.`;

    return fullPrompt;
  }

  private generateCacheKey(options: GenerateResponseOptions): string {
    const { prompt, context } = options;
    const keyData = {
      prompt: prompt.substring(0, 100), // Limit prompt length for cache key
      sessionId: context.sessionId,
      userId: context.userId,
      platform: context.platform,
    };
    return `ai_response:${Buffer.from(JSON.stringify(keyData)).toString('base64')}`;
  }

  private calculateConfidence(text: string): number {
    // Simple confidence calculation based on response length and content
    const minLength = 10;
    const maxLength = 500;
    const length = text.length;
    
    if (length < minLength) return 0.3;
    if (length > maxLength) return 0.8;
    
    // Normalize length confidence
    const lengthConfidence = (length - minLength) / (maxLength - minLength);
    
    // Additional confidence based on content quality indicators
    let qualityScore = 0;
    if (text.includes('?')) qualityScore += 0.1; // Shows engagement
    if (text.includes('!')) qualityScore += 0.05; // Shows enthusiasm
    if (text.includes('.')) qualityScore += 0.1; // Shows proper structure
    if (text.length > 50) qualityScore += 0.1; // Shows substance
    
    return Math.min(0.9, lengthConfidence + qualityScore);
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const testPrompt = 'Hello, this is a health check. Please respond with "OK".';
      const options: GenerateResponseOptions = {
        prompt: testPrompt,
        context: {
          sessionId: 'health_check',
          userId: 'system',
          platform: 'whatsapp',
        },
        maxTokens: 10,
      };

      await this.generateResponse(options);
      return true;
    } catch (error) {
      this.logger.error('AI service health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
} 