# WhatsApp API v2 - Modular and Scalable Architecture

## 🚀 Overview

WhatsApp API v2 is a complete rewrite of the original WhatsApp integration API, designed with modern architecture principles, modularity, and scalability in mind. This version separates concerns between WhatsApp and Instagram platforms while maintaining a clean, maintainable codebase.

## 🏗️ Architecture

```
src/
├── core/                 # Core business logic
│   ├── services/        # Business services
│   ├── models/          # Data models
│   ├── repositories/    # Data access layer
│   └── utils/           # Utility functions
├── platforms/           # Platform-specific implementations
│   ├── whatsapp/        # WhatsApp integration
│   └── instagram/       # Instagram integration
├── api/                 # API layer
│   ├── routes/          # Route definitions
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Express middleware
│   └── validators/      # Request validation
├── workers/             # Background workers
│   ├── whatsapp-worker/ # WhatsApp message processing
│   └── instagram-worker/ # Instagram message processing
└── shared/              # Shared utilities
    ├── types/           # TypeScript type definitions
    ├── constants/       # Application constants
    └── interfaces/      # Shared interfaces
```

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: Firebase Firestore
- **Cache**: Redis
- **Queue**: Bull (Redis-based)
- **AI**: Google Gemini
- **Testing**: Jest
- **Linting**: ESLint
- **Formatting**: Prettier

## 📋 Prerequisites

- Node.js 18 or higher
- Redis server
- Firebase project
- Google Gemini API key

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd whatsapp-api-v2
npm install
```

### 2. Environment Setup

```bash
cp env.example .env
# Edit .env with your configuration
```

### 3. Development

```bash
# Start development server
npm run dev

# Start WhatsApp worker
npm run worker:whatsapp

# Start Instagram worker
npm run worker:instagram
```

### 4. Production

```bash
# Build the project
npm run build

# Start production server
npm start
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 📚 API Documentation

### Authentication

All API endpoints require authentication using JWT tokens or API keys.

### Endpoints

#### WhatsApp
- `POST /api/whatsapp/connect` - Connect WhatsApp session
- `POST /api/whatsapp/send-message` - Send message
- `POST /api/whatsapp/send-media` - Send media
- `GET /api/whatsapp/status` - Get connection status
- `DELETE /api/whatsapp/disconnect` - Disconnect session

#### Instagram
- `POST /api/instagram/connect` - Connect Instagram session
- `POST /api/instagram/send-message` - Send message
- `POST /api/instagram/send-media` - Send media
- `GET /api/instagram/status` - Get connection status
- `DELETE /api/instagram/disconnect` - Disconnect session

#### AI Integration
- `POST /api/ai/generate-response` - Generate AI response
- `POST /api/ai/analyze-sentiment` - Analyze message sentiment
- `POST /api/ai/summarize` - Summarize conversation

#### Webhooks
- `POST /api/webhooks/whatsapp` - WhatsApp webhook
- `POST /api/webhooks/instagram` - Instagram webhook

## 🔧 Configuration

### Environment Variables

See `env.example` for all available configuration options.

### Firebase Setup

1. Create a Firebase project
2. Generate service account key
3. Set environment variables

### Redis Setup

1. Install Redis server
2. Configure connection in `.env`

## 📊 Monitoring

- **Logs**: Winston with daily rotation
- **Metrics**: Custom metrics collection
- **Health Checks**: `/health` endpoint
- **WebSocket**: Real-time status updates

## 🔒 Security

- JWT authentication
- API key validation
- Rate limiting
- Input validation
- CORS configuration
- Helmet security headers

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For support and questions, please open an issue in the repository. 