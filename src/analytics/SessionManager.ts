/**
 * G3D Session Manager
 * Manages user sessions, page views, and session persistence
 * @module Analytics
 */

import { EventTracker } from './EventTracker';

/**
 * Session data structure
 */
export interface Session {
  /** Session ID */
  id: string;
  /** Session start timestamp */
  startTime: number;
  /** Session end timestamp */
  endTime?: number;
  /** Session duration (ms) */
  duration: number;
  /** Page views count */
  pageViews: number;
  /** Events count */
  eventsCount: number;
  /** User ID */
  userId?: string;
  /** Custom session properties */
  properties: Record<string, any>;
  /** Is active */
  isActive: boolean;
}

/**
 * Page view data
 */
export interface PageView {
  /** Page name/path */
  page: string;
  /** Page title */
  title?: string;
  /** Referrer */
  referrer?: string;
  /** Timestamp */
  timestamp: number;
  /** Time spent on page (ms) */
  timeSpent?: number;
}

/**
 * Session configuration
 */
export interface SessionConfig {
  /** Enable session tracking */
  enabled: boolean;
  /** Session timeout (ms) - time of inactivity before ending session */
  timeout: number;
  /** Persist sessions to storage */
  persistSession: boolean;
  /** Storage key for session data */
  storageKey: string;
  /** Auto-start session */
  autoStart: boolean;
  /** Track page visibility */
  trackVisibility: boolean;
}

/**
 * Default session configuration
 */
const DEFAULT_CONFIG: SessionConfig = {
  enabled: true,
  timeout: 1800000, // 30 minutes
  persistSession: true,
  storageKey: 'g3d_session',
  autoStart: true,
  trackVisibility: true
};

/**
 * Session Manager
 * Manages user sessions and page view tracking
 */
export class SessionManager {
  private static instance: SessionManager;
  private eventTracker: EventTracker;
  private config: SessionConfig;
  private currentSession: Session | null = null;
  private pageViews: PageView[] = [];
  private currentPageView: PageView | null = null;
  private sessionTimer: number | null = null;
  private lastActivityTime: number = 0;
  private isPageVisible: boolean = true;

  private constructor(eventTracker?: EventTracker, config?: Partial<SessionConfig>) {
    this.eventTracker = eventTracker || new EventTracker();
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.trackVisibility) {
      this.setupVisibilityTracking();
    }

