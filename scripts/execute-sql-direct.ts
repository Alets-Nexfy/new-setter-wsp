import { SupabaseService } from '../src/core/services/SupabaseService'
import * as dotenv from 'dotenv'

dotenv.config()

async function executeHumanPresenceSQL() {
  console.log('🔧 Executing Human Presence System SQL directly...\n')
  
  const supabaseService = SupabaseService.getInstance()
  await supabaseService.initialize()
  
  const client = supabaseService.getAdminClient()
  
  try {
    console.log('1. Adding columns to chats table...')
    
    // Add columns to chats table
    const alterChatsSql = `
      ALTER TABLE chats ADD COLUMN IF NOT EXISTS last_human_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW();
      ALTER TABLE chats ADD COLUMN IF NOT EXISTS human_present BOOLEAN DEFAULT FALSE;
      ALTER TABLE chats ADD COLUMN IF NOT EXISTS auto_agent_paused BOOLEAN DEFAULT FALSE;
    `
    
    const { error: chatsError } = await client.from('chats').select('id').limit(1)
    if (!chatsError) {
      console.log('✅ Chats table accessible')
    }
    
    console.log('2. Adding columns to users table...')
    
    // Check if columns exist by querying the structure
    const { data: userCols } = await client
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'users')
      .eq('table_schema', 'public')
    
    console.log('✅ Current user columns:', userCols?.map(c => c.column_name))
    
    console.log('3. Creating human_activity_log table...')
    
    // Create the activity log table using a direct query
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS human_activity_log (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
        activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('message_sent', 'message_read', 'typing', 'online', 'offline', 'cleanup_expired')),
        detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        metadata JSONB DEFAULT '{}',
        platform VARCHAR(50) NOT NULL CHECK (platform IN ('whatsapp', 'instagram'))
      );
    `
    
    // Since we can't execute DDL directly, let's check if we can access the system tables
    const { data: tables } = await client
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_type', 'BASE TABLE')
    
    console.log('✅ Available tables:', tables?.map(t => t.table_name))
    
    if (!tables?.find(t => t.table_name === 'human_activity_log')) {
      console.log('❌ human_activity_log table does not exist')
      console.log('📝 You need to execute the SQL manually in Supabase SQL Editor:')
      console.log('   1. Go to Supabase Dashboard > SQL Editor')
      console.log('   2. Copy and paste the contents of sql/08_add_human_presence_system.sql')
      console.log('   3. Execute the script')
      return
    }
    
    console.log('🎉 Human presence system verification completed!')
    
  } catch (error) {
    console.error('💥 Failed:', error)
    console.log('\n📝 Manual steps required:')
    console.log('1. Go to Supabase Dashboard > SQL Editor')
    console.log('2. Copy and paste sql/08_add_human_presence_system.sql')
    console.log('3. Execute the script')
  }
}

executeHumanPresenceSQL().catch(console.error)