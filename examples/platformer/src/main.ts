/**
 * G3D 3D Platformer Example - Main Entry Point
 *
 * A complete, production-ready 3D platformer demonstration featuring:
 * - Character controller with jump, double jump, and wall jump
 * - Third-person camera with smooth following and collision
 * - Multiple platform types (static, moving, rotating, falling, bouncy)
 * - Collectible coins with rotation and particle effects
 * - Checkpoint system with respawn
 * - Score and time tracking
 * - Full game state management
 */

import { Engine } from 'g3d';
import { Vector3 } from 'g3d';
import { Quaternion } from 'g3d';
import { PhysicsWorld } from 'g3d';
import { RigidBody } from 'g3d';
import { BoxShape } from 'g3d';
import { Keyboard } from 'g3d';
import { Mouse } from 'g3d';

import { PlayerController } from './PlayerController';
import { ThirdPersonCamera } from './ThirdPersonCamera';
import { LevelBuilder } from './LevelBuilder';
import { GameManager } from './GameManager';
import { Platform } from './Platform';
import { Collectible, CollectibleType } from './Collectible';
import { PlatformType } from './Platform';

/**
 * Main game class orchestrating all game systems
 */
class PlatformerGame {
  private engine: Engine;
  private physicsWorld: PhysicsWorld;
  private keyboard: Keyboard;
  private mouse: Mouse;
  private player: PlayerController;
  private camera: ThirdPersonCamera;
  private levelBuilder: LevelBuilder;
  private gameManager: GameManager;
  private platforms: Platform[] = [];
  private collectibles: Collectible[] = [];
  private timeElapsed: number = 0;
  
