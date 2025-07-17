#!/usr/bin/env node

/**
 * NUCLEAR BULK SESSION CLEANUP SCRIPT
 * Eliminación masiva de sesiones para múltiples usuarios
 * 
 * Uso: node nuclear-bulk-cleanup.js <userIds_file> | <user1,user2,user3>
 * Ejemplo: node nuclear-bulk-cleanup.js users.txt
 * Ejemplo: node nuclear-bulk-cleanup.js "user1,user2,user3"
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Colores para console.log
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logError(message) {
    log(`❌ ERROR: ${message}`, 'red');
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

function logStep(message) {
    log(`🔧 ${message}`, 'cyan');
}

// Obtener lista de usuarios
function getUserIds() {
    const input = process.argv[2];
    
    if (!input) {
        logError('Debes proporcionar un archivo de usuarios o lista separada por comas');
        logInfo('Uso: node nuclear-bulk-cleanup.js <userIds_file> | <user1,user2,user3>');
        logInfo('Ejemplo: node nuclear-bulk-cleanup.js users.txt');
        logInfo('Ejemplo: node nuclear-bulk-cleanup.js "user1,user2,user3"');
        process.exit(1);
    }

    // Verificar si es un archivo
    if (fs.existsSync(input)) {
        try {
            const content = fs.readFileSync(input, 'utf8');
            return content.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'))
                .filter(line => line.length > 0);
        } catch (error) {
            logError(`Error leyendo archivo ${input}: ${error.message}`);
            process.exit(1);
        }
    } else {
        // Es una lista separada por comas
        return input.split(',')
            .map(user => user.trim())
            .filter(user => user.length > 0);
    }
}

// Ejecutar limpieza para un usuario
async function cleanupUser(userId) {
    return new Promise((resolve, reject) => {
        logStep(`Limpiando usuario: ${userId}`);
        
        const cleanupProcess = spawn('node', ['nuclear-session-cleanup.js', userId], {
            stdio: 'pipe'
        });

        let output = '';
        let errorOutput = '';

        cleanupProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        cleanupProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        cleanupProcess.on('close', (code) => {
            if (code === 0) {
                logSuccess(`Usuario ${userId} limpiado exitosamente`);
                resolve({ userId, success: true, output });
            } else {
                logError(`Error limpiando usuario ${userId} (código: ${code})`);
                resolve({ userId, success: false, error: errorOutput, output });
            }
        });

        cleanupProcess.on('error', (error) => {
            logError(`Error ejecutando limpieza para ${userId}: ${error.message}`);
            reject(error);
        });
    });
}

// Función principal
async function bulkCleanup() {
    const userIds = getUserIds();
    
    if (userIds.length === 0) {
        logError('No se encontraron usuarios para limpiar');
        process.exit(1);
    }

    log(`🚀 INICIANDO LIMPIEZA MASIVA PARA ${userIds.length} USUARIOS`, 'bold');
    log(`📅 Timestamp: ${new Date().toISOString()}`, 'cyan');
    log('', 'reset');

    const results = [];
    const startTime = Date.now();

    // Limpiar usuarios en paralelo (máximo 3 a la vez para evitar sobrecarga)
    const batchSize = 3;
    for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        
        logStep(`Procesando lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(userIds.length/batchSize)}`);
        
        const batchPromises = batch.map(userId => cleanupUser(userId));
        const batchResults = await Promise.all(batchPromises);
        
        results.push(...batchResults);
        
        // Pausa entre lotes para evitar sobrecarga
        if (i + batchSize < userIds.length) {
            logInfo('Pausa de 2 segundos entre lotes...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // Resumen final
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    log('', 'reset');
    log('🎉 LIMPIEZA MASIVA COMPLETADA', 'bold');
    log(`⏱️  Duración total: ${duration.toFixed(2)} segundos`, 'green');
    log(`✅ Usuarios limpiados exitosamente: ${successful}`, 'green');
    log(`❌ Usuarios con errores: ${failed}`, failed > 0 ? 'red' : 'green');
    log('', 'reset');

    // Mostrar errores si los hay
    if (failed > 0) {
        log('📋 DETALLES DE ERRORES:', 'yellow');
        results.filter(r => !r.success).forEach(result => {
            log(`❌ ${result.userId}: ${result.error || 'Error desconocido'}`, 'red');
        });
    }

    // Guardar reporte
    const report = {
        timestamp: new Date().toISOString(),
        totalUsers: userIds.length,
        successful,
        failed,
        duration,
        results
    };

    const reportFile = `cleanup-report-${Date.now()}.json`;
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    logInfo(`📄 Reporte guardado en: ${reportFile}`);

    process.exit(failed > 0 ? 1 : 0);
}

// Ejecutar limpieza masiva
bulkCleanup().catch(error => {
    logError(`Error fatal en limpieza masiva: ${error.message}`);
    process.exit(1);
}); 