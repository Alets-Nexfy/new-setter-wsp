import { EventEmitter } from 'events';
import { Browser, BrowserContext, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Logger } from '../../../core/services/LoggerService';
import { CacheService } from '../../../core/services/CacheService';
import { DatabaseService } from '../../../core/services/DatabaseService';
import { QueueService } from '../../../core/services/QueueService';
import { 
  InstagramSession, 
  InstagramLoginCredentials, 
  InstagramSessionConfig,
  InstagramApiResponse,
  InstagramWebhookEvent 
} from '../../../shared/types/instagram';
import { INSTAGRAM_CONSTANTS, INSTAGRAM_ENDPOINTS, INSTAGRAM_HEADERS } from '../../../shared/constants/instagram';

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

export class InstagramService extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private session: InstagramSession | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly cache: CacheService,
    private readonly database: DatabaseService,
    private readonly queue: QueueService
  ) {
    super();
  }

  /**
   * Initialize Instagram service
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Instagram service...');
      
      // Initialize browser
      await this.initializeBrowser();
      
      // Set up event listeners
      this.setupEventListeners();
      
      this.logger.info('Instagram service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Instagram service:', error);
      throw error;
    }
  }

  /**
   * Initialize Puppeteer browser
   */
  private async initializeBrowser(): Promise<void> {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
        ],
      });

      this.context = await this.browser.createIncognitoBrowserContext();
      this.page = await this.context.newPage();

      // Set user agent and headers
      await this.page.setUserAgent(INSTAGRAM_HEADERS['User-Agent']);
      await this.page.setExtraHTTPHeaders(INSTAGRAM_HEADERS);

      // Set viewport
      await this.page.setViewport({ width: 1280, height: 720 });

      this.logger.info('Browser initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    if (!this.page) return;

    // Page events
    this.page.on('error', (error) => {
      this.logger.error('Page error:', error);
      this.emit('error', error);
    });

    this.page.on('pageerror', (error) => {
      this.logger.error('Page error:', error);
      this.emit('error', error);
    });

    this.page.on('close', () => {
      this.logger.warn('Page closed');
      this.isConnected = false;
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    // Network events
    this.page.on('response', (response) => {
      this.handleResponse(response);
    });

    // Console events
    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.logger.error('Console error:', msg.text());
      }
    });
  }

  /**
   * Handle network responses
   */
  private async handleResponse(response: any): Promise<void> {
    const url = response.url();
    
    // Handle Instagram API responses
    if (url.includes(INSTAGRAM_CONSTANTS.API_BASE_URL)) {
      try {
        const responseData = await response.json();
        this.processApiResponse(url, responseData);
      } catch (error) {
        // Ignore non-JSON responses
      }
    }
  }

  /**
   * Process API responses
   */
  private processApiResponse(url: string, data: any): void {
    // Handle different types of responses
    if (url.includes('/direct_v2/')) {
      this.handleDirectMessageResponse(data);
    } else if (url.includes('/media/')) {
      this.handleMediaResponse(data);
    } else if (url.includes('/friendships/')) {
      this.handleFriendshipResponse(data);
    }
  }

  /**
   * Handle direct message responses
   */
  private handleDirectMessageResponse(data: any): void {
    if (data.items && Array.isArray(data.items)) {
      data.items.forEach((item: any) => {
        this.emit('message_received', {
          type: 'message_received',
          sessionId: this.session?.sessionId,
          data: item,
          timestamp: new Date(),
        });
      });
    }
  }

  /**
   * Handle media responses
   */
  private handleMediaResponse(data: any): void {
    // Handle likes, comments, etc.
    this.emit('media_interaction', {
      type: 'media_interaction',
      sessionId: this.session?.sessionId,
      data,
      timestamp: new Date(),
    });
  }

  /**
   * Handle friendship responses
   */
  private handleFriendshipResponse(data: any): void {
    // Handle follow/unfollow events
    this.emit('friendship_change', {
      type: 'friendship_change',
      sessionId: this.session?.sessionId,
      data,
      timestamp: new Date(),
    });
  }

  /**
   * Login to Instagram
   */
  async login(credentials: InstagramLoginCredentials, config?: InstagramSessionConfig): Promise<InstagramApiResponse<InstagramSession>> {
    try {
      this.logger.info(`Attempting to login with username: ${credentials.username}`);

      if (!this.page) {
        throw new Error('Browser not initialized');
      }

      // Navigate to Instagram login page
      await this.page.goto(`${INSTAGRAM_CONSTANTS.BASE_URL}/accounts/login/`, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for login form
      await this.page.waitForSelector('input[name="username"]', { timeout: 10000 });
      await this.page.waitForSelector('input[name="password"]', { timeout: 10000 });

      // Fill login form
      await this.page.type('input[name="username"]', credentials.username);
      await this.page.type('input[name="password"]', credentials.password);

      // Submit form
      await this.page.click('button[type="submit"]');

      // Wait for navigation
      await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

      // Check for two-factor authentication
      const twoFactorSelector = 'input[name="verificationCode"]';
      const twoFactorExists = await this.page.$(twoFactorSelector);

      if (twoFactorExists && credentials.twoFactorCode) {
        await this.page.type(twoFactorSelector, credentials.twoFactorCode);
        await this.page.click('button[type="submit"]');
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      } else if (twoFactorExists) {
        throw new Error('Two-factor authentication required');
      }

      // Check if login was successful
      const isLoggedIn = await this.checkLoginStatus();
      if (!isLoggedIn) {
        throw new Error('Login failed - invalid credentials or account locked');
      }

      // Get user info
      const userInfo = await this.getUserInfo();
      
      // Create session
      this.session = await this.createSession(credentials.username, userInfo, config);
      
      // Start heartbeat
      this.startHeartbeat();
      
      this.isConnected = true;
      this.reconnectAttempts = 0;

      this.logger.info(`Successfully logged in as ${credentials.username}`);

      return {
        success: true,
        data: this.session,
        message: 'Login successful',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Login failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Check if user is logged in
   */
  private async checkLoginStatus(): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Check for login indicators
      const avatarSelector = 'img[data-testid="user-avatar"]';
      const avatar = await this.page.$(avatarSelector);
      
      if (avatar) {
        return true;
      }

      // Check for login form (indicates not logged in)
      const loginForm = await this.page.$('form[action="/accounts/login/ajax/"]');
      return !loginForm;
    } catch (error) {
      this.logger.error('Error checking login status:', error);
      return false;
    }
  }

  /**
   * Get current user info
   */
  private async getUserInfo(): Promise<any> {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      // Navigate to profile page
      await this.page.goto(`${INSTAGRAM_CONSTANTS.BASE_URL}/accounts/activity/`, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Extract user info from page
      const userInfo = await this.page.evaluate(() => {
        const script = document.querySelector('script[type="application/ld+json"]');
        if (script) {
          try {
            return JSON.parse(script.textContent || '{}');
          } catch (e) {
            return {};
          }
        }
        return {};
      });

      return userInfo;
    } catch (error) {
      this.logger.error('Error getting user info:', error);
      throw error;
    }
  }

  /**
   * Create Instagram session
   */
  private async createSession(username: string, userInfo: any, config?: InstagramSessionConfig): Promise<InstagramSession> {
    const sessionId = `instagram_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session: InstagramSession = {
      id: sessionId,
      userId: userInfo.id || `user_${Date.now()}`,
      username,
      sessionId,
      isActive: true,
      lastActivity: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        followersCount: userInfo.followersCount || 0,
        followingCount: userInfo.followingCount || 0,
        postsCount: userInfo.postsCount || 0,
        isBusinessAccount: userInfo.isBusinessAccount || false,
        isVerified: userInfo.isVerified || false,
        profilePicture: userInfo.profilePicture,
        bio: userInfo.bio,
        website: userInfo.website,
      },
      settings: {
        ...INSTAGRAM_CONSTANTS.DEFAULT_SETTINGS,
        ...config,
      },
    };

    // Save session to database
    await this.database.collection('instagram_sessions').doc(sessionId).set(session);
    
    // Cache session
    await this.cache.set(
      `${INSTAGRAM_CONSTANTS.CACHE_KEYS.SESSION_PREFIX}${sessionId}`,
      session,
      INSTAGRAM_CONSTANTS.SESSION_TIMEOUT
    );

    return session;
  }

  /**
   * Start heartbeat to keep session alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        if (this.session && this.isConnected) {
          // Update last activity
          this.session.lastActivity = new Date();
          this.session.updatedAt = new Date();
          
          // Update in database and cache
          await this.database.collection('instagram_sessions').doc(this.session.sessionId).update({
            lastActivity: this.session.lastActivity,
            updatedAt: this.session.updatedAt,
          });
          
          await this.cache.set(
            `${INSTAGRAM_CONSTANTS.CACHE_KEYS.SESSION_PREFIX}${this.session.sessionId}`,
            this.session,
            INSTAGRAM_CONSTANTS.SESSION_TIMEOUT
          );
        }
      } catch (error) {
        this.logger.error('Heartbeat error:', error);
      }
    }, 60000); // Every minute
  }

  /**
   * Logout from Instagram
   */
  async logout(): Promise<InstagramApiResponse<void>> {
    try {
      this.logger.info('Logging out from Instagram...');

      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // Navigate to logout
      if (this.page) {
        await this.page.goto(`${INSTAGRAM_CONSTANTS.BASE_URL}/accounts/logout/`, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
      }

      // Update session status
      if (this.session) {
        this.session.isActive = false;
        this.session.updatedAt = new Date();
        
        await this.database.collection('instagram_sessions').doc(this.session.sessionId).update({
          isActive: false,
          updatedAt: this.session.updatedAt,
        });
        
        await this.cache.delete(`${INSTAGRAM_CONSTANTS.CACHE_KEYS.SESSION_PREFIX}${this.session.sessionId}`);
      }

      this.isConnected = false;
      this.session = null;

      this.logger.info('Successfully logged out from Instagram');

      return {
        success: true,
        message: 'Logout successful',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Logout failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Logout failed',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get current session
   */
  getSession(): InstagramSession | null {
    return this.session;
  }

  /**
   * Check if connected
   */
  isConnectedToInstagram(): boolean {
    return this.isConnected && this.session !== null;
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached');
      return;
    }

    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.reconnectInterval = setTimeout(async () => {
      try {
        await this.reconnect();
      } catch (error) {
        this.logger.error('Reconnection failed:', error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Reconnect to Instagram
   */
  private async reconnect(): Promise<void> {
    this.logger.info('Attempting to reconnect...');

    try {
      // Close existing browser
      if (this.browser) {
        await this.browser.close();
      }

      // Reinitialize browser
      await this.initializeBrowser();
      
      // Try to restore session
      if (this.session) {
        const restored = await this.restoreSession(this.session.sessionId);
        if (restored) {
          this.logger.info('Session restored successfully');
          this.reconnectAttempts = 0;
        } else {
          this.logger.warn('Failed to restore session');
        }
      }
    } catch (error) {
      this.logger.error('Reconnection failed:', error);
      throw error;
    }
  }

  /**
   * Restore session
   */
  private async restoreSession(sessionId: string): Promise<boolean> {
    try {
      // Get session from cache/database
      const cachedSession = await this.cache.get(`${INSTAGRAM_CONSTANTS.CACHE_KEYS.SESSION_PREFIX}${sessionId}`);
      if (cachedSession) {
        this.session = cachedSession as InstagramSession;
        return true;
      }

      const dbSession = await this.database.collection('instagram_sessions').doc(sessionId).get();
      if (dbSession.exists) {
        this.session = dbSession.data() as InstagramSession;
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Error restoring session:', error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      this.logger.info('Cleaning up Instagram service...');

      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // Stop reconnection
      if (this.reconnectInterval) {
        clearTimeout(this.reconnectInterval);
        this.reconnectInterval = null;
      }

      // Close browser
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.context = null;
        this.page = null;
      }

      this.isConnected = false;
      this.session = null;

      this.logger.info('Instagram service cleaned up successfully');
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
    }
  }
} 