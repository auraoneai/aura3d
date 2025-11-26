/**
 * G3D 5.0 XR Input System
 *
 * Comprehensive XR input handling including controllers, hand tracking,
 * button states, haptic feedback, and gesture detection.
 *
 * @example
 * ```typescript
 * const inputSystem = new XRInputSystem();
 * inputSystem.initialize(session, referenceSpace);
 *
 * // In render loop
 * function onXRFrame(time, frame) {
 *   inputSystem.update(frame);
 *
 *   // Get controller state
 *   const controllers = inputSystem.getControllers();
 *   controllers.forEach(controller => {
 *     if (controller.buttons.trigger.pressed) {
 *       // Trigger haptic feedback
 *       inputSystem.triggerHaptic(controller.source, 100, 0.5);
 *     }
 *   });
 *
 *   // Get hand tracking
 *   const hands = inputSystem.getHands();
 *   hands.forEach(hand => {
 *     const pinch = inputSystem.detectPinch(hand);
 *     if (pinch.isPinching) {
 *       console.log('Pinch detected', pinch.strength);
 *     }
 *   });
 * }
 * ```
 */

import type { Vector3 } from '../math/Vector3';
import type { Quaternion } from '../math/Quaternion';

/**
 * Controller pose information
 */
export interface ControllerPose {
  /** Grip pose (hand position) */
  grip: {
    position: Vector3;
    orientation: Quaternion;
    transform: XRRigidTransform;
  } | null;

  /** Aim pose (pointing direction) */
  aim: {
    position: Vector3;
    orientation: Quaternion;
    transform: XRRigidTransform;
  } | null;
}

/**
 * Button state
 */
export interface ButtonState {
  /** Button is currently pressed */
  pressed: boolean;

  /** Button was just pressed this frame */
  justPressed: boolean;

  /** Button was just released this frame */
  justReleased: boolean;

  /** Button is touched (for capacitive buttons) */
  touched: boolean;

  /** Analog value (0-1) */
  value: number;
}

/**
 * Axes state (thumbstick/touchpad)
 */
export interface AxesState {
  /** X axis (-1 to 1, left to right) */
  x: number;

  /** Y axis (-1 to 1, down to up) */
  y: number;

  /** Magnitude of deflection (0-1) */
  magnitude: number;

  /** Angle in radians */
  angle: number;
}

/**
 * Controller state
 */
export interface ControllerState {
  /** Input source */
  source: XRInputSource;

  /** Hand identifier */
  handedness: XRHandedness;

  /** Pose information */
  pose: ControllerPose;

  /** Button states */
  buttons: {
    trigger: ButtonState;
    squeeze: ButtonState;
    thumbstick: ButtonState;
    touchpad: ButtonState;
    buttonA: ButtonState;
    buttonB: ButtonState;
    thumbrest: ButtonState;
  };

  /** Axes state */
  axes: {
    thumbstick: AxesState | null;
    touchpad: AxesState | null;
  };

  /** Connected status */
  connected: boolean;
}

/**
 * Hand joint information
 */
export interface HandJoint {
  /** Joint name */
  name: string;

  /** Joint position */
  position: Vector3;

  /** Joint orientation */
  orientation: Quaternion;

  /** Joint radius */
  radius: number;
}

/**
 * Hand tracking state
 */
export interface HandState {
  /** Input source */
  source: XRInputSource;

  /** Hand identifier */
  handedness: XRHandedness;

  /** All hand joints */
  joints: Map<XRHandJoint, HandJoint>;

  /** Wrist joint */
  wrist: HandJoint | null;

  /** Thumb joints */
  thumb: {
    tip: HandJoint | null;
    metacarpal: HandJoint | null;
    phalanxProximal: HandJoint | null;
    phalanxDistal: HandJoint | null;
  };

  /** Index finger joints */
  index: {
    tip: HandJoint | null;
    metacarpal: HandJoint | null;
    phalanxProximal: HandJoint | null;
    phalanxIntermediate: HandJoint | null;
    phalanxDistal: HandJoint | null;
  };

  /** Middle finger joints */
  middle: {
    tip: HandJoint | null;
    metacarpal: HandJoint | null;
    phalanxProximal: HandJoint | null;
    phalanxIntermediate: HandJoint | null;
    phalanxDistal: HandJoint | null;
  };

