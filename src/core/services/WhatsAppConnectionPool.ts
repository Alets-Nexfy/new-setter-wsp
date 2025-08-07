import { EventEmitter } from 'events';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { LoggerService } from '@/core/services/LoggerService';
import { SupabaseService } from '@/core/services/SupabaseService';
import { UserTierService, UserTier, TierConfiguration } from './UserTierService';
import { MessageData, WorkerStatus } from '@/workers/whatsapp-worker/types';
import { v4 as uuidv4 } from 'uuid';
import { ChromeCleanupService } from './ChromeCleanupService';

interface ConnectionSlot {
  id: string;
  client: Client;
  users: Set<string>;
  maxUsers: number;
  status: 'initializing' | 'ready' | 'error' | 'disconnected';
  lastActivity: Date;
  resourceUsage: {
    memoryMB: number;
    cpuPercent: number;
  };
  tier: UserTier;
  assignedUserId?: string;
}

interface DedicatedWorker {
  userId: string;
  process: ChildProcess;
  status: WorkerStatus;
  pid: number;
  startTime: Date;
  lastActivity: Date;
}

interface UserSession {
  userId: string;
  tier: UserTier;
  connectionType: 'shared' | 'semi-dedicated' | 'dedicated' | 'enterprise_b2b';
  connectionId?: string; // Para shared/semi-dedicated/enterprise_b2b
  workerId?: string; // Para dedicated
  isAuthenticated: boolean;
  isPaused: boolean; // For bot control
  phoneNumber?: string;
  qrCode?: string;
  qrImage?: string;
  lastActivity: Date;
  messageCount: number;
}

export class WhatsAppConnectionPool extends EventEmitter {
  private static instance: WhatsAppConnectionPool | null = null;
  private logger: LoggerService;
  private db: SupabaseService;
  private tierService: UserTierService;
  private chromeCleanup: ChromeCleanupService;
  private isInitialized: boolean = false;
  
  // Shared pool for standard users (cost-optimized)
  private sharedPool: Map<string, ConnectionSlot> = new Map();
  private readonly SHARED_POOL_SIZE = 20;
  private readonly USERS_PER_SHARED_CONNECTION = 10;
  
  // Semi-dedicated for professional users
  private semiDedicatedPool: Map<string, ConnectionSlot> = new Map();
  private readonly SEMI_DEDICATED_POOL_SIZE = 50;
  private readonly USERS_PER_SEMI_CONNECTION = 3;
  
  // Dedicated workers for enterprise users
  private dedicatedWorkers: Map<string, DedicatedWorker> = new Map();
  
  // Enterprise B2B pool for partner platforms (optimized for 10-100 users)
  private enterpriseB2BPool: Map<string, ConnectionSlot> = new Map();
  private readonly ENTERPRISE_B2B_POOL_SIZE = 25; // Can handle up to 125 users (25 * 5)
  private readonly USERS_PER_B2B_CONNECTION = 5; // Sweet spot for enterprise features with shared resources
  
  // User session tracking
  private userSessions: Map<string, UserSession> = new Map();
  
  // Auto-scaling metrics
  private poolMetrics = {
    totalConnections: 0,
    activeUsers: 0,
    resourceUtilization: 0,
    costPerUser: 0,
    lastOptimization: new Date()
  };

  private isShuttingDown = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private optimizationInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    
    // Configure EventEmitter to handle more listeners for multiple users
    this.setMaxListeners(100);
    
