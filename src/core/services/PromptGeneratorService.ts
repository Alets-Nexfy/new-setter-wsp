import { GoogleGenerativeAI } from '@google/generative-ai';
import { LoggerService } from '@/core/services/LoggerService';
import { SupabaseService } from '@/core/services/SupabaseService';
import { v4 as uuidv4 } from 'uuid';

export interface PromptQuestion {
  id: string;
  question: string;
  category: 'personality' | 'behavior' | 'knowledge' | 'restrictions' | 'style' | 'context';
  priority: number;
  dependencies?: string[];
  validation?: {
    minLength?: number;
    maxLength?: number;
    required: boolean;
    format?: 'text' | 'options' | 'number' | 'boolean';
    options?: string[];
  };
}

export interface PromptAnswer {
  questionId: string;
  answer: string;
  timestamp: Date;
}

export interface PromptSession {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category: 'customer_service' | 'sales' | 'support' | 'general' | 'custom';
  currentQuestionIndex: number;
  questions: PromptQuestion[];
  answers: PromptAnswer[];
  status: 'active' | 'completed' | 'abandoned';
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  generatedPrompt?: string;
  metadata?: Record<string, any>;
}

export interface GeneratedPrompt {
  id: string;
  sessionId: string;
  userId: string;
  title: string;
  systemPrompt: string;
  personality: string;
  instructions: string;
  restrictions: string;
  examples: string[];
  metadata: {
    questionsAnswered: number;
    totalQuestions: number;
    categories: string[];
    confidence: number;
    estimatedQuality: number;
  };
  createdAt: Date;
}

export class PromptGeneratorService {
  private gemini: GoogleGenerativeAI;
  private logger: LoggerService;
  private firebase: SupabaseService;

  constructor() {
    this.logger = LoggerService.getInstance();
    this.firebase = SupabaseService.getInstance();
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no configurado');
    }
    
