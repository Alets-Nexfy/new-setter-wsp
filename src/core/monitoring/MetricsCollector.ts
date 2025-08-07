import { EventEmitter } from 'events';
import { LoggerService } from '@/core/services/LoggerService';
import { SupabaseService } from '@/core/services/SupabaseService';
import { CacheService } from '@/core/services/CacheService';
import { UserTierService } from '@/core/services/UserTierService';
import { CostOptimizer } from '@/core/optimization/CostOptimizer';
import { createClient } from 'redis';

export interface UserMetrics {
  userId: string;
  timestamp: Date;
  tier: string;
  costs: {
    hourlyRate: number;
    dailyCost: number;
    monthlyCost: number;
    yearToDateCost: number;
    projectedAnnualCost: number;
  };
  usage: {
    messagesProcessed: number;
    messagesSent: number;
    messagesReceived: number;
    connectionsActive: number;
    storageUsedMB: number;
    apiCallsCount: number;
  };
  performance: {
    averageResponseTime: number;
    errorRate: number;
    uptime: number;
    throughputPerMinute: number;
  };
  resources: {
    connectionType: 'shared' | 'semi-dedicated' | 'dedicated';
    memoryUsageMB: number;
    cpuUsagePercent: number;
    resourceUtilization: number;
  };
  billing: {
    currentPlan: string;
    billingCycle: 'monthly' | 'yearly';
    nextBillingDate: Date;
    overageCharges: number;
    creditsRemaining: number;
  };
}

