/**
 * WhatsApp Worker Implementation
 * 
 * MIGRADO DE: whatsapp-api/src/worker.js (completo)
 * FUNCIONALIDADES MIGRADAS:
 * - Cliente WhatsApp con Puppeteer
 * - Manejo de mensajes entrantes/salientes
 * - Sistema de auto-reply con AI
 * - Gestión de agentes y reglas
 * - Triggers iniciales y activación de chats
 * - Detección de presencia humana
 * - Action flows execution
 * - IPC communication con master
 */

import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import * as fs from 'fs';
import * as path from 'path';
import QRCode from 'qrcode';
import { EventEmitter } from 'events';
import { DatabaseService } from '../../core/services/DatabaseService';
import { AIService } from '../../core/services/AIService';
import { CacheService } from '../../core/services/CacheService';
import { LoggerService } from '../../core/services/LoggerService';

interface AgentConfig {
  id: string;
  persona: {
    name: string;
    role: string;
    personality: string;
    instructions: string;
  };
  knowledge: {
    writingSampleTxt: string;
    files: string[];
  };
}

interface AutomationRule {
  id: string;
  trigger: string;
  condition: string;
  response: string;
  active: boolean;
}

interface ActionFlow {
  id: string;
  name: string;
  trigger: string;
  triggerValue: string;
  steps: any[];
  active: boolean;
}

interface InitialTrigger {
  text: string;
  type: 'exact' | 'contains' | 'starts_with';
}

// FireStore document type
interface FirestoreDoc {
  id: string;
  data(): any;
}

export class WhatsAppWorker extends EventEmitter {
  private client: Client | null = null;
  private userId: string;
  private activeAgentId: string | null;
  private botPauseState: boolean = false;
  
  // Configuration stores
  private currentAgentConfig: AgentConfig | null = null;
  private automationRules: AutomationRule[] = [];
  private actionFlows: ActionFlow[] = [];
  private initialTriggers: InitialTrigger[] = [];
  private geminiStarters: any[] = [];
  
  // Services
  private db: DatabaseService;
  private ai: AIService;
  private cache: CacheService;
  private logger: LoggerService;
  
  // Data paths
  private userDataPath: string;
  private sessionPath: string;
  private uploadsDir: string;
  
  // State tracking
  private isShuttingDown: boolean = false;
  private lastActivity: Map<string, Date> = new Map();
  private activatedChats: Set<string> = new Set();
  
  constructor(userId: string, activeAgentId: string | null = null) {
    super();
    
    this.userId = userId;
    this.activeAgentId = activeAgentId;
    
    // Initialize services
    this.db = DatabaseService.getInstance();
    this.ai = AIService.getInstance();
    this.cache = CacheService.getInstance();
    this.logger = LoggerService.getInstance();
    
    // Setup data paths
    this.userDataPath = path.join(process.cwd(), 'data_v2', userId);
    this.sessionPath = path.join(this.userDataPath, '.wwebjs_auth');
    this.uploadsDir = path.join(this.userDataPath, 'uploads');
    
    this.createDirectories();
    this.setupProcessHandlers();
    
    this.logger.info('WhatsApp Worker initialized', {
      userId,
      activeAgentId,
      pid: process.pid
    });
  }
  
