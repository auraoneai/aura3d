/**
 * main.ts - G3D Racing Game Entry Point
 *
 * Complete racing game demonstrating:
 * - Vehicle Physics: Arcade-style with suspension, grip, and drift
 * - Terrain: Race track with elevation changes
 * - Particles: Tire smoke, nitro flames
 * - Audio: Engine sounds, tire skids
 * - AI: Competitive AI opponents
 * - Race Management: Laps, timing, positions
 * - HUD: Speedometer, tachometer, minimap, leaderboard
 */

import { Engine, EngineConfig } from 'g3d';
import { Vector3, Quaternion } from 'g3d';
import { Scene, SceneNode, Camera } from 'g3d';
import { DirectionalLight } from 'g3d';
import { GeometryGenerator } from 'g3d';
import { PhysicsWorld } from 'g3d';
import { InputManager, Keyboard } from 'g3d';
import { AudioContext } from 'g3d';
import { StandardPBRMaterial, Color } from 'g3d';

import { Vehicle, VehicleConfig } from './Vehicle';
import { Track } from './Track';
import { AIDriver, AIDifficulty } from './AIDriver';
import { RaceManager, RaceState } from './RaceManager';
import { RacingHUD } from './RacingHUD';

/**
 * Main Racing Game class
 */
class RacingGame {
  // Core systems
  private engine!: Engine;
  private scene!: Scene;
  private camera!: Camera;
  private physics!: PhysicsWorld;
  private input!: InputManager;
  private audio!: AudioContext;
  private directionalLight!: DirectionalLight;

  // Game objects
  private track!: Track;
  private playerVehicle!: Vehicle;
  private aiVehicles: Vehicle[] = [];
  private aiDrivers: AIDriver[] = [];

  // Game management
  private raceManager!: RaceManager;
  private hud!: RacingHUD;

  // Camera modes
  private cameraMode: 'chase' | 'hood' | 'bumper' | 'orbit' = 'chase';
  private cameraOffset: Vector3 = new Vector3(0, 3, 8);
  private cameraTarget: Vector3 = new Vector3();
  private cameraVelocity: Vector3 = new Vector3();

