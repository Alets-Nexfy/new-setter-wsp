#!/usr/bin/env node

const qrTerminal = require('qrcode-terminal');

if (process.argv.length < 3) {
  console.log('❌ Uso: node scripts/show-qr.js <userId>');
  console.log('📖 Ejemplo: node scripts/show-qr.js FU7rZ3mKT5Vvx0PQ7EcYwg35ge23');
  process.exit(1);
}

const userId = process.argv[2];
const apiUrl = `http://localhost:3000/api/whatsapp/${userId}/qr`;

console.log(`🔍 Obteniendo QR para usuario: ${userId}`);
console.log(`📡 Consultando: ${apiUrl}`);
console.log('⏳ Esperando...\n');

async function showQR() {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.log(`❌ Error HTTP: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.log(`📄 Respuesta: ${errorText}`);
      return;
    }

    const data = await response.json();
    
    if (!data.success) {
      console.log(`❌ Error API: ${data.error}`);
      return;
    }

    if (!data.data.qr) {
      console.log('⚠️  QR no disponible aún');
      console.log(`📊 Status: ${data.data.status || 'unknown'}`);
      console.log('💡 Asegúrate de que el worker esté iniciado con:');
      console.log(`   curl -X POST "http://localhost:3000/api/whatsapp/${userId}/connect?forceRestart=true"`);
      return;
    }

    console.log('✅ ¡QR obtenido exitosamente!');
    console.log(`📊 Status: ${data.data.status}`);
    console.log('📱 Escanea este QR con WhatsApp:\n');

    // Primero intentar usar el texto QR original si está disponible
    const qrText = data.data.qrText || data.data.last_qr_text;
    
    if (qrText) {
      console.log('🎯 QR Code (desde texto original):');
      console.log('━'.repeat(50));
      
      qrTerminal.generate(qrText, { small: true }, function (qrcode) {
        console.log(qrcode);
        console.log('━'.repeat(50));
        console.log(`👤 Usuario: ${userId}`);
        console.log(`🕒 Timestamp: ${data.data.timestamp}`);
        console.log('\n📱 Abre WhatsApp > Dispositivos vinculados > Vincular dispositivo');
        console.log('📲 Escanea el QR de arriba ☝️');
      });
    } else {
      console.log('⚠️  Texto QR no disponible, mostrando imagen base64 (puede no ser compatible)');
      console.log('🎯 QR Code (desde imagen):');
      console.log('━'.repeat(50));
      
      // Fallback: mostrar el data URL directamente (menos confiable)
      qrTerminal.generate(data.data.qr, { small: true }, function (qrcode) {
        console.log(qrcode);
        console.log('━'.repeat(50));
        console.log(`👤 Usuario: ${userId}`);
        console.log(`🕒 Timestamp: ${data.data.timestamp}`);
        console.log('\n📱 Abre WhatsApp > Dispositivos vinculados > Vincular dispositivo');
        console.log('📲 Escanea el QR de arriba ☝️');
        console.log('\n💡 Para mejor calidad, reinicia el worker para obtener el texto QR original');
      });
    }

  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    console.log('🔧 Verifica que el servidor esté corriendo en puerto 3000');
  }
}

showQR();