  /** Ring finger joints */
  ring: {
    tip: HandJoint | null;
    metacarpal: HandJoint | null;
    phalanxProximal: HandJoint | null;
    phalanxIntermediate: HandJoint | null;
    phalanxDistal: HandJoint | null;
  };

  /** Pinky finger joints */
  pinky: {
    tip: HandJoint | null;
    metacarpal: HandJoint | null;
    phalanxProximal: HandJoint | null;
    phalanxIntermediate: HandJoint | null;
    phalanxDistal: HandJoint | null;
  };
}

/**
 * Pinch gesture detection result
 */
export interface PinchGesture {
  /** Is currently pinching */
  isPinching: boolean;

  /** Pinch strength (0-1) */
  strength: number;

  /** Distance between thumb and index finger */
  distance: number;

  /** Pinch position (midpoint between thumb and index) */
  position: Vector3 | null;
}

/**
 * Point gesture detection result
 */
export interface PointGesture {
  /** Is currently pointing */
  isPointing: boolean;

  /** Point direction */
  direction: Vector3 | null;

  /** Point origin */
  origin: Vector3 | null;

  /** Confidence (0-1) */
  confidence: number;
}

/**
 * XR Input System
 *
 * Manages all XR input including controllers, hand tracking, and gestures.
 */
export class XRInputSystem {
  private session: XRSession | null = null;
  private referenceSpace: XRReferenceSpace | null = null;

  private controllers: Map<XRInputSource, ControllerState> = new Map();
  private previousControllers: Map<XRInputSource, ControllerState> = new Map();

  private hands: Map<XRInputSource, HandState> = new Map();

  private inputSources: XRInputSource[] = [];

  // Gesture detection thresholds
  private readonly PINCH_THRESHOLD = 0.03; // 3cm
  private readonly PINCH_RELEASE_THRESHOLD = 0.05; // 5cm (hysteresis)
  private readonly POINT_CURL_THRESHOLD = 0.3; // Max curl for non-index fingers

  /**
   * Initializes the input system
   *
   * @param session - XR session
   * @param referenceSpace - Reference space
   */
  initialize(session: XRSession, referenceSpace: XRReferenceSpace): void {
    this.session = session;
    this.referenceSpace = referenceSpace;

    // Get initial input sources
    this.inputSources = Array.from(session.inputSources);

    // Setup event listeners
    session.addEventListener('inputsourceschange', (event: XRInputSourcesChangeEvent) => {
      this.handleInputSourcesChange(event);
    });
  }

  /**
   * Handles input sources change event
   *
   * @param event - Input source change event
   */
  private handleInputSourcesChange(event: XRInputSourcesChangeEvent): void {
    // Remove disconnected sources
    event.removed.forEach((source: XRInputSource) => {
      this.controllers.delete(source);
      this.hands.delete(source);
    });

    // Update input sources list
    this.inputSources = Array.from(this.session!.inputSources);
  }

  /**
   * Updates input system state for current frame
   *
   * @param frame - Current XR frame
   */
  update(frame: XRFrame): void {
    if (!this.referenceSpace) return;

    // Store previous controller states
    this.previousControllers.clear();
    this.controllers.forEach((state, source) => {
      this.previousControllers.set(source, this.cloneControllerState(state));
    });

    // Clear current states
    this.controllers.clear();
    this.hands.clear();

    // Update all input sources
    this.inputSources.forEach(source => {
      if (source.hand) {
        this.updateHandTracking(frame, source);
      } else {
        this.updateController(frame, source);
      }
    });
  }

  /**
   * Updates controller state
   *
   * @param frame - Current XR frame
   * @param source - Input source
   */
  private updateController(frame: XRFrame, source: XRInputSource): void {
    const previousState = this.previousControllers.get(source);

    // Get poses
    const gripPose = source.gripSpace
      ? frame.getPose(source.gripSpace, this.referenceSpace!)
      : null;

    const aimPose = source.targetRaySpace
      ? frame.getPose(source.targetRaySpace, this.referenceSpace!)
      : null;

    // Build controller state
    const state: ControllerState = {
      source,
      handedness: source.handedness,
      pose: {
        grip: gripPose ? {
          position: this.transformToVector3(gripPose.transform.position),
          orientation: this.transformToQuaternion(gripPose.transform.orientation),
          transform: gripPose.transform
        } : null,
        aim: aimPose ? {
          position: this.transformToVector3(aimPose.transform.position),
          orientation: this.transformToQuaternion(aimPose.transform.orientation),
          transform: aimPose.transform
        } : null
      },
      buttons: this.updateButtons(source.gamepad ?? null, previousState),
      axes: this.updateAxes(source.gamepad ?? null),
      connected: source.gamepad !== null && source.gamepad !== undefined
    };

    this.controllers.set(source, state);
  }

