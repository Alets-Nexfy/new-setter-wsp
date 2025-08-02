import { 
  User, 
  UserWithPlatforms, 
  UserStatus, 
  Platform, 
  ConnectUserRequest, 
  ConnectUserResponse, 
  DisconnectUserRequest, 
  UserStatusResponse, 
  CreateUserRequest, 
  UserListResponse, 
  UserSummary, 
  WorkerInfo, 
  WorkerMessage, 
  WorkerCommand, 
  StatusUpdatePayload, 
  QRCodeData, 
  UserSession, 
  NuclearCleanupRequest, 
  NuclearCleanupResponse, 
  CleanupResults, 
  CleanupStep, 
  UserFilters, 
  UserSortOptions, 
  UserAnalytics, 
  UserActivity, 
  BulkUserOperation, 
  BulkOperationResult, 
  UserConfig, 
  WebSocketConnection, 
  UserHealthCheck
} from '../../shared/types/user';
import { DatabaseService } from './database';
import { CacheService } from './cache';
import { QueueService } from './queue';
import { LoggerService } from './logger';
import { ChildProcess, fork } from 'child_process';
import { WebSocket } from 'ws';
import * as path from 'path';
import * as fs from 'fs';

export class UserService {
  private static instance: UserService;
  private db: SupabaseService;
  private cache: CacheService;
  private queue: QueueService;
  private logger: LoggerService;
  
  // Worker and connection management
  private workers: Map<string, ChildProcess> = new Map();
  private wsClients: Map<string, WebSocket> = new Map();
  private connectingUsers: Set<string> = new Set();
  private userSessions: Map<string, UserSession> = new Map();
  
  private constructor() {
    this.db = SupabaseService.getInstance();
    this.cache = CacheService.getInstance();
    this.queue = QueueService.getInstance();
    this.logger = LoggerService.getInstance();
  }

  static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  // User CRUD operations
  async createUser(request: CreateUserRequest): Promise<User> {
    const { userId, initialAgentId, metadata } = request;
    
    try {
      // Check if user already exists
      const existingUser = await this.getUser(userId);
      if (existingUser) {
        throw new Error(`User ${userId} already exists`);
      }

      const now = new Date();
      const user: User = {
        userId,
        status: 'disconnected',
        activeAgentId: initialAgentId || null,
        lastQrCode: null,
        workerPid: null,
        lastError: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };

      // Create user document
      await this.db.collection('users').doc(userId).set({
        ...user,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: metadata || {}
      });

      // Initialize platform statuses
      await this.initializePlatformStatuses(userId);

      // Cache user data
      await this.cache.set(`user:${userId}`, user, 3600);

      // Log activity
      await this.logUserActivity(userId, 'whatsapp', 'user_created', 'User created successfully');

      this.logger.info(`User created: ${userId}`, { userId, initialAgentId });
      return user;
    } catch (error) {
      this.logger.error(`Error creating user ${userId}:`, error);
      throw error;
    }
  }

  async getUser(userId: string): Promise<User | null> {
    try {
      // Try cache first
      const cached = await this.cache.get(`user:${userId}`);
      if (cached) {
        return cached as User;
      }

      // Get from database
      const doc = await this.db.collection('users').doc(userId).get();
      if (!doc.exists) {
        return null;
      }

      const data = doc.data() as User;
      const user: User = {
        ...data,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      };

      // Cache result
      await this.cache.set(`user:${userId}`, user, 3600);
      return user;
    } catch (error) {
      this.logger.error(`Error getting user ${userId}:`, error);
      throw error;
    }
  }

  async getUserWithPlatforms(userId: string): Promise<UserWithPlatforms | null> {
    try {
      const user = await this.getUser(userId);
      if (!user) {
        return null;
      }

      // Get platform statuses
      const whatsappStatus = await this.getPlatformStatus(userId, 'whatsapp');
      const instagramStatus = await this.getPlatformStatus(userId, 'instagram');

      return {
        ...user,
        platforms: {
          whatsapp: whatsappStatus,
          instagram: instagramStatus
        }
      };
    } catch (error) {
      this.logger.error(`Error getting user with platforms ${userId}:`, error);
      throw error;
    }
  }

