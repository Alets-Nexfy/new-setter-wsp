import { EventEmitter } from 'events';
import { LoggerService } from '@/core/services/LoggerService';
import { DatabaseService } from '@/core/services/DatabaseService';
import { UserTierService, UserTier, TierConfiguration } from '@/core/services/UserTierService';
import { WhatsAppConnectionPool } from '@/core/services/WhatsAppConnectionPool';
import { MessageEventBus } from '@/core/events/MessageEventBus';
import { CacheService } from '@/core/services/CacheService';

interface ResourceAllocation {
  userId: string;
  tier: UserTier;
  allocatedAt: Date;
  resources: {
    connectionType: 'shared' | 'semi-dedicated' | 'dedicated';
    connectionId?: string;
    workerId?: string;
    memoryLimitMB: number;
    cpuCores: number;
    priority: 'low' | 'medium' | 'high';
  };
  costs: {
    hourlyRate: number;
    estimatedMonthlyCost: number;
    actualMonthlyCost: number;
  };
  metrics: {
    messagesProcessed: number;
    connectionsActive: number;
    uptime: number;
    errorRate: number;
  };
}

interface AutoScalingMetrics {
  timestamp: Date;
  totalUsers: number;
  activeConnections: number;
  queueLengths: {
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
  };
  resourceUtilization: {
    cpu: number;
    memory: number;
    network: number;
  };
  costs: {
    totalHourlyCost: number;
    costPerUser: number;
    costEfficiency: number; // 0-100%
  };
  performance: {
    averageResponseTime: number;
    throughputPerSecond: number;
    errorRate: number;
  };
}

interface ScalingDecision {
  action: 'scale_up' | 'scale_down' | 'rebalance' | 'no_action';
  reason: string;
  affectedUsers: string[];
  estimatedCostImpact: number;
  executedAt?: Date;
  success?: boolean;
}

export class HybridArchitecture extends EventEmitter {
  private logger: LoggerService;
  private firebase: FirebaseService;
  private tierService: UserTierService;
  private connectionPool: WhatsAppConnectionPool;
  private messageBus: MessageEventBus;
  private cache: CacheService;

  // Resource tracking
  private allocatedResources: Map<string, ResourceAllocation> = new Map();
  private globalMetrics: AutoScalingMetrics;
  private scalingHistory: ScalingDecision[] = [];

  // Auto-scaling configuration
  private scalingConfig = {
    enabled: true,
    checkInterval: 30000, // 30 seconds
    thresholds: {
      cpu: { scaleUp: 70, scaleDown: 30 },
      memory: { scaleUp: 80, scaleDown: 40 },
      queueLength: { scaleUp: 50, scaleDown: 10 },
      responseTime: { scaleUp: 2000, scaleDown: 500 } // milliseconds
    },
    cooldown: {
      scaleUp: 300000,    // 5 minutes
      scaleDown: 600000,  // 10 minutes
      rebalance: 180000   // 3 minutes
    },
    costOptimization: {
      enabled: true,
      targetCostReduction: 80, // 80% cost reduction vs all-dedicated
      maxCostPerUser: 0.5,     // $0.50 per user per hour max
      rebalanceThreshold: 20   // Rebalance if cost efficiency drops below 20%
    }
  };

  // Performance targets
  private performanceTargets = {
    maxResponseTime: 1000,    // 1 second
    minThroughput: 100,       // messages per second
    maxErrorRate: 0.01,       // 1%
    minUptime: 0.999,         // 99.9%
    costPerUser: 0.2          // $0.20 per user per hour target
  };

  private isInitialized = false;
  private scalingInterval: NodeJS.Timeout | null = null;
  private metricsCollectionInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.logger = LoggerService.getInstance();
    this.firebase = DatabaseService.getInstance();
    this.tierService = new UserTierService();
    this.connectionPool = new WhatsAppConnectionPool();
    this.messageBus = new MessageEventBus();
    this.cache = CacheService.getInstance();

    this.initializeGlobalMetrics();
    this.setupEventHandlers();
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing Hybrid Architecture System');

