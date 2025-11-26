/**
 * G3D Architectural Visualization - Camera Controller
 * Multiple camera modes for architectural exploration
 */

import { Vector3, Quaternion } from 'g3d';

export type CameraMode = 'orbit' | 'flythrough' | 'walkthrough' | 'cinematic';

export interface CameraPreset {
  name: string;
  position: Vector3;
  target: Vector3;
  fov: number;
  description: string;
}

export interface CinematicKeyframe {
  time: number;
  position: Vector3;
  target: Vector3;
  fov: number;
}

/**
 * Advanced camera controller for architectural visualization
 */
export class CameraController {
  private mode: CameraMode = 'orbit';

  // Camera state
  private position: Vector3 = new Vector3(10, 5, 10);
  private target: Vector3 = new Vector3(0, 1, 0);
  private up: Vector3 = new Vector3(0, 1, 0);
  private fov: number = 60;

  // Orbit mode
  private orbitRadius: number = 15;
  private orbitAzimuth: number = 45; // degrees
  private orbitElevation: number = 30; // degrees
  private orbitSpeed: number = 0.5;
  private orbitDamping: number = 0.85;

  // Flythrough mode
  private flythroughSpeed: number = 5.0;
  private flythroughAcceleration: number = 2.0;
  private flythroughVelocity: Vector3 = new Vector3();

  // Walkthrough mode
  private walkthroughHeight: number = 1.7; // Eye height in meters
  private walkthroughSpeed: number = 3.0;
  private walkthroughRunMultiplier: number = 2.0;
  private walkthroughHeadBob: boolean = true;
  private walkthroughBobPhase: number = 0;

  // Cinematic mode
  private cinematicKeyframes: CinematicKeyframe[] = [];
  private cinematicTime: number = 0;
  private cinematicDuration: number = 10;
  private cinematicPlaying: boolean = false;

  // Input state
  private mouseDown: boolean = false;
  private mouseDelta: Vector3 = new Vector3();
  private keyState: Map<string, boolean> = new Map();

  // Camera presets
  private presets: Map<string, CameraPreset> = new Map();

  constructor() {
    this.initializePresets();
    this.initializeCinematicPath();
  }

  /**
   * Initialize camera presets for common views
   */
  private initializePresets(): void {
    this.presets.set('exterior_front', {
      name: 'Exterior - Front View',
      position: new Vector3(0, 2, 20),
      target: new Vector3(0, 2, 0),
      fov: 60,
      description: 'Front elevation view of the building',
    });

    this.presets.set('exterior_aerial', {
      name: 'Exterior - Aerial View',
      position: new Vector3(15, 15, 15),
      target: new Vector3(0, 0, 0),
      fov: 70,
      description: 'Bird\'s eye view showing overall layout',
    });

    this.presets.set('exterior_corner', {
      name: 'Exterior - Corner View',
      position: new Vector3(12, 3, 12),
      target: new Vector3(0, 2, 0),
      fov: 55,
      description: 'Three-quarter view highlighting depth',
    });

    this.presets.set('interior_living', {
      name: 'Interior - Living Room',
      position: new Vector3(2, 1.7, 5),
      target: new Vector3(0, 1.5, 0),
      fov: 75,
      description: 'Living room with natural field of view',
    });

    this.presets.set('interior_kitchen', {
      name: 'Interior - Kitchen',
      position: new Vector3(-4, 1.7, 2),
      target: new Vector3(-2, 1.5, 0),
      fov: 70,
      description: 'Kitchen workspace view',
    });

    this.presets.set('interior_bedroom', {
      name: 'Interior - Bedroom',
      position: new Vector3(5, 1.7, 2),
      target: new Vector3(4, 1.5, -1),
      fov: 65,
      description: 'Bedroom overview',
    });

    this.presets.set('detail_materials', {
      name: 'Detail - Materials',
      position: new Vector3(1, 1.2, 3),
      target: new Vector3(0, 1, 0),
      fov: 45,
      description: 'Close-up of material details',
    });

    this.presets.set('hero_shot', {
      name: 'Hero Shot',
      position: new Vector3(8, 4, 14),
      target: new Vector3(0, 2, 0),
      fov: 50,
      description: 'Professional marketing shot',
    });
  }