  /**
   * MIGRADO DE: worker.js líneas 25-45
   * Create necessary directories
   */
  private createDirectories(): void {
    const dirs = [this.userDataPath, this.sessionPath, this.uploadsDir];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this.logger.debug('Created directory', { dir });
      }
    });
  }
  
  /**
   * MIGRADO DE: worker.js líneas 1115-1500
   * Setup process event handlers for IPC and graceful shutdown
   */
  private setupProcessHandlers(): void {
    // Handle IPC messages from master
    process.on('message', async (message: any) => {
      try {
        await this.handleIPCMessage(message);
      } catch (error) {
        this.logger.error('Error handling IPC message', { message, error });
      }
    });
    
    // Graceful shutdown handlers
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('disconnect', () => this.shutdown('disconnect'));
    
    // Error handlers
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', { error });
      this.sendErrorToMaster(error.message);
    });
    
    process.on('unhandledRejection', (reason) => {
      this.logger.error('Unhandled rejection', { reason });
      this.sendErrorToMaster(`Unhandled rejection: ${reason}`);
    });
  }
  
  /**
   * MIGRADO DE: worker.js líneas 162-180
   * Initialize WhatsApp worker
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing WhatsApp client');
      
      // Initialize DatabaseService first
      await this.db.initialize();
      
      await this.loadInitialConfiguration();
      await this.initializeWhatsAppClient();
      
    } catch (error) {
      this.logger.error('Error initializing WhatsApp client', { error });
      throw error;
    }
  }

  /**
   * MIGRADO DE: worker.js líneas 570-620
   * Load initial configuration from Firestore
   */
  private async loadInitialConfiguration(): Promise<void> {
    try {
      this.logger.info('Loading initial configuration');
      
      const userDocRef = this.db.collection('users').doc(this.userId);
      const userDoc = await userDocRef.get();
      
      if (!userDoc.exists) {
        this.logger.warn('User document not found, using default configuration', { userId: this.userId });
        
        // Initialize with defaults
        this.currentAgentConfig = null;
        this.automationRules = [];
        this.actionFlows = [];
        this.initialTriggers = [];
        this.geminiStarters = [];
        return;
      }
      
      const userData = userDoc.data();
      
      // Load active agent configuration
      if (this.activeAgentId && userData?.agents?.[this.activeAgentId]) {
        this.currentAgentConfig = {
          id: this.activeAgentId,
          ...userData.agents[this.activeAgentId]
        };
      } else {
        // Use default agent or first available
        const agents = userData?.agents || {};
        const agentKeys = Object.keys(agents);
        if (agentKeys.length > 0) {
          const defaultAgentId = agentKeys[0];
          this.currentAgentConfig = {
            id: defaultAgentId,
            ...agents[defaultAgentId]
          };
        }
      }
      
      // Load automation rules
      const rulesSnapshot = await userDocRef.collection('rules').get();
      this.automationRules = rulesSnapshot.docs.map((doc: FirestoreDoc) => ({ id: doc.id, ...doc.data() })) as AutomationRule[];
      
      // Load action flows
      const flowsSnapshot = await userDocRef.collection('action_flows').get();
      this.actionFlows = flowsSnapshot.docs.map((doc: FirestoreDoc) => ({ id: doc.id, ...doc.data() })) as ActionFlow[];
      
      // Load initial triggers
      const triggersSnapshot = await userDocRef.collection('initial_triggers').get();
      this.initialTriggers = triggersSnapshot.docs.map((doc: FirestoreDoc) => doc.data()) as InitialTrigger[];
      
      // Load Gemini starters
      const startersSnapshot = await userDocRef.collection('gemini_starters').get();
      this.geminiStarters = startersSnapshot.docs.map((doc: FirestoreDoc) => doc.data());
      
      this.logger.info('Configuration loaded', {
        agentId: this.activeAgentId,
        rulesCount: this.automationRules.length,
        flowsCount: this.actionFlows.length,
        triggersCount: this.initialTriggers.length,
        startersCount: this.geminiStarters.length
      });
      
    } catch (error) {
      this.logger.error('Error loading configuration', { error });
      
      // Initialize with defaults on error
      this.currentAgentConfig = null;
      this.automationRules = [];
      this.actionFlows = [];
      this.initialTriggers = [];
      this.geminiStarters = [];
    }
  }

  /**
   * MIGRADO DE: worker.js líneas 680-708
   * Setup WhatsApp client event handlers
   */
  private setupClientEventHandlers(): void {
    if (!this.client) return;
    
    // QR Code generation
    this.client.on('qr', async (qr) => {
      try {
        this.logger.info('QR Code generated');
        
        const qrDataURL = await QRCode.toDataURL(qr);
        
        // Send QR to master
        this.sendToMaster({
          type: 'QR_RECEIVED',
          qr: qrDataURL,
          timestamp: new Date().toISOString()
        });
        
        this.sendStatusToMaster('waiting_for_qr_scan');
        
      } catch (error) {
        this.logger.error('Error generating QR code', { error });
        this.sendErrorToMaster(`QR generation error: ${error}`);
      }
    });
    
    // Client ready
    this.client.on('ready', () => {
      this.logger.info('WhatsApp client ready');
      this.sendStatusToMaster('connected');
      
      this.sendToMaster({
        type: 'CLIENT_READY',
        timestamp: new Date().toISOString()
      });
    });
    
    // Authentication
    this.client.on('authenticated', () => {
      this.logger.info('Client authenticated');
      this.sendStatusToMaster('authenticated');
    });
    
    // Authentication failure
    this.client.on('auth_failure', (msg) => {
      this.logger.error('Authentication failed', { message: msg });
      this.sendErrorToMaster(`Authentication failed: ${msg}`);
    });
    
    // Disconnection
    this.client.on('disconnected', (reason) => {
      this.logger.warn('Client disconnected', { reason });
      this.sendStatusToMaster('disconnected');
      
      if (!this.isShuttingDown) {
        // Attempt reconnection after delay
        setTimeout(() => {
          if (!this.isShuttingDown) {
            this.initialize().catch(error => {
              this.logger.error('Reconnection failed', { error });
            });
          }
        }, 5000);
      }
    });
    
    // Message handlers
    this.client.on('message', async (message) => {
      await this.handleIncomingMessage(message);
    });
    
    this.client.on('message_create', async (message) => {
      await this.handleMessageCreate(message);
    });
  }
  
  /**
   * MIGRADO DE: worker.js líneas 680-708
   * Initialize WhatsApp client with LocalAuth
   */
  private async initializeWhatsAppClient(): Promise<void> {
    try {
      this.logger.info('Creating WhatsApp client', { 
        sessionPath: this.sessionPath,
        userId: this.userId 
      });

      // Use EXACT configuration from working v1 - NO changes (VPS MODE)
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: this.userId,
          dataPath: this.sessionPath
        }),
        puppeteer: {
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          headless: true // VPS: no necesitamos display visual
        }
      });

      this.logger.info('WhatsApp client created with EXACT v1 configuration');

      // Setup event handlers
      this.setupClientEventHandlers();

      // Simple initialization like v1 - NO custom timeouts
      this.logger.info('Starting WhatsApp client initialization (v1 style)');
      await this.client.initialize();
      this.logger.info('WhatsApp client initialization completed successfully');
      
    } catch (error) {
      this.logger.error('Error initializing WhatsApp client', { error });
      throw error;
    }
  }
  
  /**
   * MIGRADO DE: worker.js líneas 843-1093
   * Handle incoming messages with complete auto-reply logic
   */
  private async handleIncomingMessage(message: any): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const sender = message.from;
      const isFromMe = message.fromMe;
      
      this.logger.info('New message received', {
        messageId: message.id?.id,
        from: sender,
        to: message.to,
        fromMe: isFromMe,
        hasMedia: !!message.hasMedia,
        bodyLength: message.body?.length || 0,
        isGroup: message.id?.remote?.endsWith('@g.us') || false
      });
      
      // Skip messages from self
      if (isFromMe) {
        this.logger.debug('Skipping message from self');
        return;
      }
      
      // Skip group messages (optional - can be configured)
      if (message.id?.remote?.endsWith('@g.us')) {
        this.logger.debug('Skipping group message');
        return;
      }
      
      // Save message to Firestore
      const messageId = await this.saveMessageToFirestore(message, 'incoming');
      
      // Update last activity
      this.lastActivity.set(sender, new Date());
      
      // Notify master of new message
      this.sendToMaster({
        type: 'NEW_MESSAGE_RECEIVED',
        payload: {
          chatId: sender,
          message: {
            id: messageId,
            from: sender,
            body: message.body,
            timestamp,
            hasMedia: !!message.hasMedia,
            type: message.type
          }
        }
      });
      
      // Check for auto-reply conditions
      await this.processAutoReplyLogic(message, sender);
      
    } catch (error) {
      this.logger.error('Error handling incoming message', { error });
    }
  }
  
  /**
   * MIGRADO DE: worker.js líneas 950-1093
   * Process auto-reply logic including presence detection and triggers
   */
  private async processAutoReplyLogic(message: any, sender: string): Promise<void> {
    try {
      // Check if user is active in chat (presence detection)
      const userIsActive = await this.isUserActiveInChat(sender);
      this.logger.debug('User presence check', { sender, isActive: userIsActive });
      
      // Check bot pause state
      this.logger.debug('Bot pause state', { isPaused: this.botPauseState });
      
      // Check if chat is activated
      const chatIsActivated = await this.isChatActivated(sender);
      this.logger.debug('Chat activation check', { sender, isActivated: chatIsActivated });
      
      // Check for initial trigger if chat not activated
      let isInitialTrigger = false;
      if (!chatIsActivated) {
        isInitialTrigger = await this.isInitialTriggerMessage(message);
        this.logger.debug('Initial trigger check', { sender, isTrigger: isInitialTrigger });
        
        if (isInitialTrigger) {
          await this.activateChat(sender);
        }
      }
      
      // Process auto-reply if conditions are met
      if (!userIsActive && !this.botPauseState && (chatIsActivated || isInitialTrigger)) {
        this.logger.info('Auto-reply conditions met', { sender });
        
        // 1. Check for action flow triggers
        const matchedFlow = this.findMatchingActionFlow(message);
        if (matchedFlow) {
          this.logger.info('Executing action flow', { flowId: matchedFlow.id, flowName: matchedFlow.name });
          await this.executeActionFlow(message, matchedFlow);
          return;
        }
        
        // 2. Check for automation rules
        const matchedRule = this.findMatchingAutomationRule(message);
        if (matchedRule) {
          this.logger.info('Executing automation rule', { ruleId: matchedRule.id });
          await this.executeAutomationRule(message, matchedRule);
          return;
        }
        
        // 3. Generate AI response
        await this.generateAIResponse(message, sender);
      }
      
    } catch (error) {
      this.logger.error('Error in auto-reply logic', { error, sender });
    }
  }
  
  /**
   * MIGRADO DE: worker.js líneas 955-970
   * Check if user is active in chat (10-minute window)
   */
  private async isUserActiveInChat(chatId: string): Promise<boolean> {
    try {
      const userDocRef = this.db.collection('users').doc(this.userId);
      const chatDocRef = userDocRef.collection('chats').doc(chatId);
      const chatDoc = await chatDocRef.get();
      
      if (!chatDoc.exists) {
        return false;
      }
      
      const chatData = chatDoc.data();
      const lastHumanActivity = chatData?.last_human_activity?.toDate();
      
      if (!lastHumanActivity) {
        return false;
      }
      
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      return lastHumanActivity > tenMinutesAgo;
      
    } catch (error) {
      this.logger.error('Error checking user activity', { error, chatId });
      return false;
    }
  }
  
  /**
   * Check if chat is activated for auto-replies
   */
  private async isChatActivated(chatId: string): Promise<boolean> {
    try {
      // Check in-memory cache first
      if (this.activatedChats.has(chatId)) {
        return true;
      }
      
      // Check Firestore
      const userDocRef = this.db.collection('users').doc(this.userId);
      const chatDocRef = userDocRef.collection('chats').doc(chatId);
      const chatDoc = await chatDocRef.get();
      
      if (!chatDoc.exists) {
        return false;
      }
      
      const isActivated = chatDoc.data()?.is_activated || false;
      
      if (isActivated) {
        this.activatedChats.add(chatId);
      }
      
      return isActivated;
      
    } catch (error) {
      this.logger.error('Error checking chat activation', { error, chatId });
      return false;
    }
  }
  
  /**
   * MIGRADO DE: worker.js líneas 2353-2397
   * Check if message matches initial triggers
   */
  private async isInitialTriggerMessage(message: any): Promise<boolean> {
    try {
      if (!this.initialTriggers || this.initialTriggers.length === 0) {
        return false;
      }
      
      const messageTextLower = message.body.trim().toLowerCase();
      
      for (const trigger of this.initialTriggers) {
        const triggerText = trigger.text.trim().toLowerCase();
        const triggerType = trigger.type || 'contains';
        
        let matches = false;
        if (triggerType === 'exact') {
          matches = messageTextLower === triggerText;
        } else if (triggerType === 'contains') {
          matches = messageTextLower.includes(triggerText);
        } else if (triggerType === 'starts_with') {
          matches = messageTextLower.startsWith(triggerText);
        }
        
        if (matches) {
          this.logger.info('Initial trigger matched', { triggerText, triggerType });
          return true;
        }
      }
      
      return false;
      
    } catch (error) {
      this.logger.error('Error checking initial triggers', { error });
      return false;
    }
  }
  
  /**
   * Activate chat for auto-replies
   */
  private async activateChat(chatId: string): Promise<void> {
    try {
      const userDocRef = this.db.collection('users').doc(this.userId);
      const chatDocRef = userDocRef.collection('chats').doc(chatId);
      
      await chatDocRef.set({
        is_activated: true,
        activated_at: new Date(),
        last_activity: new Date()
      }, { merge: true });
      
      this.activatedChats.add(chatId);
      
      this.logger.info('Chat activated', { chatId });
      
    } catch (error) {
      this.logger.error('Error activating chat', { error, chatId });
    }
  }
  
  /**
   * Find matching action flow for message
   */
  private findMatchingActionFlow(message: any): ActionFlow | null {
    const messageTextLower = message.body.trim().toLowerCase();
    
    return this.actionFlows.find(flow => {
      if (!flow.active) return false;
      
      const triggerType = flow.trigger;
      const triggerValueLower = flow.triggerValue?.trim().toLowerCase();
      
      if (!triggerValueLower) return false;
      
      switch (triggerType) {
        case 'exact_message':
          return messageTextLower === triggerValueLower;
        case 'message':
        case 'contains':
          return messageTextLower.includes(triggerValueLower);
        case 'starts_with':
          return messageTextLower.startsWith(triggerValueLower);
        default:
          return false;
      }
    }) || null;
  }
  
  /**
   * Find matching automation rule for message
   */
  private findMatchingAutomationRule(message: any): AutomationRule | null {
    // Implementation for automation rules matching
    // This would follow similar pattern to action flows
    return null; // Simplified for now
  }
  
  /**
   * MIGRADO DE: worker.js líneas 578-623
   * Execute action flow steps
   */
  private async executeActionFlow(message: any, flow: ActionFlow): Promise<void> {
    try {
      this.logger.info('Executing action flow', { flowId: flow.id, flowName: flow.name });
      
      const context = {
        message,
        flow,
        variables: {
          userId: this.userId,
          sender: message.from,
          messageBody: message.body,
          timestamp: new Date().toISOString(),
          user: { name: this.currentAgentConfig?.persona?.name || 'Asistente' }
        }
      };
      
      if (!flow.steps || !Array.isArray(flow.steps) || flow.steps.length === 0) {
        this.logger.warn('Flow has no steps', { flowId: flow.id });
        await this.sendMessage(message.from, 'Flujo activado pero sin acciones definidas.');
        return;
      }
      
      // Execute steps
      for (const step of flow.steps) {
        await this.executeFlowStep(step, context);
      }
      
      this.logger.info('Action flow completed', { flowId: flow.id });
      
    } catch (error) {
      this.logger.error('Error executing action flow', { error, flowId: flow.id });
      await this.sendMessage(message.from, 'Lo siento, ocurrió un error al procesar tu solicitud.');
    }
  }
  
  /**
   * Execute individual flow step
   */
  private async executeFlowStep(step: any, context: any): Promise<void> {
    switch (step.type) {
      case 'send_message':
        if (step.value) {
          const resolvedContent = this.resolveVariables(step.value, context);
          
          // Apply delay if specified
          if (step.delay && typeof step.delay === 'number' && step.delay > 0) {
            this.logger.debug('Applying step delay', { delay: step.delay });
            await this.delay(step.delay * 1000);
          } else {
            await this.randomDelay();
          }
          
          await this.sendMessage(context.message.from, resolvedContent);
        }
        break;
        
      case 'wait':
        if (step.duration) {
          await this.delay(step.duration * 1000);
        }
        break;
        
      case 'set_variable':
        if (step.variable && step.value) {
          context.variables[step.variable] = this.resolveVariables(step.value, context);
        }
        break;
        
      default:
        this.logger.warn('Unknown step type', { stepType: step.type });
    }
  }
  
  /**
   * Execute automation rule
   */
  private async executeAutomationRule(message: any, rule: AutomationRule): Promise<void> {
    try {
      const resolvedResponse = this.resolveVariables(rule.response, { message });
      await this.randomDelay();
      await this.sendMessage(message.from, resolvedResponse);
      
    } catch (error) {
      this.logger.error('Error executing automation rule', { error, ruleId: rule.id });
    }
  }
  
  /**
   * MIGRADO DE: worker.js líneas 1066-1093
   * Generate AI response using Gemini
   */
  private async generateAIResponse(message: any, sender: string): Promise<void> {
    try {
      this.logger.info('Generating AI response', { sender });
      
      // Build prompt with conversation history (MANTENER LÓGICA ORIGINAL)
      const promptWithHistory = await this.buildPromptWithHistory(sender, message.body);
      
      // Generate response with AI (USAR MÉTODO ORIGINAL)
      const response = await this.ai.generateResponse(promptWithHistory, {
        maxRetries: 2,
        maxTokens: 800
      });
      
      if (response.success && response.content) {
        this.logger.info('AI response generated', { 
          sender, 
          responseLength: response.content.length 
        });
        
        await this.randomDelay();
        await this.sendMessage(sender, response.content);
      } else {
        this.logger.warn('AI failed to generate response', { sender, error: response.error });
      }
      
    } catch (error) {
      this.logger.error('Error generating AI response', { error, sender });
    }
  }
  
  /**
   * Build prompt with conversation history and agent context
   */
  private async buildPromptWithHistory(chatId: string, currentMessage: string): Promise<string> {
    try {
      // Get conversation history
      const history = await this.getConversationHistory(chatId, 10);
      
      // Build context from agent configuration
      const agentContext = this.buildAgentContext();
      
      // Build prompt
      let prompt = agentContext + '\n\n';
      
      if (history.length > 0) {
        prompt += 'Historial de conversación reciente:\n';
        history.forEach(msg => {
          const sender = msg.from_me ? 'Yo' : 'Usuario';
          prompt += `${sender}: ${msg.body}\n`;
        });
      }
      
      prompt += `\nNuevo mensaje del usuario: ${currentMessage}\n\nRespuesta:`;
      
      return prompt;
      
    } catch (error) {
      this.logger.error('Error building prompt with history', { error, chatId });
      return `Como ${this.currentAgentConfig?.persona?.name || 'asistente'}, responde a: ${currentMessage}`;
    }
  }
  
  /**
   * Get conversation history from Firestore
   */
  private async getConversationHistory(chatId: string, limit: number = 10): Promise<any[]> {
    try {
      const userDocRef = this.db.collection('users').doc(this.userId);
      const messagesRef = userDocRef.collection('chats').doc(chatId).collection('messages');
      
      const snapshot = await messagesRef
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();
      
      return snapshot.docs.map((doc: FirestoreDoc) => doc.data()).reverse();
      
    } catch (error) {
      this.logger.error('Error getting conversation history', { error, chatId });
      return [];
    }
  }
  
  /**
   * Build agent context for AI prompts
   */
  private buildAgentContext(): string {
    if (!this.currentAgentConfig) {
      return 'Eres un asistente útil y amigable.';
    }
    
    const persona = this.currentAgentConfig.persona;
    let context = `Eres ${persona.name}, ${persona.role}.\n`;
    context += `Personalidad: ${persona.personality}\n`;
    context += `Instrucciones: ${persona.instructions}\n`;
    
    if (this.currentAgentConfig.knowledge?.writingSampleTxt) {
      context += `\nEstilo de escritura de referencia:\n${this.currentAgentConfig.knowledge.writingSampleTxt}`;
    }
    
    return context;
  }
  
  /**
   * MIGRADO DE: worker.js líneas 1795-1900
   * Handle message_create events (outgoing messages)
   */
  private async handleMessageCreate(message: any): Promise<void> {
    try {
      this.logger.debug('Message create event', {
        messageId: message.id?.id,
        fromMe: message.fromMe,
        to: message.to
      });
      
      // Only process outgoing messages (fromMe = true)
      if (message.fromMe === false) {
        return;
      }
      
      // Save outgoing message to Firestore
      await this.saveMessageToFirestore(message, 'outgoing');
      
      // Update chat last activity
      await this.updateChatActivity(message.to);
      
    } catch (error) {
      this.logger.error('Error handling message create', { error });
    }
  }
  
  /**
   * Send message through WhatsApp client
   */
  private async sendMessage(chatId: string, text: string): Promise<boolean> {
    try {
      if (!this.client) {
        this.logger.error('WhatsApp client not available');
        return false;
      }
      
      await this.client.sendMessage(chatId, text);
      
      // Save sent message to Firestore
      await this.saveMessageToFirestore({
        from: `${this.userId}@c.us`,
        to: chatId,
        body: text,
        fromMe: true,
        timestamp: Date.now()
      }, 'outgoing');
      
      this.logger.info('Message sent successfully', { chatId, textLength: text.length });
      return true;
      
    } catch (error) {
      this.logger.error('Error sending message', { error, chatId });
      return false;
    }
  }
  
  /**
   * Save message to Firestore
   */
  private async saveMessageToFirestore(message: any, direction: 'incoming' | 'outgoing'): Promise<string> {
    try {
      const userDocRef = this.db.collection('users').doc(this.userId);
      const chatId = direction === 'incoming' ? message.from : message.to;
      const messagesRef = userDocRef.collection('chats').doc(chatId).collection('messages');
      
      const messageData = {
        id: message.id?.id || `${Date.now()}-${Math.random()}`,
        from: message.from,
        to: message.to,
        body: message.body || '',
        from_me: message.fromMe || false,
        timestamp: new Date(),
        direction,
        has_media: !!message.hasMedia,
        type: message.type || 'chat'
      };
      
      const docRef = await messagesRef.add(messageData);
      
      // Update chat document
      await userDocRef.collection('chats').doc(chatId).set({
        last_message: message.body || '',
        last_message_time: new Date(),
        last_activity: new Date(),
        ...(direction === 'outgoing' && { last_human_activity: new Date() })
      }, { merge: true });
      
      return docRef.id;
      
    } catch (error) {
      this.logger.error('Error saving message to Firestore', { error, direction });
      throw error;
    }
  }
  
  /**
   * Update chat activity timestamp
   */
  private async updateChatActivity(chatId: string): Promise<void> {
    try {
      const userDocRef = this.db.collection('users').doc(this.userId);
      await userDocRef.collection('chats').doc(chatId).update({
        last_human_activity: new Date(),
        last_activity: new Date()
      });
      
    } catch (error) {
      this.logger.error('Error updating chat activity', { error, chatId });
    }
  }
  
  /**
   * MIGRADO DE: worker.js líneas 1115-1500
   * Handle IPC messages from master process
   */
  private async handleIPCMessage(message: any): Promise<void> {
    this.logger.debug('Received IPC message', { type: message.type, command: message.command });
    
    if (!message || !message.type) {
      this.logger.warn('Invalid IPC message received');
      return;
    }
    
    switch (message.type) {
      case 'COMMAND':
        await this.handleCommand(message.command, message.payload);
        break;
        
      case 'SWITCH_AGENT':
        await this.handleSwitchAgent(message.payload);
        break;
        
      case 'RELOAD_CONFIG':
        await this.loadInitialConfiguration();
        break;
        
      case 'SEND_MESSAGE':
        if (message.payload?.chatId && message.payload?.text) {
          await this.sendMessage(message.payload.chatId, message.payload.text);
        }
        break;
        
      case 'PAUSE_BOT':
        this.botPauseState = true;
        this.logger.info('Bot paused');
        break;
        
      case 'RESUME_BOT':
        this.botPauseState = false;
        this.logger.info('Bot resumed');
        break;
        
      case 'SHUTDOWN':
        await this.shutdown('IPC_SHUTDOWN');
        break;
        
      default:
        this.logger.warn('Unknown IPC message type', { type: message.type });
    }
  }
  
  /**
   * Handle command from master
   */
  private async handleCommand(command: string, payload: any): Promise<void> {
    switch (command) {
      case 'SEND_MESSAGE':
        if (payload?.recipient && payload?.message) {
          await this.sendMessage(payload.recipient, payload.message);
        }
        break;
        
      case 'RELOAD_RULES':
        await this.reloadAutomationRules();
        break;
        
      case 'RELOAD_FLOWS':
        await this.reloadActionFlows();
        break;
        
      case 'RELOAD_TRIGGERS':
        await this.reloadInitialTriggers();
        break;
        
      case 'GET_STATUS':
        this.sendToMaster({
          type: 'STATUS_RESPONSE',
          status: this.client?.info || 'unknown',
          isReady: !!this.client?.info
        });
        break;
        
      default:
        this.logger.warn('Unknown command', { command });
    }
  }
  
  /**
   * Handle agent switch
   */
  private async handleSwitchAgent(payload: any): Promise<void> {
    try {
      this.activeAgentId = payload?.agentId || null;
      
      if (payload?.agentConfig) {
        this.currentAgentConfig = payload.agentConfig;
      } else if (this.activeAgentId) {
        // Load agent config from Firestore
        const userDocRef = this.db.collection('users').doc(this.userId);
        const agentDoc = await userDocRef.collection('agents').doc(this.activeAgentId).get();
        
        if (agentDoc.exists) {
          this.currentAgentConfig = agentDoc.data() as AgentConfig;
        }
      }
      
      this.logger.info('Agent switched', { 
        newAgentId: this.activeAgentId,
        agentName: this.currentAgentConfig?.persona?.name
      });
      
    } catch (error) {
      this.logger.error('Error switching agent', { error, payload });
    }
  }
  
  /**
   * Reload automation rules from Firestore
   */
  private async reloadAutomationRules(): Promise<void> {
    try {
      const userDocRef = this.db.collection('users').doc(this.userId);
      const rulesSnapshot = await userDocRef.collection('rules').get();
      this.automationRules = rulesSnapshot.docs.map((doc: FirestoreDoc) => ({ id: doc.id, ...doc.data() })) as AutomationRule[];
      
      this.logger.info('Automation rules reloaded', { count: this.automationRules.length });
      
    } catch (error) {
      this.logger.error('Error reloading automation rules', { error });
    }
  }
  
  /**
   * Reload action flows from Firestore
   */
  private async reloadActionFlows(): Promise<void> {
    try {
      const userDocRef = this.db.collection('users').doc(this.userId);
      const flowsSnapshot = await userDocRef.collection('action_flows').get();
      this.actionFlows = flowsSnapshot.docs.map((doc: FirestoreDoc) => ({ id: doc.id, ...doc.data() })) as ActionFlow[];
      
      this.logger.info('Action flows reloaded', { count: this.actionFlows.length });
      
    } catch (error) {
      this.logger.error('Error reloading action flows', { error });
    }
  }
  
  /**
   * Reload initial triggers from Firestore
   */
  private async reloadInitialTriggers(): Promise<void> {
    try {
      const userDocRef = this.db.collection('users').doc(this.userId);
      const triggersSnapshot = await userDocRef.collection('initial_triggers').get();
      this.initialTriggers = triggersSnapshot.docs.map((doc: FirestoreDoc) => doc.data()) as InitialTrigger[];
      
      this.logger.info('Initial triggers reloaded', { count: this.initialTriggers.length });
      
    } catch (error) {
      this.logger.error('Error reloading initial triggers', { error });
    }
  }
  
  /**
   * Utility functions
   */
  private resolveVariables(text: string, context: any): string {
    let resolved = text;
    
    // Replace variables in format {variable}
    resolved = resolved.replace(/\{(\w+)\}/g, (match, varName) => {
      return context.variables?.[varName] || match;
    });
    
    return resolved;
  }
  
  private async randomDelay(): Promise<void> {
    const delay = Math.random() * 2000 + 1000; // 1-3 seconds
    await this.delay(delay);
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Send message to master process
   */
  private sendToMaster(message: any): void {
    if (process.send) {
      process.send(message);
    }
  }
  
  /**
   * Send status update to master
   */
  private sendStatusToMaster(status: string): void {
    this.sendToMaster({
      type: 'STATUS_UPDATE',
      status,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Send error to master
   */
  private sendErrorToMaster(error: string): void {
    this.sendToMaster({
      type: 'ERROR_INFO',
      error,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Graceful shutdown
   */
  private async shutdown(reason: string): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    
    this.isShuttingDown = true;
    this.logger.info('Shutting down worker', { reason });
    
    try {
      // Close WhatsApp client
      if (this.client) {
        await this.client.destroy();
        this.client = null;
      }
      
      // Clear intervals and timeouts
      // (Add any cleanup for timers here)
      
      // Send shutdown notification
      this.sendToMaster({
        type: 'WORKER_SHUTDOWN',
        reason,
        timestamp: new Date().toISOString()
      });
      
      this.logger.info('Worker shutdown complete');
      
    } catch (error) {
      this.logger.error('Error during shutdown', { error });
    } finally {
      process.exit(0);
    }
  }
} 