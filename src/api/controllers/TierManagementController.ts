import { Request, Response } from 'express';
import { UserTierService, UserTier } from '@/core/services/UserTierService';
import { HybridArchitecture } from '@/core/HybridArchitecture';
import { CostOptimizer } from '@/core/optimization/CostOptimizer';
import { LoggerService } from '@/core/services/LoggerService';
import { ApiResponse } from '@/shared/types/ApiResponse';
import { z } from 'zod';

// Validation schemas
const upgradeTierSchema = z.object({
  body: z.object({
    newTier: z.enum(['standard', 'professional', 'enterprise']),
    billingCycle: z.enum(['monthly', 'yearly']).optional()
  })
});

const updateUsageSchema = z.object({
  body: z.object({
    messagesThisMonth: z.number().optional(),
    connectionsActive: z.number().optional(),
    storageUsedMB: z.number().optional()
  })
});

export class TierManagementController {
  private tierService: UserTierService;
  private hybridArchitecture: HybridArchitecture;
  private costOptimizer: CostOptimizer;
  private logger: LoggerService;

  constructor() {
    this.tierService = new UserTierService();
    this.hybridArchitecture = new HybridArchitecture();
    this.costOptimizer = new CostOptimizer();
    this.logger = LoggerService.getInstance();
  }

  /**
   * GET /api/tier-management/current
   * Get current user tier information
   */
  public getCurrentTier = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      this.logger.info('Getting current tier info', { userId });

      const tierInfo = await this.tierService.getUserTier(userId);
      const monthlyCost = await this.tierService.calculateMonthlyCost(userId);

      // Get cost analysis if available
      const costAnalysis = this.costOptimizer.getUserAnalysis(userId);

