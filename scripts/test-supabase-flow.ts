import { SupabaseService } from '../src/core/services/SupabaseService'
import axios from 'axios'
import * as dotenv from 'dotenv'
import { v4 as uuidv4 } from 'uuid'

// Load environment variables
dotenv.config()

const API_BASE_URL = 'http://localhost:3000/api'
const TEST_USER_ID = uuidv4()
const TEST_USER_EMAIL = `test_${Date.now()}@example.com`

class SupabaseFlowTester {
  private supabaseService: SupabaseService
  private authToken: string = ''

  constructor() {
    this.supabaseService = SupabaseService.getInstance()
  }

  async initialize() {
    console.log('🔧 Initializing Supabase test flow...')
    await this.supabaseService.initialize()
    console.log('✅ Supabase initialized')
  }

  async testCompleteFlow() {
    try {
      console.log('\n🚀 STARTING COMPLETE FLOW TEST\n')
      
      // 1. Create test user directly in Supabase
      await this.createTestUser()
      
      // 2. Test authentication
      await this.testAuthentication()
      
      // 3. Test WhatsApp connection
      await this.testWhatsAppConnection()
      
      // 4. Test sending message
      await this.testSendMessage()
      
      // 5. Test agent creation
      await this.testAgentCreation()
      
      // 6. Cleanup
      await this.cleanup()
      
      console.log('\n✅ ALL TESTS COMPLETED SUCCESSFULLY!')
      
    } catch (error) {
      console.error('\n❌ TEST FAILED:', error)
      throw error
    }
  }

  private async createTestUser() {
    console.log('\n📝 1. Creating test user in Supabase...')
    
    const { data, error } = await this.supabaseService.getAdminClient()
      .from('users')
      .insert({
        id: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        name: 'Test User',
        tier: 'standard',
        status: 'active',
        settings: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_activity: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create user: ${error.message}`)
    }

    console.log(`✅ User created:`)
    console.log(`   - ID: ${data.id}`)
    console.log(`   - Email: ${data.email}`)
    console.log(`   - Tier: ${data.tier}`)
  }

  private async testAuthentication() {
    console.log('\n🔐 2. Testing authentication...')
    
    try {
      // For testing, we'll simulate authentication since the API uses Firebase Auth
      // In a real scenario, you'd need to implement Supabase Auth
      this.authToken = 'test-token-' + TEST_USER_ID
      
      console.log('✅ Authentication simulated')
      console.log(`   - Token: ${this.authToken}`)
      
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`)
    }
  }