    this.gemini = new GoogleGenerativeAI(apiKey);
  }

  // Session Management
  public async createPromptSession(
    userId: string, 
    category: 'customer_service' | 'sales' | 'support' | 'general' | 'custom',
    title: string,
    description?: string
  ): Promise<PromptSession> {
    try {
      this.logger.info('Creando sesión de generación de prompts', { userId, category, title });

      const questions = await this.generateQuestionsForCategory(category);
      
      const session: PromptSession = {
        id: uuidv4(),
        userId,
        title,
        description,
        category,
        currentQuestionIndex: 0,
        questions,
        answers: [],
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          totalQuestions: questions.length,
          estimatedTimeMinutes: Math.ceil(questions.length * 1.5)
        }
      };

      await this.firebase.setDocument('prompt_sessions', session.id, session);
      
      this.logger.info('Sesión de generación creada', { 
        sessionId: session.id, 
        totalQuestions: questions.length 
      });

      return session;

    } catch (error) {
      this.logger.error('Error creando sesión de generación', { 
        userId, 
        category, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  public async getPromptSession(sessionId: string): Promise<PromptSession | null> {
    try {
      const doc = await this.firebase.getDocument('prompt_sessions', sessionId);
      return doc as PromptSession || null;
    } catch (error) {
      this.logger.error('Error obteniendo sesión', { sessionId, error });
      return null;
    }
  }

  public async getCurrentQuestion(sessionId: string): Promise<PromptQuestion | null> {
    try {
      const session = await this.getPromptSession(sessionId);
      if (!session || session.status !== 'active') {
        return null;
      }

      const currentQuestion = session.questions[session.currentQuestionIndex];
      return currentQuestion || null;

    } catch (error) {
      this.logger.error('Error obteniendo pregunta actual', { sessionId, error });
      return null;
    }
  }

  public async answerQuestion(sessionId: string, answer: string): Promise<{
    success: boolean;
    nextQuestion?: PromptQuestion;
    isCompleted: boolean;
    errorMessage?: string;
  }> {
    try {
      const session = await this.getPromptSession(sessionId);
      if (!session || session.status !== 'active') {
        return { success: false, isCompleted: false, errorMessage: 'Sesión no encontrada o inactiva' };
      }

      const currentQuestion = session.questions[session.currentQuestionIndex];
      if (!currentQuestion) {
        return { success: false, isCompleted: false, errorMessage: 'Pregunta actual no encontrada' };
      }

      // Validar respuesta
      const validation = this.validateAnswer(currentQuestion, answer);
      if (!validation.isValid) {
        return { 
          success: false, 
          isCompleted: false, 
          errorMessage: validation.error 
        };
      }

      // Guardar respuesta
      const answerData: PromptAnswer = {
        questionId: currentQuestion.id,
        answer: answer.trim(),
        timestamp: new Date()
      };

      session.answers.push(answerData);
      session.currentQuestionIndex++;
      session.updatedAt = new Date();

      // Verificar si la sesión está completa
      const isCompleted = session.currentQuestionIndex >= session.questions.length;
      if (isCompleted) {
        session.status = 'completed';
        session.completedAt = new Date();
      }

      // Actualizar sesión en base de datos
      await this.firebase.setDocument('prompt_sessions', sessionId, session);

      const nextQuestion = isCompleted ? null : session.questions[session.currentQuestionIndex];

      this.logger.info('Respuesta guardada', { 
        sessionId, 
        questionIndex: session.currentQuestionIndex - 1,
        isCompleted 
      });

      return {
        success: true,
        nextQuestion: nextQuestion || undefined,
        isCompleted
      };

    } catch (error) {
      this.logger.error('Error guardando respuesta', { sessionId, error });
      return { 
        success: false, 
        isCompleted: false, 
        errorMessage: 'Error interno del servidor' 
      };
    }
  }

  public async generatePrompt(sessionId: string): Promise<GeneratedPrompt | null> {
    try {
      const session = await this.getPromptSession(sessionId);
      if (!session || session.status !== 'completed') {
        throw new Error('Sesión no completada');
      }

      this.logger.info('Generando prompt final', { sessionId });

      const model = this.gemini.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });

      // Preparar contexto para la generación
      const context = this.prepareGenerationContext(session);
      const generationPrompt = this.buildGenerationPrompt(context);

      // Generar prompt con Gemini
      const result = await model.generateContent(generationPrompt);
      const generatedText = result.response.text();

      // Parsear el resultado generado
      const parsedPrompt = this.parseGeneratedPrompt(generatedText);

      const generatedPrompt: GeneratedPrompt = {
        id: uuidv4(),
        sessionId,
        userId: session.userId,
        title: session.title,
        systemPrompt: parsedPrompt.systemPrompt,
        personality: parsedPrompt.personality,
        instructions: parsedPrompt.instructions,
        restrictions: parsedPrompt.restrictions,
        examples: parsedPrompt.examples,
        metadata: {
          questionsAnswered: session.answers.length,
          totalQuestions: session.questions.length,
          categories: [...new Set(session.questions.map(q => q.category))],
          confidence: this.calculateConfidence(session),
          estimatedQuality: this.estimateQuality(session, parsedPrompt)
        },
        createdAt: new Date()
      };

      // Guardar prompt generado
      await this.firebase.setDocument('generated_prompts', generatedPrompt.id, generatedPrompt);

      // Actualizar sesión con referencia al prompt
      session.generatedPrompt = generatedPrompt.id;
      await this.firebase.setDocument('prompt_sessions', sessionId, session);

      this.logger.info('Prompt generado exitosamente', { 
        sessionId, 
        promptId: generatedPrompt.id,
        confidence: generatedPrompt.metadata.confidence 
      });

      return generatedPrompt;

    } catch (error) {
      this.logger.error('Error generando prompt', { sessionId, error });
      return null;
    }
  }

  // Question Generation
  private async generateQuestionsForCategory(category: string): Promise<PromptQuestion[]> {
    const baseQuestions = this.getBaseQuestions();
    const categorySpecificQuestions = this.getCategorySpecificQuestions(category);
    
    // Combinar preguntas base con específicas de categoría
    return [...baseQuestions, ...categorySpecificQuestions];
  }

  private getBaseQuestions(): PromptQuestion[] {
    return [
      {
        id: 'personality_name',
        question: '¿Cuál es el nombre o rol que quieres que tenga tu asistente? (ej: "María, asistente de ventas")',
        category: 'personality',
        priority: 1,
        validation: {
          required: true,
          minLength: 2,
          maxLength: 100,
          format: 'text'
        }
      },
      {
        id: 'personality_tone',
        question: '¿Qué tono de comunicación prefieres?',
        category: 'personality',
        priority: 2,
        validation: {
          required: true,
          format: 'options',
          options: ['Formal y profesional', 'Amigable y cercano', 'Casual y relajado', 'Técnico y experto', 'Empático y comprensivo']
        }
      },
      {
        id: 'business_context',
        question: '¿Cuál es el nombre y tipo de tu negocio? Describe brevemente a qué te dedicas.',
        category: 'context',
        priority: 3,
        validation: {
          required: true,
          minLength: 10,
          maxLength: 500,
          format: 'text'
        }
      },
      {
        id: 'target_audience',
        question: '¿Quién es tu público objetivo? Describe el perfil de tus clientes ideales.',
        category: 'context',
        priority: 4,
        validation: {
          required: true,
          minLength: 10,
          maxLength: 300,
          format: 'text'
        }
      },
      {
        id: 'main_goals',
        question: '¿Cuáles son los objetivos principales que quieres lograr con este asistente?',
        category: 'behavior',
        priority: 5,
        validation: {
          required: true,
          format: 'options',
          options: ['Generar leads y ventas', 'Brindar soporte al cliente', 'Agendar citas', 'Informar sobre productos/servicios', 'Resolver dudas frecuentes', 'Otro']
        }
      },
      {
        id: 'communication_style',
        question: '¿Prefieres respuestas cortas y directas o explicaciones más detalladas?',
        category: 'style',
        priority: 6,
        validation: {
          required: true,
          format: 'options',
          options: ['Respuestas cortas y directas', 'Explicaciones balanceadas', 'Respuestas detalladas y completas']
        }
      },
      {
        id: 'restricted_topics',
        question: '¿Hay temas o tipos de consultas que NO quieres que maneje el asistente?',
        category: 'restrictions',
        priority: 7,
        validation: {
          required: false,
          maxLength: 300,
          format: 'text'
        }
      },
      {
        id: 'business_hours',
        question: '¿Cuáles son tus horarios de atención? ¿El asistente debe mencionarlos?',
        category: 'context',
        priority: 8,
        validation: {
          required: false,
          maxLength: 200,
          format: 'text'
        }
      },
      {
        id: 'escalation_process',
        question: '¿Cuándo y cómo debe el asistente derivar la conversación a un humano?',
        category: 'behavior',
        priority: 9,
        validation: {
          required: true,
          format: 'options',
          options: ['Cuando no puede resolver la consulta', 'Para consultas complejas o técnicas', 'Para solicitudes de precios/cotizaciones', 'Nunca, siempre debe intentar ayudar', 'Solo cuando el cliente lo solicite explícitamente']
        }
      },
      {
        id: 'special_instructions',
        question: '¿Hay alguna instrucción especial o protocolo particular que debe seguir?',
        category: 'behavior',
        priority: 10,
        validation: {
          required: false,
          maxLength: 400,
          format: 'text'
        }
      }
    ];
  }

  private getCategorySpecificQuestions(category: string): PromptQuestion[] {
    switch (category) {
      case 'customer_service':
        return [
          {
            id: 'cs_common_issues',
            question: '¿Cuáles son los problemas o consultas más frecuentes que reciben tus clientes?',
            category: 'knowledge',
            priority: 11,
            validation: {
              required: true,
              minLength: 20,
              maxLength: 500,
              format: 'text'
            }
          },
          {
            id: 'cs_resolution_time',
            question: '¿Qué tiempo de respuesta esperan tus clientes para sus consultas?',
            category: 'behavior',
            priority: 12,
            validation: {
              required: true,
              format: 'options',
              options: ['Inmediato (menos de 5 minutos)', 'Rápido (menos de 1 hora)', 'Mismo día', 'Hasta 24 horas', 'No es crítico el tiempo']
            }
          }
        ];

      case 'sales':
        return [
          {
            id: 'sales_products',
            question: '¿Cuáles son tus productos o servicios principales? Describe sus beneficios clave.',
            category: 'knowledge',
            priority: 11,
            validation: {
              required: true,
              minLength: 30,
              maxLength: 600,
              format: 'text'
            }
          },
          {
            id: 'sales_process',
            question: '¿Cuál es tu proceso de ventas típico desde el primer contacto hasta el cierre?',
            category: 'behavior',
            priority: 12,
            validation: {
              required: true,
              minLength: 20,
              maxLength: 400,
              format: 'text'
            }
          },
          {
            id: 'sales_objections',
            question: '¿Cuáles son las objeciones más comunes que ponen tus clientes y cómo las manejas?',
            category: 'knowledge',
            priority: 13,
            validation: {
              required: true,
              minLength: 20,
              maxLength: 500,
              format: 'text'
            }
          }
        ];

      case 'support':
        return [
          {
            id: 'support_products',
            question: '¿Para qué productos o servicios necesitas brindar soporte técnico?',
            category: 'knowledge',
            priority: 11,
            validation: {
              required: true,
              minLength: 10,
              maxLength: 300,
              format: 'text'
            }
          },
          {
            id: 'support_complexity',
            question: '¿Qué nivel de complejidad técnica manejan generalmente las consultas?',
            category: 'knowledge',
            priority: 12,
            validation: {
              required: true,
              format: 'options',
              options: ['Básico (dudas simples)', 'Intermedio (configuraciones)', 'Avanzado (troubleshooting técnico)', 'Mixto (todos los niveles)']
            }
          }
        ];

      default:
        return [];
    }
  }

  // Answer Validation
  private validateAnswer(question: PromptQuestion, answer: string): { isValid: boolean; error?: string } {
    const validation = question.validation;
    if (!validation) return { isValid: true };

    // Verificar si es requerida
    if (validation.required && (!answer || answer.trim().length === 0)) {
      return { isValid: false, error: 'Esta pregunta es obligatoria' };
    }

    // Verificar longitud mínima
    if (validation.minLength && answer.length < validation.minLength) {
      return { 
        isValid: false, 
        error: `La respuesta debe tener al menos ${validation.minLength} caracteres` 
      };
    }

    // Verificar longitud máxima
    if (validation.maxLength && answer.length > validation.maxLength) {
      return { 
        isValid: false, 
        error: `La respuesta no puede exceder ${validation.maxLength} caracteres` 
      };
    }

    // Verificar formato de opciones
    if (validation.format === 'options' && validation.options) {
      if (!validation.options.includes(answer)) {
        return { 
          isValid: false, 
          error: 'Debes seleccionar una de las opciones válidas' 
        };
      }
    }

    return { isValid: true };
  }

  // Prompt Generation
  private prepareGenerationContext(session: PromptSession): any {
    const answerMap = new Map(session.answers.map(a => [a.questionId, a.answer]));
    
    return {
      category: session.category,
      title: session.title,
      answers: session.questions.map(q => ({
        question: q.question,
        category: q.category,
        answer: answerMap.get(q.id) || ''
      })).filter(item => item.answer)
    };
  }

  private buildGenerationPrompt(context: any): string {
    return `Eres un experto en creación de prompts para asistentes de IA especializados en WhatsApp Business. 

Basándote en las siguientes respuestas del usuario, genera un prompt completo y profesional para un asistente de IA:

CATEGORÍA: ${context.category}
TÍTULO: ${context.title}

RESPUESTAS DEL USUARIO:
${context.answers.map((item: any, index: number) => `${index + 1}. ${item.question}\nRespuesta: ${item.answer}\n`).join('\n')}

INSTRUCCIONES PARA LA GENERACIÓN:
1. Crea un prompt estructurado y completo
2. Define claramente la personalidad del asistente
3. Establece reglas de comportamiento específicas
4. Incluye restricciones claras sobre lo que NO debe hacer
5. Proporciona ejemplos de interacciones
6. Asegúrate de que sea específico para WhatsApp Business

FORMATO DE RESPUESTA REQUERIDO:
Responde EXCLUSIVAMENTE en formato JSON con esta estructura:

{
  "systemPrompt": "Prompt principal del sistema que define el rol y comportamiento general",
  "personality": "Descripción detallada de la personalidad y tono de comunicación",
  "instructions": "Instrucciones específicas de comportamiento y manejo de situaciones",
  "restrictions": "Lista clara de restricciones y limitaciones",
  "examples": ["Ejemplo de conversación 1", "Ejemplo de conversación 2", "Ejemplo de conversación 3"]
}

IMPORTANTE: 
- Responde SOLO con el JSON válido
- No incluyas texto adicional antes o después del JSON
- Asegúrate de que el prompt sea específico y actionable
- Incluye información de contacto y escalation si fue proporcionada
- Adapta el lenguaje al tono seleccionado por el usuario`;
  }

  private parseGeneratedPrompt(generatedText: string): any {
    try {
      // Limpiar el texto y extraer solo el JSON
      const cleanedText = generatedText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const parsed = JSON.parse(cleanedText);
      
      // Validar estructura
      if (!parsed.systemPrompt || !parsed.personality || !parsed.instructions) {
        throw new Error('Estructura de prompt inválida');
      }

      return parsed;

    } catch (error) {
      this.logger.error('Error parseando prompt generado', { error, generatedText });
      
      // Fallback con estructura básica
      return {
        systemPrompt: 'Eres un asistente de IA para WhatsApp Business',
        personality: 'Profesional y servicial',
        instructions: 'Ayuda a los clientes con sus consultas de manera eficiente',
        restrictions: 'No compartas información confidencial',
        examples: ['Cliente: Hola\nAsistente: ¡Hola! ¿En qué puedo ayudarte hoy?']
      };
    }
  }

  private calculateConfidence(session: PromptSession): number {
    const totalQuestions = session.questions.length;
    const answeredQuestions = session.answers.length;
    const completionRate = answeredQuestions / totalQuestions;
    
    // Calcular calidad de respuestas
    const qualityScore = session.answers.reduce((acc, answer) => {
      const length = answer.answer.length;
      if (length < 10) return acc + 0.5;
      if (length < 50) return acc + 0.7;
      if (length < 200) return acc + 0.9;
      return acc + 1.0;
    }, 0) / answeredQuestions;

    return Math.round((completionRate * 0.6 + qualityScore * 0.4) * 100);
  }

  private estimateQuality(session: PromptSession, prompt: any): number {
    let score = 50; // Base score

    // Bonus por completitud
    if (session.answers.length === session.questions.length) score += 20;

    // Bonus por longitud de prompt
    const promptLength = (prompt.systemPrompt + prompt.personality + prompt.instructions).length;
    if (promptLength > 500) score += 15;
    if (promptLength > 1000) score += 10;

    // Bonus por ejemplos
    if (prompt.examples && prompt.examples.length >= 3) score += 10;

    // Bonus por restricciones definidas
    if (prompt.restrictions && prompt.restrictions.length > 50) score += 5;

    return Math.min(score, 100);
  }

  // User Session Management
  public async getUserSessions(userId: string): Promise<PromptSession[]> {
    try {
      const sessions = await this.firebase.getCollectionWhere(
        'prompt_sessions',
        'userId',
        '==',
        userId
      );

      return Object.values(sessions).sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ) as PromptSession[];

    } catch (error) {
      this.logger.error('Error obteniendo sesiones del usuario', { userId, error });
      return [];
    }
  }

  public async getGeneratedPrompt(promptId: string): Promise<GeneratedPrompt | null> {
    try {
      const prompt = await this.firebase.getDocument('generated_prompts', promptId);
      return prompt as GeneratedPrompt || null;
    } catch (error) {
      this.logger.error('Error obteniendo prompt generado', { promptId, error });
      return null;
    }
  }

  public async getUserGeneratedPrompts(userId: string): Promise<GeneratedPrompt[]> {
    try {
      const prompts = await this.firebase.getCollectionWhere(
        'generated_prompts',
        'userId',
        '==',
        userId
      );

      return Object.values(prompts).sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ) as GeneratedPrompt[];

    } catch (error) {
      this.logger.error('Error obteniendo prompts del usuario', { userId, error });
      return [];
    }
  }

  public async deleteSession(sessionId: string, userId: string): Promise<boolean> {
    try {
      const session = await this.getPromptSession(sessionId);
      if (!session || session.userId !== userId) {
        return false;
      }

      await this.firebase.deleteDocument('prompt_sessions', sessionId);
      
      // Si hay un prompt generado, también eliminarlo
      if (session.generatedPrompt) {
        await this.firebase.deleteDocument('generated_prompts', session.generatedPrompt);
      }

      this.logger.info('Sesión eliminada', { sessionId, userId });
      return true;

    } catch (error) {
      this.logger.error('Error eliminando sesión', { sessionId, userId, error });
      return false;
    }
  }
}