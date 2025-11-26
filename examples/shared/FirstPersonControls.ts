/**
 * G3D 5.0 Examples - First Person Camera Controls
 * Provides WASD movement and mouse look controls
 */

export interface FirstPersonControlsConfig {
  canvas: HTMLCanvasElement;
  moveSpeed?: number;
  lookSpeed?: number;
  invertY?: boolean;
  enablePointerLock?: boolean;
}

/**
 * First person camera controls for FPS-style games
 */
export class FirstPersonControls {
  private canvas: HTMLCanvasElement;
  private moveSpeed: number;
  private lookSpeed: number;
  private invertY: boolean;
  private enablePointerLock: boolean;

  // Camera state
  private position: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private rotation: { yaw: number; pitch: number } = { yaw: 0, pitch: 0 };
  private velocity: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  // Input state
  private keys: Map<string, boolean> = new Map();
  private isPointerLocked: boolean = false;

  // Movement directions
  private forward: boolean = false;
  private backward: boolean = false;
  private left: boolean = false;
  private right: boolean = false;
  private up: boolean = false;
  private down: boolean = false;

  constructor(config: FirstPersonControlsConfig) {
    this.canvas = config.canvas;
    this.moveSpeed = config.moveSpeed || 5.0;
    this.lookSpeed = config.lookSpeed || 0.002;
    this.invertY = config.invertY || false;
    this.enablePointerLock = config.enablePointerLock !== false;

    this.setupEventListeners();
  }

  /**
   * Sets up keyboard and mouse event listeners
   */
  private setupEventListeners(): void {
    // Keyboard events
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Mouse events
    if (this.enablePointerLock) {
      this.canvas.addEventListener('click', () => this.requestPointerLock());
      document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
      document.addEventListener('pointerlockerror', () => this.onPointerLockError());
    }

    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
  }

  /**
   * Requests pointer lock on canvas
   */
  private async requestPointerLock(): Promise<void> {
    if (!this.enablePointerLock) return;

    try {
      await this.canvas.requestPointerLock();
    } catch (error) {
      console.warn('Pointer lock request failed:', error);
    }
  }

  /**
   * Pointer lock change handler
   */
  private onPointerLockChange(): void {
    this.isPointerLocked = document.pointerLockElement === this.canvas;
  }

  /**
   * Pointer lock error handler
   */
  private onPointerLockError(): void {
    console.error('Pointer lock error');
    this.isPointerLocked = false;
  }

  /**
   * Key down handler
   */
  private onKeyDown(event: KeyboardEvent): void {
    this.keys.set(event.code, true);

    // Update movement flags
    this.forward = this.keys.get('KeyW') || this.keys.get('ArrowUp') || false;
    this.backward = this.keys.get('KeyS') || this.keys.get('ArrowDown') || false;
    this.left = this.keys.get('KeyA') || this.keys.get('ArrowLeft') || false;
    this.right = this.keys.get('KeyD') || this.keys.get('ArrowRight') || false;
    this.up = this.keys.get('Space') || false;
    this.down = this.keys.get('ShiftLeft') || this.keys.get('ShiftRight') || false;

    // Exit pointer lock with Escape
    if (event.code === 'Escape' && this.isPointerLocked) {
      document.exitPointerLock();
    }
  }

  /**
   * Key up handler
   */
  private onKeyUp(event: KeyboardEvent): void {
    this.keys.set(event.code, false);

    // Update movement flags
    this.forward = this.keys.get('KeyW') || this.keys.get('ArrowUp') || false;
    this.backward = this.keys.get('KeyS') || this.keys.get('ArrowDown') || false;
    this.left = this.keys.get('KeyA') || this.keys.get('ArrowLeft') || false;
    this.right = this.keys.get('KeyD') || this.keys.get('ArrowRight') || false;
    this.up = this.keys.get('Space') || false;
    this.down = this.keys.get('ShiftLeft') || this.keys.get('ShiftRight') || false;
  }

