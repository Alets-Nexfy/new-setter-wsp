import { Job } from 'bull';
import { LoggerService } from '../core/services/LoggerService';
import { CacheService } from '../core/services/CacheService';
import { DatabaseService } from '../core/services/DatabaseService';
import { QueueService } from '../core/services/QueueService';
import { InstagramService } from '../platforms/instagram/services/InstagramService';
import { InstagramSessionManager } from '../platforms/instagram/services/InstagramSessionManager';
import { InstagramMessageHandler } from '../platforms/instagram/services/InstagramMessageHandler';
import { 
  InstagramMessage, 
  InstagramAction,
  InstagramPost,
  InstagramStory,
  InstagramReel,
  InstagramComment,
  InstagramApiResponse 
} from '../shared/types/instagram';
import { INSTAGRAM_CONSTANTS } from '../shared/constants/instagram';

export class InstagramWorker {
  constructor(
    private readonly logger: LoggerService,
    private readonly cache: CacheService,
    private readonly database: DatabaseService,
    private readonly queue: QueueService,
    private readonly instagramService: InstagramService,
    private readonly sessionManager: InstagramSessionManager,
    private readonly messageHandler: InstagramMessageHandler
  ) {
    this.setupQueueProcessors();
  }

  /**
   * Setup queue processors
   */
  private setupQueueProcessors(): void {
    // Process Instagram actions
    this.queue.processJob(INSTAGRAM_CONSTANTS.QUEUE_NAMES.INSTAGRAM_ACTIONS, async (job: Job) => {
      return this.processAction(job);
    });

    // Process Instagram messages
    this.queue.processJob(INSTAGRAM_CONSTANTS.QUEUE_NAMES.INSTAGRAM_MESSAGES, async (job: Job) => {
      return this.processMessage(job);
    });

    // Process Instagram analytics
    this.queue.processJob(INSTAGRAM_CONSTANTS.QUEUE_NAMES.INSTAGRAM_ANALYTICS, async (job: Job) => {
      return this.processAnalytics(job);
    });

    // Process Instagram campaigns
    this.queue.processJob(INSTAGRAM_CONSTANTS.QUEUE_NAMES.INSTAGRAM_CAMPAIGNS, async (job: Job) => {
      return this.processCampaign(job);
    });

    // Process Instagram webhooks
    this.queue.processJob(INSTAGRAM_CONSTANTS.QUEUE_NAMES.INSTAGRAM_WEBHOOKS, async (job: Job) => {
      return this.processWebhook(job);
    });
  }

