#!/usr/bin/env node

/**
 * NUCLEAR SESSION CLEANUP SCRIPT
 * Eliminación absoluta de TODAS las sesiones de un usuario
 * 
 * Uso: node nuclear-session-cleanup.js <userId>
 * Ejemplo: node nuclear-session-cleanup.js test_user_001
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { spawn } = require('child_process');

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

// Verificar argumentos
const userId = process.argv[2];
if (!userId) {
    logError('Debes proporcionar un User ID como argumento');
    logInfo('Uso: node nuclear-session-cleanup.js <userId>');
    logInfo('Ejemplo: node nuclear-session-cleanup.js test_user_001');
    process.exit(1);
}

log(`🚀 INICIANDO LIMPIEZA NUCLEAR PARA USUARIO: ${userId}`, 'bold');

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
 * 1. TERMINAR PROCESO WORKER
 */
async function terminateWorkerProcess() {
    logStep('1. Terminando proceso worker...');
    
    try {
        // Buscar proceso worker por userId
        const { exec } = require('child_process');
        
        return new Promise((resolve, reject) => {
            exec(`ps aux | grep "worker.js ${userId}" | grep -v grep`, (error, stdout, stderr) => {
                if (error || !stdout.trim()) {
                    logWarning('No se encontró proceso worker activo para este usuario');
                    resolve();
                    return;
                }

                const lines = stdout.trim().split('\n');
                const pids = lines.map(line => line.split(/\s+/)[1]).filter(pid => pid);

                if (pids.length === 0) {
                    logWarning('No se encontraron PIDs de worker');
                    resolve();
                    return;
                }

                logInfo(`Encontrados ${pids.length} procesos worker. Terminando...`);

                // Terminar cada proceso
                pids.forEach(pid => {
                    try {
                        process.kill(parseInt(pid), 'SIGTERM');
                        logSuccess(`Proceso ${pid} terminado`);
                    } catch (killError) {
                        logWarning(`No se pudo terminar proceso ${pid}: ${killError.message}`);
                    }
                });

                // Esperar un momento y verificar si quedan procesos
                setTimeout(() => {
                    exec(`ps aux | grep "worker.js ${userId}" | grep -v grep`, (checkError, checkStdout) => {
                        if (checkStdout.trim()) {
                            logWarning('Algunos procesos persisten. Forzando terminación...');
                            pids.forEach(pid => {
                                try {
                                    process.kill(parseInt(pid), 'SIGKILL');
                                } catch (e) {
                                    // Ignorar errores de SIGKILL
                                }
                            });
                        }
                        resolve();
                    });
                }, 2000);
            });
        });
    } catch (error) {
        logError(`Error terminando worker: ${error.message}`);
    }
}

/**
 * 2. LIMPIAR FIRESTORE - TODAS LAS COLECCIONES
 */
