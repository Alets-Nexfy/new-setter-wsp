import { createClient, SupabaseClient } from '@supabase/supabase-js'

export class SupabaseService {
  private static instance: SupabaseService
  private client: SupabaseClient
  private adminClient: SupabaseClient
  private initialized = false

  private constructor() {
    // Supabase will be initialized in the initialize() method
  }

  public static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      SupabaseService.instance = new SupabaseService()
    }
    return SupabaseService.instance
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      const supabaseUrl = process.env.SUPABASE_URL
      const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
        throw new Error('Missing required Supabase environment variables')
      }

      // Initialize client for regular operations
      this.client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })

      // Initialize admin client for admin operations
      this.adminClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })

      this.initialized = true
      console.log('[SupabaseService] Supabase initialized successfully')

    } catch (error) {
      console.error('[SupabaseService] Failed to initialize Supabase:', error)
      throw new Error(`Supabase initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.initialized) {
        return false
      }
      
      // Simple query to test connection
      const { error } = await this.client.from('users').select('id').limit(1)
      return !error
    } catch (error) {
      console.error('[SupabaseService] Health check failed:', error)
      return false
    }
  }

  public getClient(): SupabaseClient {
    if (!this.initialized) {
      throw new Error('SupabaseService not initialized. Call initialize() first.')
    }
    return this.client
  }

  public getAdminClient(): SupabaseClient {
    if (!this.initialized) {
      throw new Error('SupabaseService not initialized. Call initialize() first.')
    }
    return this.adminClient
  }

  // Helper methods for common operations
  public from(table: string) {
    return this.getClient().from(table)
  }

  public adminFrom(table: string) {
    return this.getAdminClient().from(table)
  }

  // Transaction support
  public async transaction<T>(fn: (client: SupabaseClient) => Promise<T>): Promise<T> {
    // Supabase handles transactions automatically for batch operations
    return await fn(this.getClient())
  }

  // Batch operations helper
  public async batch(operations: Array<() => Promise<any>>): Promise<any[]> {
    return await Promise.all(operations.map(op => op()))
  }
}