  async getUsers(filters?: UserFilters, sort?: UserSortOptions, limit = 50, offset = 0): Promise<UserListResponse> {
    try {
      let query = this.db.collection('users');

      // Apply filters
      if (filters?.status) {
        query = query.where('status', '==', filters.status);
      }
      if (filters?.hasActiveAgent !== undefined) {
        if (filters.hasActiveAgent) {
          query = query.where('activeAgentId', '!=', null);
        } else {
          query = query.where('activeAgentId', '==', null);
        }
      }
      if (filters?.createdAfter) {
        query = query.where('createdAt', '>=', new Date(filters.createdAfter));
      }
      if (filters?.createdBefore) {
        query = query.where('createdAt', '<=', new Date(filters.createdBefore));
      }

      // Apply sorting
      if (sort) {
        query = query.orderBy(sort.field, sort.order);
      } else {
        query = query.orderBy('createdAt', 'desc');
      }

      // Apply pagination
      query = query.limit(limit).offset(offset);

      const snapshot = await query.get();
      const users: UserSummary[] = [];

      for (const doc of snapshot.docs) {
        const data = doc.data() as User;
        const whatsappStatus = await this.getPlatformStatus(data.userId, 'whatsapp');
        const instagramStatus = await this.getPlatformStatus(data.userId, 'instagram');

        users.push({
          userId: data.userId,
          status: data.status,
          activeAgentId: data.activeAgentId,
          platforms: {
            whatsapp: {
              status: whatsappStatus.status,
              lastUpdated: whatsappStatus.updatedAt.toString()
            },
            instagram: {
              status: instagramStatus.status,
              lastUpdated: instagramStatus.updatedAt.toString()
            }
          },
          createdAt: data.createdAt.toString(),
          updatedAt: data.updatedAt.toString()
        });
      }

      // Get total count
      const totalQuery = this.db.collection('users');
      const totalSnapshot = await totalQuery.get();
      const total = totalSnapshot.size;

      return {
        success: true,
        users,
        total,
        page: Math.floor(offset / limit) + 1,
        limit
      };
    } catch (error) {
      this.logger.error('Error getting users:', error);
      throw error;
    }
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    try {
      const user = await this.getUser(userId);
      if (!user) {
        return null;
      }

      const updatedData = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await this.db.collection('users').doc(userId).update(updatedData);

      // Clear cache
      await this.cache.delete(`user:${userId}`);

      // Get updated user
      const updatedUser = await this.getUser(userId);
      
      this.logger.info(`User updated: ${userId}`, { userId, updates });
      return updatedUser;
    } catch (error) {
      this.logger.error(`Error updating user ${userId}:`, error);
      throw error;
    }
  }

  async deleteUser(userId: string): Promise<boolean> {
    try {
      // Stop any active workers first
      await this.disconnectUser({ userId, platform: 'whatsapp', force: true });
      await this.disconnectUser({ userId, platform: 'instagram', force: true });

      // Delete user document and subcollections
      await this.db.collection('users').doc(userId).delete();

      // Clear cache
      await this.cache.delete(`user:${userId}`);
      await this.cache.delete(`user:${userId}:whatsapp:status`);
      await this.cache.delete(`user:${userId}:instagram:status`);

      // Clean up local data
      await this.cleanupUserData(userId);

      this.logger.info(`User deleted: ${userId}`, { userId });
      return true;
    } catch (error) {
      this.logger.error(`Error deleting user ${userId}:`, error);
      throw error;
    }
  }

