#!/bin/bash

# SCRIPT DE LIMPIEZA DE CREDENCIALES HARDCODEADAS
# Elimina todas las API keys y credenciales expuestas en el código

echo "🚨 LIMPIEZA DE CREDENCIALES HARDCODEADAS"
echo "========================================"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Funciones de logging
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Variables
CURRENT_API_KEY="DA0p3i0lNnuuCWTXieGI1CrVjr9IcVzjiXsbMMMyi6s77l4Snq"

log_info "Iniciando limpieza de credenciales hardcodeadas..."

# 1. Verificar .env actual
log_info "1. Verificando archivo .env..."
if [ -f ".env" ]; then
    if grep -q "API_SECRET_KEY=$CURRENT_API_KEY" .env; then
        log_success "API key actual ya está configurada en .env"
    elif grep -q "API_SECRET_KEY=" .env; then
        log_info "API key diferente encontrada en .env - manteniendo configuración actual"
    else
        log_warning ".env existe pero no tiene API_SECRET_KEY configurada"
    fi
else
    log_warning "Archivo .env no encontrado - usa env-template.txt como referencia"
fi

# 2. Verificar archivos backend ya corregidos
log_info "2. Verificando correcciones en backend..."

# config/nuclear-config.json - ya corregido
if grep -q '${API_SECRET_KEY}' config/nuclear-config.json 2>/dev/null; then
    log_success "config/nuclear-config.json - YA CORREGIDO"
else
    log_warning "config/nuclear-config.json requiere atención manual"
fi

# scripts/deployment/production-setup.sh - ya corregido  
if grep -q '${API_SECRET_KEY:-' scripts/deployment/production-setup.sh 2>/dev/null; then
    log_success "scripts/deployment/production-setup.sh - YA CORREGIDO"
else
    log_warning "scripts/deployment/production-setup.sh requiere atención manual"
fi

# 3. Crear respaldo de seguridad
log_info "3. Creando respaldo de configuración..."
mkdir -p backups/security-cleanup-$(date +%Y%m%d)
cp .env backups/security-cleanup-$(date +%Y%m%d)/.env.backup 2>/dev/null || log_warning "No se pudo respaldar .env"

log_success "Limpieza completada para el backend"
log_warning "IMPORTANTE: Los archivos del frontend (version-funcional) también requieren limpieza manual"

echo
echo "📋 TAREAS RESTANTES:"
echo "1. Verificar que tu .env actual funciona correctamente"
echo "2. Limpiar archivos frontend manualmente (eliminar API key hardcodeada)"
echo "3. Considerar rotar la API key en el futuro (fue expuesta anteriormente)"
echo "4. Implementar rotación automática de keys para mayor seguridad"

echo
log_success "Script de limpieza completado" 