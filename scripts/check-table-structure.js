require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTableStructure() {
  try {
    // Query table to see actual structure by inserting and checking error
    console.log('Checking qr_codes table structure...');
    
    const { data, error } = await supabase
      .from('qr_codes')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Error:', error);
    } else {
      console.log('Sample data:', data);
      if (data && data.length > 0) {
        console.log('Actual columns:', Object.keys(data[0]));
      } else {
        console.log('No data found, trying to get columns via insert...');
        
        // Try inserting with different column names to see which ones exist
        const testInsert = await supabase
          .from('qr_codes')
          .insert({
            userId: 'test',
            qrCode: 'test',
            user_id: 'test2',
            qr_code: 'test2'
          });
        
        console.log('Insert test result:', testInsert);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkTableStructure();