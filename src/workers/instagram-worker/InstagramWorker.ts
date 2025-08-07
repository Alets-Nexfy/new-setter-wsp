/**
 * Instagram Worker Implementation
 * 
 * FUNCIONALIDADES:
 * - Cliente Instagram con Puppeteer
 * - Manejo de mensajes directos
 * - Sistema de auto-reply con AI
 * - Gestión de agentes específicos para Instagram
 * - Triggers iniciales y activación de chats
 * - IPC communication con master
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { SupabaseService } from '../../core/services/SupabaseService';
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

interface InstagramMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isFromMe: boolean;
}

export class InstagramWorker extends EventEmitter {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private userId: string;
  private activeAgentId: string | null;
  private botPauseState: boolean = false;
  private isLoggedIn: boolean = false;
  
  // Configuration stores
  private currentAgentConfig: AgentConfig | null = null;
  private actionFlows: any[] = [];
  private initialTriggers: any[] = [];
  
  // Services
  private db: SupabaseService;
  private ai: AIService;
  private cache: CacheService;
  private logger: LoggerService;
  
  // Data paths
  private userDataPath: string;
  private sessionPath: string;
  
  // State tracking
  private isShuttingDown: boolean = false;
  private lastActivity: Map<string, Date> = new Map();
  private activatedChats: Set<string> = new Set();
  private messageCheckInterval: NodeJS.Timeout | null = null;
  
  constructor(userId: string, activeAgentId: string | null = null) {
    super();
    
    this.userId = userId;
    this.activeAgentId = activeAgentId;
    
    // Initialize services
    this.db = SupabaseService.getInstance();
    this.ai = AIService.getInstance();
    this.cache = CacheService.getInstance();
    this.logger = LoggerService.getInstance();
    
    // Setup data paths
    this.userDataPath = path.join(process.cwd(), 'data_v2', userId);
    this.sessionPath = path.join(this.userDataPath, '.instagram_auth');
    
    this.createDirectories();
    this.setupProcessHandlers();
    
    this.logger.info('Instagram Worker initialized', {
      userId,
      activeAgentId,
      pid: process.pid
    });
  }
  
  /**
   * Create necessary directories
   */
  private createDirectories(): void {
    const dirs = [this.userDataPath, this.sessionPath];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this.logger.debug('Created directory', { dir });
      }
    });
  }
  
  /**
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
   * Initialize Instagram session with Puppeteer
   */
  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Instagram client');
      
      // Send connecting status to master
      this.sendStatusToMaster('connecting');
      
      // Load initial configuration
      await this.loadInitialConfiguration();
      
      // Launch browser
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ],
        userDataDir: this.sessionPath
      });
      
      this.page = await this.browser.newPage();
      
      // Set user agent
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      
      // Check if already logged in
      await this.checkLoginStatus();
      
      if (!this.isLoggedIn) {
        // Need to login
        await this.initiateLogin();
      } else {
        // Already logged in, start monitoring
        await this.startMessageMonitoring();
      }
      
    } catch (error) {
      this.logger.error('Error initializing Instagram client', { error });
      this.sendErrorToMaster(`Initialization error: ${error}`);
      throw error;
    }
  }
  
  /**
   * Load initial configuration from Firestore
   */
  private async loadInitialConfiguration(): Promise<void> {
    try {
      this.logger.info('Loading initial configuration');
      
      const userDocRef = this.db.collection('users').doc(this.userId);
      
      // Load agent configuration
      if (this.activeAgentId) {
        const agentDoc = await userDocRef.collection('agents').doc(this.activeAgentId).get();
        if (agentDoc.exists) {
          this.currentAgentConfig = agentDoc.data() as AgentConfig;
          this.logger.debug('Agent configuration loaded', { agentId: this.activeAgentId });
        }
      }
      
      // Load action flows specific to Instagram
      const flowsSnapshot = await userDocRef.collection('action_flows')
        .where('platform', '==', 'instagram')
        .get();
      this.actionFlows = flowsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Load initial triggers for Instagram
      const triggersSnapshot = await userDocRef.collection('initial_triggers')
        .where('platform', '==', 'instagram')
        .get();
      this.initialTriggers = triggersSnapshot.docs.map(doc => doc.data());
      
      this.logger.info('Configuration loaded', {
        agentId: this.activeAgentId,
        flowsCount: this.actionFlows.length,
        triggersCount: this.initialTriggers.length
      });
      
    } catch (error) {
      this.logger.error('Error loading configuration', { error });
      throw error;
    }
  }
  
  /**
   * Check if user is already logged in to Instagram
   */
  private async checkLoginStatus(): Promise<void> {
    try {
      if (!this.page) throw new Error('Page not initialized');
      
      await this.page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
      
      // Wait a bit for page to fully load
      await this.delay(3000);
      
      // Check if we're on the login page or logged in
      const loginForm = await this.page.$('form[data-testid="royal_login_form"]');
      
      if (loginForm) {
        this.isLoggedIn = false;
        this.logger.info('User not logged in, login required');
      } else {
        // Check for home page indicators
        const homeIndicator = await this.page.$('[data-testid="home-tab"]') || 
                              await this.page.$('nav[role="navigation"]');
        
        if (homeIndicator) {
          this.isLoggedIn = true;
          this.logger.info('User already logged in');
          this.sendStatusToMaster('authenticated');
        } else {
          this.isLoggedIn = false;
          this.logger.info('Login status unclear, assuming not logged in');
        }
      }
      
    } catch (error) {
      this.logger.error('Error checking login status', { error });
      this.isLoggedIn = false;
    }
  }
  
  /**
   * Initiate login process
   */
  private async initiateLogin(): Promise<void> {
    try {
      if (!this.page) throw new Error('Page not initialized');
      
      this.logger.info('Initiating login process');
      this.sendStatusToMaster('waiting_for_login');
      
      // Send login instructions to master
      this.sendToMaster({
        type: 'LOGIN_REQUIRED',
        message: 'Please log in to Instagram manually in the browser session',
        timestamp: new Date().toISOString()
      });
      
      // Wait for login completion (check every 5 seconds)
      const loginCheckInterval = setInterval(async () => {
        try {
          await this.checkLoginStatus();
          
          if (this.isLoggedIn) {
            clearInterval(loginCheckInterval);
            this.logger.info('Login completed successfully');
            this.sendStatusToMaster('authenticated');
            await this.startMessageMonitoring();
          }
        } catch (error) {
          this.logger.error('Error during login check', { error });
        }
      }, 5000);
      
      // Set timeout for login (5 minutes)
      setTimeout(() => {
        if (!this.isLoggedIn) {
          clearInterval(loginCheckInterval);
          this.logger.error('Login timeout reached');
          this.sendErrorToMaster('Login timeout - please try again');
        }
      }, 5 * 60 * 1000);
      
    } catch (error) {
      this.logger.error('Error initiating login', { error });
      this.sendErrorToMaster(`Login initiation error: ${error}`);
    }
  }
  
  /**
   * Start monitoring for new messages
   */
  private async startMessageMonitoring(): Promise<void> {
    try {
      this.logger.info('Starting message monitoring');
      this.sendStatusToMaster('connected');
      
      // Navigate to direct messages
      if (!this.page) throw new Error('Page not initialized');
      
      await this.page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'networkidle2' });
      
      // Start periodic message checking
      this.messageCheckInterval = setInterval(async () => {
        await this.checkForNewMessages();
      }, 10000); // Check every 10 seconds
      
      this.logger.info('Message monitoring started');
      
    } catch (error) {
      this.logger.error('Error starting message monitoring', { error });
      this.sendErrorToMaster(`Monitoring error: ${error}`);
    }
  }
  
  /**
   * Check for new messages in Instagram DM
   */
  private async checkForNewMessages(): Promise<void> {
    try {
      if (!this.page || this.isShuttingDown) return;
      
      // Get all conversation threads
      const conversations = await this.page.$$('[role="button"][data-testid="conversation-row"]');
      
      for (const conversation of conversations) {
        try {
          // Click on conversation to open it
          await conversation.click();
          await this.delay(2000);
          
          // Get messages in this conversation
          const messages = await this.getMessagesFromCurrentConversation();
          
          // Process new messages
          for (const message of messages) {
            if (!message.isFromMe && this.isNewMessage(message)) {
              await this.handleIncomingMessage(message);
            }
          }
          
        } catch (convError) {
          this.logger.error('Error processing conversation', { error: convError });
        }
      }
      
    } catch (error) {
      this.logger.error('Error checking for new messages', { error });
    }
  }
  
  /**
   * Extract messages from current conversation
   */
  private async getMessagesFromCurrentConversation(): Promise<InstagramMessage[]> {
    try {
      if (!this.page) return [];
      
      // Wait for messages to load
      await this.delay(1000);
      
      // Get message elements
      const messageElements = await this.page.$$('[data-testid="message-row"]');
      const messages: InstagramMessage[] = [];
      
      for (const element of messageElements) {
        try {
          const messageText = await element.$eval('[data-testid="message-text"]', el => el.textContent) || '';
          const isFromMe = await element.$('[data-testid="message-from-me"]') !== null;
          
          if (messageText.trim()) {
            messages.push({
              id: `${Date.now()}-${Math.random()}`,
              sender: 'instagram_user', // Would need to extract actual username
              text: messageText.trim(),
              timestamp: Date.now(),
              isFromMe
            });
          }
        } catch (msgError) {
          // Skip this message if extraction fails
        }
      }
      
      return messages;
      
    } catch (error) {
      this.logger.error('Error extracting messages', { error });
      return [];
    }
  }
  
  /**
   * Check if message is new (not processed before)
   */
  private isNewMessage(message: InstagramMessage): boolean {
    // Simple implementation - in production, you'd track processed message IDs
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    return message.timestamp > fiveMinutesAgo;
  }
  
  /**
   * Handle incoming message with auto-reply logic
   */
  private async handleIncomingMessage(message: InstagramMessage): Promise<void> {
    try {
      this.logger.info('New Instagram message received', {
        sender: message.sender,
        textLength: message.text.length
      });
      
      // Save message to Firestore
      const messageId = await this.saveMessageToFirestore(message, 'incoming');
      
      // Update last activity
      this.lastActivity.set(message.sender, new Date());
      
      // Notify master of new message
      this.sendToMaster({
        type: 'NEW_MESSAGE_RECEIVED',
        payload: {
          chatId: message.sender,
          message: {
            id: messageId,
            from: message.sender,
            body: message.text,
            timestamp: new Date().toISOString(),
            platform: 'instagram'
          }
        }
      });
      
      // Check for auto-reply conditions
      await this.processAutoReplyLogic(message);
      
    } catch (error) {
      this.logger.error('Error handling incoming message', { error });
    }
  }
  
  /**
   * Process auto-reply logic
   */
  private async processAutoReplyLogic(message: InstagramMessage): Promise<void> {
    try {
      // Check if user is active
      const userIsActive = await this.isUserActiveInChat(message.sender);
      
      // Check bot pause state
      if (this.botPauseState) {
        this.logger.debug('Bot is paused, skipping auto-reply');
        return;
      }
      
      // Check if chat is activated
      const chatIsActivated = await this.isChatActivated(message.sender);
      
      // Check for initial trigger if chat not activated
      let isInitialTrigger = false;
      if (!chatIsActivated) {
        isInitialTrigger = await this.isInitialTriggerMessage(message);
        if (isInitialTrigger) {
          await this.activateChat(message.sender);
        }
      }
      
      // Process auto-reply if conditions are met
      if (!userIsActive && (chatIsActivated || isInitialTrigger)) {
        this.logger.info('Auto-reply conditions met for Instagram', { sender: message.sender });
        
        // Check for action flow triggers
        const matchedFlow = this.findMatchingActionFlow(message);
        if (matchedFlow) {
          await this.executeActionFlow(message, matchedFlow);
          return;
        }
        
        // Generate AI response
        await this.generateAIResponse(message);
      }
      
    } catch (error) {
      this.logger.error('Error in auto-reply logic', { error });
    }
  }
  
  /**
   * Check if user is active in chat
   */
  private async isUserActiveInChat(chatId: string): Promise<boolean> {
    // Similar implementation to WhatsApp worker
    try {
      const userDocRef = this.db.collection('users').doc(this.userId);
      const chatDocRef = userDocRef.collection('instagram_chats').doc(chatId);
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
   * Check if chat is activated
   */
  private async isChatActivated(chatId: string): Promise<boolean> {
    try {
      if (this.activatedChats.has(chatId)) {
        return true;
      }
      
      const userDocRef = this.db.collection('users').doc(this.userId);
      const chatDocRef = userDocRef.collection('instagram_chats').doc(chatId);
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
   * Check if message matches initial triggers
   */
  private async isInitialTriggerMessage(message: InstagramMessage): Promise<boolean> {
    try {
      if (!this.initialTriggers || this.initialTriggers.length === 0) {
        return false;
      }
      
      const messageTextLower = message.text.trim().toLowerCase();
      
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
          this.logger.info('Instagram initial trigger matched', { triggerText, triggerType });
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
      const chatDocRef = userDocRef.collection('instagram_chats').doc(chatId);
      
      await chatDocRef.set({
        is_activated: true,
        activated_at: new Date(),
        last_activity: new Date(),
        platform: 'instagram'
      });
      
      this.activatedChats.add(chatId);
      
      this.logger.info('Instagram chat activated', { chatId });
      
    } catch (error) {
      this.logger.error('Error activating Instagram chat', { error, chatId });
    }
  }
  
  /**
   * Find matching action flow
   */
  private findMatchingActionFlow(message: InstagramMessage): any | null {
    const messageTextLower = message.text.trim().toLowerCase();
    
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
   * Execute action flow
   */
  private async executeActionFlow(message: InstagramMessage, flow: any): Promise<void> {
    try {
      this.logger.info('Executing Instagram action flow', { flowId: flow.id, flowName: flow.name });
      
      if (!flow.steps || !Array.isArray(flow.steps) || flow.steps.length === 0) {
        await this.sendMessage(message.sender, 'Flujo activado pero sin acciones definidas.');
        return;
      }
      
      // Execute steps
      for (const step of flow.steps) {
        if (step.type === 'send_message' && step.value) {
          await this.delay(step.delay ? step.delay * 1000 : 2000);
          await this.sendMessage(message.sender, step.value);
        }
      }
      
    } catch (error) {
      this.logger.error('Error executing Instagram action flow', { error, flowId: flow.id });
    }
  }
  
  /**
   * Generate AI response
   */
  private async generateAIResponse(message: InstagramMessage): Promise<void> {
    try {
      this.logger.info('Generating AI response for Instagram', { sender: message.sender });
      
      // Build prompt with agent context
      const agentContext = this.buildAgentContext();
      const prompt = `${agentContext}\n\nNuevo mensaje de Instagram: ${message.text}\n\nRespuesta:`;
      
      // Generate response with AI
      const response = await this.ai.generateResponse(prompt, {
        maxTokens: 1000
      });
      
      if (response.success && response.content) {
        await this.delay(2000);
        await this.sendMessage(message.sender, response.content);
      }
      
    } catch (error) {
      this.logger.error('Error generating AI response for Instagram', { error });
    }
  }
  
  /**
   * Build agent context for prompts
   */
  private buildAgentContext(): string {
    if (!this.currentAgentConfig) {
      return 'Eres un asistente útil para Instagram.';
    }
    
    const persona = this.currentAgentConfig.persona;
    let context = `Eres ${persona.name}, ${persona.role} respondiendo en Instagram.\n`;
    context += `Personalidad: ${persona.personality}\n`;
    context += `Instrucciones: ${persona.instructions}\n`;
    
    return context;
  }
  
  /**
   * Send message through Instagram
   */
  private async sendMessage(chatId: string, text: string): Promise<boolean> {
    try {
      if (!this.page) {
        this.logger.error('Instagram page not available');
        return false;
      }
      
      // Find and click message input
      const messageInput = await this.page.$('[data-testid="message-input"]');
      if (!messageInput) {
        this.logger.error('Message input not found');
        return false;
      }
      
      // Type message
      await messageInput.click();
      await this.page.keyboard.type(text);
      
      // Send message (Enter key)
      await this.page.keyboard.press('Enter');
      
      // Save sent message
      await this.saveMessageToFirestore({
        id: `${Date.now()}-${Math.random()}`,
        sender: this.userId,
        text,
        timestamp: Date.now(),
        isFromMe: true
      }, 'outgoing');
      
      this.logger.info('Instagram message sent successfully', { chatId, textLength: text.length });
      return true;
      
    } catch (error) {
      this.logger.error('Error sending Instagram message', { error, chatId });
      return false;
    }
  }
  
  /**
   * Save message to Firestore
   */
  private async saveMessageToFirestore(message: InstagramMessage, direction: 'incoming' | 'outgoing'): Promise<string> {
    try {
      const userDocRef = this.db.collection('users').doc(this.userId);
      const chatId = message.sender;
      const messagesRef = userDocRef.collection('instagram_chats').doc(chatId).collection('messages');
      
      const messageData = {
        id: message.id,
        from: message.sender,
        body: message.text,
        from_me: message.isFromMe,
        timestamp: new Date(message.timestamp),
        direction,
        platform: 'instagram'
      };
      
      const docRef = await messagesRef.add(messageData);
      
      // Update chat document
      await userDocRef.collection('instagram_chats').doc(chatId).set({
        last_message: message.text,
        last_message_time: new Date(message.timestamp),
        last_activity: new Date(),
        platform: 'instagram',
        ...(direction === 'outgoing' && { last_human_activity: new Date() })
      });
      
      return docRef.id;
      
    } catch (error) {
      this.logger.error('Error saving Instagram message to Firestore', { error });
      throw error;
    }
  }
  
  /**
   * Handle IPC messages from master process
   */
  private async handleIPCMessage(message: any): Promise<void> {
    this.logger.debug('Received IPC message', { type: message.type });
    
    if (!message || !message.type) {
      this.logger.warn('Invalid IPC message received');
      return;
    }
    
    switch (message.type) {
      case 'SEND_MESSAGE':
        if (message.payload?.chatId && message.payload?.text) {
          await this.sendMessage(message.payload.chatId, message.payload.text);
        }
        break;
        
      case 'PAUSE_BOT':
        this.botPauseState = true;
        this.logger.info('Instagram bot paused');
        break;
        
      case 'RESUME_BOT':
        this.botPauseState = false;
        this.logger.info('Instagram bot resumed');
        break;
        
      case 'SHUTDOWN':
        await this.shutdown('IPC_SHUTDOWN');
        break;
        
      default:
        this.logger.warn('Unknown IPC message type', { type: message.type });
    }
  }
  
  /**
   * Utility functions
   */
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
      platform: 'instagram',
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
      platform: 'instagram',
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
    this.logger.info('Shutting down Instagram worker', { reason });
    
    try {
      // Clear intervals
      if (this.messageCheckInterval) {
        clearInterval(this.messageCheckInterval);
        this.messageCheckInterval = null;
      }
      
      // Close browser
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }
      
      // Send shutdown notification
      this.sendToMaster({
        type: 'WORKER_SHUTDOWN',
        reason,
        platform: 'instagram',
        timestamp: new Date().toISOString()
      });
      
      this.logger.info('Instagram worker shutdown complete');
      
    } catch (error) {
      this.logger.error('Error during Instagram worker shutdown', { error });
    } finally {
      process.exit(0);
    }
  }
} 