  /**
   * Updates button states from gamepad
   *
   * @param gamepad - XR gamepad
   * @param previousState - Previous controller state
   * @returns Button states
   */
  private updateButtons(
    gamepad: Gamepad | null,
    previousState?: ControllerState
  ): ControllerState['buttons'] {
    const createButtonState = (index: number): ButtonState => {
      const button = gamepad?.buttons[index];
      const prevButton = previousState?.buttons;

      if (!button) {
        return {
          pressed: false,
          justPressed: false,
          justReleased: false,
          touched: false,
          value: 0
        };
      }

      const wasPressed = this.getButtonPressed(previousState, index);

      return {
        pressed: button.pressed,
        justPressed: button.pressed && !wasPressed,
        justReleased: !button.pressed && wasPressed,
        touched: button.touched,
        value: button.value
      };
    };

    return {
      trigger: createButtonState(0),
      squeeze: createButtonState(1),
      touchpad: createButtonState(2),
      thumbstick: createButtonState(3),
      buttonA: createButtonState(4),
      buttonB: createButtonState(5),
      thumbrest: createButtonState(6)
    };
  }

  /**
   * Gets button pressed state from previous state
   *
   * @param state - Previous state
   * @param index - Button index
   * @returns Previous pressed state
   */
  private getButtonPressed(state: ControllerState | undefined, index: number): boolean {
    if (!state) return false;

    const buttonMap = [
      state.buttons.trigger,
      state.buttons.squeeze,
      state.buttons.touchpad,
      state.buttons.thumbstick,
      state.buttons.buttonA,
      state.buttons.buttonB,
      state.buttons.thumbrest
    ];

    return buttonMap[index]?.pressed || false;
  }

  /**
   * Updates axes states from gamepad
   *
   * @param gamepad - XR gamepad
   * @returns Axes states
   */
  private updateAxes(gamepad: Gamepad | null): ControllerState['axes'] {
    const createAxesState = (xIndex: number, yIndex: number): AxesState | null => {
      if (!gamepad || !gamepad.axes[xIndex] || !gamepad.axes[yIndex]) {
        return null;
      }

      const x = gamepad.axes[xIndex];
      const y = gamepad.axes[yIndex];
      const magnitude = Math.sqrt(x * x + y * y);
      const angle = Math.atan2(y, x);

      return { x, y, magnitude, angle };
    };

    return {
      thumbstick: createAxesState(2, 3),
      touchpad: createAxesState(0, 1)
    };
  }

