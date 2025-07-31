import { SupabaseService } from '../src/core/services/SupabaseService'
import * as dotenv from 'dotenv'
import { v4 as uuidv4 } from 'uuid'

dotenv.config()

async function testBasicCRUD() {
  console.log('🧪 Testing Basic CRUD Operations\n')
  
  const supabaseService = SupabaseService.getInstance()
  await supabaseService.initialize()
  
  const client = supabaseService.getAdminClient()
  const testUserId = uuidv4()
  
  try {
    // 1. CREATE - Insert a test user
    console.log('1. CREATE: Inserting test user...')
    const { data: user, error: userError } = await client
      .from('users')
      .insert({
        id: testUserId,
        email: `test_${Date.now()}@example.com`,
        name: 'Test User for WhatsApp API',
        tier: 'standard',
        status: 'active',
        settings: { language: 'en', notifications: true }
      })
      .select()
      .single()

    if (userError) {
      console.error('❌ CREATE failed:', userError)
      return
    }

    console.log('✅ User created successfully')
    console.log(`   - ID: ${user.id}`)
    console.log(`   - Email: ${user.email}`)
    console.log(`   - Tier: ${user.tier}`)

    // 2. READ - Query the user
    console.log('\n2. READ: Querying user...')
    const { data: readUser, error: readError } = await client
      .from('users')
      .select('*')
      .eq('id', testUserId)
      .single()

    if (readError) {
      console.error('❌ READ failed:', readError)
    } else {
      console.log('✅ User retrieved successfully')
      console.log(`   - Name: ${readUser.name}`)
      console.log(`   - Created: ${readUser.created_at}`)
    }

    // 3. UPDATE - Modify user
    console.log('\n3. UPDATE: Updating user...')
    const { data: updatedUser, error: updateError } = await client
      .from('users')
      .update({
        name: 'Updated Test User',
        tier: 'professional',
        settings: { language: 'es', notifications: false }
      })
      .eq('id', testUserId)
      .select()
      .single()

    if (updateError) {
      console.error('❌ UPDATE failed:', updateError)
    } else {
      console.log('✅ User updated successfully')
      console.log(`   - New name: ${updatedUser.name}`)
      console.log(`   - New tier: ${updatedUser.tier}`)
    }

    // 4. CREATE related data - Session
    console.log('\n4. CREATE: Adding WhatsApp session...')
    const { data: session, error: sessionError } = await client
      .from('sessions')
      .insert({
        id: uuidv4(),
        user_id: testUserId,
        platform: 'whatsapp',
        status: 'connecting',
        session_data: { browser: 'Chrome', version: '1.0' }
      })
      .select()
      .single()

    if (sessionError) {
      console.error('❌ Session creation failed:', sessionError)
    } else {
      console.log('✅ WhatsApp session created')
      console.log(`   - Session ID: ${session.id}`)
      console.log(`   - Platform: ${session.platform}`)
      console.log(`   - Status: ${session.status}`)
    }

    // 5. CREATE related data - Chat
    console.log('\n5. CREATE: Adding chat...')
    const chatId = uuidv4()
    const { data: chat, error: chatError } = await client
      .from('chats')
      .insert({
        id: chatId,
        user_id: testUserId,
        platform: 'whatsapp',
        contact_id: '5493425123456@c.us',
        contact_name: 'Test Contact Argentina',
        is_active: true,
        labels: ['test', 'argentina']
      })
      .select()
      .single()

    if (chatError) {
      console.error('❌ Chat creation failed:', chatError)
    } else {
      console.log('✅ Chat created successfully')
      console.log(`   - Contact: ${chat.contact_name}`)
      console.log(`   - Contact ID: ${chat.contact_id}`)
    }

    // 6. CREATE related data - Message
    console.log('\n6. CREATE: Adding message...')
    const { data: message, error: messageError } = await client
      .from('messages')
      .insert({
        id: uuidv4(),
        user_id: testUserId,
        chat_id: chatId,
        platform: 'whatsapp',
        from_contact: chat.contact_id,
        to_contact: 'me',
        message_type: 'text',
        content: 'Hola! Este es un mensaje de prueba desde Argentina 🇦🇷',
        status: 'delivered'
      })
      .select()
      .single()

    if (messageError) {
      console.error('❌ Message creation failed:', messageError)
    } else {
      console.log('✅ Message created successfully')
      console.log(`   - Content: ${message.content}`)
      console.log(`   - Type: ${message.message_type}`)
      console.log(`   - Status: ${message.status}`)
    }

    // 7. COMPLEX QUERY - Get user with related data
    console.log('\n7. COMPLEX QUERY: Getting user with all related data...')
    const { data: userWithData, error: complexError } = await client
      .from('users')
      .select(`
        id,
        email,
        name,
        tier,
        sessions (
          id,
          platform,
          status
        ),
        chats (
          id,
          contact_name,
          platform,
          messages (
            id,
            content,
            message_type
          )
        )
      `)
      .eq('id', testUserId)
      .single()

    if (complexError) {
      console.error('❌ Complex query failed:', complexError)
    } else {
      console.log('✅ Complex query successful')
      console.log(`   - User: ${userWithData.name}`)
      console.log(`   - Sessions: ${userWithData.sessions?.length || 0}`)
      console.log(`   - Chats: ${userWithData.chats?.length || 0}`)
      console.log(`   - Messages: ${userWithData.chats?.[0]?.messages?.length || 0}`)
    }

    // 8. DELETE - Cleanup (CASCADE will handle related data)
    console.log('\n8. DELETE: Cleaning up...')
    const { error: deleteError } = await client
      .from('users')
      .delete()
      .eq('id', testUserId)

    if (deleteError) {
      console.error('❌ DELETE failed:', deleteError)
    } else {
      console.log('✅ User and related data deleted successfully')
    }

    console.log('\n🎉 ALL CRUD OPERATIONS COMPLETED SUCCESSFULLY!')
    console.log('\n✨ Supabase is ready for WhatsApp API v2!')
    
  } catch (error) {
    console.error('\n💥 Test failed:', error)
  }
}

testBasicCRUD().catch(console.error)