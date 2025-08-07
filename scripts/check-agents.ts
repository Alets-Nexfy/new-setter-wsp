import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAgents() {
  console.log('Checking agents in database...\n');
  
  // Get first user
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, email')
    .limit(1);
    
  if (userError || !users || users.length === 0) {
    console.error('Error fetching users:', userError);
    return;
  }
  
  const testUser = users[0];
  console.log(`Using test user: ${testUser.email}`);
  console.log(`User ID: ${testUser.id}\n`);
  
  // Check if user has agents
  const { data: agents, error: agentError } = await supabase
    .from('agents')
    .select('id, name, is_active')
    .eq('user_id', testUser.id);
    
  if (agentError) {
    console.error('Error fetching agents:', agentError);
    return;
  }
  
  if (!agents || agents.length === 0) {
    console.log('No agents found for user. Creating a test agent...\n');
    
    // Create a test agent
    const { data: newAgent, error: createError } = await supabase
      .from('agents')
      .insert({
        user_id: testUser.id,
        name: 'Test Agent',
        is_active: true,
        config: {
          name: 'Test Agent',
          description: 'Test agent for multi-agent configuration',
          automation: {
            agentNetwork: [],
            triggers: []
          }
        }
      })
      .select()
      .single();
      
    if (createError) {
      console.error('Error creating agent:', createError);
      return;
    }
    
    console.log('Agent created:', newAgent);
    
    // Update user's active agent
    const { error: updateError } = await supabase
      .from('users')
      .update({ active_agent_id: newAgent.id })
      .eq('id', testUser.id);
      
    if (updateError) {
      console.error('Error updating user active agent:', updateError);
    } else {
      console.log('User active agent updated');
    }
    
    console.log('\n✅ Now test with:');
    console.log(`curl -X POST "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_${testUser.id}/config" -H "Content-Type: application/json" -d '{"activeAgents":["${newAgent.id}"],"defaultAgent":"${newAgent.id}","triggerConfig":{"initial":{},"switch":{},"fallback":[]}}'`);
  } else {
    console.log('Found agents:');
    agents.forEach(agent => {
      console.log(`- ID: ${agent.id}`);
      console.log(`  Name: ${agent.name}`);
      console.log(`  Active: ${agent.is_active}`);
      console.log('');
    });
    
    // Set the first agent as active if user has no active agent
    const { data: userData, error: userCheckError } = await supabase
      .from('users')
      .select('active_agent_id')
      .eq('id', testUser.id)
      .single();
      
    if (!userData?.active_agent_id && agents[0]) {
      const { error: updateError } = await supabase
        .from('users')
        .update({ active_agent_id: agents[0].id })
        .eq('id', testUser.id);
        
      if (!updateError) {
        console.log(`\nSet ${agents[0].name} as active agent for user`);
      }
    }
    
    const activeAgent = agents[0];
    console.log('\n✅ Test with:');
    console.log(`curl -X POST "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_${testUser.id}/config" -H "Content-Type: application/json" -d '{"activeAgents":["${activeAgent.id}"],"defaultAgent":"${activeAgent.id}","triggerConfig":{"initial":{},"switch":{},"fallback":[]}}'`);
  }
}

checkAgents().catch(console.error);