  /**
   * Updates hand tracking state
   *
   * @param frame - Current XR frame
   * @param source - Input source with hand
   */
  private updateHandTracking(frame: XRFrame, source: XRInputSource): void {
    if (!source.hand) return;

    const joints = new Map<XRHandJoint, HandJoint>();

    // Iterate through all hand joints
    for (const jointName of source.hand.keys()) {
      const joint = source.hand.get(jointName);
      if (!joint) continue;

      // Check if getJointPose method exists (it may not be available in all implementations)
      if (!frame.getJointPose) continue;

      const pose = frame.getJointPose(joint, this.referenceSpace!);
      if (!pose) continue;

      joints.set(jointName, {
        name: jointName,
        position: this.transformToVector3(pose.transform.position),
        orientation: this.transformToQuaternion(pose.transform.orientation),
        radius: pose.radius || 0.01
      });
    }

    // Build hand state
    const handState: HandState = {
      source,
      handedness: source.handedness,
      joints,
      wrist: joints.get('wrist' as XRHandJoint) || null,
      thumb: {
        tip: joints.get('thumb-tip' as XRHandJoint) || null,
        metacarpal: joints.get('thumb-metacarpal' as XRHandJoint) || null,
        phalanxProximal: joints.get('thumb-phalanx-proximal' as XRHandJoint) || null,
        phalanxDistal: joints.get('thumb-phalanx-distal' as XRHandJoint) || null
      },
      index: {
        tip: joints.get('index-finger-tip' as XRHandJoint) || null,
        metacarpal: joints.get('index-finger-metacarpal' as XRHandJoint) || null,
        phalanxProximal: joints.get('index-finger-phalanx-proximal' as XRHandJoint) || null,
        phalanxIntermediate: joints.get('index-finger-phalanx-intermediate' as XRHandJoint) || null,
        phalanxDistal: joints.get('index-finger-phalanx-distal' as XRHandJoint) || null
      },
      middle: {
        tip: joints.get('middle-finger-tip' as XRHandJoint) || null,
        metacarpal: joints.get('middle-finger-metacarpal' as XRHandJoint) || null,
        phalanxProximal: joints.get('middle-finger-phalanx-proximal' as XRHandJoint) || null,
        phalanxIntermediate: joints.get('middle-finger-phalanx-intermediate' as XRHandJoint) || null,
        phalanxDistal: joints.get('middle-finger-phalanx-distal' as XRHandJoint) || null
      },
      ring: {
        tip: joints.get('ring-finger-tip' as XRHandJoint) || null,
        metacarpal: joints.get('ring-finger-metacarpal' as XRHandJoint) || null,
        phalanxProximal: joints.get('ring-finger-phalanx-proximal' as XRHandJoint) || null,
        phalanxIntermediate: joints.get('ring-finger-phalanx-intermediate' as XRHandJoint) || null,
        phalanxDistal: joints.get('ring-finger-phalanx-distal' as XRHandJoint) || null
      },
      pinky: {
        tip: joints.get('pinky-finger-tip' as XRHandJoint) || null,
        metacarpal: joints.get('pinky-finger-metacarpal' as XRHandJoint) || null,
        phalanxProximal: joints.get('pinky-finger-phalanx-proximal' as XRHandJoint) || null,
        phalanxIntermediate: joints.get('pinky-finger-phalanx-intermediate' as XRHandJoint) || null,
        phalanxDistal: joints.get('pinky-finger-phalanx-distal' as XRHandJoint) || null
      }
    };

    this.hands.set(source, handState);
  }

  /**
   * Detects pinch gesture
   *
   * @param hand - Hand state
   * @returns Pinch gesture information
   */
  detectPinch(hand: HandState): PinchGesture {
    const thumbTip = hand.thumb.tip;
    const indexTip = hand.index.tip;

    if (!thumbTip || !indexTip) {
      return {
        isPinching: false,
        strength: 0,
        distance: Infinity,
        position: null
      };
    }

    const distance = this.distance(thumbTip.position, indexTip.position);
    const threshold = this.PINCH_THRESHOLD;
    const releaseThreshold = this.PINCH_RELEASE_THRESHOLD;

    const isPinching = distance < threshold;
    const strength = Math.max(0, 1 - distance / releaseThreshold);

    const position = isPinching ? this.midpoint(thumbTip.position, indexTip.position) : null;

    return {
      isPinching,
      strength,
      distance,
      position
    };
  }

  /**
   * Detects point gesture
   *
   * @param hand - Hand state
   * @returns Point gesture information
   */
  detectPoint(hand: HandState): PointGesture {
    const indexTip = hand.index.tip;
    const indexProximal = hand.index.phalanxProximal;
    const middleTip = hand.middle.tip;
    const ringTip = hand.ring.tip;
    const pinkyTip = hand.pinky.tip;

    if (!indexTip || !indexProximal || !middleTip || !ringTip || !pinkyTip) {
      return {
        isPointing: false,
        direction: null,
        origin: null,
        confidence: 0
      };
    }

    // Check if other fingers are curled
    const wrist = hand.wrist;
    if (!wrist) {
      return {
        isPointing: false,
        direction: null,
        origin: null,
        confidence: 0
      };
    }

    const middleCurl = this.fingerCurl(hand.middle, wrist.position);
    const ringCurl = this.fingerCurl(hand.ring, wrist.position);
    const pinkyCurl = this.fingerCurl(hand.pinky, wrist.position);

    const isPointing =
      middleCurl > this.POINT_CURL_THRESHOLD &&
      ringCurl > this.POINT_CURL_THRESHOLD &&
      pinkyCurl > this.POINT_CURL_THRESHOLD;

    if (!isPointing) {
      return {
        isPointing: false,
        direction: null,
        origin: null,
        confidence: 0
      };
    }

    const direction = this.normalize(this.subtract(indexTip.position, indexProximal.position));
    const confidence = (middleCurl + ringCurl + pinkyCurl) / 3;

    return {
      isPointing: true,
      direction,
      origin: indexProximal.position,
      confidence
    };
  }