      // Initialize all subsystems
      await this.connectionPool.initialize();
      // MessageBus initializes itself

      // Load existing resource allocations
      await this.loadExistingAllocations();

      // Start monitoring and auto-scaling
      this.startMetricsCollection();
      this.startAutoScaling();

      this.isInitialized = true;
      this.emit('architecture:ready');

      this.logger.info('Hybrid Architecture initialized successfully', {
        allocatedUsers: this.allocatedResources.size,
        scalingEnabled: this.scalingConfig.enabled
      });

    } catch (error) {
      this.logger.error('Failed to initialize hybrid architecture', { error });
      throw error;
    }
  }

  // MAIN PUBLIC API: User resource allocation
  public async allocateResources(userId: string, overrideTier?: UserTier): Promise<ResourceAllocation> {
    try {
      const tierInfo = await this.tierService.getUserTier(userId);
      const effectiveTier = overrideTier || tierInfo.tier;
      const tierConfig = this.tierService.getTierConfiguration(effectiveTier);

      if (!tierConfig) {
        throw new Error(`Invalid tier configuration: ${effectiveTier}`);
      }

      this.logger.info('Allocating resources for user', { userId, tier: effectiveTier });

      // Determine optimal resource allocation
      const allocation = await this.determineOptimalAllocation(userId, tierConfig);

      // Allocate connection through connection pool
      const session = await this.connectionPool.connectUser(userId);

      // Update allocation with actual connection details
      allocation.resources.connectionType = session.connectionType;
      allocation.resources.connectionId = session.connectionId;
      allocation.resources.workerId = session.workerId;

      // Store allocation
      this.allocatedResources.set(userId, allocation);
      await this.persistAllocation(allocation);

      // Update global metrics
      await this.updateGlobalMetrics();

      this.emit('resources:allocated', { userId, allocation });

      this.logger.info('Resources allocated successfully', {
        userId,
        tier: effectiveTier,
        connectionType: allocation.resources.connectionType,
        estimatedCost: allocation.costs.estimatedMonthlyCost
      });

      return allocation;

    } catch (error) {
      this.logger.error('Failed to allocate resources', { userId, error });
      throw error;
    }
  }

  public async deallocateResources(userId: string): Promise<void> {
    try {
      const allocation = this.allocatedResources.get(userId);
      if (!allocation) {
        this.logger.warn('Attempted to deallocate non-existent allocation', { userId });
        return;
      }

      this.logger.info('Deallocating resources for user', { userId });

      // Disconnect from connection pool
      await this.connectionPool.disconnectUser(userId);

      // Remove allocation
      this.allocatedResources.delete(userId);
      await this.removePersistedAllocation(userId);

      // Update global metrics
      await this.updateGlobalMetrics();

      this.emit('resources:deallocated', { userId });

      this.logger.info('Resources deallocated successfully', { userId });

    } catch (error) {
      this.logger.error('Failed to deallocate resources', { userId, error });
      throw error;
    }
  }

  public async handleTierUpgrade(userId: string, newTier: UserTier): Promise<void> {
    try {
      const currentAllocation = this.allocatedResources.get(userId);
      
      this.logger.info('Handling tier upgrade', { 
        userId, 
        newTier, 
        currentTier: currentAllocation?.tier 
      });

      // Deallocate current resources
      await this.deallocateResources(userId);

      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Allocate new resources with new tier
      await this.allocateResources(userId, newTier);

      this.emit('tier:upgraded', { userId, newTier });

    } catch (error) {
      this.logger.error('Failed to handle tier upgrade', { userId, newTier, error });
      throw error;
    }
  }

  // AUTO-SCALING AND OPTIMIZATION
  private async determineOptimalAllocation(userId: string, tierConfig: TierConfiguration): Promise<ResourceAllocation> {
    const now = new Date();
    
    // Base allocation from tier configuration
    let connectionType: 'shared' | 'semi-dedicated' | 'dedicated';
    
    if (tierConfig.resources.dedicatedWorker) {
      connectionType = 'dedicated';
    } else if (tierConfig.tier === 'professional') {
      connectionType = 'semi-dedicated';
    } else {
      connectionType = 'shared';
    }

    // Cost optimization logic
    const hourlyRate = this.calculateHourlyRate(connectionType, tierConfig);
    const estimatedMonthlyCost = hourlyRate * 24 * 30; // Rough monthly estimate

    const allocation: ResourceAllocation = {
      userId,
      tier: tierConfig.tier,
      allocatedAt: now,
      resources: {
        connectionType,
        memoryLimitMB: tierConfig.resources.memoryLimitMB,
        cpuCores: tierConfig.resources.cpuCores,
        priority: tierConfig.resources.priority
      },
      costs: {
        hourlyRate,
        estimatedMonthlyCost,
        actualMonthlyCost: 0 // Will be calculated based on actual usage
      },
      metrics: {
        messagesProcessed: 0,
        connectionsActive: 0,
        uptime: 0,
        errorRate: 0
      }
    };

    return allocation;
  }

  private calculateHourlyRate(connectionType: 'shared' | 'semi-dedicated' | 'dedicated', tierConfig: TierConfiguration): number {
    // Cost optimization: Different rates based on connection type
    const baseCosts = {
      shared: 0.02,        // $0.02/hour (90% savings)
      'semi-dedicated': 0.08, // $0.08/hour (70% savings)  
      dedicated: 0.25      // $0.25/hour (baseline)
    };

    let baseCost = baseCosts[connectionType];

    // Apply tier multipliers
    const tierMultipliers = {
      standard: 1.0,
      professional: 1.2,
      enterprise: 1.5
    };

    const tierMultiplier = tierMultipliers[tierConfig.tier] || 1.0;
    
    return baseCost * tierMultiplier;
  }

  // AUTO-SCALING LOGIC
  private async performAutoScaling(): Promise<void> {
    try {
      if (!this.scalingConfig.enabled) {
        return;
      }

      await this.updateGlobalMetrics();
      const decision = await this.makeScalingDecision();

      if (decision.action !== 'no_action') {
        await this.executeScalingDecision(decision);
      }

    } catch (error) {
      this.logger.error('Error in auto-scaling', { error });
    }
  }

  private async makeScalingDecision(): Promise<ScalingDecision> {
    const metrics = this.globalMetrics;
    const thresholds = this.scalingConfig.thresholds;

    // Check if we're within cooldown period
    if (this.isInCooldownPeriod()) {
      return {
        action: 'no_action',
        reason: 'Within cooldown period',
        affectedUsers: [],
        estimatedCostImpact: 0
      };
    }

    // Cost efficiency check
    if (this.scalingConfig.costOptimization.enabled) {
      if (metrics.costs.costEfficiency < this.scalingConfig.costOptimization.rebalanceThreshold) {
        return await this.planCostOptimizationRebalance();
      }
    }

    // Performance-based scaling decisions
    if (metrics.resourceUtilization.cpu > thresholds.cpu.scaleUp ||
        metrics.resourceUtilization.memory > thresholds.memory.scaleUp ||
        metrics.performance.averageResponseTime > thresholds.responseTime.scaleUp) {
      
      return await this.planScaleUp();
    }

    if (metrics.resourceUtilization.cpu < thresholds.cpu.scaleDown &&
        metrics.resourceUtilization.memory < thresholds.memory.scaleDown &&
        metrics.performance.averageResponseTime < thresholds.responseTime.scaleDown) {
      
      return await this.planScaleDown();
    }

    return {
      action: 'no_action',
      reason: 'All metrics within acceptable ranges',
      affectedUsers: [],
      estimatedCostImpact: 0
    };
  }

  private async planCostOptimizationRebalance(): Promise<ScalingDecision> {
    const candidates = await this.identifyRebalancingCandidates();
    
    return {
      action: 'rebalance',
      reason: 'Cost efficiency below threshold',
      affectedUsers: candidates.map(c => c.userId),
      estimatedCostImpact: candidates.reduce((sum, c) => sum + c.costSavings, 0)
    };
  }

  private async planScaleUp(): Promise<ScalingDecision> {
    const candidates = await this.identifyScaleUpCandidates();
    
    return {
      action: 'scale_up',
      reason: 'High resource utilization detected',
      affectedUsers: candidates,
      estimatedCostImpact: candidates.length * 0.1 // Estimated additional cost
    };
  }

  private async planScaleDown(): Promise<ScalingDecision> {
    const candidates = await this.identifyScaleDownCandidates();
    
    return {
      action: 'scale_down',
      reason: 'Low resource utilization detected',
      affectedUsers: candidates,
      estimatedCostImpact: candidates.length * -0.05 // Estimated cost savings
    };
  }

  private async executeScalingDecision(decision: ScalingDecision): Promise<void> {
    try {
      this.logger.info('Executing scaling decision', decision);

      decision.executedAt = new Date();

      switch (decision.action) {
        case 'scale_up':
          await this.executeScaleUp(decision.affectedUsers);
          break;
          
        case 'scale_down':
          await this.executeScaleDown(decision.affectedUsers);
          break;
          
        case 'rebalance':
          await this.executeRebalance(decision.affectedUsers);
          break;
      }

      decision.success = true;
      this.scalingHistory.push(decision);

      // Trim scaling history to last 100 entries
      if (this.scalingHistory.length > 100) {
        this.scalingHistory = this.scalingHistory.slice(-100);
      }

      this.emit('scaling:completed', decision);

    } catch (error) {
      decision.success = false;
      this.scalingHistory.push(decision);
      
      this.logger.error('Failed to execute scaling decision', { decision, error });
      this.emit('scaling:failed', { decision, error });
    }
  }

  private async executeScaleUp(userIds: string[]): Promise<void> {
    // Implementation would move users to higher tiers or better resource allocations
    for (const userId of userIds) {
      const allocation = this.allocatedResources.get(userId);
      if (allocation) {
        // Move shared users to semi-dedicated, semi-dedicated to dedicated, etc.
        await this.upgradeUserResourceAllocation(userId, allocation);
      }
    }
  }

  private async executeScaleDown(userIds: string[]): Promise<void> {
    // Implementation would move users to more cost-effective resource allocations
    for (const userId of userIds) {
      const allocation = this.allocatedResources.get(userId);
      if (allocation) {
        await this.optimizeUserResourceAllocation(userId, allocation);
      }
    }
  }

  private async executeRebalance(userIds: string[]): Promise<void> {
    // Implementation would rebalance users across connection pools for optimal cost/performance
    for (const userId of userIds) {
      await this.rebalanceUserAllocation(userId);
    }
  }

  // HELPER METHODS
  private async identifyRebalancingCandidates(): Promise<Array<{userId: string, costSavings: number}>> {
    const candidates: Array<{userId: string, costSavings: number}> = [];
    
    for (const [userId, allocation] of this.allocatedResources.entries()) {
      // Check if user could be moved to a more cost-effective allocation
      const potentialSavings = await this.calculatePotentialCostSavings(userId, allocation);
      
      if (potentialSavings > 0.01) { // More than 1 cent per hour savings
        candidates.push({ userId, costSavings: potentialSavings });
      }
    }

    return candidates.sort((a, b) => b.costSavings - a.costSavings).slice(0, 10); // Top 10
  }

  private async identifyScaleUpCandidates(): Promise<string[]> {
    const candidates: string[] = [];
    
    for (const [userId, allocation] of this.allocatedResources.entries()) {
      // Check if user is experiencing performance issues
      if (allocation.metrics.errorRate > 0.05 || // 5% error rate
          this.getUserAverageResponseTime(userId) > 2000) { // 2 second response time
        candidates.push(userId);
      }
    }

    return candidates.slice(0, 5); // Limit to 5 users per scaling operation
  }

  private async identifyScaleDownCandidates(): Promise<string[]> {
    const candidates: string[] = [];
    
    for (const [userId, allocation] of this.allocatedResources.entries()) {
      // Check if user is under-utilizing resources
      if (allocation.resources.connectionType === 'dedicated' &&
          allocation.metrics.messagesProcessed < 100 && // Less than 100 messages per day
          this.getUserAverageResponseTime(userId) < 500) { // Fast response times
        candidates.push(userId);
      }
    }

    return candidates.slice(0, 3); // Conservative scaling down
  }

  private isInCooldownPeriod(): boolean {
    if (this.scalingHistory.length === 0) {
      return false;
    }

    const lastScaling = this.scalingHistory[this.scalingHistory.length - 1];
    if (!lastScaling.executedAt) {
      return false;
    }

    const cooldownPeriod = this.scalingConfig.cooldown[lastScaling.action] || 300000;
    const timeSinceLastScaling = Date.now() - lastScaling.executedAt.getTime();

    return timeSinceLastScaling < cooldownPeriod;
  }

  private async calculatePotentialCostSavings(userId: string, allocation: ResourceAllocation): Promise<number> {
    // Calculate potential savings by moving to a more cost-effective tier
    const currentCost = allocation.costs.hourlyRate;
    
    // Determine optimal allocation based on actual usage
    const optimalConnectionType = await this.determineOptimalConnectionType(userId, allocation);
    const optimalCost = this.calculateHourlyRate(optimalConnectionType, this.tierService.getTierConfiguration(allocation.tier)!);
    
    return Math.max(0, currentCost - optimalCost);
  }

  private async determineOptimalConnectionType(userId: string, allocation: ResourceAllocation): Promise<'shared' | 'semi-dedicated' | 'dedicated'> {
    // Analyze usage patterns to determine optimal connection type
    const usage = allocation.metrics;
    
    if (usage.messagesProcessed > 1000 && usage.connectionsActive > 5) {
      return 'dedicated';
    } else if (usage.messagesProcessed > 100 && usage.connectionsActive > 2) {
      return 'semi-dedicated';
    } else {
      return 'shared';
    }
  }

  private getUserAverageResponseTime(userId: string): number {
    // This would integrate with your metrics system
    // For now, return a mock value
    return Math.random() * 1000 + 500; // 500-1500ms
  }

  private async upgradeUserResourceAllocation(userId: string, allocation: ResourceAllocation): Promise<void> {
    // Move user to a higher-performance allocation
    this.logger.info('Upgrading resource allocation', { userId, currentType: allocation.resources.connectionType });
    
    // This would trigger a reallocation with better resources
    await this.deallocateResources(userId);
    await this.allocateResources(userId);
  }

  private async optimizeUserResourceAllocation(userId: string, allocation: ResourceAllocation): Promise<void> {
    // Move user to a more cost-effective allocation
    this.logger.info('Optimizing resource allocation', { userId, currentType: allocation.resources.connectionType });
    
    // This would trigger a reallocation with more cost-effective resources
    await this.deallocateResources(userId);
    await this.allocateResources(userId);
  }

  private async rebalanceUserAllocation(userId: string): Promise<void> {
    // Rebalance user for optimal cost/performance ratio
    this.logger.info('Rebalancing user allocation', { userId });
    
    await this.deallocateResources(userId);
    await this.allocateResources(userId);
  }

  // METRICS AND MONITORING
  private initializeGlobalMetrics(): void {
    this.globalMetrics = {
      timestamp: new Date(),
      totalUsers: 0,
      activeConnections: 0,
      queueLengths: {
        highPriority: 0,
        mediumPriority: 0,
        lowPriority: 0
      },
      resourceUtilization: {
        cpu: 0,
        memory: 0,
        network: 0
      },
      costs: {
        totalHourlyCost: 0,
        costPerUser: 0,
        costEfficiency: 100
      },
      performance: {
        averageResponseTime: 0,
        throughputPerSecond: 0,
        errorRate: 0
      }
    };
  }

  private async updateGlobalMetrics(): Promise<void> {
    try {
      const now = new Date();
      
      // Basic counts
      const totalUsers = this.allocatedResources.size;
      const activeConnections = Array.from(this.allocatedResources.values())
        .reduce((sum, allocation) => sum + allocation.metrics.connectionsActive, 0);

      // Queue lengths from message bus
      const messageBusMetrics = this.messageBus.getMetrics();
      
      // Cost calculations
      const totalHourlyCost = Array.from(this.allocatedResources.values())
        .reduce((sum, allocation) => sum + allocation.costs.hourlyRate, 0);
      
      const costPerUser = totalUsers > 0 ? totalHourlyCost / totalUsers : 0;
      
      // Cost efficiency (vs all-dedicated baseline of $0.25/hour per user)
      const baselineCost = totalUsers * 0.25;
      const costEfficiency = baselineCost > 0 ? Math.max(0, (1 - (totalHourlyCost / baselineCost)) * 100) : 100;

      // Performance metrics (would integrate with actual monitoring)
      const performanceMetrics = await this.calculatePerformanceMetrics();

      this.globalMetrics = {
        timestamp: now,
        totalUsers,
        activeConnections,
        queueLengths: {
          highPriority: messageBusMetrics.queues?.highPriority?.waiting || 0,
          mediumPriority: messageBusMetrics.queues?.mediumPriority?.waiting || 0,
          lowPriority: messageBusMetrics.queues?.lowPriority?.waiting || 0
        },
        resourceUtilization: performanceMetrics.resourceUtilization,
        costs: {
          totalHourlyCost,
          costPerUser,
          costEfficiency
        },
        performance: performanceMetrics.performance
      };

      // Emit metrics update
      this.emit('metrics:updated', this.globalMetrics);

    } catch (error) {
      this.logger.error('Error updating global metrics', { error });
    }
  }

  private async calculatePerformanceMetrics(): Promise<{
    resourceUtilization: { cpu: number; memory: number; network: number };
    performance: { averageResponseTime: number; throughputPerSecond: number; errorRate: number };
  }> {
    // This would integrate with system monitoring tools
    // For now, return calculated/mock values
    
    const connectionPoolStats = this.connectionPool.getPoolStats();
    
    return {
      resourceUtilization: {
        cpu: Math.min(100, connectionPoolStats.pools.shared.utilization + 
                          connectionPoolStats.pools.semiDedicated.utilization),
        memory: Math.min(100, connectionPoolStats.resourceUtilization || 50),
        network: Math.min(100, connectionPoolStats.activeUsers * 2) // 2% per active user
      },
      performance: {
        averageResponseTime: 800, // Mock value - would be calculated from actual metrics
        throughputPerSecond: connectionPoolStats.activeUsers * 0.1, // Mock throughput
        errorRate: 0.005 // 0.5% error rate
      }
    };
  }

  // PERSISTENCE
  private async loadExistingAllocations(): Promise<void> {
    try {
      const allocations = await this.firebase.getCollection('resource_allocations');
      
      for (const [userId, allocationData] of Object.entries(allocations)) {
        this.allocatedResources.set(userId, allocationData as ResourceAllocation);
      }

      this.logger.info('Loaded existing resource allocations', { 
        count: this.allocatedResources.size 
      });

    } catch (error) {
      this.logger.error('Error loading existing allocations', { error });
    }
  }

  private async persistAllocation(allocation: ResourceAllocation): Promise<void> {
    try {
      await this.firebase.setDocument(`resource_allocations/${allocation.userId}`, allocation);
    } catch (error) {
      this.logger.error('Error persisting allocation', { userId: allocation.userId, error });
    }
  }

  private async removePersistedAllocation(userId: string): Promise<void> {
    try {
      await this.firebase.deleteDocument(`resource_allocations/${userId}`);
    } catch (error) {
      this.logger.error('Error removing persisted allocation', { userId, error });
    }
  }

  // EVENT HANDLERS
  private setupEventHandlers(): void {
    // Tier change handlers
    this.tierService.on('tier:upgraded', async (data) => {
      await this.handleTierUpgrade(data.userId, data.newTier);
    });

    this.tierService.on('tier:downgraded', async (data) => {
      await this.handleTierUpgrade(data.userId, data.newTier); // Same logic for downgrades
    });

    // Connection pool events
    this.connectionPool.on('user:connected', (data) => {
      this.updateAllocationMetrics(data.userId, { connectionsActive: 1 });
    });

    this.connectionPool.on('user:disconnected', (data) => {
      this.updateAllocationMetrics(data.userId, { connectionsActive: 0 });
    });

    // Message bus events
    this.messageBus.on('event:processed', (data) => {
      if (data.event.userId) {
        this.updateAllocationMetrics(data.event.userId, { messagesProcessed: 1 });
      }
    });

    this.messageBus.on('event:error', (data) => {
      if (data.event.userId) {
        this.incrementAllocationErrorRate(data.event.userId);
      }
    });

    // Process shutdown handlers
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  private updateAllocationMetrics(userId: string, updates: Partial<ResourceAllocation['metrics']>): void {
    const allocation = this.allocatedResources.get(userId);
    if (allocation) {
      Object.assign(allocation.metrics, updates);
      // Persist update asynchronously
      this.persistAllocation(allocation).catch(error => 
        this.logger.error('Error persisting allocation metrics update', { userId, error })
      );
    }
  }

  private incrementAllocationErrorRate(userId: string): void {
    const allocation = this.allocatedResources.get(userId);
    if (allocation) {
      allocation.metrics.errorRate = (allocation.metrics.errorRate + 0.01); // Increment by 1%
      this.persistAllocation(allocation).catch(error => 
        this.logger.error('Error persisting allocation error rate update', { userId, error })
      );
    }
  }

  // LIFECYCLE MANAGEMENT
  private startMetricsCollection(): void {
    this.metricsCollectionInterval = setInterval(async () => {
      await this.updateGlobalMetrics();
    }, 30000); // Every 30 seconds
  }

  private startAutoScaling(): void {
    this.scalingInterval = setInterval(async () => {
      await this.performAutoScaling();
    }, this.scalingConfig.checkInterval);
  }

  // PUBLIC API
  public getGlobalMetrics(): AutoScalingMetrics {
    return { ...this.globalMetrics };
  }

  public getScalingHistory(): ScalingDecision[] {
    return [...this.scalingHistory];
  }

  public getAllocatedResources(): Map<string, ResourceAllocation> {
    return new Map(this.allocatedResources);
  }

  public getScalingConfiguration(): typeof this.scalingConfig {
    return { ...this.scalingConfig };
  }

  public updateScalingConfiguration(updates: Partial<typeof this.scalingConfig>): void {
    Object.assign(this.scalingConfig, updates);
    this.logger.info('Scaling configuration updated', updates);
    this.emit('scaling:config_updated', this.scalingConfig);
  }

  public async enableAutoScaling(): Promise<void> {
    this.scalingConfig.enabled = true;
    if (!this.scalingInterval) {
      this.startAutoScaling();
    }
    this.logger.info('Auto-scaling enabled');
  }

  public async disableAutoScaling(): Promise<void> {
    this.scalingConfig.enabled = false;
    if (this.scalingInterval) {
      clearInterval(this.scalingInterval);
      this.scalingInterval = null;
    }
    this.logger.info('Auto-scaling disabled');
  }

  public async forceScalingCheck(): Promise<ScalingDecision> {
    await this.updateGlobalMetrics();
    const decision = await this.makeScalingDecision();
    
    if (decision.action !== 'no_action') {
      await this.executeScalingDecision(decision);
    }

    return decision;
  }

  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down hybrid architecture...');

    // Clear intervals
    if (this.scalingInterval) {
      clearInterval(this.scalingInterval);
    }
    if (this.metricsCollectionInterval) {
      clearInterval(this.metricsCollectionInterval);
    }

    // Shutdown subsystems
    await this.connectionPool.shutdown();
    await this.messageBus.shutdown();

    // Persist final state
    for (const allocation of this.allocatedResources.values()) {
      await this.persistAllocation(allocation);
    }

    this.logger.info('Hybrid architecture shutdown completed');
    this.emit('architecture:shutdown');
  }
}