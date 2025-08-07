# Comandos de Prueba para Multi-Agent Configuration

## Datos de Prueba
- **User ID**: `0f1f5e62-3550-4d15-ae66-556786f08462`
- **Full User ID (con platform)**: `tribe-ia-nexus_0f1f5e62-3550-4d15-ae66-556786f08462`
- **Agent 1 ID**: `a1111111-1111-1111-1111-111111111111` (Sales Agent)
- **Agent 2 ID**: `a2222222-2222-2222-2222-222222222222` (Support Agent)

## 1. Probar Configuración Multi-Agente

### Guardar configuración básica:
```bash
curl -X POST "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_0f1f5e62-3550-4d15-ae66-556786f08462/config" \
-H "Content-Type: application/json" \
-d '{"activeAgents":["a1111111-1111-1111-1111-111111111111","a2222222-2222-2222-2222-222222222222"],"defaultAgent":"a1111111-1111-1111-1111-111111111111","triggerConfig":{"initial":{},"switch":{},"fallback":[]}}'
```

### Guardar configuración con triggers:
```bash
curl -X POST "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_0f1f5e62-3550-4d15-ae66-556786f08462/config" \
-H "Content-Type: application/json" \
-d '{"activeAgents":["a1111111-1111-1111-1111-111111111111","a2222222-2222-2222-2222-222222222222"],"defaultAgent":"a1111111-1111-1111-1111-111111111111","triggerConfig":{"initial":{"keywords":["venta","comprar","precio","producto"],"agentId":"a1111111-1111-1111-1111-111111111111"},"switch":{"fromAgent":"a1111111-1111-1111-1111-111111111111","toAgent":"a2222222-2222-2222-2222-222222222222","keywords":["ayuda","soporte","problema","no funciona"]},"fallback":["a1111111-1111-1111-1111-111111111111"]}}'
```

## 2. Obtener Configuración

```bash
curl "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_0f1f5e62-3550-4d15-ae66-556786f08462/config"
```

## 3. Probar Evaluación de Triggers

### Probar trigger inicial:
```bash
curl -X POST "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_0f1f5e62-3550-4d15-ae66-556786f08462/triggers/test" \
-H "Content-Type: application/json" \
-d '{"message":"Quiero comprar un producto","chatId":"test-chat-001"}'
```

### Probar switch trigger:
```bash
curl -X POST "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_0f1f5e62-3550-4d15-ae66-556786f08462/triggers/test" \
-H "Content-Type: application/json" \
-d '{"message":"Necesito ayuda con un problema","chatId":"test-chat-001","currentAgentId":"a1111111-1111-1111-1111-111111111111"}'
```

## 4. Verificar Logs

```bash
# Ver logs del backend
pm2 logs whatsapp-api-v2 --lines 50 --nostream | grep -E "AgentTrigger|multi-agent|0f1f5e62"

# Ver solo errores
pm2 logs whatsapp-api-v2 --err --lines 30 --nostream
```

## 5. Reiniciar Backend

```bash
# Rebuild y restart
npm run build && pm2 restart whatsapp-api-v2
```