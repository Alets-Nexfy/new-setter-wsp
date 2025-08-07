import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findActiveUsers() {
  console.log('Finding users with active agents...\n');
  
  // Get users with active agents
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, active_agent_id')
    .not('active_agent_id', 'is', null)
    .limit(10);
    
  if (error) {
    console.error('Error fetching users:', error);
    return;
  }
  
  if (!users || users.length === 0) {
    console.log('No users with active agents found.');
    console.log('\nTo test multi-agent configuration, you need to:');
    console.log('1. Create a user');
    console.log('2. Create at least one agent for that user');
    console.log('3. Set the agent as active for the user');
    return;
  }
  
  console.log('Found users with active agents:');
  for (const user of users) {
    console.log(`\nUser ID: ${user.id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Active Agent: ${user.active_agent_id}`);
    
    // Get agent details
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('name, config')
      .eq('id', user.active_agent_id)
      .single();
      
    if (agent) {
      console.log(`Agent Name: ${agent.name}`);
    }
    
    console.log('\n✅ Test command for this user:');
    console.log(`curl -X POST "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_${user.id}/config" -H "Content-Type: application/json" -d '{"activeAgents":["${user.active_agent_id}"],"defaultAgent":"${user.active_agent_id}","triggerConfig":{"initial":{"keywords":["hello","start"],"agentId":"${user.active_agent_id}"},"switch":{},"fallback":[]}}'`);
    console.log('-'.repeat(80));
  }
}

findActiveUsers().catch(console.error);