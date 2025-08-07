require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkQR() {
  const uuid = 'b006bd62-4258-4cc6-bf94-78e4c92a8184';
  
  console.log('Checking QR codes for UUID:', uuid);
  
  const { data, error } = await supabase
    .from('qr_codes')
    .select('user_id, qr_code, created_at')
    .or(`user_id.eq.${uuid},user_id.eq.tribe-ia-nexus_${uuid}`)
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.log('Error:', error);
  } else {
    console.log('Found', data?.length || 0, 'QR codes');
    data?.forEach(qr => {
      console.log(`- User ID: ${qr.user_id}, Created: ${qr.created_at}, QR: ${qr.qr_code?.substring(0, 50)}...`);
    });
  }
}

checkQR().then(() => process.exit(0));