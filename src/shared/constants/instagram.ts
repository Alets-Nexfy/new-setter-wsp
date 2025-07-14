export const INSTAGRAM_CONSTANTS = {
  // API Endpoints
  BASE_URL: 'https://www.instagram.com',
  API_BASE_URL: 'https://i.instagram.com/api/v1',
  GRAPHQL_URL: 'https://www.instagram.com/graphql/query/',
  
  // Session Management
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  MAX_SESSIONS_PER_USER: 5,
  SESSION_CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour
  
  // Rate Limiting
  RATE_LIMITS: {
    LIKE: { maxPerHour: 50, maxPerDay: 200 },
    COMMENT: { maxPerHour: 20, maxPerDay: 100 },
    FOLLOW: { maxPerHour: 30, maxPerDay: 150 },
    UNFOLLOW: { maxPerHour: 30, maxPerDay: 150 },
    STORY_VIEW: { maxPerHour: 100, maxPerDay: 500 },
    STORY_REPLY: { maxPerHour: 20, maxPerDay: 100 },
    REEL_LIKE: { maxPerHour: 50, maxPerDay: 200 },
    REEL_COMMENT: { maxPerHour: 20, maxPerDay: 100 },
    POST: { maxPerHour: 5, maxPerDay: 20 },
    STORY: { maxPerHour: 10, maxPerDay: 50 },
    REEL: { maxPerHour: 3, maxPerDay: 10 },
  },
  
  // Action Delays (in milliseconds)
  DELAYS: {
    BETWEEN_ACTIONS: 30000, // 30 seconds
    BETWEEN_LIKES: 15000, // 15 seconds
    BETWEEN_COMMENTS: 60000, // 1 minute
    BETWEEN_FOLLOWS: 45000, // 45 seconds
    BETWEEN_UNFOLLOWS: 45000, // 45 seconds
    BETWEEN_STORY_VIEWS: 10000, // 10 seconds
    BETWEEN_POSTS: 300000, // 5 minutes
    BETWEEN_STORIES: 60000, // 1 minute
    BETWEEN_REELS: 300000, // 5 minutes
  },
  
  // Content Limits
  LIMITS: {
    CAPTION_MAX_LENGTH: 2200,
    COMMENT_MAX_LENGTH: 200,
    HASHTAG_MAX_COUNT: 30,
    MENTION_MAX_COUNT: 20,
    MEDIA_MAX_SIZE: 100 * 1024 * 1024, // 100MB
    VIDEO_MAX_DURATION: 60, // 60 seconds
    STORY_MAX_DURATION: 15, // 15 seconds
    REEL_MAX_DURATION: 90, // 90 seconds
  },
  
  // Media Types
  MEDIA_TYPES: {
    IMAGE: ['jpg', 'jpeg', 'png', 'webp'],
    VIDEO: ['mp4', 'mov', 'avi', 'mkv'],
    STORY: ['jpg', 'jpeg', 'png', 'mp4'],
    REEL: ['mp4', 'mov'],
  },
  
  // Error Codes
  ERROR_CODES: {
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    TWO_FACTOR_REQUIRED: 'TWO_FACTOR_REQUIRED',
    ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
    RATE_LIMITED: 'RATE_LIMITED',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    INVALID_MEDIA: 'INVALID_MEDIA',
    CONTENT_VIOLATION: 'CONTENT_VIOLATION',
    USER_NOT_FOUND: 'USER_NOT_FOUND',
    POST_NOT_FOUND: 'POST_NOT_FOUND',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    NETWORK_ERROR: 'NETWORK_ERROR',
    TIMEOUT: 'TIMEOUT',
  },
  
  // Webhook Events
  WEBHOOK_EVENTS: {
    MESSAGE_RECEIVED: 'message_received',
    STORY_REPLY_RECEIVED: 'story_reply_received',
    COMMENT_RECEIVED: 'comment_received',
    LIKE_RECEIVED: 'like_received',
    FOLLOW_RECEIVED: 'follow_received',
    UNFOLLOW_RECEIVED: 'unfollow_received',
    MENTION_RECEIVED: 'mention_received',
    POST_PUBLISHED: 'post_published',
    STORY_PUBLISHED: 'story_published',
    REEL_PUBLISHED: 'reel_published',
  },
  
  // Campaign Types
  CAMPAIGN_TYPES: {
    ENGAGEMENT: 'engagement',
    GROWTH: 'growth',
    AWARENESS: 'awareness',
    CONVERSION: 'conversion',
  },
  
  // User Types
  USER_TYPES: {
    INFLUENCER: 'influencer',
    BUSINESS: 'business',
    PERSONAL: 'personal',
  },
  
  // Follower Ranges
  FOLLOWER_RANGES: [
    { min: 0, max: 1000, label: 'Micro (0-1K)' },
    { min: 1000, max: 10000, label: 'Small (1K-10K)' },
    { min: 10000, max: 100000, label: 'Medium (10K-100K)' },
    { min: 100000, max: 1000000, label: 'Large (100K-1M)' },
    { min: 1000000, max: Infinity, label: 'Mega (1M+)' },
  ],
  
  // Default Settings
  DEFAULT_SETTINGS: {
    autoReply: false,
    autoLike: false,
    autoFollow: false,
    autoUnfollow: false,
    maxDailyActions: 100,
    actionDelay: 30000,
  },
  
  // Cache Keys
  CACHE_KEYS: {
    SESSION_PREFIX: 'instagram:session:',
    USER_PREFIX: 'instagram:user:',
    POST_PREFIX: 'instagram:post:',
    STORY_PREFIX: 'instagram:story:',
    REEL_PREFIX: 'instagram:reel:',
    CONVERSATION_PREFIX: 'instagram:conversation:',
    RATE_LIMIT_PREFIX: 'instagram:rate_limit:',
    ANALYTICS_PREFIX: 'instagram:analytics:',
  },
  
  // Queue Names
  QUEUE_NAMES: {
    INSTAGRAM_ACTIONS: 'instagram-actions',
    INSTAGRAM_MESSAGES: 'instagram-messages',
    INSTAGRAM_ANALYTICS: 'instagram-analytics',
    INSTAGRAM_CAMPAIGNS: 'instagram-campaigns',
    INSTAGRAM_WEBHOOKS: 'instagram-webhooks',
  },
  
  // Job Types
  JOB_TYPES: {
    SEND_MESSAGE: 'send_message',
    LIKE_POST: 'like_post',
    COMMENT_POST: 'comment_post',
    FOLLOW_USER: 'follow_user',
    UNFOLLOW_USER: 'unfollow_user',
    VIEW_STORY: 'view_story',
    REPLY_STORY: 'reply_story',
    LIKE_REEL: 'like_reel',
    COMMENT_REEL: 'comment_reel',
    PUBLISH_POST: 'publish_post',
    PUBLISH_STORY: 'publish_story',
    PUBLISH_REEL: 'publish_reel',
    UPDATE_ANALYTICS: 'update_analytics',
    PROCESS_CAMPAIGN: 'process_campaign',
    SEND_WEBHOOK: 'send_webhook',
  },
} as const;

