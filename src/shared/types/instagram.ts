import { BaseModel } from '../../core/models/BaseModel';

export interface InstagramSession extends BaseModel {
  userId: string;
  username: string;
  sessionId: string;
  isActive: boolean;
  lastActivity: Date;
  metadata: {
    followersCount?: number;
    followingCount?: number;
    postsCount?: number;
    isBusinessAccount?: boolean;
    isVerified?: boolean;
    profilePicture?: string;
    bio?: string;
    website?: string;
  };
  settings: {
    autoReply: boolean;
    autoLike: boolean;
    autoFollow: boolean;
    autoUnfollow: boolean;
    maxDailyActions: number;
    actionDelay: number;
  };
}

export interface InstagramMessage extends BaseModel {
  sessionId: string;
  conversationId: string;
  messageId: string;
  senderId: string;
  senderUsername: string;
  recipientId: string;
  recipientUsername: string;
  content: string;
  messageType: 'text' | 'image' | 'video' | 'story_reply' | 'reel_reply';
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'story' | 'reel';
  isRead: boolean;
  isFromMe: boolean;
  timestamp: Date;
  metadata: {
    replyToMessageId?: string;
    storyId?: string;
    reelId?: string;
    postId?: string;
    hashtags?: string[];
    mentions?: string[];
  };
}

export interface InstagramConversation extends BaseModel {
  sessionId: string;
  conversationId: string;
  participants: {
    userId: string;
    username: string;
    profilePicture?: string;
    isVerified?: boolean;
  }[];
  lastMessage?: InstagramMessage;
  unreadCount: number;
  isArchived: boolean;
  isMuted: boolean;
  lastActivity: Date;
  metadata: {
    isGroupChat: boolean;
    groupName?: string;
    groupPicture?: string;
  };
}

export interface InstagramPost extends BaseModel {
  sessionId: string;
  postId: string;
  caption: string;
  mediaUrls: string[];
  mediaType: 'image' | 'video' | 'carousel';
  likesCount: number;
  commentsCount: number;
  timestamp: Date;
  location?: {
    name: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  hashtags: string[];
  mentions: string[];
  isPublished: boolean;
  scheduledFor?: Date;
  metadata: {
    aspectRatio?: number;
    duration?: number;
    thumbnailUrl?: string;
  };
}

export interface InstagramStory extends BaseModel {
  sessionId: string;
  storyId: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
  mentions: string[];
  hashtags: string[];
  location?: {
    name: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  timestamp: Date;
  expiresAt: Date;
  viewsCount: number;
  repliesCount: number;
  metadata: {
    aspectRatio?: number;
    duration?: number;
    stickers?: any[];
    filters?: any[];
  };
}

export interface InstagramReel extends BaseModel {
  sessionId: string;
  reelId: string;
  videoUrl: string;
  caption: string;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  sharesCount: number;
  savesCount: number;
  timestamp: Date;
  duration: number;
  hashtags: string[];
  mentions: string[];
  audio?: {
    name: string;
    artist?: string;
  };
  isPublished: boolean;
  scheduledFor?: Date;
  metadata: {
    aspectRatio: number;
    thumbnailUrl?: string;
    coverUrl?: string;
  };
}

export interface InstagramComment extends BaseModel {
  sessionId: string;
  commentId: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  likesCount: number;
  timestamp: Date;
  isReply: boolean;
  parentCommentId?: string;
  mentions: string[];
  hashtags: string[];
  metadata: {
    isVerified?: boolean;
    profilePicture?: string;
  };
}

export interface InstagramAction extends BaseModel {
  sessionId: string;
  actionType: 'like' | 'comment' | 'follow' | 'unfollow' | 'story_view' | 'story_reply' | 'reel_like' | 'reel_comment';
  targetId: string;
  targetType: 'post' | 'user' | 'story' | 'reel' | 'comment';
  targetUsername?: string;
  content?: string;
  status: 'pending' | 'completed' | 'failed' | 'rate_limited';
  errorMessage?: string;
  timestamp: Date;
  metadata: {
    postId?: string;
    storyId?: string;
    reelId?: string;
    commentId?: string;
    hashtag?: string;
    location?: string;
  };
}

export interface InstagramAnalytics extends BaseModel {
  sessionId: string;
  date: Date;
  metrics: {
    followers: {
      gained: number;
      lost: number;
      net: number;
      total: number;
    };
    engagement: {
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      storyViews: number;
      storyReplies: number;
      reelViews: number;
      reelLikes: number;
      reelComments: number;
    };
    reach: {
      impressions: number;
      reach: number;
      profileVisits: number;
    };
    actions: {
      postsCreated: number;
      storiesCreated: number;
      reelsCreated: number;
      commentsPosted: number;
      usersFollowed: number;
      usersUnfollowed: number;
    };
  };
}

export interface InstagramCampaign extends BaseModel {
  sessionId: string;
  name: string;
  description: string;
  type: 'engagement' | 'growth' | 'awareness' | 'conversion';
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
  startDate: Date;
  endDate?: Date;
  budget?: {
    amount: number;
    currency: string;
    spent: number;
  };
  targets: {
    hashtags: string[];
    locations: string[];
    userTypes: ('influencers' | 'businesses' | 'personal')[];
    followerRanges: {
      min: number;
      max: number;
    }[];
  };
  actions: {
    like: boolean;
    comment: boolean;
    follow: boolean;
    storyView: boolean;
    storyReply: boolean;
    reelLike: boolean;
    reelComment: boolean;
  };
  limits: {
    maxDailyActions: number;
    maxDailyLikes: number;
    maxDailyComments: number;
    maxDailyFollows: number;
    maxDailyUnfollows: number;
    actionDelay: number;
  };
  templates: {
    comments: string[];
    storyReplies: string[];
    reelComments: string[];
  };
  results: {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    engagementRate: number;
    newFollowers: number;
    totalReach: number;
  };
}

export interface InstagramWebhookEvent {
  type: 'message' | 'story_reply' | 'comment' | 'follow' | 'unfollow' | 'like' | 'mention';
  sessionId: string;
  data: any;
  timestamp: Date;
}

export interface InstagramApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Date;
}

export interface InstagramLoginCredentials {
  username: string;
  password: string;
  twoFactorCode?: string;
}

export interface InstagramSessionConfig {
  headless?: boolean;
  userAgent?: string;
  proxy?: {
    host: string;
    port: number;
    username?: string;
    password?: string;
  };
  timeout?: number;
  retryAttempts?: number;
} 