#!/usr/bin/env ts-node

/**
 * Instagram Worker Process Entry Point
 * 
 * This file serves as the entry point for Instagram worker processes forked by the master server.
 * Each worker handles Instagram automation for a single user.
 */

import { config } from 'dotenv';
import { InstagramWorker } from './InstagramWorker';

// Load environment variables
config();

// Get command line arguments
const userId = process.argv[2];
const activeAgentId = process.argv[3] || null;

if (!userId) {
  console.error('[Instagram Worker] ERROR: No userId provided as argument');
  process.exit(1);
}

console.log(`[Instagram Worker ${userId}] Starting Instagram worker process...`);
console.log(`[Instagram Worker ${userId}] Process ID: ${process.pid}`);
console.log(`[Instagram Worker ${userId}] Active Agent ID: ${activeAgentId || 'default'}`);

// Set process title for easier identification
process.title = `instagram-worker-${userId}`;

/**
 * Main worker initialization
 */
async function main(): Promise<void> {
  try {
    console.log(`[Instagram Worker ${userId}] Initializing Instagram Worker...`);
    
    // Create worker instance
    const worker = new InstagramWorker(userId, activeAgentId);
    
    // Initialize worker
    await worker.initialize();
    
    console.log(`[Instagram Worker ${userId}] Instagram Worker initialized successfully`);
    
    // Keep process alive
    process.on('SIGTERM', () => {
      console.log(`[Instagram Worker ${userId}] Received SIGTERM, shutting down gracefully...`);
    });
    
    process.on('SIGINT', () => {
      console.log(`[Instagram Worker ${userId}] Received SIGINT, shutting down gracefully...`);
    });
    
  } catch (error) {
    console.error(`[Instagram Worker ${userId}] Fatal error during initialization:`, error);
    
    // Send error to master process if possible
    if (process.send) {
      process.send({
        type: 'ERROR_INFO',
        error: `Fatal initialization error: ${error instanceof Error ? error.message || 'Unknown error' : 'Unknown error'}`,
        platform: 'instagram'
      });
    }
    
    // Exit with error code
    process.exit(1);
  }
}

// Start the worker
main().catch((error) => {
  console.error(`[Instagram Worker ${userId}] Unhandled error in main:`, error);
  process.exit(1);
}); 