export const INSTAGRAM_ENDPOINTS = {
  // Authentication
  LOGIN: '/accounts/login/ajax/',
  LOGOUT: '/accounts/logout/',
  TWO_FACTOR: '/accounts/login/ajax/two_factor/',
  
  // User Management
  USER_INFO: '/users/{user_id}/info/',
  USER_FEED: '/users/{user_id}/feed/',
  USER_STORIES: '/users/{user_id}/stories/',
  USER_REELS: '/users/{user_id}/reels/',
  
  // Posts
  POST_INFO: '/media/{media_id}/info/',
  POST_LIKE: '/media/{media_id}/like/',
  POST_UNLIKE: '/media/{media_id}/unlike/',
  POST_COMMENT: '/media/{media_id}/comment/',
  POST_COMMENTS: '/media/{media_id}/comments/',
  PUBLISH_POST: '/media/configure/',
  
  // Stories
  STORY_INFO: '/media/{media_id}/info/',
  STORY_VIEW: '/media/{media_id}/view/',
  STORY_REPLY: '/media/{media_id}/reply/',
  PUBLISH_STORY: '/media/configure_story/',
  
  // Reels
  REEL_INFO: '/media/{media_id}/info/',
  REEL_LIKE: '/media/{media_id}/like/',
  REEL_UNLIKE: '/media/{media_id}/unlike/',
  REEL_COMMENT: '/media/{media_id}/comment/',
  PUBLISH_REEL: '/media/configure_to_reel/',
  
  // Direct Messages
  DIRECT_INBOX: '/direct_v2/inbox/',
  DIRECT_THREAD: '/direct_v2/threads/{thread_id}/',
  DIRECT_MESSAGE: '/direct_v2/threads/{thread_id}/items/',
  SEND_DIRECT: '/direct_v2/threads/broadcast/text/',
  
  // Follow/Unfollow
  FOLLOW_USER: '/friendships/create/{user_id}/',
  UNFOLLOW_USER: '/friendships/destroy/{user_id}/',
  FOLLOWERS: '/friendships/{user_id}/followers/',
  FOLLOWING: '/friendships/{user_id}/following/',
  
  // Search
  SEARCH_USERS: '/users/search/',
  SEARCH_HASHTAGS: '/tags/search/',
  SEARCH_LOCATIONS: '/locations/search/',
  
  // Analytics
  INSIGHTS: '/insights/',
  BUSINESS_INSIGHTS: '/business/insights/',
} as const;

export const INSTAGRAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0',
} as const; 