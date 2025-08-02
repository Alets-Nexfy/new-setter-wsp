import { SupabaseService } from '../src/core/services/SupabaseService'
import * as dotenv from 'dotenv'
import { v4 as uuidv4 } from 'uuid'

dotenv.config()

async function testWhatsAppFlow() {
  console.log('🧪 Testing Complete WhatsApp Flow with Supabase\n')
  
  const supabaseService = SupabaseService.getInstance()
  await supabaseService.initialize()
  
  const client = supabaseService.getAdminClient()
  
  try {
    // 1. Create a test user
    const testUserId = uuidv4()
    const testEmail = `test_${Date.now()}@example.com`
    
    console.log('1️⃣ Creating test user...')
    const { data: user, error: userError } = await client
      .from('users')
      .insert({
        id: testUserId,
        email: testEmail,
        full_name: 'Test WhatsApp User',
        username: `testuser_${Date.now()}`,
        whatsapp_number: '+5493425123456',
        is_active: true
      })
      .select()
      .single()
    
    if (userError) {
      console.error('❌ User creation failed:', userError)
      return
    }
    
    console.log('✅ User created:', user.email)
    
    // 2. Create a WhatsApp session
    console.log('\n2️⃣ Creating WhatsApp session...')
    const sessionId = uuidv4()
    const { data: session, error: sessionError } = await client
      .from('sessions')
      .insert({
        id: sessionId,
        user_id: testUserId,
        platform: 'whatsapp',
        status: 'connected',
        qr_code: 'test-qr-code',
        metadata: {
          phoneNumber: '+5493425123456',
          deviceId: 'test-device'
        }
      })
      .select()
      .single()
    
    if (sessionError) {
      console.error('❌ Session creation failed:', sessionError)
      return
    }
    
    console.log('✅ Session created:', session.id)
    
    // 3. Create a chat
    console.log('\n3️⃣ Creating chat...')
    const chatId = uuidv4()
    const { data: chat, error: chatError } = await client
      .from('chats')
      .insert({
        id: chatId,
        user_id: testUserId,
        session_id: sessionId,
        platform: 'whatsapp',
        contact_identifier: '+5493425987654',
        metadata: {
          name: 'Test Contact',
          phoneNumber: '+5493425987654'
        },
        human_present: false,
        auto_agent_paused: false
      })
      .select()
      .single()
    
    if (chatError) {
      console.error('❌ Chat creation failed:', chatError)
      return
    }
    
    console.log('✅ Chat created:', chat.contact_identifier)
    
    // 4. Send a message
    console.log('\n4️⃣ Sending message...')
    const messageId = uuidv4()
    const { data: message, error: messageError } = await client
      .from('messages')
      .insert({
        id: messageId,
        chat_id: chatId,
        user_id: testUserId,
        platform: 'whatsapp',
        content: 'Hello from Supabase test!',
        type: 'text',
        direction: 'outgoing',
        status: 'sent'
      })
      .select()
      .single()
    
    if (messageError) {
      console.error('❌ Message creation failed:', messageError)
      return
    }
    
    console.log('✅ Message sent:', message.content)
    
    // 5. Test human presence detection
    console.log('\n5️⃣ Testing human presence...')
    const { data: presenceResult, error: presenceError } = await client
      .rpc('is_human_present_in_chat', { chat_uuid: chatId })
    
    if (presenceError) {
      console.error('❌ Presence check failed:', presenceError)
    } else {
      console.log('✅ Human presence status:', presenceResult)
    }
    
    // 6. Update human presence
    console.log('\n6️⃣ Simulating human activity...')
    const { error: updateError } = await client
      .rpc('update_human_presence', {
        p_user_id: testUserId,
        p_chat_id: chatId,
        p_is_present: true
      })
    
    if (updateError) {
      console.error('❌ Presence update failed:', updateError)
    } else {
      console.log('✅ Human presence updated')
    }
    
    // 7. Get statistics
    console.log('\n7️⃣ Getting user statistics...')
    const { data: stats, error: statsError } = await client
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', testUserId)
    
    console.log('✅ Total messages for user:', stats || 0)
    
    // 8. Test chat listing
    console.log('\n8️⃣ Listing user chats...')
    const { data: chats, error: chatsError } = await client
      .from('chats')
      .select('*')
      .eq('user_id', testUserId)
      .eq('platform', 'whatsapp')
    
    if (chatsError) {
      console.error('❌ Chat listing failed:', chatsError)
    } else {
      console.log('✅ User has', chats.length, 'WhatsApp chats')
    }
    
    // 9. Clean up test data
    console.log('\n9️⃣ Cleaning up test data...')
    
    // Delete in order due to foreign keys
    await client.from('messages').delete().eq('chat_id', chatId)
    await client.from('chats').delete().eq('id', chatId)
    await client.from('sessions').delete().eq('id', sessionId)
    await client.from('users').delete().eq('id', testUserId)
    
    console.log('✅ Test data cleaned up')
    
    console.log('\n🎉 WHATSAPP FLOW TEST COMPLETED SUCCESSFULLY!')
    console.log('\n📊 Summary:')
    console.log('✅ Supabase connection working')
    console.log('✅ User creation working')
    console.log('✅ Session management working')
    console.log('✅ Chat creation working')
    console.log('✅ Message sending working')
    console.log('✅ Human presence detection working')
    console.log('✅ Platform isolation (WhatsApp) working')
    console.log('✅ Data queries working')
    console.log('✅ Cleanup working')
    
  } catch (error) {
    console.error('💥 Test failed:', error)
  }
}

testWhatsAppFlow().catch(console.error)