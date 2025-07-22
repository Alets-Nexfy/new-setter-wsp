#!/usr/bin/env node

// Wrapper script para ejecutar TypeScript con ts-node
const { spawn } = require('child_process');
const path = require('path');

// Configurar variables de entorno para TypeScript
process.env.TS_NODE_PROJECT = './tsconfig.json';
process.env.TS_NODE_TRANSPILE_ONLY = 'true';

// Ruta al archivo TypeScript principal
const serverPath = path.join(__dirname, 'src', 'server.ts');

console.log('🚀 Iniciando Setter AI WhatsApp API v2...');
console.log('📁 Archivo principal:', serverPath);

// Argumentos para ts-node
const args = [
  '--require', 'ts-node/register',
  '--require', 'tsconfig-paths/register',
  serverPath
];

console.log('⚙️  Argumentos ts-node:', args);

// Ejecutar ts-node
const child = spawn('node', args, {
  stdio: 'inherit',
  env: process.env
});

// Manejar señales de cierre
process.on('SIGTERM', () => {
  console.log('📴 Recibida señal SIGTERM, cerrando graciosamente...');
  child.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('📴 Recibida señal SIGINT, cerrando graciosamente...');
  child.kill('SIGINT');
});

// Propagar el código de salida
child.on('exit', (code) => {
  console.log(`🔚 Proceso ts-node terminado con código: ${code}`);
  process.exit(code);
});

child.on('error', (error) => {
  console.error('❌ Error al ejecutar ts-node:', error);
  process.exit(1);
}); 