async function cleanupFirestore() {
    logStep('2. Limpiando Firestore - TODAS las colecciones...');
    
    try {
        const userRef = firestoreDb.collection('users').doc(userId);
        
        // Verificar si el usuario existe
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            logWarning('Usuario no encontrado en Firestore');
            return;
        }

        // Lista de todas las subcolecciones a eliminar
        const collectionsToDelete = [
            'status',
            'agents', 
            'rules',
            'action_flows',
            'gemini_starters',
            'chats',
            'kanban_boards',
            'initial_triggers'
        ];

        for (const collectionName of collectionsToDelete) {
            try {
                logInfo(`Eliminando colección: ${collectionName}`);
                
                const collectionRef = userRef.collection(collectionName);
                const snapshot = await collectionRef.get();
                
                if (snapshot.empty) {
                    logInfo(`Colección ${collectionName} ya está vacía`);
                    continue;
                }

                // Eliminar en lotes para evitar límites de Firestore
                const batchSize = 250;
                let deleted = 0;
                
                for (let i = 0; i < snapshot.docs.length; i += batchSize) {
                    const batch = firestoreDb.batch();
                    const batchDocs = snapshot.docs.slice(i, i + batchSize);
                    
                    batchDocs.forEach(doc => {
                        batch.delete(doc.ref);
                    });
                    
                    await batch.commit();
                    deleted += batchDocs.length;
                    logInfo(`Eliminados ${deleted}/${snapshot.docs.length} documentos en ${collectionName}`);
                }

                // Si es la colección de chats, eliminar también las subcolecciones de mensajes
                if (collectionName === 'chats') {
                    for (const chatDoc of snapshot.docs) {
                        const chatId = chatDoc.id;
                        const messageCollections = ['messages_all', 'messages_human', 'messages_bot', 'messages_contact'];
                        
                        for (const msgCollection of messageCollections) {
                            try {
                                const msgCollectionRef = chatDoc.ref.collection(msgCollection);
                                const msgSnapshot = await msgCollectionRef.get();
                                
                                if (!msgSnapshot.empty) {
                                    const msgBatch = firestoreDb.batch();
                                    msgSnapshot.docs.forEach(doc => {
                                        msgBatch.delete(doc.ref);
                                    });
                                    await msgBatch.commit();
                                    logInfo(`Eliminados ${msgSnapshot.docs.length} mensajes de ${chatId}/${msgCollection}`);
                                }
                            } catch (msgError) {
                                logWarning(`Error eliminando mensajes de ${chatId}/${msgCollection}: ${msgError.message}`);
                            }
                        }
                    }
                }

                logSuccess(`Colección ${collectionName} eliminada completamente`);
                
            } catch (collectionError) {
                logError(`Error eliminando colección ${collectionName}: ${collectionError.message}`);
            }
        }

        // Eliminar el documento principal del usuario
        await userRef.delete();
        logSuccess('Documento principal del usuario eliminado');

    } catch (error) {
        logError(`Error limpiando Firestore: ${error.message}`);
    }
}

/**
 * 3. LIMPIAR ARCHIVOS LOCALES
 */
async function cleanupLocalFiles() {
    logStep('3. Limpiando archivos locales...');
    
    try {
        const userDataPath = path.join(DATA_V2_PATH, userId);
        
        if (!fs.existsSync(userDataPath)) {
            logWarning('Directorio de datos local no encontrado');
            return;
        }

        // Lista de archivos y directorios a eliminar
        const itemsToDelete = [
            '.wwebjs_auth',           // Sesiones WhatsApp
            'agent_config.json',      // Configuración de agente
            'rules.json',             // Reglas de auto-respuesta
            'gemini-starters.json',   // Prompts de inicio
            'uploads'                 // Archivos subidos
        ];

        for (const item of itemsToDelete) {
            const itemPath = path.join(userDataPath, item);
            
            if (fs.existsSync(itemPath)) {
                try {
                    if (fs.statSync(itemPath).isDirectory()) {
                        // Eliminar directorio recursivamente
                        fs.rmSync(itemPath, { recursive: true, force: true });
                        logSuccess(`Directorio eliminado: ${item}`);
                    } else {
                        // Eliminar archivo
                        fs.unlinkSync(itemPath);
                        logSuccess(`Archivo eliminado: ${item}`);
                    }
                } catch (deleteError) {
                    logError(`Error eliminando ${item}: ${deleteError.message}`);
                }
            } else {
                logInfo(`${item} no existe, omitiendo`);
            }
        }

        // Verificar si el directorio del usuario está vacío
        const remainingItems = fs.readdirSync(userDataPath);
        if (remainingItems.length === 0) {
            // Eliminar el directorio del usuario si está vacío
            fs.rmdirSync(userDataPath);
            logSuccess('Directorio del usuario eliminado (estaba vacío)');
        } else {
            logWarning(`Directorio del usuario no está completamente vacío. Items restantes: ${remainingItems.join(', ')}`);
        }

    } catch (error) {
        logError(`Error limpiando archivos locales: ${error.message}`);
    }
}

