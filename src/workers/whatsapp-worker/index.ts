#!/usr/bin/env ts-node

/**
 * WhatsApp Worker Process Entry Point
 * 
 * This file serves as the entry point for worker processes forked by the master server.
 * Each worker handles WhatsApp automation for a single user.
 * 
 * MIGRADO DE: whatsapp-api/src/worker.js
 * MEJORAS: TypeScript, structured logging, error handling
 */

import { config } from 'dotenv';
import { WhatsAppWorker } from './WhatsAppWorker';

// Load environment variables
config();

// Get command line arguments
const userId = process.argv[2];
const activeAgentId = process.argv[3] || null;

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
 * Main worker initialization
 */
async function main(): Promise<void> {
  try {
    console.log(`[Worker ${userId}] Initializing WhatsApp Worker...`);
    
    // Create worker instance
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
        error: `Fatal initialization error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
    
    // Exit with error code
    process.exit(1);
  }
}

// Start the worker
main().catch((error) => {
  console.error(`[Worker ${userId}] Unhandled error in main:`, error);
  process.exit(1);
}); 