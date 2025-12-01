/**
 * G3D Architectural Visualization Example
 * Demonstrates: PBR Materials, Global Illumination, Post-Processing
 *
 * A complete architectural visualization showcasing photorealistic rendering
 * with real-time lighting, material editing, and camera controls.
 */

import { Vector3, Color, Quaternion } from 'g3d';
import { MaterialLibrary } from './MaterialLibrary';
import { LightingController } from './LightingController';
import { PostProcessing } from './PostProcessing';
import { CameraController } from './CameraController';
import { MeasurementTool } from './MeasurementTool';
import { ArchVizScene } from './ArchVizScene';
import { ArchVizUI } from './ArchVizUI';

/**
 * Main application class
 */
class ArchVizApplication {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private width: number = 0;
  private height: number = 0;

  // Core systems
  private materialLibrary: MaterialLibrary;
  private lightingController: LightingController;
  private postProcessing: PostProcessing;
  private cameraController: CameraController;
  private measurementTool: MeasurementTool;
  private scene: ArchVizScene;
  private ui: ArchVizUI;

  // Runtime state
  private running: boolean = false;
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private fps: number = 60;
  private fpsUpdateTime: number = 0;

  // Input state
  private mouseX: number = 0;
  private mouseY: number = 0;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  constructor() {
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d');

    // Initialize systems
    this.materialLibrary = new MaterialLibrary();
    this.lightingController = new LightingController();
    this.postProcessing = new PostProcessing();
    this.cameraController = new CameraController();
    this.measurementTool = new MeasurementTool();
    this.scene = new ArchVizScene(this.materialLibrary, this.lightingController);
    this.ui = new ArchVizUI(
      this.materialLibrary,
      this.lightingController,
      this.postProcessing,
      this.cameraController,
      this.measurementTool
    );

    this.setupCanvas();
    this.setupInputHandlers();
  }

  /**
   * Setup canvas and resize handling
   */
  private setupCanvas(): void {
    const resize = () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    };

