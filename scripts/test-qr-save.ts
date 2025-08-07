import { SupabaseService } from '../src/core/services/SupabaseService';

async function testQRSave() {
  try {
    const db = SupabaseService.getInstance();
    await db.initialize();
    
    console.log('Checking QR codes in database...');
    
    // Query all QR codes
    const { data: qrCodes, error } = await db.from('qr_codes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) {
      console.error('Error querying QR codes:', error);
      return;
    }
    
    console.log(`Found ${qrCodes?.length || 0} QR codes:`);
    qrCodes?.forEach((qr, index) => {
      console.log(`${index + 1}. User: ${qr.user_id}, Created: ${qr.created_at}, Expires: ${qr.expires_at}, Used: ${qr.is_used}`);
    });
    
    if (qrCodes && qrCodes.length > 0) {
      console.log('\n✅ QR codes are being saved successfully!');
    } else {
      console.log('\n❌ No QR codes found in database');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testQRSave();