module.exports = {
  apps: [
    {
      name: 'setter-ai-v2',
      script: 'src/server.ts',
      interpreter: 'node',
      interpreter_args: '--require ts-node/register --require tsconfig-paths/register',
      instances: 1, // Solo 1 instancia para WhatsApp (no puede ser clusterizado)
      exec_mode: 'fork', // Modo fork (no cluster) para WhatsApp
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        ENABLE_WHATSAPP: 'true',
        ENABLE_INSTAGRAM: 'false',
        TS_NODE_PROJECT: './tsconfig.json'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        ENABLE_WHATSAPP: 'true',
        ENABLE_INSTAGRAM: 'false',
        TS_NODE_PROJECT: './tsconfig.json'
      },
      // Configuración de logs
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Configuración de reinicio automático
      min_uptime: '10s',
      max_restarts: 10,
      
      // Variables específicas para WhatsApp
      kill_timeout: 30000, // 30 segundos para cerrar graciosamente
      listen_timeout: 10000,
      
      // Configuración específica para headless Chrome
      node_args: '--max-old-space-size=2048'
    }
  ]
}; 