export interface SystemMetrics {
  timestamp: Date;
  global: {
    totalUsers: number;
    activeUsers: number;
    totalCost: number;
    averageCostPerUser: number;
    costEfficiency: number;
    targetCostReduction: number;
    actualCostReduction: number;
  };
  pools: {
    shared: {
      totalSlots: number;
      activeSlots: number;
      totalUsers: number;
      utilization: number;
      cost: number;
    };
    semiDedicated: {
      totalSlots: number;
      activeSlots: number;
      totalUsers: number;
      utilization: number;
      cost: number;
    };
    dedicated: {
      totalWorkers: number;
      activeWorkers: number;
      totalUsers: number;
      cost: number;
    };
  };
  performance: {
    totalMessagesPerSecond: number;
    averageResponseTime: number;
    globalErrorRate: number;
    globalUptime: number;
  };
  costs: {
    totalHourlyCost: number;
    totalDailyCost: number;
    totalMonthlyCost: number;
    costByTier: {
      standard: number;
      professional: number;
      enterprise: number;
    };
    savingsVsBaseline: number;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: {
    metric: string;
    operator: '>' | '<' | '==' | '>=' | '<=';
    threshold: number;
    timeWindow: number; // minutes
  };
  actions: {
    email?: string[];
    webhook?: string;
    autoScale?: boolean;
    autoOptimize?: boolean;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  cooldownMinutes: number;
  lastTriggered?: Date;
}

export class MetricsCollector extends EventEmitter {
  private logger: LoggerService;
  private firebase: SupabaseService;
  private cache: CacheService;
  private tierService: UserTierService;
  private costOptimizer: CostOptimizer;
  private redis: any;

  // Metrics storage
  private userMetrics: Map<string, UserMetrics> = new Map();
  private systemMetrics: SystemMetrics;
  private historicalMetrics: SystemMetrics[] = [];

  // Alert system
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Date> = new Map();

  // Collection intervals
  private userMetricsInterval: NodeJS.Timeout | null = null;
  private systemMetricsInterval: NodeJS.Timeout | null = null;
  private alertCheckInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Configuration
  private readonly COLLECTION_INTERVALS = {
    userMetrics: 60000,    // 1 minute
    systemMetrics: 30000,  // 30 seconds
    alertCheck: 15000,     // 15 seconds
    cleanup: 3600000       // 1 hour
  };

  private readonly RETENTION_PERIODS = {
    userMetrics: 30,       // 30 days
    systemMetrics: 90,     // 90 days
    alerts: 30             // 30 days
  };

  private isRunning = false;

  constructor() {
    super();
    this.logger = LoggerService.getInstance();
    this.firebase = SupabaseService.getInstance();
    this.cache = CacheService.getInstance();
    this.tierService = UserTierService.getInstance();
    this.costOptimizer = new CostOptimizer();

    this.initializeSystemMetrics();
    this.initializeAlertRules();
    this.initializeRedis();
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Metrics Collector with cost tracking');

      // Connect to Redis
      await this.redis.connect();

      // Load existing data
      await this.loadHistoricalMetrics();
      await this.loadAlertRules();

      // Start collection cycles
      this.startUserMetricsCollection();
      this.startSystemMetricsCollection();
      this.startAlertMonitoring();
      this.startCleanupCycle();

      this.isRunning = true;
      this.emit('collector:ready');

      this.logger.info('Metrics Collector initialized successfully', {
        userMetricsInterval: this.COLLECTION_INTERVALS.userMetrics,
        systemMetricsInterval: this.COLLECTION_INTERVALS.systemMetrics,
        alertRules: this.alertRules.size
      });

    } catch (error) {
      this.logger.error('Failed to initialize metrics collector', { error });
      throw error;
    }
  }

  // USER METRICS COLLECTION
  public async collectUserMetrics(userId: string): Promise<UserMetrics> {
    try {
      const timestamp = new Date();
      
      // Get user tier information
      const tierInfo = await this.tierService.getUserTier(userId);
      
      // Collect cost metrics
      const costs = await this.calculateUserCosts(userId, tierInfo);
      
      // Collect usage metrics
      const usage = await this.collectUserUsage(userId);
      
      // Collect performance metrics
      const performance = await this.collectUserPerformance(userId);
      
      // Collect resource metrics
      const resources = await this.collectUserResources(userId);
      
      // Collect billing information
      const billing = await this.collectUserBilling(userId, tierInfo);

      const metrics: UserMetrics = {
        userId,
        timestamp,
        tier: tierInfo.tier,
        costs,
        usage,
        performance,
        resources,
        billing
      };

      // Store metrics
      this.userMetrics.set(userId, metrics);
      await this.persistUserMetrics(metrics);
      
      // Cache for quick access
      await this.cache.set(`user_metrics:${userId}`, JSON.stringify(metrics), 300);

      this.emit('user:metrics_collected', { userId, metrics });

      return metrics;

    } catch (error) {
      this.logger.error('Error collecting user metrics', { userId, error });
      throw error;
    }
  }

  public async collectSystemMetrics(): Promise<SystemMetrics> {
    try {
      const timestamp = new Date();

      // Collect global metrics
      const global = await this.calculateGlobalMetrics();
      
      // Collect pool metrics
      const pools = await this.calculatePoolMetrics();
      
      // Collect performance metrics
      const performance = await this.calculateSystemPerformance();
      
      // Collect cost metrics
      const costs = await this.calculateSystemCosts();

      this.systemMetrics = {
        timestamp,
        global,
        pools,
        performance,
        costs
      };

      // Store in historical data
      this.historicalMetrics.push(this.systemMetrics);
      if (this.historicalMetrics.length > 1440) { // Keep last 24 hours at 1-minute intervals
        this.historicalMetrics.shift();
      }

      // Persist to database
      await this.persistSystemMetrics(this.systemMetrics);

      this.emit('system:metrics_collected', this.systemMetrics);

      return this.systemMetrics;

    } catch (error) {
      this.logger.error('Error collecting system metrics', { error });
      throw error;
    }
  }

  // COST CALCULATION METHODS
  private async calculateUserCosts(userId: string, tierInfo: any): Promise<UserMetrics['costs']> {
    const costAnalysis = this.costOptimizer.getUserAnalysis(userId);
    const currentHourlyRate = costAnalysis?.currentCostStructure.hourlyCost || 0.05;
    
    const dailyCost = currentHourlyRate * 24;
    const monthlyCost = dailyCost * 30;
    const yearToDateCost = await this.getYearToDateCost(userId);
    const projectedAnnualCost = monthlyCost * 12;

    return {
      hourlyRate: currentHourlyRate,
      dailyCost,
      monthlyCost,
      yearToDateCost,
      projectedAnnualCost
    };
  }

  private async calculateGlobalMetrics(): Promise<SystemMetrics['global']> {
    const allUsers = await this.getAllUsers();
    const totalUsers = allUsers.length;
    
    // Count active users (users with activity in last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let activeUsers = 0;
    let totalCost = 0;

    for (const userId of allUsers) {
      const userMetrics = this.userMetrics.get(userId);
      if (userMetrics) {
        if (userMetrics.timestamp > oneDayAgo) {
          activeUsers++;
        }
        totalCost += userMetrics.costs.hourlyRate;
      }
    }

    const averageCostPerUser = totalUsers > 0 ? totalCost / totalUsers : 0;
    
    // Get cost optimization metrics
    const costOptimizationMetrics = this.costOptimizer.getGlobalMetrics();
    const targetCostReduction = 80; // 80% target
    const actualCostReduction = costOptimizationMetrics.costReductionAchieved;
    const costEfficiency = costOptimizationMetrics.costEfficiencyScore;

    return {
      totalUsers,
      activeUsers,
      totalCost,
      averageCostPerUser,
      costEfficiency,
      targetCostReduction,
      actualCostReduction
    };
  }

  private async calculatePoolMetrics(): Promise<SystemMetrics['pools']> {
    // This would integrate with your WhatsAppConnectionPool
    // For now, return calculated values
    
    return {
      shared: {
        totalSlots: 20,
        activeSlots: 15,
        totalUsers: 120,
        utilization: 60,
        cost: 20 * 0.02 * 24 // slots * hourly rate * hours
      },
      semiDedicated: {
        totalSlots: 10,
        activeSlots: 8,
        totalUsers: 24,
        utilization: 80,
        cost: 10 * 0.08 * 24
      },
      dedicated: {
        totalWorkers: 5,
        activeWorkers: 5,
        totalUsers: 5,
        cost: 5 * 0.25 * 24
      }
    };
  }

  private async calculateSystemPerformance(): Promise<SystemMetrics['performance']> {
    // Calculate aggregated performance metrics
    let totalResponseTime = 0;
    let totalErrors = 0;
    let totalRequests = 0;
    let totalUptime = 0;
    let userCount = 0;

    for (const metrics of this.userMetrics.values()) {
      totalResponseTime += metrics.performance.averageResponseTime;
      totalErrors += metrics.performance.errorRate * metrics.usage.messagesProcessed;
      totalRequests += metrics.usage.messagesProcessed;
      totalUptime += metrics.performance.uptime;
      userCount++;
    }

    return {
      totalMessagesPerSecond: totalRequests / 60, // Per minute to per second
      averageResponseTime: userCount > 0 ? totalResponseTime / userCount : 0,
      globalErrorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      globalUptime: userCount > 0 ? totalUptime / userCount : 100
    };
  }

  private async calculateSystemCosts(): Promise<SystemMetrics['costs']> {
    const poolMetrics = await this.calculatePoolMetrics();
    
    const totalHourlyCost = poolMetrics.shared.cost / 24 + 
                           poolMetrics.semiDedicated.cost / 24 + 
                           poolMetrics.dedicated.cost / 24;
    
    const totalDailyCost = totalHourlyCost * 24;
    const totalMonthlyCost = totalDailyCost * 30;

    // Calculate cost by tier
    const costByTier = await this.calculateCostByTier();
    
    // Calculate savings vs baseline (all dedicated)
    const totalUsers = poolMetrics.shared.totalUsers + 
                      poolMetrics.semiDedicated.totalUsers + 
                      poolMetrics.dedicated.totalUsers;
    const baselineCost = totalUsers * 0.25; // $0.25/hour per user if all dedicated
    const savingsVsBaseline = baselineCost > 0 ? totalHourlyCost - baselineCost : 0;

    return {
      totalHourlyCost,
      totalDailyCost,
      totalMonthlyCost,
      costByTier,
      savingsVsBaseline
    };
  }

  private async calculateCostByTier(): Promise<{standard: number, professional: number, enterprise: number}> {
    const costs = { standard: 0, professional: 0, enterprise: 0 };
    
    for (const metrics of this.userMetrics.values()) {
      if (metrics.tier === 'standard') {
        costs.standard += metrics.costs.hourlyRate;
      } else if (metrics.tier === 'professional') {
        costs.professional += metrics.costs.hourlyRate;
      } else if (metrics.tier === 'enterprise') {
        costs.enterprise += metrics.costs.hourlyRate;
      }
    }

    return costs;
  }

  // DATA COLLECTION HELPERS
  private async collectUserUsage(userId: string): Promise<UserMetrics['usage']> {
    try {
      // Get usage from the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const messages = await this.firebase.collection('messages')
        .where('userId', '==', userId)
        .where('timestamp', '>=', oneHourAgo)
        .get();

      const messagesSent = messages.docs.filter(doc => doc.data().direction === 'outgoing').length;
      const messagesReceived = messages.docs.filter(doc => doc.data().direction === 'incoming').length;
      const messagesProcessed = messagesSent + messagesReceived;

      // Get other usage metrics
      const tierInfo = await this.tierService.getUserTier(userId);
      const connectionsActive = tierInfo.usage.connectionsActive || 0;
      const storageUsedMB = tierInfo.usage.storageUsedMB || 0;

      // API calls count (would integrate with API middleware)
      const apiCallsCount = await this.getApiCallsCount(userId);

      return {
        messagesProcessed,
        messagesSent,
        messagesReceived,
        connectionsActive,
        storageUsedMB,
        apiCallsCount
      };

    } catch (error) {
      this.logger.error('Error collecting user usage', { userId, error });
      return {
        messagesProcessed: 0,
        messagesSent: 0,
        messagesReceived: 0,
        connectionsActive: 0,
        storageUsedMB: 0,
        apiCallsCount: 0
      };
    }
  }

  private async collectUserPerformance(userId: string): Promise<UserMetrics['performance']> {
    try {
      // Get performance data from cache or calculate
      const performanceKey = `performance:${userId}`;
      const cachedPerformance = await this.cache.get(performanceKey);
      
      if (cachedPerformance) {
        return JSON.parse(cachedPerformance);
      }

      // Calculate performance metrics
      const averageResponseTime = await this.calculateAverageResponseTime(userId);
      const errorRate = await this.calculateErrorRate(userId);
      const uptime = await this.calculateUptime(userId);
      const throughputPerMinute = await this.calculateThroughput(userId);

      const performance = {
        averageResponseTime,
        errorRate,
        uptime,
        throughputPerMinute
      };

      // Cache for 5 minutes
      await this.cache.set(performanceKey, JSON.stringify(performance), 300);

      return performance;

    } catch (error) {
      this.logger.error('Error collecting user performance', { userId, error });
      return {
        averageResponseTime: 1000,
        errorRate: 0.01,
        uptime: 99.9,
        throughputPerMinute: 10
      };
    }
  }

  private async collectUserResources(userId: string): Promise<UserMetrics['resources']> {
    try {
      // Get resource allocation info
      const allocation = await this.firebase.getDocument('resource_allocations', userId);
      
      if (!allocation) {
        return {
          connectionType: 'shared',
          memoryUsageMB: 0,
          cpuUsagePercent: 0,
          resourceUtilization: 0
        };
      }

      return {
        connectionType: allocation.resources.connectionType,
        memoryUsageMB: allocation.resources.memoryLimitMB * 0.7, // Assume 70% usage
        cpuUsagePercent: allocation.resources.cpuCores * 50, // Assume 50% usage
        resourceUtilization: 70 // Mock value
      };

    } catch (error) {
      this.logger.error('Error collecting user resources', { userId, error });
      return {
        connectionType: 'shared',
        memoryUsageMB: 50,
        cpuUsagePercent: 25,
        resourceUtilization: 50
      };
    }
  }

  private async collectUserBilling(userId: string, tierInfo: any): Promise<UserMetrics['billing']> {
    const monthlyCost = await this.tierService.calculateMonthlyCost(userId);
    
    // Calculate overage charges
    let overageCharges = 0;
    if (tierInfo.configuration.pricing.messagesIncluded !== -1) {
      const extraMessages = Math.max(0, tierInfo.usage.messagesThisMonth - tierInfo.configuration.pricing.messagesIncluded);
      overageCharges = extraMessages * tierInfo.configuration.pricing.extraMessageCost;
    }

    return {
      currentPlan: tierInfo.tier,
      billingCycle: tierInfo.billingCycle,
      nextBillingDate: tierInfo.subscriptionEnd,
      overageCharges,
      creditsRemaining: 0 // Would integrate with billing system
    };
  }

  // HELPER METHODS
  private async getYearToDateCost(userId: string): Promise<number> {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    
    // This would query historical billing data
    // For now, return estimated value
    const userMetrics = this.userMetrics.get(userId);
    if (userMetrics) {
      const daysSinceYearStart = Math.floor((Date.now() - yearStart.getTime()) / (24 * 60 * 60 * 1000));
      return userMetrics.costs.dailyCost * daysSinceYearStart;
    }

    return 0;
  }

  private async getAllUsers(): Promise<string[]> {
    try {
      const allocations = await this.firebase.getCollection('resource_allocations');
      return Object.keys(allocations);
    } catch (error) {
      this.logger.error('Error getting all users', { error });
      return [];
    }
  }

  private async getApiCallsCount(userId: string): Promise<number> {
    // This would integrate with API middleware to track calls
    // For now, return mock value
    return Math.floor(Math.random() * 100);
  }

  private async calculateAverageResponseTime(userId: string): Promise<number> {
    // Mock calculation - would integrate with actual response time tracking
    return 800 + Math.random() * 400; // 800-1200ms
  }

  private async calculateErrorRate(userId: string): Promise<number> {
    // Mock calculation - would integrate with error tracking
    return 0.005 + Math.random() * 0.01; // 0.5-1.5%
  }

  private async calculateUptime(userId: string): Promise<number> {
    // Mock calculation - would integrate with uptime monitoring
    return 99.5 + Math.random() * 0.5; // 99.5-100%
  }

  private async calculateThroughput(userId: string): Promise<number> {
    const userMetrics = this.userMetrics.get(userId);
    return userMetrics ? userMetrics.usage.messagesProcessed : 0;
  }

  // ALERT SYSTEM
  private initializeAlertRules(): void {
    // High cost alert
    this.alertRules.set('high_cost', {
      id: 'high_cost',
      name: 'High Cost Alert',
      description: 'Alert when user hourly cost exceeds threshold',
      enabled: true,
      conditions: {
        metric: 'costs.hourlyRate',
        operator: '>',
        threshold: 0.5, // $0.50/hour
        timeWindow: 5
      },
      actions: {
        email: ['admin@company.com'],
        autoOptimize: true
      },
      severity: 'high',
      cooldownMinutes: 60
    });

    // High error rate alert
    this.alertRules.set('high_error_rate', {
      id: 'high_error_rate',
      name: 'High Error Rate Alert',
      description: 'Alert when user error rate exceeds threshold',
      enabled: true,
      conditions: {
        metric: 'performance.errorRate',
        operator: '>',
        threshold: 0.05, // 5%
        timeWindow: 10
      },
      actions: {
        email: ['tech@company.com'],
        autoScale: true
      },
      severity: 'critical',
      cooldownMinutes: 30
    });

    // Low cost efficiency alert
    this.alertRules.set('low_cost_efficiency', {
      id: 'low_cost_efficiency',
      name: 'Low Cost Efficiency Alert',
      description: 'Alert when system cost efficiency drops below target',
      enabled: true,
      conditions: {
        metric: 'global.costEfficiency',
        operator: '<',
        threshold: 70, // 70% efficiency
        timeWindow: 15
      },
      actions: {
        webhook: 'https://hooks.slack.com/services/...',
        autoOptimize: true
      },
      severity: 'medium',
      cooldownMinutes: 120
    });

    this.logger.info('Alert rules initialized', { totalRules: this.alertRules.size });
  }

  private async checkAlerts(): Promise<void> {
    try {
      for (const rule of this.alertRules.values()) {
        if (!rule.enabled) continue;

        // Check cooldown
        if (this.isInCooldown(rule)) continue;

        const shouldTrigger = await this.evaluateAlertCondition(rule);
        
        if (shouldTrigger) {
          await this.triggerAlert(rule);
        }
      }
    } catch (error) {
      this.logger.error('Error checking alerts', { error });
    }
  }

  private isInCooldown(rule: AlertRule): boolean {
    const lastTriggered = this.activeAlerts.get(rule.id);
    if (!lastTriggered) return false;

    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    return (Date.now() - lastTriggered.getTime()) < cooldownMs;
  }

  private async evaluateAlertCondition(rule: AlertRule): Promise<boolean> {
    try {
      const metricPath = rule.conditions.metric;
      const operator = rule.conditions.operator;
      const threshold = rule.conditions.threshold;

      // Get metric value based on path
      let metricValue: number;

      if (metricPath.startsWith('global.') || metricPath.startsWith('pools.') || metricPath.startsWith('performance.') || metricPath.startsWith('costs.')) {
        // System-level metric
        metricValue = this.getNestedValue(this.systemMetrics, metricPath);
      } else {
        // User-level metric - check all users
        for (const userMetrics of this.userMetrics.values()) {
          const userValue = this.getNestedValue(userMetrics, metricPath);
          if (this.compareValues(userValue, operator, threshold)) {
            return true;
          }
        }
        return false;
      }

      return this.compareValues(metricValue, operator, threshold);

    } catch (error) {
      this.logger.error('Error evaluating alert condition', { rule: rule.id, error });
      return false;
    }
  }

  private getNestedValue(obj: any, path: string): number {
    return path.split('.').reduce((current, key) => current?.[key], obj) || 0;
  }

  private compareValues(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '>': return value > threshold;
      case '<': return value < threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      default: return false;
    }
  }

