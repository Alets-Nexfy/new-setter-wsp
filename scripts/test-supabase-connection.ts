import { SupabaseService } from '../src/core/services/SupabaseService'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

async function testConnection() {
  console.log('🧪 Testing Supabase Connection...')
  
  const supabaseService = SupabaseService.getInstance()
  
  try {
    // Test initialization
    console.log('1. Initializing Supabase service...')
    await supabaseService.initialize()
    console.log('✅ Supabase service initialized')
    
    // Test health check
    console.log('2. Running health check...')
    const isHealthy = await supabaseService.healthCheck()
    
    if (isHealthy) {
      console.log('✅ Supabase connection successful!')
    } else {
      console.log('❌ Supabase connection failed!')
      return
    }
    
    // Test basic operations if environment variables are set
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      console.log('3. Testing basic operations...')
      
      // Test a simple query (this will fail if tables don't exist yet, which is expected)
      try {
        const { data, error } = await supabaseService.from('users').select('id').limit(1)
        if (error && error.code === '42P01') {
          console.log('⚠️  Tables not created yet (expected for initial setup)')
        } else if (error) {
          console.log('⚠️  Database error:', error.message)
        } else {
          console.log('✅ Basic query successful')
        }
      } catch (queryError) {
        console.log('⚠️  Query test failed:', queryError)
      }
    } else {
      console.log('⚠️  Environment variables not set, skipping query tests')
    }
    
    console.log('🎉 Supabase connection test completed!')
    
  } catch (error) {
    console.error('❌ Error testing connection:', error)
    process.exit(1)
  }
}

// Run the test
testConnection().catch(console.error)