  // Connection management
  async connectUser(request: ConnectUserRequest): Promise<ConnectUserResponse> {
    const { userId, platform, agentId } = request;
    
    try {
      // Check if user exists
      const user = await this.getUser(userId);
      if (!user) {
        return {
          success: false,
          message: 'User not found'
        };
      }

      // Check if already connecting
      const lockKey = `${userId}:${platform}`;
      if (this.connectingUsers.has(lockKey)) {
        return {
          success: false,
          message: 'Connection already in progress'
        };
      }

      // Check current status
      const currentStatus = await this.getPlatformStatus(userId, platform);
      if (currentStatus.status === 'connected' || currentStatus.status === 'connecting') {
        const workerKey = `${userId}:${platform}`;
        if (this.workers.has(workerKey)) {
          return {
            success: true,
            message: 'Connection already active or in progress',
            currentStatus: currentStatus.status,
            qrCodeUrl: currentStatus.lastQrCode
          };
        }
      }

      // Start connection process
      this.connectingUsers.add(lockKey);
      
      try {
        // Update agent if provided
        if (agentId) {
          await this.updateUser(userId, { activeAgentId: agentId });
        }

        // Start worker
        const worker = await this.startWorker(userId, platform, agentId);
        if (!worker) {
          this.connectingUsers.delete(lockKey);
          return {
            success: false,
            message: 'Failed to start worker process'
          };
        }

        // Update status
        await this.updatePlatformStatus(userId, platform, {
          status: 'connecting',
          lastError: null,
          lastQrCode: null,
          updatedAt: new Date().toISOString()
        });

        // Log activity
        await this.logUserActivity(userId, platform, 'connect', 'Connection initiated');

        return {
          success: true,
          message: 'Connection process started',
          currentStatus: 'connecting'
        };
      } finally {
        this.connectingUsers.delete(lockKey);
      }
    } catch (error) {
      this.logger.error(`Error connecting user ${userId} to ${platform}:`, error);
      this.connectingUsers.delete(`${userId}:${platform}`);
      return {
        success: false,
        message: 'Internal error during connection'
      };
    }
  }

  async disconnectUser(request: DisconnectUserRequest): Promise<boolean> {
    const { userId, platform, force } = request;
    
    try {
      const user = await this.getUser(userId);
      if (!user) {
        return false;
      }

      const workerKey = `${userId}:${platform}`;
      const worker = this.workers.get(workerKey);

      if (worker) {
        // Send shutdown command
        const command: WorkerCommand = {
          type: 'COMMAND',
          command: 'SHUTDOWN',
          timestamp: new Date().toISOString()
        };

        worker.send(command);

        // Force kill if needed
        if (force) {
          setTimeout(() => {
            if (this.workers.has(workerKey)) {
              worker.kill('SIGTERM');
              this.workers.delete(workerKey);
            }
          }, 5000);
        }
      }

      // Update status
      await this.updatePlatformStatus(userId, platform, {
        status: 'disconnected',
        lastError: null,
        lastQrCode: null,
        updatedAt: new Date().toISOString()
      });

      // Update main user status if both platforms are disconnected
      const whatsappStatus = await this.getPlatformStatus(userId, 'whatsapp');
      const instagramStatus = await this.getPlatformStatus(userId, 'instagram');
      
      if (whatsappStatus.status === 'disconnected' && instagramStatus.status === 'disconnected') {
        await this.updateUser(userId, { status: 'disconnected', workerPid: null });
      }

      // Clean up WebSocket
      this.closeWebSocketConnection(userId);

      // Log activity
      await this.logUserActivity(userId, platform, 'disconnect', 'Disconnection initiated');

      this.logger.info(`User disconnected: ${userId} from ${platform}`, { userId, platform, force });
      return true;
    } catch (error) {
      this.logger.error(`Error disconnecting user ${userId} from ${platform}:`, error);
      throw error;
    }
  }

