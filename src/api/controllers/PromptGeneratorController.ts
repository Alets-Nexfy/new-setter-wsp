import { Request, Response } from 'express';
import { PromptGeneratorService } from '@/core/services/PromptGeneratorService';
import { LoggerService } from '@/core/services/LoggerService';
import { ApiResponse } from '@/shared/types/ApiResponse';
import { validateRequest } from '@/api/middleware/validation';
import { z } from 'zod';

// Validation schemas
const createSessionSchema = z.object({
  body: z.object({
    category: z.enum(['customer_service', 'sales', 'support', 'general', 'custom']),
    title: z.string().min(3).max(100),
    description: z.string().optional()
  })
});

const answerQuestionSchema = z.object({
  body: z.object({
    answer: z.string().min(1).max(1000)
  }),
  params: z.object({
    sessionId: z.string().uuid()
  })
});

const sessionParamsSchema = z.object({
  params: z.object({
    sessionId: z.string().uuid()
  })
});

export class PromptGeneratorController {
  private promptService: PromptGeneratorService;
  private logger: LoggerService;

  constructor() {
    this.promptService = new PromptGeneratorService();
    this.logger = LoggerService.getInstance();
  }

  /**
   * POST /api/prompt-generator/sessions
   * Crear una nueva sesión de generación de prompts
   */
  public createSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      const validation = createSessionSchema.safeParse(req);
      if (!validation.success) {
        res.status(400).json(ApiResponse.error('Datos de entrada inválidos', 400, validation.error.errors));
        return;
      }

      const { category, title, description } = validation.data.body;

      this.logger.info('Creando sesión de prompt generator', { userId, category, title });

      const session = await this.promptService.createPromptSession(userId, category, title, description);