    if (this.config.autoStart) {
      this.startSession();
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(
    eventTracker?: EventTracker,
    config?: Partial<SessionConfig>
  ): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager(eventTracker, config);
    }
    return SessionManager.instance;
  }

  /**
   * Start a new session
   */
  public startSession(userId?: string, properties?: Record<string, any>): Session {
    // End current session if exists
    if (this.currentSession?.isActive) {
      this.endSession();
    }

    // Create new session
    this.currentSession = {
      id: this.generateSessionId(),
      startTime: Date.now(),
      duration: 0,
      pageViews: 0,
      eventsCount: 0,
      userId,
      properties: properties || {},
      isActive: true
    };

    this.lastActivityTime = Date.now();

    // Persist session
    if (this.config.persistSession) {
      this.persistSession();
    }

    // Track session start
    this.eventTracker.track('session_start', {
      session_id: this.currentSession.id,
      user_id: userId,
      ...properties
    });

    // Start session timeout timer
    this.startSessionTimer();

    return { ...this.currentSession };
  }

  /**
   * End current session
   */
  public endSession(): void {
    if (!this.currentSession || !this.currentSession.isActive) {
      return;
    }

    const now = Date.now();
    this.currentSession.endTime = now;
    this.currentSession.duration = now - this.currentSession.startTime;
    this.currentSession.isActive = false;

    // End current page view
    if (this.currentPageView) {
      this.endPageView();
    }

    // Track session end
    this.eventTracker.track('session_end', {
      session_id: this.currentSession.id,
      duration_ms: this.currentSession.duration,
      duration_seconds: Math.round(this.currentSession.duration / 1000),
      page_views: this.currentSession.pageViews,
      events_count: this.currentSession.eventsCount
    });

    // Stop timer
    this.stopSessionTimer();

    // Clear persisted session
    if (this.config.persistSession) {
      this.clearPersistedSession();
    }
  }

  /**
   * Get current session
   */
  public getCurrentSession(): Session | null {
    if (!this.currentSession) {
      return null;
    }

    // Update duration
    if (this.currentSession.isActive) {
      this.currentSession.duration = Date.now() - this.currentSession.startTime;
    }

    return { ...this.currentSession };
  }

  /**
   * Update session activity (resets timeout)
   */
  public updateActivity(): void {
    if (!this.currentSession?.isActive) {
      return;
    }

    this.lastActivityTime = Date.now();

    // Restart timer
    this.stopSessionTimer();
    this.startSessionTimer();

    // Update persisted session
    if (this.config.persistSession) {
      this.persistSession();
    }
  }

  /**
   * Track page view
   */
  public trackPageView(page: string, title?: string, referrer?: string): void {
    if (!this.config.enabled) {
      return;
    }

    // End previous page view
    if (this.currentPageView) {
      this.endPageView();
    }

    // Create new page view
    this.currentPageView = {
      page,
      title: title || (typeof document !== 'undefined' ? document.title : undefined),
      referrer: referrer || (typeof document !== 'undefined' ? document.referrer : undefined),
      timestamp: Date.now()
    };

    this.pageViews.push(this.currentPageView);

    // Update session
    if (this.currentSession?.isActive) {
      this.currentSession.pageViews++;
      this.currentSession.eventsCount++;
      this.updateActivity();
    } else if (this.config.autoStart) {
      // Auto-start session if not active
      this.startSession();
      if (this.currentSession) {
        this.currentSession.pageViews++;
        this.currentSession.eventsCount++;
      }
    }

    // Track event
    this.eventTracker.track('page_view', {
      page,
      title,
      referrer,
      session_id: this.currentSession?.id
    });
  }

  /**
   * Track screen view (for games/apps without traditional pages)
   */
  public trackScreenView(screenName: string, screenClass?: string): void {
    this.trackPageView(screenName, screenClass);
  }

  /**
   * End current page view
   */
  private endPageView(): void {
    if (!this.currentPageView) {
      return;
    }

    const now = Date.now();
    this.currentPageView.timeSpent = now - this.currentPageView.timestamp;

    // Track time spent
    this.eventTracker.track('page_time', {
      page: this.currentPageView.page,
      time_spent_ms: this.currentPageView.timeSpent,
      time_spent_seconds: Math.round(this.currentPageView.timeSpent / 1000),
      session_id: this.currentSession?.id
    });

    this.currentPageView = null;
  }

  /**
   * Get all page views
   */
  public getPageViews(): PageView[] {
    return [...this.pageViews];
  }

  /**
   * Get current page view
   */
  public getCurrentPageView(): PageView | null {
    if (!this.currentPageView) {
      return null;
    }

    return {
      ...this.currentPageView,
      timeSpent: Date.now() - this.currentPageView.timestamp
    };
  }

  /**
   * Update session properties
   */
  public updateSessionProperties(properties: Record<string, any>): void {
    if (!this.currentSession) {
      return;
    }

    this.currentSession.properties = {
      ...this.currentSession.properties,
      ...properties
    };

    if (this.config.persistSession) {
      this.persistSession();
    }
  }

  /**
   * Get session duration
   */
  public getSessionDuration(): number {
    if (!this.currentSession) {
      return 0;
    }

    if (this.currentSession.isActive) {
      return Date.now() - this.currentSession.startTime;
    }

    return this.currentSession.duration;
  }

  /**
   * Check if session is active
   */
  public isSessionActive(): boolean {
    return this.currentSession?.isActive ?? false;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `session_${timestamp}_${random}`;
  }

  /**
   * Start session timeout timer
   */
  private startSessionTimer(): void {
    this.sessionTimer = window.setTimeout(() => {
      const inactiveTime = Date.now() - this.lastActivityTime;

      if (inactiveTime >= this.config.timeout) {
        // Session timed out
        this.endSession();
      } else {
        // Restart timer for remaining time
        this.startSessionTimer();
      }
    }, this.config.timeout);
  }

  /**
   * Stop session timeout timer
   */
  private stopSessionTimer(): void {
    if (this.sessionTimer !== null) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
  }

  /**
   * Persist session to storage
   */
  private persistSession(): void {
    if (!this.currentSession || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const sessionData = {
        ...this.currentSession,
        lastActivityTime: this.lastActivityTime
      };
      localStorage.setItem(this.config.storageKey, JSON.stringify(sessionData));
    } catch (error) {
      console.warn('Failed to persist session:', error);
    }
  }

  /**
   * Load persisted session
   */
  public loadPersistedSession(): Session | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const data = localStorage.getItem(this.config.storageKey);
      if (!data) {
        return null;
      }

      const sessionData = JSON.parse(data);

      // Check if session is still valid (not timed out)
      const inactiveTime = Date.now() - sessionData.lastActivityTime;
      if (inactiveTime >= this.config.timeout) {
        this.clearPersistedSession();
        return null;
      }

      // Restore session
      this.currentSession = sessionData;
      this.lastActivityTime = sessionData.lastActivityTime;
      this.startSessionTimer();

      return { ...this.currentSession };
    } catch (error) {
      console.warn('Failed to load persisted session:', error);
      return null;
    }
  }

  /**
   * Clear persisted session
   */
  private clearPersistedSession(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem(this.config.storageKey);
    } catch (error) {
      console.warn('Failed to clear persisted session:', error);
    }
  }

  /**
   * Setup page visibility tracking
   */
  private setupVisibilityTracking(): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.addEventListener('visibilitychange', () => {
      this.isPageVisible = !document.hidden;

      if (this.isPageVisible) {
        // Page became visible
        this.updateActivity();
        this.eventTracker.track('page_visible', {
          session_id: this.currentSession?.id
        });
      } else {
        // Page became hidden
        this.eventTracker.track('page_hidden', {
          session_id: this.currentSession?.id
        });

        // End current page view
        if (this.currentPageView) {
          this.endPageView();
        }
      }
    });

    // Track beforeunload (page close)
    window.addEventListener('beforeunload', () => {
      this.endSession();
    });
  }

  /**
   * Dispose session manager
   */
  public dispose(): void {
    this.endSession();
    this.pageViews = [];
    this.currentPageView = null;
    this.stopSessionTimer();
  }
}