  private async triggerAlert(rule: AlertRule): Promise<void> {
    try {
      this.logger.warn('Alert triggered', { 
        ruleId: rule.id, 
        ruleName: rule.name,
        severity: rule.severity 
      });

      // Record alert trigger
      this.activeAlerts.set(rule.id, new Date());

      // Execute actions
      if (rule.actions.email) {
        await this.sendEmailAlert(rule);
      }

      if (rule.actions.webhook) {
        await this.sendWebhookAlert(rule);
      }

      if (rule.actions.autoOptimize) {
        await this.executeAutoOptimization(rule);
      }

      if (rule.actions.autoScale) {
        await this.executeAutoScaling(rule);
      }

      // Persist alert
      await this.persistAlert(rule);

      this.emit('alert:triggered', rule);

    } catch (error) {
      this.logger.error('Error triggering alert', { rule: rule.id, error });
    }
  }

  private async sendEmailAlert(rule: AlertRule): Promise<void> {
    this.logger.info('Would send email alert', { rule: rule.id, recipients: rule.actions.email });
    // Integration with email service would go here
  }

  private async sendWebhookAlert(rule: AlertRule): Promise<void> {
    this.logger.info('Would send webhook alert', { rule: rule.id, webhook: rule.actions.webhook });
    // Integration with webhook service would go here
  }

