const { createClient } = require('@supabase/supabase-js');

async function addTierColumn() {
  try {
    const supabaseUrl = 'https://bqitfhvaejxcyvjszfom.supabase.co';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxaXRmaHZhZWp4Y3l2anN6Zm9tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzkzOTAzMywiZXhwIjoyMDY5NTE1MDMzfQ.8Y3pami7B2T85SODXncYtPgPbuvcCcBjon9FvaBjFLA';
    
    console.log('🔑 Using Supabase URL:', supabaseUrl);
    console.log('🔑 Using Service Key:', supabaseServiceKey.substring(0, 50) + '...');

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('🔍 Checking current users table structure...');
    const { data: currentUsers, error: selectError } = await supabase
      .from('users')
      .select('*')
      .limit(1);

    if (selectError) {
      console.log('❌ Error checking users table:', selectError.message);
    } else {
      console.log('✅ Current users table sample:', currentUsers);
    }

    // Try to add the tier column using a raw SQL query
    console.log('🔧 Adding tier column to users table...');
    
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS tier VARCHAR(50) NOT NULL DEFAULT 'enterprise_b2b' 
        CHECK (tier IN ('standard', 'professional', 'enterprise', 'enterprise_b2b'));
        
        UPDATE users SET tier = 'enterprise_b2b' WHERE tier IS NULL OR tier = '';
      `
    });

    if (error) {
      console.log('❌ Error adding tier column:', error.message);
      // Try alternative approach - direct update without RPC
      console.log('🔄 Trying alternative approach...');
      
      // Try to insert a test record to see if tier column exists
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: 'test-tier-check',
          email: 'test@test.com',
          full_name: 'Test User',
          tier: 'enterprise_b2b'
        });
        
      if (insertError) {
        console.log('❌ Tier column does not exist:', insertError.message);
        console.log('📝 Please add the tier column manually in Supabase dashboard:');
        console.log('   ALTER TABLE users ADD COLUMN tier VARCHAR(50) NOT NULL DEFAULT \'enterprise_b2b\';');
      } else {
        console.log('✅ Tier column already exists and working!');
        // Clean up test record
        await supabase.from('users').delete().eq('id', 'test-tier-check');
      }
    } else {
      console.log('✅ Tier column added successfully!', data);
    }

    console.log('🔍 Checking updated users table structure...');
    const { data: updatedUsers, error: finalError } = await supabase
      .from('users')
      .select('*')
      .limit(1);

    if (finalError) {
      console.log('❌ Error checking updated table:', finalError.message);
    } else {
      console.log('✅ Updated users table sample:', updatedUsers);
    }

  } catch (error) {
    console.error('❌ Script error:', error.message);
  }
}

addTierColumn();