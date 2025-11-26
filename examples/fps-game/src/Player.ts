/**
 * First-Person Player Controller
 *
 * Features:
 * - Mouse look with pitch/yaw control
 * - WASD movement with physics
 * - Sprint, crouch, and jump mechanics
 * - Stamina system
 * - Health management
 * - Weapon handling and switching
 * - Footstep sounds
 * - Head bob animation
 */

import { Weapon, WeaponType } from './Weapon';
import { Level } from './Level';

interface Vector3 {
    x: number;
    y: number;
    z: number;
}

interface Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;
}

interface Engine {
    input: any;
    physics: any;
    audio: any;
    world: any;
    deltaTime: number;
}

export class Player {
    private engine: Engine;
    private level: Level;

    // Transform
    private position: Vector3 = { x: 0, y: 1.8, z: 0 };
    private velocity: Vector3 = { x: 0, y: 0, z: 0 };
    private rotation: { pitch: number; yaw: number } = { pitch: 0, yaw: 0 };

    // Camera
    private cameraHeight = 1.6;
    private crouchHeight = 0.9;
    private currentHeight = 1.6;
    private headBobTime = 0;
    private headBobAmount = 0.02;

    // Movement parameters
    private walkSpeed = 4.0;
    private runSpeed = 7.0;
    private crouchSpeed = 2.0;
    private jumpForce = 6.0;
    private mouseSensitivity = 0.002;
    private isGrounded = false;
    private isCrouching = false;
    private isSprinting = false;

    // Stamina system
    private stamina = 100;
    private maxStamina = 100;
    private staminaRegenRate = 20; // per second
    private sprintStaminaDrain = 25; // per second

    // Health system
    private health = 100;
    private maxHealth = 100;
    private lastDamageTime = 0;
    private healthRegenDelay = 5000; // 5 seconds
    private healthRegenRate = 10; // per second

    // Weapons
    private weapons: Weapon[] = [];
    private currentWeaponIndex = 0;

    // Audio
    private footstepSound: any;
    private jumpSound: any;
    private landSound: any;
    private damageSound: any;
    private footstepTimer = 0;
    private footstepInterval = 0.5;

    // Physics
    private capsuleRadius = 0.4;
    private gravity = 9.81;

    constructor(engine: Engine, level: Level) {
        this.engine = engine;
        this.level = level;
    }

    /**
     * Initialize player
     */
    async init(): Promise<void> {
        // Set initial spawn position
        const spawnPoint = this.level.getPlayerSpawnPoint();
        this.position = { ...spawnPoint };

        // Create weapons
        this.weapons.push(new Weapon(this.engine, WeaponType.PISTOL));
        this.weapons.push(new Weapon(this.engine, WeaponType.RIFLE));
        this.weapons.push(new Weapon(this.engine, WeaponType.SHOTGUN));

        // Initialize all weapons
        for (const weapon of this.weapons) {
            await weapon.init();
        }

        // Load audio
        this.loadAudio();

        console.log('Player initialized at', this.position);
    }

    /**
     * Load player audio assets
     */
    private loadAudio(): void {
        this.footstepSound = this.engine.audio.createSound('sounds/footstep.wav');
        this.jumpSound = this.engine.audio.createSound('sounds/jump.wav');
        this.landSound = this.engine.audio.createSound('sounds/land.wav');
        this.damageSound = this.engine.audio.createSound('sounds/damage.wav');
    }

    /**
     * Update player state
     */
    update(deltaTime: number): void {
        this.handleInput(deltaTime);
        this.updateMovement(deltaTime);
        this.updateStamina(deltaTime);
        this.updateHealth(deltaTime);
        this.updateWeapon(deltaTime);
        this.updateHeadBob(deltaTime);
        this.updateFootsteps(deltaTime);
    }