  private async executeAutoOptimization(rule: AlertRule): Promise<void> {
    this.logger.info('Executing auto-optimization due to alert', { rule: rule.id });
    try {
      await this.costOptimizer.optimizeAll();
    } catch (error) {
      this.logger.error('Error in auto-optimization', { rule: rule.id, error });
    }
  }

  private async executeAutoScaling(rule: AlertRule): Promise<void> {
    this.logger.info('Would execute auto-scaling due to alert', { rule: rule.id });
    // Integration with hybrid architecture auto-scaling would go here
  }

  // LIFECYCLE MANAGEMENT
  private async initializeRedis(): Promise<void> {
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
  }

  private initializeSystemMetrics(): void {
    this.systemMetrics = {
      timestamp: new Date(),
      global: {
        totalUsers: 0,
        activeUsers: 0,
        totalCost: 0,
        averageCostPerUser: 0,
        costEfficiency: 0,
        targetCostReduction: 80,
        actualCostReduction: 0
      },
      pools: {
        shared: { totalSlots: 0, activeSlots: 0, totalUsers: 0, utilization: 0, cost: 0 },
        semiDedicated: { totalSlots: 0, activeSlots: 0, totalUsers: 0, utilization: 0, cost: 0 },
        dedicated: { totalWorkers: 0, activeWorkers: 0, totalUsers: 0, cost: 0 }
      },
      performance: {
        totalMessagesPerSecond: 0,
        averageResponseTime: 0,
        globalErrorRate: 0,
        globalUptime: 100
      },
      costs: {
        totalHourlyCost: 0,
        totalDailyCost: 0,
        totalMonthlyCost: 0,
        costByTier: { standard: 0, professional: 0, enterprise: 0 },
        savingsVsBaseline: 0
      }
    };
  }

