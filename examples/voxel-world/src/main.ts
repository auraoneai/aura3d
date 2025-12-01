/**
 * main.ts
 * G3D Voxel World Example
 *
 * Complete Minecraft-style voxel world demonstrating:
 * - Infinite procedural terrain generation
 * - Chunk streaming and LOD
 * - Block placement and destruction
 * - Player physics and movement
 * - Creative/Survival modes
 * - Inventory system
 * - Day/night cycle
 */

import { Vector3, VoxelWorld } from 'g3d';
import { TerrainGenerator } from './TerrainGenerator';
import { ChunkManager } from './ChunkManager';
import { VoxelPlayer, PlayerInput, PlayerMode } from './VoxelPlayer';
import { Inventory } from './Inventory';
import { VoxelHUD } from './VoxelHUD';
import { BlockRegistry, BlockType } from './BlockTypes';

/**
 * Main voxel world game class
 */
class VoxelWorldGame {
  private canvas: HTMLCanvasElement;
  private world: VoxelWorld;
  private generator: TerrainGenerator;
  private chunkManager: ChunkManager;
  private player: VoxelPlayer;
  private inventory: Inventory;
  private hud: VoxelHUD;

  private input: PlayerInput;
  private lastTime: number = 0;
  private frameCount: number = 0;
  private fps: number = 60;
  private fpsUpdateTime: number = 0;

  private pointerLocked: boolean = false;
  private mouseSensitivity: number = 0.002;

  private isRunning: boolean = false;

  // Time management
  private timeOfDay: number = 0.25; // 0 = midnight, 0.5 = noon, 1.0 = midnight
  private dayLength: number = 600; // seconds for full day/night cycle

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Initialize systems
    this.world = new VoxelWorld(16);
    this.generator = new TerrainGenerator(Date.now());
    this.chunkManager = new ChunkManager(this.world, this.generator);

    // Set chunk manager settings
    this.chunkManager.setViewDistance(8);

    // Create player at spawn
    const spawnPosition = new Vector3(0, 80, 0);
    this.player = new VoxelPlayer(spawnPosition);
    this.player.setMode(PlayerMode.Creative);

    // Create inventory
    this.inventory = new Inventory();

    // Create HUD
    const hudContainer = document.getElementById('hud') || document.body;
    this.hud = new VoxelHUD(hudContainer);

