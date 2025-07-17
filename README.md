# API de WhatsApp - Documentación Técnica

## Índice de Contenidos

1. [Introducción y Arquitectura](#introducción-y-arquitectura)
2. [Configuración y Dependencias](#configuración-y-dependencias)
3. [Documentación de Endpoints](#documentación-de-endpoints)
4. [Modelos de Datos](#modelos-de-datos)
5. [Lógica de Negocio](#lógica-de-negocio)
6. [Manejo de Errores](#manejo-de-errores)
7. [Consideraciones de Seguridad](#consideraciones-de-seguridad)

---

## Introducción y Arquitectura

### Descripción General

La API de WhatsApp es un sistema de integración empresarial que permite la gestión automatizada de conversaciones de WhatsApp a través de agentes de inteligencia artificial conversacionales. El sistema está diseñado para manejar múltiples usuarios concurrentes, cada uno con su propia instancia de WhatsApp Web y configuraciones personalizadas de automatización.

### Arquitectura Técnica

El sistema implementa una **arquitectura híbrida distribuida** basada en el patrón **Master-Worker** con las siguientes características:

#### Componentes Principales

- **Servidor Principal (Master)**: Orquestador que maneja peticiones HTTP, WebSocket y gestión de workers
- **Workers Independientes**: Procesos hijos dedicados que manejan cada instancia de WhatsApp por usuario
- **Sistema de Comunicación IPC**: Inter-Process Communication para coordinación entre master y workers
- **Base de Datos Firestore**: Persistencia distribuida en tiempo real
- **WebSocket Server**: Comunicación en tiempo real con clientes frontend

#### Flujo de Arquitectura

```
Cliente Frontend
    ↕ (HTTP/WebSocket)
Express Server (Master)
    ↕ (IPC + Firebase)
Worker Process (Por Usuario)
    ↕ (Puppeteer)
WhatsApp Web Instance
    ↕ (Cloud Storage)
Firebase Firestore
```

### Stack Tecnológico

#### Backend Core
- **Runtime**: Node.js
- **Framework Web**: Express.js 4.19.2
- **Procesamiento Concurrente**: Child Process fork
- **WebSocket**: ws 8.18.2

#### Integraciones Principales
- **WhatsApp Integration**: whatsapp-web.js 1.31.0
- **Browser Automation**: Puppeteer 24.6.1 + puppeteer-extra
- **Inteligencia Artificial**: Google Generative AI (Gemini 1.5-flash)
- **Base de Datos**: Firebase Firestore + Firebase Admin SDK 12.7.0
- **Gestión de Archivos**: Multer 1.4.5

#### Utilidades y Herramientas
- **Generación QR**: qrcode 1.5.4 + qrcode-terminal 0.12.0
- **Gestión de IDs**: uuid 11.1.0
- **Configuración**: dotenv 16.5.0
- **CORS**: cors 2.8.5

### Patrones de Diseño Aplicados

- **Master-Worker Pattern**: Separación de responsabilidades entre orquestador y ejecutores
- **Repository Pattern**: Abstracción de persistencia a través de Firebase
- **Observer Pattern**: Eventos de WhatsApp y notificaciones WebSocket
- **Factory Pattern**: Creación de workers por demanda
- **Strategy Pattern**: Diferentes tipos de respuestas automáticas (reglas, flujos, IA)

---

## Configuración y Dependencias

### Requisitos del Sistema

#### Hardware Mínimo
- RAM: 4GB (recomendado 8GB+)
- CPU: 2 cores (recomendado 4+ cores)
- Almacenamiento: 10GB libres
- Ancho de banda: Conexión estable a internet

#### Software
- Node.js 16.x o superior
- npm 8.x o superior
- Chrome/Chromium (instalado automáticamente por Puppeteer)

### Variables de Entorno Necesarias

Crear archivo `.env` en la raíz del proyecto:

```env
# Configuración de la API
PORT=3457
API_SECRET_KEY=tu_clave_secreta_api

# Firebase Configuration
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json

# Google Gemini AI
GEMINI_API_KEY=tu_clave_gemini_ai

# Configuración de entorno
NODE_ENV=production
```

### Instalación y Configuración

#### 1. Instalación de Dependencias

```bash
npm install
```

#### 2. Configuración de Firebase

1. Crear proyecto en Firebase Console
2. Habilitar Firestore Database
3. Descargar serviceAccountKey.json
4. Colocar archivo en la raíz del proyecto

#### 3. Configuración de Gemini AI

1. Obtener API key de Google AI Studio
2. Configurar variable GEMINI_API_KEY

#### 4. Ejecución

```bash
# Desarrollo
npm start

# Producción
node server.js
```

### Dependencias Principales

#### Core Dependencies
- **express**: Framework web principal
- **firebase-admin**: SDK de Firebase para backend
- **whatsapp-web.js**: Librería de integración WhatsApp
- **puppeteer**: Automatización de navegador Chrome
- **@google/generative-ai**: SDK de Gemini AI

#### Development Dependencies
- **body-parser**: Parsing de request bodies
- **cors**: Manejo de Cross-Origin Resource Sharing
- **multer**: Upload de archivos
- **ws**: WebSocket server

---

## Documentación de Endpoints

### Autenticación

Todos los endpoints requieren autenticación Bearer Token:

```
Authorization: Bearer {API_SECRET_KEY}
```

### Gestión de Usuarios

#### POST /users
**Descripción**: Registra un nuevo usuario en el sistema

**Parámetros de entrada**:
```json
{
  "userId": "string (requerido)"
}
```

**Respuesta exitosa (201)**:
```json
{
  "success": true,
  "message": "Usuario registrado con éxito.",
  "userId": "string"
}
```

**Códigos de estado**:
- 201: Usuario creado exitosamente
- 400: userId requerido o inválido
- 409: Usuario ya existe
- 500: Error interno del servidor

#### GET /users
**Descripción**: Obtiene la lista de todos los usuarios registrados y sus estados de conexión

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "users": [
    {
      "user_id": "string",
      "status": "disconnected|connected|connecting|generating_qr|error",
      "active_agent_id": "string|null",
      "created_at": "ISO string timestamp",
      "updated_at": "ISO string timestamp"
    }
  ]
}
```

### Gestión de Conexiones WhatsApp

#### POST /users/:userId/connect
**Descripción**: Inicia el proceso de conexión de WhatsApp para un usuario

**Parámetros**:
- `userId` (path): Identificador del usuario

**Respuesta exitosa (202)**:
```json
{
  "success": true,
  "message": "Solicitud de conexión recibida. Iniciando proceso..."
}
```

**Casos de uso**:
- Conectar nueva cuenta de WhatsApp
- Reconectar después de desconexión
- Generar nuevo código QR

#### POST /users/:userId/disconnect
**Descripción**: Desconecta la sesión de WhatsApp del usuario

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "message": "Desconexión iniciada."
}
```

#### GET /users/:userId/get-qr
**Descripción**: Obtiene el código QR actual para autenticación

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "qr": "data:image/png;base64,..."
}
```

### Gestión de Mensajes

#### POST /users/:userId/send-message
**Descripción**: Envía un mensaje de WhatsApp desde la cuenta del usuario

**Parámetros de entrada**:
```json
{
  "number": "string (formato internacional sin +)",
  "message": "string (contenido del mensaje)"
}
```

**Respuesta exitosa (202)**:
```json
{
  "success": true,
  "message": "Mensaje enviado exitosamente."
}
```

**Validaciones**:
- Usuario debe estar conectado (status: "connected")
- Número debe estar en formato internacional
- Mensaje no puede estar vacío

#### GET /users/:userId/chats
**Descripción**: Obtiene la lista de chats activos del usuario

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "chats": [
    {
      "id": "string",
      "name": "string",
      "lastMessage": "string",
      "timestamp": "ISO string",
      "unreadCount": "number"
    }
  ]
}
```

#### GET /users/:userId/chats/:chatId/messages
**Descripción**: Obtiene el historial de mensajes de un chat específico

**Parámetros**:
- `limit` (query): Número máximo de mensajes (default: 50)
- `offset` (query): Offset para paginación (default: 0)

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "messages": [
    {
      "id": "string",
      "body": "string",
      "timestamp": "ISO string",
      "isFromMe": "boolean",
      "origin": "contact|bot|human"
    }
  ]
}
```

### Gestión de Agentes IA

#### GET /users/:userId/agents
**Descripción**: Obtiene todos los agentes conversacionales configurados para el usuario

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "string (UUID)",
      "persona": {
        "name": "string",
        "role": "string",
        "language": "string",
        "tone": "string",
        "style": "string",
        "guidelines": ["string"]
      },
      "knowledge": {
        "files": ["string"],
        "urls": ["string"],
        "qandas": [
          {
            "question": "string",
            "answer": "string"
          }
        ]
      },
      "createdAt": "timestamp",
      "updatedAt": "timestamp"
    }
  ]
}
```

#### POST /users/:userId/agents
**Descripción**: Crea un nuevo agente conversacional

**Parámetros de entrada**:
```json
{
  "persona": {
    "name": "string (requerido)",
    "role": "string",
    "language": "string",
    "tone": "string",
    "style": "string",
    "guidelines": ["string"]
  },
  "knowledge": {
    "files": ["string"],
    "urls": ["string"],
    "qandas": [
      {
        "question": "string",
        "answer": "string"
      }
    ]
  }
}
```

**Respuesta exitosa (201)**:
```json
{
  "success": true,
  "message": "Agente creado exitosamente.",
  "data": {
    "id": "string (UUID)",
    // ... resto de datos del agente
  }
}
```

#### POST /users/:userId/agents/:agentId/activate
**Descripción**: Activa un agente específico como el agente principal del usuario

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "message": "Agente activado exitosamente."
}
```

### Automatización y Reglas

#### GET /users/:userId/rules
**Descripción**: Obtiene todas las reglas de auto-respuesta simples del usuario

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "string (UUID)",
      "trigger": "string (texto que activa la regla)",
      "response": "string (respuesta automática)"
    }
  ]
}
```

#### POST /users/:userId/add-rule
**Descripción**: Crea una nueva regla de auto-respuesta

**Parámetros de entrada**:
```json
{
  "trigger": "string (requerido)",
  "response": "string (requerido)"
}
```

**Validaciones**:
- Trigger se convierte automáticamente a minúsculas
- No se permiten triggers duplicados
- Trigger y response no pueden estar vacíos

#### GET /users/:userId/action-flows
**Descripción**: Obtiene todos los flujos de acción automatizados del usuario

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "string (UUID)",
      "name": "string",
      "trigger": "string",
      "steps": [
        {
          "type": "send_message|delay|condition",
          "value": "string|number|object"
        }
      ],
      "createdAt": "ISO string",
      "updatedAt": "ISO string"
    }
  ]
}
```

#### POST /users/:userId/action-flows
**Descripción**: Crea un nuevo flujo de acciones automatizado

**Parámetros de entrada**:
```json
{
  "name": "string (requerido)",
  "trigger": "string (requerido)",
  "steps": [
    {
      "type": "send_message",
      "value": "Mensaje a enviar"
    },
    {
      "type": "delay",
      "value": 5000
    }
  ]
}
```

**Tipos de pasos disponibles**:
- `send_message`: Envía un mensaje
- `delay`: Pausa en milisegundos
- `condition`: Evaluación condicional

### Integración Gemini AI

#### GET /users/:userId/gemini-starters
**Descripción**: Obtiene todos los prompts de inicio de conversación con Gemini

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "string (UUID)",
      "trigger": "string",
      "prompt": "string"
    }
  ]
}
```

