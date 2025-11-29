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
import { ProceduralCarBuilder, CAR_STYLES } from './ProceduralCarBuilder';
import { ProceduralTextureGenerator, CarPaintPresets } from './ProceduralTextureGenerator';

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
    console.log('[init] Setting up race manager...');
    this.setupRaceManager();

    // Setup input
    console.log('[init] Setting up input...');
    this.setupInput();
    this.setupDirectKeyboard();  // Direct keyboard bypass

    // Setup audio
    console.log('[init] Setting up audio...');
    await this.setupAudio();

    // Create HUD
    console.log('[init] Creating HUD...');
    this.createHUD();

    // Setup camera
    console.log('[init] Setting up camera...');
    this.setupCamera();

    // Hide loading screen
    console.log('[init] Hiding loading screen...');
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

    // CRITICAL: Set canvas pixel dimensions (not just CSS size)
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    console.log(`Canvas sized to ${canvas.width}x${canvas.height}`);

    const config: EngineConfig = {
      canvas,
      width: canvas.width,
      height: canvas.height,
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

    // Add directional light (sun) - DRAMATIC CONTRAST for AAA 3D shading
    // Light from front-left and above - creates good NdotL on car faces visible from behind
    // More horizontal angle to light vertical car faces better
    const sunDirection = new Vector3(0.5, -0.7, -0.5).normalize(); // High sun angle
    this.directionalLight = new DirectionalLight(
      sunDirection,
      new Color(1.0, 0.95, 0.85),  // Warm sunlight
      80.0  // High intensity for AAA specular highlights
    );
    this.directionalLight.setShadowsEnabled(true);

    // CRITICAL: Register light with renderer's light manager for PBR shader
    if (this.engine && this.engine.renderer) {
      const lightManager = this.engine.renderer.getLightManager();
      lightManager.addLight(this.directionalLight);
      console.log('[Light] Registered DirectionalLight with intensity 50.0, direction:', sunDirection);
      console.log('[Light] Light type:', this.directionalLight.type);
      console.log('[Light] Light getEffectiveIntensity:', this.directionalLight.getEffectiveIntensity());
    } else {
      console.warn('[Light] Could not register light - renderer not ready');
    }

    // Configure ambient light via environment
    this.scene.environment.ambientColor = new Color(0.5, 0.6, 0.7);
    this.scene.environment.ambientIntensity = 0.4;  // Balanced ambient

    // Add sky
    this.scene.environment.clearColor = new Color(0.4, 0.6, 0.9);
    this.scene.environment.skybox = { type: 'color', color: new Color(0.4, 0.6, 0.9) };

    // Add ground plane
    this.createGround();
  }

  /**
   * Create ground plane with multiple layers for visual depth
   */
  private createGround(): void {
    // Main grass ground - richer, darker green for more contrast
    const groundMaterial = new StandardPBRMaterial({
      name: 'GroundMaterial',
      albedo: new Color(0.15, 0.4, 0.12),  // Deeper grass green
      roughness: 0.9,
      metallic: 0.0,
    });

    // Use a smaller, closer ground plane for better visibility
    const groundGeometry = GeometryGenerator.plane(500, 500, 4, 4);

    const groundNode = new SceneNode('Ground');
    groundNode.setMesh(groundGeometry);
    groundNode.setMaterial(groundMaterial);
    // Position ground slightly below y=0 to avoid z-fighting with track
    groundNode.setPosition(new Vector3(0, -0.05, 0));
    this.scene.add(groundNode);
    console.log('Ground plane created at y=-0.05');

    // Add a track road surface - dark asphalt
    const trackSurfaceMaterial = new StandardPBRMaterial('TrackSurfaceMaterial');
    trackSurfaceMaterial.albedo = new Color(0.15, 0.15, 0.18);  // Dark asphalt
    trackSurfaceMaterial.roughness = 0.8;
    trackSurfaceMaterial.metallic = 0.0;

    // Create a simple oval track surface
    const trackWidth = 15;
    const trackRadius = 100;
    const trackSegments = 64;

    // Generate track mesh using a custom loop (circular track with width)
    // For now, add a simpler ground marker at start position
    const startMarkerGeom = GeometryGenerator.box(trackWidth, 0.1, 30);
    const startMarkerNode = new SceneNode('StartLine');
    startMarkerNode.setMesh(startMarkerGeom);
    const startMaterial = new StandardPBRMaterial('StartLineMaterial');
    startMaterial.albedo = new Color(1.0, 1.0, 1.0);  // White start line
    startMaterial.roughness = 0.6;
    startMaterial.metallic = 0.0;
    startMarkerNode.setMaterial(startMaterial);
    startMarkerNode.setPosition(new Vector3(trackRadius, 0.02, 0));  // At track start
    this.scene.add(startMarkerNode);
    console.log('Start line marker created');
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
   * Create a car-shaped mesh with body, cabin, and wheels
   */
  private createCarMesh(name: string, bodyColor: Color): SceneNode {
    const carNode = new SceneNode(name);

    // Car body material - Quality car paint (not pure metal)
    const bodyMaterial = new StandardPBRMaterial({
      name: `${name}_BodyMaterial`,
      albedo: bodyColor,
      metallic: 0.2,     // Car paint - low metallic, glossy clearcoat finish
      roughness: 0.3,    // Glossy car paint
    });

    // SCALE: Make car 1.5x larger for better visibility
    const scale = 1.5;

    // Main body - lower section (wide and flat)
    const bodyLower = GeometryGenerator.box(2.4 * scale, 0.5 * scale, 4.8 * scale);
    carNode.setMesh(bodyLower);
    carNode.setMaterial(bodyMaterial);
    carNode.transform.position.y = 0.35 * scale; // Position so bottom is near ground

    // Add cabin (upper section) as child node - tinted glass
    const cabinMaterial = new StandardPBRMaterial({
      name: `${name}_CabinMaterial`,
      albedo: new Color(0.05, 0.08, 0.12),  // Dark tinted glass
      metallic: 0.0,   // Glass is not metallic
      roughness: 0.1,  // Smooth
    });

    const cabinMesh = GeometryGenerator.box(1.8 * scale, 0.5 * scale, 2.0 * scale);
    const cabinNode = new SceneNode(`${name}_Cabin`);
    cabinNode.setMesh(cabinMesh);
    cabinNode.setMaterial(cabinMaterial);
    cabinNode.transform.position.set(0, 0.5 * scale, -0.2 * scale);
    carNode.addChild(cabinNode);

    // Add front hood as child node
    const hoodMaterial = new StandardPBRMaterial({
      name: `${name}_HoodMaterial`,
      albedo: bodyColor,
      metallic: 0.25,   // Slightly more metallic than body
      roughness: 0.25,  // Slightly glossier than body
    });

    const hoodMesh = GeometryGenerator.box(2.0 * scale, 0.2 * scale, 1.5 * scale);
    const hoodNode = new SceneNode(`${name}_Hood`);
    hoodNode.setMesh(hoodMesh);
    hoodNode.setMaterial(hoodMaterial);
    hoodNode.transform.position.set(0, 0.35 * scale, 1.4 * scale);
    carNode.addChild(hoodNode);

    // Add rear spoiler - carbon fiber look
    const spoilerMaterial = new StandardPBRMaterial({
      name: `${name}_SpoilerMaterial`,
      albedo: new Color(0.02, 0.02, 0.02),
      metallic: 0.1,
      roughness: 0.5,
    });

    const spoilerMesh = GeometryGenerator.box(2.2 * scale, 0.08 * scale, 0.2 * scale);
    const spoilerNode = new SceneNode(`${name}_Spoiler`);
    spoilerNode.setMesh(spoilerMesh);
    spoilerNode.setMaterial(spoilerMaterial);
    spoilerNode.transform.position.set(0, 0.75 * scale, -2.0 * scale);
    carNode.addChild(spoilerNode);

    // Add wheels (4 cylinders) - rubber tires with alloy rims
    const wheelMaterial = new StandardPBRMaterial({
      name: `${name}_WheelMaterial`,
      albedo: new Color(0.02, 0.02, 0.02),
      metallic: 0.0,
      roughness: 0.9,  // Matte rubber
    });

    // Rim material - shiny chrome
    const rimMaterial = new StandardPBRMaterial({
      name: `${name}_RimMaterial`,
      albedo: new Color(0.9, 0.9, 0.95),
      metallic: 0.95,
      roughness: 0.1,
    });

    const wheelPositions = [
      { x: -1.0 * scale, y: -0.1 * scale, z: 1.4 * scale },   // Front left
      { x: 1.0 * scale, y: -0.1 * scale, z: 1.4 * scale },    // Front right
      { x: -1.0 * scale, y: -0.1 * scale, z: -1.3 * scale },  // Rear left
      { x: 1.0 * scale, y: -0.1 * scale, z: -1.3 * scale },   // Rear right
    ];

    wheelPositions.forEach((pos, i) => {
      // Tire
      const wheelMesh = GeometryGenerator.cylinder(0.35 * scale, 0.25 * scale, 16, 1);
      const wheelNode = new SceneNode(`${name}_Wheel${i}`);
      wheelNode.setMesh(wheelMesh);
      wheelNode.setMaterial(wheelMaterial);
      wheelNode.transform.position.set(pos.x, pos.y, pos.z);
      wheelNode.setRotation(Quaternion.fromEuler(0, 0, Math.PI / 2));
      carNode.addChild(wheelNode);

      // Rim (smaller cylinder inside)
      const rimMesh = GeometryGenerator.cylinder(0.25 * scale, 0.26 * scale, 12, 1);
      const rimNode = new SceneNode(`${name}_Rim${i}`);
      rimNode.setMesh(rimMesh);
      rimNode.setMaterial(rimMaterial);
      rimNode.transform.position.set(pos.x, pos.y, pos.z);
      rimNode.setRotation(Quaternion.fromEuler(0, 0, Math.PI / 2));
      carNode.addChild(rimNode);
    });

    // Add HEADLIGHTS (emissive glowing)
    const headlightMaterial = new StandardPBRMaterial({
      name: `${name}_HeadlightMaterial`,
      albedo: new Color(0.9, 0.95, 1.0),  // Slightly blue-white
      metallic: 0.0,
      roughness: 0.1,
      emission: new Color(1.0, 0.98, 0.9),
      emissionIntensity: 3.0,  // Glowing
    });

    const headlightPositions = [
      { x: -0.7 * scale, y: 0.15 * scale, z: 2.3 * scale },  // Left
      { x: 0.7 * scale, y: 0.15 * scale, z: 2.3 * scale },   // Right
    ];

    headlightPositions.forEach((pos, i) => {
      const lightMesh = GeometryGenerator.box(0.3 * scale, 0.15 * scale, 0.08 * scale);
      const lightNode = new SceneNode(`${name}_Headlight${i}`);
      lightNode.setMesh(lightMesh);
      lightNode.setMaterial(headlightMaterial);
      lightNode.transform.position.set(pos.x, pos.y, pos.z);
      carNode.addChild(lightNode);
    });

    // Add TAILLIGHTS (red emissive)
    const taillightMaterial = new StandardPBRMaterial({
      name: `${name}_TaillightMaterial`,
      albedo: new Color(1.0, 0.1, 0.1),  // Red
      metallic: 0.0,
      roughness: 0.1,
      emission: new Color(1.0, 0.0, 0.0),
      emissionIntensity: 2.0,
    });

    const taillightPositions = [
      { x: -0.8 * scale, y: 0.25 * scale, z: -2.35 * scale },  // Left
      { x: 0.8 * scale, y: 0.25 * scale, z: -2.35 * scale },   // Right
    ];

    taillightPositions.forEach((pos, i) => {
      const lightMesh = GeometryGenerator.box(0.35 * scale, 0.12 * scale, 0.06 * scale);
      const lightNode = new SceneNode(`${name}_Taillight${i}`);
      lightNode.setMesh(lightMesh);
      lightNode.setMaterial(taillightMaterial);
      lightNode.transform.position.set(pos.x, pos.y, pos.z);
      carNode.addChild(lightNode);
    });

    console.log(`[CAR DEBUG] Created detailed car mesh: ${name} with ${carNode.children.length} child nodes (inc. lights)`);

    return carNode;
  }

  /**
   * DEPRECATED: Complex car mesh with child nodes - keeping for reference
   */
  private createCarMeshDetailed(name: string, bodyColor: Color): SceneNode {
    const carNode = new SceneNode(name);

    const bodyMaterial = new StandardPBRMaterial(`${name}_BodyMaterial`);
    bodyMaterial.albedo = bodyColor;
    bodyMaterial.metallic = 0.85;
    bodyMaterial.roughness = 0.2;

    const bodyMesh = GeometryGenerator.box(2.0, 0.5, 4.0);
    const bodyNode = new SceneNode(`${name}_Body`);
    bodyNode.setMesh(bodyMesh);
    bodyNode.setMaterial(bodyMaterial);
    bodyNode.setPosition(new Vector3(0, 0.3, 0));
    carNode.addChild(bodyNode);

    // Cabin (upper part) - sleek racing car look
    const cabinMaterial = new StandardPBRMaterial(`${name}_CabinMaterial`);
    cabinMaterial.albedo = new Color(0.1, 0.1, 0.1);  // Dark glass
    cabinMaterial.metallic = 0.3;
    cabinMaterial.roughness = 0.1;

    const cabinMesh = GeometryGenerator.box(1.6, 0.5, 1.8);
    const cabinNode = new SceneNode(`${name}_Cabin`);
    cabinNode.setMesh(cabinMesh);
    cabinNode.setMaterial(cabinMaterial);
    cabinNode.setPosition(new Vector3(0, 0.75, -0.3));
    carNode.addChild(cabinNode);

    // Hood (front section) - angled
    const hoodMaterial = new StandardPBRMaterial(`${name}_HoodMaterial`);
    hoodMaterial.albedo = bodyColor;
    hoodMaterial.metallic = 0.9;
    hoodMaterial.roughness = 0.15;

    const hoodMesh = GeometryGenerator.box(1.8, 0.3, 1.2);
    const hoodNode = new SceneNode(`${name}_Hood`);
    hoodNode.setMesh(hoodMesh);
    hoodNode.setMaterial(hoodMaterial);
    hoodNode.setPosition(new Vector3(0, 0.55, 1.3));
    carNode.addChild(hoodNode);

    // Rear spoiler
    const spoilerMaterial = new StandardPBRMaterial(`${name}_SpoilerMaterial`);
    spoilerMaterial.albedo = new Color(0.2, 0.2, 0.2);
    spoilerMaterial.metallic = 0.5;
    spoilerMaterial.roughness = 0.3;

    const spoilerMesh = GeometryGenerator.box(2.2, 0.1, 0.3);
    const spoilerNode = new SceneNode(`${name}_Spoiler`);
    spoilerNode.setMesh(spoilerMesh);
    spoilerNode.setMaterial(spoilerMaterial);
    spoilerNode.setPosition(new Vector3(0, 1.0, -1.8));
    carNode.addChild(spoilerNode);

    // Wheels (4 cylinders)
    const wheelMaterial = new StandardPBRMaterial(`${name}_WheelMaterial`);
    wheelMaterial.albedo = new Color(0.1, 0.1, 0.1);
    wheelMaterial.metallic = 0.2;
    wheelMaterial.roughness = 0.8;

    const wheelPositions = [
      new Vector3(-0.9, 0, 1.2),   // Front left
      new Vector3(0.9, 0, 1.2),    // Front right
      new Vector3(-0.9, 0, -1.2),  // Rear left
      new Vector3(0.9, 0, -1.2),   // Rear right
    ];

    wheelPositions.forEach((pos, i) => {
      // cylinder(radius, height, radialSegments, heightSegments)
      const wheelMesh = GeometryGenerator.cylinder(0.35, 0.3, 16, 1);
      const wheelNode = new SceneNode(`${name}_Wheel${i}`);
      wheelNode.setMesh(wheelMesh);
      wheelNode.setMaterial(wheelMaterial);
      wheelNode.setPosition(pos);
      wheelNode.setRotation(Quaternion.fromEuler(0, 0, Math.PI / 2));
      carNode.addChild(wheelNode);
    });

    return carNode;
  }

  /**
   * Create visual meshes for vehicles using procedural car builder
   */
  private createVehicleMeshes(): void {
    console.log('[createVehicleMeshes] Creating detailed procedural car models...');

    // Player vehicle - Blue Supercar with metallic paint
    // Bright saturated blue for visibility and testing
    const playerColor = new Color(0.15, 0.35, 0.9);  // Brighter blue for better visibility
    const playerNode = ProceduralCarBuilder.createSupercar('PlayerVehicle', playerColor);

    // Optional: Add textures to player car (if texture system is working)
    try {
      const playerPaintTexture = CarPaintPresets.createMetallicBlue();
      const playerNormalMap = ProceduralTextureGenerator.createPaintNormalMap();
      // Note: Textures would need to be applied to materials here if texture system is fully integrated
      console.log('[createVehicleMeshes] Generated player car textures');
    } catch (err) {
      console.warn('[createVehicleMeshes] Texture generation failed, using solid colors:', err);
    }

    this.scene.add(playerNode);
    console.log('[createVehicleMeshes] Player vehicle (Supercar) mesh added to scene');

    // AI vehicles with different car types and colors (linear space, darker for proper PBR)
    const aiConfigs = [
      { name: 'AIVehicle0', color: new Color(0.6, 0.05, 0.05), type: 'sports' },      // Red Sports Car
      { name: 'AIVehicle1', color: new Color(0.7, 0.25, 0.02), type: 'muscle' },      // Orange Muscle Car
      { name: 'AIVehicle2', color: new Color(0.7, 0.6, 0.03), type: 'rally' },        // Yellow Rally Car
      { name: 'AIVehicle3', color: new Color(0.3, 0.05, 0.5), type: 'supercar' },     // Purple Supercar
      { name: 'AIVehicle4', color: new Color(0.05, 0.5, 0.4), type: 'sports' },       // Teal Sports Car
    ];

    this.aiVehicles.forEach((vehicle, index) => {
      const config = aiConfigs[index % aiConfigs.length];
      let aiNode: SceneNode;

      // Create different car types for variety
      switch (config.type) {
        case 'sports':
          aiNode = ProceduralCarBuilder.createSportsCar(config.name, config.color);
          break;
        case 'muscle':
          aiNode = ProceduralCarBuilder.createMuscleCar(config.name, config.color);
          break;
        case 'rally':
          aiNode = ProceduralCarBuilder.createRallyCar(config.name, config.color);
          break;
        case 'supercar':
          aiNode = ProceduralCarBuilder.createSupercar(config.name, config.color);
          break;
        default:
          aiNode = ProceduralCarBuilder.createSportsCar(config.name, config.color);
      }

      this.scene.add(aiNode);
      console.log(`[createVehicleMeshes] AI vehicle ${index} (${config.type}) added: ${config.name}`);
    });

    console.log(`[createVehicleMeshes] All ${this.aiVehicles.length + 1} detailed car models created successfully`);
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

    // Start race immediately
    this.raceManager.startRace();
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
    try {
      this.audio = new AudioContext();
      // Don't await - audio init can hang waiting for user gesture
      this.audio.init().catch(err => {
        console.warn('Audio init failed (will retry on user interaction):', err);
      });
      console.log('Audio system initialized (using synthetic sounds)');
    } catch (err) {
      console.warn('Audio setup failed:', err);
    }
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
    // Convert 75 degrees to radians (FOV in radians)
    const fovRadians = 75 * Math.PI / 180;
    this.camera.setPerspective(fovRadians, window.innerWidth / window.innerHeight, 0.1, 1000);

    // Set initial camera position behind the player
    const vehiclePos = this.playerVehicle.getStats().position;
    this.cameraTarget = vehiclePos.add(new Vector3(0, 5, 15));
    this.camera.setPosition(this.cameraTarget);
    this.camera.lookAt(vehiclePos);

    console.log(`Camera setup: FOV=${fovRadians.toFixed(3)}rad, pos=${this.cameraTarget.toString()}`);

    // Handle window resize
    window.addEventListener('resize', () => {
      const fov = 75 * Math.PI / 180;
      this.camera.setPerspective(fov, window.innerWidth / window.innerHeight, 0.1, 1000);
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

    // Update vehicles (allow driving during countdown too for responsiveness)
    const raceState = this.raceManager.getState();
    if (raceState === RaceState.Racing || raceState === RaceState.Countdown) {
      // Update player vehicle
      this.playerVehicle.update(deltaTime, this.physics);

      // Update AI vehicles (only during actual racing)
      if (raceState === RaceState.Racing) {
        this.aiVehicles.forEach((vehicle, index) => {
          const allVehicles = [this.playerVehicle, ...this.aiVehicles];
          this.aiDrivers[index].update(deltaTime, allVehicles);
          vehicle.update(deltaTime, this.physics);
        });
      }
    }

    // Update race manager
    this.raceManager.update(deltaTime);

    // Update camera
    this.updateCamera(deltaTime);

    // Update HUD
    this.hud.update(deltaTime);
  }

  // Direct keyboard state (bypassing broken InputManager)
  private keys: { [key: string]: boolean } = {};

  /**
   * Setup direct keyboard listeners
   */
  private setupDirectKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      console.log('Key down:', e.code);

      // Debug mode controls (0-9 keys for modes 0-9, F1-F10 for modes 10-19)
      const modeNames: { [key: number]: string } = {
        0: 'Normal PBR',
        1: 'Normals (RGB)',
        2: 'Albedo only',
        3: 'Metallic (grayscale)',
        4: 'Roughness (grayscale)',
        5: 'Direct lighting Lo',
        6: 'Light count (R=0,G=1,B=2+)',
        7: 'NdotL (Lambert term)',
        8: 'Light direction (RGB)',
        9: 'Raw Lo (scaled)',
        10: 'Simple Lambert (no PBR)',
        11: 'Pure NdotL grayscale',
        12: 'NdotL color bands',
        13: 'Pure Lambert shading',
        14: 'Lo vs Lambert split',
        15: 'SIMPLE SHADING (ultimate test)',
        16: 'POSITION AS COLOR (tests varying pipeline)',
        17: 'RAW NORMAL ATTRIBUTE (a_normal direct)',
        18: 'TEXCOORD AS COLOR (tests attribute 2)',
        19: 'MAGENTA IF NORMAL ZERO (zero detection)'
      };

      let mode = -1;
      if (e.code.startsWith('Digit')) {
        mode = parseInt(e.code.replace('Digit', ''));
      } else if (e.code === 'F1') {
        mode = 10;
        e.preventDefault(); // Prevent browser help
      } else if (e.code === 'F2') {
        mode = 11;
        e.preventDefault();
      } else if (e.code === 'F3') {
        mode = 12;
        e.preventDefault();
      } else if (e.code === 'F4') {
        mode = 13;
        e.preventDefault();
      } else if (e.code === 'F5') {
        mode = 14;
        e.preventDefault();
      } else if (e.code === 'F6') {
        mode = 15;
        e.preventDefault();
      } else if (e.code === 'F7') {
        mode = 16;
        e.preventDefault();
      } else if (e.code === 'F8') {
        mode = 17;
        e.preventDefault();
      } else if (e.code === 'F9') {
        mode = 18;
        e.preventDefault();
      } else if (e.code === 'F10') {
        mode = 19;
        e.preventDefault();
      }

      if (mode >= 0) {
        this.engine.renderer.setDebugMode(mode);
        console.log(`Debug mode ${mode}: ${modeNames[mode] || 'Unknown'}`);
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    console.log('Direct keyboard input enabled');
  }

  /**
   * Update input controls
   */
  private updateInput(): void {
    // Use direct keyboard state
    this.controls.throttle = (this.keys['KeyW'] || this.keys['ArrowUp']) ? 1 : 0;
    this.controls.brake = (this.keys['KeyS'] || this.keys['ArrowDown']) ? 1 : 0;

    // Steering
    let steer = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) steer -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) steer += 1;
    this.controls.steer = steer;

    // Handbrake
    this.controls.handbrake = !!this.keys['Space'];

    // Nitro
    this.controls.nitro = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);

    // Camera toggle (on key down, not held)
    if (this.keys['KeyC']) {
      this.keys['KeyC'] = false; // Prevent repeat
      this.cycleCameraMode();
    }

    // Reset vehicle
    if (this.keys['KeyR']) {
      this.keys['KeyR'] = false; // Prevent repeat
      this.resetPlayerVehicle();
      console.log('Vehicle reset!');
    }

    // Debug: log controls if any are active
    if (this.controls.throttle || this.controls.brake || this.controls.steer !== 0) {
      console.log(`Controls: throttle=${this.controls.throttle}, brake=${this.controls.brake}, steer=${this.controls.steer}`);
    }

    // Apply controls to player vehicle (allow during countdown too)
    const state = this.raceManager.getState();
    if (state === RaceState.Racing || state === RaceState.Countdown) {
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

    // Chase camera - closer to vehicle for better visibility
    // Position camera 6 units behind and 3 units above vehicle
    const forward = new Vector3(0, 0, -1).applyQuaternion(vehicleRot);
    const cameraOffset = forward.scale(-6).add(new Vector3(0, 3, 0));
    const targetPos = vehiclePos.add(cameraOffset);
    const lookAtPos = vehiclePos.add(new Vector3(0, 0.8, 0));

    // Smooth camera movement
    const smoothFactor = Math.min(5 * deltaTime, 1);
    this.cameraTarget = this.cameraTarget.lerp(targetPos, smoothFactor);

    this.camera.setPosition(this.cameraTarget);
    this.camera.lookAt(lookAtPos);
  }

  // Frame counter for debug logging
  private frameCount: number = 0;

  /**
   * Render scene
   */
  private render(): void {
    this.frameCount++;

    // Update vehicle mesh transforms
    const playerNode = this.scene.findByName('PlayerVehicle');
    if (playerNode) {
      // Get vehicle position directly and set it on the node
      const pos = this.playerVehicle.getStats().position;
      const rot = this.playerVehicle.getStats().rotation;
      playerNode.setPosition(pos);
      playerNode.setRotation(rot);

      // Force update world matrices for all children
      playerNode.transform.updateWorldMatrix(true);

      // Debug log first few frames
      if (this.frameCount <= 3) {
        console.log(`[RENDER DEBUG] Frame ${this.frameCount}: PlayerVehicle pos=(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
        console.log(`[RENDER DEBUG] PlayerVehicle children:`, playerNode.children.length);
        playerNode.children.forEach((child: any) => {
          const worldPos = child.transform.worldPosition;
          console.log(`[RENDER DEBUG]   Child: ${child.name}, hasMesh: ${!!child.mesh}, worldPos: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`);
        });
      }
    } else if (this.frameCount === 1) {
      console.error('[RENDER DEBUG] PlayerVehicle node NOT FOUND in scene!');
    }

    this.aiVehicles.forEach((vehicle, index) => {
      const aiNode = this.scene.findByName(`AIVehicle${index}`);
      if (aiNode) {
        const pos = vehicle.getStats().position;
        const rot = vehicle.getStats().rotation;
        aiNode.setPosition(pos);
        aiNode.setRotation(rot);
        aiNode.transform.updateWorldMatrix(true);
      }
    });

    // Render scene
    if (this.engine.renderer) {
      this.engine.renderer.render(this.scene, this.camera);
    }
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