  async getUserStatus(userId: string, platform: Platform): Promise<UserStatusResponse> {
    try {
      const user = await this.getUser(userId);
      if (!user) {
        return {
          success: false,
          clientReady: false,
          qrCodeUrl: null,
          status: 'error',
          errorMessage: 'User not found',
          platform,
          lastUpdated: new Date().toISOString()
        };
      }

      const platformStatus = await this.getPlatformStatus(userId, platform);
      
      return {
        success: platformStatus.status !== 'error',
        clientReady: platformStatus.status === 'connected',
        qrCodeUrl: platformStatus.lastQrCode,
        status: platformStatus.status,
        errorMessage: platformStatus.lastError,
        platform,
        lastUpdated: platformStatus.updatedAt.toString()
      };
    } catch (error) {
      this.logger.error(`Error getting user status ${userId} for ${platform}:`, error);
      return {
        success: false,
        clientReady: false,
        qrCodeUrl: null,
        status: 'error',
        errorMessage: 'Internal error',
        platform,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  // Worker management
  private async startWorker(userId: string, platform: Platform, agentId?: string): Promise<ChildProcess | null> {
    try {
      const workerKey = `${userId}:${platform}`;
      
      // Check if worker already exists
      if (this.workers.has(workerKey)) {
        const existingWorker = this.workers.get(workerKey);
        if (existingWorker && !existingWorker.killed) {
          return existingWorker;
        }
      }

      // Create user data directory
      const userDataDir = path.join(process.cwd(), 'data_v2', userId);
      const sessionPath = path.join(userDataDir, `.${platform}_auth`);
      
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
      }

      // Determine worker script
      const workerScript = path.join(process.cwd(), 'workers', `${platform}Worker.js`);
      
      if (!fs.existsSync(workerScript)) {
        this.logger.error(`Worker script not found: ${workerScript}`);
        return null;
      }

      // Start worker process
      const workerArgs = [userId, platform];
      if (agentId) {
        workerArgs.push(agentId);
      }

      const worker = fork(workerScript, workerArgs, { stdio: 'inherit' });
      this.workers.set(workerKey, worker);

      // Update user with worker PID
      await this.updateUser(userId, { workerPid: worker.pid });

      // Set up worker event handlers
      this.setupWorkerEventHandlers(worker, userId, platform);

      this.logger.info(`Worker started: ${userId}:${platform} (PID: ${worker.pid})`, { userId, platform, pid: worker.pid });
      return worker;
    } catch (error) {
      this.logger.error(`Error starting worker for ${userId}:${platform}:`, error);
      return null;
    }
  }

  private setupWorkerEventHandlers(worker: ChildProcess, userId: string, platform: Platform): void {
    const workerKey = `${userId}:${platform}`;

    worker.on('message', (message: WorkerMessage) => {
      this.handleWorkerMessage(userId, platform, message);
    });

    worker.on('exit', async (code, signal) => {
      this.logger.info(`Worker exited: ${userId}:${platform} (code: ${code}, signal: ${signal})`, { userId, platform, code, signal });
      
      // Clean up worker reference
      this.workers.delete(workerKey);
      
      // Update user status
      await this.updateUser(userId, { workerPid: null });
      
      // Update platform status to error if unexpected exit
      if (code !== 0) {
        await this.updatePlatformStatus(userId, platform, {
          status: 'error',
          lastError: `Worker exited with code ${code}`,
          lastQrCode: null,
          updatedAt: new Date().toISOString()
        });
      }
    });

    worker.on('error', async (error) => {
      this.logger.error(`Worker error: ${userId}:${platform}:`, error);
      
      // Update status
      await this.updatePlatformStatus(userId, platform, {
        status: 'error',
        lastError: error.message,
        lastQrCode: null,
        updatedAt: new Date().toISOString()
      });
    });
  }

  private async handleWorkerMessage(userId: string, platform: Platform, message: WorkerMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'STATUS_UPDATE':
          await this.handleStatusUpdate(userId, platform, message.payload);
          break;
        case 'QR_CODE':
          await this.handleQRCode(userId, platform, message.payload);
          break;
        case 'ERROR':
          await this.handleWorkerError(userId, platform, message.payload);
          break;
        case 'HEARTBEAT':
          await this.handleHeartbeat(userId, platform, message.payload);
          break;
        default:
          this.logger.warn(`Unknown worker message type: ${message.type}`, { userId, platform, message });
      }
    } catch (error) {
      this.logger.error(`Error handling worker message:`, error);
    }
  }

  private async handleStatusUpdate(userId: string, platform: Platform, payload: StatusUpdatePayload): Promise<void> {
    await this.updatePlatformStatus(userId, platform, {
      status: payload.status,
      lastError: payload.error || null,
      lastQrCode: payload.qrCodeUrl || null,
      updatedAt: new Date().toISOString()
    });

    // Update main user status
    await this.updateUser(userId, { status: payload.status });

    // Send WebSocket update
    this.sendWebSocketUpdate(userId, {
      type: 'status_update',
      platform,
      status: payload.status,
      message: payload.message,
      timestamp: new Date().toISOString()
    });

    // Log activity
    await this.logUserActivity(userId, platform, payload.status, payload.message || `Status updated to ${payload.status}`);
  }

