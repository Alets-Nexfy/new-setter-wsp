import { LoggerService } from '@/core/services/LoggerService';
import { DatabaseService } from '@/core/services/DatabaseService';
import { CacheService } from '@/core/services/CacheService';
import { EventEmitter } from 'events';

export type UserTier = 'standard' | 'professional' | 'enterprise';

export interface TierConfiguration {
  tier: UserTier;
  pricing: {
    monthlyPrice: number;
    messagesIncluded: number;
    extraMessageCost: number;
    setupFee: number;
  };
  resources: {
    dedicatedWorker: boolean;
    maxConnections: number;
    memoryLimitMB: number;
    cpuCores: number;
    priority: 'low' | 'medium' | 'high';
    isolation: 'basic' | 'session-based' | 'complete';
  };
  features: {
    aiResponses: boolean;
    customAgents: number;
    promptGenerator: boolean;
    webhooks: boolean;
    analytics: boolean;
    apiAccess: boolean;
    prioritySupport: boolean;
    whiteLabel: boolean;
  };
  limits: {
    messagesPerMinute: number;
    concurrentChats: number;
    fileUploadSizeMB: number;
    customIntegrations: number;
    teamMembers: number;
  };
}

export interface UserTierInfo {
  userId: string;
  tier: UserTier;
  billingCycle: 'monthly' | 'yearly';
  subscriptionStart: Date;
  subscriptionEnd: Date;
  usage: {
    messagesThisMonth: number;
    connectionsActive: number;
    storageUsedMB: number;
    lastActivity: Date;
  };
  status: 'active' | 'suspended' | 'cancelled' | 'trial';
  trialEndsAt?: Date;
  paymentStatus: 'current' | 'overdue' | 'failed';
  configuration: TierConfiguration;
}

export class UserTierService extends EventEmitter {
  private logger: LoggerService;
  private firebase: DatabaseService;
  private cache: CacheService;
  private tierConfigurations: Map<UserTier, TierConfiguration>;
  private userTierCache: Map<string, UserTierInfo> = new Map();

  constructor() {
    super();
    this.logger = LoggerService.getInstance();
    this.firebase = DatabaseService.getInstance();
    this.cache = CacheService.getInstance();
    this.tierConfigurations = new Map();
    this.initializeTierConfigurations();
  }

  private initializeTierConfigurations(): void {
    // STANDARD TIER - Entry level for small businesses
    this.tierConfigurations.set('standard', {
      tier: 'standard',
      pricing: {
        monthlyPrice: 29,
        messagesIncluded: 1000,
        extraMessageCost: 0.01,
        setupFee: 0
      },
      resources: {
        dedicatedWorker: false,
        maxConnections: 3,
        memoryLimitMB: 50,
        cpuCores: 0.1,
        priority: 'low',
        isolation: 'basic'
      },
      features: {
        aiResponses: true,
        customAgents: 1,
        promptGenerator: true,
        webhooks: false,
        analytics: false,
        apiAccess: false,
        prioritySupport: false,
        whiteLabel: false
      },
      limits: {
        messagesPerMinute: 10,
        concurrentChats: 50,
        fileUploadSizeMB: 10,
        customIntegrations: 0,
        teamMembers: 1
      }
    });

    // PROFESSIONAL TIER - For growing businesses
    this.tierConfigurations.set('professional', {
      tier: 'professional',
      pricing: {
        monthlyPrice: 99,
        messagesIncluded: 5000,
        extraMessageCost: 0.008,
        setupFee: 0
      },
      resources: {
        dedicatedWorker: false,
        maxConnections: 10,
        memoryLimitMB: 100,
        cpuCores: 0.2,
        priority: 'medium',
        isolation: 'session-based'
      },
      features: {
        aiResponses: true,
        customAgents: 5,
        promptGenerator: true,
        webhooks: true,
        analytics: true,
        apiAccess: true,
        prioritySupport: false,
        whiteLabel: false
      },
      limits: {
        messagesPerMinute: 50,
        concurrentChats: 200,
        fileUploadSizeMB: 50,
        customIntegrations: 3,
        teamMembers: 5
      }
    });

    // ENTERPRISE TIER - For large organizations
    this.tierConfigurations.set('enterprise', {
      tier: 'enterprise',
      pricing: {
        monthlyPrice: 299,
        messagesIncluded: -1, // unlimited
        extraMessageCost: 0,
        setupFee: 99
      },
      resources: {
        dedicatedWorker: true,
        maxConnections: -1, // unlimited
        memoryLimitMB: 200,
        cpuCores: 0.5,
        priority: 'high',
        isolation: 'complete'
      },
      features: {
        aiResponses: true,
        customAgents: -1, // unlimited
        promptGenerator: true,
        webhooks: true,
        analytics: true,
        apiAccess: true,
        prioritySupport: true,
        whiteLabel: true
      },
      limits: {
        messagesPerMinute: -1, // unlimited
        concurrentChats: -1, // unlimited
        fileUploadSizeMB: 200,
        customIntegrations: -1, // unlimited
        teamMembers: -1 // unlimited
      }
    });

    this.logger.info('Tier configurations initialized', {
      tiers: Array.from(this.tierConfigurations.keys())
    });
  }

