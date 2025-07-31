module.exports = {
  apps: [
    {
      name: 'whatsapp-api-v2',
      script: 'start.js',
      instances: 1, // Solo 1 instancia para WhatsApp (no puede ser clusterizado)
      exec_mode: 'fork', // Modo fork (no cluster) para WhatsApp
      autorestart: true,
      watch: false,
      max_memory_restart: '4G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '0.0.0.0',
        ENABLE_WHATSAPP: 'true',
        ENABLE_INSTAGRAM: 'false',
        PLATFORM: 'whatsapp'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '0.0.0.0', 
        ENABLE_WHATSAPP: 'true',
        ENABLE_INSTAGRAM: 'false',
        PLATFORM: 'whatsapp',
        // Firebase Configuration - Using service account file
        GOOGLE_APPLICATION_CREDENTIALS: './serviceAccountKey.json',
        FIREBASE_STORAGE_BUCKET: 'koafy-5bbb8.firebasestorage.app',
        // Gemini AI
        GEMINI_API_KEY: 'AIzaSyAR8-do--xXdS225R3zCJ2MIb-N1ijdMDc',
        // Redis
        REDIS_PASSWORD: 'z4kHAwBJg3UEoKZhPGrD/6TQCqG7fOWJEMrb47SUbNo='
      },
      
      // Configuración de logs
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Configuración de reinicio automático
      min_uptime: '10s',
      max_restarts: 15,
      restart_delay: 4000,
      
      // Variables específicas para WhatsApp
      kill_timeout: 60000, // 60 segundos para cerrar graciosamente
      listen_timeout: 10000,
      wait_ready: true,
      
      // Configuración específica para headless Chrome, Redis y EventEmitters
      node_args: '--max-old-space-size=4096 --max-http-header-size=16384 --max-listeners=200',
      
      // Configuración de monitoreo
      pmx: true,
      
      // Variables de entorno adicionales para producción
      source_map: false,
      
      // Configuración para reinicio automático si cae
      exp_backoff_restart_delay: 100
    }
  ],
  
  // Configuración de deploy (opcional)
  deploy: {
    production: {
      user: 'root',
      host: 'localhost',
      ref: 'origin/master',
      repo: 'git@github.com:username/whatsapp-api-v2.git',
      path: '/root/new-setter-wsp',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  }
}; 