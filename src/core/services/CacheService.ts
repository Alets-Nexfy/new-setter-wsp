import { createClient, RedisClientType } from 'redis';
import environment from '../../../config/environment';

export class CacheService {
  private static instance: CacheService;
  private client: RedisClientType;
  private isConnected: boolean = false;

  private constructor() {
    this.client = createClient({
      url: environment.redis.url,
      password: environment.redis.password,
      socket: {
        connectTimeout: 10000,
        lazyConnect: true,
        keepAlive: 30000,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            return new Error('Redis connection failed after 10 retries');
          }
          return Math.min(retries * 100, 3000);
        },
      },
      // Connection pooling optimizations for multiple users
      database: 0,
      commandsQueueMaxLength: 1000,
      maxRetriesPerRequest: 3,
    });

    this.setupEventHandlers();
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Initialize the cache service (connects to Redis)
   */
  public async initialize(): Promise<void> {
    try {
      await this.connect();
      console.log('[CacheService] Redis initialized successfully');
    } catch (error) {
      console.warn('[CacheService] Redis not available, cache disabled:', error.message);
      // Continue without Redis - don't throw error
    }
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      console.log('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      console.log('Redis client ready');
    });

    this.client.on('error', (err) => {
      console.error('Redis client error:', err);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      console.log('Redis client disconnected');
      this.isConnected = false;
    });
  }

  public async connect(): Promise<void> {
    if (!this.isConnected) {
      try {
      await this.client.connect();
      } catch (error) {
        console.warn('[CacheService] Redis connection failed, continuing without cache');
        // Don't throw - allow app to continue without Redis
      }
    }
  }

  public async disconnect(): Promise<void> {
    if (this.isConnected) {
      try {
      await this.client.disconnect();
      } catch (error) {
        console.warn('[CacheService] Redis disconnect failed:', error);
      }
    }
  }

  // Basic operations
  public async get(key: string): Promise<string | null> {
    try {
      if (!this.isConnected) {
      await this.connect();
      }
      if (!this.isConnected) {
        return null; // No Redis, return null
      }
      return await this.client.get(key);
    } catch (error) {
      console.warn('[CacheService] Get failed, returning null:', error.message);
      return null;
    }
  }

  public async set(key: string, value: string, ttl?: number): Promise<boolean> {
    try {
      if (!this.isConnected) {
      await this.connect();
      }
      if (!this.isConnected) {
        return false; // No Redis, return false
      }
      if (ttl) {
        await this.client.setEx(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      console.warn('[CacheService] Set failed, returning false:', error.message);
      return false;
    }
  }

  public async del(key: string): Promise<boolean> {
    try {
      await this.connect();
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      console.error('Cache del error:', error);
      return false;
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      await this.connect();
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  // JSON operations
  public async getJSON<T>(key: string): Promise<T | null> {
    try {
      const value = await this.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Cache getJSON error:', error);
      return null;
    }
  }

  public async setJSON<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      const jsonValue = JSON.stringify(value);
      return await this.set(key, jsonValue, ttl);
    } catch (error) {
      console.error('Cache setJSON error:', error);
      return false;
    }
  }

  // Hash operations
  public async hget(key: string, field: string): Promise<string | null> {
    try {
      await this.connect();
      return await this.client.hGet(key, field);
    } catch (error) {
      console.error('Cache hget error:', error);
      return null;
    }
  }

  public async hset(key: string, field: string, value: string): Promise<boolean> {
    try {
      await this.connect();
      await this.client.hSet(key, field, value);
      return true;
    } catch (error) {
      console.error('Cache hset error:', error);
      return false;
    }
  }

  public async hgetall(key: string): Promise<Record<string, string> | null> {
    try {
      await this.connect();
      return await this.client.hGetAll(key);
    } catch (error) {
      console.error('Cache hgetall error:', error);
      return null;
    }
  }

  // List operations
  public async lpush(key: string, value: string): Promise<boolean> {
    try {
      await this.connect();
      await this.client.lPush(key, value);
      return true;
    } catch (error) {
      console.error('Cache lpush error:', error);
      return false;
    }
  }

  public async rpop(key: string): Promise<string | null> {
    try {
      await this.connect();
      return await this.client.rPop(key);
    } catch (error) {
      console.error('Cache rpop error:', error);
      return null;
    }
  }

  public async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      await this.connect();
      return await this.client.lRange(key, start, stop);
    } catch (error) {
      console.error('Cache lrange error:', error);
      return [];
    }
  }

  // Set operations
  public async sadd(key: string, member: string): Promise<boolean> {
    try {
      await this.connect();
      await this.client.sAdd(key, member);
      return true;
    } catch (error) {
      console.error('Cache sadd error:', error);
      return false;
    }
  }

  public async sismember(key: string, member: string): Promise<boolean> {
    try {
      await this.connect();
      return await this.client.sIsMember(key, member);
    } catch (error) {
      console.error('Cache sismember error:', error);
      return false;
    }
  }

  public async smembers(key: string): Promise<string[]> {
    try {
      await this.connect();
      return await this.client.sMembers(key);
    } catch (error) {
      console.error('Cache smembers error:', error);
      return [];
    }
  }

  // Utility operations
  public async expire(key: string, seconds: number): Promise<boolean> {
    try {
      await this.connect();
      return await this.client.expire(key, seconds);
    } catch (error) {
      console.error('Cache expire error:', error);
      return false;
    }
  }

  public async ttl(key: string): Promise<number> {
    try {
      await this.connect();
      return await this.client.ttl(key);
    } catch (error) {
      console.error('Cache ttl error:', error);
      return -1;
    }
  }

  public async keys(pattern: string): Promise<string[]> {
    try {
      await this.connect();
      return await this.client.keys(pattern);
    } catch (error) {
      console.error('Cache keys error:', error);
      return [];
    }
  }

  public async flushdb(): Promise<boolean> {
    try {
      await this.connect();
      await this.client.flushDb();
      return true;
    } catch (error) {
      console.error('Cache flushdb error:', error);
      return false;
    }
  }

  // Health check
  public async healthCheck(): Promise<boolean> {
    try {
      await this.connect();
      await this.client.ping();
      return true;
    } catch (error) {
      console.error('Cache health check failed:', error);
      return false;
    }
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }
} 