  private startUserMetricsCollection(): void {
    this.userMetricsInterval = setInterval(async () => {
      try {
        const allUsers = await this.getAllUsers();
        
        // Collect metrics for all users in batches
        const batchSize = 10;
        for (let i = 0; i < allUsers.length; i += batchSize) {
          const batch = allUsers.slice(i, i + batchSize);
          
          const promises = batch.map(userId => 
            this.collectUserMetrics(userId).catch(error => 
              this.logger.error('Error collecting metrics for user', { userId, error })
            )
          );

          await Promise.allSettled(promises);
        }
      } catch (error) {
        this.logger.error('Error in user metrics collection cycle', { error });
      }
    }, this.COLLECTION_INTERVALS.userMetrics);
  }

  private startSystemMetricsCollection(): void {
    this.systemMetricsInterval = setInterval(async () => {
      try {
        await this.collectSystemMetrics();
      } catch (error) {
        this.logger.error('Error in system metrics collection cycle', { error });
      }
    }, this.COLLECTION_INTERVALS.systemMetrics);
  }

  private startAlertMonitoring(): void {
    this.alertCheckInterval = setInterval(async () => {
      try {
        await this.checkAlerts();
      } catch (error) {
        this.logger.error('Error in alert monitoring cycle', { error });
      }
    }, this.COLLECTION_INTERVALS.alertCheck);
  }

