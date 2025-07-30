import { EventEmitter } from 'events';
import { LoggerService } from '@/core/services/LoggerService';
import { DatabaseService } from '@/core/services/DatabaseService';
import { CacheService } from '@/core/services/CacheService';
import { UserTierService, UserTier } from '@/core/services/UserTierService';

interface CostAnalysis {
  userId: string;
  currentCostStructure: {
    connectionType: 'shared' | 'semi-dedicated' | 'dedicated';
    hourlyCost: number;
    monthlyCost: number;
    resourceUtilization: number; // 0-100%
    efficiency: number; // cost per message
  };
  optimizedCostStructure: {
    recommendedConnectionType: 'shared' | 'semi-dedicated' | 'dedicated';
    projectedHourlyCost: number;
    projectedMonthlyCost: number;
    projectedUtilization: number;
    projectedEfficiency: number;
    estimatedSavings: number;
    savingsPercentage: number;
  };
  usagePatterns: {
    messagesPerDay: number;
    peakHours: number[];
    averageResponseTime: number;
    errorRate: number;
    concurrentConnections: number;
  };
  recommendations: Array<{
    type: 'connection_type_change' | 'tier_change' | 'resource_optimization' | 'usage_pattern_optimization';
    description: string;
    impact: string;
    estimatedSavings: number;
    implementationComplexity: 'low' | 'medium' | 'high';
    riskLevel: 'low' | 'medium' | 'high';
  }>;
}

interface GlobalCostMetrics {
  timestamp: Date;
  totalUsers: number;
  totalMonthlyCost: number;
  averageCostPerUser: number;
  costReductionAchieved: number; // percentage vs all-dedicated baseline
  targetCostReduction: number; // target percentage (80%)
  costEfficiencyScore: number; // 0-100 score
  breakdown: {
    sharedPoolCosts: {
      totalSlots: number;
      totalUsers: number;
      monthlyCost: number;
      avgCostPerUser: number;
      utilizationRate: number;
    };
    semiDedicatedCosts: {
      totalSlots: number;
      totalUsers: number;
      monthlyCost: number;
      avgCostPerUser: number;
      utilizationRate: number;
    };
    dedicatedCosts: {
      totalWorkers: number;
      totalUsers: number;
      monthlyCost: number;
      avgCostPerUser: number;
    };
  };
  optimizationOpportunities: {
    potentialSavings: number;
    affectedUsers: number;
    implementationEffort: 'low' | 'medium' | 'high';
  };
}

