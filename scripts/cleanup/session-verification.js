#!/usr/bin/env node

/**
 * SESSION VERIFICATION SCRIPT
 * Verificación completa del estado de sesiones de un usuario
 * 
 * Uso: node session-verification.js <userId>
 * Ejemplo: node session-verification.js test_user_001
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { exec } = require('child_process');

// Configuración
const SERVICE_ACCOUNT_PATH = './serviceAccountKey.json';
const DATA_V2_PATH = './data_v2';

// Colores para console.log
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logError(message) {
    log(`❌ ${message}`, 'red');
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
    log(`🔍 ${message}`, 'cyan');
}

function logSection(message) {
    log(`\n📋 ${message}`, 'bold');
}

// Verificar argumentos
const userId = process.argv[2];
if (!userId) {
    logError('Debes proporcionar un User ID como argumento');
    logInfo('Uso: node session-verification.js <userId>');
    logInfo('Ejemplo: node session-verification.js test_user_001');
    process.exit(1);
}

log(`🔍 VERIFICACIÓN DE SESIONES PARA USUARIO: ${userId}`, 'bold');

// Inicializar Firebase Admin SDK
let firestoreDb;
try {
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        throw new Error(`Archivo de credenciales no encontrado: ${SERVICE_ACCOUNT_PATH}`);
    }

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(SERVICE_ACCOUNT_PATH)
        });
    }
    firestoreDb = admin.firestore();
    logSuccess('Firebase Admin SDK inicializado');
} catch (error) {
    logError(`Error inicializando Firebase: ${error.message}`);
    process.exit(1);
}

/**
 * 1. VERIFICAR PROCESOS WORKER
 */
async function checkWorkerProcesses() {
    logSection('VERIFICACIÓN DE PROCESOS WORKER');
    
    return new Promise((resolve) => {
        exec(`ps aux | grep "worker.js ${userId}" | grep -v grep`, (error, stdout, stderr) => {
            if (error || !stdout.trim()) {
                logSuccess('No hay procesos worker activos para este usuario');
                resolve({ active: false, count: 0, pids: [] });
                return;
            }

            const lines = stdout.trim().split('\n');
            const pids = lines.map(line => line.split(/\s+/)[1]).filter(pid => pid);
            
            logWarning(`Encontrados ${pids.length} procesos worker activos`);
            pids.forEach(pid => {
                logInfo(`PID: ${pid}`);
            });
            
            resolve({ active: true, count: pids.length, pids });
        });
    });
}

/**
 * 2. VERIFICAR FIRESTORE
 */
async function checkFirestore() {
    logSection('VERIFICACIÓN DE FIRESTORE');
    
    const results = {
        userExists: false,
        collections: {},
        totalDocuments: 0
    };

    try {
        const userRef = firestoreDb.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
            logSuccess('Usuario no existe en Firestore');
            return results;
        }

        results.userExists = true;
        logWarning('Usuario existe en Firestore');

        // Verificar subcolecciones
        const collectionsToCheck = [
            'status',
            'agents', 
            'rules',
            'action_flows',
            'gemini_starters',
            'chats',
            'kanban_boards',
            'initial_triggers'
        ];

        for (const collectionName of collectionsToCheck) {
            try {
                const collectionRef = userRef.collection(collectionName);
                const snapshot = await collectionRef.get();
                
                results.collections[collectionName] = {
                    exists: true,
                    documentCount: snapshot.docs.length
                };
                
                results.totalDocuments += snapshot.docs.length;
                
                if (snapshot.docs.length > 0) {
                    logWarning(`Colección ${collectionName}: ${snapshot.docs.length} documentos`);
                    
                    // Si es chats, verificar subcolecciones de mensajes
                    if (collectionName === 'chats') {
                        let totalMessages = 0;
                        for (const chatDoc of snapshot.docs) {
                            const messageCollections = ['messages_all', 'messages_human', 'messages_bot', 'messages_contact'];
                            
                            for (const msgCollection of messageCollections) {
                                try {
                                    const msgSnapshot = await chatDoc.ref.collection(msgCollection).get();
                                    totalMessages += msgSnapshot.docs.length;
                                } catch (e) {
                                    // Ignorar errores de subcolecciones
                                }
                            }
                        }
                        
                        if (totalMessages > 0) {
                            logWarning(`Total de mensajes en chats: ${totalMessages}`);
                            results.collections[collectionName].totalMessages = totalMessages;
                            results.totalDocuments += totalMessages;
                        }
                    }
                } else {
                    logSuccess(`Colección ${collectionName}: vacía`);
                }
                
            } catch (collectionError) {
                logError(`Error verificando colección ${collectionName}: ${collectionError.message}`);
                results.collections[collectionName] = {
                    exists: false,
                    error: collectionError.message
                };
            }
        }

    } catch (error) {
        logError(`Error verificando Firestore: ${error.message}`);
    }

    return results;
}

/**
 * 3. VERIFICAR ARCHIVOS LOCALES
 */
