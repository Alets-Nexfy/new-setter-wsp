# 🚀 INSTRUCCIONES MANUALES: SETUP SUPABASE

## 📋 PASOS OBLIGATORIOS ANTES DE MIGRACIÓN

### 🎯 PASO 1: CREAR PROYECTO SUPABASE

1. **Acceder a Supabase Dashboard**
   ```
   https://supabase.com/dashboard
   ```

2. **Crear Nuevo Proyecto**
   - Click "New Project"
   - Name: `whatsapp-api-v2-prod`
   - Organization: Tu organización
   - Region: `us-east-1` (recomendado para mejor latencia)
   - Database Password: **[GUARDAR PASSWORD SEGURO]**

3. **Esperar Inicialización**
   - El proyecto tardará 2-3 minutos en inicializarse
   - ✅ Confirmar que el status sea "Healthy"

### 🔧 PASO 2: CONFIGURAR VARIABLES DE ENTORNO

Una vez creado el proyecto, obtener estas variables:

```bash
# En el Dashboard de Supabase > Settings > API
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Agregar a tu archivo .env:**
```bash
# Supabase Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Mantener Firebase temporalmente durante migración
FIREBASE_PROJECT_ID=your-firebase-project
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
```

### 🗄️ PASO 3: EJECUTAR SQL SCHEMA (OBLIGATORIO)

**Ir a Supabase Dashboard > SQL Editor y ejecutar en este orden:**

#### 3.1 Crear Schema Principal
```sql
-- Copiar y pegar contenido completo de: sql/01_create_schema.sql
-- Esto creará todas las tablas necesarias
```

#### 3.2 Crear Índices de Performance
```sql
-- Copiar y pegar contenido completo de: sql/02_create_indexes.sql
-- Esto optimizará las consultas de la aplicación
```

#### 3.3 Crear Triggers
```sql
-- Copiar y pegar contenido completo de: sql/03_create_triggers.sql
-- Esto habilitará timestamps automáticos
```

#### 3.4 Configurar Row Level Security (Opcional para desarrollo)
```sql
-- Copiar y pegar contenido completo de: sql/04_create_rls_policies.sql
-- Esto asegurará la aplicación en producción
```

### 🪣 PASO 4: CONFIGURAR STORAGE

En **Supabase Dashboard > Storage**:

1. **Crear Buckets:**
   - `user-uploads` (Private)
   - `chat-media` (Private)  
   - `qr-codes` (Private)

2. **Configurar Políticas de Storage:**
```sql
-- Ejecutar en SQL Editor
CREATE POLICY "Users can upload their own files" ON storage.objects 
FOR INSERT WITH CHECK (
  bucket_id = 'user-uploads' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own files" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'user-uploads' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### ✅ PASO 5: VERIFICAR CONFIGURACIÓN

Ejecutar el test de conexión:
```bash
npm run test:supabase-connection
```

**Output esperado:**
```
✅ Supabase connection successful!
✅ Basic query successful
🎉 Supabase connection test completed!
```

## 🚨 PROBLEMAS COMUNES Y SOLUCIONES

### ❌ Error: "Missing required Supabase environment variables"
**Solución:** Verificar que las variables estén en el archivo `.env`

### ❌ Error: "relation does not exist"
**Solución:** Ejecutar los archivos SQL en el orden correcto

### ❌ Error: Connection timeout
**Solución:** Verificar que la región del proyecto sea la correcta

### ❌ Error: "Invalid API key"
**Solución:** Regenerar las keys en Dashboard > Settings > API

## 📊 CHECKLIST DE VERIFICACIÓN

- [ ] ✅ Proyecto Supabase creado y healthy
- [ ] ✅ Variables de entorno configuradas
- [ ] ✅ Schema SQL ejecutado (4 archivos)
- [ ] ✅ Storage buckets creados
- [ ] ✅ Políticas de storage configuradas
- [ ] ✅ Test de conexión exitoso
- [ ] ✅ Todas las tablas visibles en Dashboard

## 🎯 SIGUIENTE PASO

Una vez completada esta configuración manual:

```bash
# Ejecutar migración de datos
npm run migrate:data
```

## 📞 SOPORTE

Si encuentras problemas:
1. Verificar logs en Supabase Dashboard > Logs
2. Comprobar que la región sea la correcta
3. Verificar que el proyecto esté en estado "Healthy"
4. Regenerar API keys si es necesario

---

⚠️ **IMPORTANTE**: No continuar con la migración de datos hasta completar todos estos pasos manuales.