  private async handleQRCode(userId: string, platform: Platform, payload: any): Promise<void> {
    const qrData: QRCodeData = {
      qrCodeUrl: payload.qrCodeUrl,
      expiresAt: payload.expiresAt,
      generatedAt: new Date().toISOString(),
      userId,
      platform
    };

    // Update platform status
    await this.updatePlatformStatus(userId, platform, {
      status: 'generating_qr',
      lastQrCode: qrData.qrCodeUrl,
      lastError: null,
      updatedAt: new Date().toISOString()
    });

    // Send WebSocket update
    this.sendWebSocketUpdate(userId, {
      type: 'qr_code',
      platform,
      qrCodeUrl: qrData.qrCodeUrl,
      expiresAt: qrData.expiresAt,
      timestamp: new Date().toISOString()
    });

    // Log activity
    await this.logUserActivity(userId, platform, 'qr_generated', 'QR code generated');
  }

  private async handleWorkerError(userId: string, platform: Platform, payload: any): Promise<void> {
    await this.updatePlatformStatus(userId, platform, {
      status: 'error',
      lastError: payload.error,
      lastQrCode: null,
      updatedAt: new Date().toISOString()
    });

    // Send WebSocket update
    this.sendWebSocketUpdate(userId, {
      type: 'error',
      platform,
      error: payload.error,
      timestamp: new Date().toISOString()
    });

    // Log activity
    await this.logUserActivity(userId, platform, 'error', payload.error);
  }

  private async handleHeartbeat(userId: string, platform: Platform, payload: any): Promise<void> {
    // Update last activity
    const cacheKey = `heartbeat:${userId}:${platform}`;
    await this.cache.set(cacheKey, { timestamp: new Date().toISOString(), ...payload }, 300);
  }

  // Platform status management
  private async getPlatformStatus(userId: string, platform: Platform): Promise<any> {
    try {
      const cacheKey = `user:${userId}:${platform}:status`;
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const doc = await this.db.collection('users').doc(userId).collection('status').doc(platform).get();
      
      if (!doc.exists) {
        // Return default status
        const defaultStatus = {
          status: 'disconnected' as UserStatus,
          lastError: null,
          lastQrCode: null,
          updatedAt: new Date().toISOString()
        };
        
        // Initialize in database
        await this.db.collection('users').doc(userId).collection('status').doc(platform).set({
          ...defaultStatus,
          updatedAt: new Date().toISOString()
        });
        
        return defaultStatus;
      }

      const status = doc.data();
      await this.cache.set(cacheKey, status, 300);
      return status;
    } catch (error) {
      this.logger.error(`Error getting platform status for ${userId}:${platform}:`, error);
      return {
        status: 'error' as UserStatus,
        lastError: 'Failed to get status',
        lastQrCode: null,
        updatedAt: new Date().toISOString()
      };
    }
  }