  // Controls
  private controls = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    nitro: false
  };

  /**
   * Initialize the game
   */
  public async init(): Promise<void> {
    console.log('Initializing G3D Racing Game...');

    // Create engine
    await this.initEngine();

    // Setup scene
    await this.setupScene();

    // Setup physics
    this.setupPhysics();

    // Create track
    this.createTrack();

    // Create vehicles
    this.createVehicles();

    // Setup race manager
    this.setupRaceManager();

    // Setup input
    this.setupInput();

    // Setup audio
    await this.setupAudio();

    // Create HUD
    this.createHUD();

    // Setup camera
    this.setupCamera();

    // Hide loading screen
    this.hideLoadingScreen();

    console.log('Game initialized successfully!');
  }

  /**
   * Initialize G3D engine
   */
  private async initEngine(): Promise<void> {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!canvas) {
      throw new Error('Canvas not found');
    }

    const config: EngineConfig = {
      canvas,
      targetFPS: 60,
      fixedTimestep: 1 / 60,
      maxSubSteps: 8,
      enableProfiling: true,
      autoStart: false
    };

    this.engine = Engine.create(config);
    await this.engine.init();
  }

  /**
   * Setup scene with lighting and environment
   */
  private async setupScene(): Promise<void> {
    this.scene = new Scene('RaceScene');

    // Add directional light (sun)
    // Direction from position (50, 100, 50) to origin normalized
    const sunDirection = new Vector3(-50, -100, -50).normalize();
    this.directionalLight = new DirectionalLight(
      sunDirection,
      new Color(1, 0.95, 0.9),
      3.0
    );
    this.directionalLight.setShadowsEnabled(true);
    // Note: In a full implementation, lights would be added to a renderer's light manager

    // Configure ambient light via environment
    this.scene.environment.ambientColor = new Color(0.5, 0.6, 0.7);
    this.scene.environment.ambientIntensity = 0.4;

    // Add sky
    this.scene.environment.clearColor = new Color(0.4, 0.6, 0.9);
    this.scene.environment.skybox = { type: 'color', color: new Color(0.4, 0.6, 0.9) };

    // Add ground plane
    this.createGround();
  }

  /**
   * Create ground plane
   */
  private createGround(): void {
    const groundMaterial = new StandardPBRMaterial({
      baseColor: new Color(0.2, 0.5, 0.2),
      roughness: 0.9,
      metallic: 0.0
    });

    const groundGeometry = GeometryGenerator.plane(1000, 1000, 10, 10);

    const groundNode = new SceneNode('Ground');
    groundNode.setMesh(groundGeometry);
    groundNode.setMaterial(groundMaterial);
    this.scene.add(groundNode);
  }

  /**
   * Setup physics world
   */
  private setupPhysics(): void {
    this.physics = new PhysicsWorld({
      gravity: new Vector3(0, -20, 0),
      enableCCD: true
    });
  }

  /**
   * Create race track
   */
  private createTrack(): void {
    console.log('Creating race track...');

    this.track = new Track({
      name: 'Grand Prix Circuit',
      lapCount: 3,
      checkpointCount: 8,
      trackWidth: 12,
      terrainSize: new Vector3(500, 50, 500)
    });

    // Build track mesh
    this.track.buildTrackMesh(this.scene);

    console.log('Track created:', this.track.getInfo());
  }

  /**
   * Create player and AI vehicles
   */
  private createVehicles(): void {
    console.log('Creating vehicles...');

    const vehicleConfig: VehicleConfig = {
      mass: 1200,
      maxSpeed: 250,
      acceleration: 2500,
      brakeForce: 3000,
      steerSpeed: 5.0,
      maxSteerAngle: 0.5,
      driftFactor: 0.3,
      gripFactor: 0.8,
      suspensionStiffness: 800,
      suspensionDamping: 50,
      position: new Vector3(0, 1, 0)
    };

    // Create player vehicle
    const startPos = this.track.getStartPosition(0);
    vehicleConfig.position = startPos.position;

    this.playerVehicle = new Vehicle(vehicleConfig, this.physics);
    this.playerVehicle.reset(startPos.position, startPos.rotation);

    console.log('Player vehicle created at', startPos.position);

    // Create AI vehicles
    const aiCount = 5;
    const aiNames = ['Shadow', 'Blaze', 'Thunder', 'Lightning', 'Storm'];

    for (let i = 0; i < aiCount; i++) {
      const aiStartPos = this.track.getStartPosition(i + 1);
      const aiConfig = { ...vehicleConfig };
      aiConfig.position = aiStartPos.position;

      const aiVehicle = new Vehicle(aiConfig, this.physics);
      aiVehicle.reset(aiStartPos.position, aiStartPos.rotation);

      // Create AI driver
      const difficulty = i < 2 ? AIDifficulty.Hard : i < 4 ? AIDifficulty.Medium : AIDifficulty.Easy;
      const aiDriver = new AIDriver(aiVehicle, this.track, difficulty);
      aiDriver.setRubberbandTarget(this.playerVehicle);

      this.aiVehicles.push(aiVehicle);
      this.aiDrivers.push(aiDriver);

      console.log(`AI vehicle ${i + 1} (${aiNames[i]}) created with ${difficulty} difficulty`);
    }

    // Create vehicle meshes
    this.createVehicleMeshes();
  }

  /**
   * Create visual meshes for vehicles
   */
  private createVehicleMeshes(): void {
    // Player vehicle (blue)
    const playerMaterial = new StandardPBRMaterial({
      baseColor: new Color(0, 0.5, 1),
      metallic: 0.8,
      roughness: 0.2
    });

    const playerMesh = GeometryGenerator.box(1.2, 0.6, 2.5);
    const playerNode = new SceneNode('PlayerVehicle');
    playerNode.setMesh(playerMesh);
    playerNode.setMaterial(playerMaterial);
    this.scene.add(playerNode);

    // AI vehicles (red)
    this.aiVehicles.forEach((vehicle, index) => {
      const aiMaterial = new StandardPBRMaterial({
        baseColor: new Color(1, 0, 0),
        metallic: 0.8,
        roughness: 0.2
      });

      const aiMesh = GeometryGenerator.box(1.2, 0.6, 2.5);
      const aiNode = new SceneNode(`AIVehicle${index}`);
      aiNode.setMesh(aiMesh);
      aiNode.setMaterial(aiMaterial);
      this.scene.add(aiNode);
    });
  }

  /**
   * Setup race manager
   */
  private setupRaceManager(): void {
    this.raceManager = new RaceManager(this.track);

    // Add racers
    this.raceManager.addRacer(this.playerVehicle, 'Player', true);

    const aiNames = ['Shadow', 'Blaze', 'Thunder', 'Lightning', 'Storm'];
    this.aiVehicles.forEach((vehicle, index) => {
      this.raceManager.addRacer(vehicle, aiNames[index], false);
    });

    // Setup event handlers
    this.raceManager.on('stateChange', (state: RaceState) => {
      console.log('Race state changed to:', state);
    });

    this.raceManager.on('lapComplete', (racer) => {
      console.log(`${racer.name} completed lap ${racer.currentLap - 1}`);
    });

    this.raceManager.on('raceFinish', (results) => {
      console.log('Race finished!', results);
      this.hud.showResults(results);
    });

    // Start race after 2 seconds
    setTimeout(() => {
      this.raceManager.startRace();
    }, 2000);
  }

  /**
   * Setup input controls
   */
  private setupInput(): void {
    this.input = new InputManager(this.engine.canvas!);

    const gameplayContext = this.input.createContext({ name: 'gameplay' });

    // Throttle
    const throttleAction = gameplayContext.addAction({ name: 'throttle', valueType: 'button' });
    throttleAction.addBinding({ deviceType: 'keyboard', path: 'W' });
    throttleAction.addBinding({ deviceType: 'keyboard', path: 'ArrowUp' });

    // Brake
    const brakeAction = gameplayContext.addAction({ name: 'brake', valueType: 'button' });
    brakeAction.addBinding({ deviceType: 'keyboard', path: 'S' });
    brakeAction.addBinding({ deviceType: 'keyboard', path: 'ArrowDown' });

    // Steer Left
    const steerLeftAction = gameplayContext.addAction({ name: 'steerLeft', valueType: 'button' });
    steerLeftAction.addBinding({ deviceType: 'keyboard', path: 'A' });
    steerLeftAction.addBinding({ deviceType: 'keyboard', path: 'ArrowLeft' });

    // Steer Right
    const steerRightAction = gameplayContext.addAction({ name: 'steerRight', valueType: 'button' });
    steerRightAction.addBinding({ deviceType: 'keyboard', path: 'D' });
    steerRightAction.addBinding({ deviceType: 'keyboard', path: 'ArrowRight' });

    // Handbrake
    const handbrakeAction = gameplayContext.addAction({ name: 'handbrake', valueType: 'button' });
    handbrakeAction.addBinding({ deviceType: 'keyboard', path: 'Space' });

    // Nitro
    const nitroAction = gameplayContext.addAction({ name: 'nitro', valueType: 'button' });
    nitroAction.addBinding({ deviceType: 'keyboard', path: 'ShiftLeft' });
    nitroAction.addBinding({ deviceType: 'keyboard', path: 'ShiftRight' });

    // Camera change
    const cameraAction = gameplayContext.addAction({ name: 'camera', valueType: 'button' });
    cameraAction.addBinding({ deviceType: 'keyboard', path: 'C' });

    // Reset
    const resetAction = gameplayContext.addAction({ name: 'reset', valueType: 'button' });
    resetAction.addBinding({ deviceType: 'keyboard', path: 'R' });

    gameplayContext.enable();
  }

  /**
   * Setup audio system
   */
  private async setupAudio(): Promise<void> {
    this.audio = new AudioContext();
    await this.audio.init();

    // In a real game, you would load actual audio files
    console.log('Audio system initialized (using synthetic sounds)');
  }

  /**
   * Create HUD
   */
  private createHUD(): void {
    this.hud = new RacingHUD('hud-overlay', this.raceManager, this.playerVehicle);
  }

  /**
   * Setup camera
   */
  private setupCamera(): void {
    this.camera = new Camera();
    this.camera.setPerspective(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // Handle window resize
    window.addEventListener('resize', () => {
      this.camera.setPerspective(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    });
  }

  /**
   * Hide loading screen
   */
  private hideLoadingScreen(): void {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.classList.add('hidden');
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);
    }
  }

  /**
   * Start the game loop
   */
  public start(): void {
    console.log('Starting game loop...');
    this.engine.start();

    // Main game loop
    this.engine.on('update', (deltaTime: number) => {
      this.update(deltaTime);
    });

    this.engine.on('render', () => {
      this.render();
    });
  }

  /**
   * Update game logic
   */
  private update(deltaTime: number): void {
    // Update input
    this.updateInput();

    // Update physics
    this.physics.step(deltaTime);

    // Only update vehicles during race
    if (this.raceManager.getState() === RaceState.Racing) {
      // Update player vehicle
      this.playerVehicle.update(deltaTime, this.physics);

      // Update AI vehicles
      this.aiVehicles.forEach((vehicle, index) => {
        const allVehicles = [this.playerVehicle, ...this.aiVehicles];
        this.aiDrivers[index].update(deltaTime, allVehicles);
        vehicle.update(deltaTime, this.physics);
      });
    }

    // Update race manager
    this.raceManager.update(deltaTime);

    // Update camera
    this.updateCamera(deltaTime);

    // Update HUD
    this.hud.update(deltaTime);
  }

  /**
   * Update input controls
   */
  private updateInput(): void {
    const throttle = this.input.getAction('gameplay', 'throttle');
    const brake = this.input.getAction('gameplay', 'brake');
    const steerLeft = this.input.getAction('gameplay', 'steerLeft');
    const steerRight = this.input.getAction('gameplay', 'steerRight');
    const handbrake = this.input.getAction('gameplay', 'handbrake');
    const nitro = this.input.getAction('gameplay', 'nitro');
    const camera = this.input.getAction('gameplay', 'camera');
    const reset = this.input.getAction('gameplay', 'reset');

    // Throttle/Brake
    this.controls.throttle = throttle?.isPressed ? 1 : 0;
    this.controls.brake = brake?.isPressed ? 1 : 0;

    // Steering
    let steer = 0;
    if (steerLeft?.isPressed) steer -= 1;
    if (steerRight?.isPressed) steer += 1;
    this.controls.steer = steer;

    // Handbrake
    this.controls.handbrake = handbrake?.isPressed || false;

    // Nitro
    this.controls.nitro = nitro?.isPressed || false;

    // Camera toggle
    if (camera?.wasPressed) {
      this.cycleCameraMode();
    }

    // Reset vehicle
    if (reset?.wasPressed) {
      this.resetPlayerVehicle();
    }

    // Apply controls to player vehicle
    if (this.raceManager.getState() === RaceState.Racing) {
      this.playerVehicle.setControls(
        this.controls.throttle,
        this.controls.brake,
        this.controls.steer,
        this.controls.handbrake,
        this.controls.nitro
      );
    }
  }

  /**
   * Cycle through camera modes
   */
  private cycleCameraMode(): void {
    const modes: ('chase' | 'hood' | 'bumper' | 'orbit')[] = ['chase', 'hood', 'bumper', 'orbit'];
    const currentIndex = modes.indexOf(this.cameraMode);
    this.cameraMode = modes[(currentIndex + 1) % modes.length];

    console.log('Camera mode:', this.cameraMode);
  }

  /**
   * Reset player vehicle to track
   */
  private resetPlayerVehicle(): void {
    const startPos = this.track.getStartPosition(0);
    this.playerVehicle.reset(startPos.position.add(new Vector3(0, 2, 0)), startPos.rotation);
  }

  /**
   * Update camera position and rotation
   */
  private updateCamera(deltaTime: number): void {
    const vehiclePos = this.playerVehicle.getStats().position;
    const vehicleRot = this.playerVehicle.getStats().rotation;

    let targetPos: Vector3;
    let lookAtPos: Vector3;

    switch (this.cameraMode) {
      case 'chase':
        // Chase camera behind vehicle
        const backOffset = new Vector3(0, 3, 8).applyQuaternion(vehicleRot);
        targetPos = vehiclePos.add(backOffset);
        lookAtPos = vehiclePos.add(new Vector3(0, 1, 0));
        break;

      case 'hood':
        // Hood camera
        const hoodOffset = new Vector3(0, 1.5, 1).applyQuaternion(vehicleRot);
        targetPos = vehiclePos.add(hoodOffset);
        lookAtPos = vehiclePos.add(new Vector3(0, 1, -10).applyQuaternion(vehicleRot));
        break;

      case 'bumper':
        // Bumper camera
        const bumperOffset = new Vector3(0, 0.8, 2.5).applyQuaternion(vehicleRot);
        targetPos = vehiclePos.add(bumperOffset);
        lookAtPos = vehiclePos.add(new Vector3(0, 0.8, -10).applyQuaternion(vehicleRot));
        break;

      case 'orbit':
        // Orbiting camera
        const time = Date.now() / 1000;
        const radius = 15;
        const orbitX = Math.cos(time * 0.5) * radius;
        const orbitZ = Math.sin(time * 0.5) * radius;
        targetPos = vehiclePos.add(new Vector3(orbitX, 8, orbitZ));
        lookAtPos = vehiclePos;
        break;
    }

    // Smooth camera movement
    const smoothFactor = 10 * deltaTime;
    this.cameraTarget = this.cameraTarget.lerp(targetPos, smoothFactor);

    this.camera.setPosition(this.cameraTarget);
    this.camera.lookAt(lookAtPos);
  }

  /**
   * Render scene
   */
  private render(): void {
    // Update vehicle mesh transforms
    const playerNode = this.scene.findByName('PlayerVehicle');
    if (playerNode) {
      playerNode.setTransform(this.playerVehicle.meshTransform);
    }

    this.aiVehicles.forEach((vehicle, index) => {
      const aiNode = this.scene.findByName(`AIVehicle${index}`);
      if (aiNode) {
        aiNode.setTransform(vehicle.meshTransform);
      }
    });

    // Render scene
    this.engine.renderer.render(this.scene, this.camera);
  }
}

// ============================================================================
// GAME ENTRY POINT
// ============================================================================

async function main() {
  try {
    console.log('=== G3D Racing Game ===');
    console.log('Controls:');
    console.log('  W/Up Arrow    - Accelerate');
    console.log('  S/Down Arrow  - Brake');
    console.log('  A/Left Arrow  - Steer Left');
    console.log('  D/Right Arrow - Steer Right');
    console.log('  Space         - Handbrake (Drift)');
    console.log('  Shift         - Nitro Boost');
    console.log('  C             - Change Camera');
    console.log('  R             - Reset Vehicle');
    console.log('=====================');

    const game = new RacingGame();
    await game.init();
    game.start();

    console.log('Game started! Good luck!');
  } catch (error) {
    console.error('Failed to start game:', error);

    // Show error to user
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.innerHTML = `
        <div style="color: #ff6464; text-align: center;">
          <h1>Failed to Load Game</h1>
          <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
          <p style="margin-top: 20px; font-size: 14px;">
            Please check the console for details.
          </p>
        </div>
      `;
    }
  }
}

// Start the game
main();
