import { SupabaseService } from '../src/core/services/SupabaseService'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

async function checkMigrationStatus() {
  console.log('🔍 Checking migration status...')
  
  const supabaseService = SupabaseService.getInstance()
  await supabaseService.initialize()
  
  const client = supabaseService.getClient()
  
  try {
    // Check each table
    const tables = [
      'users',
      'sessions',
      'chats',
      'messages',
      'agents',
      'agent_triggers',
      'kanban_boards',
      'kanban_columns',
      'kanban_cards',
      'notifications',
      'automation_rules',
      'action_flows',
      'firebase_functions'
    ]
    
    console.log('\n📊 MIGRATION STATUS:')
    console.log('=' .repeat(50))
    
    for (const table of tables) {
      try {
        const { count, error } = await client
          .from(table)
          .select('*', { count: 'exact', head: true })
        
        if (error) {
          console.log(`❌ ${table.padEnd(20)} Error: ${error.message}`)
        } else {
          const status = count > 0 ? '✅' : '⚠️'
          console.log(`${status} ${table.padEnd(20)} ${count || 0} records`)
        }
      } catch (err) {
        console.log(`❌ ${table.padEnd(20)} Failed to query`)
      }
    }
    
    console.log('=' .repeat(50))
    
    // Get sample data
    console.log('\n📝 SAMPLE DATA:')
    
    // Sample users
    const { data: users } = await client
      .from('users')
      .select('id, email, name, tier')
      .limit(3)
    
    console.log('\nUsers:')
    users?.forEach(user => {
      console.log(`  - ${user.email} (${user.tier})`)
    })
    
    // Sample messages
    const { data: messages, count: messageCount } = await client
      .from('messages')
      .select('*', { count: 'exact' })
      .limit(5)
    
    console.log(`\nMessages: ${messageCount} total`)
    messages?.forEach(msg => {
      console.log(`  - ${msg.from_contact} → ${msg.to_contact}: ${msg.content.substring(0, 50)}...`)
    })
    
    // Sample agents
    const { data: agents } = await client
      .from('agents')
      .select('id, name, agent_type')
      .limit(3)
    
    console.log('\nAgents:')
    agents?.forEach(agent => {
      console.log(`  - ${agent.name} (${agent.agent_type})`)
    })
    
    console.log('\n✅ Migration status check completed!')
    
  } catch (error) {
    console.error('❌ Error checking migration status:', error)
  }
}

// Run the check
checkMigrationStatus().catch(console.error)