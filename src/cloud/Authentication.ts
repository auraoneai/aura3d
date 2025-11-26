/**
 * G3D Authentication
 * User authentication and session management
 * @module Cloud
 */

import { CloudManager, CloudError } from './CloudManager';

/**
 * Auth provider type
 */
export type AuthProvider = 'email' | 'google' | 'apple' | 'facebook' | 'github' | 'anonymous';

/**
 * User data
 */
export interface User {
  /** User ID */
  id: string;
  /** Email address */
  email?: string;
  /** Display name */
  displayName?: string;
  /** Photo URL */
  photoURL?: string;
  /** Provider */
  provider: AuthProvider;
  /** Is anonymous */
  isAnonymous: boolean;
  /** Email verified */
  emailVerified: boolean;
  /** Creation time */
  createdAt: number;
  /** Last sign in */
  lastSignIn: number;
  /** Custom data */
  customData?: Record<string, any>;
}

/**
 * Auth state
 */
export interface AuthState {
  /** Current user */
  user: User | null;
  /** Is authenticated */
  isAuthenticated: boolean;
  /** Auth token */
  token: string | null;
  /** Token expiration */
  tokenExpiry: number | null;
}

/**
 * OAuth configuration
 */
export interface OAuthConfig {
  /** Client ID */
  clientId: string;
  /** Redirect URI */
  redirectUri?: string;
  /** Scopes */
  scopes?: string[];
}

/**
 * Auth state change callback
 */
export type AuthStateChangeCallback = (user: User | null) => void;

/**
 * Authentication Service
 * Handles user authentication and session management
 */
export class Authentication {
  private cloudManager: CloudManager;
  private authState: AuthState = {
    user: null,
    isAuthenticated: false,
    token: null,
    tokenExpiry: null
  };
  private stateChangeListeners: Set<AuthStateChangeCallback> = new Set();
  private refreshTimer: number | null = null;
  private readonly STORAGE_KEY = 'g3d_auth_state';

  constructor(cloudManager: CloudManager) {
    this.cloudManager = cloudManager;
    this.loadAuthState();
  }

  /**
   * Sign in with email and password
   */
  public async signInWithEmail(email: string, password: string): Promise<User> {
    try {
      const response = await this.cloudManager.requestWithRetry<{
        user: User;
        token: string;
        expiresIn: number;
      }>('/auth/email/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      this.setAuthState(response.user, response.token, response.expiresIn);
      return response.user;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to sign in',
        'AUTH_SIGNIN_FAILED'
      );
    }
  }

