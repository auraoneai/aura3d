/**
 * G3D 5.0 Examples - Orbit Camera Controls
 * Provides mouse/touch-based camera orbit controls
 */

export interface OrbitControlsConfig {
  canvas: HTMLCanvasElement;
  target?: { x: number; y: number; z: number };
  distance?: number;
  minDistance?: number;
  maxDistance?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  rotateSpeed?: number;
  zoomSpeed?: number;
  panSpeed?: number;
  dampingFactor?: number;
  enableDamping?: boolean;
  enablePan?: boolean;
  enableZoom?: boolean;
  enableRotate?: boolean;
}

/**
 * Orbit camera controls for 3D scenes
 */
export class OrbitControls {
  private canvas: HTMLCanvasElement;
  private target: { x: number; y: number; z: number };
  private distance: number;
  private minDistance: number;
  private maxDistance: number;
  private minPolarAngle: number;
  private maxPolarAngle: number;
  private rotateSpeed: number;
  private zoomSpeed: number;
  private panSpeed: number;
  private dampingFactor: number;
  private enableDamping: boolean;
  private enablePan: boolean;
  private enableZoom: boolean;
  private enableRotate: boolean;

  // Spherical coordinates
  private theta: number = 0; // Azimuthal angle
  private phi: number = Math.PI / 2; // Polar angle
  private targetTheta: number = 0;
  private targetPhi: number = Math.PI / 2;
  private targetDistance: number;

  // Mouse state
  private isRotating: boolean = false;
  private isPanning: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  // Touch state
  private touchStartDistance: number = 0;

  constructor(config: OrbitControlsConfig) {
    this.canvas = config.canvas;
    this.target = config.target || { x: 0, y: 0, z: 0 };
    this.distance = config.distance || 10;
    this.minDistance = config.minDistance || 1;
    this.maxDistance = config.maxDistance || 100;
    this.minPolarAngle = config.minPolarAngle || 0.1;
    this.maxPolarAngle = config.maxPolarAngle || Math.PI - 0.1;
    this.rotateSpeed = config.rotateSpeed || 1.0;
    this.zoomSpeed = config.zoomSpeed || 1.0;
    this.panSpeed = config.panSpeed || 1.0;
    this.dampingFactor = config.dampingFactor || 0.1;
    this.enableDamping = config.enableDamping !== false;
    this.enablePan = config.enablePan !== false;
    this.enableZoom = config.enableZoom !== false;
    this.enableRotate = config.enableRotate !== false;

    this.targetDistance = this.distance;

    this.setupEventListeners();
  }

  /**
   * Sets up mouse and touch event listeners
   */
  private setupEventListeners(): void {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.onMouseUp());
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    this.canvas.addEventListener('touchend', () => this.onTouchEnd());

    // Context menu
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Mouse down handler
   */
  private onMouseDown(event: MouseEvent): void {
    if (event.button === 0 && this.enableRotate) {
      this.isRotating = true;
    } else if (event.button === 2 && this.enablePan) {
      this.isPanning = true;
    }

    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
  }

  /**
   * Mouse move handler
   */
  private onMouseMove(event: MouseEvent): void {
    const deltaX = event.clientX - this.lastMouseX;
    const deltaY = event.clientY - this.lastMouseY;

    if (this.isRotating) {
      this.rotate(deltaX, deltaY);
    } else if (this.isPanning) {
      this.pan(deltaX, deltaY);
    }

    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
  }

  /**
   * Mouse up handler
   */
  private onMouseUp(): void {
    this.isRotating = false;
    this.isPanning = false;
  }

  /**
   * Mouse wheel handler for zoom
   */
  private onWheel(event: WheelEvent): void {
    if (!this.enableZoom) return;

    event.preventDefault();

    const delta = event.deltaY;
    this.zoom(delta > 0 ? 1 : -1);
  }

