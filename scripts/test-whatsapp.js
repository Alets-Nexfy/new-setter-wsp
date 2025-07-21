#!/usr/bin/env node

/**
 * Script de Testing para WhatsApp API v2
 * Verifica todas las funcionalidades principales
 */

const axios = require('axios');
const readline = require('readline');

const BASE_URL = 'http://localhost:3000/api';
const TEST_USER_ID = 'test-user-' + Date.now();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class WhatsAppTester {
  constructor() {
    this.testResults = [];
  }

  async runTest(description, testFn) {
    try {
      console.log(`\n🧪 Testing: ${description}`);
      const result = await testFn();
      this.testResults.push({ description, status: 'PASS', result });
      console.log(`✅ PASS: ${description}`);
      return result;
    } catch (error) {
      this.testResults.push({ description, status: 'FAIL', error: error.message });
      console.log(`❌ FAIL: ${description} - ${error.message}`);
      return null;
    }
  }

  async testServerHealth() {
    const response = await axios.get(`${BASE_URL}/health`);
    if (response.status !== 200) {
      throw new Error(`Server not healthy: ${response.status}`);
    }
    return response.data;
  }

  async testWhatsAppConnection() {
    const response = await axios.post(`${BASE_URL}/whatsapp/connect/${TEST_USER_ID}`);
    if (response.status !== 200) {
      throw new Error(`Connection failed: ${response.status}`);
    }
    return response.data;
  }

  async testGetQRCode() {
    const response = await axios.get(`${BASE_URL}/whatsapp/qr/${TEST_USER_ID}`);
    if (response.status !== 200) {
      throw new Error(`QR generation failed: ${response.status}`);
    }
    return response.data;
  }

  async testWhatsAppStatus() {
    const response = await axios.get(`${BASE_URL}/whatsapp/status/${TEST_USER_ID}`);
    return response.data;
  }

  async testSendMessage() {
    const testMessage = {
      userId: TEST_USER_ID,
      recipient: '1234567890@c.us', // Número de prueba
      message: 'Test message from API v2'
    };

    const response = await axios.post(`${BASE_URL}/whatsapp/send-message`, testMessage);
    if (response.status !== 200) {
      throw new Error(`Message sending failed: ${response.status}`);
    }
    return response.data;
  }

  async testGetChats() {
    const response = await axios.get(`${BASE_URL}/chats/${TEST_USER_ID}`);
    return response.data;
  }

  async testAgentsList() {
    const response = await axios.get(`${BASE_URL}/agents/${TEST_USER_ID}`);
    return response.data;
  }

  async waitForUserInput(message) {
    return new Promise((resolve) => {
      rl.question(message, (answer) => {
        resolve(answer);
      });
    });
  }

  async runAllTests() {
    console.log('🚀 Iniciando tests de WhatsApp API v2...\n');
    console.log(`📋 Test User ID: ${TEST_USER_ID}\n`);

    // Test 1: Server Health
    await this.runTest('Server Health Check', () => this.testServerHealth());

    // Test 2: WhatsApp Connection
    const connectionResult = await this.runTest('WhatsApp Connection', () => this.testWhatsAppConnection());

    if (connectionResult) {
      // Test 3: QR Code Generation
      const qrResult = await this.runTest('QR Code Generation', () => this.testGetQRCode());

      if (qrResult && qrResult.qr) {
        console.log(`\n📱 QR Code generado. Escanea desde WhatsApp Web.`);
        console.log(`🔗 QR Data URL: ${qrResult.qr.substring(0, 50)}...`);
        
        await this.waitForUserInput('\nPresiona ENTER después de escanear el QR...');
        
        // Test 4: Connection Status
        await this.runTest('WhatsApp Status Check', () => this.testWhatsAppStatus());
      }
    }

    // Test 5: Get Chats
    await this.runTest('Get Chats List', () => this.testGetChats());

    // Test 6: Get Agents
    await this.runTest('Get Agents List', () => this.testAgentsList());

    // Test 7: Send Test Message (opcional)
    const sendTest = await this.waitForUserInput('\n¿Quieres probar envío de mensaje? (y/n): ');
    if (sendTest.toLowerCase() === 'y') {
      const phoneNumber = await this.waitForUserInput('Ingresa número de WhatsApp (formato: 1234567890): ');
      if (phoneNumber) {
        await this.runTest('Send Test Message', async () => {
          return this.testSendMessage();
        });
      }
    }

    this.printSummary();
  }

  printSummary() {
    console.log('\n📊 RESUMEN DE TESTS:');
    console.log('=' .repeat(50));

    let passed = 0;
    let failed = 0;

    this.testResults.forEach(test => {
      const status = test.status === 'PASS' ? '✅' : '❌';
      console.log(`${status} ${test.description}`);
      
      if (test.status === 'PASS') passed++;
      else failed++;
    });

    console.log('\n📈 ESTADÍSTICAS:');
    console.log(`✅ Tests pasados: ${passed}`);
    console.log(`❌ Tests fallidos: ${failed}`);
    console.log(`📊 Total: ${this.testResults.length}`);

    if (failed === 0) {
      console.log('\n🎉 ¡Todos los tests pasaron correctamente!');
    } else {
      console.log('\n⚠️  Algunos tests fallaron. Revisa la configuración.');
    }
  }
}

// Ejecutar tests
async function main() {
  const tester = new WhatsAppTester();
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error('❌ Error durante testing:', error.message);
  } finally {
    rl.close();
  }
}

// Verificar si el servidor está corriendo
async function checkServer() {
  try {
    await axios.get(`${BASE_URL}/health`);
    return true;
  } catch (error) {
    return false;
  }
}

checkServer().then(isRunning => {
  if (!isRunning) {
    console.log('❌ Servidor no está corriendo en http://localhost:3000');
    console.log('📝 Ejecuta primero: npm run dev');
    process.exit(1);
  } else {
    main();
  }
}); 