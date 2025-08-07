require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRPCFunctions() {
  console.log('Testing RPC functions...');
  
  const testUuid = 'b006bd62-4258-4cc6-bf94-78e4c92a8184';
  
  try {
    // Test insert function
    console.log('\n1. Testing insert_qr_code...');
    const { data: insertData, error: insertError } = await supabase
      .rpc('insert_qr_code', {
        p_user_id: testUuid,
        p_qr_code: 'test-qr-code-123',
        p_qr_image: 'test-image-data'
      });
    
    if (insertError) {
      console.error('Insert error:', insertError);
    } else {
      console.log('Insert success:', insertData);
    }
    
    // Test get function
    console.log('\n2. Testing get_latest_qr_code...');
    const { data: getData, error: getError } = await supabase
      .rpc('get_latest_qr_code', {
        p_user_id: testUuid
      });
    
    if (getError) {
      console.error('Get error:', getError);
    } else {
      console.log('Get success:', getData);
    }
    
    // Test direct table query to see structure
    console.log('\n3. Testing direct table query...');
    const { data: tableData, error: tableError } = await supabase
      .from('qr_codes')
      .select('*')
      .eq('user_id', testUuid)
      .limit(1);
    
    if (tableError) {
      console.error('Table query error:', tableError);
    } else {
      console.log('Table query success:', tableData);
    }
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testRPCFunctions();