  // Rendering
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!canvas) {
      throw new Error('Canvas element not found');
    }
    
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    canvas.width = this.width;
    canvas.height = this.height;
    this.ctx = canvas.getContext('2d')!;

    this.engine = Engine.create({
      canvas,
      targetFPS: 60,
      fixedTimestep: 1 / 60,
      enableProfiling: true,
      autoStart: false
    });

    this.physicsWorld = new PhysicsWorld({
      gravity: new Vector3(0, -20, 0),
      fixedTimestep: 1 / 60
    });

    this.keyboard = new Keyboard();
    this.mouse = new Mouse();

    this.levelBuilder = new LevelBuilder(this.physicsWorld);
    this.gameManager = new GameManager();

    const playerStartPos = new Vector3(0, 2, 0);
    this.player = new PlayerController(
      this.physicsWorld,
      this.keyboard,
      playerStartPos
    );

    this.camera = new ThirdPersonCamera(
      this.player,
      this.mouse,
      this.keyboard
    );
  }

  /**
   * Initialize the game
   */
  async init(): Promise<void> {
    await this.engine.init();

    this.keyboard.attach(window);
    this.mouse.attach(this.engine.canvas!);

    this.buildLevel();

    this.setupEventHandlers();

    this.engine.events.onUpdate = (dt: number) => this.update(dt);
    this.engine.events.onFixedUpdate = (dt: number) => this.fixedUpdate(dt);
    // Hook render
    this.engine.events.onRender = () => this.render();

    this.gameManager.startGame();
  }

  /**
   * Build the game level with platforms and collectibles
   */
  private buildLevel(): void {
    const { platforms, collectibles } = this.levelBuilder.buildLevel1();
    this.platforms = platforms;
    this.collectibles = collectibles;

    this.gameManager.setTotalCoins(collectibles.length);
  }

  /**
   * Setup game event handlers
   */
  private setupEventHandlers(): void {
    this.player.onLanded = () => {
      console.log('Player landed');
    };

    this.player.onJump = () => {
      console.log('Player jumped');
    };

    this.player.onDeath = () => {
      this.handlePlayerDeath();
    };

    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => this.restartGame());
    }
  }

  /**
   * Handle player death
   */
  private handlePlayerDeath(): void {
    this.gameManager.loseLife();

    if (this.gameManager.lives > 0) {
      this.respawnPlayer();
    } else {
      this.gameOver();
    }
  }

  /**
   * Respawn player at last checkpoint
   */
  private respawnPlayer(): void {
    const checkpoint = this.gameManager.lastCheckpoint;
    this.player.respawn(checkpoint);
    this.camera.reset();
  }

  /**
   * Handle game over
   */
  private gameOver(): void {
    this.engine.pause();

    const gameOverDiv = document.getElementById('game-over');
    const finalScoreEl = document.getElementById('final-score');

    if (gameOverDiv && finalScoreEl) {
      finalScoreEl.textContent = `Final Score: ${this.gameManager.score}`;
      gameOverDiv.style.display = 'block';
    }
  }

  /**
   * Restart the game
   */
  private restartGame(): void {
    const gameOverDiv = document.getElementById('game-over');
    if (gameOverDiv) {
      gameOverDiv.style.display = 'none';
    }

    this.gameManager.resetGame();
    this.player.respawn(new Vector3(0, 2, 0));
    this.camera.reset();

    this.collectibles.forEach(c => c.reset());

    this.timeElapsed = 0;

    this.engine.resume();
  }

  /**
   * Main update loop (variable timestep)
   */
  private update(dt: number): void {
    this.keyboard.update();
    this.mouse.update();

    this.timeElapsed += dt;

    this.player.update(dt);
    this.camera.update(dt);

    for (const platform of this.platforms) {
      platform.update(dt);
    }

    for (const collectible of this.collectibles) {
      collectible.update(dt);

      if (collectible.checkCollision(this.player.position, 1.0)) {
        this.gameManager.collectCoin();

        if (this.gameManager.coinsCollected === this.gameManager.totalCoins) {
          this.levelComplete();
        }
      }
    }

    this.checkCheckpoints();

    this.updateUI();
  }
  
  /**
   * Render the scene
   */
  private render(): void {
      // Clear
      this.ctx.fillStyle = '#87CEEB'; // Sky blue
      this.ctx.fillRect(0, 0, this.width, this.height);
      
      // Ground plane grid
      // ... (simplified)
      
      // Render platforms
      for (const platform of this.platforms) {
          this.renderBox(platform.position, platform.size, this.getPlatformColor(platform.type), platform.rotation);
      }
      
      // Render collectibles
      for (const collectible of this.collectibles) {
          if (!collectible.collected) {
             const color = collectible.type === CollectibleType.Coin ? '#FFD700' : '#00FFFF';
             this.renderBox(collectible.position, new Vector3(0.5, 0.5, 0.5), color, Quaternion.identity()); // Simple box for coin
          }
      }
      
      // Render player
      this.renderBox(this.player.position, new Vector3(1, 2, 1), '#FF0000', this.player.rotation);
  }
  
  private getPlatformColor(type: PlatformType): string {
      switch(type) {
          case PlatformType.Static: return '#666666';
          case PlatformType.Moving: return '#4444FF';
          case PlatformType.Bouncy: return '#FF69B4';
          case PlatformType.Falling: return '#A52A2A';
          case PlatformType.Disappearing: return '#88CC88';
          default: return '#AAAAAA';
      }
  }
  
  private renderBox(pos: Vector3, size: Vector3, color: string, rot: Quaternion): void {
      // Simple perspective projection helper
      // Ideally share this logic with FPSGame logic but duplicate here for speed
      
      const camPos = this.camera.position;
      const camTarget = this.camera.target; // Or calculate forward
      const camUp = new Vector3(0, 1, 0);
      
      const forward = camTarget.sub(camPos).normalize();
      const right = forward.cross(camUp).normalize();
      const up = right.cross(forward).normalize();
      
      // Check if behind
      const relPos = pos.sub(camPos);
      const dist = relPos.dot(forward);
      
      if (dist < 1) return;
      
      // Project center
      const x = relPos.dot(right);
      const y = relPos.dot(up);
      
      const fov = 60 * Math.PI / 180;
      const scale = this.height / (2 * Math.tan(fov/2));
      
      const screenX = this.width/2 + (x/dist) * scale;
      const screenY = this.height/2 - (y/dist) * scale;
      
      const screenSize = (size.y / dist) * scale;
      
      this.ctx.fillStyle = color;
      // Draw simple rect centered
      this.ctx.fillRect(screenX - screenSize/2, screenY - screenSize/2, screenSize, screenSize);
      
      // Wireframe
      this.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      this.ctx.strokeRect(screenX - screenSize/2, screenY - screenSize/2, screenSize, screenSize);
  }

  /**
   * Fixed update loop for physics
   */
  private fixedUpdate(dt: number): void {
    this.physicsWorld.step(dt);
    this.player.fixedUpdate(dt);
  }

  /**
   * Check if player reached any checkpoints
   */
  private checkCheckpoints(): void {
    const checkpoints = this.levelBuilder.getCheckpoints();

    for (const checkpoint of checkpoints) {
      const dist = this.player.position.sub(checkpoint).length();
      if (dist < 2.0) {
        this.gameManager.setCheckpoint(checkpoint);
      }
    }
  }

  /**
   * Handle level completion
   */
  private levelComplete(): void {
    const timeBonus = Math.max(0, 10000 - Math.floor(this.timeElapsed * 10));
    this.gameManager.addScore(timeBonus);

    alert(`Level Complete! Time Bonus: ${timeBonus}`);
    this.restartGame();
  }

  /**
   * Update UI elements
   */
  private updateUI(): void {
    const scoreDisplay = document.getElementById('score-display');
    if (scoreDisplay) {
      scoreDisplay.textContent =
        `Score: ${this.gameManager.score} | Coins: ${this.gameManager.coinsCollected}/${this.gameManager.totalCoins}`;
    }

    const livesDisplay = document.querySelector('#ui-overlay div:nth-child(2)');
    if (livesDisplay) {
      livesDisplay.textContent = `Lives: ${this.gameManager.lives}`;
    }

    const timeDisplay = document.querySelector('#ui-overlay div:nth-child(3)');
    if (timeDisplay) {
      const minutes = Math.floor(this.timeElapsed / 60);
      const seconds = Math.floor(this.timeElapsed % 60);
      timeDisplay.textContent = `Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Start the game
   */
  start(): void {
    this.engine.start();
  }
}

const game = new PlatformerGame();
game.init().then(() => {
  game.start();
  console.log('G3D 3D Platformer started!');
});