  private startCleanupCycle(): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupOldData();
      } catch (error) {
        this.logger.error('Error in cleanup cycle', { error });
      }
    }, this.COLLECTION_INTERVALS.cleanup);
  }

  // PERSISTENCE
  private async persistUserMetrics(metrics: UserMetrics): Promise<void> {
    try {
      const docId = `${metrics.userId}_${metrics.timestamp.getTime()}`;
      await this.firebase.setDocument('user_metrics', docId, metrics);
    } catch (error) {
      this.logger.error('Error persisting user metrics', { userId: metrics.userId, error });
    }
  }

  private async persistSystemMetrics(metrics: SystemMetrics): Promise<void> {
    try {
      const docId = `system_${metrics.timestamp.getTime()}`;
      await this.firebase.setDocument('system_metrics', docId, metrics);
    } catch (error) {
      this.logger.error('Error persisting system metrics', { error });
    }
  }

  private async persistAlert(rule: AlertRule): Promise<void> {
    try {
      const alertRecord = {
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        triggeredAt: new Date(),
        conditions: rule.conditions,
        systemMetrics: this.systemMetrics
      };
      
      await this.firebase.collection('alerts').add(alertRecord);
    } catch (error) {
      this.logger.error('Error persisting alert', { rule: rule.id, error });
    }
  }

  private async loadHistoricalMetrics(): Promise<void> {
    try {
      // Load last 24 hours of system metrics
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const metrics = await this.firebase.collection('system_metrics')
        .where('timestamp', '>=', oneDayAgo)
        .orderBy('timestamp', 'asc')
        .get();

      this.historicalMetrics = metrics.docs.map(doc => doc.data() as SystemMetrics);
      
      this.logger.info('Loaded historical metrics', { count: this.historicalMetrics.length });
    } catch (error) {
      this.logger.error('Error loading historical metrics', { error });
    }
  }

  private async loadAlertRules(): Promise<void> {
    try {
      const rulesQuery = await this.firebase.getCollection('alert_rules').get();
      
      rulesQuery.docs.forEach((doc: any) => {
        const ruleData = doc.data();
        if (ruleData && doc.id) {
          this.alertRules.set(doc.id, ruleData as AlertRule);
        }
      });

      this.logger.info('Loaded alert rules', { count: this.alertRules.size });
    } catch (error) {
      this.logger.error('Error loading alert rules', { error });
    }
  }

  private async cleanupOldData(): Promise<void> {
    try {
      const retentionDate = new Date(Date.now() - this.RETENTION_PERIODS.userMetrics * 24 * 60 * 60 * 1000);

      // Cleanup old user metrics
      const oldUserMetrics = await this.firebase.collection('user_metrics')
        .where('timestamp', '<', retentionDate)
        .get();

      const deletePromises = oldUserMetrics.docs.map(doc => doc.ref.delete());
      await Promise.all(deletePromises);

      if (deletePromises.length > 0) {
        this.logger.info('Cleaned up old metrics', { deletedCount: deletePromises.length });
      }
    } catch (error) {
      this.logger.error('Error cleaning up old data', { error });
    }
  }

  // PUBLIC API
  public getUserMetrics(userId: string): UserMetrics | undefined {
    return this.userMetrics.get(userId);
  }

  public getSystemMetrics(): SystemMetrics {
    return { ...this.systemMetrics };
  }

  public getHistoricalMetrics(hours: number = 24): SystemMetrics[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.historicalMetrics.filter(m => m.timestamp > cutoff);
  }

  public async generateCostReport(userId?: string): Promise<any> {
    if (userId) {
      const userMetrics = this.getUserMetrics(userId);
      if (!userMetrics) {
        throw new Error('User metrics not found');
      }

      return {
        user: userId,
        currentCosts: userMetrics.costs,
        usage: userMetrics.usage,
        efficiency: {
          costPerMessage: userMetrics.usage.messagesProcessed > 0 ? 
            userMetrics.costs.dailyCost / userMetrics.usage.messagesProcessed : 0,
          resourceUtilization: userMetrics.resources.resourceUtilization
        },
        recommendations: this.costOptimizer.getUserAnalysis(userId)?.recommendations || []
      };
    }

    // System-wide report
    return {
      system: this.systemMetrics,
      totalSavings: this.systemMetrics.costs.savingsVsBaseline,
      costReductionAchieved: this.systemMetrics.global.actualCostReduction,
      topCostUsers: await this.getTopCostUsers(10),
      optimizationOpportunities: this.costOptimizer.getGlobalMetrics().optimizationOpportunities
    };
  }

  private async getTopCostUsers(limit: number): Promise<any[]> {
    const users = Array.from(this.userMetrics.values())
      .sort((a, b) => b.costs.hourlyRate - a.costs.hourlyRate)
      .slice(0, limit);

    return users.map(u => ({
      userId: u.userId,
      tier: u.tier,
      hourlyRate: u.costs.hourlyRate,
      monthlyCost: u.costs.monthlyCost,
      resourceUtilization: u.resources.resourceUtilization
    }));
  }

  public async addAlertRule(rule: AlertRule): Promise<void> {
    this.alertRules.set(rule.id, rule);
    await this.firebase.setDocument('alert_rules', rule.id, rule);
    this.logger.info('Alert rule added', { ruleId: rule.id });
  }

  public async removeAlertRule(ruleId: string): Promise<void> {
    this.alertRules.delete(ruleId);
    await this.firebase.deleteDocument('alert_rules', ruleId);
    this.logger.info('Alert rule removed', { ruleId });
  }

  public getActiveAlerts(): Array<{ruleId: string, triggeredAt: Date}> {
    return Array.from(this.activeAlerts.entries()).map(([ruleId, triggeredAt]) => ({
      ruleId,
      triggeredAt
    }));
  }

  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down metrics collector...');

    // Clear intervals
    if (this.userMetricsInterval) clearInterval(this.userMetricsInterval);
    if (this.systemMetricsInterval) clearInterval(this.systemMetricsInterval);
    if (this.alertCheckInterval) clearInterval(this.alertCheckInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);

    // Final data persistence
    await this.persistSystemMetrics(this.systemMetrics);
    for (const metrics of this.userMetrics.values()) {
      await this.persistUserMetrics(metrics);
    }

    // Close Redis connection
    if (this.redis) {
      await this.redis.quit();
    }

    this.isRunning = false;
    this.emit('collector:shutdown');
    this.logger.info('Metrics collector shutdown completed');
  }
}