#### POST /users/:userId/generate-assisted-prompt
**Descripción**: Genera un prompt asistido utilizando IA para configuración de agentes

**Parámetros de entrada**:
```json
{
  "objective": "string (requerido)",
  "agentNameOrRole": "string",
  "companyOrContext": "string",
  "targetAudience": "string",
  "desiredTone": "string",
  "keyInfoToInclude": "string",
  "thingsToAvoid": "string",
  "primaryCallToAction": "string"
}
```

### Sistema de Limpieza Nuclear

#### GET /cleanup/status
**Descripción**: Obtiene el estado actual del sistema y estadísticas

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "timestamp": "ISO string",
  "system": {
    "activeWorkers": "number",
    "activeWebSocketConnections": "number",
    "firestoreCollections": "number",
    "uptime": "number (seconds)"
  }
}
```

#### POST /users/:userId/nuke
**Descripción**: Elimina completamente todos los datos de un usuario específico

**Parámetros de entrada**:
```json
{
  "confirmationCode": "NUKE_{userId}_{timestamp}"
}
```

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "message": "Limpieza nuclear completada exitosamente",
  "results": {
    "userId": "string",
    "timestamp": "ISO string",
    "steps": ["array de operaciones realizadas"],
    "success": true,
    "errors": ["array de errores si los hubo"]
  }
}
```

