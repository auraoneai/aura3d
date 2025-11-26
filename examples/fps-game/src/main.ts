/**
 * G3D FPS Game Example - Main Entry Point
 *
 * A complete first-person shooter demonstrating:
 * - Physics-based character movement
 * - AI enemies with behavior trees and pathfinding
 * - Weapon system with recoil and hit detection
 * - Dynamic level generation
 * - Spatial audio and sound effects
 * - Head-up display (HUD)
 */

import { Player } from './Player';
import { Enemy } from './Enemy';
import { Level } from './Level';
import { HUD } from './HUD';
import { Weapon, WeaponType } from './Weapon';

// G3D imports (simplified for example - adjust based on actual G3D API)
interface Vector3 {
    x: number;
    y: number;
    z: number;
}

interface Engine {
    world: World;
    renderer: Renderer;
    physics: PhysicsWorld;
    audio: AudioManager;
    input: InputManager;
    deltaTime: number;
    time: number;
}

interface World {
    createEntity(): number;
    destroyEntity(id: number): void;
}

interface Renderer {
    setAmbientLight(color: number[], intensity: number): void;
}

interface PhysicsWorld {
    setGravity(x: number, y: number, z: number): void;
    update(deltaTime: number): void;
}

interface AudioManager {
    createSound(path: string, options?: any): AudioSource;
    setListenerPosition(pos: Vector3): void;
    setListenerOrientation(forward: Vector3, up: Vector3): void;
}

interface AudioSource {
    play(): void;
    stop(): void;
    setVolume(volume: number): void;
    setPosition(pos: Vector3): void;
    setLoop(loop: boolean): void;
}

interface InputManager {
    isKeyDown(key: string): boolean;
    isKeyPressed(key: string): boolean;
    isMouseButtonDown(button: number): boolean;
    isMouseButtonPressed(button: number): boolean;
    getMouseDelta(): { x: number; y: number };
    lockPointer(): void;
    unlockPointer(): void;
    isPointerLocked(): boolean;
}

/**
 * Main Game Class
 * Manages game state, entities, and game loop
 */
class FPSGame {
    private engine!: Engine;
    private player!: Player;
    private enemies: Enemy[] = [];
    private level!: Level;
    private hud!: HUD;
    private gameStarted = false;
    private score = 0;
    private wave = 1;
    private enemiesRemaining = 0;

    constructor() {}

    /**
     * Initialize the game
     */
    async init(): Promise<void> {
        // Show loading progress
        this.updateLoadingProgress(10);

        // Initialize mock engine (replace with actual G3D engine initialization)
        this.engine = this.createMockEngine();

        this.updateLoadingProgress(30);

        // Setup rendering
        this.setupRendering();
        this.updateLoadingProgress(40);

        // Initialize level
        this.level = new Level(this.engine);
        await this.level.generate();
        this.updateLoadingProgress(60);

        // Create player
        this.player = new Player(this.engine, this.level);
        await this.player.init();
        this.updateLoadingProgress(70);

        // Setup HUD
        this.hud = new HUD(this.engine);
        this.hud.init();
        this.updateLoadingProgress(80);

        // Load audio
        await this.loadAudio();
        this.updateLoadingProgress(90);

        // Setup input handlers
        this.setupInput();
        this.updateLoadingProgress(100);

        // Hide loading screen
        setTimeout(() => {
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) {
                loadingScreen.style.opacity = '0';
                setTimeout(() => loadingScreen.remove(), 500);
            }
        }, 500);