  public async getUserTier(userId: string): Promise<UserTierInfo> {
    try {
      // Check cache first
      if (this.userTierCache.has(userId)) {
        const cached = this.userTierCache.get(userId)!;
        if (this.isCacheValid(cached)) {
          return cached;
        }
      }

      // Fetch from database
      const userTierDoc = await this.firebase.getDocument(`user_tiers/${userId}`);
      
      if (!userTierDoc) {
        // New user - create default standard tier
        return await this.createDefaultTierForUser(userId);
      }

      const tierInfo = userTierDoc as UserTierInfo;
      tierInfo.configuration = this.tierConfigurations.get(tierInfo.tier)!;

      // Update cache
      this.userTierCache.set(userId, tierInfo);

      return tierInfo;

    } catch (error) {
      this.logger.error('Error getting user tier', { userId, error });
      throw error;
    }
  }

  public async upgradeTier(userId: string, newTier: UserTier): Promise<boolean> {
    try {
      const currentTierInfo = await this.getUserTier(userId);
      const newTierConfig = this.tierConfigurations.get(newTier);

      if (!newTierConfig) {
        throw new Error(`Invalid tier: ${newTier}`);
      }

      // Validate upgrade path
      if (!this.isValidUpgrade(currentTierInfo.tier, newTier)) {
        throw new Error(`Invalid upgrade from ${currentTierInfo.tier} to ${newTier}`);
      }

      // Calculate pro-rated billing
      const proRatedAmount = this.calculateProRatedBilling(currentTierInfo, newTierConfig);

      // Update tier in database
      const updatedTierInfo: UserTierInfo = {
        ...currentTierInfo,
        tier: newTier,
        configuration: newTierConfig,
        subscriptionStart: new Date(),
        subscriptionEnd: this.calculateSubscriptionEnd(currentTierInfo.billingCycle),
        status: 'active'
      };

      await this.firebase.setDocument(`user_tiers/${userId}`, updatedTierInfo);

      // Clear cache
      this.userTierCache.delete(userId);

      // Emit tier change event
      this.emit('tier:upgraded', {
        userId,
        oldTier: currentTierInfo.tier,
        newTier,
        proRatedAmount
      });

      this.logger.info('User tier upgraded', {
        userId,
        oldTier: currentTierInfo.tier,
        newTier,
        proRatedAmount
      });

      return true;

    } catch (error) {
      this.logger.error('Error upgrading user tier', { userId, newTier, error });
      throw error;
    }
  }

