/**
 * Weapon System
 *
 * Features:
 * - Multiple weapon types (pistol, rifle, shotgun)
 * - Different firing modes (single, auto, burst)
 * - Reloading mechanics
 * - Recoil system
 * - Bullet spread
 * - Muzzle flash effects
 * - Shell ejection particles
 * - Hit detection via raycasting
 */

interface Vector3 {
    x: number;
    y: number;
    z: number;
}

interface Engine {
    audio: any;
    world: any;
}

/**
 * Weapon type enumeration
 */
export enum WeaponType {
    PISTOL = 'pistol',
    RIFLE = 'rifle',
    SHOTGUN = 'shotgun'
}

/**
 * Firing mode enumeration
 */
export enum FiringMode {
    SINGLE = 'single',
    AUTO = 'auto',
    BURST = 'burst'
}

/**
 * Weapon configuration interface
 */
interface WeaponConfig {
    type: WeaponType;
    name: string;
    damage: number;
    fireRate: number; // rounds per minute
    magazineSize: number;
    reserveAmmo: number;
    reloadTime: number; // seconds
    range: number;
    spread: number; // degrees
    recoilAmount: number;
    firingMode: FiringMode;
    bulletsPerShot: number; // for shotguns
    burstSize?: number; // for burst mode
}

/**
 * Weapon class
 */
export class Weapon {
    private engine: Engine;
    private config: WeaponConfig;

    // Ammo state
    private currentAmmo: number;
    private reserveAmmo: number;

    // Firing state
    private isReloading = false;
    private reloadTimer = 0;
    private fireTimer = 0;
    private burstCounter = 0;

    // Recoil state
    private currentRecoil = { x: 0, y: 0 };
    private recoilRecoverySpeed = 5.0;

    // Audio
    private fireSound: any;
    private reloadSound: any;
    private emptySound: any;

    // Effects
    private muzzleFlashTime = 0;
    private shellEjectionTime = 0;

    constructor(engine: Engine, type: WeaponType) {
        this.engine = engine;
        this.config = this.getWeaponConfig(type);
        this.currentAmmo = this.config.magazineSize;
        this.reserveAmmo = this.config.reserveAmmo;
    }

    /**
     * Get weapon configuration for type
     */
    private getWeaponConfig(type: WeaponType): WeaponConfig {
        switch (type) {
            case WeaponType.PISTOL:
                return {
                    type: WeaponType.PISTOL,
                    name: 'M1911 Pistol',
                    damage: 25,
                    fireRate: 300, // 300 RPM
                    magazineSize: 12,
                    reserveAmmo: 60,
                    reloadTime: 1.5,
                    range: 50,
                    spread: 2,
                    recoilAmount: 0.3,
                    firingMode: FiringMode.SINGLE,
                    bulletsPerShot: 1
                };

            case WeaponType.RIFLE:
                return {
                    type: WeaponType.RIFLE,
                    name: 'M4A1 Rifle',
                    damage: 30,
                    fireRate: 700, // 700 RPM
                    magazineSize: 30,
                    reserveAmmo: 120,
                    reloadTime: 2.0,
                    range: 100,
                    spread: 1,
                    recoilAmount: 0.2,
                    firingMode: FiringMode.AUTO,
                    bulletsPerShot: 1
                };

            case WeaponType.SHOTGUN:
                return {
                    type: WeaponType.SHOTGUN,
                    name: 'Pump Shotgun',
                    damage: 15, // per pellet
                    fireRate: 80, // 80 RPM
                    magazineSize: 8,
                    reserveAmmo: 32,
                    reloadTime: 3.0,
                    range: 30,
                    spread: 10,
                    recoilAmount: 1.0,
                    firingMode: FiringMode.SINGLE,
                    bulletsPerShot: 8 // 8 pellets
                };

            default:
                throw new Error(`Unknown weapon type: ${type}`);
        }
    }

    /**
     * Initialize weapon
     */
    async init(): Promise<void> {
        this.loadAudio();
        console.log(`Weapon initialized: ${this.config.name}`);
    }

    /**
     * Load weapon audio
     */
    private loadAudio(): void {
        const weaponType = this.config.type;
        this.fireSound = this.engine.audio.createSound(`sounds/${weaponType}_fire.wav`);
        this.reloadSound = this.engine.audio.createSound(`sounds/${weaponType}_reload.wav`);
        this.emptySound = this.engine.audio.createSound('sounds/empty.wav');
    }

    /**
     * Update weapon state
     */
    update(deltaTime: number, position: Vector3, direction: Vector3): void {
        // Update reload
        if (this.isReloading) {
            this.reloadTimer += deltaTime;
            if (this.reloadTimer >= this.config.reloadTime) {
                this.finishReload();
            }
        }

        // Update fire rate timer
        if (this.fireTimer > 0) {
            this.fireTimer -= deltaTime;
        }

        // Recover from recoil
        this.currentRecoil.x *= Math.max(0, 1 - this.recoilRecoverySpeed * deltaTime);
        this.currentRecoil.y *= Math.max(0, 1 - this.recoilRecoverySpeed * deltaTime);

        // Update effects
        if (this.muzzleFlashTime > 0) {
            this.muzzleFlashTime -= deltaTime;
        }

        if (this.shellEjectionTime > 0) {
            this.shellEjectionTime -= deltaTime;
        }
    }

