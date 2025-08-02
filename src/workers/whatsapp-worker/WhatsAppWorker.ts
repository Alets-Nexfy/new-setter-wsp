/**
 * WhatsApp Worker Implementation - MULTIUSUARIO COMPLETO
 * 
 * ARQUITECTURA 2025: UN WORKER INDEPENDIENTE POR USUARIO
 * - Cliente WhatsApp con whatsapp-web.js v1.31.0+ 
 * - Aislamiento total entre usuarios
 * - Sesiones persistentes individuales
 * - IPC bidireccional seguro
 * - Recovery automático por usuario
 * - Performance optimizado para multiusuario
 */

import { Client, LocalAuth, MessageMedia, NoAuth } from 'whatsapp-web.js';
import * as fs from 'fs';
import * as path from 'path';
import QRCode from 'qrcode';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { SupabaseService } from '../../core/services/SupabaseService';
import { AIService } from '../../core/services/AIService';
import { CacheService } from '../../core/services/CacheService';
import { LoggerService } from '../../core/services/LoggerService';
import { MessageBrokerService } from '../../core/services/MessageBrokerService';
import { AgentTriggerService } from '../../core/services/AgentTriggerService';
import { AgentSwitchingService } from '../../core/services/AgentSwitchingService';
import { TriggerMatchResult, AgentSwitchResult } from '../../core/types/MultiAgent';
import environment from '../../../config/environment';

// === INTERFACES MULTIUSUARIO ===
interface AgentConfig {
  id: string;
  userId: string; // AISLAMIENTO POR USUARIO
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
  userId: string; // AISLAMIENTO POR USUARIO
  trigger: string;
  condition: string;
  response: string;
  active: boolean;
}

interface ActionFlow {
  id: string;
  userId: string; // AISLAMIENTO POR USUARIO
  name: string;
  trigger: string;
  triggerValue: string;
  steps: any[];
  active: boolean;
}

interface InitialTrigger {
  text: string;
  type: 'exact' | 'contains' | 'starts_with';
  userId: string; // AISLAMIENTO POR USUARIO
}

interface FirestoreDoc {
  id: string;
  data(): any;
}

interface UserWorkerStats {
  userId: string;
  status: 'disconnected' | 'connecting' | 'qr' | 'authenticated';
  messagesProcessed: number;
  lastActivity: Date;
  memoryUsage: NodeJS.MemoryUsage;
  uptime: number;
}

interface IPCMessage {
  type: string;
  userId: string; // IDENTIFICADOR CRÍTICO
  data?: any;
  timestamp: number;
  messageId: string;
}

interface QRCodeData {
  userId: string;
  qr: string;
  qrImage: string;
  timestamp: Date;
  expiresAt: Date;
}

export class WhatsAppWorker extends EventEmitter {
  // === CORE MULTIUSUARIO ===
  private client: Client | null = null;
  private readonly userId: string; // IMMUTABLE USER ID
  private activeAgentId: string | null;
  private botPauseState: boolean = false;
  
  // === CONFIGURACIÓN POR USUARIO ===
  private currentAgentConfig: AgentConfig | null = null;
  private automationRules: AutomationRule[] = [];
  private actionFlows: ActionFlow[] = [];
  private initialTriggers: InitialTrigger[] = [];
  private geminiStarters: any[] = [];
  
  // === SERVICIOS SINGLETON ===
  private db: SupabaseService;
  private ai: AIService;
  private cache: CacheService;
  private logger: LoggerService;
  private messageBroker: MessageBrokerService;
  private agentTriggerService: AgentTriggerService;
  private agentSwitchingService: AgentSwitchingService;
  
  // === PATHS ÚNICOS POR USUARIO ===
  private readonly userDataPath: string;
  private readonly sessionPath: string;
  private readonly uploadsDir: string;
  private readonly qrImagePath: string;
  
  // === ESTADO DEL WORKER ===
  private isShuttingDown: boolean = false;
  private lastActivity: Date = new Date();
  private activatedChats: Set<string> = new Set();
  private connectionStatus: 'disconnected' | 'connecting' | 'qr' | 'authenticated' = 'disconnected';
  private qrCode: string | null = null;
  private qrExpiresAt: Date | null = null;
  private messagesProcessed: number = 0;
  private startTime: Date = new Date();
  
  // === IPC MANAGEMENT ===
  private ipcEnabled: boolean = false;
  private parentProcess: NodeJS.Process | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private qrRefreshTimeout: NodeJS.Timeout | null = null;
  
  // === CONSTANTES MULTIUSUARIO ===
  private readonly QR_TIMEOUT_MS = 300000; // 5 minutos
  private readonly HEARTBEAT_INTERVAL_MS = 30000; // 30 segundos
  private readonly MESSAGE_RETRY_ATTEMPTS = 3;
  private readonly INACTIVITY_THRESHOLD_MS = 36 * 60 * 60 * 1000; // 36 horas

  /**
   * CONSTRUCTOR MULTIUSUARIO - AISLAMIENTO TOTAL
   * @param userId - ID único del usuario (INMUTABLE)
   * @param activeAgentId - Agente activo inicial
   * @param options - Opciones de configuración
   */
  constructor(
    userId: string, 
    activeAgentId: string | null = null,
    options: {
      enableIPC?: boolean;
      sessionTimeout?: number;
      qrTimeout?: number;
    } = {}
  ) {
    super();
    
    // Configure EventEmitter for multiple user connections
    this.setMaxListeners(50);
    
    // VALIDACIÓN CRÍTICA
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new Error('UserId es requerido y debe ser un string válido');
    }
    
    this.userId = userId.trim();
    this.activeAgentId = activeAgentId;
    this.ipcEnabled = options.enableIPC ?? false;
    
    // === SERVICIOS SINGLETON ===
    this.db = SupabaseService.getInstance();
    this.ai = AIService.getInstance();
    this.cache = CacheService.getInstance();
    this.logger = LoggerService.getInstance();
    this.messageBroker = MessageBrokerService.getInstance();
    
    // === SERVICIOS MULTI-AGENTE ===
    this.agentTriggerService = AgentTriggerService.getInstance();
    this.agentSwitchingService = AgentSwitchingService.getInstance();
    
    // === PATHS ÚNICOS POR USUARIO ===
    const basePath = process.env.USER_DATA_PATH || path.join(process.cwd(), 'data_v2');
    this.userDataPath = path.join(basePath, this.userId);
    this.sessionPath = path.join(this.userDataPath, '.wwebjs_auth');
    this.uploadsDir = path.join(this.userDataPath, 'uploads');
    this.qrImagePath = path.join(this.userDataPath, 'qr.png');
    
    // === CONFIGURACIÓN TIMEOUTS ===
    if (options.qrTimeout) this.QR_TIMEOUT_MS = options.qrTimeout;
    
    // CREAR DIRECTORIOS INMEDIATAMENTE
    this.ensureDirectories();
    
    // CONFIGURAR IPC SI ESTÁ HABILITADO
    if (this.ipcEnabled) {
      this.setupIPC();
    }
    
