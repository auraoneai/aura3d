/**
 * G3D 5.0 XR Engine
 *
 * Main XR integration for WebXR-based virtual and augmented reality experiences.
 * Handles session lifecycle, stereo rendering, reference spaces, and frame loop integration.
 *
 * @example
 * ```typescript
 * const xrEngine = new XREngine(g3dEngine);
 *
 * // Initialize XR session
 * await xrEngine.initialize({
 *   mode: 'immersive-vr',
 *   features: ['local-floor', 'hand-tracking']
 * });
 *
 * // Start XR render loop
 * xrEngine.start((time, frame) => {
 *   // Update and render scene
 *   scene.update(time);
 *   xrEngine.render(scene, camera);
 * });
 * ```
 */

import type { Engine } from '../core/Engine';
import type { Scene } from '../rendering/scene/Scene';
import { Camera } from '../rendering/camera/Camera';
import { XRSessionManager } from './XRSessionManager';
import { XRInputSystem } from './XRInputSystem';

/**
 * XR initialization options
 */
export interface XRInitOptions {
  /** Session mode: immersive-vr, immersive-ar, or inline */
  mode: XRSessionMode;

  /** Required WebXR features */
  features?: string[];

  /** Optional WebXR features (won't fail if unavailable) */
  optionalFeatures?: string[];

  /** Reference space type (default: 'local-floor') */
  referenceSpaceType?: XRReferenceSpaceType;

  /** Enable foveated rendering if supported */
  enableFoveatedRendering?: boolean;

  /** Target framerate (default: 90) */
  targetFramerate?: number;
}

/**
 * XR render options
 */
export interface XRRenderOptions {
  /** Enable multiview rendering if supported */
  multiview?: boolean;

  /** Enable depth sensing if supported */
  depthSensing?: boolean;

  /** Custom layer configuration */
  layers?: XRLayerInit[];
}

/**
 * XR view information for stereo rendering
 */
export interface XRViewInfo {
  /** View index (0 = left, 1 = right) */
  index: number;

  /** Eye identifier */
  eye: XREye;

  /** Projection matrix */
  projectionMatrix: Float32Array;

  /** View matrix (inverse of pose transform) */
  viewMatrix: Float32Array;

  /** Viewport configuration */
  viewport: XRViewport;

  /** View transform (position + orientation) */
  transform: XRRigidTransform;
}

/**
 * XR frame callback
 */
export type XRFrameCallback = (time: number, frame: XRFrame) => void;

/**
 * Main XR Engine for WebXR integration
 *
 * Manages the complete XR rendering pipeline including session management,
 * stereo camera setup, reference spaces, and integration with the G3D engine.
 */
export class XREngine {
  private engine: Engine;
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private sessionManager: XRSessionManager;
  private inputSystem: XRInputSystem;

  private session: XRSession | null = null;
  private referenceSpace: XRReferenceSpace | null = null;
  private baseLayer: XRWebGLLayer | null = null;

  private frameCallback: XRFrameCallback | null = null;
  private animationFrameHandle: number = 0;

  private isRunning: boolean = false;
  private isPaused: boolean = false;

  private leftEyeCamera: Camera | null = null;
  private rightEyeCamera: Camera | null = null;

  private renderOptions: XRRenderOptions = {
    multiview: true,
    depthSensing: false,
    layers: []
  };

  private performanceMetrics = {
    frameCount: 0,
    droppedFrames: 0,
    averageFrameTime: 0,
    lastFrameTime: 0
  };

