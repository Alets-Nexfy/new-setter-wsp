import { LoggerService } from '@/core/services/LoggerService';
import { DatabaseService } from '@/core/services/DatabaseService';
import { WebSocketService } from '@/core/services/websocketService';
import { FieldValue } from 'firebase-admin/firestore';
import { WhatsAppWorkerManager, WorkerMessage } from './WhatsAppWorkerManager';

export interface IPCMessagePayload {
  [key: string]: any;
}

export interface StatusUpdateData {
  status: string;
  last_error?: string | null;
  last_qr_code?: string | null;
  updatedAt: any;
}

export class WorkerIPCHandler {
  private logger: LoggerService;
  private db: DatabaseService;
  private wsService: WebSocketService;
  private workerManager: WhatsAppWorkerManager;

  constructor(workerManager: WhatsAppWorkerManager) {
    this.logger = LoggerService.getInstance();
    this.db = DatabaseService.getInstance();
    this.wsService = WebSocketService.getInstance();
    this.workerManager = workerManager;
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 843-962
   * FUNCIÓN: handleWorkerMessage(userId, message)
   * MEJORAS: TypeScript types, structured logging, error handling robusto
   */
  public async handleWorkerMessage(userId: string, message: WorkerMessage): Promise<void> {
    this.logger.debug('Received IPC message from worker', {
      userId,
      messageType: message.type,
      command: message.command,
      status: message.status
    });

    if (!message || !message.type) {
      this.logger.error('Invalid IPC message received from worker', { userId });
      return;
    }

    // Handle NEW_MESSAGE_RECEIVED for WebSocket broadcast
    if (message.type === 'NEW_MESSAGE_RECEIVED') {
      await this.handleNewMessageNotification(userId, message.payload);
      return;
    }

    // Handle other message types that update Firestore status
    await this.handleStatusUpdate(userId, message);
  }

  /**
   * Handle new message notifications for WebSocket broadcast
   */
  private async handleNewMessageNotification(userId: string, payload: any): Promise<void> {
    this.logger.debug('Processing new message notification', { userId });

    try {
      // Broadcast to WebSocket clients
      await this.wsService.sendToUser(userId, {
        type: 'newMessage',
        data: payload
      });

      this.logger.debug('New message notification sent via WebSocket', { userId });
    } catch (error) {
      this.logger.error('Error sending new message notification', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle status updates and Firestore synchronization
   */
  private async handleStatusUpdate(userId: string, message: WorkerMessage): Promise<void> {
    let statusUpdateData: StatusUpdateData;
    let logMessage = '';
    const timestamp = FieldValue.serverTimestamp();

    // Prepare status update data based on message type
    switch (message.type) {
      case 'STATUS_UPDATE':
        const newStatus = message.status || 'error';
        statusUpdateData = {
          status: newStatus,
          last_error: message.error || null,
          updatedAt: timestamp
        };
        
        // Clear QR code when connecting/disconnecting
        if (newStatus === 'connected' || newStatus === 'disconnected') {
          statusUpdateData.last_qr_code = null;
        }
        
        logMessage = `status -> ${newStatus}`;
        break;

      case 'QR_CODE':
        statusUpdateData = {
          status: 'generating_qr',
          last_qr_code: message.qr || null,
          updatedAt: timestamp
        };
        logMessage = 'status -> generating_qr (QR code received)';
        break;

      case 'ERROR_INFO':
        statusUpdateData = {
          status: 'error',
          last_error: message.error || 'Unknown worker error',
          updatedAt: timestamp
        };
        logMessage = 'status -> error (ERROR_INFO)';
        break;

      default:
        this.logger.debug('Unhandled message type', {
          userId,
          messageType: message.type
        });
        return;
    }

    // Update Firestore status subcollection
    try {
      const statusDocRef = this.db
        .collection('users')
        .doc(userId)
        .collection('status')
        .doc('whatsapp');

      await statusDocRef.set(statusUpdateData, { merge: true });

      this.logger.info('Worker status updated in Firestore', {
        userId,
        update: logMessage,
        messageType: message.type
      });

      // Update worker instance status in memory
      const workerInstance = this.workerManager.getWorker(userId);
      if (workerInstance) {
        workerInstance.status = this.mapFirestoreStatusToWorkerStatus(statusUpdateData.status);
        workerInstance.lastActivity = new Date();
      }

      // Emit status change event
      this.workerManager.emit('statusChanged', {
        userId,
        status: statusUpdateData.status,
        error: statusUpdateData.last_error,
        qrCode: statusUpdateData.last_qr_code
      });

    } catch (error) {
      this.logger.error('Error updating Firestore status for worker message', {
        userId,
        messageType: message.type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Send command to specific worker
   */
  public async sendCommandToWorker(userId: string, command: string, payload?: any): Promise<boolean> {
    const message: WorkerMessage = {
      type: 'COMMAND',
      command,
      payload
    };

    return await this.workerManager.notifyWorker(userId, message);
  }

  /**
   * Send message command to worker
   */
  public async sendMessageCommand(
    userId: string, 
    phoneNumber: string, 
    messageContent: string
  ): Promise<boolean> {
    return await this.sendCommandToWorker(userId, 'SEND_MESSAGE', {
      number: phoneNumber,
      message: messageContent
    });
  }

  /**
   * Send agent switch command to worker
   */
  public async sendAgentSwitchCommand(userId: string, agentId: string): Promise<boolean> {
    return await this.sendCommandToWorker(userId, 'SWITCH_AGENT', {
      agentId
    });
  }

  /**
   * Send pause/resume bot command to worker
   */
  public async sendBotControlCommand(userId: string, pause: boolean): Promise<boolean> {
    return await this.sendCommandToWorker(userId, 'PAUSE_BOT', {
      pause
    });
  }

  /**
   * Send reload flows command to worker
   */
  public async sendReloadFlowsCommand(userId: string): Promise<boolean> {
    try {
      // Get user flows from Firestore
      const flowsSnapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('action_flows')
        .get();

      const flowsData = flowsSnapshot.docs.map(doc => doc.data());

      return await this.sendCommandToWorker(userId, 'RELOAD_USER_FLOWS', {
        flows: flowsData
      });
    } catch (error) {
      this.logger.error('Error reloading flows for worker', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Send reload rules command to worker
   */
  public async sendReloadRulesCommand(userId: string): Promise<boolean> {
    try {
      // Get user rules from Firestore
      const rulesSnapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('rules')
        .get();

      const rulesData = rulesSnapshot.docs.map(doc => doc.data());

      return await this.sendCommandToWorker(userId, 'RELOAD_RULES', {
        rules: rulesData
      });
    } catch (error) {
      this.logger.error('Error reloading rules for worker', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Send initial configuration to worker
   */
  public async sendInitialConfiguration(
    userId: string,
    agentConfig: any,
    rules: any[],
    starters: any[],
    flows: any[]
  ): Promise<boolean> {
    return await this.sendCommandToWorker(userId, 'INITIAL_CONFIG', {
      agentConfig,
      rules,
      starters,
      flows
    });
  }

  /**
   * Handle bulk notifications to multiple workers
   */
  public async broadcastToAllWorkers(command: string, payload?: any): Promise<number> {
    const workers = this.workerManager.getAllWorkers();
    let successCount = 0;

    const notifications = Array.from(workers.keys()).map(async (userId) => {
      const success = await this.sendCommandToWorker(userId, command, payload);
      if (success) {
        successCount++;
      }
      return success;
    });

    await Promise.allSettled(notifications);
    
    this.logger.info('Broadcast command sent to all workers', {
      command,
      totalWorkers: workers.size,
      successCount
    });

    return successCount;
  }

  /**
   * Get worker status from Firestore
   */
  public async getWorkerStatusFromFirestore(userId: string): Promise<any> {
    try {
      const statusDoc = await this.db
        .collection('users')
        .doc(userId)
        .collection('status')
        .doc('whatsapp')
        .get();

      if (statusDoc.exists) {
        return statusDoc.data();
      }

      return null;
    } catch (error) {
      this.logger.error('Error getting worker status from Firestore', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Verify worker status consistency between memory and Firestore
   */
  public async verifyWorkerStatusConsistency(userId: string): Promise<boolean> {
    const workerInstance = this.workerManager.getWorker(userId);
    const firestoreStatus = await this.getWorkerStatusFromFirestore(userId);

    if (!workerInstance && !firestoreStatus) {
      return true; // Both don't exist, consistent
    }

    if (workerInstance && !firestoreStatus) {
      this.logger.warn('Worker exists in memory but not in Firestore', { userId });
      return false;
    }

    if (!workerInstance && firestoreStatus) {
      this.logger.warn('Worker exists in Firestore but not in memory', { userId });
      return false;
    }

    // Both exist, check status consistency
    const memoryStatus = workerInstance!.status;
    const dbStatus = firestoreStatus.status;

    const isConsistent = this.isStatusConsistent(memoryStatus, dbStatus);

    if (!isConsistent) {
      this.logger.warn('Worker status inconsistency detected', {
        userId,
        memoryStatus,
        firestoreStatus: dbStatus
      });
    }

    return isConsistent;
  }

  /**
   * Map Firestore status to worker instance status
   */
  private mapFirestoreStatusToWorkerStatus(firestoreStatus: string): 'starting' | 'connected' | 'disconnected' | 'error' {
    switch (firestoreStatus) {
      case 'connecting':
      case 'generating_qr':
        return 'starting';
      case 'connected':
        return 'connected';
      case 'disconnected':
        return 'disconnected';
      case 'error':
      default:
        return 'error';
    }
  }

  /**
   * Check if memory and Firestore statuses are consistent
   */
  private isStatusConsistent(memoryStatus: string, firestoreStatus: string): boolean {
    const mappedFirestoreStatus = this.mapFirestoreStatusToWorkerStatus(firestoreStatus);
    return memoryStatus === mappedFirestoreStatus;
  }

  /**
   * Cleanup IPC handler resources
   */
  public cleanup(): void {
    this.logger.debug('Cleaning up IPC handler resources');
    // Remove any active listeners or cleanup resources if needed
  }
} 