  /**
   * Triggers haptic feedback on a controller
   *
   * @param source - Input source
   * @param duration - Duration in milliseconds
   * @param intensity - Intensity (0-1)
   */
  triggerHaptic(source: XRInputSource, duration: number, intensity: number): void {
    if (!source.gamepad || !source.gamepad.hapticActuators) return;

    const actuators = source.gamepad.hapticActuators;
    if (actuators.length === 0) return;

    actuators[0].pulse(intensity, duration);
  }

  /**
   * Gets all active controllers
   *
   * @returns Array of controller states
   */
  getControllers(): ControllerState[] {
    return Array.from(this.controllers.values());
  }

  /**
   * Gets controller by handedness
   *
   * @param handedness - Left or right hand
   * @returns Controller state or null
   */
  getController(handedness: XRHandedness): ControllerState | null {
    for (const state of this.controllers.values()) {
      if (state.handedness === handedness) {
        return state;
      }
    }
    return null;
  }

  /**
   * Gets all active hands
   *
   * @returns Array of hand states
   */
  getHands(): HandState[] {
    return Array.from(this.hands.values());
  }

  /**
   * Gets hand by handedness
   *
   * @param handedness - Left or right hand
   * @returns Hand state or null
   */
  getHand(handedness: XRHandedness): HandState | null {
    for (const state of this.hands.values()) {
      if (state.handedness === handedness) {
        return state;
      }
    }
    return null;
  }

  /**
   * Clones controller state for comparison
   *
   * @param state - Controller state
   * @returns Cloned state
   */
  private cloneControllerState(state: ControllerState): ControllerState {
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * Converts DOMPointReadOnly to Vector3
   *
   * @param point - DOM point
   * @returns Vector3
   */
  private transformToVector3(point: DOMPointReadOnly): Vector3 {
    return { x: point.x, y: point.y, z: point.z } as Vector3;
  }

  /**
   * Converts DOMPointReadOnly to Quaternion
   *
   * @param point - DOM point
   * @returns Quaternion
   */
  private transformToQuaternion(point: DOMPointReadOnly): Quaternion {
    return { x: point.x, y: point.y, z: point.z, w: point.w } as Quaternion;
  }

  /**
   * Calculates distance between two points
   *
   * @param a - First point
   * @param b - Second point
   * @returns Distance
   */
  private distance(a: Vector3, b: Vector3): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Calculates midpoint between two points
   *
   * @param a - First point
   * @param b - Second point
   * @returns Midpoint
   */
  private midpoint(a: Vector3, b: Vector3): Vector3 {
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      z: (a.z + b.z) / 2
    } as Vector3;
  }

  /**
   * Subtracts two vectors
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns Result vector
   */
  private subtract(a: Vector3, b: Vector3): Vector3 {
    return {
      x: a.x - b.x,
      y: a.y - b.y,
      z: a.z - b.z
    } as Vector3;
  }

  /**
   * Normalizes a vector
   *
   * @param v - Vector to normalize
   * @returns Normalized vector
   */
  private normalize(v: Vector3): Vector3 {
    const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (length === 0) return { x: 0, y: 0, z: 0 } as Vector3;

    return {
      x: v.x / length,
      y: v.y / length,
      z: v.z / length
    } as Vector3;
  }

  /**
   * Calculates finger curl amount
   *
   * @param finger - Finger joints
   * @param wrist - Wrist position
   * @returns Curl amount (0-1)
   */
  private fingerCurl(finger: HandState['middle'], wrist: Vector3): number {
    if (!finger.tip || !finger.metacarpal) return 0;

    const tipToWrist = this.distance(finger.tip.position, wrist);
    const metacarpalToWrist = this.distance(finger.metacarpal.position, wrist);

    // Ratio < 1 means finger is extended, > 1 means curled
    const ratio = tipToWrist / metacarpalToWrist;

    // Convert to 0-1 range where 1 is fully curled
    return Math.max(0, Math.min(1, 1.5 - ratio));
  }
}