  private async updatePlatformStatus(userId: string, platform: Platform, status: any): Promise<void> {
    try {
      await this.db.collection('users').doc(userId).collection('status').doc(platform).set({
        ...status,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Clear cache
      const cacheKey = `user:${userId}:${platform}:status`;
      await this.cache.delete(cacheKey);
    } catch (error) {
      this.logger.error(`Error updating platform status for ${userId}:${platform}:`, error);
    }
  }

  private async initializePlatformStatuses(userId: string): Promise<void> {
    const platforms: Platform[] = ['whatsapp', 'instagram'];
    const defaultStatus = {
      status: 'disconnected' as UserStatus,
      lastError: null,
      lastQrCode: null,
      updatedAt: new Date().toISOString()
    };

    for (const platform of platforms) {
      await this.db.collection('users').doc(userId).collection('status').doc(platform).set(defaultStatus);
    }
  }

  // WebSocket management
  registerWebSocketConnection(userId: string, ws: WebSocket): void {
    // Close existing connection if any
    this.closeWebSocketConnection(userId);
    
    this.wsClients.set(userId, ws);
    
    ws.on('close', () => {
      this.wsClients.delete(userId);
    });

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG' }));
        }
      } catch (error) {
        // Ignore invalid messages
      }
    });

    this.logger.info(`WebSocket registered for user: ${userId}`);
  }

  private closeWebSocketConnection(userId: string): void {
    const ws = this.wsClients.get(userId);
    if (ws) {
      ws.close();
      this.wsClients.delete(userId);
    }
  }

  private sendWebSocketUpdate(userId: string, data: any): void {
    const ws = this.wsClients.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // Activity logging
  private async logUserActivity(userId: string, platform: Platform, action: string, details: string, metadata?: any): Promise<void> {
    try {
      const activity: Omit<UserActivity, 'id'> = {
        userId,
        platform,
        action: action as any,
        details,
        metadata,
        timestamp: new Date().toISOString()
      };

      await this.db.collection('user_activities').add(activity);
    } catch (error) {
      this.logger.error(`Error logging user activity:`, error);
    }
  }

  // Cleanup operations
  private async cleanupUserData(userId: string): Promise<void> {
    try {
      // Remove local files
      const userDataDir = path.join(process.cwd(), 'data_v2', userId);
      if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      }

      // Clean up workers
      const workerKeys = Array.from(this.workers.keys()).filter(key => key.startsWith(`${userId}:`));
      for (const key of workerKeys) {
        const worker = this.workers.get(key);
        if (worker) {
          worker.kill('SIGTERM');
          this.workers.delete(key);
        }
      }

      // Clean up WebSocket
      this.closeWebSocketConnection(userId);

      // Clean up cache
      const cacheKeys = [
        `user:${userId}`,
        `user:${userId}:whatsapp:status`,
        `user:${userId}:instagram:status`,
        `heartbeat:${userId}:whatsapp`,
        `heartbeat:${userId}:instagram`
      ];

      for (const key of cacheKeys) {
        await this.cache.delete(key);
      }
    } catch (error) {
      this.logger.error(`Error cleaning up user data for ${userId}:`, error);
    }
  }

  // Nuclear cleanup
  async nuclearCleanup(request: NuclearCleanupRequest): Promise<NuclearCleanupResponse> {
    const { userId, confirmationCode, force } = request;
    
    // Generate expected confirmation code
    const expectedCode = `NUKE_${userId}_${Date.now().toString().slice(-6)}`;
    
    if (confirmationCode !== expectedCode && !force) {
      return {
        success: false,
        message: 'Invalid confirmation code',
        results: {} as CleanupResults,
        expectedCode,
        instructions: `To confirm deletion, send the code: ${expectedCode}`
      };
    }

    try {
      const results: CleanupResults = {
        userId,
        timestamp: new Date().toISOString(),
        steps: [],
        success: false,
        errors: []
      };

      // Execute cleanup steps
      await this.executeCleanupStep(results, 'terminate_processes', () => this.terminateUserProcesses(userId));
      await this.executeCleanupStep(results, 'cleanup_database', () => this.cleanupUserDatabase(userId));
      await this.executeCleanupStep(results, 'cleanup_files', () => this.cleanupUserFiles(userId));
      await this.executeCleanupStep(results, 'cleanup_cache', () => this.cleanupUserCache(userId));
      await this.executeCleanupStep(results, 'cleanup_websockets', () => this.cleanupUserWebSockets(userId));

      results.success = results.errors.length === 0;

      return {
        success: results.success,
        message: results.success ? 'Nuclear cleanup completed successfully' : 'Nuclear cleanup completed with errors',
        results
      };
    } catch (error) {
      this.logger.error(`Error in nuclear cleanup for ${userId}:`, error);
      return {
        success: false,
        message: 'Critical error during nuclear cleanup',
        results: {
          userId,
          timestamp: new Date().toISOString(),
          steps: [],
          success: false,
          errors: [error.message]
        }
      };
    }
  }

  private async executeCleanupStep(results: CleanupResults, stepName: string, stepFunction: () => Promise<void>): Promise<void> {
    const step: CleanupStep = {
      name: stepName,
      items: [],
      errors: []
    };

    const startTime = Date.now();
    
    try {
      await stepFunction();
      step.success = true;
      step.items.push(`${stepName} completed successfully`);
    } catch (error) {
      step.success = false;
      step.errors.push(error.message);
      results.errors.push(`${stepName}: ${error.message}`);
    }

    step.duration = Date.now() - startTime;
    results.steps.push(step);
  }

  private async terminateUserProcesses(userId: string): Promise<void> {
    const platforms: Platform[] = ['whatsapp', 'instagram'];
    
    for (const platform of platforms) {
      const workerKey = `${userId}:${platform}`;
      const worker = this.workers.get(workerKey);
      
      if (worker) {
        worker.kill('SIGTERM');
        this.workers.delete(workerKey);
      }
    }
  }

  private async cleanupUserDatabase(userId: string): Promise<void> {
    // Delete user document and all subcollections
    await this.db.collection('users').doc(userId).delete();
    
    // Delete user activities
    const activitiesQuery = this.db.collection('user_activities').where('userId', '==', userId);
    const activitiesSnapshot = await activitiesQuery.get();
    
    const batch = this.db.batch();
    activitiesSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  }

  private async cleanupUserFiles(userId: string): Promise<void> {
    const userDataDir = path.join(process.cwd(), 'data_v2', userId);
    if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }

  private async cleanupUserCache(userId: string): Promise<void> {
    const cacheKeys = [
      `user:${userId}`,
      `user:${userId}:whatsapp:status`,
      `user:${userId}:instagram:status`,
      `heartbeat:${userId}:whatsapp`,
      `heartbeat:${userId}:instagram`
    ];

    for (const key of cacheKeys) {
      await this.cache.delete(key);
    }
  }

  private async cleanupUserWebSockets(userId: string): Promise<void> {
    this.closeWebSocketConnection(userId);
  }

  // Analytics and health checks
  async getUserAnalytics(): Promise<UserAnalytics> {
    try {
      const usersSnapshot = await this.db.collection('users').get();
      const users = usersSnapshot.docs.map(doc => doc.data() as User);

      const analytics: UserAnalytics = {
        totalUsers: users.length,
        activeUsers: users.filter(u => u.status === 'connected').length,
        connectedUsers: users.filter(u => u.status === 'connected').length,
        errorUsers: users.filter(u => u.status === 'error').length,
        platformStats: {
          whatsapp: {
            connected: 0,
            connecting: 0,
            disconnected: 0,
            error: 0
          },
          instagram: {
            connected: 0,
            connecting: 0,
            disconnected: 0,
            error: 0
          }
        },
        recentActivity: {
          connections: 0,
          disconnections: 0,
          errors: 0
        }
      };

      // Calculate platform stats
      for (const user of users) {
        const whatsappStatus = await this.getPlatformStatus(user.userId, 'whatsapp');
        const instagramStatus = await this.getPlatformStatus(user.userId, 'instagram');

        analytics.platformStats.whatsapp[whatsappStatus.status]++;
        analytics.platformStats.instagram[instagramStatus.status]++;
      }

      return analytics;
    } catch (error) {
      this.logger.error('Error getting user analytics:', error);
      throw error;
    }
  }

  async getUserHealth(userId: string): Promise<UserHealthCheck> {
    try {
      const user = await this.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const whatsappStatus = await this.getPlatformStatus(userId, 'whatsapp');
      const instagramStatus = await this.getPlatformStatus(userId, 'instagram');

      const health: UserHealthCheck = {
        userId,
        platforms: {
          whatsapp: {
            healthy: whatsappStatus.status === 'connected',
            status: whatsappStatus.status,
            lastCheck: new Date().toISOString(),
            issues: whatsappStatus.lastError ? [whatsappStatus.lastError] : []
          },
          instagram: {
            healthy: instagramStatus.status === 'connected',
            status: instagramStatus.status,
            lastCheck: new Date().toISOString(),
            issues: instagramStatus.lastError ? [instagramStatus.lastError] : []
          }
        },
        worker: {
          running: user.workerPid !== null,
          pid: user.workerPid || undefined
        },
        overall: {
          healthy: whatsappStatus.status === 'connected' || instagramStatus.status === 'connected',
          score: 0,
          issues: []
        }
      };

      // Calculate health score
      let score = 0;
      if (health.platforms.whatsapp.healthy) score += 50;
      if (health.platforms.instagram.healthy) score += 50;
      
      health.overall.score = score;
      health.overall.healthy = score > 0;

      return health;
    } catch (error) {
      this.logger.error(`Error getting user health for ${userId}:`, error);
      throw error;
    }
  }
}

export const userService = UserService.getInstance(); 