  /**
   * Process Instagram action job
   */
  private async processAction(job: Job): Promise<any> {
    try {
      const { type, data } = job.data;
      const { sessionId, targetId, targetType, content } = data;

      this.logger.info(`Processing Instagram action: ${type} for session: ${sessionId}`);

      // Validate session
      const session = await this.sessionManager.getSession(sessionId);
      if (!session || !session.isActive) {
        throw new Error('Invalid or inactive session');
      }

      // Check rate limits
      const canProceed = await this.checkRateLimit(sessionId, type);
      if (!canProceed) {
        throw new Error('Rate limit exceeded');
      }

      let result: any;

      switch (type) {
        case INSTAGRAM_CONSTANTS.JOB_TYPES.LIKE_POST:
          result = await this.likePost(sessionId, targetId);
          break;
        case INSTAGRAM_CONSTANTS.JOB_TYPES.COMMENT_POST:
          result = await this.commentPost(sessionId, targetId, content);
          break;
        case INSTAGRAM_CONSTANTS.JOB_TYPES.FOLLOW_USER:
          result = await this.followUser(sessionId, targetId);
          break;
        case INSTAGRAM_CONSTANTS.JOB_TYPES.UNFOLLOW_USER:
          result = await this.unfollowUser(sessionId, targetId);
          break;
        case INSTAGRAM_CONSTANTS.JOB_TYPES.VIEW_STORY:
          result = await this.viewStory(sessionId, targetId);
          break;
        case INSTAGRAM_CONSTANTS.JOB_TYPES.REPLY_STORY:
          result = await this.replyStory(sessionId, targetId, content);
          break;
        case INSTAGRAM_CONSTANTS.JOB_TYPES.LIKE_REEL:
          result = await this.likeReel(sessionId, targetId);
          break;
        case INSTAGRAM_CONSTANTS.JOB_TYPES.COMMENT_REEL:
          result = await this.commentReel(sessionId, targetId, content);
          break;
        default:
          throw new Error(`Unknown action type: ${type}`);
      }

      // Record action
      await this.recordAction(sessionId, type, targetId, targetType, 'completed');

      return result;
    } catch (error) {
      this.logger.error('Error processing Instagram action:', { error: error instanceof Error ? error.message : 'Unknown error' });
      
      // Record failed action
      if (job.data.sessionId && job.data.type && job.data.targetId) {
        await this.recordAction(
          job.data.sessionId,
          job.data.type,
          job.data.targetId,
          job.data.targetType || 'unknown',
          'failed',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      throw error;
    }
  }

  /**
   * Process Instagram message job
   */
  private async processMessage(job: Job): Promise<any> {
    try {
      const { type, data } = job.data;
      const message = data as InstagramMessage;

      this.logger.info(`Processing Instagram message: ${type} for session: ${message.sessionId}`);

      // Validate session
      const session = await this.sessionManager.getSession(message.sessionId);
      if (!session || !session.isActive) {
        throw new Error('Invalid or inactive session');
      }

      switch (type) {
        case INSTAGRAM_CONSTANTS.JOB_TYPES.SEND_MESSAGE:
          return await this.sendDirectMessage(message);
        default:
          throw new Error(`Unknown message type: ${type}`);
      }
    } catch (error) {
      this.logger.error('Error processing Instagram message:', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Process analytics job
   */
  private async processAnalytics(job: Job): Promise<any> {
    try {
      const { sessionId, date } = job.data;

      this.logger.info(`Processing Instagram analytics for session: ${sessionId}`);

      // Update analytics for the session
      const analytics = await this.calculateAnalytics(sessionId, date);
      
      // Save to database
      await this.database.collection('instagram_analytics').doc(`${sessionId}_${date}`).set(analytics);

      return analytics;
    } catch (error) {
      this.logger.error('Error processing Instagram analytics:', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Process campaign job
   */
  private async processCampaign(job: Job): Promise<any> {
    try {
      const { campaignId } = job.data;

      this.logger.info(`Processing Instagram campaign: ${campaignId}`);

      // Get campaign
      const campaignDoc = await this.database.collection('instagram_campaigns').doc(campaignId).get();
      if (!campaignDoc.exists) {
        throw new Error('Campaign not found');
      }

      const campaign = campaignDoc.data() as any;

      // Process campaign actions
      const results = await this.executeCampaignActions(campaign);

      // Update campaign results
      await this.database.collection('instagram_campaigns').doc(campaignId).update({
        results,
        updatedAt: new Date(),
      });

      return results;
    } catch (error) {
      this.logger.error('Error processing Instagram campaign:', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Process webhook job
   */
  private async processWebhook(job: Job): Promise<any> {
    try {
      const { webhookUrl, event } = job.data;

      this.logger.info(`Processing Instagram webhook to: ${webhookUrl}`);

      // Send webhook
      const response = await (globalThis as any).fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Instagram-API/1.0',
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with status: ${response.status}`);
      }

      return { success: true, status: response.status };
    } catch (error) {
      this.logger.error('Error processing Instagram webhook:', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Check rate limit for action
   */
  private async checkRateLimit(sessionId: string, actionType: string): Promise<boolean> {
    try {
      const now = new Date();
      const hourKey = `${sessionId}:${actionType}:hour:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
      const dayKey = `${sessionId}:${actionType}:day:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

      const limits = INSTAGRAM_CONSTANTS.RATE_LIMITS[actionType as keyof typeof INSTAGRAM_CONSTANTS.RATE_LIMITS];
      if (!limits) return true;

      const hourCount = Number(await this.cache.get(hourKey)) || 0;
      const dayCount = Number(await this.cache.get(dayKey)) || 0;

      if (hourCount >= limits.maxPerHour || dayCount >= limits.maxPerDay) {
        return false;
      }

      // Increment counters
      await this.cache.set(hourKey, String(hourCount + 1), 3600); // 1 hour
      await this.cache.set(dayKey, String(dayCount + 1), 86400); // 1 day

      return true;
    } catch (error) {
      this.logger.error('Error checking rate limit:', { error: error instanceof Error ? error.message : 'Unknown error' });
      return true; // Allow action if rate limit check fails
    }
  }

  /**
   * Record action in database
   */
  private async recordAction(
    sessionId: string,
    actionType: string,
    targetId: string,
    targetType: string,
    status: 'pending' | 'completed' | 'failed' | 'rate_limited',
    errorMessage?: string
  ): Promise<void> {
    try {
      const action: Omit<InstagramAction, 'id' | 'createdAt' | 'updatedAt'> = {
        sessionId,
        actionType: actionType as any,
        targetId,
        targetType: targetType as any,
        status,
        errorMessage,
        timestamp: new Date(),
        metadata: {}
      };

      await this.database.collection('instagram_actions').doc().set(action);
    } catch (error) {
      this.logger.error('Error recording action:', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Like a post
   */
  private async likePost(sessionId: string, postId: string): Promise<any> {
    // Implementation would use Instagram API or web automation
    this.logger.info(`Liking post ${postId} for session ${sessionId}`);
    
    // Simulate API call
    await new Promise(resolve => globalThis.setTimeout(resolve, 1000));
    
    return { success: true, postId };
  }

  /**
   * Comment on a post
   */
  private async commentPost(sessionId: string, postId: string, content: string): Promise<any> {
    this.logger.info(`Commenting on post ${postId} for session ${sessionId}: ${content}`);
    
    // Simulate API call
    await new Promise(resolve => globalThis.setTimeout(resolve, 1000));
    
    return { success: true, postId, content };
  }

  /**
   * Follow a user
   */
  private async followUser(sessionId: string, userId: string): Promise<any> {
    this.logger.info(`Following user ${userId} for session ${sessionId}`);
    
    // Simulate API call
    await new Promise(resolve => globalThis.setTimeout(resolve, 1000));
    
    return { success: true, userId };
  }

  /**
   * Unfollow a user
   */
  private async unfollowUser(sessionId: string, userId: string): Promise<any> {
    this.logger.info(`Unfollowing user ${userId} for session ${sessionId}`);
    
    // Simulate API call
    await new Promise(resolve => globalThis.setTimeout(resolve, 1000));
    
    return { success: true, userId };
  }

  /**
   * View a story
   */
  private async viewStory(sessionId: string, storyId: string): Promise<any> {
    this.logger.info(`Viewing story ${storyId} for session ${sessionId}`);
    
    // Simulate API call
    await new Promise(resolve => globalThis.setTimeout(resolve, 1000));
    
    return { success: true, storyId };
  }

  /**
   * Reply to a story
   */
  private async replyStory(sessionId: string, storyId: string, content: string): Promise<any> {
    this.logger.info(`Replying to story ${storyId} for session ${sessionId}: ${content}`);
    
    // Simulate API call
    await new Promise(resolve => globalThis.setTimeout(resolve, 1000));
    
    return { success: true, storyId, content };
  }

  /**
   * Like a reel
   */
  private async likeReel(sessionId: string, reelId: string): Promise<any> {
    this.logger.info(`Liking reel ${reelId} for session ${sessionId}`);
    
    // Simulate API call
    await new Promise(resolve => globalThis.setTimeout(resolve, 1000));
    
    return { success: true, reelId };
  }

  /**
   * Comment on a reel
   */
  private async commentReel(sessionId: string, reelId: string, content: string): Promise<any> {
    this.logger.info(`Commenting on reel ${reelId} for session ${sessionId}: ${content}`);
    
    // Simulate API call
    await new Promise(resolve => globalThis.setTimeout(resolve, 1000));
    
    return { success: true, reelId, content };
  }

  /**
   * Send direct message
   */
  private async sendDirectMessage(message: InstagramMessage): Promise<any> {
    this.logger.info(`Sending direct message to ${message.recipientUsername}: ${message.content}`);
    
    // Simulate API call
    await new Promise(resolve => globalThis.setTimeout(resolve, 1000));
    
    return { success: true, messageId: message.messageId };
  }

  /**
   * Calculate analytics for session
   */
  private async calculateAnalytics(sessionId: string, date: string): Promise<any> {
    // Get actions for the date
    const startDate = new Date(date);
    const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

    const actionsSnapshot = await this.database
      .collection('instagram_actions')
      .where('sessionId', '==', sessionId)
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<', endDate)
      .get();

    const actions = actionsSnapshot.docs.map(doc => doc.data() as InstagramAction);

    // Calculate metrics
    const analytics = {
      sessionId,
      date: startDate,
      metrics: {
        followers: { gained: 0, lost: 0, net: 0, total: 0 },
        engagement: {
          likes: actions.filter(a => a.actionType === 'like').length,
          comments: actions.filter(a => a.actionType === 'comment').length,
          shares: 0,
          saves: 0,
          storyViews: actions.filter(a => a.actionType === 'story_view').length,
          storyReplies: actions.filter(a => a.actionType === 'story_reply').length,
          reelViews: 0,
          reelLikes: actions.filter(a => a.actionType === 'reel_like').length,
          reelComments: actions.filter(a => a.actionType === 'reel_comment').length,
        },
        reach: { impressions: 0, reach: 0, profileVisits: 0 },
        actions: {
          postsCreated: 0,
          storiesCreated: 0,
          reelsCreated: 0,
          commentsPosted: actions.filter(a => a.actionType === 'comment').length,
          usersFollowed: actions.filter(a => a.actionType === 'follow').length,
          usersUnfollowed: actions.filter(a => a.actionType === 'unfollow').length,
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return analytics;
  }

  /**
   * Execute campaign actions
   */
  private async executeCampaignActions(campaign: any): Promise<any> {
    const results = {
      totalActions: 0,
      successfulActions: 0,
      failedActions: 0,
      engagementRate: 0,
      newFollowers: 0,
      totalReach: 0,
    };

    // Implementation would execute campaign actions based on campaign configuration
    this.logger.info(`Executing campaign actions for campaign: ${campaign.name}`);

    return results;
  }
} 