  /**
   * Initialize cinematic camera path
   */
  private initializeCinematicPath(): void {
    this.cinematicKeyframes = [
      {
        time: 0,
        position: new Vector3(20, 10, 20),
        target: new Vector3(0, 0, 0),
        fov: 60,
      },
      {
        time: 2,
        position: new Vector3(15, 5, 15),
        target: new Vector3(0, 2, 0),
        fov: 55,
      },
      {
        time: 4,
        position: new Vector3(8, 2, 12),
        target: new Vector3(0, 2, 0),
        fov: 60,
      },
      {
        time: 6,
        position: new Vector3(2, 1.7, 5),
        target: new Vector3(0, 1.5, 0),
        fov: 70,
      },
      {
        time: 8,
        position: new Vector3(-3, 1.7, 2),
        target: new Vector3(0, 1.5, 0),
        fov: 75,
      },
      {
        time: 10,
        position: new Vector3(5, 1.7, -3),
        target: new Vector3(0, 1.5, 0),
        fov: 70,
      },
    ];
    this.cinematicDuration = 10;
  }

  /**
   * Update camera for current frame
   */
  update(deltaTime: number): void {
    switch (this.mode) {
      case 'orbit':
        this.updateOrbitMode(deltaTime);
        break;
      case 'flythrough':
        this.updateFlythroughMode(deltaTime);
        break;
      case 'walkthrough':
        this.updateWalkthroughMode(deltaTime);
        break;
      case 'cinematic':
        this.updateCinematicMode(deltaTime);
        break;
    }
  }

  /**
   * Update orbit camera mode
   */
  private updateOrbitMode(deltaTime: number): void {
    // Apply mouse input
    this.orbitAzimuth += this.mouseDelta.x * this.orbitSpeed;
    this.orbitElevation = Math.max(-89, Math.min(89,
      this.orbitElevation + this.mouseDelta.y * this.orbitSpeed));

    // Apply damping to mouse delta
    this.mouseDelta.multiplyScalar(this.orbitDamping);

    // Handle zoom with mouse wheel or keys
    if (this.keyState.get('Equal')) this.orbitRadius *= 0.98;
    if (this.keyState.get('Minus')) this.orbitRadius *= 1.02;
    this.orbitRadius = Math.max(2, Math.min(50, this.orbitRadius));

    // Calculate position from spherical coordinates
    const azimuthRad = this.orbitAzimuth * Math.PI / 180;
    const elevationRad = this.orbitElevation * Math.PI / 180;

    this.position.set(
      this.target.x + this.orbitRadius * Math.cos(elevationRad) * Math.sin(azimuthRad),
      this.target.y + this.orbitRadius * Math.sin(elevationRad),
      this.target.z + this.orbitRadius * Math.cos(elevationRad) * Math.cos(azimuthRad)
    );
  }