  public async downgradeTier(userId: string, newTier: UserTier): Promise<boolean> {
    try {
      const currentTierInfo = await this.getUserTier(userId);
      const newTierConfig = this.tierConfigurations.get(newTier);

      if (!newTierConfig) {
        throw new Error(`Invalid tier: ${newTier}`);
      }

      // Validate downgrade constraints
      await this.validateDowngradeConstraints(userId, currentTierInfo, newTierConfig);

      // Update tier in database
      const updatedTierInfo: UserTierInfo = {
        ...currentTierInfo,
        tier: newTier,
        configuration: newTierConfig,
        subscriptionStart: new Date(),
        subscriptionEnd: this.calculateSubscriptionEnd(currentTierInfo.billingCycle),
        status: 'active'
      };

      await this.firebase.setDocument(`user_tiers/${userId}`, updatedTierInfo);

      // Clear cache
      this.userTierCache.delete(userId);

      // Emit tier change event
      this.emit('tier:downgraded', {
        userId,
        oldTier: currentTierInfo.tier,
        newTier
      });

      this.logger.info('User tier downgraded', {
        userId,
        oldTier: currentTierInfo.tier,
        newTier
      });

      return true;

    } catch (error) {
      this.logger.error('Error downgrading user tier', { userId, newTier, error });
      throw error;
    }
  }

  public async updateUsage(userId: string, usage: Partial<UserTierInfo['usage']>): Promise<void> {
    try {
      const tierInfo = await this.getUserTier(userId);
      
      const updatedUsage = {
        ...tierInfo.usage,
        ...usage,
        lastActivity: new Date()
      };

      // Check limits
      await this.enforceUsageLimits(userId, tierInfo, updatedUsage);

      // Update in database
      await this.firebase.updateDocument(`user_tiers/${userId}`, {
        usage: updatedUsage
      });

      // Update cache
      if (this.userTierCache.has(userId)) {
        const cached = this.userTierCache.get(userId)!;
        cached.usage = updatedUsage;
      }

      // Check if approaching limits
      await this.checkUsageLimits(userId, tierInfo, updatedUsage);

    } catch (error) {
      this.logger.error('Error updating usage', { userId, usage, error });
      throw error;
    }
  }

  public async enforceResourceLimits(userId: string, resourceType: string, requestedAmount: number): Promise<boolean> {
    try {
      const tierInfo = await this.getUserTier(userId);
      const config = tierInfo.configuration;

      switch (resourceType) {
        case 'connections':
          if (config.resources.maxConnections !== -1 && requestedAmount > config.resources.maxConnections) {
            this.emit('limit:exceeded', { userId, resourceType, limit: config.resources.maxConnections, requested: requestedAmount });
            return false;
          }
          break;

        case 'messages_per_minute':
          if (config.limits.messagesPerMinute !== -1 && requestedAmount > config.limits.messagesPerMinute) {
            this.emit('limit:exceeded', { userId, resourceType, limit: config.limits.messagesPerMinute, requested: requestedAmount });
            return false;
          }
          break;

        case 'concurrent_chats':
          if (config.limits.concurrentChats !== -1 && requestedAmount > config.limits.concurrentChats) {
            this.emit('limit:exceeded', { userId, resourceType, limit: config.limits.concurrentChats, requested: requestedAmount });
            return false;
          }
          break;

        case 'file_upload':
          if (requestedAmount > config.limits.fileUploadSizeMB) {
            this.emit('limit:exceeded', { userId, resourceType, limit: config.limits.fileUploadSizeMB, requested: requestedAmount });
            return false;
          }
          break;

        default:
          this.logger.warn('Unknown resource type for limit enforcement', { userId, resourceType });
      }

      return true;

    } catch (error) {
      this.logger.error('Error enforcing resource limits', { userId, resourceType, error });
      return false;
    }
  }

  public getTierConfiguration(tier: UserTier): TierConfiguration | undefined {
    return this.tierConfigurations.get(tier);
  }

  public getAllTierConfigurations(): TierConfiguration[] {
    return Array.from(this.tierConfigurations.values());
  }