      res.status(201).json(ApiResponse.success({
        session: {
          id: session.id,
          title: session.title,
          description: session.description,
          category: session.category,
          status: session.status,
          totalQuestions: session.questions.length,
          currentQuestionIndex: session.currentQuestionIndex,
          createdAt: session.createdAt,
          estimatedTimeMinutes: session.metadata?.estimatedTimeMinutes
        }
      }, 'Sesión creada exitosamente'));

    } catch (error) {
      this.logger.error('Error creando sesión de prompt generator', { 
        userId: req.user?.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * GET /api/prompt-generator/sessions
   * Obtener todas las sesiones del usuario
   */
  public getUserSessions = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      this.logger.info('Obteniendo sesiones del usuario', { userId });

      const sessions = await this.promptService.getUserSessions(userId);

      const formattedSessions = sessions.map(session => ({
        id: session.id,
        title: session.title,
        description: session.description,
        category: session.category,
        status: session.status,
        totalQuestions: session.questions.length,
        answeredQuestions: session.answers.length,
        currentQuestionIndex: session.currentQuestionIndex,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        completedAt: session.completedAt,
        hasGeneratedPrompt: !!session.generatedPrompt
      }));

      res.json(ApiResponse.success({
        sessions: formattedSessions,
        total: formattedSessions.length
      }));

    } catch (error) {
      this.logger.error('Error obteniendo sesiones del usuario', { 
        userId: req.user?.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * GET /api/prompt-generator/sessions/:sessionId
   * Obtener detalles de una sesión específica
   */
  public getSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      const validation = sessionParamsSchema.safeParse(req);
      if (!validation.success) {
        res.status(400).json(ApiResponse.error('ID de sesión inválido', 400));
        return;
      }

      const { sessionId } = validation.data.params;

      this.logger.info('Obteniendo detalles de sesión', { userId, sessionId });

      const session = await this.promptService.getPromptSession(sessionId);

      if (!session) {
        res.status(404).json(ApiResponse.error('Sesión no encontrada', 404));
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json(ApiResponse.error('No tienes permisos para acceder a esta sesión', 403));
        return;
      }

      res.json(ApiResponse.success({
        session: {
          id: session.id,
          title: session.title,
          description: session.description,
          category: session.category,
          status: session.status,
          totalQuestions: session.questions.length,
          answeredQuestions: session.answers.length,
          currentQuestionIndex: session.currentQuestionIndex,
          questions: session.questions.map(q => ({
            id: q.id,
            question: q.question,
            category: q.category,
            priority: q.priority,
            validation: q.validation
          })),
          answers: session.answers,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          completedAt: session.completedAt,
          hasGeneratedPrompt: !!session.generatedPrompt,
          generatedPromptId: session.generatedPrompt
        }
      }));

    } catch (error) {
      this.logger.error('Error obteniendo detalles de sesión', { 
        userId: req.user?.id, 
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * GET /api/prompt-generator/sessions/:sessionId/current-question
   * Obtener la pregunta actual de una sesión
   */
  public getCurrentQuestion = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      const validation = sessionParamsSchema.safeParse(req);
      if (!validation.success) {
        res.status(400).json(ApiResponse.error('ID de sesión inválido', 400));
        return;
      }

      const { sessionId } = validation.data.params;

      // Verificar que la sesión pertenece al usuario
      const session = await this.promptService.getPromptSession(sessionId);
      if (!session || session.userId !== userId) {
        res.status(404).json(ApiResponse.error('Sesión no encontrada', 404));
        return;
      }

      const currentQuestion = await this.promptService.getCurrentQuestion(sessionId);

      if (!currentQuestion) {
        res.status(404).json(ApiResponse.error('No hay más preguntas disponibles', 404));
        return;
      }

      res.json(ApiResponse.success({
        question: {
          id: currentQuestion.id,
          question: currentQuestion.question,
          category: currentQuestion.category,
          priority: currentQuestion.priority,
          validation: currentQuestion.validation
        },
        progress: {
          current: session.currentQuestionIndex + 1,
          total: session.questions.length,
          percentage: Math.round(((session.currentQuestionIndex + 1) / session.questions.length) * 100)
        }
      }));

    } catch (error) {
      this.logger.error('Error obteniendo pregunta actual', { 
        userId: req.user?.id, 
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * POST /api/prompt-generator/sessions/:sessionId/answer
   * Responder la pregunta actual
   */
  public answerQuestion = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      const validation = answerQuestionSchema.safeParse(req);
      if (!validation.success) {
        res.status(400).json(ApiResponse.error('Datos de entrada inválidos', 400, validation.error.errors));
        return;
      }

      const { sessionId } = validation.data.params;
      const { answer } = validation.data.body;

      // Verificar que la sesión pertenece al usuario
      const session = await this.promptService.getPromptSession(sessionId);
      if (!session || session.userId !== userId) {
        res.status(404).json(ApiResponse.error('Sesión no encontrada', 404));
        return;
      }

      this.logger.info('Respondiendo pregunta', { userId, sessionId, answerLength: answer.length });

      const result = await this.promptService.answerQuestion(sessionId, answer);

      if (!result.success) {
        res.status(400).json(ApiResponse.error(result.errorMessage || 'Error procesando respuesta', 400));
        return;
      }

      const responseData: any = {
        success: true,
        isCompleted: result.isCompleted
      };

      if (result.nextQuestion) {
        responseData.nextQuestion = {
          id: result.nextQuestion.id,
          question: result.nextQuestion.question,
          category: result.nextQuestion.category,
          priority: result.nextQuestion.priority,
          validation: result.nextQuestion.validation
        };
      }

      // Calcular progreso actualizado
      const updatedSession = await this.promptService.getPromptSession(sessionId);
      if (updatedSession) {
        responseData.progress = {
          current: updatedSession.currentQuestionIndex,
          total: updatedSession.questions.length,
          percentage: Math.round((updatedSession.currentQuestionIndex / updatedSession.questions.length) * 100),
          answeredQuestions: updatedSession.answers.length
        };
      }

      res.json(ApiResponse.success(responseData, result.isCompleted ? 'Sesión completada' : 'Respuesta guardada'));

    } catch (error) {
      this.logger.error('Error respondiendo pregunta', { 
        userId: req.user?.id, 
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * POST /api/prompt-generator/sessions/:sessionId/generate
   * Generar el prompt final basado en las respuestas
   */
  public generatePrompt = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      const validation = sessionParamsSchema.safeParse(req);
      if (!validation.success) {
        res.status(400).json(ApiResponse.error('ID de sesión inválido', 400));
        return;
      }

      const { sessionId } = validation.data.params;

      // Verificar que la sesión pertenece al usuario
      const session = await this.promptService.getPromptSession(sessionId);
      if (!session || session.userId !== userId) {
        res.status(404).json(ApiResponse.error('Sesión no encontrada', 404));
        return;
      }

      if (session.status !== 'completed') {
        res.status(400).json(ApiResponse.error('La sesión debe estar completada para generar el prompt', 400));
        return;
      }

      this.logger.info('Generando prompt final', { userId, sessionId });

      const generatedPrompt = await this.promptService.generatePrompt(sessionId);

      if (!generatedPrompt) {
        res.status(500).json(ApiResponse.error('Error generando el prompt'));
        return;
      }

      res.json(ApiResponse.success({
        prompt: {
          id: generatedPrompt.id,
          title: generatedPrompt.title,
          systemPrompt: generatedPrompt.systemPrompt,
          personality: generatedPrompt.personality,
          instructions: generatedPrompt.instructions,
          restrictions: generatedPrompt.restrictions,
          examples: generatedPrompt.examples,
          metadata: generatedPrompt.metadata,
          createdAt: generatedPrompt.createdAt
        }
      }, 'Prompt generado exitosamente'));

    } catch (error) {
      this.logger.error('Error generando prompt', { 
        userId: req.user?.id, 
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * GET /api/prompt-generator/prompts
   * Obtener todos los prompts generados del usuario
   */
  public getUserPrompts = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      this.logger.info('Obteniendo prompts del usuario', { userId });

      const prompts = await this.promptService.getUserGeneratedPrompts(userId);

      const formattedPrompts = prompts.map(prompt => ({
        id: prompt.id,
        title: prompt.title,
        systemPrompt: prompt.systemPrompt,
        personality: prompt.personality,
        instructions: prompt.instructions,
        restrictions: prompt.restrictions,
        examples: prompt.examples,
        metadata: prompt.metadata,
        createdAt: prompt.createdAt,
        sessionId: prompt.sessionId
      }));

      res.json(ApiResponse.success({
        prompts: formattedPrompts,
        total: formattedPrompts.length
      }));

    } catch (error) {
      this.logger.error('Error obteniendo prompts del usuario', { 
        userId: req.user?.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * GET /api/prompt-generator/prompts/:promptId
   * Obtener un prompt específico
   */
  public getPrompt = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      const { promptId } = req.params;

      if (!promptId) {
        res.status(400).json(ApiResponse.error('ID de prompt requerido', 400));
        return;
      }

      this.logger.info('Obteniendo prompt específico', { userId, promptId });

      const prompt = await this.promptService.getGeneratedPrompt(promptId);

      if (!prompt) {
        res.status(404).json(ApiResponse.error('Prompt no encontrado', 404));
        return;
      }

      if (prompt.userId !== userId) {
        res.status(403).json(ApiResponse.error('No tienes permisos para acceder a este prompt', 403));
        return;
      }

      res.json(ApiResponse.success({
        prompt: {
          id: prompt.id,
          title: prompt.title,
          systemPrompt: prompt.systemPrompt,
          personality: prompt.personality,
          instructions: prompt.instructions,
          restrictions: prompt.restrictions,
          examples: prompt.examples,
          metadata: prompt.metadata,
          createdAt: prompt.createdAt,
          sessionId: prompt.sessionId
        }
      }));

    } catch (error) {
      this.logger.error('Error obteniendo prompt específico', { 
        userId: req.user?.id, 
        promptId: req.params.promptId,
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };

  /**
   * DELETE /api/prompt-generator/sessions/:sessionId
   * Eliminar una sesión
   */
  public deleteSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(ApiResponse.error('Usuario no autenticado', 401));
        return;
      }

      const validation = sessionParamsSchema.safeParse(req);
      if (!validation.success) {
        res.status(400).json(ApiResponse.error('ID de sesión inválido', 400));
        return;
      }

      const { sessionId } = validation.data.params;

      this.logger.info('Eliminando sesión', { userId, sessionId });

      const success = await this.promptService.deleteSession(sessionId, userId);

      if (!success) {
        res.status(404).json(ApiResponse.error('Sesión no encontrada o no tienes permisos', 404));
        return;
      }

      res.json(ApiResponse.success(null, 'Sesión eliminada exitosamente'));

    } catch (error) {
      this.logger.error('Error eliminando sesión', { 
        userId: req.user?.id, 
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json(ApiResponse.error('Error interno del servidor'));
    }
  };
}