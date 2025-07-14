import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';
import { firebaseConfig } from '@/config/environment';

export class DatabaseService {
  private static instance: DatabaseService;
  private app: App;
  private firestore: Firestore;
  private storage: Storage;

  private constructor() {
    // Initialize Firebase Admin if not already initialized
    if (getApps().length === 0) {
      this.app = initializeApp({
        credential: cert({
          projectId: firebaseConfig.projectId,
          privateKey: firebaseConfig.privateKey,
          clientEmail: firebaseConfig.clientEmail,
        }),
        storageBucket: firebaseConfig.storageBucket,
      });
    } else {
      this.app = getApps()[0];
    }

    this.firestore = getFirestore(this.app);
    this.storage = getStorage(this.app);
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public getFirestore(): Firestore {
    return this.firestore;
  }

  public getStorage(): Storage {
    return this.storage;
  }

  public getApp(): App {
    return this.app;
  }

  // Collection helpers
  public collection(collectionName: string) {
    return this.firestore.collection(collectionName);
  }

  public doc(collectionName: string, docId: string) {
    return this.firestore.collection(collectionName).doc(docId);
  }

  // Batch operations
  public batch() {
    return this.firestore.batch();
  }

  // Transaction operations
  public async runTransaction<T>(
    updateFunction: (transaction: any) => Promise<T>
  ): Promise<T> {
    return this.firestore.runTransaction(updateFunction);
  }

  // Health check
  public async healthCheck(): Promise<boolean> {
    try {
      await this.firestore.listCollections();
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  // Cleanup
  public async close(): Promise<void> {
    await this.firestore.terminate();
  }
} 