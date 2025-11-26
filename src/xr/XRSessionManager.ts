/**
 * G3D 5.0 XR Session Manager
 *
 * Manages WebXR session lifecycle including session request, feature detection,
 * mode handling, and graceful fallback strategies.
 *
 * @example
 * ```typescript
 * const sessionManager = new XRSessionManager();
 *
 * // Check if VR is supported
 * const vrSupported = await sessionManager.isSessionSupported('immersive-vr');
 *
 * // Request VR session with features
 * const session = await sessionManager.requestSession('immersive-vr', {
 *   requiredFeatures: ['local-floor'],
 *   optionalFeatures: ['hand-tracking', 'eye-tracking']
 * });
 *
 * // Handle session events
 * sessionManager.on('sessionstart', (session) => {
 *   console.log('XR session started');
 * });
 * ```
 */

/**
 * Session request options
 */
export interface SessionRequestOptions {
  /** Required features (will fail if not available) */
  requiredFeatures?: string[];

  /** Optional features (won't fail if unavailable) */
  optionalFeatures?: string[];

  /** Depth sensing configuration */
  depthSensing?: {
    usagePreference: ('cpu-optimized' | 'gpu-optimized')[];
    dataFormatPreference: ('luminance-alpha' | 'float32')[];
  };

  /** DOM overlay configuration for AR */
  domOverlay?: {
    root: Element;
  };
}

/**
 * Session capabilities detected from the XR system
 */
export interface SessionCapabilities {
  /** Session mode */
  mode: XRSessionMode;

  /** Supported features */
  features: string[];

  /** Supported reference space types */
  referenceSpaces: XRReferenceSpaceType[];

  /** Maximum layers supported */
  maxLayers: number;

  /** Hand tracking support */
  handTracking: boolean;

  /** Eye tracking support */
  eyeTracking: boolean;

  /** Depth sensing support */
  depthSensing: boolean;

  /** DOM overlay support (AR) */
  domOverlay: boolean;
}

/**
 * Session event types
 */
export type SessionEvent =
  | 'sessionstart'
  | 'sessionend'
  | 'visibilitychange'
  | 'inputsourceschange'
  | 'selectstart'
  | 'select'
  | 'selectend'
  | 'squeezestart'
  | 'squeeze'
  | 'squeezeend';

/**
 * Session event handler
 */
export type SessionEventHandler = (session: XRSession, event?: Event) => void;

/**
 * XR Session Manager
 *
 * Centralized management of WebXR sessions including lifecycle,
 * feature detection, and event handling.
 */
export class XRSessionManager {
  private currentSession: XRSession | null = null;
  private eventHandlers: Map<SessionEvent, Set<SessionEventHandler>> = new Map();
  private capabilities: Map<XRSessionMode, SessionCapabilities> = new Map();

  private sessionStartTime: number = 0;
  private sessionMode: XRSessionMode | null = null;

  /**
   * Creates a new XR Session Manager
   */
  constructor() {
    this.initializeEventHandlers();
  }

  /**
   * Initializes event handler storage
   */
  private initializeEventHandlers(): void {
    const events: SessionEvent[] = [
      'sessionstart',
      'sessionend',
      'visibilitychange',
      'inputsourceschange',
      'selectstart',
      'select',
      'selectend',
      'squeezestart',
      'squeeze',
      'squeezeend'
    ];

    events.forEach(event => {
      this.eventHandlers.set(event, new Set());
    });
  }

  /**
   * Checks if a session mode is supported
   *
   * @param mode - Session mode to check
   * @returns Promise resolving to support status
   */
  async isSessionSupported(mode: XRSessionMode): Promise<boolean> {
    if (!navigator.xr) {
      return false;
    }

    try {
      return await navigator.xr.isSessionSupported(mode);
    } catch (error) {
      console.warn(`Error checking session support for ${mode}:`, error);
      return false;
    }
  }