  public async calculateMonthlyCost(userId: string): Promise<number> {
    try {
      const tierInfo = await this.getUserTier(userId);
      const config = tierInfo.configuration;
      
      let totalCost = config.pricing.monthlyPrice;

      // Add extra message costs
      if (config.pricing.messagesIncluded !== -1) {
        const extraMessages = Math.max(0, tierInfo.usage.messagesThisMonth - config.pricing.messagesIncluded);
        totalCost += extraMessages * config.pricing.extraMessageCost;
      }

      return totalCost;

    } catch (error) {
      this.logger.error('Error calculating monthly cost', { userId, error });
      return 0;
    }
  }

  public async isFeatureEnabled(userId: string, feature: keyof TierConfiguration['features']): Promise<boolean> {
    try {
      const tierInfo = await this.getUserTier(userId);
      return tierInfo.configuration.features[feature] as boolean;
    } catch (error) {
      this.logger.error('Error checking feature availability', { userId, feature, error });
      return false;
    }
  }

  // Private helper methods
  private async createDefaultTierForUser(userId: string): Promise<UserTierInfo> {
    const defaultTier: UserTier = 'standard';
    const config = this.tierConfigurations.get(defaultTier)!;
    
    const tierInfo: UserTierInfo = {
      userId,
      tier: defaultTier,
      billingCycle: 'monthly',
      subscriptionStart: new Date(),
      subscriptionEnd: this.calculateSubscriptionEnd('monthly'),
      usage: {
        messagesThisMonth: 0,
        connectionsActive: 0,
        storageUsedMB: 0,
        lastActivity: new Date()
      },
      status: 'trial',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days trial
      paymentStatus: 'current',
      configuration: config
    };

    await this.firebase.setDocument(`user_tiers/${userId}`, tierInfo);
    this.userTierCache.set(userId, tierInfo);

    this.emit('tier:created', { userId, tier: defaultTier });

    return tierInfo;
  }

  private isCacheValid(cached: UserTierInfo): boolean {
    const cacheAge = Date.now() - cached.usage.lastActivity.getTime();
    return cacheAge < 5 * 60 * 1000; // 5 minutes cache
  }

  private isValidUpgrade(currentTier: UserTier, newTier: UserTier): boolean {
    const tierHierarchy = ['standard', 'professional', 'enterprise'];
    const currentIndex = tierHierarchy.indexOf(currentTier);
    const newIndex = tierHierarchy.indexOf(newTier);
    
    return newIndex > currentIndex;
  }

