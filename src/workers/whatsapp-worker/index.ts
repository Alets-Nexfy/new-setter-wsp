#!/usr/bin/env ts-node

/**
 * WhatsApp Worker Process Entry Point
 * MANTENIENDO TODA LA LÓGICA ORIGINAL
 */

import { config } from 'dotenv';

// Load environment variables
config();

// Get arguments maintaining original logic
const args = process.argv.slice(2);
const userId = args[0];
const activeAgentId = args[1] || null;

if (!userId) {
  console.error('[Worker] ERROR: No userId provided as argument');
  process.exit(1);
}

console.log(`[Worker ${userId}] Starting WhatsApp worker process...`);
console.log(`[Worker ${userId}] Process ID: ${process.pid}`);
console.log(`[Worker ${userId}] Active Agent ID: ${activeAgentId || 'default'}`);

// Set process title for easier identification
process.title = `whatsapp-worker-${userId}`;

/**
 * Main worker initialization - MANTENER LÓGICA ORIGINAL
 */
async function main(): Promise<void> {
  try {
    console.log(`[Worker ${userId}] Initializing WhatsApp Worker...`);
    
    // Initialize services first for child process
    const { SupabaseService } = require('@/core/services/SupabaseService');
    const { CacheService } = require('@/core/services/CacheService');
    const { LoggerService } = require('@/core/services/LoggerService');
    
    console.log(`[Worker ${userId}] Initializing core services...`);
    
    // Initialize DatabaseService for child process
    const dbService = SupabaseService.getInstance();
    await dbService.initialize();
    
    // Initialize other services
    const cacheService = CacheService.getInstance();
    await cacheService.initialize();
    
    console.log(`[Worker ${userId}] Core services initialized`);
    
    // Import WhatsApp Worker maintaining all original functionality
    const { WhatsAppWorker } = require('./WhatsAppWorker');
    
    // Create worker instance - MANTENER TODA LA FUNCIONALIDAD
    const worker = new WhatsAppWorker(userId, activeAgentId);
    
    // Initialize worker
    await worker.initialize();
    
    console.log(`[Worker ${userId}] WhatsApp Worker initialized successfully`);
    
    // Keep process alive
    process.on('SIGTERM', () => {
      console.log(`[Worker ${userId}] Received SIGTERM, shutting down gracefully...`);
    });
    
    process.on('SIGINT', () => {
      console.log(`[Worker ${userId}] Received SIGINT, shutting down gracefully...`);
    });
    
  } catch (error) {
    console.error(`[Worker ${userId}] Fatal error during initialization:`, error);
    
    // Send error to master process if possible
    if (process.send) {
      process.send({
        type: 'ERROR_INFO',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
    
    process.exit(1);
  }
}

// Start the worker
main().catch((error) => {
  console.error(`[Worker ${userId}] Unhandled error in main:`, error);
    process.exit(1);
  });