  /**
   * Detects capabilities for a session mode
   *
   * @param mode - Session mode to detect capabilities for
   * @returns Session capabilities
   */
  async detectCapabilities(mode: XRSessionMode): Promise<SessionCapabilities> {
    // Check cache
    if (this.capabilities.has(mode)) {
      return this.capabilities.get(mode)!;
    }

    const capabilities: SessionCapabilities = {
      mode,
      features: [],
      referenceSpaces: [],
      maxLayers: 1,
      handTracking: false,
      eyeTracking: false,
      depthSensing: false,
      domOverlay: false
    };

    // Check if mode is supported at all
    const supported = await this.isSessionSupported(mode);
    if (!supported) {
      this.capabilities.set(mode, capabilities);
      return capabilities;
    }

    // Test various features by attempting to create sessions
    const featuresToTest = [
      'hand-tracking',
      'eye-tracking',
      'depth-sensing',
      'dom-overlay',
      'hit-test',
      'anchors',
      'plane-detection',
      'mesh-detection',
      'light-estimation'
    ];

    for (const feature of featuresToTest) {
      try {
        const testSession = await navigator.xr!.requestSession(mode, {
          optionalFeatures: [feature]
        });

        capabilities.features.push(feature);

        // Check specific feature flags
        if (feature === 'hand-tracking') capabilities.handTracking = true;
        if (feature === 'eye-tracking') capabilities.eyeTracking = true;
        if (feature === 'depth-sensing') capabilities.depthSensing = true;
        if (feature === 'dom-overlay') capabilities.domOverlay = true;

        await testSession.end();
      } catch (error) {
        // Feature not supported
      }
    }

    // Test reference spaces
    const spacesToTest: XRReferenceSpaceType[] = [
      'viewer',
      'local',
      'local-floor',
      'bounded-floor',
      'unbounded'
    ];

    // Create temporary session to test reference spaces
    try {
      const testSession = await navigator.xr!.requestSession(mode, {
        optionalFeatures: capabilities.features
      });

      for (const spaceType of spacesToTest) {
        try {
          await testSession.requestReferenceSpace(spaceType);
          capabilities.referenceSpaces.push(spaceType);
        } catch (error) {
          // Reference space not supported
        }
      }

      await testSession.end();
    } catch (error) {
      console.warn('Error testing reference spaces:', error);
    }

    // Cache and return
    this.capabilities.set(mode, capabilities);
    return capabilities;
  }

  /**
   * Requests a new XR session
   *
   * @param mode - Session mode (immersive-vr, immersive-ar, inline)
   * @param options - Session request options
   * @returns Promise resolving to XR session
   */
  async requestSession(
    mode: XRSessionMode,
    options: SessionRequestOptions = {}
  ): Promise<XRSession> {
    if (!navigator.xr) {
      throw new Error('WebXR is not supported in this browser');
    }

    // Check if mode is supported
    const supported = await this.isSessionSupported(mode);
    if (!supported) {
      throw new Error(`Session mode "${mode}" is not supported`);
    }

    // End current session if exists
    if (this.currentSession) {
      await this.endSession();
    }

    // Prepare session init options
    const sessionInit: XRSessionInit = {};

    if (options.requiredFeatures && options.requiredFeatures.length > 0) {
      sessionInit.requiredFeatures = options.requiredFeatures;
    }

    if (options.optionalFeatures && options.optionalFeatures.length > 0) {
      sessionInit.optionalFeatures = options.optionalFeatures;
    }

    if (options.depthSensing) {
      sessionInit.depthSensing = options.depthSensing;
    }

    if (options.domOverlay) {
      sessionInit.domOverlay = options.domOverlay;
    }

    try {
      // Request session with fallback
      this.currentSession = await this.requestSessionWithFallback(mode, sessionInit);
      this.sessionMode = mode;
      this.sessionStartTime = performance.now();

      // Setup event listeners
      this.setupSessionEventListeners(this.currentSession);

      // Emit session start event
      this.emit('sessionstart', this.currentSession);

      return this.currentSession;
    } catch (error) {
      throw new Error(`Failed to request XR session: ${error}`);
    }
  }

  /**
   * Requests session with graceful feature fallback
   *
   * @param mode - Session mode
   * @param init - Session init options
   * @returns XR session
   */
  private async requestSessionWithFallback(
    mode: XRSessionMode,
    init: XRSessionInit
  ): Promise<XRSession> {
    try {
      // Try with all requested features
      return await navigator.xr!.requestSession(mode, init);
    } catch (error) {
      console.warn('Failed with all features, trying with required only:', error);

      // Fallback: try with only required features
      if (init.optionalFeatures && init.optionalFeatures.length > 0) {
        try {
          const fallbackInit: XRSessionInit = {
            requiredFeatures: init.requiredFeatures
          };
          return await navigator.xr!.requestSession(mode, fallbackInit);
        } catch (fallbackError) {
          console.warn('Failed with required features, trying minimal:', fallbackError);
        }
      }

      // Last resort: try with no features
      try {
        return await navigator.xr!.requestSession(mode, {});
      } catch (minimalError) {
        throw new Error(`Unable to create XR session even with minimal features: ${minimalError}`);
      }
    }
  }

