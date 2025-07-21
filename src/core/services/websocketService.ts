import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import { LoggerService } from './LoggerService';
import { CacheService } from './CacheService';

export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: Date;
  userId?: string;
}

export interface WebSocketClient {
  id: string;
  userId: string;
  ws: WebSocket;
  connectedAt: Date;
  lastPing: Date;
  isAlive: boolean;
}

export class WebSocketService {
  private static instance: WebSocketService;
  private wss: WebSocketServer | null = null;
  private logger: LoggerService;
  private cache: CacheService;
  private clients: Map<string, WebSocketClient> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;

  private constructor() {
    this.logger = LoggerService.getInstance();
    this.cache = CacheService.getInstance();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  /**
   * Initialize WebSocket server with HTTP server
   */
  public initializeWithServer(server: Server): void {
    if (this.isInitialized) {
      this.logger.warn('[WebSocket] WebSocket service already initialized');
      return;
    }

    this.wss = new WebSocketServer({ server });
    this.isInitialized = true;
    this.initialize();
  }

  /**
   * Initialize WebSocket server
   */
  private initialize(): void {
    if (!this.wss) {
      this.logger.error('[WebSocket] WebSocket server not available');
      return;
    }

    this.logger.info('[WebSocket] Initializing WebSocket server');

    // Handle connections
    this.wss.on('connection', (ws: WebSocket, request: any) => {
      this.handleConnection(ws, request);
    });

    // Handle server errors
    this.wss.on('error', (error: Error) => {
      this.logger.error('[WebSocket] Server error:', error);
    });

    // Start ping interval
    this.startPingInterval();

    // Start cleanup interval
    this.startCleanupInterval();

    this.logger.info('[WebSocket] WebSocket server initialized successfully');
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, request: any): void {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const userId = url.searchParams.get('userId');

      if (!userId) {
        this.logger.warn('[WebSocket] Connection attempt without userId');
        ws.close(1008, 'userId parameter required');
        return;
      }

      const clientId = `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Close existing connection for this user
      const existingClient = this.getClientByUserId(userId);
      if (existingClient) {
        this.logger.warn(`[WebSocket] Closing existing connection for user: ${userId}`);
        existingClient.ws.close(1001, 'New connection established');
        this.clients.delete(existingClient.id);
      }

      // Create new client
      const client: WebSocketClient = {
        id: clientId,
        userId,
        ws,
        connectedAt: new Date(),
        lastPing: new Date(),
        isAlive: true
      };

      this.clients.set(clientId, client);

      this.logger.info(`[WebSocket] Client connected: ${clientId} for user: ${userId}`);

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'connection_established',
        payload: {
          clientId,
          userId,
          timestamp: new Date()
        },
        timestamp: new Date()
      });

      // Handle client messages
      ws.on('message', (data: Buffer) => {
        this.handleMessage(clientId, data);
      });

      // Handle client close
      ws.on('close', (code: number, reason: Buffer) => {
        this.handleClientClose(clientId, code, reason.toString());
      });

      // Handle client errors
      ws.on('error', (error: Error) => {
        this.handleClientError(clientId, error);
      });

      // Handle pong responses
      ws.on('pong', () => {
        this.handlePong(clientId);
      });

    } catch (error) {
      this.logger.error('[WebSocket] Error handling connection:', error);
      ws.close(1011, 'Internal server error');
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(clientId: string, data: Buffer): void {
    try {
      const client = this.clients.get(clientId);
      if (!client) {
        this.logger.warn(`[WebSocket] Message from unknown client: ${clientId}`);
        return;
      }

      const message = JSON.parse(data.toString());
      this.logger.info(`[WebSocket] Message from ${clientId}:`, message);

      // Update last ping
      client.lastPing = new Date();

      // Handle different message types
      switch (message.type) {
        case 'ping':
          this.sendToClient(clientId, {
            type: 'pong',
            payload: { timestamp: new Date() },
            timestamp: new Date()
          });
          break;

        case 'subscribe':
          this.handleSubscribe(clientId, message.payload);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(clientId, message.payload);
          break;

        case 'status_request':
          this.handleStatusRequest(clientId);
          break;

        default:
          this.logger.warn(`[WebSocket] Unknown message type: ${message.type}`);
          this.sendToClient(clientId, {
            type: 'error',
            payload: { message: 'Unknown message type' },
            timestamp: new Date()
          });
      }
    } catch (error) {
      this.logger.error(`[WebSocket] Error handling message from ${clientId}:`, error);
      this.sendToClient(clientId, {
        type: 'error',
        payload: { message: 'Invalid message format' },
        timestamp: new Date()
      });
    }
  }

  /**
   * Handle client close
   */
  private handleClientClose(clientId: string, code: number, reason: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.logger.info(`[WebSocket] Client disconnected: ${clientId} (${code}: ${reason})`);
      this.clients.delete(clientId);
    }
  }

  /**
   * Handle client error
   */
  private handleClientError(clientId: string, error: Error): void {
    this.logger.error(`[WebSocket] Client error for ${clientId}:`, error);
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
    }
  }

  /**
   * Handle pong response
   */
  private handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastPing = new Date();
      client.isAlive = true;
    }
  }

  /**
   * Handle subscription request
   */
  private handleSubscribe(clientId: string, payload: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { channels = [] } = payload;
    
    // Store subscription in cache
    const subscriptionKey = `ws_subscription:${clientId}`;
    this.cache.set(subscriptionKey, { channels }, 3600); // 1 hour

    this.sendToClient(clientId, {
      type: 'subscribed',
      payload: { channels },
      timestamp: new Date()
    });

    this.logger.info(`[WebSocket] Client ${clientId} subscribed to channels:`, channels);
  }

  /**
   * Handle unsubscription request
   */
  private handleUnsubscribe(clientId: string, payload: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { channels = [] } = payload;
    
    // Remove subscription from cache
    const subscriptionKey = `ws_subscription:${clientId}`;
    this.cache.delete(subscriptionKey);

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      payload: { channels },
      timestamp: new Date()
    });

    this.logger.info(`[WebSocket] Client ${clientId} unsubscribed from channels:`, channels);
  }

  /**
   * Handle status request
   */
  private handleStatusRequest(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.sendToClient(clientId, {
      type: 'status',
      payload: {
        clientId: client.id,
        userId: client.userId,
        connectedAt: client.connectedAt,
        lastPing: client.lastPing,
        isAlive: client.isAlive,
        uptime: Date.now() - client.connectedAt.getTime()
      },
      timestamp: new Date()
    });
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId: string, message: WebSocketMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn(`[WebSocket] Cannot send message to client ${clientId}: not connected`);
      return false;
    }

    try {
      client.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      this.logger.error(`[WebSocket] Error sending message to client ${clientId}:`, error);
      return false;
    }
  }

  /**
   * Send message to all clients of a user
   */
  sendToUser(userId: string, message: WebSocketMessage): number {
    let sentCount = 0;
    
    for (const [clientId, client] of this.clients) {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        if (this.sendToClient(clientId, message)) {
          sentCount++;
        }
      }
    }

    this.logger.info(`[WebSocket] Sent message to ${sentCount} clients for user ${userId}`);
    return sentCount;
  }

  /**
   * Send message to all connected clients
   */
  broadcast(message: WebSocketMessage): number {
    let sentCount = 0;
    
    for (const [clientId, client] of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        if (this.sendToClient(clientId, message)) {
          sentCount++;
        }
      }
    }

    this.logger.info(`[WebSocket] Broadcasted message to ${sentCount} clients`);
    return sentCount;
  }

  /**
   * Send notification to user
   */
  sendNotification(userId: string, notification: {
    type: string;
    title: string;
    message: string;
    data?: any;
  }): number {
    const message: WebSocketMessage = {
      type: 'notification',
      payload: {
        ...notification,
        timestamp: new Date()
      },
      timestamp: new Date(),
      userId
    };

    return this.sendToUser(userId, message);
  }

  /**
   * Send new message notification
   */
  sendNewMessageNotification(userId: string, messageData: {
    chatId: string;
    messageId: string;
    senderId: string;
    content: string;
    timestamp: Date;
  }): number {
    const message: WebSocketMessage = {
      type: 'new_message',
      payload: messageData,
      timestamp: new Date(),
      userId
    };

    return this.sendToUser(userId, message);
  }

  /**
   * Send status update notification
   */
  sendStatusUpdate(userId: string, status: {
    type: string;
    status: string;
    message?: string;
    data?: any;
  }): number {
    const message: WebSocketMessage = {
      type: 'status_update',
      payload: {
        ...status,
        timestamp: new Date()
      },
      timestamp: new Date(),
      userId
    };

    return this.sendToUser(userId, message);
  }

  /**
   * Get client by user ID
   */
  private getClientByUserId(userId: string): WebSocketClient | undefined {
    for (const [clientId, client] of this.clients) {
      if (client.userId === userId) {
        return client;
      }
    }
    return undefined;
  }

  /**
   * Start ping interval
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      for (const [clientId, client] of this.clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
          try {
            client.ws.ping();
          } catch (error) {
            this.logger.error(`[WebSocket] Error pinging client ${clientId}:`, error);
            this.clients.delete(clientId);
          }
        }
      }
    }, 30000); // 30 seconds
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      const timeout = 60000; // 1 minute

      for (const [clientId, client] of this.clients) {
        if (now.getTime() - client.lastPing.getTime() > timeout) {
          this.logger.warn(`[WebSocket] Client ${clientId} timed out, closing connection`);
          client.ws.close(1000, 'Connection timeout');
          this.clients.delete(clientId);
        }
      }
    }, 60000); // 1 minute
  }

  /**
   * Get connection statistics
   */
  getStatistics(): {
    totalConnections: number;
    activeConnections: number;
    usersConnected: number;
    uptime: number;
  } {
    const uniqueUsers = new Set();
    let activeCount = 0;

    for (const [clientId, client] of this.clients) {
      uniqueUsers.add(client.userId);
      if (client.ws.readyState === WebSocket.OPEN) {
        activeCount++;
      }
    }

    return {
      totalConnections: this.clients.size,
      activeConnections: activeCount,
      usersConnected: uniqueUsers.size,
      uptime: process.uptime()
    };
  }

  /**
   * Close all connections for a user
   */
  closeUserConnections(userId: string): number {
    let closedCount = 0;
    
    for (const [clientId, client] of this.clients) {
      if (client.userId === userId) {
        client.ws.close(1000, 'User logout');
        this.clients.delete(clientId);
        closedCount++;
      }
    }

    this.logger.info(`[WebSocket] Closed ${closedCount} connections for user ${userId}`);
    return closedCount;
  }

  /**
   * Close all connections
   */
  closeAllConnections(): void {
    this.logger.info('[WebSocket] Closing all connections');
    
    for (const [clientId, client] of this.clients) {
      client.ws.close(1000, 'Server shutdown');
    }
    
    this.clients.clear();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.logger.info('[WebSocket] Cleaning up WebSocket service');

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.closeAllConnections();
    this.wss?.close(); // Use optional chaining
  }

  /**
   * Health check
   */
  healthCheck(): {
    status: 'healthy' | 'unhealthy';
    details: string;
    statistics: any;
    timestamp: Date;
  } {
    try {
      const stats = this.getStatistics();
      
      return {
        status: 'healthy',
        details: 'WebSocket service is operational',
        statistics: stats,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('[WebSocket] Health check failed:', error);
      return {
        status: 'unhealthy',
        details: `Service error: ${error.message}`,
        statistics: {},
        timestamp: new Date()
      };
    }
  }
} 