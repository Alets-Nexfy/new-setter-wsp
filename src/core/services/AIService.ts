import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { LoggerService } from './LoggerService';
import { SupabaseService } from './SupabaseService';
import { ConversationContext } from '@/shared/types/chat';

export interface AIRequestOptions {
  maxRetries?: number;
  initialBackoffMs?: number;
  useConversationHistory?: boolean;
  systemInstruction?: string;
  maxTokens?: number;
}

export interface AIResponse {
  success: boolean;
  content?: string;
  tokensUsed?: number;
  error?: string;
  retryCount?: number;
}

export interface TokenTracking {
  chatId: string;
  userId: string;
  totalTokens: number;
  messageCount: number;
  lastUpdated: Date;
  maxTokensReached: boolean;
}

export interface ConversationHistoryItem {
  role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  estimatedTokens: number;
}

export interface RateLimitStatus {
  userId: string;
  requestsInLastMinute: number;
  nextAllowedRequest: Date;
  isLimited: boolean;
}

export class AIService {
  private static instance: AIService;
  private logger: LoggerService;
  private db: SupabaseService;
  private geminiModel: GenerativeModel | null = null;
  private isInitialized = false;

  // Rate limiting
  private rateLimits: Map<string, { count: number; timestamps: number[]; resetTime: number }> = new Map();
  private readonly MAX_REQUESTS_PER_MINUTE = 30;
  private readonly RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

  // Token tracking
  private conversationTokens: Map<string, TokenTracking> = new Map();
  private readonly MAX_CONVERSATION_TOKENS = 15000;
  private readonly MAX_HISTORY_TOKENS_FOR_PROMPT = 2000;
  private readonly TOKEN_ESTIMATE_RATIO = 4; // Characters per token estimate