  /**
   * Sets up event listeners for the session
   *
   * @param session - XR session
   */
  private setupSessionEventListeners(session: XRSession): void {
    // Session end
    session.addEventListener('end', (event) => {
      this.handleSessionEnd(session, event);
    });

    // Visibility change
    session.addEventListener('visibilitychange', (event) => {
      this.emit('visibilitychange', session, event);
    });

    // Input sources change
    session.addEventListener('inputsourceschange', (event) => {
      this.emit('inputsourceschange', session, event);
    });

    // Select events
    session.addEventListener('selectstart', (event) => {
      this.emit('selectstart', session, event);
    });

    session.addEventListener('select', (event) => {
      this.emit('select', session, event);
    });

    session.addEventListener('selectend', (event) => {
      this.emit('selectend', session, event);
    });

    // Squeeze events
    session.addEventListener('squeezestart', (event) => {
      this.emit('squeezestart', session, event);
    });

    session.addEventListener('squeeze', (event) => {
      this.emit('squeeze', session, event);
    });

    session.addEventListener('squeezeend', (event) => {
      this.emit('squeezeend', session, event);
    });
  }

  /**
   * Handles session end event
   *
   * @param session - Ended session
   * @param event - End event
   */
  private handleSessionEnd(session: XRSession, event: Event): void {
    const sessionDuration = performance.now() - this.sessionStartTime;

    console.log(`XR session ended after ${(sessionDuration / 1000).toFixed(2)}s`);

    this.emit('sessionend', session, event);

    this.currentSession = null;
    this.sessionMode = null;
    this.sessionStartTime = 0;
  }

  /**
   * Ends the current session
   */
  async endSession(): Promise<void> {
    if (this.currentSession) {
      try {
        await this.currentSession.end();
      } catch (error) {
        console.warn('Error ending XR session:', error);
      }
    }
  }

  /**
   * Registers an event handler
   *
   * @param event - Event type
   * @param handler - Event handler function
   */
  on(event: SessionEvent, handler: SessionEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.add(handler);
    }
  }

  /**
   * Unregisters an event handler
   *
   * @param event - Event type
   * @param handler - Event handler function
   */
  off(event: SessionEvent, handler: SessionEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Emits an event to all registered handlers
   *
   * @param event - Event type
   * @param session - XR session
   * @param data - Event data
   */
  private emit(event: SessionEvent, session: XRSession, data?: Event): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(session, data);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      });
    }
  }

  /**
   * Gets the current active session
   *
   * @returns Current session or null
   */
  getCurrentSession(): XRSession | null {
    return this.currentSession;
  }

  /**
   * Gets the current session mode
   *
   * @returns Current mode or null
   */
  getCurrentMode(): XRSessionMode | null {
    return this.sessionMode;
  }

  /**
   * Gets session duration in milliseconds
   *
   * @returns Session duration or 0 if no active session
   */
  getSessionDuration(): number {
    if (!this.currentSession) return 0;
    return performance.now() - this.sessionStartTime;
  }

  /**
   * Checks if there's an active session
   *
   * @returns True if session is active
   */
  hasActiveSession(): boolean {
    return this.currentSession !== null;
  }

  /**
   * Gets capabilities for a session mode
   *
   * @param mode - Session mode
   * @returns Cached capabilities or undefined
   */
  getCachedCapabilities(mode: XRSessionMode): SessionCapabilities | undefined {
    return this.capabilities.get(mode);
  }

  /**
   * Checks if a feature is supported in current session
   *
   * @param feature - Feature name
   * @returns True if feature is available
   */
  isFeatureAvailable(feature: string): boolean {
    if (!this.sessionMode) return false;

    const caps = this.capabilities.get(this.sessionMode);
    return caps?.features.includes(feature) || false;
  }
}
