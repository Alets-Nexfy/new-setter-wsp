import * as admin from 'firebase-admin';

export class DatabaseService {
  private static instance: DatabaseService;
  private app: admin.app.App;
  private firestore: admin.firestore.Firestore;
  private storage: admin.storage.Storage;
  private initialized = false;

  private constructor() {
    // Firebase will be initialized in the initialize() method
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize Firebase - Compatible with both v1 and v2 configurations
   * V1: Uses GOOGLE_APPLICATION_CREDENTIALS (service account file)
   * V2: Uses individual environment variables
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Don't initialize if already exists
      if (admin.apps.length > 0) {
        this.app = admin.apps[0];
        this.firestore = admin.firestore();
        this.storage = admin.storage();
        this.initialized = true;
        console.log('[DatabaseService] Using existing Firebase app');
        return;
      }

      // Try V1 style first (GOOGLE_APPLICATION_CREDENTIALS)
      const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      
      if (serviceAccountPath) {
        console.log('[DatabaseService] Initializing Firebase with service account file (V1 compatible)');
        this.app = admin.initializeApp({
          credential: admin.credential.cert(serviceAccountPath),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        });
      } else {
        // Fall back to V2 style (individual environment variables)
        console.log('[DatabaseService] Initializing Firebase with environment variables (V2 style)');
        
        const requiredEnvVars = {
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        };

        // Validate required environment variables
        for (const [key, value] of Object.entries(requiredEnvVars)) {
          if (!value) {
            throw new Error(`Missing required environment variable: FIREBASE_${key.toUpperCase()}`);
          }
        }

        this.app = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: requiredEnvVars.projectId,
            privateKey: requiredEnvVars.privateKey!.replace(/\\n/g, '\n'),
            clientEmail: requiredEnvVars.clientEmail,
          }),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        });
      }

      this.firestore = admin.firestore();
      this.storage = admin.storage();
      this.initialized = true;
      
      console.log('[DatabaseService] Firebase initialized successfully');
      console.log(`[DatabaseService] Project ID: ${this.app.options.projectId}`);

    } catch (error) {
      console.error('[DatabaseService] Failed to initialize Firebase:', error);
      throw new Error(`Firebase initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.initialized) {
        return false;
      }
      
      // Try to read from a test collection
      await this.firestore.collection('_health_check').limit(1).get();
      return true;
    } catch (error) {
      console.error('[DatabaseService] Health check failed:', error);
      return false;
    }
  }

  public getFirestore(): Firestore {
    if (!this.initialized) {
      throw new Error('DatabaseService not initialized. Call initialize() first.');
    }
    return this.firestore;
  }

  public getStorage(): Storage {
    if (!this.initialized) {
      throw new Error('DatabaseService not initialized. Call initialize() first.');
    }
    return this.storage;
  }

  public getApp(): App {
    if (!this.initialized) {
      throw new Error('DatabaseService not initialized. Call initialize() first.');
    }
    return this.app;
  }

  // Collection helpers
  public collection(path: string) {
    return this.getFirestore().collection(path);
  }

  public doc(collection: string, docId: string) {
    return this.getFirestore().collection(collection).doc(docId);
  }

  public batch() {
    return this.getFirestore().batch();
  }

  public async runTransaction<T>(updateFunction: (transaction: any) => Promise<T>): Promise<T> {
    return this.getFirestore().runTransaction(updateFunction);
  }
} 