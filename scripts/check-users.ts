import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUsers() {
  console.log('Checking users in database...\n');
  
  // Get users
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, active_agent_id')
    .limit(10);
    
  if (error) {
    console.error('Error fetching users:', error);
    return;
  }
  
  if (!users || users.length === 0) {
    console.log('No users found in database');
    console.log('\nCreating a test user...');
    
    // Create a test user
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        email: 'test@example.com',
        platform_id: 'tribe-ia-nexus'
      })
      .select()
      .single();
      
    if (createError) {
      console.error('Error creating test user:', createError);
    } else {
      console.log('Test user created:', newUser);
      console.log('\nUse this ID for testing:', newUser.id);
      console.log('Full user ID (with platform):', `tribe-ia-nexus_${newUser.id}`);
    }
  } else {
    console.log('Found users:');
    users.forEach(user => {
      console.log(`- ID: ${user.id}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Active Agent: ${user.active_agent_id || 'None'}`);
      console.log(`  Full ID (with platform): tribe-ia-nexus_${user.id}`);
      console.log('');
    });
    
    // Use the first user for testing
    const testUser = users[0];
    console.log('\n✅ Use this for testing:');
    console.log(`curl -X POST "https://api.nexfy.io/api/multi-agent/tribe-ia-nexus_${testUser.id}/config" -H "Content-Type: application/json" -d '{"activeAgents":["agent1"],"defaultAgent":"agent1","triggerConfig":{"initial":{},"switch":{},"fallback":[]}}'`);
  }
}

checkUsers().catch(console.error);