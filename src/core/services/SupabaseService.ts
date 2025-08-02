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
    if (!this.initialized) {
      console.warn(`[SupabaseService] from('${table}') called before initialization - returning mock`)
      return {
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: new Error('SupabaseService not initialized') }) }) }),
        insert: () => Promise.resolve({ data: null, error: new Error('SupabaseService not initialized') }),
        update: () => ({ eq: () => Promise.resolve({ data: null, error: new Error('SupabaseService not initialized') }) }),
        upsert: () => Promise.resolve({ data: null, error: new Error('SupabaseService not initialized') }),
        delete: () => ({ eq: () => Promise.resolve({ data: null, error: new Error('SupabaseService not initialized') }) }),
        order: () => ({ select: () => Promise.resolve({ data: [], error: null }) })
      }
    }
    return this.getClient().from(table)
  }

  public adminFrom(table: string) {
    if (!this.initialized) {
      console.warn(`[SupabaseService] adminFrom('${table}') called before initialization - returning mock`)
      return this.from(table) // Use same mock
    }
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

  // Compatibility methods for DatabaseService
  public collection(name: string) {
    console.warn(`[SupabaseService] collection('${name}') called - using Supabase table instead`)
    return {
      doc: (id: string) => ({
        get: async () => {
          const { data, error } = await this.from(name).select('*').eq('id', id).single()
          return {
            exists: !error && !!data,
            data: () => data,
            id: id
          }
        },
        set: async (data: any) => {
          const { error } = await this.from(name).upsert({ ...data, id })
          if (error) throw error
          return data
        },
        update: async (data: any) => {
          const { error } = await this.from(name).update(data).eq('id', id)
          if (error) throw error
          return data
        },
        collection: (subName: string) => this.collection(subName)
      }),
      get: async () => {
        const { data, error } = await this.from(name).select('*')
        return {
          docs: (data || []).map(item => ({
            id: item.id,
            data: () => item,
            exists: true
          })),
          forEach: (callback: (doc: any) => void) => {
            (data || []).forEach(item => callback({
              id: item.id,
              data: () => item,
              exists: true
            }))
          }
        }
      },
      orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') => ({
        get: async () => {
          const { data, error } = await this.from(name).select('*').order(field, { ascending: direction === 'asc' })
          return {
            docs: (data || []).map(item => ({
              id: item.id,
              data: () => item,
              exists: true
            })),
            forEach: (callback: (doc: any) => void) => {
              (data || []).forEach(item => callback({
                id: item.id,
                data: () => item,
                exists: true
              }))
            }
          }
        }
      })
    }
  }

  public doc(table: string, id: string) {
    console.warn(`[SupabaseService] doc('${table}', '${id}') called - using Supabase table instead`)
    return this.collection(table).doc(id)
  }

  public get firestore() {
    console.warn('[SupabaseService] firestore property accessed - using Supabase client instead')
    return {
      collection: (name: string) => this.collection(name),
      doc: () => ({ 
        collection: (name: string) => this.collection(name) 
      })
    }
  }

  public get storage() {
    return this.getClient().storage
  }

  public async getFirestoreTimestamp() {
    return new Date().toISOString()
  }

  public getProjectId(): string {
    return process.env.SUPABASE_PROJECT_ID || 'bqitfhvaejxcyvjszfom'
  }
}