  /**
   * Update flythrough camera mode
   */
  private updateFlythroughMode(deltaTime: number): void {
    const forward = this.getForwardVector();
    const right = this.getRightVector();
    const up = new Vector3(0, 1, 0);

    const acceleration = new Vector3();

    // WASD movement
    if (this.keyState.get('KeyW')) acceleration.add(forward);
    if (this.keyState.get('KeyS')) acceleration.add(forward.clone().negate());
    if (this.keyState.get('KeyA')) acceleration.add(right.clone().negate());
    if (this.keyState.get('KeyD')) acceleration.add(right);
    if (this.keyState.get('KeyQ')) acceleration.add(up.clone().negate());
    if (this.keyState.get('KeyE')) acceleration.add(up);

    // Apply acceleration
    if (acceleration.length() > 0) {
      acceleration.normalize().multiplyScalar(this.flythroughAcceleration);
      this.flythroughVelocity.add(acceleration.multiplyScalar(deltaTime));
    }

    // Apply velocity with damping
    this.position.add(this.flythroughVelocity.clone().multiplyScalar(deltaTime));
    this.flythroughVelocity.multiplyScalar(0.9);

    // Update target based on mouse
    const lookDelta = this.mouseDelta.clone().multiplyScalar(0.1);
    const direction = this.target.clone().sub(this.position);
    const currentDistance = direction.length();

    // Rotate direction
    const yaw = Quaternion.fromAxisAngle(new Vector3(0, 1, 0), -lookDelta.x * Math.PI / 180);
    const pitchAxis = this.getRightVector();
    const pitch = Quaternion.fromAxisAngle(pitchAxis, -lookDelta.y * Math.PI / 180);

    direction.applyQuaternion(yaw).applyQuaternion(pitch);
    this.target = this.position.clone().add(direction.normalize().multiplyScalar(currentDistance));

    this.mouseDelta.multiplyScalar(0.85);
  }

