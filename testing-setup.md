# 🧪 Guía de Testing - WhatsApp API v2

## 1. Configuración Inicial

### Crear archivo .env
Crea un archivo `.env` en la raíz del proyecto con la siguiente configuración:

```env
# Puerto del servidor
PORT=3000

# Firebase - Opción 1: Archivo de credenciales (recomendado para testing)
FIREBASE_SERVICE_ACCOUNT_PATH=./config/firebase-service-account.json

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Google Gemini AI
GEMINI_API_KEY=tu-api-key-de-gemini

# Habilitar solo WhatsApp para testing
ENABLE_WHATSAPP=true
ENABLE_INSTAGRAM=false

# Logging detallado
LOG_LEVEL=debug
NODE_ENV=development
```

### Dependencias Necesarias
```bash
# Instalar dependencias
npm install

# Verificar que Redis esté corriendo
redis-cli ping
```

## 2. Estructura de Testing

### Fase 1: Testing Básico
- ✅ Conexión a Firebase
- ✅ Inicio del servidor
- ✅ Endpoints básicos

### Fase 2: Testing de WhatsApp Worker  
- ✅ Inicialización del worker
- ✅ Generación de QR
- ✅ Conexión de WhatsApp

### Fase 3: Testing de Funcionalidades
- ✅ Recepción de mensajes
- ✅ Auto-reply con AI
- ✅ Sistema de agentes
- ✅ Action flows

## 3. Comandos de Testing

### Iniciar servidor principal
```bash
npm run dev
```

### Iniciar solo worker de WhatsApp
```bash
npm run dev:whatsapp
```

### Verificar logs
```bash
tail -f logs/app.log
```

## 4. Endpoints para Probar

### Estado del Sistema
- GET `/api/health` - Estado general
- GET `/api/whatsapp/status/:userId` - Estado de WhatsApp

### WhatsApp
- POST `/api/whatsapp/connect/:userId` - Conectar WhatsApp
- GET `/api/whatsapp/qr/:userId` - Obtener QR
- POST `/api/whatsapp/send-message` - Enviar mensaje

### Chats y Mensajes
- GET `/api/chats/:userId` - Listar chats
- GET `/api/messages/:userId/:chatId` - Mensajes de chat
- POST `/api/messages/send` - Enviar mensaje

### Agentes
- GET `/api/agents/:userId` - Listar agentes
- POST `/api/agents/switch` - Cambiar agente activo

## 5. Herramientas de Testing

### Postman/Thunder Client
Colección de endpoints para testing manual

### Logs en Tiempo Real
```bash
# Terminal 1: Servidor
npm run dev

# Terminal 2: Logs
tail -f logs/whatsapp-worker.log

# Terminal 3: Redis
redis-cli monitor
```

### Testing con curl
```bash
# Verificar estado
curl http://localhost:3000/api/health

# Conectar WhatsApp
curl -X POST http://localhost:3000/api/whatsapp/connect/test-user

# Obtener QR
curl http://localhost:3000/api/whatsapp/qr/test-user
```

## 6. Flujo de Testing Recomendado

1. **Configurar entorno** (.env, Firebase, Redis)
2. **Iniciar servidor** con logs detallados
3. **Conectar WhatsApp** y escanear QR
4. **Probar mensajes básicos** (envío/recepción)
5. **Configurar agente** y probar AI
6. **Configurar triggers** y action flows
7. **Testing de integración** completa

## 7. Verificaciones Importantes

### ✅ Firebase
- [ ] Conexión establecida
- [ ] Colecciones accesibles
- [ ] Datos de usuarios

### ✅ WhatsApp
- [ ] Cliente inicializado
- [ ] QR generado correctamente
- [ ] Conexión establecida
- [ ] Mensajes recibidos/enviados

### ✅ AI/Agentes
- [ ] Gemini API funcionando
- [ ] Agentes cargados
- [ ] Respuestas generadas

### ✅ Funcionalidades Avanzadas
- [ ] Triggers iniciales
- [ ] Action flows
- [ ] Detección de presencia
- [ ] Auto-reply inteligente 