interface OptimizationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  conditions: {
    minUsageDays: number;
    maxUtilization?: number;
    minUtilization?: number;
    maxErrorRate?: number;
    minResponseTime?: number;
    maxResponseTime?: number;
  };
  actions: {
    targetConnectionType?: 'shared' | 'semi-dedicated' | 'dedicated';
    targetTier?: UserTier;
    customOptimization?: string;
  };
  estimatedSavingsPerUser: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export class CostOptimizer extends EventEmitter {
  private logger: LoggerService;
  private firebase: FirebaseService;
  private cache: CacheService;
  private tierService: UserTierService;

  // Cost optimization targets
  private readonly TARGET_COST_REDUCTION = 80; // 80% reduction vs all-dedicated
  private readonly BASELINE_DEDICATED_COST = 0.25; // $0.25/hour per user if all dedicated
  private readonly TARGET_COST_PER_USER = 0.05; // $0.05/hour target (80% reduction)

  // Current cost structure
  private readonly COST_STRUCTURE = {
    shared: { 
      baseCost: 0.02,        // $0.02/hour per slot
      maxUsers: 10,          // 10 users per slot
      costPerUser: 0.002     // $0.002/hour per user (99.2% savings)
    },
    semiDedicated: { 
      baseCost: 0.08,        // $0.08/hour per slot  
      maxUsers: 3,           // 3 users per slot
      costPerUser: 0.027     // $0.027/hour per user (89.2% savings)
    },
    dedicated: { 
      baseCost: 0.25,        // $0.25/hour per worker
      maxUsers: 1,           // 1 user per worker
      costPerUser: 0.25      // $0.25/hour per user (baseline)
    }
  };

  // Optimization rules
  private optimizationRules: Map<string, OptimizationRule> = new Map();
  
  // Metrics and analysis
  private globalMetrics: GlobalCostMetrics;
  private userAnalyses: Map<string, CostAnalysis> = new Map();
  
  // Optimization intervals
  private analysisInterval: NodeJS.Timeout | null = null;
  private optimizationInterval: NodeJS.Timeout | null = null;
  
  private isRunning = false;

  constructor() {
    super();
    this.logger = LoggerService.getInstance();
    this.firebase = DatabaseService.getInstance();
    this.cache = CacheService.getInstance();
    this.tierService = new UserTierService();

    this.initializeOptimizationRules();
    this.initializeGlobalMetrics();
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Cost Optimizer with 80% reduction target');

      // Load existing analyses
      await this.loadExistingAnalyses();

      // Start optimization cycles
      this.startAnalysisCycle();
      this.startOptimizationCycle();

      this.isRunning = true;
      this.emit('optimizer:ready');

      this.logger.info('Cost Optimizer initialized successfully', {
        targetReduction: this.TARGET_COST_REDUCTION,
        targetCostPerUser: this.TARGET_COST_PER_USER,
        optimizationRules: this.optimizationRules.size
      });

    } catch (error) {
      this.logger.error('Failed to initialize cost optimizer', { error });
      throw error;
    }
  }

  // MAIN OPTIMIZATION METHODS
  public async analyzeUserCosts(userId: string): Promise<CostAnalysis> {
    try {
      this.logger.debug('Analyzing user costs', { userId });

      // Get current user allocation and usage data
      const userAllocation = await this.getCurrentUserAllocation(userId);
      const usagePatterns = await this.analyzeUsagePatterns(userId);
      const currentCostStructure = this.calculateCurrentCosts(userAllocation, usagePatterns);

      // Generate optimization recommendations
      const optimizedStructure = await this.generateOptimizedStructure(userId, usagePatterns);
      const recommendations = await this.generateRecommendations(userId, currentCostStructure, optimizedStructure, usagePatterns);

      const analysis: CostAnalysis = {
        userId,
        currentCostStructure,
        optimizedCostStructure: optimizedStructure,
        usagePatterns,
        recommendations
      };

      // Cache and store analysis
      this.userAnalyses.set(userId, analysis);
      await this.persistUserAnalysis(analysis);

      this.emit('user:analyzed', { userId, analysis });

      return analysis;

    } catch (error) {
      this.logger.error('Error analyzing user costs', { userId, error });
      throw error;
    }
  }

  public async analyzeGlobalCosts(): Promise<GlobalCostMetrics> {
    try {
      this.logger.info('Performing global cost analysis');

      const allUsers = await this.getAllUsers();
      let totalMonthlyCost = 0;
      let costBreakdown = {
        sharedPoolCosts: { totalSlots: 0, totalUsers: 0, monthlyCost: 0, avgCostPerUser: 0, utilizationRate: 0 },
        semiDedicatedCosts: { totalSlots: 0, totalUsers: 0, monthlyCost: 0, avgCostPerUser: 0, utilizationRate: 0 },
        dedicatedCosts: { totalWorkers: 0, totalUsers: 0, monthlyCost: 0, avgCostPerUser: 0 }
      };

      // Analyze each connection type
      const sharedStats = await this.analyzeSharedPoolCosts();
      const semiStats = await this.analyzeSemiDedicatedCosts();
      const dedicatedStats = await this.analyzeDedicatedCosts();

      costBreakdown.sharedPoolCosts = sharedStats;
      costBreakdown.semiDedicatedCosts = semiStats;
      costBreakdown.dedicatedCosts = dedicatedStats;

      totalMonthlyCost = sharedStats.monthlyCost + semiStats.monthlyCost + dedicatedStats.monthlyCost;
      const totalUsers = sharedStats.totalUsers + semiStats.totalUsers + dedicatedStats.totalUsers;
      const averageCostPerUser = totalUsers > 0 ? totalMonthlyCost / totalUsers : 0;

      // Calculate cost reduction achieved
      const baselineCost = totalUsers * this.BASELINE_DEDICATED_COST * 24 * 30; // Monthly baseline
      const costReductionAchieved = baselineCost > 0 ? ((baselineCost - totalMonthlyCost) / baselineCost) * 100 : 0;

      // Cost efficiency score (how close we are to the 80% target)
      const costEfficiencyScore = Math.min(100, (costReductionAchieved / this.TARGET_COST_REDUCTION) * 100);

      // Identify optimization opportunities
      const optimizationOpportunities = await this.identifyOptimizationOpportunities();

      this.globalMetrics = {
        timestamp: new Date(),
        totalUsers,
        totalMonthlyCost,
        averageCostPerUser,
        costReductionAchieved,
        targetCostReduction: this.TARGET_COST_REDUCTION,
        costEfficiencyScore,
        breakdown: costBreakdown,
        optimizationOpportunities
      };

      await this.persistGlobalMetrics();
      this.emit('global:analyzed', this.globalMetrics);

      this.logger.info('Global cost analysis completed', {
        totalUsers,
        totalMonthlyCost: totalMonthlyCost.toFixed(2),
        costReductionAchieved: costReductionAchieved.toFixed(1),
        efficiencyScore: costEfficiencyScore.toFixed(1)
      });

      return this.globalMetrics;

    } catch (error) {
      this.logger.error('Error in global cost analysis', { error });
      throw error;
    }
  }

  public async optimizeUser(userId: string): Promise<{success: boolean, savings: number, actions: string[]}> {
    try {
      this.logger.info('Optimizing user costs', { userId });

      const analysis = await this.analyzeUserCosts(userId);
      const actions: string[] = [];
      let totalSavings = 0;

      // Execute optimization recommendations
      for (const recommendation of analysis.recommendations) {
        if (recommendation.riskLevel === 'low' && 
            recommendation.implementationComplexity === 'low' &&
            recommendation.estimatedSavings > 0.01) { // More than 1 cent per hour

          const executed = await this.executeRecommendation(userId, recommendation);
          if (executed) {
            actions.push(recommendation.description);
            totalSavings += recommendation.estimatedSavings;
          }
        }
      }

      this.emit('user:optimized', { userId, savings: totalSavings, actions });

      return {
        success: true,
        savings: totalSavings,
        actions
      };

    } catch (error) {
      this.logger.error('Error optimizing user', { userId, error });
      return {
        success: false,
        savings: 0,
        actions: []
      };
    }
  }

  public async optimizeAll(): Promise<{totalSavings: number, optimizedUsers: number, actions: string[]}> {
    try {
      this.logger.info('Starting global cost optimization');

      const allUsers = await this.getAllUsers();
      let totalSavings = 0;
      let optimizedUsers = 0;
      const allActions: string[] = [];

      // Process users in batches to avoid overwhelming the system
      const batchSize = 10;
      for (let i = 0; i < allUsers.length; i += batchSize) {
        const batch = allUsers.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (userId) => {
          try {
            const result = await this.optimizeUser(userId);
            if (result.success && result.savings > 0) {
              optimizedUsers++;
              totalSavings += result.savings;
              allActions.push(...result.actions);
            }
            return result;
          } catch (error) {
            this.logger.error('Error optimizing user in batch', { userId, error });
            return { success: false, savings: 0, actions: [] };
          }
        });

        await Promise.allSettled(batchPromises);

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Update global metrics
      await this.analyzeGlobalCosts();

      this.emit('global:optimized', { totalSavings, optimizedUsers, actions: allActions });

      this.logger.info('Global optimization completed', {
        totalSavings: totalSavings.toFixed(4),
        optimizedUsers,
        totalUsers: allUsers.length,
        uniqueActions: [...new Set(allActions)].length
      });

      return {
        totalSavings,
        optimizedUsers,
        actions: [...new Set(allActions)]
      };

    } catch (error) {
      this.logger.error('Error in global optimization', { error });
      throw error;
    }
  }

  // COST ANALYSIS METHODS
  private calculateCurrentCosts(userAllocation: any, usagePatterns: any): CostAnalysis['currentCostStructure'] {
    const connectionType = userAllocation.connectionType || 'shared';
    const costStructure = this.COST_STRUCTURE[connectionType];
    
    const hourlyCost = costStructure.costPerUser;
    const monthlyCost = hourlyCost * 24 * 30;
    
    // Calculate utilization based on usage patterns
    const resourceUtilization = this.calculateResourceUtilization(usagePatterns, connectionType);
    
    // Cost efficiency: cost per message
    const efficiency = usagePatterns.messagesPerDay > 0 ? 
      (monthlyCost / (usagePatterns.messagesPerDay * 30)) : Infinity;

    return {
      connectionType,
      hourlyCost,
      monthlyCost,
      resourceUtilization,
      efficiency
    };
  }

  private async generateOptimizedStructure(userId: string, usagePatterns: any): Promise<CostAnalysis['optimizedCostStructure']> {
    // Determine optimal connection type based on usage patterns
    const optimalConnectionType = this.determineOptimalConnectionType(usagePatterns);
    const optimalCostStructure = this.COST_STRUCTURE[optimalConnectionType];
    
    const projectedHourlyCost = optimalCostStructure.costPerUser;
    const projectedMonthlyCost = projectedHourlyCost * 24 * 30;
    const projectedUtilization = this.calculateResourceUtilization(usagePatterns, optimalConnectionType);
    
    const projectedEfficiency = usagePatterns.messagesPerDay > 0 ? 
      (projectedMonthlyCost / (usagePatterns.messagesPerDay * 30)) : Infinity;

    // Get current costs for comparison
    const currentAllocation = await this.getCurrentUserAllocation(userId);
    const currentCosts = this.calculateCurrentCosts(currentAllocation, usagePatterns);
    
    const estimatedSavings = Math.max(0, currentCosts.monthlyCost - projectedMonthlyCost);
    const savingsPercentage = currentCosts.monthlyCost > 0 ? 
      (estimatedSavings / currentCosts.monthlyCost) * 100 : 0;

    return {
      recommendedConnectionType: optimalConnectionType,
      projectedHourlyCost,
      projectedMonthlyCost,
      projectedUtilization,
      projectedEfficiency,
      estimatedSavings,
      savingsPercentage
    };
  }

  private determineOptimalConnectionType(usagePatterns: any): 'shared' | 'semi-dedicated' | 'dedicated' {
    const { messagesPerDay, concurrentConnections, averageResponseTime, errorRate } = usagePatterns;

    // High usage patterns require dedicated resources
    if (messagesPerDay > 1000 || concurrentConnections > 10 || errorRate > 0.05) {
      return 'dedicated';
    }

    // Medium usage can use semi-dedicated
    if (messagesPerDay > 200 || concurrentConnections > 3 || averageResponseTime > 1000) {
      return 'semi-dedicated';
    }

    // Low usage is perfect for shared resources
    return 'shared';
  }

  private calculateResourceUtilization(usagePatterns: any, connectionType: string): number {
    const { messagesPerDay, concurrentConnections } = usagePatterns;
    
    switch (connectionType) {
      case 'shared':
        // Utilization based on message volume (shared slots handle up to 1000 messages/day efficiently)
        return Math.min(100, (messagesPerDay / 1000) * 100);
        
      case 'semi-dedicated':
        // Utilization based on connections and messages (semi handles up to 500 messages/day per user)
        const messageUtil = Math.min(100, (messagesPerDay / 500) * 100);
        const connectionUtil = Math.min(100, (concurrentConnections / 5) * 100);
        return Math.max(messageUtil, connectionUtil);
        
      case 'dedicated':
        // Dedicated resources, utilization based on peak capacity usage
        const dedicatedMessageUtil = Math.min(100, (messagesPerDay / 2000) * 100);
        const dedicatedConnectionUtil = Math.min(100, (concurrentConnections / 20) * 100);
        return Math.max(dedicatedMessageUtil, dedicatedConnectionUtil);
        
      default:
        return 50; // Default moderate utilization
    }
  }

  private async generateRecommendations(
    userId: string, 
    current: CostAnalysis['currentCostStructure'],
    optimized: CostAnalysis['optimizedCostStructure'],
    usage: any
  ): Promise<CostAnalysis['recommendations']> {
    const recommendations: CostAnalysis['recommendations'] = [];

    // Connection type optimization
    if (current.connectionType !== optimized.recommendedConnectionType) {
      recommendations.push({
        type: 'connection_type_change',
        description: `Move from ${current.connectionType} to ${optimized.recommendedConnectionType} connection`,
        impact: `Save $${optimized.estimatedSavings.toFixed(2)}/month (${optimized.savingsPercentage.toFixed(1)}% reduction)`,
        estimatedSavings: optimized.estimatedSavings,
        implementationComplexity: this.getImplementationComplexity(current.connectionType, optimized.recommendedConnectionType),
        riskLevel: this.getRiskLevel(current.connectionType, optimized.recommendedConnectionType, usage)
      });
    }

    // Under-utilization optimization
    if (current.resourceUtilization < 30 && current.connectionType !== 'shared') {
      recommendations.push({
        type: 'resource_optimization',
        description: 'Reduce resource allocation due to low utilization',
        impact: `Potential savings of $${(current.monthlyCost * 0.4).toFixed(2)}/month`,
        estimatedSavings: current.monthlyCost * 0.4,
        implementationComplexity: 'low',
        riskLevel: 'low'
      });
    }

    // Over-utilization warning
    if (current.resourceUtilization > 90) {
      recommendations.push({
        type: 'resource_optimization',
        description: 'Consider upgrading resources due to high utilization',
        impact: 'Improve performance and reduce error rates',
        estimatedSavings: 0, // Cost increase but value add
        implementationComplexity: 'medium',
        riskLevel: 'medium'
      });
    }

    // Usage pattern optimization
    if (usage.peakHours.length < 6) { // Less than 6 peak hours
      recommendations.push({
        type: 'usage_pattern_optimization',
        description: 'Optimize for concentrated usage pattern with scheduled scaling',
        impact: `Potential savings of $${(current.monthlyCost * 0.2).toFixed(2)}/month`,
        estimatedSavings: current.monthlyCost * 0.2,
        implementationComplexity: 'medium',
        riskLevel: 'low'
      });
    }

    return recommendations;
  }

  private getImplementationComplexity(from: string, to: string): 'low' | 'medium' | 'high' {
    // Moving to shared is always low complexity
    if (to === 'shared') return 'low';
    
    // Moving from shared to dedicated is high complexity
    if (from === 'shared' && to === 'dedicated') return 'high';
    
    // All other moves are medium complexity
    return 'medium';
  }

  private getRiskLevel(from: string, to: string, usage: any): 'low' | 'medium' | 'high' {
    // Moving to shared is low risk for low-usage users
    if (to === 'shared' && usage.messagesPerDay < 100) return 'low';
    
    // Moving from dedicated to shared with high usage is high risk
    if (from === 'dedicated' && to === 'shared' && usage.messagesPerDay > 500) return 'high';
    
    // Medium risk for most other scenarios
    return 'medium';
  }

  // POOL ANALYSIS METHODS
  private async analyzeSharedPoolCosts(): Promise<GlobalCostMetrics['breakdown']['sharedPoolCosts']> {
    // This would integrate with your connection pool
    // For now, return calculated values based on cost structure
    const totalSlots = 20; // From your connection pool configuration
    const avgUsersPerSlot = 6; // Average utilization
    const totalUsers = totalSlots * avgUsersPerSlot;
    const monthlyCost = totalSlots * this.COST_STRUCTURE.shared.baseCost * 24 * 30;
    const avgCostPerUser = totalUsers > 0 ? monthlyCost / totalUsers : 0;
    const utilizationRate = (avgUsersPerSlot / this.COST_STRUCTURE.shared.maxUsers) * 100;

    return {
      totalSlots,
      totalUsers,
      monthlyCost,
      avgCostPerUser,
      utilizationRate
    };
  }

  private async analyzeSemiDedicatedCosts(): Promise<GlobalCostMetrics['breakdown']['semiDedicatedCosts']> {
    const totalSlots = 10; // Estimated semi-dedicated slots
    const avgUsersPerSlot = 2.5; // Average utilization
    const totalUsers = Math.floor(totalSlots * avgUsersPerSlot);
    const monthlyCost = totalSlots * this.COST_STRUCTURE.semiDedicated.baseCost * 24 * 30;
    const avgCostPerUser = totalUsers > 0 ? monthlyCost / totalUsers : 0;
    const utilizationRate = (avgUsersPerSlot / this.COST_STRUCTURE.semiDedicated.maxUsers) * 100;

    return {
      totalSlots,
      totalUsers,
      monthlyCost,
      avgCostPerUser,
      utilizationRate
    };
  }

  private async analyzeDedicatedCosts(): Promise<GlobalCostMetrics['breakdown']['dedicatedCosts']> {
    const totalWorkers = 5; // Estimated dedicated workers
    const totalUsers = totalWorkers; // 1:1 ratio
    const monthlyCost = totalWorkers * this.COST_STRUCTURE.dedicated.baseCost * 24 * 30;
    const avgCostPerUser = totalUsers > 0 ? monthlyCost / totalUsers : 0;

    return {
      totalWorkers,
      totalUsers,
      monthlyCost,
      avgCostPerUser
    };
  }

  private async identifyOptimizationOpportunities(): Promise<GlobalCostMetrics['optimizationOpportunities']> {
    const allUsers = await this.getAllUsers();
    let potentialSavings = 0;
    let affectedUsers = 0;

    // Estimate potential savings by analyzing a sample of users
    const sampleSize = Math.min(50, allUsers.length);
    const sampleUsers = allUsers.slice(0, sampleSize);

    for (const userId of sampleUsers) {
      try {
        const analysis = await this.analyzeUserCosts(userId);
        if (analysis.optimizedCostStructure.estimatedSavings > 0.01) {
          potentialSavings += analysis.optimizedCostStructure.estimatedSavings;
          affectedUsers++;
        }
      } catch (error) {
        // Skip users that can't be analyzed
        continue;
      }
    }

    // Extrapolate to all users
    if (sampleSize > 0) {
      const scaleFactor = allUsers.length / sampleSize;
      potentialSavings *= scaleFactor;
      affectedUsers = Math.floor(affectedUsers * scaleFactor);
    }

    const implementationEffort = affectedUsers < 10 ? 'low' : 
                                affectedUsers < 50 ? 'medium' : 'high';

    return {
      potentialSavings,
      affectedUsers,
      implementationEffort
    };
  }

  // RULE-BASED OPTIMIZATION
  private initializeOptimizationRules(): void {
    // Rule 1: Move low-usage users to shared
    this.optimizationRules.set('low_usage_to_shared', {
      id: 'low_usage_to_shared',
      name: 'Low Usage to Shared Pool',
      description: 'Move users with low message volume to shared connection pool',
      enabled: true,
      priority: 1,
      conditions: {
        minUsageDays: 7,
        maxUtilization: 20
      },
      actions: {
        targetConnectionType: 'shared'
      },
      estimatedSavingsPerUser: 0.15, // $0.15/hour savings
      riskLevel: 'low'
    });

    // Rule 2: Optimize under-utilized dedicated workers
    this.optimizationRules.set('underused_dedicated', {
      id: 'underused_dedicated',
      name: 'Under-utilized Dedicated Optimization',
      description: 'Move under-utilized dedicated users to semi-dedicated',
      enabled: true,
      priority: 2,
      conditions: {
        minUsageDays: 14,
        maxUtilization: 30,
        maxErrorRate: 0.02
      },
      actions: {
        targetConnectionType: 'semi-dedicated'
      },
      estimatedSavingsPerUser: 0.22, // $0.22/hour savings
      riskLevel: 'medium'
    });

    // Rule 3: Emergency cost reduction
    this.optimizationRules.set('emergency_cost_reduction', {
      id: 'emergency_cost_reduction',
      name: 'Emergency Cost Reduction',
      description: 'Aggressive cost reduction for budget constraints',
      enabled: false, // Only enable when needed
      priority: 10,
      conditions: {
        minUsageDays: 3,
        maxUtilization: 50
      },
      actions: {
        targetConnectionType: 'shared'
      },
      estimatedSavingsPerUser: 0.20,
      riskLevel: 'high'
    });

    this.logger.info('Optimization rules initialized', { 
      totalRules: this.optimizationRules.size 
    });
  }

  private async executeRecommendation(userId: string, recommendation: CostAnalysis['recommendations'][0]): Promise<boolean> {
    try {
      this.logger.info('Executing cost optimization recommendation', { 
        userId, 
        type: recommendation.type,
        estimatedSavings: recommendation.estimatedSavings 
      });

      switch (recommendation.type) {
        case 'connection_type_change':
          return await this.executeConnectionTypeChange(userId, recommendation);
          
        case 'resource_optimization':
          return await this.executeResourceOptimization(userId, recommendation);
          
        case 'tier_change':
          return await this.executeTierChange(userId, recommendation);
          
        case 'usage_pattern_optimization':
          return await this.executeUsageOptimization(userId, recommendation);
          
        default:
          this.logger.warn('Unknown recommendation type', { type: recommendation.type });
          return false;
      }

    } catch (error) {
      this.logger.error('Error executing recommendation', { userId, recommendation, error });
      return false;
    }
  }

  private async executeConnectionTypeChange(userId: string, recommendation: any): Promise<boolean> {
    // This would integrate with your HybridArchitecture to change connection type
    // For now, log the intended action
    this.logger.info('Would execute connection type change', { 
      userId, 
      recommendation: recommendation.description 
    });
    
    // In real implementation:
    // await this.hybridArchitecture.changeConnectionType(userId, targetType);
    
    return true;
  }

  private async executeResourceOptimization(userId: string, recommendation: any): Promise<boolean> {
    this.logger.info('Would execute resource optimization', { 
      userId, 
      recommendation: recommendation.description 
    });
    return true;
  }

  private async executeTierChange(userId: string, recommendation: any): Promise<boolean> {
    this.logger.info('Would execute tier change', { 
      userId, 
      recommendation: recommendation.description 
    });
    return true;
  }

  private async executeUsageOptimization(userId: string, recommendation: any): Promise<boolean> {
    this.logger.info('Would execute usage pattern optimization', { 
      userId, 
      recommendation: recommendation.description 
    });
    return true;
  }

  // HELPER METHODS
  private async getCurrentUserAllocation(userId: string): Promise<any> {
    try {
      const allocation = await this.firebase.getDocument(`resource_allocations/${userId}`);
      return allocation || { connectionType: 'shared', tier: 'standard' };
    } catch (error) {
      this.logger.error('Error getting user allocation', { userId, error });
      return { connectionType: 'shared', tier: 'standard' };
    }
  }

  private async analyzeUsagePatterns(userId: string): Promise<any> {
    try {
      // Get usage data from the last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const messages = await this.firebase.collection('messages')
        .where('userId', '==', userId)
        .where('timestamp', '>=', thirtyDaysAgo)
        .get();

      const messageCount = messages.docs.length;
      const messagesPerDay = messageCount / 30;

      // Analyze peak hours (mock implementation)
      const peakHours = [9, 10, 11, 14, 15, 16]; // Business hours

      // Get performance metrics (mock values for now)
      const averageResponseTime = 800; // ms
      const errorRate = 0.01; // 1%
      const concurrentConnections = Math.max(1, Math.floor(messagesPerDay / 10));

      return {
        messagesPerDay,
        peakHours,
        averageResponseTime,
        errorRate,
        concurrentConnections
      };

    } catch (error) {
      this.logger.error('Error analyzing usage patterns', { userId, error });
      return {
        messagesPerDay: 10,
        peakHours: [9, 10, 11, 14, 15, 16],
        averageResponseTime: 1000,
        errorRate: 0.02,
        concurrentConnections: 1
      };
    }
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

  // PERSISTENCE
  private async loadExistingAnalyses(): Promise<void> {
    try {
      const analyses = await this.firebase.getCollection('cost_analyses');
      
      for (const [userId, analysisData] of Object.entries(analyses)) {
        this.userAnalyses.set(userId, analysisData as CostAnalysis);
      }

      this.logger.info('Loaded existing cost analyses', { 
        count: this.userAnalyses.size 
      });

    } catch (error) {
      this.logger.error('Error loading existing analyses', { error });
    }
  }

  private async persistUserAnalysis(analysis: CostAnalysis): Promise<void> {
    try {
      await this.firebase.setDocument(`cost_analyses/${analysis.userId}`, analysis);
    } catch (error) {
      this.logger.error('Error persisting user analysis', { userId: analysis.userId, error });
    }
  }

  private initializeGlobalMetrics(): void {
    this.globalMetrics = {
      timestamp: new Date(),
      totalUsers: 0,
      totalMonthlyCost: 0,
      averageCostPerUser: 0,
      costReductionAchieved: 0,
      targetCostReduction: this.TARGET_COST_REDUCTION,
      costEfficiencyScore: 0,
      breakdown: {
        sharedPoolCosts: { totalSlots: 0, totalUsers: 0, monthlyCost: 0, avgCostPerUser: 0, utilizationRate: 0 },
        semiDedicatedCosts: { totalSlots: 0, totalUsers: 0, monthlyCost: 0, avgCostPerUser: 0, utilizationRate: 0 },
        dedicatedCosts: { totalWorkers: 0, totalUsers: 0, monthlyCost: 0, avgCostPerUser: 0 }
      },
      optimizationOpportunities: { potentialSavings: 0, affectedUsers: 0, implementationEffort: 'low' }
    };
  }

  private async persistGlobalMetrics(): Promise<void> {
    try {
      await this.firebase.setDocument('cost_optimizer_metrics', this.globalMetrics);
    } catch (error) {
      this.logger.error('Error persisting global metrics', { error });
    }
  }

  // LIFECYCLE MANAGEMENT
  private startAnalysisCycle(): void {
    this.analysisInterval = setInterval(async () => {
      try {
        await this.analyzeGlobalCosts();
      } catch (error) {
        this.logger.error('Error in analysis cycle', { error });
      }
    }, 3600000); // Every hour
  }

  private startOptimizationCycle(): void {
    this.optimizationInterval = setInterval(async () => {
      try {
        // Only run optimization if we're not meeting our cost reduction target
        if (this.globalMetrics.costReductionAchieved < (this.TARGET_COST_REDUCTION * 0.9)) {
          await this.optimizeAll();
        }
      } catch (error) {
        this.logger.error('Error in optimization cycle', { error });
      }
    }, 6 * 3600000); // Every 6 hours
  }

  // PUBLIC API
  public getGlobalMetrics(): GlobalCostMetrics {
    return { ...this.globalMetrics };
  }

  public getUserAnalysis(userId: string): CostAnalysis | undefined {
    return this.userAnalyses.get(userId);
  }

  public getCostReductionAchieved(): number {
    return this.globalMetrics.costReductionAchieved;
  }

  public isTargetAchieved(): boolean {
    return this.globalMetrics.costReductionAchieved >= this.TARGET_COST_REDUCTION;
  }

  public async generateCostReport(): Promise<any> {
    await this.analyzeGlobalCosts();

    return {
      summary: {
        totalUsers: this.globalMetrics.totalUsers,
        totalMonthlyCost: this.globalMetrics.totalMonthlyCost,
        averageCostPerUser: this.globalMetrics.averageCostPerUser,
        costReductionAchieved: this.globalMetrics.costReductionAchieved,
        targetAchieved: this.isTargetAchieved()
      },
      breakdown: this.globalMetrics.breakdown,
      optimizationOpportunities: this.globalMetrics.optimizationOpportunities,
      topSavingsOpportunities: await this.getTopSavingsOpportunities(10)
    };
  }

  private async getTopSavingsOpportunities(limit: number): Promise<any[]> {
    const opportunities = [];
    
    for (const [userId, analysis] of this.userAnalyses.entries()) {
      if (analysis.optimizedCostStructure.estimatedSavings > 0) {
        opportunities.push({
          userId,
          currentMonthlyCost: analysis.currentCostStructure.monthlyCost,
          estimatedSavings: analysis.optimizedCostStructure.estimatedSavings,
          savingsPercentage: analysis.optimizedCostStructure.savingsPercentage
        });
      }
    }

    return opportunities
      .sort((a, b) => b.estimatedSavings - a.estimatedSavings)
      .slice(0, limit);
  }

  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down cost optimizer...');

    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
    }
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
    }

    // Persist final state
    await this.persistGlobalMetrics();
    for (const analysis of this.userAnalyses.values()) {
      await this.persistUserAnalysis(analysis);
    }

    this.isRunning = false;
    this.emit('optimizer:shutdown');
    this.logger.info('Cost optimizer shutdown completed');
  }
}