  /**
   * Update walkthrough camera mode
   */
  private updateWalkthroughMode(deltaTime: number): void {
    const forward = this.getForwardVector();
    forward.y = 0; // Keep movement horizontal
    forward.normalize();

    const right = this.getRightVector();
    right.y = 0;
    right.normalize();

    const movement = new Vector3();
    let isMoving = false;

    // Determine speed multiplier
    const speedMultiplier = this.keyState.get('ShiftLeft') ?
      this.walkthroughRunMultiplier : 1.0;

    // WASD movement
    if (this.keyState.get('KeyW')) {
      movement.add(forward);
      isMoving = true;
    }
    if (this.keyState.get('KeyS')) {
      movement.add(forward.clone().negate());
      isMoving = true;
    }
    if (this.keyState.get('KeyA')) {
      movement.add(right.clone().negate());
      isMoving = true;
    }
    if (this.keyState.get('KeyD')) {
      movement.add(right);
      isMoving = true;
    }

    // Apply movement
    if (movement.length() > 0) {
      movement.normalize().multiplyScalar(
        this.walkthroughSpeed * speedMultiplier * deltaTime
      );
      this.position.add(movement);
      this.target.add(movement);
    }

    // Maintain eye height
    this.position.y = this.walkthroughHeight;

    // Head bob effect
    if (this.walkthroughHeadBob && isMoving) {
      this.walkthroughBobPhase += deltaTime * 10 * speedMultiplier;
      const bobAmount = Math.sin(this.walkthroughBobPhase) * 0.05;
      this.position.y += bobAmount;
    } else {
      this.walkthroughBobPhase = 0;
    }

    // Mouse look
    const lookDelta = this.mouseDelta.clone().multiplyScalar(0.15);
    const direction = this.target.clone().sub(this.position);

    // Yaw (horizontal rotation)
    const yaw = Quaternion.fromAxisAngle(new Vector3(0, 1, 0), -lookDelta.x * Math.PI / 180);
    direction.applyQuaternion(yaw);

    // Pitch (vertical rotation) - limited to prevent disorientation
    const pitchAngle = -lookDelta.y * Math.PI / 180;
    const currentPitch = Math.asin(direction.y / direction.length());
    const newPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, currentPitch + pitchAngle));

    const pitchAxis = this.getRightVector();
    const pitch = Quaternion.fromAxisAngle(pitchAxis, newPitch - currentPitch);
    direction.applyQuaternion(pitch);

    this.target = this.position.clone().add(direction);
    this.mouseDelta.multiplyScalar(0.8);
  }

  /**
   * Update cinematic camera mode
   */
  private updateCinematicMode(deltaTime: number): void {
    if (!this.cinematicPlaying) return;

    this.cinematicTime += deltaTime;

    // Loop or stop at end
    if (this.cinematicTime >= this.cinematicDuration) {
      this.cinematicTime = 0; // Loop
    }

    // Find keyframes to interpolate between
    let prevKeyframe = this.cinematicKeyframes[0];
    let nextKeyframe = this.cinematicKeyframes[this.cinematicKeyframes.length - 1];

    for (let i = 0; i < this.cinematicKeyframes.length - 1; i++) {
      if (this.cinematicTime >= this.cinematicKeyframes[i].time &&
          this.cinematicTime < this.cinematicKeyframes[i + 1].time) {
        prevKeyframe = this.cinematicKeyframes[i];
        nextKeyframe = this.cinematicKeyframes[i + 1];
        break;
      }
    }

    // Interpolate
    const t = (this.cinematicTime - prevKeyframe.time) /
              (nextKeyframe.time - prevKeyframe.time);
    const smoothT = this.smoothStep(t);

    this.position = this.lerpVector3(prevKeyframe.position, nextKeyframe.position, smoothT);
    this.target = this.lerpVector3(prevKeyframe.target, nextKeyframe.target, smoothT);
    this.fov = prevKeyframe.fov + (nextKeyframe.fov - prevKeyframe.fov) * smoothT;
  }

  /**
   * Smooth interpolation
   */
  private smoothStep(t: number): number {
    return t * t * (3 - 2 * t);
  }

  /**
   * Linear interpolation between vectors
   */
  private lerpVector3(a: Vector3, b: Vector3, t: number): Vector3 {
    return new Vector3(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t
    );
  }

  /**
   * Get forward direction vector
   */
  private getForwardVector(): Vector3 {
    return this.target.clone().sub(this.position).normalize();
  }

  /**
   * Get right direction vector
   */
  private getRightVector(): Vector3 {
    const forward = this.getForwardVector();
    return forward.cross(this.up).normalize();
  }

  /**
   * Handle mouse input
   */
  handleMouseMove(deltaX: number, deltaY: number): void {
    if (this.mouseDown) {
      this.mouseDelta.set(deltaX, deltaY, 0);
    }
  }

  /**
   * Handle mouse button
   */
  handleMouseButton(isDown: boolean): void {
    this.mouseDown = isDown;
    if (!isDown) {
      this.mouseDelta.set(0, 0, 0);
    }
  }

  /**
   * Handle keyboard input
   */
  handleKeyboard(code: string, isDown: boolean): void {
    this.keyState.set(code, isDown);
  }

  /**
   * Set camera mode
   */
  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.mouseDelta.set(0, 0, 0);
    this.flythroughVelocity.set(0, 0, 0);
  }

  /**
   * Apply preset
   */
  applyPreset(presetName: string): void {
    const preset = this.presets.get(presetName);
    if (preset) {
      this.position = preset.position.clone();
      this.target = preset.target.clone();
      this.fov = preset.fov;

      // Update orbit parameters
      const direction = this.position.clone().sub(this.target);
      this.orbitRadius = direction.length();
      this.orbitAzimuth = Math.atan2(direction.x, direction.z) * 180 / Math.PI;
      this.orbitElevation = Math.asin(direction.y / this.orbitRadius) * 180 / Math.PI;
    }
  }

  /**
   * Capture screenshot data
   */
  captureScreenshot(): CameraPreset {
    return {
      name: 'Custom View',
      position: this.position.clone(),
      target: this.target.clone(),
      fov: this.fov,
      description: 'User-defined view',
    };
  }

  /**
   * Toggle cinematic playback
   */
  toggleCinematic(): void {
    this.cinematicPlaying = !this.cinematicPlaying;
    if (this.cinematicPlaying) {
      this.setMode('cinematic');
      this.cinematicTime = 0;
    }
  }

  /**
   * Get camera state
   */
  getCameraState() {
    return {
      mode: this.mode,
      position: this.position.clone(),
      target: this.target.clone(),
      up: this.up.clone(),
      fov: this.fov,
    };
  }

  /**
   * Get available presets
   */
  getPresets(): CameraPreset[] {
    return Array.from(this.presets.values());
  }
}
