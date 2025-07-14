# Instagram API Documentation

## Overview

The Instagram API provides comprehensive functionality for managing Instagram sessions, sending messages, and performing various Instagram actions. The API is designed to be secure, scalable, and follows RESTful principles.

## Base URL

```
https://your-api-domain.com/api/v2/instagram
```

## Authentication

All endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Login**: 5 attempts per 5 minutes
- **Messages**: 30 messages per minute
- **Bulk Messages**: 5 operations per 5 minutes
- **Actions**: 50 actions per minute
- **Comments**: 20 comments per minute
- **Follows**: 30 follows per minute

## Endpoints

### Authentication

#### Login to Instagram
```http
POST /instagram/login
```

**Request Body:**
```json
{
  "username": "your_instagram_username",
  "password": "your_instagram_password",
  "twoFactorCode": "123456", // Optional
  "config": {
    "headless": true,
    "userAgent": "Custom User Agent",
    "proxy": {
      "host": "proxy.example.com",
      "port": 8080,
      "username": "proxy_user",
      "password": "proxy_pass"
    },
    "timeout": 30000,
    "retryAttempts": 3
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "instagram_1234567890_abc123",
    "userId": "user_123",
    "username": "your_instagram_username",
    "sessionId": "instagram_1234567890_abc123",
    "isActive": true,
    "lastActivity": "2024-01-01T12:00:00.000Z",
    "metadata": {
      "followersCount": 1000,
      "followingCount": 500,
      "postsCount": 50,
      "isBusinessAccount": false,
      "isVerified": false
    },
    "settings": {
      "autoReply": false,
      "autoLike": false,
      "autoFollow": false,
      "autoUnfollow": false,
      "maxDailyActions": 100,
      "actionDelay": 30000
    }
  },
  "message": "Login successful",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### Logout from Instagram
```http
POST /instagram/logout/{sessionId}
```

**Response:**
```json
{
  "success": true,
  "message": "Logout successful",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Session Management

#### Get Session Status
```http
GET /instagram/session/{sessionId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "instagram_1234567890_abc123",
    "userId": "user_123",
    "username": "your_instagram_username",
    "sessionId": "instagram_1234567890_abc123",
    "isActive": true,
    "lastActivity": "2024-01-01T12:00:00.000Z",
    "metadata": {
      "followersCount": 1000,
      "followingCount": 500,
      "postsCount": 50
    },
    "settings": {
      "autoReply": false,
      "autoLike": false,
      "autoFollow": false,
      "autoUnfollow": false,
      "maxDailyActions": 100,
      "actionDelay": 30000
    }
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### Get User Sessions
```http
GET /instagram/sessions/{userId}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "instagram_1234567890_abc123",
      "userId": "user_123",
      "username": "your_instagram_username",
      "sessionId": "instagram_1234567890_abc123",
      "isActive": true,
      "lastActivity": "2024-01-01T12:00:00.000Z"
    }
  ],
  "message": "Found 1 sessions",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### Update Session Settings
```http
PUT /instagram/session/{sessionId}
```

**Request Body:**
```json
{
  "settings": {
    "autoReply": true,
    "autoLike": false,
    "autoFollow": true,
    "autoUnfollow": false,
    "maxDailyActions": 150,
    "actionDelay": 45000
  },
  "metadata": {
    "followersCount": 1100,
    "followingCount": 550,
    "postsCount": 55
  }
}
```

#### Deactivate Session
```http
DELETE /instagram/session/{sessionId}
```

### Messaging

#### Send Direct Message
```http
POST /instagram/message
```

**Request Body:**
```json
{
  "sessionId": "instagram_1234567890_abc123",
  "recipientUsername": "target_user",
  "content": "Hello! How are you?",
  "messageType": "text",
  "mediaUrl": "https://example.com/image.jpg" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "msg_1234567890_abc123",
    "sessionId": "instagram_1234567890_abc123",
    "conversationId": "conv_your_username_target_user",
    "messageId": "msg_1234567890_abc123",
    "senderId": "user_123",
    "senderUsername": "your_instagram_username",
    "recipientId": "user_target_user",
    "recipientUsername": "target_user",
    "content": "Hello! How are you?",
    "messageType": "text",
    "isRead": false,
    "isFromMe": true,
    "timestamp": "2024-01-01T12:00:00.000Z",
    "metadata": {
      "hashtags": [],
      "mentions": []
    }
  },
  "message": "Message queued for sending",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### Send Bulk Messages
```http
POST /instagram/messages/bulk
```

**Request Body:**
```json
{
  "sessionId": "instagram_1234567890_abc123",
  "recipients": ["user1", "user2", "user3"],
  "content": "Hello everyone!",
  "messageType": "text",
  "delayBetweenMessages": 30000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sent": 3,
    "failed": 0,
    "messages": [
      {
        "id": "msg_1234567890_abc123",
        "recipientUsername": "user1",
        "content": "Hello everyone!"
      }
    ]
  },
  "message": "Bulk message completed: 3 sent, 0 failed",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### Get Conversation Messages