async function checkLocalFiles() {
    logSection('VERIFICACIÓN DE ARCHIVOS LOCALES');
    
    const results = {
        userDirectoryExists: false,
        files: {},
        totalSize: 0
    };

    try {
        const userDataPath = path.join(DATA_V2_PATH, userId);
        
        if (!fs.existsSync(userDataPath)) {
            logSuccess('Directorio de datos local no existe');
            return results;
        }

        results.userDirectoryExists = true;
        logWarning('Directorio de datos local existe');

        // Verificar archivos y directorios específicos
        const itemsToCheck = [
            '.wwebjs_auth',
            'agent_config.json',
            'rules.json',
            'gemini-starters.json',
            'uploads'
        ];

        for (const item of itemsToCheck) {
            const itemPath = path.join(userDataPath, item);
            
            if (fs.existsSync(itemPath)) {
                const stats = fs.statSync(itemPath);
                const size = stats.isDirectory() ? getDirectorySize(itemPath) : stats.size;
                
                results.files[item] = {
                    exists: true,
                    isDirectory: stats.isDirectory(),
                    size: size,
                    lastModified: stats.mtime
                };
                
                results.totalSize += size;
                
                if (stats.isDirectory()) {
                    const fileCount = countFilesInDirectory(itemPath);
                    logWarning(`${item}/: ${fileCount} archivos (${formatBytes(size)})`);
                } else {
                    logWarning(`${item}: ${formatBytes(size)}`);
                }
            } else {
                logSuccess(`${item}: no existe`);
                results.files[item] = { exists: false };
            }
        }

    } catch (error) {
        logError(`Error verificando archivos locales: ${error.message}`);
    }

    return results;
}

/**
 * 4. VERIFICAR CONEXIONES WEBSOCKET
 */
async function checkWebSocketConnections() {
    logSection('VERIFICACIÓN DE CONEXIONES WEBSOCKET');
    
    // Nota: Esto requeriría acceso al servidor principal
    // Por ahora, solo informamos
    logInfo('Las conexiones WebSocket se verifican en el servidor principal');
    logInfo('Para verificar conexiones activas, consulta el endpoint /users/:userId/status');
    
    return { note: 'Verificar en servidor principal' };
}

/**
 * 5. VERIFICAR CACHE EN MEMORIA
 */
async function checkMemoryCache() {
    logSection('VERIFICACIÓN DE CACHE EN MEMORIA');
    
    logInfo('El cache en memoria se limpia automáticamente con la terminación del worker');
    logInfo('Si hay procesos worker activos, el cache está en uso');
    
    return { note: 'Cache se limpia con worker' };
}

// Funciones auxiliares
function getDirectorySize(dirPath) {
    let totalSize = 0;
    
    try {
        const items = fs.readdirSync(dirPath);
        
        for (const item of items) {
            const itemPath = path.join(dirPath, item);
            const stats = fs.statSync(itemPath);
            
            if (stats.isDirectory()) {
                totalSize += getDirectorySize(itemPath);
            } else {
                totalSize += stats.size;
            }
        }
    } catch (error) {
        // Ignorar errores de acceso
    }
    
    return totalSize;
}

function countFilesInDirectory(dirPath) {
    let count = 0;
    
    try {
        const items = fs.readdirSync(dirPath);
        
        for (const item of items) {
            const itemPath = path.join(dirPath, item);
            const stats = fs.statSync(itemPath);
            
            if (stats.isDirectory()) {
                count += countFilesInDirectory(itemPath);
            } else {
                count++;
            }
        }
    } catch (error) {
        // Ignorar errores de acceso
    }
    
    return count;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * FUNCIÓN PRINCIPAL
 */
async function verifySessions() {
    const startTime = Date.now();
    
    try {
        log('🔍 INICIANDO VERIFICACIÓN COMPLETA DE SESIONES', 'bold');
        log(`📅 Timestamp: ${new Date().toISOString()}`, 'cyan');
        log(`👤 Usuario: ${userId}`, 'cyan');
        log('', 'reset');

        // Ejecutar verificaciones
        const workerStatus = await checkWorkerProcesses();
        const firestoreStatus = await checkFirestore();
        const localFilesStatus = await checkLocalFiles();
        const websocketStatus = await checkWebSocketConnections();
        const memoryStatus = await checkMemoryCache();

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        // Resumen final
        logSection('RESUMEN DE VERIFICACIÓN');
        
        const hasActiveSessions = workerStatus.active || 
                                firestoreStatus.userExists || 
                                localFilesStatus.userDirectoryExists;

        if (hasActiveSessions) {
            logWarning('⚠️  SE DETECTARON SESIONES ACTIVAS');
            
            if (workerStatus.active) {
                logError(`❌ ${workerStatus.count} procesos worker activos`);
            }
            
            if (firestoreStatus.userExists) {
                logError(`❌ Usuario existe en Firestore con ${firestoreStatus.totalDocuments} documentos`);
            }
            
            if (localFilesStatus.userDirectoryExists) {
                logError(`❌ Archivos locales existen (${formatBytes(localFilesStatus.totalSize)})`);
            }
            
        } else {
            logSuccess('✅ NO SE DETECTARON SESIONES ACTIVAS');
        }

        log('', 'reset');
        log('📊 ESTADÍSTICAS DETALLADAS:', 'bold');
        log(`⏱️  Duración de verificación: ${duration.toFixed(2)} segundos`, 'cyan');
        log(`🔧 Procesos worker: ${workerStatus.count}`, 'blue');
        log(`🗄️  Documentos Firestore: ${firestoreStatus.totalDocuments}`, 'blue');
        log(`💾 Tamaño archivos locales: ${formatBytes(localFilesStatus.totalSize)}`, 'blue');

        // Guardar reporte
        const report = {
            timestamp: new Date().toISOString(),
            userId,
            duration,
            hasActiveSessions,
            workerStatus,
            firestoreStatus,
            localFilesStatus,
            websocketStatus,
            memoryStatus
        };

        const reportFile = `verification-report-${userId}-${Date.now()}.json`;
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
        logInfo(`📄 Reporte guardado en: ${reportFile}`);

        return report;

    } catch (error) {
        logError(`Error crítico durante la verificación: ${error.message}`);
        throw error;
    }
}

// Ejecutar verificación
verifySessions().then((report) => {
    process.exit(0);
}).catch((error) => {
    logError(`Error fatal: ${error.message}`);
    process.exit(1);
}); 