const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hnwovkfhmtqsejrvdzfj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhud292a2ZobXRxc2VqcnZkemZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyODY4MDI5NywiZXhwIjoyMDQ0MjU2Mjk3fQ.fwOOJpfnLYlhHmkMVB86dGY1uTbCHnNPuXrO-_BNJa4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkQRCodes() {
  try {
    console.log('🔍 Checking QR codes in database...');
    
    const targetUserId = 'b006bd62-4258-4cc6-bf94-78e4c92a8184';
    
    // Get all QR codes for this user
    const { data: qrCodes, error } = await supabase
      .from('qr_codes')
      .select('*')
      .eq('userId', targetUserId)
      .order('createdAt', { ascending: false });
    
    if (error) {
      console.error('❌ Error querying QR codes:', error);
      return;
    }
    
    console.log(`📊 Found ${qrCodes.length} QR codes for user ${targetUserId}:`);
    
    qrCodes.forEach((qr, index) => {
      console.log(`${index + 1}. Created: ${qr.createdAt}, QR Code: ${qr.qrCode ? qr.qrCode.substring(0, 50) + '...' : 'NULL'}`);
    });
    
    // Check if there are any duplicates
    if (qrCodes.length > 1) {
      console.log('⚠️  Multiple QR codes found - this causes the "multiple rows returned" error');
      console.log('🧹 Cleaning up old QR codes...');
      
      // Keep only the most recent one
      const recentQR = qrCodes[0];
      const oldQRs = qrCodes.slice(1);
      
      for (const oldQR of oldQRs) {
        const { error: deleteError } = await supabase
          .from('qr_codes')
          .delete()
          .eq('id', oldQR.id);
        
        if (deleteError) {
          console.error(`❌ Error deleting QR ${oldQR.id}:`, deleteError);
        } else {
          console.log(`✅ Deleted old QR code created at ${oldQR.createdAt}`);
        }
      }
      
      console.log(`✅ Cleanup complete. Kept QR code created at ${recentQR.createdAt}`);
    } else if (qrCodes.length === 1) {
      console.log('✅ Only one QR code found - this is correct');
    } else {
      console.log('📭 No QR codes found for this user');
    }
    
  } catch (error) {
    console.error('💥 Script error:', error);
  }
}

checkQRCodes().then(() => {
  console.log('🏁 Script completed');
  process.exit(0);
});