  /**
   * Touch start handler
   */
  private onTouchStart(event: TouchEvent): void {
    event.preventDefault();

    if (event.touches.length === 1 && this.enableRotate) {
      this.isRotating = true;
      this.lastMouseX = event.touches[0].clientX;
      this.lastMouseY = event.touches[0].clientY;
    } else if (event.touches.length === 2 && this.enableZoom) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      this.touchStartDistance = Math.sqrt(dx * dx + dy * dy);
    }
  }

  /**
   * Touch move handler
   */
  private onTouchMove(event: TouchEvent): void {
    event.preventDefault();

    if (event.touches.length === 1 && this.isRotating) {
      const deltaX = event.touches[0].clientX - this.lastMouseX;
      const deltaY = event.touches[0].clientY - this.lastMouseY;
      this.rotate(deltaX, deltaY);
      this.lastMouseX = event.touches[0].clientX;
      this.lastMouseY = event.touches[0].clientY;
    } else if (event.touches.length === 2 && this.enableZoom) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const delta = this.touchStartDistance - distance;
      this.zoom(delta > 0 ? 1 : -1);
      this.touchStartDistance = distance;
    }
  }

  /**
   * Touch end handler
   */
  private onTouchEnd(): void {
    this.isRotating = false;
    this.touchStartDistance = 0;
  }

  /**
   * Rotates the camera
   */
  private rotate(deltaX: number, deltaY: number): void {
    this.targetTheta -= (deltaX * this.rotateSpeed * Math.PI) / this.canvas.width;
    this.targetPhi -= (deltaY * this.rotateSpeed * Math.PI) / this.canvas.height;

    // Clamp polar angle
    this.targetPhi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this.targetPhi));
  }

  /**
   * Pans the camera
   */
  private pan(deltaX: number, deltaY: number): void {
    const factor = (this.distance * this.panSpeed) / this.canvas.height;

    // Calculate right and up vectors in world space
    const sinTheta = Math.sin(this.theta);
    const cosTheta = Math.cos(this.theta);
    const sinPhi = Math.sin(this.phi);
    const cosPhi = Math.cos(this.phi);

    // Right vector
    const rightX = -cosTheta;
    const rightZ = sinTheta;

    // Up vector (approximation)
    const upX = -sinTheta * cosPhi;
    const upY = sinPhi;
    const upZ = -cosTheta * cosPhi;

    // Update target
    this.target.x += (rightX * deltaX - upX * deltaY) * factor;
    this.target.y += -upY * deltaY * factor;
    this.target.z += (rightZ * deltaX - upZ * deltaY) * factor;
  }

  /**
   * Zooms the camera
   */
  private zoom(delta: number): void {
    const scale = Math.pow(0.95, this.zoomSpeed);
    this.targetDistance *= delta > 0 ? scale : 1 / scale;
    this.targetDistance = Math.max(this.minDistance, Math.min(this.maxDistance, this.targetDistance));
  }

  /**
   * Updates camera position with damping
   */
  update(): void {
    if (this.enableDamping) {
      // Smooth damping
      this.theta += (this.targetTheta - this.theta) * this.dampingFactor;
      this.phi += (this.targetPhi - this.phi) * this.dampingFactor;
      this.distance += (this.targetDistance - this.distance) * this.dampingFactor;
    } else {
      // Instant update
      this.theta = this.targetTheta;
      this.phi = this.targetPhi;
      this.distance = this.targetDistance;
    }
  }

  /**
   * Gets camera position in Cartesian coordinates
   */
  getPosition(): { x: number; y: number; z: number } {
    const sinPhi = Math.sin(this.phi);
    const cosPhi = Math.cos(this.phi);
    const sinTheta = Math.sin(this.theta);
    const cosTheta = Math.cos(this.theta);

    return {
      x: this.target.x + this.distance * sinPhi * sinTheta,
      y: this.target.y + this.distance * cosPhi,
      z: this.target.z + this.distance * sinPhi * cosTheta,
    };
  }

  /**
   * Gets camera target
   */
  getTarget(): { x: number; y: number; z: number } {
    return { ...this.target };
  }

  /**
   * Sets camera target
   */
  setTarget(x: number, y: number, z: number): void {
    this.target.x = x;
    this.target.y = y;
    this.target.z = z;
  }

  /**
   * Sets camera distance
   */
  setDistance(distance: number): void {
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, distance));
    this.targetDistance = this.distance;
  }

  /**
   * Sets camera angles
   */
  setAngles(theta: number, phi: number): void {
    this.theta = theta;
    this.targetTheta = theta;
    this.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, phi));
    this.targetPhi = this.phi;
  }

  /**
   * Resets camera to initial position
   */
  reset(): void {
    this.theta = 0;
    this.phi = Math.PI / 2;
    this.targetTheta = 0;
    this.targetPhi = Math.PI / 2;
    this.distance = 10;
    this.targetDistance = 10;
    this.target = { x: 0, y: 0, z: 0 };
  }

  /**
   * Enables or disables controls
   */
  setEnabled(enabled: boolean): void {
    this.enableRotate = enabled;
    this.enableZoom = enabled;
    this.enablePan = enabled;
  }

  /**
   * Destroys the controls
   */
  destroy(): void {
    // Event listeners are automatically removed when canvas is destroyed
  }
}
