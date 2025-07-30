import { Router } from 'express';
import { PromptGeneratorController } from '@/api/controllers/PromptGeneratorController';
import { AuthMiddleware } from '@/api/middleware/auth';
import { RateLimitMiddleware } from '@/api/middleware/rateLimit';

const router = Router();
const promptController = new PromptGeneratorController();

// Middleware aplicado a todas las rutas
router.use(AuthMiddleware.authenticateJWT);
router.use(RateLimitMiddleware.default);

/**
 * @swagger
 * /api/prompt-generator/sessions:
 *   post:
 *     tags:
 *       - Prompt Generator
 *     summary: Crear nueva sesión de generación de prompts
 *     description: Inicia una nueva sesión interactiva para generar un prompt personalizado para un asistente de IA
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category
 *               - title
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [customer_service, sales, support, general, custom]
 *                 description: Categoría del asistente a crear
 *               title:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 description: Título descriptivo para el asistente
 *               description:
 *                 type: string
 *                 maxLength: 500
 *                 description: Descripción opcional del propósito del asistente
 *     responses:
 *       201:
 *         description: Sesión creada exitosamente
 *       400:
 *         description: Datos de entrada inválidos
 *       401:
 *         description: Usuario no autenticado
 */
router.post('/sessions', promptController.createSession);

/**
 * @swagger
 * /api/prompt-generator/sessions:
 *   get:
 *     tags:
 *       - Prompt Generator
 *     summary: Obtener sesiones del usuario
 *     description: Lista todas las sesiones de generación de prompts del usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de sesiones obtenida exitosamente
 *       401:
 *         description: Usuario no autenticado
 */
router.get('/sessions', promptController.getUserSessions);

/**
 * @swagger
 * /api/prompt-generator/sessions/{sessionId}:
 *   get:
 *     tags:
 *       - Prompt Generator
 *     summary: Obtener detalles de una sesión
 *     description: Obtiene los detalles completos de una sesión específica
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único de la sesión
 *     responses:
 *       200:
 *         description: Detalles de la sesión obtenidos exitosamente
 *       404:
 *         description: Sesión no encontrada
 *       403:
 *         description: Sin permisos para acceder a esta sesión
 */
router.get('/sessions/:sessionId', promptController.getSession);

/**
 * @swagger
 * /api/prompt-generator/sessions/{sessionId}/current-question:
 *   get:
 *     tags:
 *       - Prompt Generator
 *     summary: Obtener pregunta actual
 *     description: Obtiene la pregunta actual que debe responderse en la sesión
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único de la sesión
 *     responses:
 *       200:
 *         description: Pregunta actual obtenida exitosamente
 *       404:
 *         description: No hay más preguntas disponibles o sesión no encontrada
 */
router.get('/sessions/:sessionId/current-question', promptController.getCurrentQuestion);

/**
 * @swagger
 * /api/prompt-generator/sessions/{sessionId}/answer:
 *   post:
 *     tags:
 *       - Prompt Generator
 *     summary: Responder pregunta actual
 *     description: Proporciona una respuesta a la pregunta actual de la sesión
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único de la sesión
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - answer
 *             properties:
 *               answer:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 1000
 *                 description: Respuesta a la pregunta actual
 *     responses:
 *       200:
 *         description: Respuesta procesada exitosamente
 *       400:
 *         description: Respuesta inválida o datos incorrectos
 *       404:
 *         description: Sesión no encontrada
 */
router.post('/sessions/:sessionId/answer', promptController.answerQuestion);

/**
 * @swagger
 * /api/prompt-generator/sessions/{sessionId}/generate:
 *   post:
 *     tags:
 *       - Prompt Generator
 *     summary: Generar prompt final
 *     description: Genera el prompt final del asistente IA basado en todas las respuestas proporcionadas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único de la sesión completada
 *     responses:
 *       200:
 *         description: Prompt generado exitosamente
 *       400:
 *         description: Sesión no completada o datos insuficientes
 *       404:
 *         description: Sesión no encontrada
 *       500:
 *         description: Error generando el prompt
 */
router.post('/sessions/:sessionId/generate', promptController.generatePrompt);

/**
 * @swagger
 * /api/prompt-generator/sessions/{sessionId}:
 *   delete:
 *     tags:
 *       - Prompt Generator
 *     summary: Eliminar sesión
 *     description: Elimina una sesión y su prompt generado asociado
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único de la sesión a eliminar
 *     responses:
 *       200:
 *         description: Sesión eliminada exitosamente
 *       404:
 *         description: Sesión no encontrada o sin permisos
 */
router.delete('/sessions/:sessionId', promptController.deleteSession);

/**
 * @swagger
 * /api/prompt-generator/prompts:
 *   get:
 *     tags:
 *       - Prompt Generator
 *     summary: Obtener prompts generados del usuario
 *     description: Lista todos los prompts generados por el usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de prompts obtenida exitosamente
 *       401:
 *         description: Usuario no autenticado
 */
router.get('/prompts', promptController.getUserPrompts);

/**
 * @swagger
 * /api/prompt-generator/prompts/{promptId}:
 *   get:
 *     tags:
 *       - Prompt Generator
 *     summary: Obtener prompt específico
 *     description: Obtiene los detalles completos de un prompt generado específico
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: promptId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único del prompt generado
 *     responses:
 *       200:
 *         description: Prompt obtenido exitosamente
 *       404:
 *         description: Prompt no encontrado
 *       403:
 *         description: Sin permisos para acceder a este prompt
 */
router.get('/prompts/:promptId', promptController.getPrompt);

export default router;