      res.json(ApiResponse.success({
        tierInfo: {
          tier: tierInfo.tier,
          billingCycle: tierInfo.billingCycle,
          subscriptionStart: tierInfo.subscriptionStart,
          subscriptionEnd: tierInfo.subscriptionEnd,
          status: tierInfo.status,
          trialEndsAt: tierInfo.trialEndsAt,
          paymentStatus: tierInfo.paymentStatus,
          configuration: tierInfo.configuration,
          usage: tierInfo.usage,
          monthlyCost
        },
        costAnalysis: costAnalysis ? {
          currentMonthlyCost: costAnalysis.currentCostStructure.monthlyCost,
          optimizedMonthlyCost: costAnalysis.optimizedCostStructure.projectedMonthlyCost,
          potentialSavings: costAnalysis.optimizedCostStructure.estimatedSavings,
          recommendations: costAnalysis.recommendations.length
        } : null
      }));

    } catch (error) {
      this.logger.error('Error getting current tier', { 
        userId: req.user?.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * GET /api/tier-management/tiers
   * Get all available tier configurations
   */
  public getAvailableTiers = async (req: Request, res: Response): Promise<void> => {
    try {
      const tierConfigurations = this.tierService.getAllTierConfigurations();
      const currentUserId = req.user?.id;

      // Add upgrade/downgrade recommendations if user is authenticated
      let recommendations = null;
      if (currentUserId) {
        const currentTier = await this.tierService.getUserTier(currentUserId);
        recommendations = await this.generateTierRecommendations(currentUserId, currentTier.tier);
      }

      res.json(ApiResponse.success({
        tiers: tierConfigurations.map(config => ({
          tier: config.tier,
          pricing: config.pricing,
          resources: config.resources,
          features: config.features,
          limits: config.limits
        })),
        recommendations
      }));

    } catch (error) {
      this.logger.error('Error getting available tiers', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * POST /api/tier-management/upgrade
   * Upgrade user tier
   */
  public upgradeTier = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      const validation = upgradeTierSchema.safeParse(req);
      if (!validation.success) {
        res.status(400).json(ApiResponse.error('Datos de entrada inválidos', 400, validation.error.errors));
        return;
      }

      const { newTier, billingCycle } = validation.data.body;

      this.logger.info('Processing tier upgrade', { userId, newTier, billingCycle });

      // Get current tier
      const currentTierInfo = await this.tierService.getUserTier(userId);

      // Validate upgrade
      if (!this.isValidUpgrade(currentTierInfo.tier, newTier)) {
        res.status(400).json(ApiResponse.error(`No se puede actualizar de ${currentTierInfo.tier} a ${newTier}`, 400));
        return;
      }

      // Calculate costs
      const newTierConfig = this.tierService.getTierConfiguration(newTier);
      if (!newTierConfig) {
        res.status(400).json(ApiResponse.error('Configuración de tier inválida', 400));
        return;
      }

      const proRatedAmount = this.calculateProRatedBilling(currentTierInfo, newTierConfig);

      // Process upgrade
      const success = await this.tierService.upgradeTier(userId, newTier);
      
      if (!success) {
        res.status(500).json(ApiResponse.error('Error procesando la actualización'));
        return;
      }

      // Update billing cycle if provided
      if (billingCycle && billingCycle !== currentTierInfo.billingCycle) {
        // Update billing cycle logic would go here
      }

      // Trigger resource reallocation in hybrid architecture
      await this.hybridArchitecture.handleTierUpgrade(userId, newTier);

      // Generate new cost analysis
      setTimeout(async () => {
        try {
          await this.costOptimizer.analyzeUserCosts(userId);
        } catch (error) {
          this.logger.error('Error generating cost analysis after upgrade', { userId, error });
        }
      }, 5000);

      res.json(ApiResponse.success({
        success: true,
        newTier,
        proRatedAmount,
        effectiveDate: new Date(),
        message: 'Tier actualizado exitosamente'
      }, 'Tier actualizado exitosamente'));

    } catch (error) {
      this.logger.error('Error upgrading tier', { 
        userId: req.user?.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * POST /api/tier-management/downgrade
   * Downgrade user tier
   */
  public downgradeTier = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      const validation = upgradeTierSchema.safeParse(req);
      if (!validation.success) {
        res.status(400).json(ApiResponse.error('Datos de entrada inválidos', 400, validation.error.errors));
        return;
      }

      const { newTier } = validation.data.body;

      this.logger.info('Processing tier downgrade', { userId, newTier });

      // Get current tier
      const currentTierInfo = await this.tierService.getUserTier(userId);

      // Validate downgrade
      if (!this.isValidDowngrade(currentTierInfo.tier, newTier)) {
        res.status(400).json(ApiResponse.error(`No se puede bajar de ${currentTierInfo.tier} a ${newTier}`, 400));
        return;
      }

      // Check downgrade constraints
      const constraintCheck = await this.checkDowngradeConstraints(userId, currentTierInfo.tier, newTier);
      if (!constraintCheck.allowed) {
        res.status(400).json(ApiResponse.error(
          `No se puede bajar el tier: ${constraintCheck.reason}`, 
          400,
          { constraints: constraintCheck.violations }
        ));
        return;
      }

      // Process downgrade
      const success = await this.tierService.downgradeTier(userId, newTier);
      
      if (!success) {
        res.status(500).json(ApiResponse.error('Error procesando la degradación'));
        return;
      }

      // Trigger resource reallocation
      await this.hybridArchitecture.handleTierUpgrade(userId, newTier);

      res.json(ApiResponse.success({
        success: true,
        newTier,
        effectiveDate: new Date(),
        message: 'Tier degradado exitosamente'
      }, 'Tier degradado exitosamente'));

    } catch (error) {
      this.logger.error('Error downgrading tier', { 
        userId: req.user?.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * PUT /api/tier-management/usage
   * Update user usage metrics
   */
  public updateUsage = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      const validation = updateUsageSchema.safeParse(req);
      if (!validation.success) {
        res.status(400).json(ApiResponse.error('Datos de entrada inválidos', 400, validation.error.errors));
        return;
      }

      const usageUpdates = validation.data.body;

      await this.tierService.updateUsage(userId, usageUpdates);

      // Check if approaching limits
      const tierInfo = await this.tierService.getUserTier(userId);
      const warnings = this.checkUsageWarnings(tierInfo);

      res.json(ApiResponse.success({
        updated: true,
        usage: tierInfo.usage,
        warnings
      }, 'Uso actualizado exitosamente'));

    } catch (error) {
      this.logger.error('Error updating usage', { 
        userId: req.user?.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * GET /api/tier-management/cost-analysis
   * Get detailed cost analysis for current user
   */
  public getCostAnalysis = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      this.logger.info('Generating cost analysis', { userId });

      const analysis = await this.costOptimizer.analyzeUserCosts(userId);

      res.json(ApiResponse.success({
        analysis: {
          userId: analysis.userId,
          currentCosts: {
            connectionType: analysis.currentCostStructure.connectionType,
            hourlyCost: analysis.currentCostStructure.hourlyCost,
            monthlyCost: analysis.currentCostStructure.monthlyCost,
            resourceUtilization: analysis.currentCostStructure.resourceUtilization,
            efficiency: analysis.currentCostStructure.efficiency
          },
          optimizedCosts: {
            recommendedConnectionType: analysis.optimizedCostStructure.recommendedConnectionType,
            projectedHourlyCost: analysis.optimizedCostStructure.projectedHourlyCost,
            projectedMonthlyCost: analysis.optimizedCostStructure.projectedMonthlyCost,
            estimatedSavings: analysis.optimizedCostStructure.estimatedSavings,
            savingsPercentage: analysis.optimizedCostStructure.savingsPercentage
          },
          usagePatterns: analysis.usagePatterns,
          recommendations: analysis.recommendations.map(rec => ({
            type: rec.type,
            description: rec.description,
            impact: rec.impact,
            estimatedSavings: rec.estimatedSavings,
            complexity: rec.implementationComplexity,
            risk: rec.riskLevel
          }))
        }
      }));

    } catch (error) {
      this.logger.error('Error generating cost analysis', { 
        userId: req.user?.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * POST /api/tier-management/optimize-costs
   * Optimize costs for current user
   */
  public optimizeCosts = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      this.logger.info('Starting cost optimization', { userId });

      const result = await this.costOptimizer.optimizeUser(userId);

      if (result.success) {
        res.json(ApiResponse.success({
          optimized: true,
          savings: result.savings,
          actions: result.actions,
          message: `Optimización completada. Ahorro estimado: $${result.savings.toFixed(2)}/mes`
        }, 'Costos optimizados exitosamente'));
      } else {
        res.json(ApiResponse.success({
          optimized: false,
          message: 'No se encontraron optimizaciones aplicables en este momento'
        }));
      }

    } catch (error) {
      this.logger.error('Error optimizing costs', { 
        userId: req.user?.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * GET /api/tier-management/usage-warnings
   * Get usage warnings for users approaching limits
   */
  public getUsageWarnings = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      const tierInfo = await this.tierService.getUserTier(userId);
      const warnings = this.checkUsageWarnings(tierInfo);
      const globalWarnings = await this.tierService.getUsersApproachingLimits();

      // Filter global warnings to only include current user if admin
      const userWarnings = globalWarnings.filter(w => w.userId === userId);

      res.json(ApiResponse.success({
        currentUser: {
          warnings,
          tier: tierInfo.tier,
          usage: tierInfo.usage
        },
        userSpecificWarnings: userWarnings
      }));

    } catch (error) {
      this.logger.error('Error getting usage warnings', { 
        userId: req.user?.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * GET /api/tier-management/recommendations
   * Get tier upgrade/downgrade recommendations
   */
  public getTierRecommendations = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      const tierInfo = await this.tierService.getUserTier(userId);
      const recommendations = await this.generateTierRecommendations(userId, tierInfo.tier);

      res.json(ApiResponse.success({
        currentTier: tierInfo.tier,
        recommendations
      }));

    } catch (error) {
      this.logger.error('Error getting tier recommendations', { 
        userId: req.user?.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  // Helper methods
  private isValidUpgrade(currentTier: UserTier, newTier: UserTier): boolean {
    const tierHierarchy = ['standard', 'professional', 'enterprise'];
    const currentIndex = tierHierarchy.indexOf(currentTier);
    const newIndex = tierHierarchy.indexOf(newTier);
    
    return newIndex > currentIndex;
  }

  private isValidDowngrade(currentTier: UserTier, newTier: UserTier): boolean {
    const tierHierarchy = ['standard', 'professional', 'enterprise'];
    const currentIndex = tierHierarchy.indexOf(currentTier);
    const newIndex = tierHierarchy.indexOf(newTier);
    
    return newIndex < currentIndex;
  }

  private calculateProRatedBilling(currentTierInfo: any, newTierConfig: any): number {
    const daysRemaining = Math.ceil((currentTierInfo.subscriptionEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    const totalDays = currentTierInfo.billingCycle === 'yearly' ? 365 : 30;
    
    const currentMonthlyPrice = currentTierInfo.configuration.pricing.monthlyPrice;
    const newMonthlyPrice = newTierConfig.pricing.monthlyPrice;
    
    const refund = (currentMonthlyPrice / totalDays) * daysRemaining;
    const charge = (newMonthlyPrice / totalDays) * daysRemaining;
    
    return Math.max(0, charge - refund);
  }

  private async checkDowngradeConstraints(userId: string, currentTier: UserTier, newTier: UserTier): Promise<{
    allowed: boolean;
    reason?: string;
    violations?: string[];
  }> {
    const violations: string[] = [];
    const newTierConfig = this.tierService.getTierConfiguration(newTier);
    
    if (!newTierConfig) {
      return { allowed: false, reason: 'Configuración de tier inválida' };
    }

    // Check agent count
    // This would integrate with your agent service
    // const agentCount = await this.getUserAgentCount(userId);
    // if (newTierConfig.features.customAgents !== -1 && agentCount > newTierConfig.features.customAgents) {
    //   violations.push(`Tienes ${agentCount} agentes, el nuevo tier permite ${newTierConfig.features.customAgents}`);
    // }

    // Check storage usage
    const tierInfo = await this.tierService.getUserTier(userId);
    if (tierInfo.usage.storageUsedMB > newTierConfig.limits.fileUploadSizeMB) {
      violations.push(`Uso de almacenamiento (${tierInfo.usage.storageUsedMB}MB) excede el límite del nuevo tier (${newTierConfig.limits.fileUploadSizeMB}MB)`);
    }

    return {
      allowed: violations.length === 0,
      reason: violations.length > 0 ? 'Restricciones de degradación no cumplidas' : undefined,
      violations: violations.length > 0 ? violations : undefined
    };
  }

  private checkUsageWarnings(tierInfo: any): string[] {
    const warnings: string[] = [];
    const config = tierInfo.configuration;
    const usage = tierInfo.usage;

    // Message limit warnings
    if (config.pricing.messagesIncluded !== -1) {
      const messageUsage = (usage.messagesThisMonth / config.pricing.messagesIncluded) * 100;
      
      if (messageUsage >= 90) {
        warnings.push(`Uso de mensajes al ${messageUsage.toFixed(1)}% del límite`);
      } else if (messageUsage >= 80) {
        warnings.push(`Uso de mensajes al ${messageUsage.toFixed(1)}% del límite`);
      }
    }

    // Storage warnings
    const storageUsage = (usage.storageUsedMB / config.limits.fileUploadSizeMB) * 100;
    if (storageUsage >= 90) {
      warnings.push(`Uso de almacenamiento al ${storageUsage.toFixed(1)}% del límite`);
    } else if (storageUsage >= 80) {
      warnings.push(`Uso de almacenamiento al ${storageUsage.toFixed(1)}% del límite`);
    }

    // Connection warnings
    if (config.resources.maxConnections !== -1) {
      const connectionUsage = (usage.connectionsActive / config.resources.maxConnections) * 100;
      if (connectionUsage >= 90) {
        warnings.push(`Conexiones activas al ${connectionUsage.toFixed(1)}% del límite`);
      }
    }

    return warnings;
  }

  private async generateTierRecommendations(userId: string, currentTier: UserTier): Promise<any[]> {
    const recommendations: any[] = [];
    
    try {
      // Get usage patterns and cost analysis
      const tierInfo = await this.tierService.getUserTier(userId);
      const costAnalysis = this.costOptimizer.getUserAnalysis(userId);
      
      // Recommend upgrade if approaching limits frequently
      const warnings = this.checkUsageWarnings(tierInfo);
      if (warnings.length > 0 && currentTier !== 'enterprise') {
        const nextTier = this.getNextTier(currentTier);
        if (nextTier) {
          recommendations.push({
            type: 'upgrade',
            tier: nextTier,
            reason: 'Acercándose a los límites del tier actual',
            benefits: [
              'Mayores límites de uso',
              'Mejor rendimiento',
              'Funcionalidades adicionales'
            ],
            estimatedCost: this.getEstimatedTierCost(nextTier)
          });
        }
      }

      // Recommend downgrade if underutilizing
      if (costAnalysis && costAnalysis.currentCostStructure.resourceUtilization < 30) {
        const previousTier = this.getPreviousTier(currentTier);
        if (previousTier) {
          recommendations.push({
            type: 'downgrade',
            tier: previousTier,
            reason: 'Subutilización de recursos',
            benefits: [
              `Ahorro estimado: $${costAnalysis.optimizedCostStructure.estimatedSavings.toFixed(2)}/mes`,
              'Optimización de costos'
            ],
            estimatedCost: this.getEstimatedTierCost(previousTier)
          });
        }
      }

      return recommendations;

    } catch (error) {
      this.logger.error('Error generating tier recommendations', { userId, error });
      return [];
    }
  }

  private getNextTier(currentTier: UserTier): UserTier | null {
    switch (currentTier) {
      case 'standard': return 'professional';
      case 'professional': return 'enterprise';
      case 'enterprise': return null;
      default: return null;
    }
  }

  private getPreviousTier(currentTier: UserTier): UserTier | null {
    switch (currentTier) {
      case 'enterprise': return 'professional';
      case 'professional': return 'standard';
      case 'standard': return null;
      default: return null;
    }
  }

  private getEstimatedTierCost(tier: UserTier): number {
    const config = this.tierService.getTierConfiguration(tier);
    return config ? config.pricing.monthlyPrice : 0;
  }
}