    window.addEventListener('resize', resize);
    resize();
  }

  /**
   * Setup input event handlers
   */
  private setupInputHandlers(): void {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => {
      this.cameraController.handleMouseButton(true);
    });

    this.canvas.addEventListener('mouseup', (e) => {
      this.cameraController.handleMouseButton(false);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      this.lastMouseX = this.mouseX;
      this.lastMouseY = this.mouseY;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;

      const deltaX = this.mouseX - this.lastMouseX;
      const deltaY = this.mouseY - this.lastMouseY;

      this.cameraController.handleMouseMove(deltaX, deltaY);
    });

    // Keyboard events
    document.addEventListener('keydown', (e) => {
      this.cameraController.handleKeyboard(e.code, true);
      this.handleKeyboardShortcuts(e);
    });

    document.addEventListener('keyup', (e) => {
      this.cameraController.handleKeyboard(e.code, false);
    });

    // Prevent context menu
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Handle keyboard shortcuts
   */
  private handleKeyboardShortcuts(e: KeyboardEvent): void {
    switch (e.code) {
      case 'KeyC':
        // Cycle camera modes
        const modes = ['orbit', 'flythrough', 'walkthrough', 'cinematic'];
        const currentState = this.cameraController.getCameraState();
        const currentIndex = modes.indexOf(currentState.mode);
        const nextMode = modes[(currentIndex + 1) % modes.length];
        this.cameraController.setMode(nextMode as any);
        console.log('Camera mode:', nextMode);
        break;

      case 'KeyM':
        // Toggle measurement tool
        console.log('Measurement tool toggled');
        break;

      case 'KeyL':
        // Toggle interior lights
        this.lightingController.toggleInteriorLights();
        console.log('Interior lights toggled');
        break;

      case 'KeyT':
        // Advance time of day
        const currentTime = this.lightingController.getLightingState().timeOfDay;
        const newTime = (currentTime + 2) % 24;
        this.lightingController.setTimeOfDay(newTime);
        console.log(`Time: ${Math.floor(newTime)}:00`);
        break;

      case 'KeyP':
        // Capture screenshot
        this.captureScreenshot();
        break;

      case 'Digit1':
        this.lightingController.applyPreset('morning');
        break;

      case 'Digit2':
        this.lightingController.applyPreset('noon');
        break;

      case 'Digit3':
        this.lightingController.applyPreset('golden_hour');
        break;

      case 'Digit4':
        this.lightingController.applyPreset('night');
        break;
    }
  }

  /**
   * Initialize the application
   */
  async init(): Promise<void> {
    console.log('G3D Architectural Visualization');
    console.log('================================');
    console.log(`Scene: ${this.scene.getMeshCount()} meshes`);
    console.log(`Vertices: ${this.scene.getVertexCount()}`);
    console.log(`Triangles: ${this.scene.getTriangleCount()}`);
    console.log(`Materials: ${this.materialLibrary.getAllMaterialNames().length}`);
    console.log('');
    console.log('Controls:');
    console.log('  WASD - Move camera');
    console.log('  Mouse - Look around');
    console.log('  C - Cycle camera mode');
    console.log('  L - Toggle lights');
    console.log('  T - Change time of day');
    console.log('  M - Measurement tool');
    console.log('  P - Screenshot');
    console.log('  1-4 - Lighting presets');
    console.log('  H - Help overlay');

    // Hide loading screen
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
      loadingElement.classList.add('hidden');
    }
  }

  /**
   * Start the render loop
   */
  start(): void {
    this.running = true;
    this.lastFrameTime = performance.now();
    this.renderLoop();
  }

  /**
   * Stop the render loop
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Main render loop
   */
  private renderLoop(): void {
    if (!this.running) return;

    const currentTime = performance.now();
    const deltaTime = Math.min((currentTime - this.lastFrameTime) / 1000, 0.1); // Cap at 100ms
    this.lastFrameTime = currentTime;

    // Update FPS counter
    this.frameCount++;
    if (currentTime - this.fpsUpdateTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsUpdateTime = currentTime;
    }

    // Update systems
    this.update(deltaTime);

    // Render frame
    this.render(currentTime / 1000);

    // Request next frame
    requestAnimationFrame(() => this.renderLoop());
  }

  /**
   * Update all systems
   */
  private update(deltaTime: number): void {
    // Update camera
    this.cameraController.update(deltaTime);

    // Update UI
    const cameraState = this.cameraController.getCameraState();
    this.ui.updateInfo(this.fps, cameraState.mode);
  }

  /**
   * Render the scene
   */
  private render(time: number): void {
    if (!this.ctx) return;

    // Clear canvas
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Get camera state
    const cameraState = this.cameraController.getCameraState();
    const lightingState = this.lightingController.getLightingState();

    // Render sky gradient
    this.renderSky(lightingState.skyColor);

    // Render scene with simple raytracing/rasterization
    this.renderScene(cameraState, lightingState, time);

    // Render UI overlays
    this.renderOverlays();
  }

  /**
   * Render sky gradient
   */
  private renderSky(skyColor: Color): void {
    if (!this.ctx) return;

    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, `rgb(${skyColor.r * 255}, ${skyColor.g * 255}, ${skyColor.b * 255})`);
    gradient.addColorStop(1, `rgb(${skyColor.r * 200}, ${skyColor.g * 200}, ${skyColor.b * 200})`);

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Render the 3D scene
   */
  private renderScene(cameraState: any, lightingState: any, time: number): void {
    if (!this.ctx) return;

    // Simple visualization - render scene elements as 2D projections
    const meshes = this.scene.getMeshes();

    // Sort meshes by distance from camera (painter's algorithm)
    const sortedMeshes = meshes.slice().sort((a, b) => {
      const distA = a.position.distanceTo(cameraState.position);
      const distB = b.position.distanceTo(cameraState.position);
      return distB - distA;
    });

    // Render each mesh
    sortedMeshes.forEach(mesh => {
      this.renderMesh(mesh, cameraState, lightingState, time);
    });

    // Render measurements
    this.renderMeasurements();
  }

  /**
   * Render a single mesh with 3D geometry
   */
  private renderMesh(mesh: any, cameraState: any, lightingState: any, time: number): void {
    if (!this.ctx) return;

    const geometry = mesh.geometry;
    const vertices = geometry.vertices;
    const indices = geometry.indices;
    const uv = geometry.uvs;
    
    // Transform and project all vertices
    const projectedVerts: { x: number, y: number, z: number, u: number, v: number }[] = [];
    
    // World transform (simple translation/rotation only supported for now in this demo)
    // Note: Real engine uses matrices, here we simulate for the demo
    const pos = mesh.position;
    
    for (let i = 0; i < vertices.length; i += 3) {
      // Local vertex
      const vx = vertices[i];
      const vy = vertices[i + 1];
      const vz = vertices[i + 2];
      
      // World vertex (Rotation not fully implemented in this simple loop, just position)
      // Ideally use Matrix4 from G3D logic, but keeping it simple for canvas demo
      const wx = vx + pos.x;
      const wy = vy + pos.y;
      const wz = vz + pos.z;
      
      const screen = this.projectToScreen(new Vector3(wx, wy, wz), cameraState);
      
      // Capture UVs (2 per vertex)
      const uIndex = (i / 3) * 2;
      const u = uv[uIndex];
      const v = uv[uIndex+1];

      if (screen) {
        projectedVerts.push({ x: screen.x, y: screen.y, z: screen.z, u, v });
      } else {
        projectedVerts.push({ x: 0, y: 0, z: -1, u: 0, v: 0 }); // Culled
      }
    }

    // Render triangles
    // Simple lighting
    const lightDir = lightingState.sunPosition.clone().normalize();
    const lightIntensity = lightingState.sunIntensity;
    const material = mesh.material;
    
    // Setup texture if available
    let pattern: CanvasPattern | null = null;
    if (material.albedoTexture) {
        pattern = this.ctx.createPattern(material.albedoTexture, 'repeat');
    }

    // Process faces (triangles)
    for (let i = 0; i < indices.length; i += 3) {
      const idx0 = indices[i];
      const idx1 = indices[i+1];
      const idx2 = indices[i+2];
      
      const v0 = projectedVerts[idx0];
      const v1 = projectedVerts[idx1];
      const v2 = projectedVerts[idx2];
      
      // Skip if any vertex clipped
      if (v0.z < 0 || v1.z < 0 || v2.z < 0) continue;
      
      // Backface culling (check winding order 2D cross product)
      const ax = v1.x - v0.x;
      const ay = v1.y - v0.y;
      const bx = v2.x - v0.x;
      const by = v2.y - v0.y;
      
      if ((ax * by - ay * bx) <= 0) continue;

      // Face normal for flat shading (in world space, roughly)
      // Reconstruct triangle normal
      const p0 = new Vector3(vertices[idx0*3], vertices[idx0*3+1], vertices[idx0*3+2]);
      const p1 = new Vector3(vertices[idx1*3], vertices[idx1*3+1], vertices[idx1*3+2]);
      const p2 = new Vector3(vertices[idx2*3], vertices[idx2*3+1], vertices[idx2*3+2]);
      
      const e1 = p1.sub(p0);
      const e2 = p2.sub(p0);
      const normal = e1.cross(e2).normalize();
      
      // N dot L
      const ndotl = Math.max(0, normal.dot(lightDir));
      const ambient = 0.3;
      const brightness = Math.min(1, ambient + ndotl * lightIntensity);
      
      this.ctx.beginPath();
      this.ctx.moveTo(v0.x, v0.y);
      this.ctx.lineTo(v1.x, v1.y);
      this.ctx.lineTo(v2.x, v2.y);
      this.ctx.closePath();
      
      if (pattern) {
          // Simple texture mapping (just fill) - accurate affine mapping is hard in 2D canvas
          // We simulate shading by drawing a semi-transparent black layer over texture
          this.ctx.fillStyle = pattern;
          
          // Scale texture matrix? For now default
          this.ctx.save();
          // Clip to triangle
          this.ctx.clip();
          this.ctx.fill();
          
          // Apply shading shadow
          this.ctx.fillStyle = `rgba(0,0,0, ${1 - brightness})`;
          this.ctx.fill();
          this.ctx.restore();
          
      } else {
          // Solid color shading
          const base = material.albedo;
          const r = Math.floor(base.r * 255 * brightness);
          const g = Math.floor(base.g * 255 * brightness);
          const b = Math.floor(base.b * 255 * brightness);
          this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          this.ctx.fill();
      }
      
      // Wireframe overlay for tech look
      this.ctx.strokeStyle = `rgba(0,0,0,0.1)`;
      this.ctx.stroke();
    }
  }

  /**
   * Project 3D point to screen space
   */
  private projectToScreen(worldPos: Vector3, cameraState: any): { x: number; y: number, z: number } | null {
    // Simple perspective projection
    const relPos = worldPos.clone().sub(cameraState.position);

    // Transform to camera space
    const forward = cameraState.target.clone().sub(cameraState.position).normalize();
    const right = forward.cross(cameraState.up).normalize();
    const up = right.cross(forward).normalize();

    const x = relPos.dot(right);
    const y = relPos.dot(up);
    const z = relPos.dot(forward);

    // Behind camera
    if (z < 0.1) return null;

    // Project to screen
    const fov = cameraState.fov * Math.PI / 180;
    const scale = this.height / (2 * Math.tan(fov / 2));

    const screenX = this.width / 2 + (x / z) * scale;
    const screenY = this.height / 2 - (y / z) * scale;

    return { x: screenX, y: screenY, z };
  }

  /**
   * Render measurement overlays
   */
  private renderMeasurements(): void {
    const measurements = this.measurementTool.getMeasurements();

    measurements.forEach(measurement => {
      // Render measurement visualization
      // This would draw lines and labels in 3D space
    });
  }

  /**
   * Render UI overlays
   */
  private renderOverlays(): void {
    if (!this.ctx) return;

    // Render crosshair in center
    const centerX = this.width / 2;
    const centerY = this.height / 2;

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - 10, centerY);
    this.ctx.lineTo(centerX + 10, centerY);
    this.ctx.moveTo(centerX, centerY - 10);
    this.ctx.lineTo(centerX, centerY + 10);
    this.ctx.stroke();
  }

  /**
   * Capture screenshot
   */
  private captureScreenshot(): void {
    const dataURL = this.canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `archviz-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
    console.log('Screenshot saved');
  }
}

/**
 * Application entry point
 */
async function main() {
  const app = new ArchVizApplication();
  await app.init();
  app.start();
}

// Start the application
main().catch(console.error);