    this.logger.info(`[WhatsApp Worker ${this.userId}] Worker inicializado con aislamiento total`, {
      userId: this.userId,
      sessionPath: this.sessionPath,
      ipcEnabled: this.ipcEnabled,
      activeAgent: this.activeAgentId
    });
  }

  /**
   * ASEGURAR DIRECTORIOS ÚNICOS POR USUARIO
   */
  private ensureDirectories(): void {
    const dirs = [
      this.userDataPath, 
      this.sessionPath, 
      this.uploadsDir,
      path.dirname(this.qrImagePath)
    ];
    
    for (const dir of dirs) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true, mode: 0o750 }); // Permisos seguros
          this.logger.debug(`[${this.userId}] Directorio creado: ${dir}`);
        }
      } catch (error) {
        this.logger.error(`[${this.userId}] Error creando directorio ${dir}:`, error);
        throw new Error(`No se pudo crear directorio para usuario ${this.userId}: ${error}`);
      }
    }
  }
  
  /**
   * CONFIGURACIÓN IPC BIDIRECCIONAL
   */
  private setupIPC(): void {
    if (!process.send) {
      this.logger.warn(`[${this.userId}] IPC habilitado pero process.send no disponible`);
      this.ipcEnabled = false;
      return;
    }
    
    this.parentProcess = process;
    
    // ESCUCHAR MENSAJES DEL PROCESO PADRE
    process.on('message', (message: IPCMessage) => {
      this.handleIPCMessage(message);
    });
    
    // MANEJAR DESCONEXION IPC
    process.on('disconnect', () => {
      this.logger.warn(`[${this.userId}] IPC desconectado, iniciando graceful shutdown`);
      this.gracefulShutdown('ipc_disconnect');
    });
    
    // HEARTBEAT HACIA EL PADRE
    this.heartbeatInterval = setInterval(() => {
      this.sendIPCMessage('HEARTBEAT', {
        status: this.connectionStatus,
        messagesProcessed: this.messagesProcessed,
        uptime: Date.now() - this.startTime.getTime(),
        memoryUsage: process.memoryUsage()
      });
    }, this.HEARTBEAT_INTERVAL_MS);
    
    this.logger.info(`[${this.userId}] IPC configurado correctamente`);
  }

  /**
   * INICIALIZACIÓN COMPLETA DEL CLIENTE WHATSAPP
   */
  public async initialize(): Promise<void> {
    try {
      this.logger.info(`[${this.userId}] Iniciando inicialización completa del cliente WhatsApp`);
      this.connectionStatus = 'connecting';
      this.sendIPCMessage('STATUS_UPDATE', { status: 'connecting' });
      
      // 1. CARGAR CONFIGURACIÓN DEL USUARIO
      await this.loadUserConfiguration();
      
      // 2. CREAR CLIENTE WHATSAPP CON CONFIGURACIÓN MULTIUSUARIO
      await this.createWhatsAppClient();
      
      // 3. CONFIGURAR EVENT LISTENERS
      this.setupClientEventListeners();
      
      // 4. INICIALIZAR CLIENTE
      await this.client!.initialize();
      
      this.logger.info(`[${this.userId}] Cliente WhatsApp inicializado exitosamente`);
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error crítico inicializando cliente:`, error);
      this.connectionStatus = 'disconnected';
      this.sendIPCMessage('ERROR', { 
        error: error instanceof Error ? error.message : 'Error desconocido',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
  
  /**
   * CREAR CLIENTE WHATSAPP CON AISLAMIENTO TOTAL
   */
  private async createWhatsAppClient(): Promise<void> {
    const clientId = `user_${this.userId}`; // AISLAMIENTO TOTAL
    
    // CONFIGURACIÓN PUPPETEER OPTIMIZADA PARA PRODUCCIÓN 2025
    const puppeteerOptions = {
      headless: process.env.WHATSAPP_PUPPETEER_HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        `--user-data-dir=${this.sessionPath}`
      ],
      executablePath: process.env.CHROME_BIN || undefined,
      timeout: parseInt(process.env.PUPPETEER_TIMEOUT || '60000'),
    };
    
    // CREAR CLIENTE CON LocalAuth PARA PERSISTENCIA
    this.client = new Client({
      authStrategy: new LocalAuth({ 
        clientId: clientId,
        dataPath: this.sessionPath
      }),
      puppeteer: puppeteerOptions,
      webVersionCache: {
        type: 'remote',
        remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${process.env.WHATSAPP_WEB_VERSION || 'stable'}.html`,
      },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    
    this.logger.info(`[${this.userId}] Cliente WhatsApp creado con clientId: ${clientId}`);
  }

  /**
   * CARGAR CONFIGURACIÓN COMPLETA DEL USUARIO CON AISLAMIENTO
   */
  private async loadUserConfiguration(): Promise<void> {
    try {
      this.logger.info(`[${this.userId}] Cargando configuración del usuario...`);
      
      const userDocRef = this.db.collection('users').doc(this.userId);
      
      // VERIFICAR QUE EL USUARIO EXISTE
      const userDoc = await userDocRef.get();
      if (!userDoc.exists) {
        throw new Error(`Usuario ${this.userId} no existe en la base de datos`);
      }
      
      // CARGAR CONFIGURACIÓN DE AGENTES (CON AISLAMIENTO)
      const agentsSnapshot = await userDocRef.collection('agents')
        .where('userId', '==', this.userId) // AISLAMIENTO EXPLÍCITO
        .get();
        
      if (!agentsSnapshot.empty) {
        const agents = agentsSnapshot.docs.map((doc: FirestoreDoc) => ({ 
          id: doc.id, 
          userId: this.userId, // FORZAR userId
          ...doc.data() 
        }));
        
        // ENCONTRAR AGENTE ACTIVO O USAR EL PRIMERO
        this.currentAgentConfig = agents.find(agent => agent.id === this.activeAgentId) || agents[0] || null;
      }
      
      // CARGAR REGLAS DE AUTOMATIZACIÓN (CON AISLAMIENTO)
      const rulesSnapshot = await userDocRef.collection('rules')
        .where('active', '==', true)
        .get();
      this.automationRules = rulesSnapshot.docs.map((doc: FirestoreDoc) => ({ 
        id: doc.id, 
        userId: this.userId,
        ...doc.data() 
      })) as AutomationRule[];
      
      // CARGAR ACTION FLOWS (CON AISLAMIENTO)
      const flowsSnapshot = await userDocRef.collection('action_flows')
        .where('active', '==', true)
        .get();
      this.actionFlows = flowsSnapshot.docs.map((doc: FirestoreDoc) => ({ 
        id: doc.id, 
        userId: this.userId,
        ...doc.data() 
      })) as ActionFlow[];
      
      // CARGAR TRIGGERS INICIALES (CON AISLAMIENTO)
      const triggersSnapshot = await userDocRef.collection('initial_triggers').get();
      this.initialTriggers = triggersSnapshot.docs.map((doc: FirestoreDoc) => ({
        userId: this.userId,
        ...doc.data()
      })) as InitialTrigger[];
      
      // CARGAR GEMINI STARTERS
      const startersSnapshot = await userDocRef.collection('gemini_starters').get();
      this.geminiStarters = startersSnapshot.docs.map((doc: FirestoreDoc) => doc.data());
      
      // CARGAR ESTADO DE PAUSA DESDE FIRESTORE
      await this.loadBotPauseState();
      
      this.logger.info(`[${this.userId}] Configuración cargada exitosamente:`, {
        userId: this.userId,
        agent: this.currentAgentConfig?.persona?.name || 'None',
        rules: this.automationRules.length,
        flows: this.actionFlows.length,
        triggers: this.initialTriggers.length,
        botPaused: this.botPauseState
      });
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error crítico cargando configuración:`, error);
      throw error;
    }
  }
  
  /**
   * CARGAR ESTADO DE PAUSA DEL BOT DESDE FIRESTORE
   */
  private async loadBotPauseState(): Promise<void> {
    try {
      const statusDoc = await this.db.collection('users')
        .doc(this.userId)
        .collection('status')
        .doc('whatsapp')
        .get();
        
      if (statusDoc.exists) {
        const data = statusDoc.data();
        this.botPauseState = data?.botIsPaused === true;
        this.logger.info(`[${this.userId}] Estado de pausa cargado: ${this.botPauseState}`);
      }
    } catch (error) {
      this.logger.error(`[${this.userId}] Error cargando estado de pausa:`, error);
      // No es crítico, continuar con false
      this.botPauseState = false;
    }
  }

  /**
   * CONFIGURAR EVENT LISTENERS DEL CLIENTE WHATSAPP
   */
  private setupClientEventListeners(): void {
    if (!this.client) {
      throw new Error(`[${this.userId}] Cliente no inicializado`);
    }
    
    // === QR CODE GENERATION ===
    this.client.on('qr', async (qr: string) => {
      try {
        this.logger.info(`[${this.userId}] QR Code generado`);
        
        // MOSTRAR QR EN CONSOLA PARA DEBUGGING
        const qrTerminal = require('qrcode-terminal');
        console.log(`\n🎯 QR PARA ${this.userId.toUpperCase()}:`);
        qrTerminal.generate(qr, { small: true });
        console.log(`📱 Escanea con WhatsApp en tu teléfono\n`);
        this.connectionStatus = 'qr';
        this.qrCode = qr;
        this.qrExpiresAt = new Date(Date.now() + this.QR_TIMEOUT_MS);
        
        // GENERAR IMAGEN QR
        const qrImage = await QRCode.toDataURL(qr, {
          errorCorrectionLevel: 'M',
          type: 'image/png',
          quality: 0.92,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        
        // GUARDAR QR EN ARCHIVO
        const qrBuffer = Buffer.from(qrImage.split(',')[1], 'base64');
        fs.writeFileSync(this.qrImagePath, qrBuffer);
        
        // GUARDAR EN FIRESTORE CON AISLAMIENTO
        await this.saveQRToDatabase(qr, qrImage);
        
        // NOTIFICAR VÍA IPC
        this.sendIPCMessage('QR_GENERATED', {
          qr,
          qrImage,
          qrImagePath: this.qrImagePath,
          expiresAt: this.qrExpiresAt.toISOString()
        });
        
        // AUTO-REFRESH QR
        this.scheduleQRRefresh();
        
      } catch (error) {
        this.logger.error(`[${this.userId}] Error procesando QR:`, error);
        this.sendIPCMessage('ERROR', { error: 'Error generando QR' });
      }
    });
    
    // === AUTHENTICATION SUCCESS ===
    this.client.on('authenticated', async () => {
      this.logger.info(`[${this.userId}] Cliente autenticado exitosamente`);
      this.connectionStatus = 'authenticated';
      this.qrCode = null;
      this.qrExpiresAt = null;
      
      // LIMPIAR QR TIMEOUT
      if (this.qrRefreshTimeout) {
        clearTimeout(this.qrRefreshTimeout);
        this.qrRefreshTimeout = null;
      }
      
      // ACTUALIZAR ESTADO EN FIRESTORE
      await this.updateConnectionStatus('authenticated');
      
      this.sendIPCMessage('AUTHENTICATED', {
        timestamp: new Date().toISOString()
      });
    });
    
    // === CLIENT READY ===
    this.client.on('ready', async () => {
      this.logger.info(`[${this.userId}] Cliente listo para recibir mensajes`);
      
      // OBTENER INFO DEL CLIENTE
      const clientInfo = this.client!.info;
      
      await this.updateConnectionStatus('authenticated', {
        phoneNumber: clientInfo.wid.user,
        pushName: clientInfo.pushname,
        platform: clientInfo.platform,
        readyAt: new Date().toISOString()
      });
      
      this.sendIPCMessage('READY', {
        clientInfo: {
          phoneNumber: clientInfo.wid.user,
          pushName: clientInfo.pushname,
          platform: clientInfo.platform
        }
      });
    });
    
    // === MESSAGE RECEIVED ===
    this.client.on('message', async (message) => {
      console.log(`\n📩 MENSAJE RECIBIDO EN ${this.userId.toUpperCase()}:`);
      console.log(`From: ${message.from}`);
      console.log(`Body: ${message.body}`);
      this.logger.info(`[${this.userId}] Mensaje recibido de ${message.from}: ${message.body}`);
      await this.handleIncomingMessage(message);
    });
    
    // === DISCONNECTED ===
    this.client.on('disconnected', async (reason) => {
      this.logger.warn(`[${this.userId}] Cliente desconectado: ${reason}`);
      this.connectionStatus = 'disconnected';
      
      await this.updateConnectionStatus('disconnected', { reason });
      
      this.sendIPCMessage('DISCONNECTED', { reason });
      
      // INTENTAR RECONEXION SI NO ES SHUTDOWN
      if (!this.isShuttingDown && reason !== 'LOGOUT') {
        this.logger.info(`[${this.userId}] Intentando reconexion automática...`);
        setTimeout(() => {
          if (!this.isShuttingDown) {
            this.initialize().catch(error => {
              this.logger.error(`[${this.userId}] Error en reconexion:`, error);
            });
          }
        }, 5000);
      }
    });
    
    // === AUTHENTICATION FAILURE ===
    this.client.on('auth_failure', async (message) => {
      this.logger.error(`[${this.userId}] Falla de autenticación: ${message}`);
      this.connectionStatus = 'disconnected';
      
      await this.updateConnectionStatus('disconnected', { 
        error: 'auth_failure',
        message 
      });
      
      this.sendIPCMessage('AUTH_FAILURE', { message });
    });
    
    this.logger.info(`[${this.userId}] Event listeners configurados`);
  }
  
  /**
   * MANEJAR MENSAJES ENTRANTES CON PROCESAMIENTO COMPLETO
   */
  private async handleIncomingMessage(message: any): Promise<void> {
    try {
      const sender = message.from;
      const messageText = message.body?.toLowerCase() || '';
      const isGroup = message.from.endsWith('@g.us');
      
      this.messagesProcessed++;
      this.lastActivity = new Date();
      
      this.logger.debug(`[${this.userId}] Procesando mensaje:`, { 
        sender, 
        isGroup,
        hasMedia: message.hasMedia,
        type: message.type 
      });
      
      // VERIFICAR PRESENCIA HUMANA
      const userIsActive = await this.isUserActiveInChat(sender);
      console.log(`🔍 PRESENCIA HUMANA: ${userIsActive ? 'ACTIVO' : 'INACTIVO'}`);
      this.logger.info(`[${this.userId}] Verificación presencia:`, { sender, isActive: userIsActive });
      
      // VERIFICAR ESTADO DE PAUSA
      console.log(`⏸️  ESTADO PAUSA: ${this.botPauseState ? 'PAUSADO' : 'ACTIVO'}`);
      this.logger.info(`[${this.userId}] Estado pausa:`, { isPaused: this.botPauseState });
      
      // VERIFICAR ACTIVACIÓN DE CHAT
      const chatIsActivated = await this.isChatActivated(sender);
      console.log(`🎯 CHAT ACTIVADO: ${chatIsActivated ? 'SÍ' : 'NO'}`);
      this.logger.info(`[${this.userId}] Verificación activación:`, { sender, isActivated: chatIsActivated });
      
      // VERIFICAR TRIGGER INICIAL
      let isInitialTrigger = false;
      if (!chatIsActivated) {
        isInitialTrigger = await this.isInitialTriggerMessage(message);
        this.logger.debug(`[${this.userId}] Verificación trigger inicial:`, { sender, isInitialTrigger });
        
        if (isInitialTrigger) {
          await this.activateChat(sender, 'initial_trigger');
          this.logger.info(`[${this.userId}] Chat activado por trigger inicial:`, { sender });
        }
      }
      
      // === MULTI-AGENT LOGIC ===
      const agentSwitched = await this.handleMultiAgentLogic(message, sender, chatIsActivated, isInitialTrigger);
      
      // PROCESAR AUTO-RESPUESTA SI SE CUMPLEN CONDICIONES
      // Si hubo un agent switch, forzamos la respuesta AI independientemente de la presencia humana
      if ((!userIsActive && !this.botPauseState && (chatIsActivated || isInitialTrigger)) || agentSwitched) {
        const reason = agentSwitched ? 'agent switch occurred' : 'normal conditions';
        this.logger.info(`[${this.userId}] Condiciones para auto-respuesta cumplidas (${reason}):`, { sender });
        if (agentSwitched) {
          console.log(`🔄 FORZANDO RESPUESTA AI TRAS AGENT SWITCH`);
        }
        
        // 1. PROCESAR REGLAS DE AUTOMATIZACIÓN
        console.log(`🔧 PROCESANDO REGLAS DE AUTOMATIZACIÓN...`);
        const ruleMatched = await this.processAutomationRules(message);
        console.log(`📋 REGLAS RESULTADO: ${ruleMatched ? 'MATCH' : 'NO MATCH'}`);
        
        // 2. PROCESAR ACTION FLOWS
        console.log(`🌊 PROCESANDO ACTION FLOWS...`);
        const flowExecuted = await this.processActionFlows(message);
        console.log(`📊 FLOWS RESULTADO: ${flowExecuted ? 'EJECUTADO' : 'NO EJECUTADO'}`);
        
        // 3. GENERAR RESPUESTA AI SI NO HAY REGLAS/FLOWS
        if (!ruleMatched && !flowExecuted) {
          console.log(`🤖 GENERANDO RESPUESTA AI CON GEMINI...`);
          await this.generateAIResponse(message);
        } else {
          console.log(`⏭️  SALTANDO AI: reglas o flows ya procesados`);
        }
        
      } else {
        this.logger.debug(`[${this.userId}] Condiciones auto-respuesta no cumplidas:`, {
          userIsActive,
          botPaused: this.botPauseState,
          chatActivated: chatIsActivated,
          isInitialTrigger
        });
      }
      
      // SIEMPRE GUARDAR MENSAJE EN BD
      await this.saveMessageToDatabase(message);
      
      // NOTIFICAR MENSAJE PROCESADO VÍA IPC
      this.sendIPCMessage('MESSAGE_PROCESSED', {
        sender,
        messageId: message.id._serialized,
        processed: true,
        autoReplyTriggered: !userIsActive && !this.botPauseState && (chatIsActivated || isInitialTrigger)
      });
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error crítico procesando mensaje:`, error);
      this.sendIPCMessage('ERROR', { 
        error: 'Error procesando mensaje',
        details: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }

  /**
   * MANEJA LA LÓGICA MULTI-AGENTE - SELECCIÓN Y CAMBIO DE AGENTES
   */
  private async handleMultiAgentLogic(
    message: any, 
    chatId: string, 
    chatIsActivated: boolean, 
    isInitialTrigger: boolean
  ): Promise<boolean> {
    try {
      console.log(`🔥 MULTI-AGENT LOGIC INICIADO:`, { 
        chatId, 
        chatIsActivated, 
        isInitialTrigger, 
        messageBody: message.body 
      });
      
      const messageText = message.body || '';
      
      // Si es un trigger inicial, evaluar qué agente debe manejar este chat
      if (isInitialTrigger || !chatIsActivated) {
        console.log(`🎯 EVALUANDO TRIGGER INICIAL MULTI-AGENTE...`);
        
        const triggerResult = await this.agentTriggerService.evaluateInitialTriggers(
          this.userId, 
          messageText, 
          chatId
        );
        
        if (triggerResult.matched && triggerResult.agentId) {
          console.log(`✅ AGENTE INICIAL SELECCIONADO: ${triggerResult.agentId}`);
          console.log(`📝 RAZÓN: ${triggerResult.reason}`);
          
          const switchResult = await this.agentSwitchingService.switchAgent(
            this.userId,
            chatId,
            triggerResult.agentId,
            'initial_trigger',
            triggerResult.trigger?.keyword
          );
          
          if (switchResult.success) {
            this.logger.info(`[${this.userId}] Agente inicial asignado:`, {
              chatId,
              agentId: triggerResult.agentId,
              reason: triggerResult.reason
            });
            
            // Limpiar cache de AI para forzar respuesta con nuevo agente
            const { AIService } = await import('../../core/services/AIService');
            const aiService = AIService.getInstance();
            aiService.clearResponseCache();
            
            // Pequeño delay para asegurar que el cache se actualice
            await new Promise(resolve => setTimeout(resolve, 100));
            
            return true; // Agent switched successfully
          }
        }
      } else {
        // Chat ya activado - verificar si necesitamos cambiar de agente
        console.log(`🔄 CHAT YA ACTIVADO - VERIFICANDO CAMBIO DE AGENTE...`);
        const currentAgentId = await this.agentSwitchingService.getCurrentAgent(this.userId, chatId);
        console.log(`🔍 CURRENT AGENT ID:`, currentAgentId);
        
        if (currentAgentId) {
          console.log(`🔄 EVALUANDO CAMBIO DE AGENTE (actual: ${currentAgentId})...`);
          
          const switchTriggerResult = await this.agentTriggerService.evaluateSwitchTriggers(
            this.userId,
            messageText,
            currentAgentId,
            chatId
          );
          
          if (switchTriggerResult.matched && switchTriggerResult.agentId) {
            console.log(`🔀 CAMBIO DE AGENTE DETECTADO: ${currentAgentId} → ${switchTriggerResult.agentId}`);
            console.log(`📝 RAZÓN: ${switchTriggerResult.reason}`);
            
            const switchResult = await this.agentSwitchingService.switchAgent(
              this.userId,
              chatId,
              switchTriggerResult.agentId,
              'switch_trigger',
              switchTriggerResult.trigger?.keyword
            );
            
            if (switchResult.success && switchResult.switched) {
              this.logger.info(`[${this.userId}] Agente cambiado exitosamente:`, {
                chatId,
                fromAgent: switchResult.fromAgent,
                toAgent: switchResult.toAgent,
                reason: switchResult.reason
              });
              
              // Enviar mensaje de transición si está configurado
              if (switchResult.message) {
                await this.sendMessage(chatId, switchResult.message, 'agent_switch');
              }
              
              // Limpiar cache de AI para forzar respuesta con nuevo agente
              const { AIService } = await import('../../core/services/AIService');
              const aiService = AIService.getInstance();
              aiService.clearResponseCache();
              
              // Pequeño delay para asegurar que el cache se actualice
              await new Promise(resolve => setTimeout(resolve, 100));
              
              return true; // Agent switched successfully
            }
          } else {
            console.log(`➡️  MANTENIENDO AGENTE ACTUAL: ${currentAgentId}`);
          }
        } else {
          console.log(`❌ NO HAY AGENTE ACTUAL - EVALUANDO TRIGGER INICIAL...`);
          
          const triggerResult = await this.agentTriggerService.evaluateInitialTriggers(
            this.userId, 
            messageText, 
            chatId
          );
          
          if (triggerResult.matched && triggerResult.agentId) {
            console.log(`✅ AGENTE SELECCIONADO (sin agente previo): ${triggerResult.agentId}`);
            console.log(`📝 RAZÓN: ${triggerResult.reason}`);
            
            const switchResult = await this.agentSwitchingService.switchAgent(
              this.userId,
              chatId,
              triggerResult.agentId,
              'initial_trigger',
              triggerResult.trigger?.keyword
            );
            
            if (switchResult.success) {
              this.logger.info(`[${this.userId}] Agente asignado (chat activo):`, {
                chatId,
                agentId: triggerResult.agentId,
                reason: triggerResult.reason
              });
              
              // Limpiar cache de AI para forzar respuesta con nuevo agente
              const { AIService } = await import('../../core/services/AIService');
              const aiService = AIService.getInstance();
              aiService.clearResponseCache();
              
              // Pequeño delay para asegurar que el cache se actualice
              await new Promise(resolve => setTimeout(resolve, 100));
              
              return true; // Agent switched successfully
            }
          }
        }
      }
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error en lógica multi-agente:`, error);
      console.log(`❌ ERROR MULTI-AGENTE: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
    
    return false; // No agent switch occurred
  }

  /**
   * VERIFICAR SI EL CHAT ESTÁ ACTIVADO CON AISLAMIENTO
   */
  private async isChatActivated(chatId: string): Promise<boolean> {
    try {
      // VERIFICAR CACHE LOCAL PRIMERO
      if (this.activatedChats.has(chatId)) {
        return true;
      }
      
      // VERIFICAR EN BASE DE DATOS CON AISLAMIENTO
      const chatDoc = await this.db.collection('users')
        .doc(this.userId) // AISLAMIENTO EXPLÍCITO
        .collection('chats')
        .doc(chatId)
        .get();
      
      if (chatDoc.exists) {
        const chatData = chatDoc.data();
        const isActivated = chatData?.isActivated === true;
        
        // VERIFICAR EXPIRACIÓN DE ACTIVACIÓN (36 HORAS)
        if (isActivated && chatData?.activatedAt) {
          const activatedAt = chatData.activatedAt.toDate?.() || new Date(chatData.activatedAt);
          const now = new Date();
          const timeDiff = now.getTime() - activatedAt.getTime();
          
          if (timeDiff > this.INACTIVITY_THRESHOLD_MS) {
            // DESACTIVAR CHAT AUTOMÁTICAMENTE
            await this.deactivateChat(chatId, 'timeout');
            this.logger.info(`[${this.userId}] Chat desactivado por timeout:`, { chatId, hoursInactive: Math.round(timeDiff / (1000 * 60 * 60)) });
            return false;
          }
        }
        
        // AGREGAR A CACHE LOCAL SI ESTÁ ACTIVADO
        if (isActivated) {
          this.activatedChats.add(chatId);
        }
        
        return isActivated;
      }
      
      return false;
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error verificando activación de chat:`, { error, chatId });
      return false;
    }
  }
  
  /**
   * ACTIVAR CHAT CON DURACIÓN DE 36 HORAS
   */
  private async activateChat(chatId: string, method: string): Promise<void> {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.INACTIVITY_THRESHOLD_MS);
      
      await this.db.collection('users')
        .doc(this.userId)
        .collection('chats')
        .doc(chatId)
        .set({
          isActivated: true,
          activatedAt: now,
          expiresAt: expiresAt,
          activationMethod: method,
          userId: this.userId, // AISLAMIENTO
          updatedAt: now
        }, { merge: true });
      
      this.activatedChats.add(chatId);
      
      this.logger.info(`[${this.userId}] Chat activado:`, {
        chatId,
        method,
        expiresAt: expiresAt.toISOString()
      });
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error activando chat:`, { error, chatId });
    }
  }
  
  /**
   * DESACTIVAR CHAT
   */
  private async deactivateChat(chatId: string, reason: string): Promise<void> {
    try {
      await this.db.collection('users')
        .doc(this.userId)
        .collection('chats')
        .doc(chatId)
        .update({
          isActivated: false,
          deactivatedAt: new Date(),
          deactivationReason: reason,
          updatedAt: new Date()
        });
      
      this.activatedChats.delete(chatId);
      
      this.logger.info(`[${this.userId}] Chat desactivado:`, { chatId, reason });
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error desactivando chat:`, { error, chatId });
    }
  }

  /**
   * VERIFICAR SI MENSAJE COINCIDE CON TRIGGERS INICIALES
   */
  private async isInitialTriggerMessage(message: any): Promise<boolean> {
    try {
      const messageText = message.body?.toLowerCase()?.trim() || '';
      
      if (!messageText || this.initialTriggers.length === 0) {
        // TRIGGER TEMPORAL: activar cualquier mensaje como inicial para debugging
        console.log(`🚀 TRIGGER TEMPORAL ACTIVADO: cualquier mensaje activa el chat`);
        return true;
      }
      
      for (const trigger of this.initialTriggers) {
        // VERIFICAR AISLAMIENTO
        if (trigger.userId !== this.userId) {
          continue; // SKIP TRIGGERS DE OTROS USUARIOS
        }
        
        const triggerText = trigger.text?.toLowerCase()?.trim();
        if (!triggerText) continue;
        
        let matches = false;
        
        switch (trigger.type) {
          case 'exact':
            matches = messageText === triggerText;
            break;
          case 'contains':
            matches = messageText.includes(triggerText);
            break;
          case 'starts_with':
            matches = messageText.startsWith(triggerText);
            break;
          default:
            matches = messageText.includes(triggerText); // DEFAULT
        }
        
        if (matches) {
          this.logger.info(`[${this.userId}] Trigger inicial coincidente:`, {
            trigger: trigger.text,
            type: trigger.type,
            message: messageText,
            userId: this.userId
          });
          return true;
        }
      }
      
      return false;
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error verificando triggers iniciales:`, error);
      return false;
    }
  }

  /**
   * DETECCIÓN DE PRESENCIA HUMANA AVANZADA
   */
  private async isUserActiveInChat(chatId: string): Promise<boolean> {
    try {
      // VERIFICAR EN BASE DE DATOS CON AISLAMIENTO
      const chatDoc = await this.db.collection('users')
        .doc(this.userId)
        .collection('chats')
        .doc(chatId)
        .get();
      
      if (!chatDoc.exists) {
        return false;
      }
      
      const chatData = chatDoc.data();
      
      // 1. VERIFICAR FLAG EXPLÍCITO DE ACTIVIDAD
      if (chatData?.userIsActive === true) {
        const lastActivity = chatData.lastActivityTimestamp?.toDate?.() || new Date(chatData.lastActivityTimestamp || 0);
        const timeDiff = Date.now() - lastActivity.getTime();
        
        // USUARIO ACTIVO SI LA ÚLTIMA ACTIVIDAD FUE EN LOS ÚLTIMOS 5 MINUTOS
        const isRecentlyActive = timeDiff < (5 * 60 * 1000);
        
        if (isRecentlyActive) {
          this.logger.debug(`[${this.userId}] Usuario activo detectado:`, {
            chatId,
            lastActivity: lastActivity.toISOString(),
            minutesAgo: Math.round(timeDiff / (1000 * 60))
          });
          return true;
        }
      }
      
      // 2. VERIFICAR MENSAJES HUMANOS RECIENTES
      const lastHumanMessage = chatData?.lastHumanMessageTimestamp?.toDate?.() || null;
      if (lastHumanMessage) {
        const timeDiff = Date.now() - lastHumanMessage.getTime();
        const isRecentHumanActivity = timeDiff < (10 * 60 * 1000); // 10 minutos
        
        if (isRecentHumanActivity) {
          this.logger.debug(`[${this.userId}] Actividad humana reciente detectada:`, {
            chatId,
            lastHumanMessage: lastHumanMessage.toISOString(),
            minutesAgo: Math.round(timeDiff / (1000 * 60))
          });
          return true;
        }
      }
      
      // 3. VERIFICAR PATRONES DE COMPORTAMIENTO
      // Verificar si hay múltiples mensajes en secuencia rápida (indicador de presencia)
      const recentMessagesCount = await this.getRecentMessagesCount(chatId, 2 * 60 * 1000); // 2 minutos
      if (recentMessagesCount > 2) {
        this.logger.debug(`[${this.userId}] Múltiples mensajes recientes indican presencia:`, {
          chatId,
          recentMessages: recentMessagesCount
        });
        return true;
      }
      
      this.logger.debug(`[${this.userId}] Usuario NO activo:`, { chatId });
      return false;
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error detectando presencia:`, { error, chatId });
      return false;
    }
  }
  
  /**
   * CONTAR MENSAJES RECIENTES PARA DETECCIÓN DE PRESENCIA
   */
  private async getRecentMessagesCount(chatId: string, timeWindowMs: number): Promise<number> {
    try {
      const cutoffTime = new Date(Date.now() - timeWindowMs);
      
      const messagesSnapshot = await this.db.collection('users')
        .doc(this.userId)
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .where('timestamp', '>=', cutoffTime)
        .where('origin', '==', 'human')
        .get();
      
      return messagesSnapshot.size;
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error contando mensajes recientes:`, error);
      return 0;
    }
  }

  /**
   * PROCESAR REGLAS DE AUTOMATIZACIÓN CON AISLAMIENTO
   */
  private async processAutomationRules(message: any): Promise<boolean> {
    try {
      const messageText = message.body?.toLowerCase()?.trim() || '';
      
      if (!messageText || this.automationRules.length === 0) {
        return false;
      }
      
      for (const rule of this.automationRules) {
        // VERIFICAR AISLAMIENTO
        if (rule.userId !== this.userId || !rule.active) {
          continue;
        }
        
        const trigger = rule.trigger?.toLowerCase()?.trim();
        if (!trigger) continue;
        
        // MATCHING DE TRIGGER MÁS SOFISTICADO
        let matches = false;
        
        if (rule.condition) {
          // EVALUAR CONDICIÓN COMPLEJA SI EXISTE
          matches = await this.evaluateRuleCondition(rule.condition, message, messageText);
        } else {
          // MATCHING SIMPLE POR DEFECTO
          matches = messageText.includes(trigger);
        }
        
        if (matches) {
          this.logger.info(`[${this.userId}] Regla de automatización activada:`, {
            ruleId: rule.id,
            trigger: rule.trigger,
            userId: this.userId
          });
          
          // ENVIAR RESPUESTA
          await this.sendMessage(message.from, rule.response, 'automation_rule');
          
          // REGISTRAR EJECUCIÓN DE REGLA
          await this.logRuleExecution(rule.id, message.from, message.id._serialized);
          
          return true; // SOLO LA PRIMERA REGLA COINCIDENTE
        }
      }
      
      return false;
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error procesando reglas de automatización:`, error);
      return false;
    }
  }
  
  /**
   * EVALUAR CONDICIÓN COMPLEJA DE REGLA
   */
  private async evaluateRuleCondition(condition: string, message: any, messageText: string): Promise<boolean> {
    try {
      // IMPLEMENTACIÓN BÁSICA DE EVALUACIÓN DE CONDICIONES
      // Se puede extender para condiciones más complejas
      
      // Reemplazar variables en la condición
      const evaluatedCondition = condition
        .replace(/\{messageText\}/g, `"${messageText.replace(/"/g, '\\"')}"`)
        .replace(/\{sender\}/g, `"${message.from}"`)
        .replace(/\{hasMedia\}/g, message.hasMedia.toString())
        .replace(/\{isGroup\}/g, message.from.endsWith('@g.us').toString());
      
      // EVALUACIÓN SEGURA (solo operaciones permitidas)
      const allowedOperations = /^[\w\s"'().,!<>=&|+-]+$/;
      if (!allowedOperations.test(evaluatedCondition)) {
        this.logger.warn(`[${this.userId}] Condición de regla no segura rechazada:`, { condition });
        return false;
      }
      
      // Evaluar condición simple
      return this.safeEvaluateCondition(evaluatedCondition);
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error evaluando condición de regla:`, error);
      return false;
    }
  }
  
  /**
   * EVALUACIÓN SEGURA DE CONDICIONES
   */
  private safeEvaluateCondition(condition: string): boolean {
    try {
      // IMPLEMENTACIÓN SIMPLE Y SEGURA
      // TODO: Implementar evaluador más robusto
      
      // Por ahora, evaluar solo condiciones básicas
      if (condition.includes('includes(')) {
        const match = condition.match(/"([^"]+)"\.includes\("([^"]+)"\)/);
        if (match) {
          return match[1].includes(match[2]);
        }
      }
      
      return false;
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error en evaluación segura:`, error);
      return false;
    }
  }
  
  /**
   * REGISTRAR EJECUCIÓN DE REGLA
   */
  private async logRuleExecution(ruleId: string, chatId: string, messageId: string): Promise<void> {
    try {
      await this.db.collection('users')
        .doc(this.userId)
        .collection('rule_executions')
        .add({
          ruleId,
          chatId,
          messageId,
          userId: this.userId,
          executedAt: new Date(),
          createdAt: new Date()
        });
    } catch (error) {
      this.logger.error(`[${this.userId}] Error registrando ejecución de regla:`, error);
    }
  }

  /**
   * PROCESAR ACTION FLOWS CON AISLAMIENTO
   */
  private async processActionFlows(message: any): Promise<boolean> {
    try {
      const messageText = message.body?.toLowerCase()?.trim() || '';
      
      if (!messageText || this.actionFlows.length === 0) {
        return false;
      }
      
      for (const flow of this.actionFlows) {
        // VERIFICAR AISLAMIENTO
        if (flow.userId !== this.userId || !flow.active) {
          continue;
        }
        
        const triggerValue = flow.triggerValue?.toLowerCase()?.trim();
        if (!triggerValue) continue;
        
        // VERIFICAR COINCIDENCIA DE TRIGGER
        let matches = false;
        
        switch (flow.trigger) {
          case 'exact':
            matches = messageText === triggerValue;
            break;
          case 'contains':
            matches = messageText.includes(triggerValue);
            break;
          case 'starts_with':
            matches = messageText.startsWith(triggerValue);
            break;
          case 'ends_with':
            matches = messageText.endsWith(triggerValue);
            break;
          case 'regex':
            try {
              const regex = new RegExp(triggerValue, 'i');
              matches = regex.test(messageText);
            } catch (regexError) {
              this.logger.warn(`[${this.userId}] Regex inválido en flow ${flow.id}:`, regexError);
              matches = false;
            }
            break;
          default:
            matches = messageText.includes(triggerValue); // DEFAULT
        }
        
        if (matches) {
          this.logger.info(`[${this.userId}] Action flow activado:`, {
            flowId: flow.id,
            flowName: flow.name,
            trigger: flow.trigger,
            triggerValue: flow.triggerValue,
            userId: this.userId
          });
          
          // EJECUTAR PASOS DEL FLOW
          await this.executeActionFlowSteps(flow, message);
          
          return true; // SOLO EL PRIMER FLOW COINCIDENTE
        }
      }
      
      return false;
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error procesando action flows:`, error);
      return false;
    }
  }

  /**
   * EJECUTAR PASOS DE ACTION FLOW
   */
  private async executeActionFlowSteps(flow: ActionFlow, message: any): Promise<void> {
    try {
      if (!flow.steps || flow.steps.length === 0) {
        this.logger.warn(`[${this.userId}] Flow ${flow.id} no tiene pasos definidos`);
        return;
      }
      
      this.logger.info(`[${this.userId}] Ejecutando ${flow.steps.length} pasos del flow ${flow.name}`);
      
      for (let i = 0; i < flow.steps.length; i++) {
        const step = flow.steps[i];
        
        try {
          this.logger.debug(`[${this.userId}] Ejecutando paso ${i + 1}/${flow.steps.length}:`, {
            flowId: flow.id,
            stepType: step.type,
            stepAction: step.action
          });
          
          await this.executeActionFlowStep(step, message, flow);
          
          // DELAY ENTRE PASOS SI ESTÁ ESPECIFICADO
          if (step.delay && step.delay > 0) {
            const delayMs = Math.min(step.delay * 1000, 30000); // Máx 30 segundos
            this.logger.debug(`[${this.userId}] Esperando ${step.delay}s antes del siguiente paso`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
          
        } catch (stepError) {
          this.logger.error(`[${this.userId}] Error ejecutando paso ${i + 1} del flow ${flow.id}:`, stepError);
          
          // CONTINUAR CON EL SIGUIENTE PASO SEGÚN CONFIGURACIÓN
          if (step.stopOnError === true) {
            this.logger.warn(`[${this.userId}] Deteniendo ejecución de flow por error en paso ${i + 1}`);
            break;
          }
        }
      }
      
      // REGISTRAR EJECUCIÓN COMPLETA
      await this.logFlowExecution(flow.id, message.from, message.id._serialized, 'completed');
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error ejecutando pasos del flow ${flow.id}:`, error);
      await this.logFlowExecution(flow.id, message.from, message.id._serialized, 'failed');
    }
  }

  /**
   * EJECUTAR PASO INDIVIDUAL DE ACTION FLOW
   */
  private async executeActionFlowStep(step: any, message: any, flow: ActionFlow): Promise<void> {
    try {
      switch (step.type) {
        case 'send_message':
          if (step.message) {
            // REEMPLAZAR VARIABLES EN EL MENSAJE
            const processedMessage = this.replaceMessageVariables(step.message, message);
            await this.sendMessage(message.from, processedMessage, 'action_flow');
          }
          break;
          
        case 'send_media':
          if (step.mediaPath && step.caption) {
            await this.sendMediaMessage(message.from, step.mediaPath, step.caption);
          }
          break;
          
        case 'delay':
          if (step.duration && step.duration > 0) {
            const delayMs = Math.min(step.duration * 1000, 60000); // Máx 60 segundos
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
          break;
          
        case 'activate_chat':
          await this.activateChat(message.from, 'action_flow');
          break;
          
        case 'deactivate_chat':
          await this.deactivateChat(message.from, 'action_flow');
          break;
          
        case 'change_agent':
          if (step.agentId) {
            await this.changeActiveAgent(step.agentId);
          }
          break;
          
        case 'set_chat_variable':
          if (step.variableName && step.variableValue) {
            await this.setChatVariable(message.from, step.variableName, step.variableValue);
          }
          break;
          
        case 'webhook':
          if (step.webhookUrl) {
            await this.executeWebhook(step.webhookUrl, message, flow);
          }
          break;
          
        case 'conditional':
          if (step.condition && step.trueAction) {
            const conditionMet = await this.evaluateStepCondition(step.condition, message);
            if (conditionMet && step.trueAction) {
              await this.executeActionFlowStep(step.trueAction, message, flow);
            } else if (!conditionMet && step.falseAction) {
              await this.executeActionFlowStep(step.falseAction, message, flow);
            }
          }
          break;
          
        default:
          this.logger.warn(`[${this.userId}] Tipo de paso desconocido en flow:`, { 
            flowId: flow.id, 
            stepType: step.type 
          });
      }
    } catch (error) {
      this.logger.error(`[${this.userId}] Error ejecutando paso ${step.type}:`, error);
      throw error;
    }
  }
  
  /**
   * REEMPLAZAR VARIABLES EN MENSAJES
   */
  private replaceMessageVariables(message: string, originalMessage: any): string {
    try {
      return message
        .replace(/\{sender\}/g, originalMessage.from)
        .replace(/\{message\}/g, originalMessage.body || '')
        .replace(/\{timestamp\}/g, new Date().toLocaleString())
        .replace(/\{userId\}/g, this.userId)
        .replace(/\{agentName\}/g, this.currentAgentConfig?.persona?.name || 'Asistente');
    } catch (error) {
      this.logger.error(`[${this.userId}] Error reemplazando variables:`, error);
      return message;
    }
  }
  
  /**
   * REGISTRAR EJECUCIÓN DE FLOW
   */
  private async logFlowExecution(flowId: string, chatId: string, messageId: string, status: string): Promise<void> {
    try {
      await this.db.collection('users')
        .doc(this.userId)
        .collection('flow_executions')
        .add({
          flowId,
          chatId,
          messageId,
          status,
          userId: this.userId,
          executedAt: new Date(),
          createdAt: new Date()
        });
    } catch (error) {
      this.logger.error(`[${this.userId}] Error registrando ejecución de flow:`, error);
    }
  }


  /**
   * GENERAR RESPUESTA AI CON CONTEXTO COMPLETO
   */
  private async generateAIResponse(message: any): Promise<void> {
    try {
      console.log(`🔧 INICIANDO generateAIResponse...`);
      
      // Obtener el agente actual para este chat
      const chatId = message.from;
      const currentAgentId = await this.agentSwitchingService.getCurrentAgent(this.userId, chatId);
      
      console.log(`🎭 CURRENT AGENT ID: ${currentAgentId || 'NINGUNO'}`);
      
      // Si no hay agente asignado, usar el agente por defecto o crear uno
      let agentConfig = null;
      if (currentAgentId) {
        // Obtener configuración del agente actual
        const { AgentService } = await import('../../core/services/AgentService');
        const agentService = AgentService.getInstance();
        agentConfig = await agentService.getAgent(this.userId, currentAgentId);
      }
      
      if (!agentConfig) {
        console.log(`❌ SIN AGENTE CONFIGURADO - CREANDO AGENTE POR DEFECTO...`);
        this.logger.info(`[${this.userId}] No hay configuración de agente, creando uno por defecto`);
        
        // CREAR AGENTE POR DEFECTO TEMPORAL
        agentConfig = {
          id: 'default-agent',
          userId: this.userId,
          persona: {
            name: 'Asistente Virtual',
            role: 'Asistente',
            language: 'es',
            tone: 'Amigable',
            style: 'Conversacional',
            instructions: 'Eres un asistente virtual amigable y útil. Responde de manera cordial y profesional.',
            guidelines: []
          },
          knowledge: {
            files: [],
            urls: [],
            qandas: [],
            writingSampleTxt: ''
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        console.log(`✅ AGENTE POR DEFECTO CREADO TEMPORALMENTE`);
      }
      
      this.logger.info(`[${this.userId}] Generando respuesta AI para:`, { 
        sender: message.from,
        agent: agentConfig.persona.name 
      });
      
      // CONSTRUIR CONTEXTO DE CONVERSACIÓN
      const context = await this.buildConversationContext(message.from);
      
      // PREPARAR DATOS PARA AI SERVICE
      const aiRequest = {
        message: message.body || '',
        context,
        agentConfig: agentConfig,
        userId: this.userId, // AISLAMIENTO
        chatId: message.from,
        messageId: message.id._serialized,
        hasMedia: message.hasMedia,
        isGroup: message.from.endsWith('@g.us'),
        timestamp: new Date().toISOString()
      };
      
      // GENERAR RESPUESTA CON AI SERVICE
      console.log(`🧠 LLAMANDO AI SERVICE CON CONTEXTO...`);
      const response = await this.ai.generateConversationResponse(
        this.userId,
        message.from,
        message.body || '',
        agentConfig,
        {}
      );
      console.log(`🤖 RESPUESTA AI RECIBIDA:`, { success: response.success, hasText: !!response.content });
      
      if (response && response.content && response.content.trim()) {
        // ENVIAR RESPUESTA
        await this.sendMessage(message.from, response.content.trim(), 'ai_response');
        
        // REGISTRAR RESPUESTA AI
        await this.logAIResponse(message.from, message.id._serialized, response);
        
      } else {
        this.logger.warn(`[${this.userId}] AI no generó respuesta válida para:`, { sender: message.from });
      }
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error generando respuesta AI:`, error);
      
      // RESPUESTA DE FALLBACK SI HAY ERROR
      if (this.currentAgentConfig?.persona?.name) {
        const fallbackMessage = `Disculpa, estoy experimentando dificultades técnicas en este momento. Por favor intenta nuevamente en unos minutos.`;
        await this.sendMessage(message.from, fallbackMessage, 'ai_fallback');
      }
    }
  }
  
  /**
   * CONSTRUIR CONTEXTO DE CONVERSACIÓN
   */
  private async buildConversationContext(chatId: string): Promise<any> {
    try {
      // OBTENER ÚLTIMOS MENSAJES DE LA CONVERSACIÓN
      const messagesSnapshot = await this.db.collection('users')
        .doc(this.userId)
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(10) // ÚLTIMOS 10 MENSAJES
        .get();
      
      const messages = messagesSnapshot.docs
        .map(doc => doc.data())
        .reverse(); // ORDEN CRONOLÓGICO
      
      // OBTENER INFORMACIÓN DEL CHAT
      const chatDoc = await this.db.collection('users')
        .doc(this.userId)
        .collection('chats')
        .doc(chatId)
        .get();
      
      const chatData = chatDoc.exists ? chatDoc.data() : {};
      
      return {
        recentMessages: messages,
        chatInfo: {
          contactName: chatData.contactDisplayName || 'Usuario',
          isActivated: chatData.isActivated || false,
          isGroup: chatId.endsWith('@g.us'),
          lastActivity: chatData.lastActivityTimestamp?.toDate?.()?.toISOString() || null
        },
        userInfo: {
          userId: this.userId,
          timezone: 'America/Argentina/Buenos_Aires', // TODO: obtener de configuración
          language: 'es'
        },
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error construyendo contexto:`, error);
      return {
        recentMessages: [],
        chatInfo: {},
        userInfo: { userId: this.userId },
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * REGISTRAR RESPUESTA AI
   */
  private async logAIResponse(chatId: string, messageId: string, response: any): Promise<void> {
    try {
      await this.db.collection('users')
        .doc(this.userId)
        .collection('ai_responses')
        .add({
          chatId,
          messageId,
          response: response.content || response.text || 'No response content',
          agentId: this.currentAgentConfig?.id,
          agentName: this.currentAgentConfig?.persona?.name,
          userId: this.userId,
          generatedAt: new Date(),
          createdAt: new Date()
        });
    } catch (error) {
      this.logger.error(`[${this.userId}] Error registrando respuesta AI:`, error);
    }
  }

  /**
   * ENVIAR MENSAJE CON CLIENTE WHATSAPP REAL
   */
  private async sendMessage(to: string, message: string, origin: string = 'bot'): Promise<boolean> {
    try {
      if (!this.client) {
        throw new Error('Cliente WhatsApp no inicializado');
      }
      
      if (!message || message.trim().length === 0) {
        this.logger.warn(`[${this.userId}] Intento de enviar mensaje vacío a ${to}`);
        return false;
      }
      
      this.logger.info(`[${this.userId}] Enviando mensaje:`, { 
        to, 
        messageLength: message.length,
        origin,
        preview: message.substring(0, 100)
      });
      
      // ENVIAR MENSAJE CON REINTENTOS
      let attempts = 0;
      let sent = false;
      
      while (attempts < this.MESSAGE_RETRY_ATTEMPTS && !sent) {
        try {
          attempts++;
          
          // ENVIAR VIA WHATSAPP-WEB.JS
          await this.client.sendMessage(to, message);
          sent = true;
          
          this.logger.info(`[${this.userId}] Mensaje enviado exitosamente:`, { 
            to, 
            attempt: attempts,
            origin 
          });
          
        } catch (sendError) {
          this.logger.warn(`[${this.userId}] Error en intento ${attempts} de envío:`, {
            to,
            error: sendError instanceof Error ? sendError.message : 'Error desconocido'
          });
          
          if (attempts < this.MESSAGE_RETRY_ATTEMPTS) {
            // ESPERAR ANTES DEL SIGUIENTE INTENTO
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
          }
        }
      }
      
      if (!sent) {
        throw new Error(`No se pudo enviar mensaje después de ${this.MESSAGE_RETRY_ATTEMPTS} intentos`);
      }
      
      // GUARDAR MENSAJE EN BASE DE DATOS
      await this.saveOutgoingMessage(to, message, origin);
      
      // ACTUALIZAR ESTADÍSTICAS
      this.messagesProcessed++;
      
      // NOTIFICAR VÍA IPC
      this.sendIPCMessage('MESSAGE_SENT', {
        to,
        message,
        origin,
        timestamp: new Date().toISOString()
      });
      
      return true;
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error crítico enviando mensaje:`, {
        to,
        origin,
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
      
      // NOTIFICAR ERROR VÍA IPC
      this.sendIPCMessage('MESSAGE_SEND_ERROR', {
        to,
        message,
        origin,
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
      
      return false;
    }
  }
  
  /**
   * ENVIAR MENSAJE MULTIMEDIA
   */
  private async sendMediaMessage(to: string, mediaPath: string, caption?: string): Promise<boolean> {
    try {
      if (!this.client) {
        throw new Error('Cliente WhatsApp no inicializado');
      }
      
      // VERIFICAR QUE EL ARCHIVO EXISTE
      if (!fs.existsSync(mediaPath)) {
        throw new Error(`Archivo no encontrado: ${mediaPath}`);
      }
      
      this.logger.info(`[${this.userId}] Enviando media:`, { to, mediaPath, caption });
      
      // CREAR OBJETO MEDIA
      const media = MessageMedia.fromFilePath(mediaPath);
      
      // ENVIAR MEDIA
      await this.client.sendMessage(to, media, { caption });
      
      this.logger.info(`[${this.userId}] Media enviado exitosamente:`, { to, mediaPath });
      
      return true;
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error enviando media:`, error);
      return false;
    }
  }

  /**
   * GUARDAR MENSAJE ENTRANTE EN BASE DE DATOS CON AISLAMIENTO
   */
  private async saveMessageToDatabase(message: any): Promise<void> {
    try {
      const messageData = {
        id: message.id._serialized,
        from: message.from,
        to: message.to || this.client?.info?.wid?.user,
        body: message.body || '',
        type: message.type || 'chat',
        timestamp: new Date(message.timestamp * 1000),
        hasMedia: message.hasMedia || false,
        isForwarded: message.isForwarded || false,
        isGroup: message.from.endsWith('@g.us'),
        origin: 'human', // MENSAJE ENTRANTE ES HUMANO
        userId: this.userId, // AISLAMIENTO CRÍTICO
        createdAt: new Date(),
        processedAt: new Date()
      };
      
      // GUARDAR MENSAJE CON AISLAMIENTO TOTAL
      await this.db.collection('users')
        .doc(this.userId) // AISLAMIENTO
        .collection('chats')
        .doc(message.from)
        .collection('messages')
        .doc(message.id._serialized)
        .set(messageData);
      
      // ACTUALIZAR INFORMACIÓN DEL CHAT
      await this.updateChatInfo(message.from, {
        lastMessageContent: message.body || '',
        lastMessageTimestamp: messageData.timestamp,
        lastMessageType: messageData.type,
        lastMessageOrigin: 'human',
        // userIsActive se maneja por separado - no marcar automáticamente
        lastActivityTimestamp: new Date(),
        unreadCount: 1 // TODO: calcular correctamente
      });
      
      this.logger.debug(`[${this.userId}] Mensaje guardado:`, { 
        messageId: message.id._serialized,
        from: message.from
      });
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error guardando mensaje:`, {
        error,
        messageId: message.id?._serialized
      });
    }
  }
  
  /**
   * GUARDAR MENSAJE SALIENTE EN BASE DE DATOS
   */
  private async saveOutgoingMessage(to: string, messageContent: string, origin: string): Promise<void> {
    try {
      const messageId = `out_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const messageData = {
        id: messageId,
        from: this.client?.info?.wid?.user || 'bot',
        to,
        body: messageContent,
        type: 'chat',
        timestamp: new Date(),
        hasMedia: false,
        isForwarded: false,
        isGroup: to.endsWith('@g.us'),
        origin: 'bot', // MENSAJE SALIENTE ES BOT
        subOrigin: origin, // automation_rule, ai_response, action_flow, etc.
        userId: this.userId, // AISLAMIENTO
        createdAt: new Date(),
        sentAt: new Date()
      };
      
      // GUARDAR MENSAJE CON AISLAMIENTO
      await this.db.collection('users')
        .doc(this.userId)
        .collection('chats')
        .doc(to)
        .collection('messages')
        .doc(messageId)
        .set(messageData);
      
      // ACTUALIZAR INFORMACIÓN DEL CHAT
      await this.updateChatInfo(to, {
        lastMessageContent: messageContent,
        lastMessageTimestamp: messageData.timestamp,
        lastMessageType: 'chat',
        lastMessageOrigin: 'bot',
        lastBotMessageTimestamp: messageData.timestamp,
        lastActivityTimestamp: new Date()
      });
      
      this.logger.debug(`[${this.userId}] Mensaje saliente guardado:`, { 
        messageId,
        to,
        origin
      });
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error guardando mensaje saliente:`, {
        error,
        to,
        origin
      });
    }
  }
  
  /**
   * ACTUALIZAR INFORMACIÓN DEL CHAT
   */
  private async updateChatInfo(chatId: string, updates: any): Promise<void> {
    try {
      const updateData = {
        ...updates,
        userId: this.userId, // AISLAMIENTO
        updatedAt: new Date()
      };
      
      await this.db.collection('users')
        .doc(this.userId)
        .collection('chats')
        .doc(chatId)
        .set(updateData, { merge: true });
        
    } catch (error) {
      this.logger.error(`[${this.userId}] Error actualizando info del chat:`, error);
    }
  }

  /**
   * MANEJAR MENSAJES IPC DEL PROCESO PADRE
   */
  private async handleIPCMessage(message: IPCMessage): Promise<void> {
    try {
      // VERIFICAR AISLAMIENTO - SOLO PROCESAR MENSAJES PARA ESTE USUARIO
      if (message.userId && message.userId !== this.userId) {
        this.logger.warn(`[${this.userId}] Mensaje IPC para otro usuario rechazado:`, {
          expectedUserId: this.userId,
          receivedUserId: message.userId,
          messageType: message.type
        });
        return;
      }
      
      this.logger.debug(`[${this.userId}] Procesando mensaje IPC:`, {
        type: message.type,
        messageId: message.messageId
      });
      
      switch (message.type) {
        case 'SEND_MESSAGE':
          if (message.data?.to && message.data?.message) {
            const sent = await this.sendMessage(
              message.data.to, 
              message.data.message, 
              message.data.origin || 'manual'
            );
            this.sendIPCResponse(message.messageId, 'SEND_MESSAGE_RESPONSE', { sent });
          }
          break;
          
        case 'SEND_MEDIA':
          if (message.data?.to && message.data?.mediaPath) {
            const sent = await this.sendMediaMessage(
              message.data.to,
              message.data.mediaPath,
              message.data.caption
            );
            this.sendIPCResponse(message.messageId, 'SEND_MEDIA_RESPONSE', { sent });
          }
          break;
          
        case 'UPDATE_AGENT':
          if (message.data?.agentId) {
            await this.changeActiveAgent(message.data.agentId);
            this.sendIPCResponse(message.messageId, 'AGENT_UPDATED', {
              agentId: this.activeAgentId,
              agentName: this.currentAgentConfig?.persona?.name
            });
          }
          break;
          
        case 'PAUSE_BOT':
          await this.updateBotPauseState(true, message.data?.reason);
          this.sendIPCResponse(message.messageId, 'BOT_PAUSED', { 
            paused: true,
            reason: message.data?.reason
          });
          break;
          
        case 'RESUME_BOT':
          await this.updateBotPauseState(false);
          this.sendIPCResponse(message.messageId, 'BOT_RESUMED', { paused: false });
          break;
          
        case 'GET_STATUS':
          const status = await this.getWorkerStatus();
          this.sendIPCResponse(message.messageId, 'STATUS_RESPONSE', status);
          break;
          
        case 'GET_QR':
          if (this.qrCode && this.qrExpiresAt && this.qrExpiresAt > new Date()) {
            this.sendIPCResponse(message.messageId, 'QR_RESPONSE', {
              qr: this.qrCode,
              qrImagePath: this.qrImagePath,
              expiresAt: this.qrExpiresAt.toISOString()
            });
          } else {
            this.sendIPCResponse(message.messageId, 'QR_RESPONSE', {
              error: 'QR no disponible o expirado'
            });
          }
          break;
          
        case 'RELOAD_CONFIG':
          await this.loadUserConfiguration();
          this.sendIPCResponse(message.messageId, 'CONFIG_RELOADED', {
            agent: this.currentAgentConfig?.persona?.name,
            rules: this.automationRules.length,
            flows: this.actionFlows.length
          });
          break;
          
        case 'ACTIVATE_CHAT':
          if (message.data?.chatId) {
            await this.activateChat(message.data.chatId, message.data.method || 'manual');
            this.sendIPCResponse(message.messageId, 'CHAT_ACTIVATED', {
              chatId: message.data.chatId
            });
          }
          break;
          
        case 'DEACTIVATE_CHAT':
          if (message.data?.chatId) {
            await this.deactivateChat(message.data.chatId, message.data.reason || 'manual');
            this.sendIPCResponse(message.messageId, 'CHAT_DEACTIVATED', {
              chatId: message.data.chatId
            });
          }
          break;
          
        case 'SHUTDOWN':
          this.logger.info(`[${this.userId}] Recibida señal de shutdown vía IPC`);
          await this.gracefulShutdown('ipc_shutdown');
          break;
          
        default:
          this.logger.warn(`[${this.userId}] Tipo de mensaje IPC desconocido:`, message.type);
          this.sendIPCResponse(message.messageId, 'UNKNOWN_MESSAGE_TYPE', {
            error: `Tipo de mensaje desconocido: ${message.type}`
          });
      }
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error manejando mensaje IPC:`, {
        error,
        messageType: message.type,
        messageId: message.messageId
      });
      
      this.sendIPCResponse(message.messageId, 'IPC_ERROR', {
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }
  
  /**
   * ENVIAR MENSAJE IPC AL PROCESO PADRE
   */
  private sendIPCMessage(type: string, data?: any): void {
    if (!this.ipcEnabled || !process.send) {
      return;
    }
    
    const message: IPCMessage = {
      type,
      userId: this.userId, // AISLAMIENTO CRÍTICO
      data,
      timestamp: Date.now(),
      messageId: `${this.userId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    };
    
    try {
      process.send(message);
    } catch (error) {
      this.logger.error(`[${this.userId}] Error enviando mensaje IPC:`, error);
    }
  }
  
  /**
   * ENVIAR RESPUESTA IPC
   */
  private sendIPCResponse(originalMessageId: string, type: string, data?: any): void {
    this.sendIPCMessage(type, {
      ...data,
      originalMessageId
    });
  }

  /**
   * OBTENER ESTADO COMPLETO DEL WORKER
   */
  private async getWorkerStatus(): Promise<UserWorkerStats> {
    return {
      userId: this.userId,
      status: this.connectionStatus,
      messagesProcessed: this.messagesProcessed,
      lastActivity: this.lastActivity,
      memoryUsage: process.memoryUsage(),
      uptime: Date.now() - this.startTime.getTime()
    };
  }
  
  /**
   * CAMBIAR AGENTE ACTIVO
   */
  private async changeActiveAgent(agentId: string): Promise<void> {
    try {
      this.activeAgentId = agentId;
      
      // RECARGAR CONFIGURACIÓN
      await this.loadUserConfiguration();
      
      this.logger.info(`[${this.userId}] Agente activo cambiado:`, {
        newAgentId: agentId,
        agentName: this.currentAgentConfig?.persona?.name || 'Unknown'
      });
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error cambiando agente:`, error);
      throw error;
    }
  }
  
  /**
   * ACTUALIZAR ESTADO DE PAUSA DEL BOT
   */
  private async updateBotPauseState(isPaused: boolean, reason?: string): Promise<void> {
    try {
      this.botPauseState = isPaused;
      
      // GUARDAR EN FIRESTORE
      await this.db.collection('users')
        .doc(this.userId)
        .collection('status')
        .doc('whatsapp')
        .set({
          botIsPaused: isPaused,
          pauseReason: reason,
          pauseUpdatedAt: new Date(),
          userId: this.userId
        }, { merge: true });
      
      this.logger.info(`[${this.userId}] Estado de pausa actualizado:`, {
        isPaused,
        reason
      });
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error actualizando estado de pausa:`, error);
    }
  }
  
  /**
   * GUARDAR QR EN BASE DE DATOS
   */
  private async saveQRToDatabase(qr: string, qrImage: string): Promise<void> {
    try {
      const qrData: QRCodeData = {
        userId: this.userId,
        qr,
        qrImage,
        timestamp: new Date(),
        expiresAt: this.qrExpiresAt!
      };
      
      await this.db.collection('users')
        .doc(this.userId)
        .collection('qr_codes')
        .doc('current')
        .set(qrData);
        
      // TAMBIÉN ACTUALIZAR STATUS
      await this.updateConnectionStatus('qr', {
        qrCode: qr,
        qrImage,
        qrExpiresAt: this.qrExpiresAt!.toISOString()
      });
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error guardando QR:`, error);
    }
  }
  
  /**
   * ACTUALIZAR ESTADO DE CONEXIÓN
   */
  private async updateConnectionStatus(status: string, additionalData?: any): Promise<void> {
    try {
      const statusData = {
        status,
        userId: this.userId,
        lastUpdated: new Date(),
        pid: process.pid,
        ...additionalData
      };
      
      await this.db.collection('users')
        .doc(this.userId)
        .collection('status')
        .doc('whatsapp')
        .set(statusData, { merge: true });
        
    } catch (error) {
      this.logger.error(`[${this.userId}] Error actualizando estado de conexión:`, error);
    }
  }
  
  /**
   * PROGRAMAR REFRESH DEL QR
   */
  private scheduleQRRefresh(): void {
    if (this.qrRefreshTimeout) {
      clearTimeout(this.qrRefreshTimeout);
    }
    
    this.qrRefreshTimeout = setTimeout(() => {
      if (this.connectionStatus === 'qr' && !this.isShuttingDown) {
        this.logger.info(`[${this.userId}] QR expirado, reiniciando cliente...`);
        this.initialize().catch(error => {
          this.logger.error(`[${this.userId}] Error reiniciando cliente para QR:`, error);
        });
      }
    }, this.QR_TIMEOUT_MS);
  }
  
  /**
   * SHUTDOWN GRACEFUL COMPLETO
   */
  public async gracefulShutdown(reason: string): Promise<void> {
    try {
      this.logger.info(`[${this.userId}] Iniciando shutdown graceful:`, { reason });
      this.isShuttingDown = true;
      
      // LIMPIAR TIMEOUTS
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      
      if (this.qrRefreshTimeout) {
        clearTimeout(this.qrRefreshTimeout);
        this.qrRefreshTimeout = null;
      }
      
      // CERRAR CLIENTE WHATSAPP
      if (this.client) {
        try {
          await this.client.logout();
          await this.client.destroy();
          this.logger.info(`[${this.userId}] Cliente WhatsApp cerrado correctamente`);
        } catch (clientError) {
          this.logger.warn(`[${this.userId}] Error cerrando cliente:`, clientError);
        }
        this.client = null;
      }
      
      // ACTUALIZAR ESTADO FINAL
      await this.updateConnectionStatus('disconnected', {
        shutdownReason: reason,
        shutdownAt: new Date().toISOString()
      });
      
      // NOTIFICAR SHUTDOWN VÍA IPC
      this.sendIPCMessage('WORKER_SHUTDOWN', {
        reason,
        finalStats: await this.getWorkerStatus()
      });
      
      this.logger.info(`[${this.userId}] Shutdown graceful completado`);
      
      // SALIR DEL PROCESO
      setTimeout(() => {
        process.exit(0);
      }, 1000);
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error durante shutdown graceful:`, error);
      process.exit(1);
    }
  }
  
  /**
   * MÉTODOS ADICIONALES PARA EXTENSIBILIDAD
   */
  
  /**
   * ESTABLECER VARIABLE DE CHAT
   */
  private async setChatVariable(chatId: string, variableName: string, variableValue: any): Promise<void> {
    try {
      await this.db.collection('users')
        .doc(this.userId)
        .collection('chats')
        .doc(chatId)
        .collection('variables')
        .doc(variableName)
        .set({
          name: variableName,
          value: variableValue,
          userId: this.userId,
          updatedAt: new Date(),
          createdAt: new Date()
        }, { merge: true });
        
      this.logger.debug(`[${this.userId}] Variable de chat establecida:`, {
        chatId,
        variableName,
        variableValue
      });
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error estableciendo variable de chat:`, error);
    }
  }
  
  /**
   * EJECUTAR WEBHOOK
   */
  private async executeWebhook(webhookUrl: string, message: any, flow: ActionFlow): Promise<void> {
    try {
      const webhookData = {
        userId: this.userId,
        chatId: message.from,
        message: {
          id: message.id._serialized,
          body: message.body,
          from: message.from,
          timestamp: message.timestamp
        },
        flow: {
          id: flow.id,
          name: flow.name
        },
        timestamp: new Date().toISOString()
      };
      
      // TODO: Implementar HTTP request al webhook
      this.logger.info(`[${this.userId}] Webhook ejecutado:`, {
        url: webhookUrl,
        flowId: flow.id
      });
      
    } catch (error) {
      this.logger.error(`[${this.userId}] Error ejecutando webhook:`, error);
    }
  }
  
  /**
   * EVALUAR CONDICIÓN DE PASO
   */
  private async evaluateStepCondition(condition: string, message: any): Promise<boolean> {
    try {
      // IMPLEMENTACIÓN SIMPLE DE EVALUACIÓN DE CONDICIONES
      // Se puede extender para condiciones más complejas
      return this.safeEvaluateCondition(condition);
    } catch (error) {
      this.logger.error(`[${this.userId}] Error evaluando condición de paso:`, error);
      return false;
    }
  }
}

// === MAIN EXECUTION ===
// Si este archivo se ejecuta directamente (como proceso hijo)
if (require.main === module) {
  const userId = process.argv[2];
  const activeAgentId = process.argv[3] || null;
  
  if (!userId) {
    console.error('ERROR: userId es requerido como argumento');
    process.exit(1);
  }
  
  console.log(`Iniciando WhatsApp Worker para usuario: ${userId}`);
  
  const worker = new WhatsAppWorker(userId, activeAgentId, {
    enableIPC: true,
    qrTimeout: parseInt(process.env.QR_TIMEOUT_MS || '300000')
  });
  
  // INICIALIZAR WORKER
  worker.initialize().catch(error => {
    console.error(`Error inicializando worker para ${userId}:`, error);
    process.exit(1);
  });
  
  // MANEJAR SEÑALES DE SISTEMA
  process.on('SIGTERM', () => {
    console.log(`Worker ${userId} recibió SIGTERM`);
    worker.gracefulShutdown('SIGTERM');
  });
  
  process.on('SIGINT', () => {
    console.log(`Worker ${userId} recibió SIGINT`);
    worker.gracefulShutdown('SIGINT');
  });
}

export { WhatsAppWorker };