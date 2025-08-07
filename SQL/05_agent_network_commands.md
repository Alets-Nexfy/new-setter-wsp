# Comandos para Red de Agentes Multi-Agente

## Resumen del Sistema

### Conceptos Clave:
- **Agente Activo Principal**: Solo 1, es el que responde actualmente
- **Red de Agentes**: Múltiples agentes con triggers que se activan según palabras clave
- **Triggers**: Palabras clave que activan cambio de agente

### Tu Configuración Actual:
- **Usuario**: `b006bd62-4258-4cc6-bf94-78e4c92a8184`
- **3 Agentes Configurados**:
  - `1a449502` - Trigger: "hola" (Initial)
  - `a94fdd86` - Trigger: "comprar" (Switch)
  - `d71e417f` - Trigger: "problema" (Switch)

## Comandos de la API

### 1. Ver Estado de la Red de Agentes
```bash
curl "https://api.nexfy.io/api/agent-network/tribe-ia-nexus_b006bd62-4258-4cc6-bf94-78e4c92a8184/status"
```

### 2. Activar TODA la Red de Agentes
Activa todos los agentes configurados con sus triggers:
```bash
curl -X POST "https://api.nexfy.io/api/agent-network/tribe-ia-nexus_b006bd62-4258-4cc6-bf94-78e4c92a8184/activate"
```

### 3. Desactivar Red (excepto el principal)
```bash
curl -X POST "https://api.nexfy.io/api/agent-network/tribe-ia-nexus_b006bd62-4258-4cc6-bf94-78e4c92a8184/deactivate" \
-H "Content-Type: application/json" \
-d '{"keepDefault": true}'
```

### 4. Configurar Red Multi-Agente
```bash
curl -X POST "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_b006bd62-4258-4cc6-bf94-78e4c92a8184/config" \
-H "Content-Type: application/json" \
-d '{
  "activeAgents": [
    "1a449502-f5ec-4e87-b98d-2d158df18de6",
    "a94fdd86-ed2b-44f4-8e70-eb58450bc778",
    "d71e417f-2708-4564-a2df-f6f342c6f9ec"
  ],
  "defaultAgent": "1a449502-f5ec-4e87-b98d-2d158df18de6",
  "triggerConfig": {
    "initial": {
      "1a449502-f5ec-4e87-b98d-2d158df18de6": [
        {"keyword": "hola", "type": "contains", "priority": 5}
      ]
    },
    "switch": {
      "a94fdd86-ed2b-44f4-8e70-eb58450bc778": [
        {"keyword": "comprar", "type": "contains", "priority": 5}
      ],
      "d71e417f-2708-4564-a2df-f6f342c6f9ec": [
        {"keyword": "problema", "type": "contains", "priority": 5}
      ]
    },
    "fallback": []
  }
}'
```

## Flujo de Trabajo Correcto

1. **Configurar triggers** desde la pestaña "Activadores" del agente
2. **Guardar configuración** (se guarda en backend)
3. **Activar la red** con el endpoint `/agent-network/activate`
4. **Verificar estado** con `/agent-network/status`

## Estados en el Frontend

### Lista de Agentes:
- **"Habilitado"** = Agente está en la red de agentes configurada
- **"Ejecutándose"** = Agente activo principal (solo 1)
- **"Deshabilitado"** = No forma parte de la red

### En Setup de Agente (Pestaña Activadores):
- Muestra todos los agentes que forman la red
- Configura triggers para cada uno
- El sistema cambia automáticamente según las palabras clave

## Problemas Resueltos

1. ✅ Configuración multi-agente se guarda correctamente
2. ✅ Endpoint para activar toda la red simultáneamente
3. ✅ Estado claro de qué agentes están en la red
4. ✅ Triggers configurables por agente

## Siguiente Paso para el Frontend

El frontend debe:
1. Después de guardar configuración de triggers
2. Llamar automáticamente a `/agent-network/activate`
3. Mostrar estado correcto en la lista de agentes
4. Diferenciar entre "En red" vs "Agente activo principal"