    /**
     * Attempt to fire weapon
     */
    fire(): boolean {
        // Check if can fire
        if (this.isReloading) return false;
        if (this.fireTimer > 0) return false;

        // Check ammo
        if (this.currentAmmo <= 0) {
            this.emptySound?.play();
            return false;
        }

        // Fire weapon
        this.currentAmmo--;
        this.fireTimer = 60 / this.config.fireRate; // Convert RPM to seconds

        // Play sound
        this.fireSound?.play();

        // Apply recoil
        this.applyRecoil();

        // Create muzzle flash
        this.muzzleFlashTime = 0.05;

        // Eject shell
        this.shellEjectionTime = 0.2;

        // Perform raycast for each bullet/pellet
        for (let i = 0; i < this.config.bulletsPerShot; i++) {
            this.performRaycast();
        }

        // Handle burst mode
        if (this.config.firingMode === FiringMode.BURST) {
            this.burstCounter++;
            if (this.burstCounter >= (this.config.burstSize || 3)) {
                this.burstCounter = 0;
                this.fireTimer = 0.3; // Burst delay
            }
        }

        // Auto-reload if empty
        if (this.currentAmmo === 0 && this.reserveAmmo > 0) {
            this.reload();
        }

        return true;
    }

    /**
     * Perform raycast for hit detection
     */
    private performRaycast(): void {
        // Get direction with spread applied
        const spreadAngle = this.config.spread * (Math.PI / 180);
        const randomSpreadX = (Math.random() - 0.5) * spreadAngle;
        const randomSpreadY = (Math.random() - 0.5) * spreadAngle;

        // Calculate raycast direction (simplified)
        // In real implementation, this would use proper quaternion math
        const direction = {
            x: randomSpreadX,
            y: randomSpreadY,
            z: 1
        };

        // Normalize direction
        const length = Math.sqrt(
            direction.x * direction.x +
            direction.y * direction.y +
            direction.z * direction.z
        );
        direction.x /= length;
        direction.y /= length;
        direction.z /= length;

        // Perform raycast (mock implementation)
        // In real game, this would:
        // 1. Cast ray through physics world
        // 2. Check for enemy hits
        // 3. Apply damage
        // 4. Create hit effects (blood, sparks, etc.)
        // 5. Apply bullet holes to surfaces

        console.log('Raycast fired');
    }

    /**
     * Apply weapon recoil
     */
    private applyRecoil(): void {
        const recoilX = (Math.random() - 0.5) * this.config.recoilAmount;
        const recoilY = Math.random() * this.config.recoilAmount;

        this.currentRecoil.x += recoilX;
        this.currentRecoil.y += recoilY;
    }

    /**
     * Start reload
     */
    reload(): boolean {
        // Check if already reloading
        if (this.isReloading) return false;

        // Check if magazine is full
        if (this.currentAmmo >= this.config.magazineSize) return false;

        // Check if have reserve ammo
        if (this.reserveAmmo <= 0) return false;

        // Start reload
        this.isReloading = true;
        this.reloadTimer = 0;
        this.reloadSound?.play();

        console.log(`Reloading ${this.config.name}...`);
        return true;
    }

    /**
     * Finish reload
     */
    private finishReload(): void {
        const ammoNeeded = this.config.magazineSize - this.currentAmmo;
        const ammoToReload = Math.min(ammoNeeded, this.reserveAmmo);

        this.currentAmmo += ammoToReload;
        this.reserveAmmo -= ammoToReload;

        this.isReloading = false;
        this.reloadTimer = 0;

        console.log(`Reload complete. Ammo: ${this.currentAmmo}/${this.reserveAmmo}`);
    }

    /**
     * Add ammo to reserve
     */
    addAmmo(amount: number): void {
        this.reserveAmmo += amount;
        console.log(`Added ${amount} ammo. Reserve: ${this.reserveAmmo}`);
    }

    /**
     * Get current ammo in magazine
     */
    getCurrentAmmo(): number {
        return this.currentAmmo;
    }

    /**
     * Get reserve ammo
     */
    getReserveAmmo(): number {
        return this.reserveAmmo;
    }

    /**
     * Get weapon name
     */
    getName(): string {
        return this.config.name;
    }

    /**
     * Get weapon damage
     */
    getDamage(): number {
        return this.config.damage;
    }

    /**
     * Check if weapon is reloading
     */
    getIsReloading(): boolean {
        return this.isReloading;
    }

    /**
     * Get reload progress (0-1)
     */
    getReloadProgress(): number {
        if (!this.isReloading) return 0;
        return this.reloadTimer / this.config.reloadTime;
    }

    /**
     * Get current recoil
     */
    getRecoil(): { x: number; y: number } {
        return { ...this.currentRecoil };
    }

    /**
     * Check if muzzle flash is active
     */
    hasMuzzleFlash(): boolean {
        return this.muzzleFlashTime > 0;
    }

    /**
     * Check if should show shell ejection
     */
    hasShellEjection(): boolean {
        return this.shellEjectionTime > 0;
    }

    /**
     * Get weapon range
     */
    getRange(): number {
        return this.config.range;
    }

    /**
     * Get magazine size
     */
    getMagazineSize(): number {
        return this.config.magazineSize;
    }
}
