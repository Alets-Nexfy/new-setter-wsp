import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestData() {
  console.log('Creating test data for multi-agent configuration...\n');
  
  const testUserId = uuidv4();
  const testAgentId1 = uuidv4();
  const testAgentId2 = uuidv4();
  
  try {
    // 1. Create test user
    console.log('Creating test user...');
    const timestamp = Date.now();
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        id: testUserId,
        email: `test-${timestamp}@example.com`,
        full_name: 'Test User for Multi-Agent',
        username: `testuser${timestamp}`
      })
      .select()
      .single();
      
    if (userError) {
      console.error('Error creating user:', userError);
      return;
    }
    
    console.log('✅ User created:', user.id);
    
    // 2. Create first agent
    console.log('\nCreating Agent 1 (Sales Agent)...');
    const { data: agent1, error: agent1Error } = await supabase
      .from('agents')
      .insert({
        id: testAgentId1,
        user_id: testUserId,
        name: 'Sales Agent',
        is_active: true,
        config: {
          name: 'Sales Agent',
          description: 'Handles sales inquiries and product information',
          personality: 'Professional and persuasive',
          automation: {
            agentNetwork: [],
            triggers: []
          }
        }
      })
      .select()
      .single();
      
    if (agent1Error) {
      console.error('Error creating agent 1:', agent1Error);
      return;
    }
    
    console.log('✅ Agent 1 created:', agent1.id);
    
    // 3. Create second agent
    console.log('\nCreating Agent 2 (Support Agent)...');
    const { data: agent2, error: agent2Error } = await supabase
      .from('agents')
      .insert({
        id: testAgentId2,
        user_id: testUserId,
        name: 'Support Agent',
        is_active: true,
        config: {
          name: 'Support Agent',
          description: 'Handles customer support and technical issues',
          personality: 'Helpful and patient',
          automation: {
            agentNetwork: [],
            triggers: []
          }
        }
      })
      .select()
      .single();
      
    if (agent2Error) {
      console.error('Error creating agent 2:', agent2Error);
      return;
    }
    
    console.log('✅ Agent 2 created:', agent2.id);
    
    // 4. Set active agent for user
    console.log('\nSetting active agent for user...');
    const { error: updateError } = await supabase
      .from('users')
      .update({ active_agent_id: testAgentId1 })
      .eq('id', testUserId);
      
    if (updateError) {
      console.error('Error updating user:', updateError);
      return;
    }
    
    console.log('✅ Active agent set');
    
    // 5. Print test commands
    console.log('\n' + '='.repeat(80));
    console.log('TEST DATA CREATED SUCCESSFULLY');
    console.log('='.repeat(80));
    console.log('\n📋 Test Information:');
    console.log(`- User ID: ${testUserId}`);
    console.log(`- Full User ID: tribe-ia-nexus_${testUserId}`);
    console.log(`- Agent 1 ID: ${testAgentId1} (Sales Agent)`);
    console.log(`- Agent 2 ID: ${testAgentId2} (Support Agent)`);
    
    console.log('\n🚀 Test Commands:\n');
    
    console.log('1. Test multi-agent configuration update:');
    console.log(`curl -X POST "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_${testUserId}/config" -H "Content-Type: application/json" -d '{"activeAgents":["${testAgentId1}","${testAgentId2}"],"defaultAgent":"${testAgentId1}","triggerConfig":{"initial":{"keywords":["sales","buy","price"],"agentId":"${testAgentId1}"},"switch":{"fromAgent":"${testAgentId1}","toAgent":"${testAgentId2}","keywords":["help","support","problem"]},"fallback":["${testAgentId1}"]}}'`);
    
    console.log('\n2. Test getting configuration:');
    console.log(`curl "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_${testUserId}/config"`);
    
    console.log('\n3. Test trigger evaluation:');
    console.log(`curl -X POST "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_${testUserId}/triggers/test" -H "Content-Type: application/json" -d '{"message":"I need help with my order","currentAgentId":"${testAgentId1}"}'`);
    
    console.log('\n💡 Frontend Testing:');
    console.log(`When testing from the frontend, login with user ID: ${testUserId}`);
    console.log(`Or update the frontend code to use this test user ID temporarily.`);
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

createTestData().catch(console.error);