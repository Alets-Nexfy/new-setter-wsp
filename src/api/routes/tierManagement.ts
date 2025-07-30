import { Router } from 'express';
import { TierManagementController } from '@/api/controllers/TierManagementController';
import { AuthMiddleware } from '@/api/middleware/auth';
import { RateLimitMiddleware } from '@/api/middleware/rateLimit';

const router = Router();
const tierController = new TierManagementController();

// Middleware aplicado a todas las rutas
router.use(AuthMiddleware.authenticateJWT);
router.use(RateLimitMiddleware.strict);

/**
 * @swagger
 * /api/tier-management/current:
 *   get:
 *     tags:
 *       - Tier Management
 *     summary: Obtener información del tier actual
 *     description: Obtiene la información completa del tier del usuario, incluyendo configuración, uso y análisis de costos
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Información del tier obtenida exitosamente
 *       401:
 *         description: Usuario no autenticado
 */
router.get('/current', tierController.getCurrentTier);

/**
 * @swagger
 * /api/tier-management/tiers:
 *   get:
 *     tags:
 *       - Tier Management
 *     summary: Obtener tiers disponibles
 *     description: Lista todos los tiers disponibles con sus configuraciones y recomendaciones personalizadas
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de tiers obtenida exitosamente
 */
router.get('/tiers', tierController.getAvailableTiers);

/**
 * @swagger
 * /api/tier-management/upgrade:
 *   post:
 *     tags:
 *       - Tier Management
 *     summary: Actualizar tier de usuario
 *     description: Actualiza el tier del usuario a un nivel superior
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newTier
 *             properties:
 *               newTier:
 *                 type: string
 *                 enum: [standard, professional, enterprise]
 *                 description: Nuevo tier al que actualizar
 *               billingCycle:
 *                 type: string
 *                 enum: [monthly, yearly]
 *                 description: Ciclo de facturación (opcional)
 *     responses:
 *       200:
 *         description: Tier actualizado exitosamente
 *       400:
 *         description: Actualización inválida o datos incorrectos
 *       401:
 *         description: Usuario no autenticado
 */
router.post('/upgrade', tierController.upgradeTier);

/**
 * @swagger
 * /api/tier-management/downgrade:
 *   post:
 *     tags:
 *       - Tier Management
 *     summary: Degradar tier de usuario
 *     description: Degrada el tier del usuario a un nivel inferior
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newTier
 *             properties:
 *               newTier:
 *                 type: string
 *                 enum: [standard, professional, enterprise]
 *                 description: Nuevo tier al que degradar
 *     responses:
 *       200:
 *         description: Tier degradado exitosamente
 *       400:
 *         description: Degradación inválida o restricciones no cumplidas
 *       401:
 *         description: Usuario no autenticado
 */
router.post('/downgrade', tierController.downgradeTier);

/**
 * @swagger
 * /api/tier-management/usage:
 *   put:
 *     tags:
 *       - Tier Management
 *     summary: Actualizar métricas de uso
 *     description: Actualiza las métricas de uso del usuario para el tier actual
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               messagesThisMonth:
 *                 type: number
 *                 description: Número de mensajes usados este mes
 *               connectionsActive:
 *                 type: number
 *                 description: Número de conexiones activas
 *               storageUsedMB:
 *                 type: number
 *                 description: Almacenamiento usado en MB
 *     responses:
 *       200:
 *         description: Uso actualizado exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 *       401:
 *         description: Usuario no autenticado
 */
router.put('/usage', tierController.updateUsage);

/**
 * @swagger
 * /api/tier-management/cost-analysis:
 *   get:
 *     tags:
 *       - Tier Management
 *     summary: Obtener análisis de costos
 *     description: Genera un análisis detallado de costos actuales y optimizaciones posibles
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Análisis de costos generado exitosamente
 *       401:
 *         description: Usuario no autenticado
 */
router.get('/cost-analysis', tierController.getCostAnalysis);

/**
 * @swagger
 * /api/tier-management/optimize-costs:
 *   post:
 *     tags:
 *       - Tier Management
 *     summary: Optimizar costos del usuario
 *     description: Ejecuta optimizaciones automáticas de costos para el usuario
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Optimización completada
 *       401:
 *         description: Usuario no autenticado
 */
router.post('/optimize-costs', tierController.optimizeCosts);

/**
 * @swagger
 * /api/tier-management/usage-warnings:
 *   get:
 *     tags:
 *       - Tier Management
 *     summary: Obtener advertencias de uso
 *     description: Obtiene advertencias sobre límites de uso que se están acercando
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Advertencias de uso obtenidas exitosamente
 *       401:
 *         description: Usuario no autenticado
 */
router.get('/usage-warnings', tierController.getUsageWarnings);

/**
 * @swagger
 * /api/tier-management/recommendations:
 *   get:
 *     tags:
 *       - Tier Management
 *     summary: Obtener recomendaciones de tier
 *     description: Obtiene recomendaciones personalizadas de upgrade/downgrade basadas en uso
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Recomendaciones obtenidas exitosamente
 *       401:
 *         description: Usuario no autenticado
 */
router.get('/recommendations', tierController.getTierRecommendations);

export default router;