**ADVERTENCIA**: Esta operación es IRREVERSIBLE y elimina:
- Procesos worker activos
- Datos de Firestore del usuario
- Archivos locales de sesión
- Conexiones WebSocket
- Configuraciones de agentes

---

## Modelos de Datos

### Estructura Firebase Firestore

#### Colección Principal: users

```
users/{userId}/
├── Documento principal (metadata del usuario)
├── status/whatsapp/ (estado de conexión en tiempo real)
├── agents/ (agentes IA configurados)
├── rules/ (reglas de auto-respuesta)
├── action_flows/ (flujos automatizados)
├── gemini_starters/ (prompts iniciales)
├── chats/{chatId}/
│   ├── messages_all/ (todos los mensajes)
│   ├── messages_human/ (mensajes enviados por humanos)
│   ├── messages_bot/ (mensajes automáticos del bot)
│   └── messages_contact/ (mensajes de contactos)
├── kanban_boards/ (tableros organizativos)
└── initial_triggers/ (disparadores de conversación)
```

#### Modelo Usuario Principal

```typescript
interface User {
  userId: string;
  status: 'disconnected' | 'connected' | 'connecting' | 'generating_qr' | 'error';
  active_agent_id: string | null;
  last_qr_code: string | null;
  worker_pid: number | null;
  last_error: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### Modelo Estado WhatsApp

```typescript
interface WhatsAppStatus {
  status: 'disconnected' | 'connected' | 'connecting' | 'generating_qr' | 'error';
  last_error: string | null;
  last_qr_code: string | null;
  updatedAt: Timestamp;
}
```

#### Modelo Agente IA

```typescript
interface Agent {
  id: string;
  persona: {
    name: string;
    role: string;
    language: string;
    tone: string;
    style: string;
    guidelines: string[];
  };
  knowledge: {
    files: string[];
    urls: string[];
    qandas: {
      question: string;
      answer: string;
    }[];
    writingSampleTxt?: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### Modelo Mensaje

```typescript
interface Message {
  body: string;
  timestamp: Timestamp;
  isFromMe: boolean;
  messageId: string;
  from: string;
  to: string;
  origin: 'contact' | 'bot' | 'human';
  isAutoReply?: boolean;
}
```

#### Modelo Regla Auto-respuesta

```typescript
interface Rule {
  id: string;
  trigger: string; // siempre en minúsculas
  response: string;
}
```

#### Modelo Flujo de Acción

```typescript
interface ActionFlow {
  id: string;
  name: string;
  trigger: string;
  triggerValue?: string;
  steps: FlowStep[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface FlowStep {
  type: 'send_message' | 'delay' | 'condition';
  value: string | number | object;
  delay?: number; // para steps de mensaje
}
```

### Validaciones de Campos

#### Usuario
- `userId`: String no vacío, único
- `status`: Enum con valores específicos
- `active_agent_id`: UUID válido o null

#### Agente
- `persona.name`: String requerido, máximo 100 caracteres
- `persona.language`: Código de idioma ISO válido
- `knowledge.qandas`: Array de objetos con question y answer requeridos

#### Mensaje
- `body`: String no vacío, máximo 4096 caracteres
- `from/to`: Formato de número WhatsApp válido
- `origin`: Enum con valores específicos

### Relaciones entre Modelos

- **Usuario → Agentes**: One-to-Many (un usuario puede tener múltiples agentes)
- **Usuario → Chats**: One-to-Many (un usuario maneja múltiples chats)
- **Chat → Mensajes**: One-to-Many (un chat contiene múltiples mensajes)
- **Usuario → Reglas**: One-to-Many (un usuario puede tener múltiples reglas)
- **Usuario → Flujos**: One-to-Many (un usuario puede tener múltiples flujos)

---

## Lógica de Negocio

### Funcionalidades Principales

#### Sistema de Workers por Usuario

Cada usuario registrado obtiene un proceso worker independiente que maneja:

1. **Conexión WhatsApp Web**: Instancia dedicada de Puppeteer + Chrome
2. **Procesamiento de Mensajes**: Manejo de eventos entrantes y salientes
3. **Automatización**: Ejecución de reglas, flujos y respuestas IA
4. **Persistencia**: Guardado automático en Firestore

#### Flujo de Conexión WhatsApp

1. **Solicitud de Conexión**: Cliente solicita conexión via `/connect`
2. **Creación de Worker**: Servidor crea proceso hijo dedicado
3. **Inicialización Puppeteer**: Worker lanza instancia Chrome
4. **Generación QR**: WhatsApp Web genera código QR
5. **Autenticación**: Usuario escanea QR desde móvil
6. **Conexión Establecida**: Worker notifica estado "connected"
7. **Procesamiento Activo**: Worker procesa mensajes automáticamente

#### Sistema de Respuestas Automáticas

El sistema implementa una cascada de verificación para respuestas automáticas:

1. **Verificación de Activación**: Chat debe estar activado o contener trigger inicial
2. **Verificación de Pausa**: Bot no debe estar pausado
3. **Verificación de Presencia**: Usuario humano debe estar inactivo
4. **Ejecución en Prioridad**:
   - Flujos de Acción (prioridad más alta)
   - Reglas Simples (prioridad media)
   - Starters Gemini (prioridad baja)
   - Respuesta IA Default (prioridad más baja)

#### Motor de Flujos de Acción

Los flujos de acción permiten crear secuencias complejas de automatización:

**Tipos de Disparadores**:
- `exact_message`: Coincidencia exacta de texto
- `message`: Texto contenido en el mensaje
- `image_received`: Recepción de imagen

**Tipos de Pasos**:
- `send_message`: Envía mensaje con soporte de variables
- `delay`: Pausa configurable en segundos
- `condition`: Evaluación condicional con branching

#### Sistema de Agentes IA

Los agentes utilizan Google Gemini para generar respuestas contextuales:

**Componentes del Agente**:
- **Persona**: Definición de personalidad, rol y estilo
- **Knowledge Base**: Archivos, URLs y Q&As específicos
- **Guidelines**: Reglas de comportamiento específicas

**Generación de Respuestas**:
1. Construcción de prompt con contexto de conversación
2. Inclusión de personalidad del agente activo
3. Agregado de historial de mensajes recientes
4. Llamada a Gemini API con retry automático
5. Post-procesamiento y envío de respuesta

### Flujos de Trabajo Críticos

#### Flujo de Procesamiento de Mensaje Entrante

```
Mensaje Recibido
    ↓
Verificar Chat Activado
    ↓
Guardar en Firestore (messages_contact, messages_all)
    ↓
Verificar Usuario Activo
    ↓
¿Usuario Inactivo? → Sí
    ↓
¿Bot Pausado? → No
    ↓
Buscar Flujo Coincidente
    ↓
¿Flujo Encontrado? → Sí → Ejecutar Flujo → FIN
    ↓ No
Buscar Regla Simple
    ↓
¿Regla Encontrada? → Sí → Enviar Respuesta → FIN
    ↓ No
Buscar Starter Gemini
    ↓
¿Starter Encontrado? → Sí → Generar con Prompt → FIN
    ↓ No
Generar Respuesta IA Default → FIN
```

#### Flujo de Activación de Chat

Los chats deben ser activados antes de recibir respuestas automáticas:

1. **Trigger Inicial**: Mensaje coincide con disparador configurado
2. **Activación Automática**: Chat se marca como activado
3. **Timestamp de Actividad**: Se registra última actividad
4. **Procesamiento Posterior**: Chat habilitado para automatización
5. **Auto-desactivación**: Después de 36 horas de inactividad

### Reglas de Validación

#### Validaciones de Usuario
- userId único en el sistema
- Máximo 1 worker activo por usuario
- API key válida para todas las operaciones

#### Validaciones de Mensaje
- Formato de número WhatsApp válido (internacional)
- Contenido no vacío para mensajes salientes
- Usuario debe estar conectado para enviar mensajes

#### Validaciones de Agente
- Nombre de persona requerido y único por usuario
- Knowledge base con formato válido
- Guidelines como array de strings

#### Validaciones de Flujo
- Trigger único por usuario
- Steps como array válido
- Tipos de paso reconocidos por el motor

### Procesos de Autorización

#### Autenticación API
- Bearer token requerido en header Authorization
- Validación contra API_SECRET_KEY de entorno
- Fallo de autenticación retorna 401/403

#### Autorización por Usuario
- Acceso limitado a recursos del propio userId
- Sin acceso cruzado entre usuarios
- Workers aislados por usuario

#### Autorización Firebase
- Service Account Key para acceso backend
- Reglas Firestore básicas (requiere autenticación)
- Sin autorización granular implementada

---

## Manejo de Errores

### Estrategia de Manejo de Excepciones

#### Niveles de Error

**1. Errores de Sistema (Critical)**
- Fallo de inicialización Firebase
- Fallo de conexión Puppeteer
- Worker process crash
- **Acción**: Log crítico + proceso exit

**2. Errores de Usuario (Handled)**
- Datos de entrada inválidos
- Usuario no encontrado
- Worker no conectado
- **Acción**: Respuesta HTTP con error descriptivo

**3. Errores de Integración (Recoverable)**
- Timeout Gemini API
- Fallo temporal WhatsApp
- Error de red
- **Acción**: Retry automático + fallback

**4. Errores de Validación (Client)**
- Campos requeridos faltantes
- Formato de datos incorrecto
- **Acción**: Respuesta 400 con detalles

### Códigos de Error Personalizados

#### HTTP Status Codes Utilizados

- **200**: Operación exitosa
- **201**: Recurso creado exitosamente
- **202**: Operación aceptada (async)
- **400**: Bad Request - datos inválidos
- **401**: Unauthorized - falta autenticación
- **403**: Forbidden - API key inválida
- **404**: Not Found - recurso no existe
- **409**: Conflict - recurso duplicado
- **500**: Internal Server Error - error del sistema
- **503**: Service Unavailable - servicio temporalmente no disponible

#### Estructura de Respuesta de Error

```json
{
  "success": false,
  "message": "Descripción del error",
  "error": "Detalle técnico opcional",
  "code": "ERROR_CODE_CUSTOM"
}
```

### Mensajes de Error Estandarizados

#### Errores de Autenticación
- `"Unauthorized: Missing or invalid Authorization header."`
- `"Forbidden: Invalid API Key."`

#### Errores de Usuario
- `"Usuario no encontrado."`
- `"El usuario ya existe."`
- `"Usuario no está conectado a WhatsApp."`

#### Errores de Validación
- `"userId es requerido y no puede estar vacío."`
- `"Trigger y response son requeridos."`
- `"Número y mensaje son requeridos."`

#### Errores de Worker
- `"Worker para usuario {userId} no está activo."`
- `"Error: No se pudo iniciar el worker."`
- `"Worker exited unexpectedly."`

#### Errores de Integración
- `"Servicio de IA no disponible en este momento."`
- `"Error conectando con WhatsApp."`
- `"Error interno al procesar la solicitud."`

### Logging y Monitoreo

#### Niveles de Log
- **CRITICAL**: Errores que afectan la disponibilidad del sistema
- **ERROR**: Errores que afectan funcionalidad específica
- **WARN**: Situaciones anómalas pero recuperables
- **INFO**: Información operacional normal
- **DEBUG**: Información detallada para desarrollo

#### Formato de Log
```
[Worker/Server][Component][Level] Message: Details
```

Ejemplo:
```
[Worker user123][Flow Engine][ERROR] Error ejecutando flujo: TypeError...
[Server][WebSocket][INFO] Client connected for user: user456
```

---

## Configuración de Autenticación y Seguridad

### Mecanismos de Autenticación

#### API Key Authentication
- **Método**: Bearer Token en header Authorization
- **Configuración**: Variable de entorno API_SECRET_KEY
- **Validación**: Middleware `authenticateApiKey()` en todas las rutas
- **Requisito**: La variable API_SECRET_KEY debe estar configurada en el archivo .env

Ejemplo de configuración:
```env
API_SECRET_KEY=tu_clave_secreta_aqui
```

Ejemplo de uso en requests:
```bash
curl -H "Authorization: Bearer tu_clave_secreta_aqui" \
     http://localhost:3457/users
```

#### Firebase Authentication
- **Método**: Service Account Key para backend
- **Archivo**: serviceAccountKey.json con credenciales
- **Validación**: Inicialización automática al arranque
- **Ubicación**: Archivo debe estar en la raíz del proyecto

### Políticas de Autorización

#### Autorización por Usuario
- Acceso limitado a recursos del propio userId
- Workers aislados por proceso para máxima seguridad
- Cada usuario opera en su contexto independiente

#### Firebase Firestore Rules
Configuración básica de reglas de Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Para mayor granularidad, se puede configurar:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && 
                          request.auth.uid == userId;
    }
  }
}
```

### Validación de Entrada de Datos

#### Validaciones Implementadas
- Validación de campos requeridos en endpoints
- Sanitización automática de userId (trim)
- Validación de formato de trigger (toLowerCase)
- Verificación de tipos de datos en flujos de acción
- Validación de formato de números WhatsApp
- Verificación de longitud de mensajes

### Configuración Adicional Recomendada

#### Rate Limiting (Opcional)
Para controlar la frecuencia de requests:

```javascript
const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por ventana de tiempo
  message: "Demasiadas peticiones desde esta IP"
});

app.use(limiter);
```

#### Validación de Entrada Avanzada
Para validación más robusta:

```javascript
const joi = require('joi');

const userSchema = joi.object({
  userId: joi.string().alphanum().min(3).max(30).required()
});

// Uso en endpoints
const { error, value } = userSchema.validate(req.body);
```

#### Configuración CORS
El sistema incluye configuración CORS para permitir requests cross-origin:

```javascript
const cors = require('cors');
app.use(cors());
```

### Mejores Prácticas de Configuración

1. **Variables de Entorno**: Siempre usar variables de entorno para configuración sensible
2. **HTTPS en Producción**: Configurar certificados SSL/TLS
3. **Logging**: Mantener logs detallados para monitoreo
4. **Backups**: Configurar backups automáticos de Firestore
5. **Monitoreo**: Implementar health checks y métricas

---

Esta documentación proporciona una base técnica completa para entender, usar y mantener la API de WhatsApp. Para consultas técnicas específicas, se recomienda revisar el código fuente en los archivos `server.js` y `worker.js` que contienen la lógica principal del sistema. 