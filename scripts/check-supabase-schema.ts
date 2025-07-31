import { SupabaseService } from '../src/core/services/SupabaseService'
import * as dotenv from 'dotenv'

dotenv.config()

async function checkSchema() {
  console.log('🔍 Checking Supabase Schema\n')
  
  const supabaseService = SupabaseService.getInstance()
  await supabaseService.initialize()
  
  const client = supabaseService.getAdminClient()
  
  // Query to get table columns using Supabase's table_columns view
  const query = `
    SELECT 
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name IN ('users', 'sessions', 'chats', 'messages', 'agents')
    ORDER BY table_name, ordinal_position;
  `
  
  console.log('Executing schema query...\n')
  
  // Try a simple test first
  console.log('Testing basic query...')
  const { data: testData, error: testError } = await client
    .from('users')
    .select('*')
    .limit(1)
  
  if (testError) {
    console.log('❌ Basic query failed:', testError)
    console.log('\nThis might mean the table structure is different than expected.')
  } else {
    console.log('✅ Basic query succeeded')
    console.log('Returned columns:', testData.length > 0 ? Object.keys(testData[0]) : 'No data')
  }
  
  // Try to get actual schema info
  console.log('\n📊 Attempting to query schema information...')
  console.log('Please run this SQL in your Supabase SQL Editor to see the actual schema:')
  console.log('```sql')
  console.log(query)
  console.log('```')
  
  console.log('\nAlternatively, check the Table Editor in Supabase Dashboard to see:')
  console.log('1. What columns exist in the users table')
  console.log('2. What data types they have')
  console.log('3. Which columns are required (NOT NULL)')
}

checkSchema().catch(console.error)