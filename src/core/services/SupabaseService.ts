import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

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
      const mockResponse = { data: null, error: new Error('SupabaseService not initialized') };
      const createMockChain: any = () => ({
        eq: () => createMockChain(),
        neq: () => createMockChain(),
        gt: () => createMockChain(),
        lt: () => createMockChain(),
        gte: () => createMockChain(),
        lte: () => createMockChain(),
        like: () => createMockChain(),
        ilike: () => createMockChain(),
        in: () => createMockChain(),
        single: () => Promise.resolve(mockResponse),
        select: () => createMockChain(),
        insert: () => Promise.resolve(mockResponse),
        update: () => createMockChain(),
        upsert: () => Promise.resolve(mockResponse),
        delete: () => createMockChain(),
        order: () => createMockChain(),
        limit: () => createMockChain(),
        then: (resolve: (value: any) => any) => Promise.resolve(mockResponse).then(resolve),
        catch: (reject: (error: any) => any) => Promise.resolve(mockResponse).catch(reject)
      });
      return createMockChain();
    }
    return this.getClient().from(table)
  }

  public adminFrom(table: string) {
    if (!this.initialized) {
      console.warn(`[SupabaseService] adminFrom('${table}') called before initialization - returning mock`)
      const mockResponse = { data: null, error: new Error('SupabaseService not initialized') };
      const createMockChain: any = () => ({
        eq: () => createMockChain(),
        neq: () => createMockChain(),
        gt: () => createMockChain(),
        lt: () => createMockChain(),
        gte: () => createMockChain(),
        lte: () => createMockChain(),
        like: () => createMockChain(),
        ilike: () => createMockChain(),
        in: () => createMockChain(),
        single: () => Promise.resolve(mockResponse),
        select: () => createMockChain(),
        insert: () => Promise.resolve(mockResponse),
        update: () => createMockChain(),
        upsert: () => Promise.resolve(mockResponse),
        delete: () => createMockChain(),
        order: () => createMockChain(),
        limit: () => createMockChain(),
        then: (resolve: (value: any) => any) => Promise.resolve(mockResponse).then(resolve),
        catch: (reject: (error: any) => any) => Promise.resolve(mockResponse).catch(reject)
      });
      return createMockChain();
    }
    return this.getAdminClient().from(table)
  }

  // Transaction support
  public async transaction<T>(fn: (client: SupabaseClient) => Promise<T>): Promise<T> {
    // Supabase handles transactions automatically for batch operations
    return await fn(this.getClient())
  }

  // Batch operations helper
  public async batchExecute(operations: Array<() => Promise<any>>): Promise<any[]> {
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
        collection: (subName: string) => {
          console.warn(`[SupabaseService] Nested collection('${subName}') called - this may not work as expected with Supabase`);
          return this.collection(subName);
        },
        delete: async () => {
          const { error } = await this.from(name).delete().eq('id', id)
          if (error) throw error
          return true
        }
      }),
      get: async () => {
        const { data, error } = await this.from(name).select('*')
        return {
          docs: (data || []).map(item => ({
            id: item.id,
            data: () => item,
            exists: true
          })),
          size: (data || []).length,
          forEach: (callback: (doc: any) => void) => {
            (data || []).forEach(item => callback({
              id: item.id,
              data: () => item,
              exists: true
            }))
          }
        }
      },
      orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') => {
        const createOrderedQuery: any = (currentFilters: Array<{field: string, operator: string, value: any}> = [], orderField = field, orderDirection = direction, offsetValue = 0) => ({
          where: (nextField: string, nextOperator: string, nextValue: any) => {
            return createOrderedQuery([...currentFilters, {field: nextField, operator: nextOperator, value: nextValue}], orderField, orderDirection, offsetValue)
          },
          offset: (newOffsetValue: number) => {
            return createOrderedQuery(currentFilters, orderField, orderDirection, newOffsetValue)
          },
          limit: (limitValue: number) => ({
            get: async () => {
              let query = this.from(name).select('*')
              // Apply all filters
              currentFilters.forEach(filter => {
                if (filter.operator === '==') {
                  query = query.eq(filter.field, filter.value)
                } else if (filter.operator === '!=') {
                  query = query.neq(filter.field, filter.value)
                } else if (filter.operator === '>') {
                  query = query.gt(filter.field, filter.value)
                } else if (filter.operator === '<') {
                  query = query.lt(filter.field, filter.value)
                } else if (filter.operator === '>=') {
                  query = query.gte(filter.field, filter.value)
                } else if (filter.operator === '<=') {
                  query = query.lte(filter.field, filter.value)
                }
              })
              query = query.order(orderField, { ascending: orderDirection === 'asc' })
              if (offsetValue > 0) {
                query = query.range(offsetValue, offsetValue + limitValue - 1)
              } else {
                query = query.limit(limitValue)
              }
              const { data, error } = await query
              return {
                docs: (data || []).map(item => ({
                  id: item.id,
                  data: () => item,
                  exists: true,
                  ref: {
                    delete: async () => {
                      const { error } = await this.from(name).delete().eq('id', item.id)
                      if (error) throw error
                    }
                  }
                })),
                empty: !data || data.length === 0,
                size: (data || []).length,
                forEach: (callback: (doc: any) => void) => {
                  (data || []).forEach(item => callback({
                    id: item.id,
                    data: () => item,
                    exists: true,
                    ref: {
                      delete: async () => {
                        const { error } = await this.from(name).delete().eq('id', item.id)
                        if (error) throw error
                      }
                    }
                  }))
                }
              }
            }
          }),
          get: async () => {
            let query = this.from(name).select('*')
            // Apply all filters
            currentFilters.forEach(filter => {
              if (filter.operator === '==') {
                query = query.eq(filter.field, filter.value)
              } else if (filter.operator === '!=') {
                query = query.neq(filter.field, filter.value)
              } else if (filter.operator === '>') {
                query = query.gt(filter.field, filter.value)
              } else if (filter.operator === '<') {
                query = query.lt(filter.field, filter.value)
              } else if (filter.operator === '>=') {
                query = query.gte(filter.field, filter.value)
              } else if (filter.operator === '<=') {
                query = query.lte(filter.field, filter.value)
              }
            })
            query = query.order(orderField, { ascending: orderDirection === 'asc' })
            if (offsetValue > 0) {
              // For queries without limit, we can't easily use offset, so we'll skip it for now
              console.warn('[SupabaseService] Offset without limit not fully supported')
            }
            const { data, error } = await query
            return {
              docs: (data || []).map(item => ({
                id: item.id,
                data: () => item,
                exists: true,
                ref: {
                  delete: async () => {
                    const { error } = await this.from(name).delete().eq('id', item.id)
                    if (error) throw error
                  }
                }
              })),
              empty: !data || data.length === 0,
              forEach: (callback: (doc: any) => void) => {
                (data || []).forEach(item => callback({
                  id: item.id,
                  data: () => item,
                  exists: true,
                  ref: {
                    delete: async () => {
                      const { error } = await this.from(name).delete().eq('id', item.id)
                      if (error) throw error
                    }
                  }
                }))
              }
            }
          }
        })
        return createOrderedQuery()
      },
      where: (field: string, operator: string, value: any) => {
        const createChainableQuery: any = (currentFilters: Array<{field: string, operator: string, value: any}>, offsetValue = 0) => ({
          where: (nextField: string, nextOperator: string, nextValue: any) => {
            return createChainableQuery([...currentFilters, {field: nextField, operator: nextOperator, value: nextValue}], offsetValue)
          },
          offset: (newOffsetValue: number) => {
            return createChainableQuery(currentFilters, newOffsetValue)
          },
          limit: (limitValue: number) => ({
            get: async () => {
              let query = this.from(name).select('*')
              // Apply all filters
              currentFilters.forEach(filter => {
                if (filter.operator === '==') {
                  query = query.eq(filter.field, filter.value)
                } else if (filter.operator === '!=') {
                  query = query.neq(filter.field, filter.value)
                } else if (filter.operator === '>') {
                  query = query.gt(filter.field, filter.value)
                } else if (filter.operator === '<') {
                  query = query.lt(filter.field, filter.value)
                } else if (filter.operator === '>=') {
                  query = query.gte(filter.field, filter.value)
                } else if (filter.operator === '<=') {
                  query = query.lte(filter.field, filter.value)
                }
              })
              if (offsetValue > 0) {
                query = query.range(offsetValue, offsetValue + limitValue - 1)
              } else {
                query = query.limit(limitValue)
              }
              const { data, error } = await query
              return {
                docs: (data || []).map(item => ({
                  id: item.id,
                  data: () => item,
                  exists: true,
                  ref: {
                    delete: async () => {
                      const { error } = await this.from(name).delete().eq('id', item.id)
                      if (error) throw error
                    }
                  }
                })),
                empty: !data || data.length === 0,
                size: (data || []).length,
                forEach: (callback: (doc: any) => void) => {
                  (data || []).forEach(item => callback({
                    id: item.id,
                    data: () => item,
                    exists: true,
                    ref: {
                      delete: async () => {
                        const { error } = await this.from(name).delete().eq('id', item.id)
                        if (error) throw error
                      }
                    }
                  }))
                }
              }
            }
          }),
          get: async () => {
            let query = this.from(name).select('*')
            // Apply all filters
            currentFilters.forEach(filter => {
              if (filter.operator === '==') {
                query = query.eq(filter.field, filter.value)
              } else if (filter.operator === '!=') {
                query = query.neq(filter.field, filter.value)
              } else if (filter.operator === '>') {
                query = query.gt(filter.field, filter.value)
              } else if (filter.operator === '<') {
                query = query.lt(filter.field, filter.value)
              } else if (filter.operator === '>=') {
                query = query.gte(filter.field, filter.value)
              } else if (filter.operator === '<=') {
                query = query.lte(filter.field, filter.value)
              }
            })
            if (offsetValue > 0) {
              // For queries without limit, we can't easily use offset, so we'll skip it for now
              console.warn('[SupabaseService] Offset without limit not fully supported')
            }
            const { data, error } = await query
            return {
              docs: (data || []).map(item => ({
                id: item.id,
                data: () => item,
                exists: true,
                ref: {
                  delete: async () => {
                    const { error } = await this.from(name).delete().eq('id', item.id)
                    if (error) throw error
                  }
                }
              })),
              empty: !data || data.length === 0,
              forEach: (callback: (doc: any) => void) => {
                (data || []).forEach(item => callback({
                  id: item.id,
                  data: () => item,
                  exists: true,
                  ref: {
                    delete: async () => {
                      const { error } = await this.from(name).delete().eq('id', item.id)
                      if (error) throw error
                    }
                  }
                }))
              }
            }
          }
        })
        return createChainableQuery([{field, operator, value}], 0)
      },
      add: async (data: any) => {
        const id = data.id || randomUUID()
        const { error } = await this.from(name).insert({ ...data, id })
        if (error) throw error
        return { id }
      },
      limit: (limitValue: number) => ({
        get: async () => {
          const { data, error } = await this.from(name).select('*').limit(limitValue)
          return {
            docs: (data || []).map(item => ({
              id: item.id,
              data: () => item,
              exists: true,
              ref: {
                delete: async () => {
                  const { error } = await this.from(name).delete().eq('id', item.id)
                  if (error) throw error
                }
              }
            })),
            empty: !data || data.length === 0,
            forEach: (callback: (doc: any) => void) => {
              (data || []).forEach(item => callback({
                id: item.id,
                data: () => item,
                exists: true,
                ref: {
                  delete: async () => {
                    const { error } = await this.from(name).delete().eq('id', item.id)
                    if (error) throw error
                  }
                }
              }))
            }
          }
        }
      })
    }
  }

  public doc(table: string, id: string) {
    console.warn(`[SupabaseService] doc('${table}', '${id}') called - using Supabase table instead`);
    return {
      get: async () => {
        const { data, error } = await this.from(table).select('*').eq('id', id).single();
        return {
          exists: !error && !!data,
          data: () => data,
          id: id
        };
      },
      set: async (data: any) => {
        const { error } = await this.from(table).upsert({ ...data, id });
        if (error) throw error;
        return data;
      },
      update: async (data: any) => {
        const { error } = await this.from(table).update(data).eq('id', id);
        if (error) throw error;
        return data;
      },
      collection: (subName: string) => {
        console.warn(`[SupabaseService] Nested collection('${subName}') from doc('${table}', '${id}') called - this may not work as expected with Supabase`);
        return this.collection(subName);
      },
      delete: async () => {
        const { error } = await this.from(table).delete().eq('id', id);
        if (error) throw error;
      }
    };
  }

  public get firestore() {
    console.warn('[SupabaseService] firestore property accessed - using Supabase client instead');
    return {
      collection: (name: string) => {
        console.warn(`[SupabaseService] firestore.collection('${name}') called - using Supabase instead`);
        return this.collection(name);
      },
      doc: () => ({ 
        collection: (name: string) => {
          console.warn(`[SupabaseService] firestore.doc().collection('${name}') called - using Supabase instead`);
          return this.collection(name);
        }
      })
    };
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

  // Firebase batch compatibility
  public batch() {
    const operations: Array<() => Promise<any>> = []
    return {
      delete: (docRef: any) => {
        operations.push(() => docRef.delete())
      },
      set: (docRef: any, data: any) => {
        operations.push(() => docRef.set(data))
      },
      update: (docRef: any, data: any) => {
        operations.push(() => docRef.update(data))
      },
      commit: async () => {
        return await Promise.all(operations.map(op => op()))
      }
    }
  }

  // Additional Firebase compatibility methods
  public async getDocument(table: string, id: string): Promise<any> {
    const { data, error } = await this.from(table)
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      console.error(`[SupabaseService] getDocument error:`, error)
      return null
    }
    
    return {
      exists: !!data,
      data: () => data,
      id: data?.id
    }
  }

  public async setDocument(table: string, id: string, data: any): Promise<void> {
    const { error } = await this.from(table)
      .upsert({ ...data, id })
      .eq('id', id)
    
    if (error) {
      console.error(`[SupabaseService] setDocument error:`, error)
      throw error
    }
  }

  public async deleteDocument(table: string, id: string): Promise<void> {
    const { error } = await this.from(table)
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error(`[SupabaseService] deleteDocument error:`, error)
      throw error
    }
  }

  public getCollection(name: string) {
    // Alias for collection method
    return this.collection(name)
  }

  // Firebase-style getCollectionWhere method for compatibility
  public async getCollectionWhere(table: string, field: string, operator: string, value: any): Promise<any> {
    try {
      let query = this.from(table).select('*')
      
      if (operator === '==') {
        query = query.eq(field, value)
      } else if (operator === '!=') {
        query = query.neq(field, value)
      } else if (operator === '>') {
        query = query.gt(field, value)
      } else if (operator === '>=') {
        query = query.gte(field, value)
      } else if (operator === '<') {
        query = query.lt(field, value)
      } else if (operator === '<=') {
        query = query.lte(field, value)
      }
      
      const { data, error } = await query
      
      if (error) {
        console.error('[SupabaseService] getCollectionWhere error:', error)
        throw error
      }
      
      // Return as object with IDs as keys for compatibility
      const result: any = {}
      if (data) {
        data.forEach((item: any) => {
          result[item.id] = item
        })
      }
      return result
    } catch (error) {
      console.error('[SupabaseService] getCollectionWhere error:', error)
      throw error
    }
  }
}