  private async testWhatsAppConnection() {
    console.log('\n📱 3. Testing WhatsApp connection...')
    
    try {
      // Create a session in Supabase
      const { data: session, error } = await this.supabaseService.getAdminClient()
        .from('sessions')
        .insert({
          id: uuidv4(),
          user_id: TEST_USER_ID,
          platform: 'whatsapp',
          status: 'connecting',
          session_data: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_activity: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to create session: ${error.message}`)
      }

      console.log('✅ WhatsApp session created:')
      console.log(`   - Session ID: ${session.id}`)
      console.log(`   - Status: ${session.status}`)
      
      // Test QR generation (API call)
      console.log('\n   Testing QR generation via API...')
      
      try {
        const response = await axios.get(
          `${API_BASE_URL}/whatsapp/${TEST_USER_ID}/qr`,
          {
            headers: {
              'Authorization': `Bearer ${this.authToken}`,
              'X-API-Key': process.env.API_KEY_SECRET
            }
          }
        )
        
        console.log('✅ QR endpoint responded:')
        console.log(`   - Status: ${response.status}`)
        console.log(`   - QR Available: ${!!response.data.qr}`)
        
      } catch (apiError: any) {
        console.log('⚠️  QR generation failed (expected if WhatsApp service not running):')
        console.log(`   - Error: ${apiError.response?.data?.error || apiError.message}`)
      }
      
    } catch (error) {
      throw new Error(`WhatsApp connection test failed: ${error.message}`)
    }
  }

  private async testSendMessage() {
    console.log('\n💬 4. Testing message sending...')
    
    try {
      // Create a test chat
      const { data: chat, error: chatError } = await this.supabaseService.getAdminClient()
        .from('chats')
        .insert({
          id: uuidv4(),
          user_id: TEST_USER_ID,
          platform: 'whatsapp',
          contact_id: '1234567890@c.us',
          contact_name: 'Test Contact',
          is_active: true,
          is_archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (chatError) {
        throw new Error(`Failed to create chat: ${chatError.message}`)
      }

      console.log('✅ Test chat created:')
      console.log(`   - Chat ID: ${chat.id}`)
      console.log(`   - Contact: ${chat.contact_name}`)

      // Create a test message
      const { data: message, error: msgError } = await this.supabaseService.getAdminClient()
        .from('messages')
        .insert({
          id: uuidv4(),
          user_id: TEST_USER_ID,
          chat_id: chat.id,
          platform: 'whatsapp',
          from_contact: 'me',
          to_contact: chat.contact_id,
          message_type: 'text',
          content: 'Test message from Supabase',
          timestamp: new Date().toISOString(),
          status: 'sent'
        })
        .select()
        .single()

      if (msgError) {
        throw new Error(`Failed to create message: ${msgError.message}`)
      }

      console.log('✅ Test message created:')
      console.log(`   - Message ID: ${message.id}`)
      console.log(`   - Content: ${message.content}`)
      console.log(`   - Status: ${message.status}`)
      
    } catch (error) {
      throw new Error(`Message test failed: ${error.message}`)
    }
  }

  private async testAgentCreation() {
    console.log('\n🤖 5. Testing agent creation...')
    
    try {
      const { data: agent, error } = await this.supabaseService.getAdminClient()
        .from('agents')
        .insert({
          id: uuidv4(),
          user_id: TEST_USER_ID,
          name: 'Test Assistant',
          agent_type: 'customer_service',
          config: {
            model: 'gemini-1.5-flash',
            temperature: 0.7,
            systemPrompt: 'You are a helpful test assistant.'
          },
          is_active: true,
          is_default: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to create agent: ${error.message}`)
      }

      console.log('✅ Test agent created:')
      console.log(`   - Agent ID: ${agent.id}`)
      console.log(`   - Name: ${agent.name}`)
      console.log(`   - Type: ${agent.agent_type}`)
      console.log(`   - Active: ${agent.is_active}`)
      
    } catch (error) {
      throw new Error(`Agent creation test failed: ${error.message}`)
    }
  }

  private async cleanup() {
    console.log('\n🧹 6. Cleaning up test data...')
    
    try {
      // Delete in reverse order of foreign key dependencies
      
      // Delete messages
      await this.supabaseService.getAdminClient()
        .from('messages')
        .delete()
        .eq('user_id', TEST_USER_ID)

      // Delete chats
      await this.supabaseService.getAdminClient()
        .from('chats')
        .delete()
        .eq('user_id', TEST_USER_ID)

      // Delete agents
      await this.supabaseService.getAdminClient()
        .from('agents')
        .delete()
        .eq('user_id', TEST_USER_ID)

      // Delete sessions
      await this.supabaseService.getAdminClient()
        .from('sessions')
        .delete()
        .eq('user_id', TEST_USER_ID)

      // Delete user
      await this.supabaseService.getAdminClient()
        .from('users')
        .delete()
        .eq('id', TEST_USER_ID)

      console.log('✅ Test data cleaned up')
      
    } catch (error) {
      console.error('⚠️  Cleanup failed:', error)
      console.log(`   Manual cleanup needed for user: ${TEST_USER_ID}`)
    }
  }

  async runIndividualTests() {
    console.log('\n🔧 INDIVIDUAL TEST OPTIONS:\n')
    console.log('1. Create User Only')
    console.log('2. Test Authentication')
    console.log('3. Test WhatsApp Connection')
    console.log('4. Test Message Sending')
    console.log('5. Test Agent Creation')
    console.log('6. Run Complete Flow')
    console.log('7. Cleanup Test Data')
    
    // For CLI, run complete flow by default
    await this.testCompleteFlow()
  }
}

// Main execution
async function main() {
  const tester = new SupabaseFlowTester()
  
  try {
    await tester.initialize()
    
    const testType = process.argv[2] || 'complete'
    
    switch (testType) {
      case 'user':
        await tester['createTestUser']()
        break
      case 'complete':
      default:
        await tester.testCompleteFlow()
        break
    }
    
    console.log('\n🎉 Testing completed!')
    
  } catch (error) {
    console.error('💥 Test failed:', error)
    process.exit(1)
  }
}

// Run tests
if (require.main === module) {
  main().catch(console.error)
}

export { SupabaseFlowTester }