  /**
   * Mouse move handler for look controls
   */
  private onMouseMove(event: MouseEvent): void {
    if (!this.isPointerLocked && this.enablePointerLock) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    this.rotation.yaw -= movementX * this.lookSpeed;
    this.rotation.pitch -= movementY * this.lookSpeed * (this.invertY ? -1 : 1);

    // Clamp pitch to prevent camera flipping
    const maxPitch = Math.PI / 2 - 0.01;
    this.rotation.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.rotation.pitch));
  }

  /**
   * Updates camera position based on input
   */
  update(deltaTime: number): void {
    const dt = Math.min(deltaTime, 0.1); // Cap delta time to prevent large jumps

    // Calculate movement direction
    const moveX = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    const moveZ = (this.backward ? 1 : 0) - (this.forward ? 1 : 0);
    const moveY = (this.up ? 1 : 0) - (this.down ? 1 : 0);

    // Normalize movement vector
    const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
    const normalizedX = length > 0 ? moveX / length : 0;
    const normalizedZ = length > 0 ? moveZ / length : 0;

    // Calculate forward and right vectors based on yaw
    const yaw = this.rotation.yaw;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    // Calculate velocity
    const speed = this.moveSpeed * dt;
    this.velocity.x = (forwardX * normalizedZ + rightX * normalizedX) * speed;
    this.velocity.y = moveY * speed;
    this.velocity.z = (forwardZ * normalizedZ + rightZ * normalizedX) * speed;

    // Update position
    this.position.x += this.velocity.x;
    this.position.y += this.velocity.y;
    this.position.z += this.velocity.z;
  }

  /**
   * Gets camera position
   */
  getPosition(): { x: number; y: number; z: number } {
    return { ...this.position };
  }

  /**
   * Gets camera rotation (yaw and pitch in radians)
   */
  getRotation(): { yaw: number; pitch: number } {
    return { ...this.rotation };
  }

  /**
   * Gets forward direction vector
   */
  getForwardVector(): { x: number; y: number; z: number } {
    const yaw = this.rotation.yaw;
    const pitch = this.rotation.pitch;

    return {
      x: -Math.sin(yaw) * Math.cos(pitch),
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * Math.cos(pitch),
    };
  }

  /**
   * Gets right direction vector
   */
  getRightVector(): { x: number; y: number; z: number } {
    const yaw = this.rotation.yaw;

    return {
      x: Math.cos(yaw),
      y: 0,
      z: -Math.sin(yaw),
    };
  }

  /**
   * Gets up direction vector
   */
  getUpVector(): { x: number; y: number; z: number } {
    const yaw = this.rotation.yaw;
    const pitch = this.rotation.pitch;

    return {
      x: Math.sin(yaw) * Math.sin(pitch),
      y: Math.cos(pitch),
      z: Math.cos(yaw) * Math.sin(pitch),
    };
  }

  /**
   * Sets camera position
   */
  setPosition(x: number, y: number, z: number): void {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
  }

  /**
   * Sets camera rotation
   */
  setRotation(yaw: number, pitch: number): void {
    this.rotation.yaw = yaw;
    this.rotation.pitch = pitch;
  }

  /**
   * Sets move speed
   */
  setMoveSpeed(speed: number): void {
    this.moveSpeed = speed;
  }

  /**
   * Sets look speed (mouse sensitivity)
   */
  setLookSpeed(speed: number): void {
    this.lookSpeed = speed;
  }

  /**
   * Checks if pointer is locked
   */
  getIsPointerLocked(): boolean {
    return this.isPointerLocked;
  }

  /**
   * Exits pointer lock
   */
  exitPointerLock(): void {
    if (this.isPointerLocked) {
      document.exitPointerLock();
    }
  }

  /**
   * Checks if any movement key is pressed
   */
  isMoving(): boolean {
    return this.forward || this.backward || this.left || this.right || this.up || this.down;
  }

  /**
   * Resets controls to default state
   */
  reset(): void {
    this.position = { x: 0, y: 0, z: 0 };
    this.rotation = { yaw: 0, pitch: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.keys.clear();
    this.forward = false;
    this.backward = false;
    this.left = false;
    this.right = false;
    this.up = false;
    this.down = false;
  }

  /**
   * Destroys the controls
   */
  destroy(): void {
    if (this.isPointerLocked) {
      document.exitPointerLock();
    }
  }
}
