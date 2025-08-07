const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function checkQRDatabase() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('🔍 Verificando QR codes en la base de datos...\n');
    
    // Consultar todos los QR codes
    const { data: qrCodes, error } = await supabase
      .from('qr_codes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('❌ Error consultando QR codes:', error);
      return;
    }
    
    console.log(`📊 Encontrados ${qrCodes?.length || 0} QR codes:`);
    
    if (qrCodes && qrCodes.length > 0) {
      qrCodes.forEach((qr, index) => {
        console.log(`\n${index + 1}. QR Code:`);
        console.log(`   - ID: ${qr.id}`);
        console.log(`   - Usuario: ${qr.user_id}`);
        console.log(`   - Creado: ${qr.created_at}`);
        console.log(`   - Expira: ${qr.expires_at}`);
        console.log(`   - Usado: ${qr.is_used ? 'Sí' : 'No'}`);
        console.log(`   - Plataforma: ${qr.platform}`);
        console.log(`   - QR Code: ${qr.qr_code ? qr.qr_code.substring(0, 50) + '...' : 'N/A'}`);
        console.log(`   - QR Image: ${qr.qr_image ? 'Presente (base64)' : 'N/A'}`);
      });
      
      console.log('\n✅ ¡Los QR codes se están guardando correctamente!');
    } else {
      console.log('\n⚠️  No se encontraron QR codes en la base de datos.');
      console.log('Esto puede significar que:');
      console.log('1. Aún no se ha generado ningún QR code');
      console.log('2. Hay un problema con el guardado');
      console.log('3. Los QR codes expiraron y fueron eliminados');
    }
    
  } catch (error) {
    console.error('💥 Error en la verificación:', error);
  }
}

checkQRDatabase();