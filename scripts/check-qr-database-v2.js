// Import using the same pattern as the main application
const path = require('path');
const { SupabaseService } = require('../src/core/services/SupabaseService');

async function checkQRCodes() {
  try {
    console.log('🔍 Checking QR codes in database...');
    
    const targetUserId = 'b006bd62-4258-4cc6-bf94-78e4c92a8184';
    
    // Use SupabaseService
    const db = new SupabaseService();
    
    // Get all QR codes for this user
    const { data: qrCodes, error } = await db.getAdminClient()
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
      console.log(`${index + 1}. ID: ${qr.id}, Created: ${qr.createdAt}, QR: ${qr.qrCode ? 'Present' : 'NULL'}`);
    });
    
    // Check if there are any duplicates
    if (qrCodes.length > 1) {
      console.log('⚠️  Multiple QR codes found - this causes the "multiple rows returned" error');
      console.log('🧹 Cleaning up old QR codes...');
      
      // Keep only the most recent one
      const recentQR = qrCodes[0];
      const oldQRs = qrCodes.slice(1);
      
      for (const oldQR of oldQRs) {
        const { error: deleteError } = await db.getAdminClient()
          .from('qr_codes')
          .delete()
          .eq('id', oldQR.id);
        
        if (deleteError) {
          console.error(`❌ Error deleting QR ${oldQR.id}:`, deleteError);
        } else {
          console.log(`✅ Deleted old QR code ID ${oldQR.id} created at ${oldQR.createdAt}`);
        }
      }
      
      console.log(`✅ Cleanup complete. Kept QR code ID ${recentQR.id} created at ${recentQR.createdAt}`);
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