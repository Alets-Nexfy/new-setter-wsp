#!/bin/bash

# PRODUCTION SETUP SCRIPT
# Configuración para VPS con dominio real: https://alets.com.ar/setter-api

echo "🚀 CONFIGURANDO ENTORNO DE PRODUCCIÓN"
echo "======================================"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para logs
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Verificar si estamos en el VPS
if [ -z "$VPS_ENVIRONMENT" ]; then
    log_warning "No se detectó variable VPS_ENVIRONMENT"
    log_info "Si estás en el VPS, ejecuta: export VPS_ENVIRONMENT=true"
fi

# CONFIGURACIÓN DE PRODUCCIÓN
API_BASE_URL="https://alets.com.ar/setter-api"
API_SECRET_KEY="${API_SECRET_KEY:-$(openssl rand -hex 32)}" # Usa variable de entorno o genera una nueva
VPS_API_PATH="/var/www/whatsapp-api"

log_info "Configurando para API: $API_BASE_URL"

# 1. Verificar dependencias
log_info "1. Verificando dependencias..."

if ! command -v node &> /dev/null; then
    log_error "Node.js no está instalado"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    log_error "npm no está instalado"
    exit 1
fi

log_success "Node.js y npm están instalados"

# 2. Verificar archivo de credenciales
log_info "2. Verificando credenciales Firebase..."

if [ ! -f "serviceAccountKey.json" ]; then
    log_error "Archivo serviceAccountKey.json no encontrado"
    log_info "Asegúrate de tener las credenciales de Firebase en el directorio actual"
    exit 1
fi

log_success "Credenciales Firebase encontradas"

# 3. Instalar dependencias
log_info "3. Instalando dependencias..."

if [ -f "package.json" ]; then
    npm install
    log_success "Dependencias instaladas"
else
    log_warning "package.json no encontrado, instalando solo firebase-admin"
    npm install firebase-admin
fi

# 4. Verificar estructura de directorios
log_info "4. Verificando estructura de directorios..."

if [ ! -d "data_v2" ]; then
    log_info "Creando directorio data_v2..."
    mkdir -p data_v2
    log_success "Directorio data_v2 creado"
else
    log_success "Directorio data_v2 existe"
fi

# 5. Configurar variables de entorno
log_info "5. Configurando variables de entorno..."

# Crear archivo .env si no existe
if [ ! -f ".env" ]; then
    cat > .env << EOF
# Configuración de Producción
API_BASE_URL=$API_BASE_URL
API_SECRET_KEY=$API_SECRET_KEY
VPS_API_PATH=$VPS_API_PATH
NODE_ENV=production

# Firebase
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json

# Gemini AI (si se usa)
GEMINI_API_KEY=your_gemini_api_key_here
EOF
    log_success "Archivo .env creado"
else
    log_warning "Archivo .env ya existe, verifica la configuración manualmente"
fi

# 6. Dar permisos de ejecución a los scripts
log_info "6. Configurando permisos de ejecución..."

chmod +x nuclear-session-cleanup-production.js
chmod +x nuclear-bulk-cleanup.js
chmod +x session-verification.js

log_success "Permisos configurados"

# 7. Crear script de limpieza rápida
log_info "7. Creando script de limpieza rápida..."

cat > cleanup-user.sh << 'EOF'
#!/bin/bash

# SCRIPT DE LIMPIEZA RÁPIDA PARA PRODUCCIÓN
# Uso: ./cleanup-user.sh <userId>

if [ -z "$1" ]; then
    echo "❌ Error: Debes proporcionar un User ID"
    echo "Uso: ./cleanup-user.sh <userId>"
    echo "Ejemplo: ./cleanup-user.sh test_user_001"
    exit 1
fi

USER_ID=$1
echo "🚀 Limpiando usuario: $USER_ID"

# Cargar variables de entorno
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Ejecutar limpieza
node nuclear-session-cleanup-production.js "$USER_ID"

echo "✅ Limpieza completada para: $USER_ID"
EOF

chmod +x cleanup-user.sh
log_success "Script de limpieza rápida creado: cleanup-user.sh"

# 7.5. Crear script de limpieza de sesiones WhatsApp
log_info "7.5. Creando script de limpieza de sesiones WhatsApp..."

cat > cleanup-whatsapp-session.sh << 'EOF'
#!/bin/bash

# SCRIPT DE LIMPIEZA DE SESIONES WHATSAPP PARA PRODUCCIÓN
# Uso: ./cleanup-whatsapp-session.sh <userId>
# SOLO elimina sesiones WhatsApp, preserva agentes, tableros y otros datos

if [ -z "$1" ]; then
    echo "❌ Error: Debes proporcionar un User ID"
    echo "Uso: ./cleanup-whatsapp-session.sh <userId>"
    echo "Ejemplo: ./cleanup-whatsapp-session.sh test_user_001"
    echo ""
    echo "📱 Este script SOLO elimina sesiones WhatsApp"
    echo "🤖 Preserva agentes IA, tableros Kanban y otros datos"
    exit 1
fi

USER_ID=$1
echo "📱 Limpiando ÚNICAMENTE sesiones WhatsApp para: $USER_ID"
echo "🤖 Agentes IA, tableros Kanban y otros datos se PRESERVARÁN"
echo ""