    this.logger = LoggerService.getInstance();
    this.db = SupabaseService.getInstance();
    this.tierService = UserTierService.getInstance();
    this.chromeCleanup = ChromeCleanupService.getInstance();
  }
  
  public static getInstance(): WhatsAppConnectionPool {
    if (!WhatsAppConnectionPool.instance) {
      WhatsAppConnectionPool.instance = new WhatsAppConnectionPool();
    }
    return WhatsAppConnectionPool.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('WhatsApp Connection Pool already initialized, skipping');
      return;
    }
    
    try {
      this.logger.info('Initializing WhatsApp Connection Pool (ON-DEMAND Mode)');

      // Setup event handlers only once
      this.setupEventHandlers();
      
      // DO NOT pre-create any slots - they will be created on-demand
      // Just initialize the monitoring systems
      
      // Setup monitoring
      this.startHealthChecks();
      this.startOptimizationCycle();
      
      this.isInitialized = true;
      this.emit('pool:ready');
      this.logger.info('WhatsApp Connection Pool initialized (ON-DEMAND mode)', {
        mode: 'on-demand',
        sharedSlots: 0,
        semiDedicatedSlots: 0,
        enterpriseB2BSlots: 0,
        dedicatedWorkers: 0,
        note: 'Slots will be created when users connect'
      });

    } catch (error) {
      this.logger.error('Failed to initialize connection pool', { error });
      throw error;
    }
  }

  // PRIMARY METHOD: Connect user based on tier
  public async connectUser(userId: string): Promise<UserSession> {
    try {
      // Check if user already has an active session
      const existingSession = this.userSessions.get(userId);
      if (existingSession) {
        this.logger.info('User already has an active session, disconnecting first', { 
          userId, 
          connectionType: existingSession.connectionType,
          connectionId: existingSession.connectionId 
        });
        await this.disconnectUser(userId);
        // Wait a bit for cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const tierInfo = await this.tierService.getUserTier(userId);
      
      this.logger.info('Connecting user to WhatsApp', { 
        userId, 
        tier: tierInfo.tier,
        dedicatedWorker: tierInfo.configuration.resources.dedicatedWorker 
      });

      let session: UserSession;

      if (tierInfo.configuration.resources.dedicatedWorker) {
        // Enterprise: Dedicated worker
        session = await this.connectToDedicatedWorker(userId, tierInfo.tier);
      } else if (tierInfo.tier === 'enterprise_b2b') {
        // Enterprise B2B: Shared pool with enterprise features
        session = await this.connectToEnterpriseB2BPool(userId, tierInfo.tier);
      } else if (tierInfo.tier === 'professional') {
        // Professional: Semi-dedicated pool
        session = await this.connectToSemiDedicatedPool(userId, tierInfo.tier);
      } else {
        // Standard: Shared pool
        session = await this.connectToSharedPool(userId, tierInfo.tier);
      }

      this.userSessions.set(userId, session);
      await this.updatePoolMetrics();

      this.emit('user:connected', { userId, session });
      return session;

    } catch (error) {
      this.logger.error('Failed to connect user', { userId, error });
      throw error;
    }
  }

  // Connect to shared pool (Standard tier - max cost savings)
  private async connectToSharedPool(userId: string, tier: UserTier): Promise<UserSession> {
    // Find available slot or create new one
    let availableSlot = this.findAvailableSharedSlot();
    
    if (!availableSlot) {
      if (this.sharedPool.size >= this.SHARED_POOL_SIZE) {
        throw new Error('Shared pool capacity exceeded');
      }
      availableSlot = await this.createSharedSlot();
    }

    // Add user to slot
    availableSlot.users.add(userId);
    availableSlot.lastActivity = new Date();

    const session: UserSession = {
      userId,
      tier,
      connectionType: 'shared',
      connectionId: availableSlot.id,
      isAuthenticated: false,
      isPaused: false,
      lastActivity: new Date(),
      messageCount: 0
    };

    // Setup client event handlers for this user
    this.setupSharedClientHandlers(availableSlot.client, userId);

    return session;
  }

  // Connect to semi-dedicated pool (Professional tier)
  private async connectToSemiDedicatedPool(userId: string, tier: UserTier): Promise<UserSession> {
    let availableSlot = this.findAvailableSemiDedicatedSlot();
    
    if (!availableSlot) {
      if (this.semiDedicatedPool.size >= this.SEMI_DEDICATED_POOL_SIZE) {
        // Scale up if needed
        await this.scaleUpSemiDedicatedPool();
        availableSlot = this.findAvailableSemiDedicatedSlot();
      }
      
      if (!availableSlot) {
        availableSlot = await this.createSemiDedicatedSlot();
      }
    }

    availableSlot.users.add(userId);
    availableSlot.lastActivity = new Date();

    // Register user PID for protection from cleanup
    try {
      // @ts-ignore - accessing private property
      const client = availableSlot.client;
      const page = client.pupPage;
      if (page && page.browser) {
        const browser = await page.browser();
        const process = browser.process();
        if (process && process.pid) {
          this.chromeCleanup.registerActiveSession(userId, process.pid);
          this.logger.info('Registered Semi-dedicated user PID with cleanup service', { 
            userId,
            slotId: availableSlot.id,
            pid: process.pid 
          });
        }
      }
    } catch (error) {
      this.logger.warn('Could not register user PID for semi-dedicated', { userId, error });
    }

    const session: UserSession = {
      userId,
      tier,
      connectionType: 'semi-dedicated',
      connectionId: availableSlot.id,
      isAuthenticated: false,
      isPaused: false,
      lastActivity: new Date(),
      messageCount: 0
    };

    this.setupSemiDedicatedClientHandlers(availableSlot.client, userId);

    return session;
  }

  // Connect to dedicated worker (Enterprise tier)
  private async connectToDedicatedWorker(userId: string, tier: UserTier): Promise<UserSession> {
    if (this.dedicatedWorkers.has(userId)) {
      const existingWorker = this.dedicatedWorkers.get(userId)!;
      if (existingWorker.process && !existingWorker.process.killed) {
        // Worker already exists and running
        return {
          userId,
          tier,
          connectionType: 'dedicated',
          workerId: userId,
          isAuthenticated: existingWorker.status.isAuthenticated,
          phoneNumber: existingWorker.status.phoneNumber,
          lastActivity: new Date(),
          messageCount: 0,
          isPaused: false
        };
      }
    }

    // Create new dedicated worker
    const worker = await this.spawnDedicatedWorker(userId);
    
    const session: UserSession = {
      userId,
      tier,
      connectionType: 'dedicated',
      workerId: userId,
      isAuthenticated: false,
      isPaused: false,
      lastActivity: new Date(),
      messageCount: 0
    };

    return session;
  }

  // Shared pool management
  private async initializeSharedPool(): Promise<void> {
    this.logger.info('Shared pool ready for on-demand creation', { 
      maxSize: this.SHARED_POOL_SIZE,
      currentSize: this.sharedPool.size 
    });
    // DO NOT pre-create any slots - they will be created on-demand
  }

  private async createSharedSlot(): Promise<ConnectionSlot> {
    const slotId = `shared_${uuidv4()}`;
    
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: slotId,
        dataPath: path.join(process.env.USER_DATA_PATH || './data_v2', 'shared', slotId)
      }),
      puppeteer: {
        headless: process.env.WHATSAPP_PUPPETEER_HEADLESS === 'true',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--memory-pressure-off' // Optimize for shared usage
        ]
      }
    });

    const slot: ConnectionSlot = {
      id: slotId,
      client,
      users: new Set(),
      maxUsers: this.USERS_PER_SHARED_CONNECTION,
      status: 'initializing',
      lastActivity: new Date(),
      resourceUsage: { memoryMB: 0, cpuPercent: 0 },
      tier: 'standard'
    };

    this.setupSharedSlotHandlers(slot);
    this.sharedPool.set(slotId, slot);

    // Initialize client
    await client.initialize();

    this.logger.info('Shared slot created', { slotId, maxUsers: this.USERS_PER_SHARED_CONNECTION });
    return slot;
  }

  private findAvailableSharedSlot(): ConnectionSlot | null {
    for (const slot of this.sharedPool.values()) {
      if (slot.status === 'ready' && slot.users.size < slot.maxUsers) {
        return slot;
      }
    }
    return null;
  }

  // Semi-dedicated pool management
  private async initializeSemiDedicatedPool(): Promise<void> {
    this.logger.info('Semi-dedicated pool ready for on-demand creation', { 
      maxSize: this.SEMI_DEDICATED_POOL_SIZE,
      currentSize: this.semiDedicatedPool.size 
    });
    // DO NOT pre-create any slots - they will be created on-demand
  }

  private async createSemiDedicatedSlot(): Promise<ConnectionSlot> {
    const slotId = `semi_${uuidv4()}`;
    
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: slotId,
        dataPath: path.join(process.env.USER_DATA_PATH || './data_v2', 'semi-dedicated', slotId)
      }),
      puppeteer: {
        headless: process.env.WHATSAPP_PUPPETEER_HEADLESS === 'true',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    const slot: ConnectionSlot = {
      id: slotId,
      client,
      users: new Set(),
      maxUsers: this.USERS_PER_SEMI_CONNECTION,
      status: 'initializing',
      lastActivity: new Date(),
      resourceUsage: { memoryMB: 0, cpuPercent: 0 },
      tier: 'professional'
    };

    this.setupSemiDedicatedSlotHandlers(slot);
    this.semiDedicatedPool.set(slotId, slot);

    await client.initialize();

    this.logger.info('Semi-dedicated slot created', { slotId, maxUsers: this.USERS_PER_SEMI_CONNECTION });
    return slot;
  }

  private findAvailableSemiDedicatedSlot(): ConnectionSlot | null {
    for (const slot of this.semiDedicatedPool.values()) {
      if (slot.status === 'ready' && slot.users.size < slot.maxUsers) {
        return slot;
      }
    }
    return null;
  }

  // ========== ENTERPRISE B2B POOL MANAGEMENT ==========
  
  // Connect to Enterprise B2B pool (enterprise features with shared resources)
  private async connectToEnterpriseB2BPool(userId: string, tier: UserTier): Promise<UserSession> {
    let availableSlot = this.findAvailableEnterpriseB2BSlot();
    
    if (!availableSlot) {
      if (this.enterpriseB2BPool.size >= this.ENTERPRISE_B2B_POOL_SIZE) {
        // Scale up if needed
        await this.scaleUpEnterpriseB2BPool();
        availableSlot = this.findAvailableEnterpriseB2BSlot();
      }
      
      if (!availableSlot) {
        availableSlot = await this.createEnterpriseB2BSlot();
      }
    }

    availableSlot.users.add(userId);
    availableSlot.lastActivity = new Date();

    const session: UserSession = {
      userId,
      tier,
      connectionType: 'enterprise_b2b',
      connectionId: availableSlot.id,
      isAuthenticated: false,
      isPaused: false,
      lastActivity: new Date(),
      messageCount: 0
    };

    this.setupEnterpriseB2BClientHandlers(availableSlot.client, userId);

    return session;
  }

  // Enterprise B2B pool initialization
  private async initializeEnterpriseB2BPool(): Promise<void> {
    this.logger.info('Enterprise B2B pool ready for on-demand creation', { 
      maxSize: this.ENTERPRISE_B2B_POOL_SIZE,
      usersPerConnection: this.USERS_PER_B2B_CONNECTION,
      currentSize: this.enterpriseB2BPool.size
    });
    // DO NOT pre-create any slots - they will be created on-demand
  }

  private async createEnterpriseB2BSlot(): Promise<ConnectionSlot> {
    const slotId = `b2b_enterprise_${uuidv4()}`;
    
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: slotId,
        dataPath: path.join(process.env.USER_DATA_PATH || './data_v2', 'enterprise-b2b', slotId)
      }),
      puppeteer: {
        headless: process.env.WHATSAPP_PUPPETEER_HEADLESS === 'true',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--memory-pressure-off', // Optimize for enterprise performance
          '--max-old-space-size=512' // Higher memory per connection for enterprise features
        ]
      }
    });

    const slot: ConnectionSlot = {
      id: slotId,
      client,
      users: new Set(),
      maxUsers: this.USERS_PER_B2B_CONNECTION,
      status: 'initializing',
      lastActivity: new Date(),
      resourceUsage: { memoryMB: 0, cpuPercent: 0 },
      tier: 'enterprise_b2b'
    };

    this.setupEnterpriseB2BSlotHandlers(slot);
    this.enterpriseB2BPool.set(slotId, slot);

    await client.initialize();

    this.logger.info('Enterprise B2B slot created', { 
      slotId, 
      maxUsers: this.USERS_PER_B2B_CONNECTION,
      tier: 'enterprise_b2b'
    });
    return slot;
  }

  private findAvailableEnterpriseB2BSlot(): ConnectionSlot | null {
    for (const slot of this.enterpriseB2BPool.values()) {
      if (slot.status === 'ready' && slot.users.size < slot.maxUsers) {
        return slot;
      }
    }
    return null;
  }

  private async scaleUpEnterpriseB2BPool(): Promise<void> {
    if (this.enterpriseB2BPool.size >= this.ENTERPRISE_B2B_POOL_SIZE) {
      return;
    }

    this.logger.info('Scaling up Enterprise B2B pool');
    await this.createEnterpriseB2BSlot();
  }

  private setupEnterpriseB2BSlotHandlers(slot: ConnectionSlot): void {
    const client = slot.client;

    client.on('qr', (qr: string) => {
      this.handleEnterpriseB2BQR(slot, qr);
    });

    client.on('ready', async () => {
      slot.status = 'ready';
      this.logger.info('Enterprise B2B slot ready', { slotId: slot.id });
      
      // Register browser PID with Chrome cleanup service
      try {
        // @ts-ignore - accessing private property
        const page = client.pupPage;
        if (page && page.browser) {
          const browser = await page.browser();
          const process = browser.process();
          if (process && process.pid) {
            // Register slot ID for maximum protection
            this.chromeCleanup.registerActiveSession(slot.id, process.pid);
            if (slot.assignedUserId) {
              this.chromeCleanup.registerActiveSession(slot.assignedUserId, process.pid);
            }
            this.logger.info('Registered Enterprise B2B browser PID with cleanup service', { 
              slotId: slot.id,
              userId: slot.assignedUserId,
              pid: process.pid 
            });
          }
        }
      } catch (error) {
        this.logger.warn('Could not register browser PID', { slotId: slot.id, error });
      }
      
      // Update all user sessions associated with this slot as authenticated
      for (const userId of slot.users) {
        const session = this.userSessions.get(userId);
        if (session) {
          session.isAuthenticated = true;
          session.lastActivity = new Date();
          this.logger.info('User session marked as authenticated', { 
            userId, 
            slotId: slot.id 
          });
        }
      }
      
      this.emit('slot:ready', { type: 'enterprise_b2b', slotId: slot.id });
    });

    client.on('auth_failure', (msg: string) => {
      slot.status = 'error';
      this.logger.error('Enterprise B2B slot auth failure', { slotId: slot.id, message: msg });
      this.emit('slot:auth_failure', { type: 'enterprise_b2b', slotId: slot.id, error: msg });
    });

    client.on('disconnected', (reason: string) => {
      slot.status = 'disconnected';
      this.logger.warn('Enterprise B2B slot disconnected', { slotId: slot.id, reason });
      
      // Unregister from Chrome cleanup service
      this.chromeCleanup.unregisterSession(slot.id);
      
      this.emit('slot:disconnected', { type: 'enterprise_b2b', slotId: slot.id, reason });
    });
  }

  private setupEnterpriseB2BClientHandlers(client: Client, userId: string): void {
    client.on('message', async (message: any) => {
      if (message.from.includes(userId) || message.to.includes(userId)) {
        await this.handleUserMessage(userId, message);
      }
    });
  }

  private async handleEnterpriseB2BQR(slot: ConnectionSlot, qr: string): Promise<void> {
    // Enterprise B2B QR handling with priority
    for (const userId of slot.users) {
      const session = this.userSessions.get(userId);
      if (session) {
        session.qrCode = qr;
        const QRCode = require('qrcode');
        session.qrImage = await QRCode.toDataURL(qr);
        
        // Save QR to database for API access
        await this.saveQRToDatabase(userId, qr, session.qrImage);
        
        // Emit with enterprise priority
        this.emit('user:qr', { 
          userId, 
          qr, 
          qrImage: session.qrImage,
          tier: 'enterprise_b2b',
          priority: 'high'
        });
      }
    }
  }

  // Dedicated worker management
  private async spawnDedicatedWorker(userId: string): Promise<DedicatedWorker> {
    const userDataPath = path.join(
      process.env.USER_DATA_PATH || './data_v2', 
      'dedicated', 
      userId
    );

    const env = {
      ...process.env,
      WORKER_USER_ID: userId,
      USER_DATA_PATH: userDataPath,
      WORKER_TYPE: 'dedicated'
    };

    const workerProcess = spawn('node', [
      '--require', 'ts-node/register',
      '--require', 'tsconfig-paths/register',
      path.join(__dirname, '../../workers/whatsapp-worker/worker-process.js')
    ], {
      env,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      cwd: process.cwd()
    });

    if (!workerProcess.pid) {
      throw new Error('Failed to spawn dedicated worker process');
    }

    const worker: DedicatedWorker = {
      userId,
      process: workerProcess,
      status: {
        userId,
        processId: workerProcess.pid,
        status: 'starting',
        lastActivity: new Date(),
        restartCount: 0,
        isAuthenticated: false,
        uptime: 0
      },
      pid: workerProcess.pid,
      startTime: new Date(),
      lastActivity: new Date()
    };

    this.setupDedicatedWorkerHandlers(worker);
    this.dedicatedWorkers.set(userId, worker);

    // Initialize worker
    workerProcess.send({
      type: 'init',
      userId,
      data: { config: { dedicatedMode: true } },
      timestamp: new Date()
    });

    this.logger.info('Dedicated worker spawned', { userId, pid: workerProcess.pid });
    return worker;
  }

  // Event handlers setup
  private setupSharedSlotHandlers(slot: ConnectionSlot): void {
    const client = slot.client;

    client.on('qr', (qr: string) => {
      this.handleSharedQR(slot, qr);
    });

    client.on('ready', async () => {
      slot.status = 'ready';
      this.logger.info('Shared slot ready', { slotId: slot.id });
      
      // Register browser PID with Chrome cleanup service
      try {
        // @ts-ignore - accessing private property
        const page = client.pupPage;
        if (page && page.browser) {
          const browser = await page.browser();
          const process = browser.process();
          if (process && process.pid) {
            // Register slot ID for maximum protection
            this.chromeCleanup.registerActiveSession(slot.id, process.pid);
            if (slot.assignedUserId) {
              this.chromeCleanup.registerActiveSession(slot.assignedUserId, process.pid);
            }
            this.logger.info('Registered Shared browser PID with cleanup service', { 
              slotId: slot.id,
              userId: slot.assignedUserId, 
              pid: process.pid 
            });
          }
        }
      } catch (error) {
        this.logger.warn('Could not register browser PID', { slotId: slot.id, error });
      }
      
      // Update all user sessions associated with this slot as authenticated
      for (const userId of slot.users) {
        const session = this.userSessions.get(userId);
        if (session) {
          session.isAuthenticated = true;
          session.lastActivity = new Date();
          this.logger.info('User session marked as authenticated', { 
            userId, 
            slotId: slot.id 
          });
        }
      }
      
      this.emit('slot:ready', { type: 'shared', slotId: slot.id });
    });

    client.on('auth_failure', (msg: string) => {
      slot.status = 'error';
      this.logger.error('Shared slot auth failure', { slotId: slot.id, message: msg });
      this.emit('slot:auth_failure', { type: 'shared', slotId: slot.id, error: msg });
    });

    client.on('disconnected', (reason: string) => {
      slot.status = 'disconnected';
      this.logger.warn('Shared slot disconnected', { slotId: slot.id, reason });
      this.emit('slot:disconnected', { type: 'shared', slotId: slot.id, reason });
    });
  }

  private setupSharedClientHandlers(client: Client, userId: string): void {
    client.on('message', async (message: any) => {
      if (message.from.includes(userId) || message.to.includes(userId)) {
        await this.handleUserMessage(userId, message);
      }
    });
  }

  private setupSemiDedicatedSlotHandlers(slot: ConnectionSlot): void {
    // Similar to shared but with better resource allocation
    const client = slot.client;

    client.on('qr', (qr: string) => {
      this.handleSemiDedicatedQR(slot, qr);
    });

    client.on('ready', async () => {
      slot.status = 'ready';
      this.logger.info('Semi-dedicated slot ready', { slotId: slot.id });
      
      // Register browser PID with Chrome cleanup service
      try {
        // @ts-ignore - accessing private property
        const page = client.pupPage;
        if (page && page.browser) {
          const browser = await page.browser();
          const process = browser.process();
          if (process && process.pid) {
            this.chromeCleanup.registerActiveSession(slot.id, process.pid);
            this.logger.info('Registered Semi-dedicated browser PID with cleanup service', { 
              slotId: slot.id, 
              pid: process.pid 
            });
          }
        }
      } catch (error) {
        this.logger.warn('Could not register browser PID', { slotId: slot.id, error });
      }
      
      // Update all user sessions associated with this slot as authenticated
      for (const userId of slot.users) {
        const session = this.userSessions.get(userId);
        if (session) {
          session.isAuthenticated = true;
          session.lastActivity = new Date();
          this.logger.info('User session marked as authenticated', { 
            userId, 
            slotId: slot.id 
          });
        }
      }
      
      this.emit('slot:ready', { type: 'semi-dedicated', slotId: slot.id });
    });

    // Additional handlers...
  }

  private setupSemiDedicatedClientHandlers(client: Client, userId: string): void {
    client.on('message', async (message: any) => {
      if (message.from.includes(userId) || message.to.includes(userId)) {
        await this.handleUserMessage(userId, message);
      }
    });
  }

  private setupDedicatedWorkerHandlers(worker: DedicatedWorker): void {
    const process = worker.process;

    process.on('message', (message: any) => {
      this.handleDedicatedWorkerMessage(worker.userId, message);
    });

    process.on('exit', (code: number | null, signal: string | null) => {
      this.handleDedicatedWorkerExit(worker.userId, code, signal);
    });

    process.on('error', (error: Error) => {
      this.logger.error('Dedicated worker error', { userId: worker.userId, error });
      worker.status.status = 'error';
    });
  }

  // Message handling
  private async handleSharedQR(slot: ConnectionSlot, qr: string): Promise<void> {
    // For shared slots, we need to handle QR differently
    // Each user in the slot needs to be notified
    for (const userId of slot.users) {
      const session = this.userSessions.get(userId);
      if (session) {
        session.qrCode = qr;
        // Generate QR image
        const QRCode = require('qrcode');
        session.qrImage = await QRCode.toDataURL(qr);
        
        // Save QR to database for API access
        await this.saveQRToDatabase(userId, qr, session.qrImage);
        
        this.emit('user:qr', { userId, qr, qrImage: session.qrImage });
      }
    }
  }

  private async handleSemiDedicatedQR(slot: ConnectionSlot, qr: string): Promise<void> {
    // Similar to shared but with better isolation
    for (const userId of slot.users) {
      const session = this.userSessions.get(userId);
      if (session) {
        session.qrCode = qr;
        const QRCode = require('qrcode');
        session.qrImage = await QRCode.toDataURL(qr);
        
        // Save QR to database for API access
        await this.saveQRToDatabase(userId, qr, session.qrImage);
        
        this.emit('user:qr', { userId, qr, qrImage: session.qrImage });
      }
    }
  }

  private handleDedicatedWorkerMessage(userId: string, message: any): void {
    const worker = this.dedicatedWorkers.get(userId);
    if (!worker) return;

    worker.lastActivity = new Date();

    switch (message.type) {
      case 'qr':
        this.emit('user:qr', { userId, qr: message.data.qr, qrImage: message.data.qrImage });
        break;

      case 'ready':
        worker.status.isAuthenticated = true;
        worker.status.phoneNumber = message.data.phoneNumber;
        worker.status.status = 'running';
        this.emit('user:ready', { userId, phoneNumber: message.data.phoneNumber });
        break;

      case 'message':
        this.emit('user:message', { userId, messageData: message.data });
        break;

      case 'error':
        worker.status.status = 'error';
        this.emit('user:error', { userId, error: message.data.error });
        break;
    }
  }

  private async handleUserMessage(userId: string, message: any): Promise<void> {
    const session = this.userSessions.get(userId);
    if (session) {
      session.messageCount++;
      session.lastActivity = new Date();
      
      // Update usage in tier service
      await this.tierService.updateUsage(userId, {
        messagesThisMonth: session.messageCount,
        lastActivity: new Date()
      });

      this.emit('user:message', { userId, message });
    }
  }

  private handleDedicatedWorkerExit(userId: string, code: number | null, signal: string | null): void {
    this.logger.info('Dedicated worker exited', { userId, code, signal });
    
    const worker = this.dedicatedWorkers.get(userId);
    if (worker && !this.isShuttingDown) {
      // Attempt restart
      setTimeout(async () => {
        try {
          await this.spawnDedicatedWorker(userId);
        } catch (error) {
          this.logger.error('Failed to restart dedicated worker', { userId, error });
        }
      }, 5000);
    }

    this.dedicatedWorkers.delete(userId);
  }

  /**
   * Save QR code to database for API access
   */
  private async saveQRToDatabase(userId: string, qr: string, qrImage: string): Promise<void> {
    try {
      // Extract UUID from prefixed userId (tribe-ia-nexus_uuid -> uuid)
      const userUuid = userId.startsWith('tribe-ia-nexus_') 
        ? userId.replace('tribe-ia-nexus_', '') 
        : userId;

      const { error } = await this.db.from('qr_codes').insert({
        userId: userUuid,
        qrCode: qr,
        qr_image: qrImage  // Using snake_case as shown in schema
        // createdAt and expiresAt will use their DEFAULT values from the schema
      });

      if (error) {
        this.logger.error('Failed to save QR to database', { userId, error });
      } else {
        this.logger.info('QR code saved to database', { userId: userUuid });
      }
    } catch (error) {
      this.logger.error('Error saving QR to database', { userId, error });
    }
  }

  // Auto-scaling and optimization
  private async scaleUpSemiDedicatedPool(): Promise<void> {
    if (this.semiDedicatedPool.size >= this.SEMI_DEDICATED_POOL_SIZE) {
      return;
    }

    this.logger.info('Scaling up semi-dedicated pool');
    await this.createSemiDedicatedSlot();
  }

  private async optimizePool(): Promise<void> {
    await this.optimizeSharedPool();
    await this.optimizeSemiDedicatedPool();
    await this.optimizeEnterpriseB2BPool();
    await this.updatePoolMetrics();
    
    this.logger.info('Pool optimization completed', this.poolMetrics);
  }

  private async optimizeSharedPool(): Promise<void> {
    // Remove unused slots
    for (const [slotId, slot] of this.sharedPool.entries()) {
      if (slot.users.size === 0 && 
          Date.now() - slot.lastActivity.getTime() > 30 * 60 * 1000) { // 30 minutes
        await slot.client.destroy();
        this.sharedPool.delete(slotId);
        this.logger.info('Removed unused shared slot', { slotId });
      }
    }
  }

  private async optimizeSemiDedicatedPool(): Promise<void> {
    // Similar optimization for semi-dedicated
    for (const [slotId, slot] of this.semiDedicatedPool.entries()) {
      if (slot.users.size === 0 && 
          Date.now() - slot.lastActivity.getTime() > 15 * 60 * 1000) { // 15 minutes
        await slot.client.destroy();
        this.semiDedicatedPool.delete(slotId);
        this.logger.info('Removed unused semi-dedicated slot', { slotId });
      }
    }
  }

  private async optimizeEnterpriseB2BPool(): Promise<void> {
    // Optimize Enterprise B2B pool with shorter timeout for better resource management
    for (const [slotId, slot] of this.enterpriseB2BPool.entries()) {
      if (slot.users.size === 0 && 
          Date.now() - slot.lastActivity.getTime() > 10 * 60 * 1000) { // 10 minutes for B2B
        await slot.client.destroy();
        this.enterpriseB2BPool.delete(slotId);
        this.logger.info('Removed unused Enterprise B2B slot', { slotId });
      }
    }
  }

  private async updatePoolMetrics(): Promise<void> {
    const totalConnections = this.sharedPool.size + this.semiDedicatedPool.size + this.enterpriseB2BPool.size + this.dedicatedWorkers.size;
    const activeUsers = this.userSessions.size;
    
    // Calculate cost per user (simplified)
    const sharedCost = this.sharedPool.size * 0.1; // $0.10 per shared slot
    const semiCost = this.semiDedicatedPool.size * 0.3; // $0.30 per semi slot
    const b2bCost = this.enterpriseB2BPool.size * 0.5; // $0.50 per B2B slot (enterprise features)
    const dedicatedCost = this.dedicatedWorkers.size * 1.0; // $1.00 per dedicated worker
    
    const totalCost = sharedCost + semiCost + b2bCost + dedicatedCost;
    const costPerUser = activeUsers > 0 ? totalCost / activeUsers : 0;

    this.poolMetrics = {
      totalConnections,
      activeUsers,
      resourceUtilization: this.calculateResourceUtilization(),
      costPerUser,
      lastOptimization: new Date()
    };

    this.emit('metrics:updated', this.poolMetrics);
  }

  private calculateResourceUtilization(): number {
    // Simplified calculation - in production this would be more sophisticated
    let totalUtilization = 0;
    let totalSlots = 0;

    for (const slot of this.sharedPool.values()) {
      totalUtilization += (slot.users.size / slot.maxUsers) * 100;
      totalSlots++;
    }

    for (const slot of this.semiDedicatedPool.values()) {
      totalUtilization += (slot.users.size / slot.maxUsers) * 100;
      totalSlots++;
    }

    for (const slot of this.enterpriseB2BPool.values()) {
      totalUtilization += (slot.users.size / slot.maxUsers) * 100;
      totalSlots++;
    }

    return totalSlots > 0 ? totalUtilization / totalSlots : 0;
  }

  // Health checks and monitoring
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 30000); // Every 30 seconds
  }

  private startOptimizationCycle(): void {
    this.optimizationInterval = setInterval(async () => {
      await this.optimizePool();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  private async performHealthCheck(): Promise<void> {
    // Check shared pool health
    for (const [slotId, slot] of this.sharedPool.entries()) {
      if (slot.status === 'error' || slot.status === 'disconnected') {
        this.logger.warn('Unhealthy shared slot detected', { slotId, status: slot.status });
        // Attempt recovery
        try {
          await slot.client.initialize();
        } catch (error) {
          this.logger.error('Failed to recover shared slot', { slotId, error });
        }
      }
    }

    // Check semi-dedicated pool health
    for (const [slotId, slot] of this.semiDedicatedPool.entries()) {
      if (slot.status === 'error' || slot.status === 'disconnected') {
        this.logger.warn('Unhealthy semi-dedicated slot detected', { slotId, status: slot.status });
        // Attempt recovery
        try {
          await slot.client.initialize();
        } catch (error) {
          this.logger.error('Failed to recover semi-dedicated slot', { slotId, error });
        }
      }
    }

    // Check enterprise B2B pool health
    for (const [slotId, slot] of this.enterpriseB2BPool.entries()) {
      if (slot.status === 'error' || slot.status === 'disconnected') {
        this.logger.warn('Unhealthy Enterprise B2B slot detected', { slotId, status: slot.status });
        // Attempt recovery with high priority
        try {
          await slot.client.initialize();
        } catch (error) {
          this.logger.error('Failed to recover Enterprise B2B slot', { slotId, error });
        }
      }
    }

    // Check dedicated workers health
    for (const [userId, worker] of this.dedicatedWorkers.entries()) {
      if (worker.process.killed || worker.status.status === 'error') {
        this.logger.warn('Unhealthy dedicated worker detected', { userId, status: worker.status.status });
        // Worker restart is handled in exit handler
      }
    }
  }

  // Public API methods
  public async sendMessage(userId: string, to: string, message: string, options: any = {}): Promise<any> {
    const session = this.userSessions.get(userId);
    if (!session) {
      throw new Error(`User session not found: ${userId}`);
    }

    // Route message based on connection type
    switch (session.connectionType) {
      case 'shared':
      case 'semi-dedicated':
      case 'enterprise_b2b':
        return await this.sendMessageThroughPool(session, to, message, options);
      
      case 'dedicated':
        return await this.sendMessageThroughDedicatedWorker(userId, to, message, options);
      
      default:
        throw new Error(`Unknown connection type: ${session.connectionType}`);
    }
  }

  private async sendMessageThroughPool(session: UserSession, to: string, message: string, options: any): Promise<any> {
    let poolMap: Map<string, ConnectionSlot>;
    
    switch (session.connectionType) {
      case 'shared':
        poolMap = this.sharedPool;
        break;
      case 'semi-dedicated':
        poolMap = this.semiDedicatedPool;
        break;
      case 'enterprise_b2b':
        poolMap = this.enterpriseB2BPool;
        break;
      default:
        throw new Error(`Unknown pool connection type: ${session.connectionType}`);
    }
    
    const slot = poolMap.get(session.connectionId!);
    
    if (!slot || slot.status !== 'ready') {
      throw new Error('Connection slot not ready');
    }

    try {
      const result = await slot.client.sendMessage(to, message);
      session.messageCount++;
      session.lastActivity = new Date();
      
      return result;
    } catch (error) {
      this.logger.error('Failed to send message through pool', { 
        userId: session.userId, 
        connectionType: session.connectionType,
        error 
      });
      throw error;
    }
  }

  private async sendMessageThroughDedicatedWorker(userId: string, to: string, message: string, options: any): Promise<any> {
    const worker = this.dedicatedWorkers.get(userId);
    if (!worker || worker.process.killed) {
      throw new Error('Dedicated worker not available');
    }

    return new Promise((resolve, reject) => {
      const messageId = uuidv4();
      const timeout = setTimeout(() => {
        reject(new Error('Message send timeout'));
      }, 30000);

      const responseHandler = (response: any) => {
        if (response.messageId === messageId) {
          clearTimeout(timeout);
          worker.process.off('message', responseHandler);
          
          if (response.data.success) {
            resolve(response.data.result);
          } else {
            reject(new Error(response.data.error));
          }
        }
      };

      worker.process.on('message', responseHandler);

      worker.process.send({
        type: 'command',
        userId,
        data: {
          command: 'sendMessage',
          params: { to, message, options },
          messageId
        },
        timestamp: new Date()
      });
    });
  }

  public async disconnectUser(userId: string): Promise<void> {
    const session = this.userSessions.get(userId);
    if (!session) {
      this.logger.warn('Attempt to disconnect non-existent user session', { userId });
      return;
    }

    try {
      // Step 1: Clear QR codes from database first
      await this.clearUserQRCodes(userId);
      
      // Step 2: Disconnect based on connection type
      switch (session.connectionType) {
        case 'shared':
          await this.disconnectFromSharedPool(userId, session);
          break;
          
        case 'semi-dedicated':
          await this.disconnectFromSemiDedicatedPool(userId, session);
          break;
          
        case 'enterprise_b2b':
          await this.disconnectFromEnterpriseB2BPool(userId, session);
          break;
          
        case 'dedicated':
          await this.disconnectDedicatedWorker(userId);
          break;
      }

      // Step 3: Clear user session
      this.userSessions.delete(userId);
      this.emit('user:disconnected', { userId });
      
      this.logger.info('User completely disconnected and cleaned up', { 
        userId, 
        connectionType: session.connectionType 
      });

    } catch (error) {
      this.logger.error('Error disconnecting user', { userId, error });
      throw error;
    }
  }

  private async disconnectFromSharedPool(userId: string, session: UserSession): Promise<void> {
    const slot = this.sharedPool.get(session.connectionId!);
    if (slot) {
      slot.users.delete(userId);
      slot.lastActivity = new Date();
      
      // Unregister user from Chrome cleanup protection
      this.chromeCleanup.unregisterSession(userId);
      
      // If no more users in slot, logout the WhatsApp client
      if (slot.users.size === 0 && slot.status === 'ready') {
        try {
          await slot.client.logout();
          slot.status = 'disconnected';
          this.logger.info('Shared slot logged out - no more users', { slotId: slot.id });
        } catch (error) {
          this.logger.error('Error logging out shared slot', { slotId: slot.id, error });
        }
      }
    }
  }

  private async disconnectFromSemiDedicatedPool(userId: string, session: UserSession): Promise<void> {
    const slot = this.semiDedicatedPool.get(session.connectionId!);
    if (slot) {
      slot.users.delete(userId);
      slot.lastActivity = new Date();
      
      // Unregister user from Chrome cleanup protection
      this.chromeCleanup.unregisterSession(userId);
      
      // If no more users in slot, logout the WhatsApp client
      if (slot.users.size === 0 && slot.status === 'ready') {
        try {
          await slot.client.logout();
          slot.status = 'disconnected';
          this.logger.info('Semi-dedicated slot logged out - no more users', { slotId: slot.id });
        } catch (error) {
          this.logger.error('Error logging out semi-dedicated slot', { slotId: slot.id, error });
        }
      }
    }
  }

  private async disconnectFromEnterpriseB2BPool(userId: string, session: UserSession): Promise<void> {
    const slot = this.enterpriseB2BPool.get(session.connectionId!);
    if (slot) {
      slot.users.delete(userId);
      slot.lastActivity = new Date();
      
      // Unregister user from Chrome cleanup protection
      this.chromeCleanup.unregisterSession(userId);
      
      // Log B2B user disconnection for monitoring
      this.logger.info('Enterprise B2B user disconnected', { 
        userId, 
        slotId: slot.id,
        remainingUsers: slot.users.size 
      });
      
      // Only destroy the slot if no more users are using it
      if (slot.users.size === 0 && slot.status === 'ready') {
        try {
          // Logout and destroy the Chrome instance completely
          await slot.client.logout();
          await slot.client.destroy();
          slot.status = 'disconnected';
          
          // Remove the slot from the pool completely
          this.enterpriseB2BPool.delete(session.connectionId!);
          
          this.logger.info('Enterprise B2B slot destroyed - no more users', { 
            slotId: slot.id,
            disconnectedUser: userId
          });
        } catch (error) {
          this.logger.error('Error destroying Enterprise B2B slot', { slotId: slot.id, error });
          // Even if error, remove from pool to prevent zombie slots
          this.enterpriseB2BPool.delete(session.connectionId!);
        }
      } else {
        this.logger.info('User removed from Enterprise B2B slot, slot still active', { 
          slotId: slot.id,
          disconnectedUser: userId,
          remainingUsers: slot.users.size
        });
      }
    }
  }

  private async disconnectDedicatedWorker(userId: string): Promise<void> {
    const worker = this.dedicatedWorkers.get(userId);
    if (worker && !worker.process.killed) {
      worker.process.send({
        type: 'command',
        userId,
        data: { command: 'disconnect' },
        timestamp: new Date()
      });

      // Give it time to gracefully shutdown
      setTimeout(() => {
        if (!worker.process.killed) {
          worker.process.kill('SIGTERM');
        }
      }, 5000);
    }
    
    this.dedicatedWorkers.delete(userId);
  }

  public getPoolStats(): any {
    return {
      ...this.poolMetrics,
      pools: {
        shared: {
          size: this.sharedPool.size,
          capacity: this.SHARED_POOL_SIZE,
          utilization: this.calculateSharedPoolUtilization()
        },
        semiDedicated: {
          size: this.semiDedicatedPool.size,
          capacity: this.SEMI_DEDICATED_POOL_SIZE,
          utilization: this.calculateSemiDedicatedPoolUtilization()
        },
        enterpriseB2B: {
          size: this.enterpriseB2BPool.size,
          capacity: this.ENTERPRISE_B2B_POOL_SIZE,
          utilization: this.calculateEnterpriseB2BPoolUtilization(),
          usersPerConnection: this.USERS_PER_B2B_CONNECTION,
          maxUsers: this.ENTERPRISE_B2B_POOL_SIZE * this.USERS_PER_B2B_CONNECTION
        },
        dedicated: {
          size: this.dedicatedWorkers.size,
          capacity: -1 // unlimited
        }
      },
      costSavings: this.calculateCostSavings()
    };
  }

  private calculateSharedPoolUtilization(): number {
    if (this.sharedPool.size === 0) return 0;
    
    let totalUsers = 0;
    let maxUsers = 0;
    
    for (const slot of this.sharedPool.values()) {
      totalUsers += slot.users.size;
      maxUsers += slot.maxUsers;
    }
    
    return maxUsers > 0 ? (totalUsers / maxUsers) * 100 : 0;
  }

  private calculateSemiDedicatedPoolUtilization(): number {
    if (this.semiDedicatedPool.size === 0) return 0;
    
    let totalUsers = 0;
    let maxUsers = 0;
    
    for (const slot of this.semiDedicatedPool.values()) {
      totalUsers += slot.users.size;
      maxUsers += slot.maxUsers;
    }
    
    return maxUsers > 0 ? (totalUsers / maxUsers) * 100 : 0;
  }

  private calculateEnterpriseB2BPoolUtilization(): number {
    if (this.enterpriseB2BPool.size === 0) return 0;
    
    let totalUsers = 0;
    let maxUsers = 0;
    
    for (const slot of this.enterpriseB2BPool.values()) {
      totalUsers += slot.users.size;
      maxUsers += slot.maxUsers;
    }
    
    return maxUsers > 0 ? (totalUsers / maxUsers) * 100 : 0;
  }

  private calculateCostSavings(): number {
    // Calculate savings vs having dedicated worker per user
    const totalUsers = this.userSessions.size;
    const dedicatedCostForAll = totalUsers * 1.0; // $1 per user if all dedicated
    
    const actualCost = this.poolMetrics.costPerUser * totalUsers;
    const savings = dedicatedCostForAll - actualCost;
    
    return dedicatedCostForAll > 0 ? (savings / dedicatedCostForAll) * 100 : 0;
  }

  // Event handler setup - only call once!
  private setupEventHandlers(): void {
    // Remove all existing listeners first to avoid duplicates
    this.tierService.removeAllListeners('tier:upgraded');
    this.tierService.removeAllListeners('tier:downgraded');
    
    this.tierService.on('tier:upgraded', async (data) => {
      await this.handleTierChange(data.userId, data.oldTier, data.newTier);
    });

    this.tierService.on('tier:downgraded', async (data) => {
      await this.handleTierChange(data.userId, data.oldTier, data.newTier);
    });

    // Only register process handlers once
    if (process.listenerCount('SIGTERM') === 0) {
      process.on('SIGTERM', () => this.shutdown());
    }
    if (process.listenerCount('SIGINT') === 0) {
      process.on('SIGINT', () => this.shutdown());
    }
  }

  private async handleTierChange(userId: string, oldTier: UserTier, newTier: UserTier): Promise<void> {
    this.logger.info('Handling tier change', { userId, oldTier, newTier });
    
    // Disconnect user from current connection
    await this.disconnectUser(userId);
    
    // Reconnect with new tier
    setTimeout(async () => {
      try {
        await this.connectUser(userId);
        this.logger.info('User reconnected with new tier', { userId, newTier });
      } catch (error) {
        this.logger.error('Failed to reconnect user with new tier', { userId, newTier, error });
      }
    }, 2000);
  }

  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    this.logger.info('Shutting down connection pool...');

    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
    }

    // Disconnect all users
    const disconnectPromises = Array.from(this.userSessions.keys()).map(userId => 
      this.disconnectUser(userId).catch(error => 
        this.logger.error('Error disconnecting user during shutdown', { userId, error })
      )
    );

    await Promise.allSettled(disconnectPromises);

    // Destroy shared pool
    for (const slot of this.sharedPool.values()) {
      try {
        await slot.client.destroy();
      } catch (error) {
        this.logger.error('Error destroying shared slot', { slotId: slot.id, error });
      }
    }

    // Destroy semi-dedicated pool
    for (const slot of this.semiDedicatedPool.values()) {
      try {
        await slot.client.destroy();
      } catch (error) {
        this.logger.error('Error destroying semi-dedicated slot', { slotId: slot.id, error });
      }
    }

    // Destroy Enterprise B2B pool
    for (const slot of this.enterpriseB2BPool.values()) {
      try {
        await slot.client.destroy();
      } catch (error) {
        this.logger.error('Error destroying Enterprise B2B slot', { slotId: slot.id, error });
      }
    }

    this.logger.info('Connection pool shutdown completed');
    this.emit('pool:shutdown');
  }

  /**
   * Get user connections map for checking if a user is connected
   */
  public getUserConnections(): Map<string, UserSession> {
    return this.userSessions;
  }

  /**
   * Check if a user is connected through the pool
   */
  public isUserConnected(userId: string): boolean {
    return this.userSessions.has(userId);
  }

  /**
   * Get user session information
   */
  public getUserSession(userId: string): UserSession | undefined {
    return this.userSessions.get(userId);
  }

  /**
   * Pause user bot - stops responding to messages but keeps connection
   */
  public pauseUser(userId: string): boolean {
    const session = this.userSessions.get(userId);
    if (session) {
      session.isPaused = true;
      this.logger.info('User bot paused in connection pool', { userId });
      return true;
    }
    return false;
  }

  /**
   * Resume user bot - start responding to messages again
   */
  public resumeUser(userId: string): boolean {
    const session = this.userSessions.get(userId);
    if (session) {
      session.isPaused = false;
      this.logger.info('User bot resumed in connection pool', { userId });
      return true;
    }
    return false;
  }

  /**
   * Check if user bot is paused
   */
  public isUserPaused(userId: string): boolean {
    const session = this.userSessions.get(userId);
    return session?.isPaused || false;
  }
  
  /**
   * Clear all QR codes for a user from the database
   */
  private async clearUserQRCodes(userId: string): Promise<void> {
    try {
      // Extract UUID from prefixed userId
      const userUuid = userId.startsWith('tribe-ia-nexus_') 
        ? userId.replace('tribe-ia-nexus_', '') 
        : userId;

      const { error } = await this.db
        .from('qr_codes')
        .delete()
        .eq('userId', userUuid);

      if (error) {
        this.logger.error('Failed to clear QR codes from database', { userId, error });
      } else {
        this.logger.info('QR codes cleared from database', { userId: userUuid });
      }
    } catch (error) {
      this.logger.error('Error clearing QR codes from database', { userId, error });
    }
  }
}