    // Initialize input
    this.input = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sneak: false,
      sprint: false,
      breakBlock: false,
      placeBlock: false,
      toggleFly: false,
      lookDelta: new Vector3(0, 0, 0)
    };

    // Setup event listeners
    this.setupEventListeners();

    // Resize canvas
    this.resizeCanvas();
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Keyboard
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Mouse
    this.canvas.addEventListener('click', () => this.requestPointerLock());
    document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));

    // Mouse wheel for hotbar selection
    this.canvas.addEventListener('wheel', (e) => this.onMouseWheel(e));

    // Window resize
    window.addEventListener('resize', () => this.resizeCanvas());

    // Prevent context menu
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Request pointer lock
   */
  private requestPointerLock(): void {
    this.canvas.requestPointerLock();
  }

  /**
   * Handle pointer lock change
   */
  private onPointerLockChange(): void {
    this.pointerLocked = document.pointerLockElement === this.canvas;

    if (this.pointerLocked && !this.isRunning) {
      this.start();
    }
  }

  /**
   * Handle keyboard down
   */
  private onKeyDown(e: KeyboardEvent): void {
    switch (e.code) {
      case 'KeyW': this.input.forward = true; break;
      case 'KeyS': this.input.backward = true; break;
      case 'KeyA': this.input.left = true; break;
      case 'KeyD': this.input.right = true; break;
      case 'Space': this.input.jump = true; break;
      case 'ShiftLeft': this.input.sneak = true; break;
      case 'ControlLeft': this.input.sprint = true; break;

      // Hotbar selection
      case 'Digit1': this.inventory.setSelectedIndex(0); break;
      case 'Digit2': this.inventory.setSelectedIndex(1); break;
      case 'Digit3': this.inventory.setSelectedIndex(2); break;
      case 'Digit4': this.inventory.setSelectedIndex(3); break;
      case 'Digit5': this.inventory.setSelectedIndex(4); break;
      case 'Digit6': this.inventory.setSelectedIndex(5); break;
      case 'Digit7': this.inventory.setSelectedIndex(6); break;
      case 'Digit8': this.inventory.setSelectedIndex(7); break;
      case 'Digit9': this.inventory.setSelectedIndex(8); break;

      // Toggle debug
      case 'F3':
        e.preventDefault();
        this.hud.toggleDebug();
        break;

      // Toggle fly (double space in creative)
      case 'Space':
        if (this.player.getMode() === PlayerMode.Creative) {
          const now = Date.now();
          if (this.lastSpacePress && now - this.lastSpacePress < 300) {
            this.input.toggleFly = true;
            this.lastSpacePress = 0;
          } else {
            this.lastSpacePress = now;
          }
        }
        break;
    }
  }

  private lastSpacePress: number = 0;

  /**
   * Handle keyboard up
   */
  private onKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'KeyW': this.input.forward = false; break;
      case 'KeyS': this.input.backward = false; break;
      case 'KeyA': this.input.left = false; break;
      case 'KeyD': this.input.right = false; break;
      case 'Space': this.input.jump = false; break;
      case 'ShiftLeft': this.input.sneak = false; break;
      case 'ControlLeft': this.input.sprint = false; break;
    }

    this.input.toggleFly = false;
  }

  /**
   * Handle mouse move
   */
  private onMouseMove(e: MouseEvent): void {
    if (!this.pointerLocked) return;

    this.input.lookDelta.x = e.movementX * this.mouseSensitivity;
    this.input.lookDelta.y = -e.movementY * this.mouseSensitivity;
  }

  /**
   * Handle mouse down
   */
  private onMouseDown(e: MouseEvent): void {
    if (!this.pointerLocked) return;

    if (e.button === 0) {
      // Left click - break block
      this.input.breakBlock = true;
    } else if (e.button === 2) {
      // Right click - place block
      this.input.placeBlock = true;
      this.player.placeBlock(this.world, this.inventory);
    }
  }

  /**
   * Handle mouse up
   */
  private onMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.input.breakBlock = false;
    }
  }

  /**
   * Handle mouse wheel
   */
  private onMouseWheel(e: WheelEvent): void {
    e.preventDefault();

    const delta = e.deltaY > 0 ? 1 : -1;
    let newIndex = this.inventory.getSelectedIndex() + delta;

    if (newIndex < 0) newIndex = 8;
    if (newIndex > 8) newIndex = 0;

    this.inventory.setSelectedIndex(newIndex);
  }

  /**
   * Resize canvas
   */
  private resizeCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /**
   * Start the game
   */
  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now();

    // Hide loading screen
    const loading = document.getElementById('loading');
    if (loading) {
      loading.classList.add('hidden');
    }

    // Show welcome message
    this.hud.showMessage('Welcome to G3D Voxel World! Press F3 for debug info', 5000);

    // Pre-load some chunks around spawn
    this.hud.showMessage('Generating terrain...', 2000);
    this.chunkManager.preloadChunks(this.player.getPosition(), 4);

    // Start game loop
    requestAnimationFrame((time) => this.gameLoop(time));
  }

  /**
   * Main game loop
   */
  private gameLoop(currentTime: number): void {
    if (!this.isRunning) return;

    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Cap delta time to prevent spiral of death
    const clampedDelta = Math.min(deltaTime, 0.1);

    // Update game systems
    this.update(clampedDelta);

    // Render
    this.render();

    // Update FPS
    this.updateFPS(currentTime);

    // Reset input deltas
    this.input.lookDelta.set(0, 0, 0);

    // Continue loop
    requestAnimationFrame((time) => this.gameLoop(time));
  }

  /**
   * Update game state
   */
  private update(deltaTime: number): void {
    // Update player
    this.player.update(deltaTime, this.world, this.input);

    // Update block breaking
    const breakProgress = this.player.updateBlockBreaking(
      deltaTime,
      this.world,
      this.input,
      this.inventory
    );
    this.hud.updateBreakProgress(breakProgress);

    // Update chunk manager
    this.chunkManager.update(this.player.getEyePosition(), deltaTime);

    // Update time of day
    this.timeOfDay += deltaTime / this.dayLength;
    if (this.timeOfDay > 1) this.timeOfDay -= 1;

    // Update HUD
    this.updateHUD();
  }

  /**
   * Render the world
   */
  private render(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = this.getSkyColor();
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Simple wireframe rendering (placeholder)
    this.renderSimpleWorld(ctx);
  }

  /**
   * Get sky color based on time of day
   */
  private getSkyColor(): string {
    const time = this.timeOfDay;

    if (time < 0.25 || time > 0.75) {
      // Night
      return '#001122';
    } else if (time >= 0.25 && time <= 0.75) {
      // Day
      const brightness = Math.sin((time - 0.25) * Math.PI * 2);
      const value = 100 + brightness * 100;
      return `rgb(${value * 0.5}, ${value * 0.7}, ${value})`;
    }

    return '#87CEEB';
  }

  /**
   * Simple world rendering (wireframe)
   */
  private renderSimpleWorld(ctx: CanvasRenderingContext2D): void {
    // This is a placeholder - in a real implementation, you would use WebGL
    // For this example, we'll just show we're loading chunks

    ctx.fillStyle = 'white';
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';

    const stats = this.chunkManager.getStats();
    const message = `Chunks Loaded: ${stats.loadedChunks}`;

    ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2);
    ctx.fillText('(WebGL rendering would go here)', this.canvas.width / 2, this.canvas.height / 2 + 30);
    ctx.fillText('Move with WASD, Look with Mouse', this.canvas.width / 2, this.canvas.height / 2 + 60);
  }

  /**
   * Update HUD
   */
  private updateHUD(): void {
    // Update hotbar
    this.hud.updateHotbar(this.inventory);

    // Update debug info
    const playerPos = this.player.getPosition();
    const chunkPos = this.world.worldToChunk(playerPos.x, playerPos.y, playerPos.z);
    const stats = this.chunkManager.getStats();

    const selectedBlock = BlockRegistry.get(this.inventory.getSelectedBlockType());
    const selectedName = selectedBlock ? selectedBlock.name : 'None';

    this.hud.updateDebugInfo(playerPos, chunkPos, this.fps, stats, selectedName);
  }

  /**
   * Update FPS counter
   */
  private updateFPS(currentTime: number): void {
    this.frameCount++;

    if (currentTime - this.fpsUpdateTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsUpdateTime = currentTime;
    }
  }

  /**
   * Stop the game
   */
  public stop(): void {
    this.isRunning = false;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.stop();
    this.chunkManager.clear();
    this.hud.dispose();
  }
}

/**
 * Initialize and start the game
 */
function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  if (!canvas) {
    console.error('Canvas element not found');
    return;
  }

  // Create and initialize game
  const game = new VoxelWorldGame(canvas);

  // Add to window for debugging
  (window as any).game = game;

  console.log('G3D Voxel World Example');
  console.log('Click canvas to start!');
  console.log('Controls:');
  console.log('  WASD - Move');
  console.log('  Space - Jump');
  console.log('  Shift - Sneak');
  console.log('  Double Space - Toggle Fly (Creative)');
  console.log('  Left Click - Break Block');
  console.log('  Right Click - Place Block');
  console.log('  1-9 - Select Hotbar Slot');
  console.log('  Mouse Wheel - Scroll Hotbar');
  console.log('  F3 - Toggle Debug Info');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