# Cargar variables de entorno
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Ejecutar limpieza de sesiones WhatsApp
node whatsapp-session-cleanup.js "$USER_ID"

echo ""
echo "✅ Limpieza de sesiones WhatsApp completada para: $USER_ID"
echo "🤖 Verifica que los agentes y tableros siguen intactos"
EOF

chmod +x cleanup-whatsapp-session.sh
log_success "Script de limpieza de sesiones WhatsApp creado: cleanup-whatsapp-session.sh"

# 8. Crear script de verificación rápida
log_info "8. Creando script de verificación rápida..."

cat > verify-user.sh << 'EOF'
#!/bin/bash

# SCRIPT DE VERIFICACIÓN RÁPIDA PARA PRODUCCIÓN
# Uso: ./verify-user.sh <userId>

if [ -z "$1" ]; then
    echo "❌ Error: Debes proporcionar un User ID"
    echo "Uso: ./verify-user.sh <userId>"
    echo "Ejemplo: ./verify-user.sh test_user_001"
    exit 1
fi

USER_ID=$1
echo "🔍 Verificando usuario: $USER_ID"

# Cargar variables de entorno
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Ejecutar verificación
node session-verification.js "$USER_ID"

echo "✅ Verificación completada para: $USER_ID"
EOF

chmod +x verify-user.sh
log_success "Script de verificación rápida creado: verify-user.sh"

# 8.5. Crear script de verificación de sesiones WhatsApp
log_info "8.5. Creando script de verificación de sesiones WhatsApp..."

cat > verify-whatsapp-session.sh << 'EOF'
#!/bin/bash

# SCRIPT DE VERIFICACIÓN DE SESIONES WHATSAPP PARA PRODUCCIÓN
# Uso: ./verify-whatsapp-session.sh <userId>
# SOLO verifica sesiones WhatsApp, no agentes ni tableros

if [ -z "$1" ]; then
    echo "❌ Error: Debes proporcionar un User ID"
    echo "Uso: ./verify-whatsapp-session.sh <userId>"
    echo "Ejemplo: ./verify-whatsapp-session.sh test_user_001"
    echo ""
    echo "📱 Este script SOLO verifica sesiones WhatsApp"
    echo "🤖 No verifica agentes IA, tableros Kanban ni otros datos"
    exit 1
fi

USER_ID=$1
echo "📱 Verificando ÚNICAMENTE sesiones WhatsApp para: $USER_ID"
echo "🤖 Agentes IA, tableros Kanban y otros datos NO se verifican"
echo ""

# Cargar variables de entorno
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Ejecutar verificación de sesiones WhatsApp
node verify-whatsapp-session.js "$USER_ID"

echo ""
echo "✅ Verificación de sesiones WhatsApp completada para: $USER_ID"
EOF

chmod +x verify-whatsapp-session.sh
log_success "Script de verificación de sesiones WhatsApp creado: verify-whatsapp-session.sh"

# 9. Crear script de limpieza masiva
log_info "9. Creando script de limpieza masiva..."

cat > cleanup-bulk.sh << 'EOF'
#!/bin/bash

# SCRIPT DE LIMPIEZA MASIVA PARA PRODUCCIÓN
# Uso: ./cleanup-bulk.sh <archivo_usuarios> | <user1,user2,user3>

if [ -z "$1" ]; then
    echo "❌ Error: Debes proporcionar un archivo de usuarios o lista"
    echo "Uso: ./cleanup-bulk.sh <archivo_usuarios> | <user1,user2,user3>"
    echo "Ejemplo: ./cleanup-bulk.sh users.txt"
    echo "Ejemplo: ./cleanup-bulk.sh \"user1,user2,user3\""
    exit 1
fi

INPUT=$1
echo "🚀 Iniciando limpieza masiva..."

# Cargar variables de entorno
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Ejecutar limpieza masiva
node nuclear-bulk-cleanup.js "$INPUT"

echo "✅ Limpieza masiva completada"
EOF

chmod +x cleanup-bulk.sh
log_success "Script de limpieza masiva creado: cleanup-bulk.sh"

# 10. Verificación final
log_info "10. Verificación final..."

echo ""
echo "🎉 CONFIGURACIÓN DE PRODUCCIÓN COMPLETADA"
echo "=========================================="
echo ""
echo "📋 SCRIPTS DISPONIBLES:"
echo "  • ./cleanup-user.sh <userId>           - Limpiar usuario individual (TODO)"
echo "  • ./cleanup-whatsapp-session.sh <userId> - Limpiar SOLO sesiones WhatsApp"
echo "  • ./verify-user.sh <userId>            - Verificar estado completo de usuario"
echo "  • ./verify-whatsapp-session.sh <userId> - Verificar SOLO sesiones WhatsApp"
echo "  • ./cleanup-bulk.sh <archivo>          - Limpieza masiva"
echo ""
echo "📋 CONFIGURACIÓN:"
echo "  • API Base URL: $API_BASE_URL"
echo "  • VPS API Path: $VPS_API_PATH"
echo "  • Archivo .env: Configurado"
echo ""
echo "⚠️  RECUERDA:"
echo "  • Verificar la API_SECRET_KEY en .env"
echo "  • Configurar GEMINI_API_KEY si usas IA"
echo "  • Probar con un usuario de prueba primero"
echo ""
echo "🚀 LISTO PARA USAR EN PRODUCCIÓN" 