  /**
   * Sign up with email and password
   */
  public async signUpWithEmail(
    email: string,
    password: string,
    displayName?: string
  ): Promise<User> {
    try {
      const response = await this.cloudManager.requestWithRetry<{
        user: User;
        token: string;
        expiresIn: number;
      }>('/auth/email/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName })
      });

      this.setAuthState(response.user, response.token, response.expiresIn);
      return response.user;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to sign up',
        'AUTH_SIGNUP_FAILED'
      );
    }
  }

  /**
   * Sign in with OAuth provider
   */
  public async signInWithOAuth(
    provider: Exclude<AuthProvider, 'email' | 'anonymous'>,
    config?: OAuthConfig
  ): Promise<User> {
    try {
      // Open OAuth popup/redirect
      const authUrl = this.buildOAuthURL(provider, config);

      // In a real implementation, this would handle OAuth flow
      // For now, we'll simulate the response
      const response = await this.handleOAuthFlow(authUrl);

      this.setAuthState(response.user, response.token, response.expiresIn);
      return response.user;
    } catch (error: any) {
      throw new CloudError(
        error.message || `Failed to sign in with ${provider}`,
        'AUTH_OAUTH_FAILED'
      );
    }
  }

  /**
   * Sign in anonymously
   */
  public async signInAnonymously(): Promise<User> {
    try {
      const response = await this.cloudManager.requestWithRetry<{
        user: User;
        token: string;
        expiresIn: number;
      }>('/auth/anonymous', {
        method: 'POST'
      });

      this.setAuthState(response.user, response.token, response.expiresIn);
      return response.user;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to sign in anonymously',
        'AUTH_ANONYMOUS_FAILED'
      );
    }
  }

  /**
   * Sign out
   */
  public async signOut(): Promise<void> {
    try {
      if (this.authState.token) {
        await this.cloudManager.request('/auth/signout', {
          method: 'POST'
        });
      }
    } catch (error) {
      console.warn('[Auth] Sign out error:', error);
    } finally {
      this.clearAuthState();
    }
  }

  /**
   * Get current user
   */
  public getCurrentUser(): User | null {
    return this.authState.user;
  }

  /**
   * Get auth token
   */
  public getToken(): string | null {
    // Check if token is expired
    if (this.authState.token && this.authState.tokenExpiry) {
      if (Date.now() >= this.authState.tokenExpiry) {
        this.refreshToken();
      }
    }

    return this.authState.token;
  }

  /**
   * Check if user is authenticated
   */
  public isAuthenticated(): boolean {
    return this.authState.isAuthenticated && this.authState.user !== null;
  }

  /**
   * Refresh auth token
   */
  public async refreshToken(): Promise<void> {
    if (!this.authState.token) {
      throw new CloudError('No token to refresh', 'NO_TOKEN');
    }

    try {
      const response = await this.cloudManager.request<{
        token: string;
        expiresIn: number;
      }>('/auth/refresh', {
        method: 'POST'
      });

      this.authState.token = response.token;
      this.authState.tokenExpiry = Date.now() + response.expiresIn * 1000;

      this.saveAuthState();
      this.scheduleTokenRefresh(response.expiresIn);
    } catch (error: any) {
      console.error('[Auth] Token refresh failed:', error);
      this.clearAuthState();
      throw new CloudError('Token refresh failed', 'AUTH_REFRESH_FAILED');
    }
  }

  /**
   * Update user profile
   */
  public async updateProfile(updates: {
    displayName?: string;
    photoURL?: string;
  }): Promise<void> {
    if (!this.isAuthenticated()) {
      throw new CloudError('Not authenticated', 'NOT_AUTHENTICATED');
    }

    try {
      const response = await this.cloudManager.requestWithRetry<{ user: User }>(
        '/auth/profile',
        {
          method: 'PATCH',
          body: JSON.stringify(updates)
        }
      );

      this.authState.user = response.user;
      this.saveAuthState();
      this.notifyStateChange();
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to update profile',
        'AUTH_UPDATE_FAILED'
      );
    }
  }

  /**
   * Send password reset email
   */
  public async sendPasswordResetEmail(email: string): Promise<void> {
    try {
      await this.cloudManager.requestWithRetry('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to send reset email',
        'AUTH_RESET_FAILED'
      );
    }
  }

  /**
   * Verify email
   */
  public async verifyEmail(code: string): Promise<void> {
    if (!this.isAuthenticated()) {
      throw new CloudError('Not authenticated', 'NOT_AUTHENTICATED');
    }

    try {
      await this.cloudManager.requestWithRetry('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ code })
      });

      if (this.authState.user) {
        this.authState.user.emailVerified = true;
        this.saveAuthState();
        this.notifyStateChange();
      }
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to verify email',
        'AUTH_VERIFY_FAILED'
      );
    }
  }

  /**
   * Link anonymous account to email
   */
  public async linkWithEmail(email: string, password: string): Promise<User> {
    if (!this.isAuthenticated() || !this.authState.user?.isAnonymous) {
      throw new CloudError('Not an anonymous user', 'NOT_ANONYMOUS');
    }

    try {
      const response = await this.cloudManager.requestWithRetry<{
        user: User;
        token: string;
        expiresIn: number;
      }>('/auth/link/email', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      this.setAuthState(response.user, response.token, response.expiresIn);
      return response.user;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to link account',
        'AUTH_LINK_FAILED'
      );
    }
  }

  /**
   * Add auth state change listener
   */
  public onAuthStateChanged(callback: AuthStateChangeCallback): () => void {
    this.stateChangeListeners.add(callback);

    // Immediately call with current user
    callback(this.authState.user);

    // Return unsubscribe function
    return () => {
      this.stateChangeListeners.delete(callback);
    };
  }

  /**
   * Set auth state
   */
  private setAuthState(user: User, token: string, expiresIn: number): void {
    this.authState = {
      user,
      isAuthenticated: true,
      token,
      tokenExpiry: Date.now() + expiresIn * 1000
    };

    this.saveAuthState();
    this.notifyStateChange();
    this.scheduleTokenRefresh(expiresIn);
  }

  /**
   * Clear auth state
   */
  private clearAuthState(): void {
    this.authState = {
      user: null,
      isAuthenticated: false,
      token: null,
      tokenExpiry: null
    };

    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.clearStoredAuthState();
    this.notifyStateChange();
  }

  /**
   * Notify state change listeners
   */
  private notifyStateChange(): void {
    for (const listener of this.stateChangeListeners) {
      try {
        listener(this.authState.user);
      } catch (error) {
        console.error('[Auth] State change listener error:', error);
      }
    }
  }

  /**
   * Schedule token refresh
   */
  private scheduleTokenRefresh(expiresIn: number): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
    }

    // Refresh 5 minutes before expiry
    const refreshTime = Math.max((expiresIn - 300) * 1000, 60000);

    this.refreshTimer = window.setTimeout(() => {
      this.refreshToken().catch(error => {
        console.error('[Auth] Auto-refresh failed:', error);
      });
    }, refreshTime);
  }

  /**
   * Build OAuth URL
   */
  private buildOAuthURL(provider: string, config?: OAuthConfig): string {
    const cloudConfig = this.cloudManager.getConfig();
    const baseUrl = `${cloudConfig.apiEndpoint}/auth/oauth/${provider}`;
    const params = new URLSearchParams({
      app_id: cloudConfig.appId,
      client_id: config?.clientId || '',
      redirect_uri: config?.redirectUri || window.location.origin,
      scopes: config?.scopes?.join(' ') || ''
    });

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Handle OAuth flow (simplified)
   */
  private async handleOAuthFlow(authUrl: string): Promise<{
    user: User;
    token: string;
    expiresIn: number;
  }> {
    // In a real implementation, this would open a popup or redirect
    // and handle the OAuth callback
    throw new CloudError('OAuth not implemented in this version', 'NOT_IMPLEMENTED');
  }

  /**
   * Save auth state to storage
   */
  private saveAuthState(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.authState));
    } catch (error) {
      console.warn('[Auth] Failed to save auth state:', error);
    }
  }

  /**
   * Load auth state from storage
   */
  private loadAuthState(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const state = JSON.parse(data);

        // Check if token is still valid
        if (state.tokenExpiry && Date.now() < state.tokenExpiry) {
          this.authState = state;
          this.scheduleTokenRefresh(
            Math.floor((state.tokenExpiry - Date.now()) / 1000)
          );
        } else {
          this.clearStoredAuthState();
        }
      }
    } catch (error) {
      console.warn('[Auth] Failed to load auth state:', error);
    }
  }

  /**
   * Clear stored auth state
   */
  private clearStoredAuthState(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.warn('[Auth] Failed to clear auth state:', error);
    }
  }

  /**
   * Dispose authentication
   */
  public dispose(): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.stateChangeListeners.clear();
  }
}