  private calculateProRatedBilling(currentTierInfo: UserTierInfo, newTierConfig: TierConfiguration): number {
    const daysRemaining = Math.ceil((currentTierInfo.subscriptionEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    const totalDays = currentTierInfo.billingCycle === 'yearly' ? 365 : 30;
    
    const currentMonthlyPrice = currentTierInfo.configuration.pricing.monthlyPrice;
    const newMonthlyPrice = newTierConfig.pricing.monthlyPrice;
    
    const refund = (currentMonthlyPrice / totalDays) * daysRemaining;
    const charge = (newMonthlyPrice / totalDays) * daysRemaining;
    
    return Math.max(0, charge - refund);
  }

  private calculateSubscriptionEnd(billingCycle: 'monthly' | 'yearly'): Date {
    const now = new Date();
    if (billingCycle === 'yearly') {
      return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    } else {
      return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    }
  }

  private async validateDowngradeConstraints(userId: string, currentTierInfo: UserTierInfo, newTierConfig: TierConfiguration): Promise<void> {
    // Check if user has more agents than allowed in new tier
    if (newTierConfig.features.customAgents !== -1) {
      const agentCount = await this.getUserAgentCount(userId);
      if (agentCount > newTierConfig.features.customAgents) {
        throw new Error(`Cannot downgrade: User has ${agentCount} agents, new tier allows ${newTierConfig.features.customAgents}`);
      }
    }

    // Check storage usage
    if (currentTierInfo.usage.storageUsedMB > newTierConfig.limits.fileUploadSizeMB) {
      throw new Error(`Cannot downgrade: Storage usage exceeds new tier limits`);
    }

    // Check active connections
    if (newTierConfig.resources.maxConnections !== -1 && currentTierInfo.usage.connectionsActive > newTierConfig.resources.maxConnections) {
      throw new Error(`Cannot downgrade: Too many active connections for new tier`);
    }
  }

  private async getUserAgentCount(userId: string): Promise<number> {
    try {
      const agents = await this.firebase.getCollectionWhere('agents', 'userId', '==', userId);
      return Object.keys(agents).length;
    } catch (error) {
      this.logger.error('Error getting user agent count', { userId, error });
      return 0;
    }
  }

  private async enforceUsageLimits(userId: string, tierInfo: UserTierInfo, updatedUsage: UserTierInfo['usage']): Promise<void> {
    const config = tierInfo.configuration;

    // Check message limits
    if (config.pricing.messagesIncluded !== -1 && updatedUsage.messagesThisMonth > config.pricing.messagesIncluded * 2) {
      throw new Error('Message limit severely exceeded - account suspended');
    }

    // Check storage limits
    if (updatedUsage.storageUsedMB > config.limits.fileUploadSizeMB * 1.5) {
      throw new Error('Storage limit exceeded');
    }
  }

  private async checkUsageLimits(userId: string, tierInfo: UserTierInfo, updatedUsage: UserTierInfo['usage']): Promise<void> {
    const config = tierInfo.configuration;

    // Check if approaching message limits (80%)
    if (config.pricing.messagesIncluded !== -1) {
      const usagePercentage = (updatedUsage.messagesThisMonth / config.pricing.messagesIncluded) * 100;
      
      if (usagePercentage >= 80) {
        this.emit('usage:warning', {
          userId,
          type: 'messages',
          percentage: usagePercentage,
          limit: config.pricing.messagesIncluded,
          current: updatedUsage.messagesThisMonth
        });
      }
    }

    // Check storage usage (90%)
    const storagePercentage = (updatedUsage.storageUsedMB / config.limits.fileUploadSizeMB) * 100;
    if (storagePercentage >= 90) {
      this.emit('usage:warning', {
        userId,
        type: 'storage',
        percentage: storagePercentage,
        limit: config.limits.fileUploadSizeMB,
        current: updatedUsage.storageUsedMB
      });
    }
  }

  public async getUsersApproachingLimits(): Promise<Array<{userId: string, tier: UserTier, warnings: string[]}>> {
    try {
      const users = await this.firebase.getCollection('user_tiers');
      const warnings: Array<{userId: string, tier: UserTier, warnings: string[]}> = [];

      for (const [userId, tierData] of Object.entries(users)) {
        const tierInfo = tierData as UserTierInfo;
        const userWarnings: string[] = [];

        // Check message usage
        if (tierInfo.configuration.pricing.messagesIncluded !== -1) {
          const messageUsage = (tierInfo.usage.messagesThisMonth / tierInfo.configuration.pricing.messagesIncluded) * 100;
          if (messageUsage >= 80) {
            userWarnings.push(`Message usage: ${messageUsage.toFixed(1)}%`);
          }
        }

        // Check storage usage
        const storageUsage = (tierInfo.usage.storageUsedMB / tierInfo.configuration.limits.fileUploadSizeMB) * 100;
        if (storageUsage >= 80) {
          userWarnings.push(`Storage usage: ${storageUsage.toFixed(1)}%`);
        }

        if (userWarnings.length > 0) {
          warnings.push({
            userId,
            tier: tierInfo.tier,
            warnings: userWarnings
          });
        }
      }

      return warnings;

    } catch (error) {
      this.logger.error('Error getting users approaching limits', { error });
      return [];
    }
  }
}