        console.log('FPS Game initialized successfully!');
    }

    /**
     * Create mock engine for demonstration
     */
    private createMockEngine(): Engine {
        return {
            world: {
                createEntity: () => Math.floor(Math.random() * 1000000),
                destroyEntity: () => {}
            },
            renderer: {
                setAmbientLight: () => {}
            },
            physics: {
                setGravity: () => {},
                update: () => {}
            },
            audio: {
                createSound: () => ({
                    play: () => {},
                    stop: () => {},
                    setVolume: () => {},
                    setPosition: () => {},
                    setLoop: () => {}
                }),
                setListenerPosition: () => {},
                setListenerOrientation: () => {}
            },
            input: {
                isKeyDown: (key: string) => false,
                isKeyPressed: (key: string) => false,
                isMouseButtonDown: (button: number) => false,
                isMouseButtonPressed: (button: number) => false,
                getMouseDelta: () => ({ x: 0, y: 0 }),
                lockPointer: () => {},
                unlockPointer: () => {},
                isPointerLocked: () => true
            },
            deltaTime: 0.016,
            time: 0
        } as Engine;
    }

    /**
     * Setup rendering settings
     */
    private setupRendering(): void {
        this.engine.renderer.setAmbientLight([0.3, 0.3, 0.4], 0.2);
        this.engine.physics.setGravity(0, -9.81, 0);
    }

    /**
     * Load game audio assets
     */
    private async loadAudio(): Promise<void> {
        // Audio would be loaded here in a real implementation
        console.log('Audio loaded');
    }

    /**
     * Setup input event handlers
     */
    private setupInput(): void {
        // Click to start and lock pointer
        const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        canvas?.addEventListener('click', () => {
            if (!this.gameStarted) {
                this.gameStarted = true;
                this.engine.input.lockPointer();
                this.startNewWave();
            }
        });

        // ESC to unlock pointer
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.engine.input.unlockPointer();
            }
        });
    }

    /**
     * Start a new enemy wave
     */
    private startNewWave(): void {
        const enemyCount = 3 + this.wave * 2;
        this.enemiesRemaining = enemyCount;

        for (let i = 0; i < enemyCount; i++) {
            const spawnPoint = this.level.getRandomSpawnPoint();
            const enemy = new Enemy(this.engine, this.level, spawnPoint);
            enemy.init();
            this.enemies.push(enemy);
        }

        this.hud.showMessage(`Wave ${this.wave} - ${enemyCount} enemies!`, 3000);
    }

    /**
     * Handle enemy death
     */
    private onEnemyKilled(enemy: Enemy): void {
        this.score += 100;
        this.enemiesRemaining--;

        const index = this.enemies.indexOf(enemy);
        if (index > -1) {
            this.enemies.splice(index, 1);
        }

        if (this.enemiesRemaining <= 0) {
            this.wave++;
            setTimeout(() => this.startNewWave(), 3000);
            this.hud.showMessage('Wave Complete!', 2000);
        }
    }

    /**
     * Main game loop update
     */
    update(deltaTime: number): void {
        if (!this.gameStarted) return;

        // Update engine systems
        this.engine.physics.update(deltaTime);

        // Update player
        this.player.update(deltaTime);

        // Update enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(deltaTime, this.player);

            if (enemy.isDead()) {
                this.onEnemyKilled(enemy);
            }
        }

        // Update HUD
        this.hud.update({
            health: this.player.getHealth(),
            maxHealth: this.player.getMaxHealth(),
            ammo: this.player.getCurrentWeapon()?.getCurrentAmmo() || 0,
            reserveAmmo: this.player.getCurrentWeapon()?.getReserveAmmo() || 0,
            score: this.score,
            wave: this.wave,
            enemiesRemaining: this.enemiesRemaining
        });

        // Update audio listener
        const playerPos = this.player.getPosition();
        const playerForward = this.player.getForward();
        this.engine.audio.setListenerPosition(playerPos);
        this.engine.audio.setListenerOrientation(
            playerForward,
            { x: 0, y: 1, z: 0 }
        );
    }

    /**
     * Update loading progress bar
     */
    private updateLoadingProgress(percent: number): void {
        const progressBar = document.getElementById('loadingProgress');
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
    }

    /**
     * Get all enemies for player targeting
     */
    getEnemies(): Enemy[] {
        return this.enemies;
    }
}

/**
 * Application entry point
 */
async function main() {
    console.log('Starting G3D FPS Game...');

    const game = new FPSGame();
    await game.init();

    // Game loop
    let lastTime = performance.now();

    function gameLoop() {
        const currentTime = performance.now();
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        game.update(deltaTime);

        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);
}

// Start the game
main().catch(error => {
    console.error('Failed to start game:', error);
});