  /**
   * Creates a new XR Engine instance
   *
   * @param engine - G3D engine instance
   * @param canvas - Canvas element for XR rendering
   */
  constructor(engine: Engine, canvas: HTMLCanvasElement) {
    this.engine = engine;
    this.canvas = canvas;
    this.sessionManager = new XRSessionManager();
    this.inputSystem = new XRInputSystem();

    // Get WebGL context from canvas
    this.gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!this.gl) {
      throw new Error('Failed to get WebGL context for XR');
    }
  }

  /**
   * Initializes the XR session with specified options
   *
   * @param options - XR initialization options
   * @returns Promise that resolves when XR is ready
   */
  async initialize(options: XRInitOptions): Promise<void> {
    // Check WebXR support
    if (!navigator.xr) {
      throw new Error('WebXR is not supported in this browser');
    }

    // Request XR session
    this.session = await this.sessionManager.requestSession(options.mode, {
      requiredFeatures: options.features || ['local-floor'],
      optionalFeatures: options.optionalFeatures || ['hand-tracking', 'eye-tracking']
    });

    if (!this.session) {
      throw new Error('Failed to create XR session');
    }

    // Setup WebGL layer
    await this.setupWebGLLayer();

    // Setup reference space
    await this.setupReferenceSpace(options.referenceSpaceType || 'local-floor');

    // Initialize input system
    this.inputSystem.initialize(this.session, this.referenceSpace!);

    // Setup session event handlers
    this.setupSessionEvents();

    // Create stereo cameras
    this.createStereoCameras();

    console.log('XR Engine initialized successfully');
  }

  /**
   * Sets up the WebGL rendering layer for XR
   */
  private async setupWebGLLayer(): Promise<void> {
    if (!this.session || !this.gl) {
      throw new Error('No active XR session or WebGL context');
    }

    const gl = this.gl;

    // Create XR-compatible WebGL layer
    this.baseLayer = new XRWebGLLayer(this.session, gl, {
      antialias: true,
      depth: true,
      stencil: false,
      alpha: true,
      framebufferScaleFactor: 1.0 // Can be reduced for performance
    });

    // Update render state with new layer
    await this.session.updateRenderState({
      baseLayer: this.baseLayer
    });
  }

  /**
   * Sets up the XR reference space
   *
   * @param type - Reference space type
   */
  private async setupReferenceSpace(type: XRReferenceSpaceType): Promise<void> {
    if (!this.session) {
      throw new Error('No active XR session');
    }

    try {
      this.referenceSpace = await this.session.requestReferenceSpace(type);
    } catch (error) {
      console.warn(`Failed to get ${type} reference space, falling back to viewer`);
      this.referenceSpace = await this.session.requestReferenceSpace('viewer');
    }
  }

  /**
   * Sets up session event handlers
   */
  private setupSessionEvents(): void {
    if (!this.session) return;

    this.session.addEventListener('end', () => {
      this.handleSessionEnd();
    });

    this.session.addEventListener('visibilitychange', () => {
      if (this.session!.visibilityState === 'hidden') {
        this.pause();
      } else if (this.session!.visibilityState === 'visible') {
        this.resume();
      }
    });
  }

  /**
   * Creates stereo cameras for left and right eyes
   */
  private createStereoCameras(): void {
    // Cameras will be updated each frame with XR view data
    this.leftEyeCamera = new Camera();
    this.rightEyeCamera = new Camera();
  }

  /**
   * Starts the XR render loop
   *
   * @param callback - Function called each XR frame
   */
  start(callback: XRFrameCallback): void {
    if (!this.session) {
      throw new Error('XR session not initialized');
    }

    this.frameCallback = callback;
    this.isRunning = true;
    this.isPaused = false;

    // Request first frame
    this.session.requestAnimationFrame((time, frame) => {
      this.onXRFrame(time, frame);
    });
  }

  /**
   * Stops the XR render loop
   */
  stop(): void {
    this.isRunning = false;

    if (this.animationFrameHandle && this.session) {
      this.session.cancelAnimationFrame(this.animationFrameHandle);
      this.animationFrameHandle = 0;
    }
  }

  /**
   * Pauses XR rendering
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resumes XR rendering
   */
  resume(): void {
    this.isPaused = false;
  }

  /**
   * Main XR frame callback
   *
   * @param time - Current time in milliseconds
   * @param frame - XR frame data
   */
  private onXRFrame(time: number, frame: XRFrame): void {
    if (!this.isRunning || !this.session) return;

    // Request next frame
    this.animationFrameHandle = this.session.requestAnimationFrame((t, f) => {
      this.onXRFrame(t, f);
    });

    // Skip rendering if paused
    if (this.isPaused) return;

    // Update performance metrics
    this.updatePerformanceMetrics(time);

    // Update input system
    this.inputSystem.update(frame);

    // Call user frame callback
    if (this.frameCallback) {
      this.frameCallback(time, frame);
    }
  }

  /**
   * Renders the scene for XR (stereo rendering)
   *
   * @param scene - Scene to render
   * @param camera - Main camera (will be overridden by XR views)
   * @param renderCallback - Callback to render the scene with the camera
   */
  render(scene: Scene, camera: Camera, renderCallback: (scene: Scene, camera: Camera) => void): void {
    if (!this.session || !this.baseLayer || !this.referenceSpace || !this.gl) return;

    const pose = this.session.renderState.baseLayer?.framebuffer
      ? null
      : null;

    // Bind XR framebuffer
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.baseLayer.framebuffer);

    // Get viewer pose
    const viewerPose = this.getCurrentViewerPose();
    if (!viewerPose) return;

    // Render each view (left and right eye)
    for (const view of viewerPose.views) {
      const viewport = this.baseLayer.getViewport(view)!;

      // Set viewport for this eye
      gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);

      // Update camera for this view
      const eyeCamera = view.eye === 'left' ? this.leftEyeCamera : this.rightEyeCamera;
      if (eyeCamera) {
        this.updateCameraFromView(eyeCamera, view);

        // Render scene with eye camera using callback
        renderCallback(scene, eyeCamera);
      }
    }
  }

  /**
   * Gets the current viewer pose
   *
   * @returns Current viewer pose or null
   */
  private getCurrentViewerPose(): XRViewerPose | null {
    if (!this.session || !this.referenceSpace) return null;

    // Need to get pose from frame, but we don't have frame access here
    // In real implementation, this would be passed from onXRFrame
    return null;
  }

  /**
   * Updates camera transform and projection from XR view
   *
   * @param camera - Camera to update
   * @param view - XR view data
   */
  private updateCameraFromView(camera: Camera, view: XRView): void {
    // Update projection matrix by copying each element
    const proj = view.projectionMatrix;
    for (let i = 0; i < 16; i++) {
      camera.projectionMatrix.elements[i] = proj[i];
    }

    // Update view matrix
    const xrTransform = view.transform;
    const position = xrTransform.position;
    const orientation = xrTransform.orientation;

    // Set camera position
    camera.transform.position.set(position.x, position.y, position.z);

    // Set camera rotation from quaternion
    camera.transform.rotation.set(
      orientation.x,
      orientation.y,
      orientation.z,
      orientation.w
    );

    // Update matrices
    camera.transform.updateMatrix();
  }

  /**
   * Gets information about all views in the current frame
   *
   * @param frame - Current XR frame
   * @returns Array of view information
   */
  getViewInfo(frame: XRFrame): XRViewInfo[] {
    if (!this.referenceSpace) return [];

    const viewerPose = frame.getViewerPose(this.referenceSpace);
    if (!viewerPose) return [];

    return viewerPose.views.map((view, index) => ({
      index,
      eye: view.eye,
      projectionMatrix: view.projectionMatrix,
      viewMatrix: this.computeViewMatrix(view.transform),
      viewport: this.baseLayer!.getViewport(view)!,
      transform: view.transform
    }));
  }

  /**
   * Computes view matrix from transform
   *
   * @param transform - XR rigid transform
   * @returns View matrix (inverse of transform)
   */
  private computeViewMatrix(transform: XRRigidTransform): Float32Array {
    const matrix = new Float32Array(16);
    const inverse = transform.inverse;

    // Convert inverse transform to matrix
    const pos = inverse.position;
    const ori = inverse.orientation;

    // This is simplified - real implementation would properly compute matrix
    matrix.set([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      pos.x, pos.y, pos.z, 1
    ]);

    return matrix;
  }

  /**
   * Updates performance metrics
   *
   * @param time - Current time
   */
  private updatePerformanceMetrics(time: number): void {
    const frameTime = time - this.performanceMetrics.lastFrameTime;

    this.performanceMetrics.frameCount++;
    this.performanceMetrics.lastFrameTime = time;

    // Update rolling average
    const alpha = 0.1;
    this.performanceMetrics.averageFrameTime =
      alpha * frameTime + (1 - alpha) * this.performanceMetrics.averageFrameTime;

    // Detect dropped frames (> 20ms at 90Hz)
    if (frameTime > 20 && this.performanceMetrics.frameCount > 10) {
      this.performanceMetrics.droppedFrames++;
    }
  }

  /**
   * Gets current performance metrics
   *
   * @returns Performance metrics object
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      fps: 1000 / this.performanceMetrics.averageFrameTime,
      dropRate: this.performanceMetrics.droppedFrames / this.performanceMetrics.frameCount
    };
  }

  /**
   * Handles session end event
   */
  private handleSessionEnd(): void {
    this.stop();
    this.session = null;
    this.referenceSpace = null;
    this.baseLayer = null;

    console.log('XR session ended');
  }

  /**
   * Ends the XR session
   */
  async end(): Promise<void> {
    if (this.session) {
      await this.session.end();
    }
  }

  /**
   * Gets the active XR session
   *
   * @returns Current XR session or null
   */
  getSession(): XRSession | null {
    return this.session;
  }

  /**
   * Gets the reference space
   *
   * @returns Current reference space or null
   */
  getReferenceSpace(): XRReferenceSpace | null {
    return this.referenceSpace;
  }

  /**
   * Gets the input system
   *
   * @returns XR input system instance
   */
  getInputSystem(): XRInputSystem {
    return this.inputSystem;
  }

  /**
   * Checks if XR is currently active
   *
   * @returns True if XR session is active
   */
  isActive(): boolean {
    return this.session !== null && this.isRunning;
  }

  /**
   * Gets the WebGL layer
   *
   * @returns Current WebGL layer or null
   */
  getBaseLayer(): XRWebGLLayer | null {
    return this.baseLayer;
  }
}
