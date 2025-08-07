require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugRPCError() {
  const testUuid = 'b006bd62-4258-4cc6-bf94-78e4c92a8184';
  
  console.log('Debugging RPC error...');
  console.log('Test UUID:', testUuid);
  
  try {
    // 1. Test direct query first
    console.log('\n1. Direct table query:');
    const { data: directData, error: directError } = await supabase
      .from('qr_codes')
      .select('*')
      .eq('userId', testUuid)
      .order('createdAt', { ascending: false })
      .limit(5);
    
    console.log('Direct query result:', { data: directData, error: directError });
    
    // 2. Test RPC function
    console.log('\n2. RPC function call:');
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_latest_qr_code', { p_user_id: testUuid });
    
    console.log('RPC result:', { data: rpcData, error: rpcError });
    console.log('RPC error details:', JSON.stringify(rpcError, null, 2));
    
    // 3. Check what we inserted with the test
    console.log('\n3. Check test records:');
    const { data: testData, error: testError } = await supabase
      .from('qr_codes')
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(3);
    
    console.log('Latest records:', { data: testData, error: testError });
    
  } catch (error) {
    console.error('Debug error:', error);
  }
}

debugRPCError();