    /**
     * Handle player input
     */
    private handleInput(deltaTime: number): void {
        const input = this.engine.input;

        // Mouse look
        if (input.isPointerLocked()) {
            const mouseDelta = input.getMouseDelta();
            this.rotation.yaw -= mouseDelta.x * this.mouseSensitivity;
            this.rotation.pitch -= mouseDelta.y * this.mouseSensitivity;

            // Clamp pitch
            this.rotation.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotation.pitch));
        }

        // Movement
        const forward = this.getForwardVector();
        const right = this.getRightVector();
        let moveDir = { x: 0, y: 0, z: 0 };

        if (input.isKeyDown('KeyW')) {
            moveDir.x += forward.x;
            moveDir.z += forward.z;
        }
        if (input.isKeyDown('KeyS')) {
            moveDir.x -= forward.x;
            moveDir.z -= forward.z;
        }
        if (input.isKeyDown('KeyA')) {
            moveDir.x -= right.x;
            moveDir.z -= right.z;
        }
        if (input.isKeyDown('KeyD')) {
            moveDir.x += right.x;
            moveDir.z += right.z;
        }

        // Normalize movement direction
        const length = Math.sqrt(moveDir.x * moveDir.x + moveDir.z * moveDir.z);
        if (length > 0) {
            moveDir.x /= length;
            moveDir.z /= length;
        }

        // Sprint
        this.isSprinting = input.isKeyDown('ShiftLeft') && !this.isCrouching && this.stamina > 0;

        // Crouch
        if (input.isKeyPressed('ControlLeft')) {
            this.isCrouching = !this.isCrouching;
        }

        // Jump
        if (input.isKeyPressed('Space') && this.isGrounded && !this.isCrouching) {
            this.velocity.y = this.jumpForce;
            this.jumpSound?.play();
            this.isGrounded = false;
        }

        // Calculate move speed
        let moveSpeed = this.walkSpeed;
        if (this.isSprinting) {
            moveSpeed = this.runSpeed;
        } else if (this.isCrouching) {
            moveSpeed = this.crouchSpeed;
        }

        // Apply movement
        this.velocity.x = moveDir.x * moveSpeed;
        this.velocity.z = moveDir.z * moveSpeed;

        // Weapon input
        if (input.isMouseButtonDown(0)) { // Left click
            this.getCurrentWeapon()?.fire();
        }

        if (input.isKeyPressed('KeyR')) {
            this.getCurrentWeapon()?.reload();
        }

        // Weapon switching
        if (input.isKeyPressed('Digit1')) this.switchWeapon(0);
        if (input.isKeyPressed('Digit2')) this.switchWeapon(1);
        if (input.isKeyPressed('Digit3')) this.switchWeapon(2);
    }

    /**
     * Update movement and physics
     */
    private updateMovement(deltaTime: number): void {
        // Apply gravity
        if (!this.isGrounded) {
            this.velocity.y -= this.gravity * deltaTime;
        }

        // Update position
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        this.position.z += this.velocity.z * deltaTime;

        // Simple ground check (replace with actual physics raycast)
        const groundY = this.level.getGroundHeight(this.position.x, this.position.z);
        const characterBottom = this.position.y - this.currentHeight;

        if (characterBottom <= groundY) {
            this.position.y = groundY + this.currentHeight;
            if (this.velocity.y < -2) {
                this.landSound?.play();
            }
            this.velocity.y = 0;
            this.isGrounded = true;
        } else {
            this.isGrounded = false;
        }

        // Update crouch height
        const targetHeight = this.isCrouching ? this.crouchHeight : this.cameraHeight;
        this.currentHeight += (targetHeight - this.currentHeight) * deltaTime * 10;

        // Collision detection with level
        this.handleCollisions();
    }

    /**
     * Handle collisions with level geometry
     */
    private handleCollisions(): void {
        // Simple collision response (replace with actual physics)
        const obstacles = this.level.getObstacles();

        for (const obstacle of obstacles) {
            const dx = this.position.x - obstacle.x;
            const dz = this.position.z - obstacle.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const minDistance = this.capsuleRadius + obstacle.radius;

            if (distance < minDistance) {
                const pushDistance = minDistance - distance;
                const nx = dx / distance;
                const nz = dz / distance;
                this.position.x += nx * pushDistance;
                this.position.z += nz * pushDistance;
            }
        }
    }

    /**
     * Update stamina
     */
    private updateStamina(deltaTime: number): void {
        if (this.isSprinting) {
            this.stamina -= this.sprintStaminaDrain * deltaTime;
            if (this.stamina < 0) {
                this.stamina = 0;
            }
        } else {
            this.stamina += this.staminaRegenRate * deltaTime;
            if (this.stamina > this.maxStamina) {
                this.stamina = this.maxStamina;
            }
        }
    }

    /**
     * Update health regeneration
     */
    private updateHealth(deltaTime: number): void {
        const timeSinceDamage = Date.now() - this.lastDamageTime;

        if (this.health < this.maxHealth && timeSinceDamage > this.healthRegenDelay) {
            this.health += this.healthRegenRate * deltaTime;
            if (this.health > this.maxHealth) {
                this.health = this.maxHealth;
            }
        }
    }

    /**
     * Update current weapon
     */
    private updateWeapon(deltaTime: number): void {
        const weapon = this.getCurrentWeapon();
        if (weapon) {
            weapon.update(deltaTime, this.position, this.getForwardVector());
        }
    }

    /**
     * Update head bob animation
     */
    private updateHeadBob(deltaTime: number): void {
        const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);

        if (speed > 0.1 && this.isGrounded) {
            this.headBobTime += deltaTime * speed;
        } else {
            this.headBobTime = 0;
        }
    }

    /**
     * Update footstep sounds
     */
    private updateFootsteps(deltaTime: number): void {
        const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);

        if (speed > 0.1 && this.isGrounded) {
            this.footstepTimer += deltaTime;

            const interval = this.isSprinting ? this.footstepInterval / 1.5 : this.footstepInterval;

            if (this.footstepTimer >= interval) {
                this.footstepTimer = 0;
                this.footstepSound?.play();
            }
        } else {
            this.footstepTimer = 0;
        }
    }

    /**
     * Take damage
     */
    takeDamage(amount: number): void {
        this.health -= amount;
        this.lastDamageTime = Date.now();

        if (this.health < 0) {
            this.health = 0;
        }

        this.damageSound?.play();

        if (this.health <= 0) {
            this.onDeath();
        }
    }

    /**
     * Handle player death
     */
    private onDeath(): void {
        console.log('Player died!');
        // Implement respawn or game over logic
    }

    /**
     * Switch weapon
     */
    private switchWeapon(index: number): void {
        if (index >= 0 && index < this.weapons.length) {
            this.currentWeaponIndex = index;
            console.log(`Switched to weapon ${index}`);
        }
    }

    /**
     * Get current weapon
     */
    getCurrentWeapon(): Weapon | null {
        return this.weapons[this.currentWeaponIndex] || null;
    }

    /**
     * Get forward direction vector
     */
    getForwardVector(): Vector3 {
        return {
            x: Math.sin(this.rotation.yaw),
            y: 0,
            z: Math.cos(this.rotation.yaw)
        };
    }

    /**
     * Get forward vector (including pitch)
     */
    getForward(): Vector3 {
        const cosYaw = Math.cos(this.rotation.yaw);
        const sinYaw = Math.sin(this.rotation.yaw);
        const cosPitch = Math.cos(this.rotation.pitch);
        const sinPitch = Math.sin(this.rotation.pitch);

        return {
            x: sinYaw * cosPitch,
            y: -sinPitch,
            z: cosYaw * cosPitch
        };
    }

    /**
     * Get right direction vector
     */
    private getRightVector(): Vector3 {
        return {
            x: Math.cos(this.rotation.yaw),
            y: 0,
            z: -Math.sin(this.rotation.yaw)
        };
    }

    /**
     * Get player position
     */
    getPosition(): Vector3 {
        return { ...this.position };
    }

    /**
     * Get camera position (with head bob)
     */
    getCameraPosition(): Vector3 {
        const bobOffset = Math.sin(this.headBobTime * 10) * this.headBobAmount;

        return {
            x: this.position.x,
            y: this.position.y + bobOffset,
            z: this.position.z
        };
    }

    /**
     * Get player rotation
     */
    getRotation(): { pitch: number; yaw: number } {
        return { ...this.rotation };
    }

    /**
     * Get health
     */
    getHealth(): number {
        return this.health;
    }

    /**
     * Get max health
     */
    getMaxHealth(): number {
        return this.maxHealth;
    }

    /**
     * Get stamina
     */
    getStamina(): number {
        return this.stamina;
    }

    /**
     * Check if player is alive
     */
    isAlive(): boolean {
        return this.health > 0;
    }
}