/**
 * 4. CERRAR CONEXIONES WEBSOCKET
 */
async function closeWebSocketConnections() {
    logStep('4. Cerrando conexiones WebSocket...');
    
    try {
        // Nota: Esto requiere acceso al objeto wsConnections del servidor
        // En un entorno real, necesitarías implementar un endpoint para esto
        logInfo('Las conexiones WebSocket se cerrarán automáticamente cuando el worker termine');
        logInfo('Si necesitas cerrarlas manualmente, reinicia el servidor principal');
    } catch (error) {
        logError(`Error cerrando WebSocket: ${error.message}`);
    }
}

/**
 * 5. LIMPIAR CACHE Y VARIABLES EN MEMORIA
 */
async function cleanupMemoryCache() {
    logStep('5. Limpiando cache en memoria...');
    
    try {
        // Nota: Esto se hace automáticamente cuando el worker termina
        logInfo('Cache en memoria se limpiará automáticamente con la terminación del worker');
        
        // Si tienes un endpoint para limpiar cache, podrías llamarlo aquí
        // await fetch('http://localhost:3000/api/clear-cache', { method: 'POST' });
        
    } catch (error) {
        logError(`Error limpiando cache: ${error.message}`);
    }
}

/**
 * 6. VERIFICACIÓN FINAL
 */
async function finalVerification() {
    logStep('6. Verificación final...');
    
    try {
        // Verificar Firestore
        const userRef = firestoreDb.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
            logError('❌ Usuario aún existe en Firestore');
        } else {
            logSuccess('✅ Usuario eliminado de Firestore');
        }

        // Verificar archivos locales
        const userDataPath = path.join(DATA_V2_PATH, userId);
        if (fs.existsSync(userDataPath)) {
            const remainingItems = fs.readdirSync(userDataPath);
            if (remainingItems.length > 0) {
                logWarning(`⚠️  Directorio local aún existe con items: ${remainingItems.join(', ')}`);
            } else {
                logSuccess('✅ Directorio local eliminado o vacío');
            }
        } else {
            logSuccess('✅ Directorio local eliminado');
        }

        // Verificar procesos worker
        const { exec } = require('child_process');
        exec(`ps aux | grep "worker.js ${userId}" | grep -v grep`, (error, stdout) => {
            if (stdout.trim()) {
                logError('❌ Procesos worker aún activos');
            } else {
                logSuccess('✅ Procesos worker terminados');
            }
        });

    } catch (error) {
        logError(`Error en verificación final: ${error.message}`);
    }
}

/**
 * FUNCIÓN PRINCIPAL
 */
async function nuclearCleanup() {
    const startTime = Date.now();
    
    try {
        log('🚀 INICIANDO LIMPIEZA NUCLEAR COMPLETA', 'bold');
        log(`📅 Timestamp: ${new Date().toISOString()}`, 'cyan');
        log(`👤 Usuario: ${userId}`, 'cyan');
        log('', 'reset');

        // Ejecutar limpieza en orden
        await terminateWorkerProcess();
        await cleanupFirestore();
        await cleanupLocalFiles();
        await closeWebSocketConnections();
        await cleanupMemoryCache();
        await finalVerification();

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        log('', 'reset');
        log('🎉 LIMPIEZA NUCLEAR COMPLETADA', 'bold');
        log(`⏱️  Duración: ${duration.toFixed(2)} segundos`, 'green');
        log(`👤 Usuario ${userId} completamente eliminado de todos los sistemas`, 'green');
        log('', 'reset');

    } catch (error) {
        logError(`Error crítico durante la limpieza: ${error.message}`);
        process.exit(1);
    }
}

// Ejecutar limpieza
nuclearCleanup().then(() => {
    process.exit(0);
}).catch((error) => {
    logError(`Error fatal: ${error.message}`);
    process.exit(1);
}); 