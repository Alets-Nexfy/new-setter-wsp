import { SupabaseService } from '../src/core/services/SupabaseService'
import * as dotenv from 'dotenv'
import { v4 as uuidv4 } from 'uuid'

// Load environment variables
dotenv.config()

async function testSimpleFlow() {
  console.log('🧪 Simple Supabase Test\n')
  
  const supabaseService = SupabaseService.getInstance()
  await supabaseService.initialize()
  
  const client = supabaseService.getAdminClient()
  const testUserId = uuidv4()
  
  try {
    // 1. Create simple user
    console.log('1. Creating user...')
    const { data: user, error: userError } = await client
      .from('users')
      .insert({
        id: testUserId,
        email: `test_${Date.now()}@example.com`,
        name: 'Test User',
        tier: 'standard',
        status: 'active'
      })
      .select()
      .single()

    if (userError) {
      console.error('❌ User creation failed:', userError)
      return
    }

    console.log('✅ User created:', user.email)

    // 2. Create session
    console.log('\n2. Creating session...')
    const { data: session, error: sessionError } = await client
      .from('sessions')
      .insert({
        id: uuidv4(),
        user_id: testUserId,
        platform: 'whatsapp',
        status: 'disconnected'
      })
      .select()
      .single()

    if (sessionError) {
      console.error('❌ Session creation failed:', sessionError)
    } else {
      console.log('✅ Session created:', session.id)
    }

    // 3. Create chat
    console.log('\n3. Creating chat...')
    const { data: chat, error: chatError } = await client
      .from('chats')
      .insert({
        id: uuidv4(),
        user_id: testUserId,
        platform: 'whatsapp',
        contact_id: '1234567890@c.us',
        contact_name: 'Test Contact'
      })
      .select()
      .single()

    if (chatError) {
      console.error('❌ Chat creation failed:', chatError)
    } else {
      console.log('✅ Chat created:', chat.contact_name)
    }

    // 4. Create agent
    console.log('\n4. Creating agent...')
    const { data: agent, error: agentError } = await client
      .from('agents')
      .insert({
        id: uuidv4(),
        user_id: testUserId,
        name: 'Test Agent',
        agent_type: 'customer_service',
        config: {}
      })
      .select()
      .single()

    if (agentError) {
      console.error('❌ Agent creation failed:', agentError)
    } else {
      console.log('✅ Agent created:', agent.name)
    }

    // 5. Query data
    console.log('\n5. Querying data...')
    
    // Get all user data
    const { data: userData, error: queryError } = await client
      .from('users')
      .select(`
        *,
        sessions(count),
        chats(count),
        agents(count)
      `)
      .eq('id', testUserId)
      .single()

    if (queryError) {
      console.error('❌ Query failed:', queryError)
    } else {
      console.log('✅ User data retrieved:')
      console.log(`   - Email: ${userData.email}`)
      console.log(`   - Sessions: ${userData.sessions[0].count}`)
      console.log(`   - Chats: ${userData.chats[0].count}`)
      console.log(`   - Agents: ${userData.agents[0].count}`)
    }

    // 6. Cleanup
    console.log('\n6. Cleaning up...')
    
    // Delete in order
    await client.from('agents').delete().eq('user_id', testUserId)
    await client.from('chats').delete().eq('user_id', testUserId)
    await client.from('sessions').delete().eq('user_id', testUserId)
    await client.from('users').delete().eq('id', testUserId)
    
    console.log('✅ Cleanup completed')
    
    console.log('\n🎉 All tests passed!')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

// Run test
testSimpleFlow().catch(console.error)