```http
GET /instagram/conversation/{conversationId}/messages?limit=50&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "msg_1234567890_abc123",
      "sessionId": "instagram_1234567890_abc123",
      "conversationId": "conv_your_username_target_user",
      "messageId": "msg_1234567890_abc123",
      "senderId": "user_123",
      "senderUsername": "your_instagram_username",
      "recipientId": "user_target_user",
      "recipientUsername": "target_user",
      "content": "Hello! How are you?",
      "messageType": "text",
      "isRead": true,
      "isFromMe": true,
      "timestamp": "2024-01-01T12:00:00.000Z"
    }
  ],
  "message": "Retrieved 1 messages",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### Get User Conversations
```http
GET /instagram/session/{sessionId}/conversations
```

#### Mark Message as Read
```http
PUT /instagram/message/{messageId}/read
```

#### Delete Message
```http
DELETE /instagram/message/{messageId}
```

#### Get Message Statistics
```http
GET /instagram/session/{sessionId}/messages/stats?period=day
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 150,
    "sent": 100,
    "received": 50,
    "read": 140,
    "unread": 10,
    "byType": {
      "text": 120,
      "image": 20,
      "video": 10
    }
  },
  "message": "Retrieved message statistics for day",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Actions

#### Like a Post
```http
POST /instagram/actions/like
```

**Request Body:**
```json
{
  "sessionId": "instagram_1234567890_abc123",
  "postId": "post_1234567890"
}
```

#### Comment on a Post
```http
POST /instagram/actions/comment
```

**Request Body:**
```json
{
  "sessionId": "instagram_1234567890_abc123",
  "postId": "post_1234567890",
  "content": "Great post! 👍"
}
```

#### Follow a User
```http
POST /instagram/actions/follow
```

**Request Body:**
```json
{
  "sessionId": "instagram_1234567890_abc123",
  "userId": "user_1234567890"
}
```

### Statistics

#### Get Session Statistics
```http
GET /instagram/sessions/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 10,
    "active": 8,
    "expired": 2,
    "byUser": {
      "user_123": 3,
      "user_456": 2,
      "user_789": 5
    }
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### Check if User Can Create Session
```http
GET /instagram/sessions/can-create/{userId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "canCreate": true
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error description",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Common Error Codes

- `400` - Bad Request (missing required fields)
- `401` - Unauthorized (invalid or missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (session/message not found)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

## Webhooks

The Instagram API supports webhooks for real-time event notifications. Configure webhooks to receive notifications for:

- Message received
- Story reply received
- Comment received
- Like received
- Follow received
- Unfollow received
- Mention received

## Rate Limits

The API implements sophisticated rate limiting to comply with Instagram's policies:

| Action | Per Hour | Per Day |
|--------|----------|---------|
| Like | 50 | 200 |
| Comment | 20 | 100 |
| Follow | 30 | 150 |
| Unfollow | 30 | 150 |
| Story View | 100 | 500 |
| Story Reply | 20 | 100 |
| Reel Like | 50 | 200 |
| Reel Comment | 20 | 100 |

## Best Practices

1. **Session Management**: Always validate sessions before performing actions
2. **Rate Limiting**: Respect the rate limits to avoid account restrictions
3. **Error Handling**: Implement proper error handling for all API calls
4. **Webhooks**: Use webhooks for real-time updates instead of polling
5. **Security**: Keep your JWT tokens secure and rotate them regularly
6. **Monitoring**: Monitor your API usage and session health

## SDK Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

const instagramAPI = {
  baseURL: 'https://your-api-domain.com/api/v2/instagram',
  token: 'your-jwt-token',

  async login(username, password) {
    const response = await axios.post(`${this.baseURL}/login`, {
      username,
      password
    }, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    return response.data;
  },

  async sendMessage(sessionId, recipient, content) {
    const response = await axios.post(`${this.baseURL}/message`, {
      sessionId,
      recipientUsername: recipient,
      content
    }, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    return response.data;
  }
};
```

### Python

```python
import requests

class InstagramAPI:
    def __init__(self, base_url, token):
        self.base_url = base_url
        self.headers = {'Authorization': f'Bearer {token}'}

    def login(self, username, password):
        response = requests.post(
            f'{self.base_url}/login',
            json={'username': username, 'password': password},
            headers=self.headers
        )
        return response.json()

    def send_message(self, session_id, recipient, content):
        response = requests.post(
            f'{self.base_url}/message',
            json={
                'sessionId': session_id,
                'recipientUsername': recipient,
                'content': content
            },
            headers=self.headers
        )
        return response.json()
```

## Support

For API support and questions:

- **Documentation**: [API Documentation](https://docs.your-api.com)
- **Status Page**: [API Status](https://status.your-api.com)
- **Support Email**: api-support@your-company.com
- **GitHub Issues**: [GitHub Repository](https://github.com/your-org/instagram-api) 