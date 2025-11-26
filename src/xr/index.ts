/**
 * G3D 5.0 XR System Module
 *
 * Complete WebXR integration for virtual and augmented reality experiences.
 * Includes session management, input handling, controller tracking, hand tracking,
 * and advanced foveated rendering techniques for optimal VR performance.
 *
 * ## Features
 *
 * ### Core XR
 * - **XREngine**: Main XR integration with stereo rendering and frame loop
 * - **XRSessionManager**: Session lifecycle and feature detection
 * - **XRInputSystem**: Controller and hand tracking with gesture detection
 *
 * ### Foveated Rendering
 * - **EyeTracker**: Eye gaze tracking with fixation/saccade detection
 * - **FixedFoveatedRenderer**: Ring-based quality reduction (20-30% savings, no eye tracking)
 * - **FoveatedRenderer**: Dynamic gaze-based foveation (30-50% savings with eye tracking)
 * - **VariableRateShadingManager**: WebGPU VRS integration
 * - **MultiResolutionRenderer**: Multi-resolution rendering with seamless compositing
 * - **GazeBasedLOD**: Level of detail management based on gaze position
 *
 * ## Basic Usage
 *
 * ```typescript
 * import { XREngine, XRSessionManager, XRInputSystem } from './xr';
 *
 * // Initialize XR
 * const xrEngine = new XREngine(g3dEngine);
 * await xrEngine.initialize({
 *   mode: 'immersive-vr',
 *   features: ['local-floor', 'hand-tracking']
 * });
 *
 * // Start XR session
 * xrEngine.start((time, frame) => {
 *   // Get input
 *   const inputSystem = xrEngine.getInputSystem();
 *   const controllers = inputSystem.getControllers();
 *
 *   controllers.forEach(controller => {
 *     if (controller.buttons.trigger.pressed) {
 *       console.log('Trigger pressed!');
 *     }
 *   });
 *
 *   // Render scene
 *   xrEngine.render(scene, camera);
 * });
 * ```
 *
 * ## Foveated Rendering Usage
 *
 * ```typescript
 * import {
 *   XREngine,
 *   EyeTracker,
 *   FoveatedRenderer,
 *   GazeBasedLOD
 * } from './xr';
 *
 * // Setup XR with foveated rendering
 * const xrEngine = new XREngine(engine);
 * const eyeTracker = new EyeTracker({ smoothing: 0.3 });
 * const foveated = new FoveatedRenderer({
 *   centerRadius: 0.2,
 *   falloffCurve: 'gaussian',
 *   minQuality: 0.25
 * });
 *
 * // Setup gaze-based LOD
 * const gazeLOD = new GazeBasedLOD({
 *   highDetailRadius: 0.2,
 *   mediumDetailRadius: 0.5
 * });
 *
 * // Register objects with LOD
 * objects.forEach(obj => {
 *   gazeLOD.registerObject(obj, {
 *     high: obj.highDetailMesh,
 *     medium: obj.mediumDetailMesh,
 *     low: obj.lowDetailMesh
 *   });
 * });
 *
 * // Initialize
 * await xrEngine.initialize({ mode: 'immersive-vr' });
 * foveated.setup(canvas, gl);
 *
 * // Render loop
 * xrEngine.start((time, frame) => {
 *   // Get gaze position
 *   const gaze = eyeTracker.getGazePosition(
 *     frame,
 *     xrEngine.getReferenceSpace()
 *   );
 *
 *   // Update foveated rendering
 *   foveated.setGazePoint(gaze.normalized);
 *
 *   // Update LOD
 *   gazeLOD.update(gaze.normalized, camera);
 *
 *   // Render with foveation
 *   foveated.render(() => {
 *     // Render scene with appropriate LOD
 *     scene.objects.forEach(obj => {
 *       const lodMesh = gazeLOD.getLODMesh(obj);
 *       if (lodMesh) {
 *         renderer.render(lodMesh);
 *       }
 *     });
 *   });
 *
 *   // Check performance
 *   const stats = foveated.getStats();
 *   console.log(`FPS: ${stats.fps}, Pixel Reduction: ${stats.pixelReduction}%`);
 * });
 * ```
 *
 * ## Controller Input Usage
 *
 * ```typescript
 * import { XREngine, XRInputSystem } from './xr';
 *
 * const xrEngine = new XREngine(engine);
 * await xrEngine.initialize({ mode: 'immersive-vr' });
 *
 * xrEngine.start((time, frame) => {
 *   const inputSystem = xrEngine.getInputSystem();
 *
 *   // Get controllers
 *   const rightController = inputSystem.getController('right');
 *   if (rightController) {
 *     // Check buttons
 *     if (rightController.buttons.trigger.justPressed) {
 *       console.log('Trigger just pressed!');
 *       inputSystem.triggerHaptic(rightController.source, 100, 0.5);
 *     }
 *
 *     // Check thumbstick
 *     if (rightController.axes.thumbstick) {
 *       const { x, y } = rightController.axes.thumbstick;
 *       console.log(`Thumbstick: ${x}, ${y}`);
 *     }
 *
 *     // Get pose
 *     if (rightController.pose.aim) {
 *       const { position, orientation } = rightController.pose.aim;
 *       // Use aim pose for raycasting
 *     }
 *   }
 * });
 * ```
 *
 * ## Hand Tracking Usage
 *
 * ```typescript
 * import { XREngine, XRInputSystem } from './xr';
 *
 * const xrEngine = new XREngine(engine);
 * await xrEngine.initialize({
 *   mode: 'immersive-vr',
 *   optionalFeatures: ['hand-tracking']
 * });
 *
 * xrEngine.start((time, frame) => {
 *   const inputSystem = xrEngine.getInputSystem();
 *
 *   // Get hands
 *   const rightHand = inputSystem.getHand('right');
 *   if (rightHand) {
 *     // Detect pinch gesture
 *     const pinch = inputSystem.detectPinch(rightHand);
 *     if (pinch.isPinching) {
 *       console.log(`Pinching with strength: ${pinch.strength}`);
 *       console.log(`Pinch position:`, pinch.position);
 *     }
 *
 *     // Detect point gesture
 *     const point = inputSystem.detectPoint(rightHand);
 *     if (point.isPointing) {
 *       console.log(`Pointing in direction:`, point.direction);
 *       console.log(`Point origin:`, point.origin);
 *     }
 *
 *     // Access individual joints
 *     if (rightHand.index.tip) {
 *       console.log(`Index finger tip:`, rightHand.index.tip.position);
 *     }
 *   }
 * });
 * ```
 *
 * ## Performance Metrics
 *
 * ```typescript
 * // XR Engine metrics
 * const xrMetrics = xrEngine.getPerformanceMetrics();
 * console.log(`FPS: ${xrMetrics.fps}`);
 * console.log(`Average Frame Time: ${xrMetrics.averageFrameTime}ms`);
 * console.log(`Dropped Frames: ${xrMetrics.droppedFrames}`);
 *
 * // Foveated rendering metrics
 * const foveatedStats = foveated.getStats();
 * console.log(`Pixel Reduction: ${foveatedStats.pixelReduction}%`);
 * console.log(`Quality Adjustment: ${foveatedStats.qualityAdjustment}`);
 *
 * // LOD metrics
 * const lodStats = gazeLOD.getStats();
 * console.log(`High Detail Objects: ${lodStats.highDetailCount}`);
 * console.log(`Performance Gain: ${gazeLOD.estimatePerformanceGain()}%`);
 * ```
 *
 * @module xr
 */

// Core XR
export { XREngine } from './XREngine';
export type {
  XRInitOptions,
  XRRenderOptions,
  XRViewInfo,
  XRFrameCallback
} from './XREngine';

export { XRSessionManager } from './XRSessionManager';
export type {
  SessionRequestOptions,
  SessionCapabilities,
  SessionEvent,
  SessionEventHandler
} from './XRSessionManager';

export { XRInputSystem } from './XRInputSystem';
export type {
  ControllerPose,
  ButtonState,
  AxesState,
  ControllerState,
  HandJoint,
  HandState,
  PinchGesture,
  PointGesture
} from './XRInputSystem';

// Foveated Rendering
export * from './foveated';