  // Response caching
  private responseCache: Map<string, { content: string; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.logger = LoggerService.getInstance();
    this.db = SupabaseService.getInstance();
    this.initializeGemini();
  }

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /**
   * MIGRADO DE: whatsapp-api/src/worker.js líneas 157-183
   * Initialize Gemini AI model with error handling
   */
  private async initializeGemini(): Promise<void> {
    try {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      
      if (!geminiApiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not defined');
      }

      const genAI = new GoogleGenerativeAI(geminiApiKey);
      this.geminiModel = genAI.getGenerativeModel({ 
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' 
      });
      
      this.isInitialized = true;
      this.logger.info('Gemini AI model initialized successfully', {
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
      });

    } catch (error) {
      this.logger.error('Critical error initializing Gemini AI', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      this.isInitialized = false;
      // Don't exit process in service - let the application handle it
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/worker.js líneas 222-280
   * Generate AI response with retry logic and rate limiting
   */
  public async generateResponse(
    prompt: string,
    options: AIRequestOptions = {}
  ): Promise<AIResponse> {
    const {
      maxRetries = 3,
      initialBackoffMs = 1000,
      systemInstruction,
      maxTokens
    } = options;

    if (!this.isInitialized || !this.geminiModel) {
      return {
        success: false,
        error: 'AI service not initialized'
      };
    }

    // Check cache first
    const cacheKey = this.generateCacheKey(prompt, systemInstruction);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.logger.debug('Returning cached AI response');
      return {
        success: true,
        content: cached.content,
        tokensUsed: this.estimateTokens(cached.content)
      };
    }

    let retryCount = 0;
    let backoffMs = initialBackoffMs;

    while (retryCount <= maxRetries) {
      try {
        this.logger.debug('Attempting AI content generation', {
          attempt: retryCount + 1,
          maxRetries: maxRetries + 1,
          promptLength: prompt.length
        });

        // Prepare the final prompt
        let finalPrompt = prompt;
        if (systemInstruction) {
          finalPrompt = `${systemInstruction}\n\n${prompt}`;
        }

        // Limit prompt length if specified
        if (maxTokens) {
          const estimatedTokens = this.estimateTokens(finalPrompt);
          if (estimatedTokens > maxTokens) {
            finalPrompt = this.truncateToTokenLimit(finalPrompt, maxTokens);
          }
        }

        console.log(`🧠 LLAMANDO GEMINI con prompt length: ${finalPrompt.length}`);
        const result = await this.geminiModel.generateContent(finalPrompt);
        const response = result.response;
        
        // Usar el método correcto para obtener el texto
        const responseText = response.text();
        console.log(`📝 RESPONSE TEXT:`, responseText, `(type: ${typeof responseText})`);

        if (!responseText) {
          throw new Error('Empty response from Gemini');
        }

        // Cache the response
        this.setCache(cacheKey, responseText);

        this.logger.debug('AI response generated successfully', {
          responseLength: responseText.length,
          retryCount,
          tokensUsed: this.estimateTokens(responseText)
        });

        return {
          success: true,
          content: responseText,
          tokensUsed: this.estimateTokens(responseText),
          retryCount
        };

      } catch (error) {
        retryCount++;
        
        this.logger.warn('AI generation attempt failed', {
          attempt: retryCount,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        if (retryCount > maxRetries) {
          this.logger.error('AI generation failed after all retries', {
            maxRetries,
            finalError: error instanceof Error ? error.message : 'Unknown error'
          });

          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            retryCount
          };
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        backoffMs *= 2;
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded',
      retryCount
    };
  }

  /**
   * MIGRADO DE: whatsapp-api/src/worker.js líneas 1981-2100
   * Build conversation context with history and agent configuration
   */
  public async buildConversationPrompt(
    userId: string,
    chatId: string,
    currentMessage: string,
    agentConfig: any,
    maxHistoryTokens: number = this.MAX_HISTORY_TOKENS_FOR_PROMPT
  ): Promise<string> {
    try {
      if (!agentConfig) {
        this.logger.error('No agent configuration provided for conversation prompt');
        return currentMessage;
      }

      const persona = agentConfig.persona || {};
      const knowledge = agentConfig.knowledge || {};
      const knowledgeFiles = knowledge.files || [];
      const knowledgeUrls = knowledge.urls || [];
      const writingSample = knowledge.writingSampleTxt || '';
      let personaInstructions = persona.instructions || 'Eres un asistente conversacional.';

      // Add URL instruction if URLs exist
      if (knowledgeUrls.length > 0) {
        const firstUrl = knowledgeUrls[0];
        const urlInstruction = `IMPORTANT GOAL: Your primary objective is to subtly guide the conversation towards encouraging the user to visit this link: ${firstUrl}. Mention it naturally when relevant.`;
        personaInstructions = `${urlInstruction}\n\n${personaInstructions}`;
      }

      // Get conversation history
      const conversationHistory = await this.getConversationHistory(
        userId,
        chatId,
        maxHistoryTokens
      );

      // Build the comprehensive prompt
      let fullPrompt = `INSTRUCCIONES DE PERSONALIDAD Y COMPORTAMIENTO:\n${personaInstructions}\n\n`;

      // Add persona details
      if (persona.name) {
        fullPrompt += `Tu nombre es: ${persona.name}\n`;
      }
      if (persona.role) {
        fullPrompt += `Tu rol es: ${persona.role}\n`;
      }
      if (persona.tone) {
        fullPrompt += `Tono de comunicación: ${persona.tone}\n`;
      }
      if (persona.style) {
        fullPrompt += `Estilo de comunicación: ${persona.style}\n`;
      }

      // Add knowledge base information
      if (knowledgeFiles.length > 0) {
        fullPrompt += `\nCONOCIMIENTO ESPECÍFICO:\n`;
        fullPrompt += `Tienes acceso a ${knowledgeFiles.length} archivo(s) de conocimiento específico.\n`;
      }

      // Add writing sample for style reference
      if (writingSample && writingSample.trim()) {
        fullPrompt += `\nEJEMPLO DE ESTILO DE ESCRITURA:\n"${writingSample.trim()}"\n`;
        fullPrompt += `Usa este ejemplo como referencia para tu estilo de escritura.\n`;
      }

      // Add conversation history
      if (conversationHistory.length > 0) {
        fullPrompt += `\nHISTORIAL DE CONVERSACIÓN RECIENTE:\n`;
        conversationHistory.forEach((item, index) => {
          const speaker = item.role === 'assistant' ? 'Tú' : 'Usuario';
          fullPrompt += `${speaker}: ${item.content}\n`;
        });
      }

      // Add current message
      fullPrompt += `\nMENSAJE ACTUAL DEL USUARIO:\n${currentMessage}\n\n`;
      fullPrompt += `INSTRUCCIÓN FINAL: Responde al mensaje actual considerando toda la información anterior, manteniendo tu personalidad y estilo establecidos.`;

      this.logger.debug('Conversation prompt built', {
        userId,
        chatId,
        promptLength: fullPrompt.length,
        historyItems: conversationHistory.length,
        estimatedTokens: this.estimateTokens(fullPrompt)
      });

      return fullPrompt;

    } catch (error) {
      this.logger.error('Error building conversation prompt', {
        userId,
        chatId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return currentMessage;
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/worker.js líneas 183-220
   * Check rate limiting for user requests
   */
  public checkRateLimit(userId: string): { allowed: boolean; waitTimeMs: number } {
    const now = Date.now();
    const userLimit = this.rateLimits.get(userId);

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or create new rate limit window
      this.rateLimits.set(userId, {
        count: 1,
        timestamps: [now],
        resetTime: now + this.RATE_LIMIT_WINDOW_MS
      });
      return { allowed: true, waitTimeMs: 0 };
    }

    // Clean old timestamps
    userLimit.timestamps = userLimit.timestamps.filter(
      timestamp => now - timestamp < this.RATE_LIMIT_WINDOW_MS
    );

    if (userLimit.timestamps.length >= this.MAX_REQUESTS_PER_MINUTE) {
      const oldestRequest = Math.min(...userLimit.timestamps);
      const waitTimeMs = this.RATE_LIMIT_WINDOW_MS - (now - oldestRequest);
      
      this.logger.warn('Rate limit exceeded for user', {
        userId,
        requestsInWindow: userLimit.timestamps.length,
        waitTimeMs
      });

      return { allowed: false, waitTimeMs };
    }

    // Add current request
    userLimit.timestamps.push(now);
    userLimit.count++;

    return { allowed: true, waitTimeMs: 0 };
  }

  /**
   * Generate response with conversation context for a specific chat
   */
  public async generateConversationResponse(
    userId: string,
    chatId: string,
    message: string,
    agentConfig: any,
    options: AIRequestOptions = {}
  ): Promise<AIResponse> {
    try {
      // Check rate limiting
      const rateLimitCheck = this.checkRateLimit(userId);
      if (!rateLimitCheck.allowed) {
        return {
          success: false,
          error: `Rate limit exceeded. Wait ${Math.ceil(rateLimitCheck.waitTimeMs / 1000)} seconds.`
        };
      }

      // Build conversation prompt
      const conversationPrompt = await this.buildConversationPrompt(
        userId,
        chatId,
        message,
        agentConfig,
        options.maxTokens
      );

      // Generate response
      const response = await this.generateResponse(conversationPrompt, options);

      // Track tokens for this conversation
      if (response.success && response.tokensUsed) {
        this.trackConversationTokens(userId, chatId, message, response.content!, response.tokensUsed);
      }

      return response;

    } catch (error) {
      this.logger.error('Error generating conversation response', {
        userId,
        chatId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate simple response for conversation starters
   */
  public async generateStarterResponse(
    starterPrompt: string,
    options: AIRequestOptions = {}
  ): Promise<AIResponse> {
    return await this.generateResponse(starterPrompt, {
      maxRetries: 2,
      ...options
    });
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 2808-3300
   * Generate assisted prompt for agent creation
   */
  public async generateAssistedPrompt(requestData: {
    objective: string;
    needsTools?: boolean;
    tools?: string;
    expectedInputs?: string;
    expectedOutputs?: string;
    agentNameOrRole?: string;
    companyOrContext?: string;
    targetAudience?: string;
    desiredTone?: string;
    keyInfoToInclude?: string;
    thingsToAvoid?: string;
    primaryCallToAction?: string;
    followupResponses?: any[];
  }): Promise<AIResponse> {
    try {
      const {
        objective,
        needsTools,
        tools,
        expectedInputs,
        expectedOutputs,
        agentNameOrRole,
        companyOrContext,
        targetAudience,
        desiredTone,
        keyInfoToInclude,
        thingsToAvoid,
        primaryCallToAction,
        followupResponses = []
      } = requestData;

      // Generate followup section
      let followupSection = '';
      if (followupResponses && followupResponses.length > 0) {
        followupSection = '\n\n12. **Información Adicional y Detalles de Seguimiento:**\n';

        followupResponses.forEach((item, index) => {
          if (item.question && (item.answer || item.selectedOptions)) {
            const responseValue = item.answer || 
              (Array.isArray(item.selectedOptions) 
                ? item.selectedOptions.join(', ') 
                : item.selectedOptions);

            if (responseValue && responseValue.trim()) {
              followupSection += `    ${String.fromCharCode(97 + index)}. **${item.question}**\n`;
              followupSection += `       ${responseValue}\n\n`;
            }
          }
        });
      }

      const metaPrompt = `Eres un experto en la creación de prompts detallados y efectivos para agentes de inteligencia artificial.
Tu tarea es generar un prompt de "instrucciones para la persona" para un nuevo agente IA, basándote en la siguiente información detallada proporcionada por el usuario:

1.  **Objetivo Principal del Agente:**
    ${objective}

2.  **Nombre o Rol del Agente:**
    ${agentNameOrRole || 'No especificado'}

3.  **Nombre de la Empresa o Contexto Principal:**
    ${companyOrContext || 'No especificado'}

4.  **Audiencia o Cliente Ideal:**
    ${targetAudience || 'No especificada'}

5.  **Tono de Comunicación Deseado:**
    ${desiredTone || 'Servicial y profesional por defecto'}

6.  **¿Necesita acceso a herramientas/funciones específicas?** ${needsTools ? 'Sí' : 'No'}
    ${needsTools && tools ? `    Herramientas Específicas: ${tools}` : ''}

7.  **Ejemplos de Entradas de Clientes (lo que el cliente podría decir/preguntar):**
    ${expectedInputs || 'No especificadas'}

8.  **Ejemplos de Salidas/Acciones del Agente (lo que el agente debe hacer/responder):**
    ${expectedOutputs || 'No especificadas'}

9.  **Información Clave que el Agente DEBE Incluir o Conocer:**
    ${keyInfoToInclude || 'Ninguna específica'}

10. **Cosas que el Agente DEBE EVITAR:**
    ${thingsToAvoid || 'Ninguna específica'}

11. **Principal Llamada a la Acción que el agente debe impulsar:**
    ${primaryCallToAction || 'Asistir al usuario y resolver su consulta de la mejor manera posible'}${followupSection}

INSTRUCCIONES PARA LA GENERACIÓN DEL PROMPT:
Por favor, redacta un conjunto de instrucciones claras, concisas y detalladas para la sección "Instrucciones de la Persona" de la configuración del agente IA.
El prompt generado debe:
- Ser directamente usable y copiable por el usuario para la configuración de su agente IA.
- Definir claramente la identidad del agente usando el "Nombre o Rol del Agente" y el "Nombre de la Empresa o Contexto".
- Guiar al agente para cumplir su "Objetivo Principal".
- Reflejar el "Tono de Comunicación Deseado" en el estilo y lenguaje del prompt.
- Incorporar la "Información Clave que el Agente DEBE Incluir o Conocer" en sus respuestas o comportamiento.
- Instruir al agente sobre las "Cosas que DEBE EVITAR".
- Si se especificaron "Herramientas", indicar cómo el agente podría interactuar con ellas o dirigir a los usuarios hacia ellas de forma natural.
- Considerar las "Entradas Esperadas" y "Salidas Esperadas" para definir interacciones y respuestas modelo.
- Orientar al agente hacia la "Principal Llamada a la Acción" de manera sutil y cuando sea apropiado.
- IMPORTANTE: Incorporar toda la "Información Adicional y Detalles de Seguimiento" de manera natural en el prompt.
- Ser lo suficientemente completo y detallado para que el agente tenga una base sólida para operar eficazmente.
- Estar redactado en español.

Evita cualquier comentario, introducción o explicación dirigida a mí (el asistente que te está pidiendo esto). Solo proporciona el texto del prompt para el agente IA, listo para ser usado.
Comienza directamente con la definición del agente (Ej: "Eres [Nombre del Agente/Rol]...").`;

      return await this.generateResponse(metaPrompt, {
        maxRetries: 2,
        maxTokens: 4000
      });

    } catch (error) {
      this.logger.error('Error generating assisted prompt', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Analyze sentiment of a message
   */
  public async analyzeSentiment(message: string): Promise<AIResponse> {
    const prompt = `Analyze the sentiment of the following message and respond with only one word: POSITIVE, NEGATIVE, or NEUTRAL.
    
Message: "${message}"

Sentiment:`;
    
    return await this.generateResponse(prompt, {
      maxTokens: 10,
      systemInstruction: 'You are a sentiment analysis tool. Respond with only one word: POSITIVE, NEGATIVE, or NEUTRAL.'
    });
  }

  /**
   * Summarize a conversation
   */
  public async summarizeConversation(messages: string[]): Promise<AIResponse> {
    const conversation = messages.join('\n');
    const prompt = `Summarize the following conversation in 2-3 sentences:

${conversation}

Summary:`;
    
    return await this.generateResponse(prompt, {
      maxTokens: 200,
      systemInstruction: 'You are a conversation summarizer. Provide concise, clear summaries.'
    });
  }

  /**
   * Generate follow-up questions
   */
  public async generateFollowUpQuestions(context: string): Promise<AIResponse> {
    const prompt = `Based on this context, generate 3 relevant follow-up questions:

Context: ${context}

Questions:`;
    
    return await this.generateResponse(prompt, {
      maxTokens: 300,
      systemInstruction: 'Generate helpful follow-up questions to continue the conversation.'
    });
  }

  /**
   * Generate auto-reply
   */
  public async generateAutoReply(message: string, context?: string): Promise<AIResponse> {
    const prompt = `Generate a helpful auto-reply for this message:

Message: "${message}"
${context ? `Context: ${context}` : ''}

Reply:`;
    
    return await this.generateResponse(prompt, {
      maxTokens: 200,
      systemInstruction: 'Generate friendly, helpful auto-replies.'
    });
  }

  /**
   * Health check for AI service
   */
  public async healthCheck(): Promise<{ status: string; model: string; initialized: boolean }> {
    return {
      status: this.isInitialized ? 'healthy' : 'unhealthy',
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      initialized: this.isInitialized
    };
  }

  /**
   * Get conversation history from database
   */
  private async getConversationHistory(
    userId: string,
    chatId: string,
    maxTokens: number = this.MAX_HISTORY_TOKENS_FOR_PROMPT
  ): Promise<ConversationHistoryItem[]> {
    try {
      const { data: messagesData, error } = await this.db
        .from('messages')
        .select('*')
        .eq('user_id', userId)
        .eq('chat_id', chatId)
        .order('timestamp', { ascending: false })
        .limit(12);

      if (error || !messagesData || messagesData.length === 0) {
        return [];
      }

      const messages: ConversationHistoryItem[] = [];
      let totalTokens = 0;

      // Process messages in reverse order (oldest first)
      const reverseMessages = messagesData.reverse();
      
      for (const msgData of reverseMessages) {
        
        if (msgData.body && msgData.body.trim()) {
          const estimatedTokens = this.estimateTokens(msgData.body);
          
          // Stop if adding this message would exceed token limit
          if (totalTokens + estimatedTokens > maxTokens) {
            break;
          }

          const role = (msgData.origin === 'bot' || (msgData.isFromMe === true && msgData.isAutoReply === true)) 
            ? 'assistant' 
            : 'user';

          messages.push({
            role,
            content: msgData.body,
            timestamp: msgData.timestamp?.toDate?.() || new Date(),
            estimatedTokens
          });

          totalTokens += estimatedTokens;
        }
      }

      this.logger.debug('Conversation history retrieved', {
        userId,
        chatId,
        messageCount: messages.length,
        totalTokens
      });

      return messages;

    } catch (error) {
      this.logger.error('Error getting conversation history', {
        userId,
        chatId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Track conversation tokens for rate limiting and context management
   */
  private trackConversationTokens(
    userId: string,
    chatId: string,
    userMessage: string,
    aiResponse: string,
    aiTokensUsed: number
  ): void {
    const key = `${userId}:${chatId}`;
    const existing = this.conversationTokens.get(key);
    
    const userTokens = this.estimateTokens(userMessage);
    const totalNewTokens = userTokens + aiTokensUsed;

    if (existing) {
      existing.totalTokens += totalNewTokens;
      existing.messageCount += 2; // User message + AI response
      existing.lastUpdated = new Date();
      existing.maxTokensReached = existing.totalTokens >= this.MAX_CONVERSATION_TOKENS;
    } else {
      this.conversationTokens.set(key, {
        chatId,
        userId,
        totalTokens: totalNewTokens,
        messageCount: 2,
        lastUpdated: new Date(),
        maxTokensReached: totalNewTokens >= this.MAX_CONVERSATION_TOKENS
      });
    }

    // Cleanup old tracking data
    this.cleanupOldTokenTracking();
  }

  /**
   * Estimate token count from text
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / this.TOKEN_ESTIMATE_RATIO);
  }

  /**
   * Truncate text to fit within token limit
   */
  private truncateToTokenLimit(text: string, maxTokens: number): string {
    const maxChars = maxTokens * this.TOKEN_ESTIMATE_RATIO;
    if (text.length <= maxChars) {
      return text;
    }

    // Try to truncate at word boundaries
    const truncated = text.substring(0, maxChars);
    const lastSpaceIndex = truncated.lastIndexOf(' ');
    
    if (lastSpaceIndex > maxChars * 0.8) {
      return truncated.substring(0, lastSpaceIndex) + '...';
    }
    
    return truncated + '...';
  }

  /**
   * Cache management
   */
  private generateCacheKey(prompt: string, systemInstruction?: string): string {
    const content = `${systemInstruction || ''}::${prompt}`;
    return Buffer.from(content).toString('base64').substring(0, 50);
  }

  private getFromCache(key: string): { content: string; timestamp: number } | null {
    const cached = this.responseCache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.CACHE_TTL_MS) {
      this.responseCache.delete(key);
      return null;
    }

    return cached;
  }

  private setCache(key: string, content: string): void {
    this.responseCache.set(key, {
      content,
      timestamp: Date.now()
    });

    // Cleanup old cache entries
    if (this.responseCache.size > 100) {
      const now = Date.now();
      for (const [k, v] of this.responseCache.entries()) {
        if (now - v.timestamp > this.CACHE_TTL_MS) {
          this.responseCache.delete(k);
        }
      }
    }
  }

  /**
   * Clear response cache - useful when agent switches
   */
  public clearResponseCache(): void {
    this.responseCache.clear();
    this.logger.debug('AI response cache cleared');
  }

  /**
   * Cleanup old token tracking data
   */
  private cleanupOldTokenTracking(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [key, tracking] of this.conversationTokens.entries()) {
      if (now - tracking.lastUpdated.getTime() > maxAge) {
        this.conversationTokens.delete(key);
      }
    }
  }

  /**
   * Get token tracking info for a conversation
   */
  public getTokenTracking(userId: string, chatId: string): TokenTracking | null {
    return this.conversationTokens.get(`${userId}:${chatId}`) || null;
  }

  /**
   * Get rate limit status for a user
   */
  public getRateLimitStatus(userId: string): RateLimitStatus {
    const userLimit = this.rateLimits.get(userId);
    const now = Date.now();

    if (!userLimit || now > userLimit.resetTime) {
      return {
        userId,
        requestsInLastMinute: 0,
        nextAllowedRequest: new Date(),
        isLimited: false
      };
    }

    const validTimestamps = userLimit.timestamps.filter(
      timestamp => now - timestamp < this.RATE_LIMIT_WINDOW_MS
    );

    const isLimited = validTimestamps.length >= this.MAX_REQUESTS_PER_MINUTE;
    const nextAllowedRequest = isLimited 
      ? new Date(Math.min(...validTimestamps) + this.RATE_LIMIT_WINDOW_MS)
      : new Date();

    return {
      userId,
      requestsInLastMinute: validTimestamps.length,
      nextAllowedRequest,
      isLimited
    };
  }

  /**
   * Clear rate limit for a user (admin function)
   */
  public clearRateLimit(userId: string): void {
    this.rateLimits.delete(userId);
    this.logger.info('Rate limit cleared for user', { userId });
  }

  /**
   * Get service status
   */
  public getStatus(): {
    isInitialized: boolean;
    rateLimitedUsers: number;
    activeConversations: number;
    cacheSize: number;
  } {
    return {
      isInitialized: this.isInitialized,
      rateLimitedUsers: Array.from(this.rateLimits.values())
        .filter(limit => limit.timestamps.length >= this.MAX_REQUESTS_PER_MINUTE).length,
      activeConversations: this.conversationTokens.size,
      cacheSize: this.responseCache.size
    };
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.logger.info('Cleaning up AI service');
    this.rateLimits.clear();
    this.conversationTokens.clear();
    this.responseCache.clear();
  }
} 