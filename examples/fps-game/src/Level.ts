/**
 * Level Builder and Manager
 *
 * Features:
 * - Procedural room and corridor generation
 * - NavMesh baking for AI pathfinding
 * - Spawn point management
 * - Pickup placement (health, ammo)
 * - Dynamic lighting setup
 * - Collision geometry generation
 * - Cover point detection
 * - Obstacle management
 */

interface Vector3 {
    x: number;
    y: number;
    z: number;
}

interface Engine {
    world: any;
    renderer: any;
    physics: any;
}

/**
 * Room data structure
 */
interface Room {
    position: Vector3;
    size: Vector3;
    doors: Vector3[];
}

/**
 * Corridor data structure
 */
interface Corridor {
    start: Vector3;
    end: Vector3;
    width: number;
}

/**
 * Obstacle/Cover point
 */
interface Obstacle {
    x: number;
    z: number;
    radius: number;
    height: number;
    isCover: boolean;
}

/**
 * Level generation and management
 */
export class Level {
    private engine: Engine;

    // Level structure
    private rooms: Room[] = [];
    private corridors: Corridor[] = [];
    private obstacles: Obstacle[] = [];

    // Spawn points
    private playerSpawnPoint: Vector3 = { x: 0, y: 0, z: 0 };
    private enemySpawnPoints: Vector3[] = [];
    private pickupSpawnPoints: Vector3[] = [];

    // NavMesh (simplified)
    private navMeshPoints: Vector3[] = [];
    private patrolPoints: Vector3[] = [];
    private coverPoints: Vector3[] = [];

    // Level parameters
    private readonly numRooms = 8;
    private readonly roomMinSize = 6;
    private readonly roomMaxSize = 12;
    private readonly corridorWidth = 3;

    constructor(engine: Engine) {
        this.engine = engine;
    }

    /**
     * Generate the level
     */
    async generate(): Promise<void> {
        console.log('Generating level...');

        // Generate rooms
        this.generateRooms();

        // Connect rooms with corridors
        this.generateCorridors();

        // Place obstacles and cover
        this.placeObstacles();

        // Setup spawn points
        this.setupSpawnPoints();

        // Setup patrol paths
        this.setupPatrolPaths();

        // Bake NavMesh
        this.bakeNavMesh();

        // Create level geometry
        this.createGeometry();

        // Setup lighting
        this.setupLighting();

        console.log('Level generation complete!');
    }

    /**
     * Generate rooms using simple algorithm
     */
    private generateRooms(): void {
        const gridSize = 25;

        for (let i = 0; i < this.numRooms; i++) {
            const roomSize = {
                x: this.randomInt(this.roomMinSize, this.roomMaxSize),
                y: 4,
                z: this.randomInt(this.roomMinSize, this.roomMaxSize)
            };

            let position: Vector3;
            let attempts = 0;
            let validPosition = false;

            // Find non-overlapping position
            do {
                position = {
                    x: this.randomInt(-gridSize, gridSize),
                    y: 0,
                    z: this.randomInt(-gridSize, gridSize)
                };

                validPosition = !this.isOverlapping(position, roomSize);
                attempts++;
            } while (!validPosition && attempts < 50);

            if (validPosition) {
                const room: Room = {
                    position,
                    size: roomSize,
                    doors: []
                };

                this.rooms.push(room);
            }
        }

        console.log(`Generated ${this.rooms.length} rooms`);
    }

    /**
     * Check if room overlaps with existing rooms
     */
    private isOverlapping(position: Vector3, size: Vector3): boolean {
        for (const room of this.rooms) {
            const dx = Math.abs(position.x - room.position.x);
            const dz = Math.abs(position.z - room.position.z);

            if (dx < (size.x + room.size.x) / 2 + 2 &&
                dz < (size.z + room.size.z) / 2 + 2) {
                return true;
            }
        }
        return false;
    }

    /**
     * Generate corridors connecting rooms
     */
    private generateCorridors(): void {
        // Connect each room to nearest room
        for (let i = 0; i < this.rooms.length; i++) {
            let nearestRoom = -1;
            let nearestDistance = Infinity;

            for (let j = 0; j < this.rooms.length; j++) {
                if (i === j) continue;

                const distance = this.distanceBetween(
                    this.rooms[i].position,
                    this.rooms[j].position
                );

                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestRoom = j;
                }
            }

            if (nearestRoom !== -1) {
                const corridor: Corridor = {
                    start: { ...this.rooms[i].position },
                    end: { ...this.rooms[nearestRoom].position },
                    width: this.corridorWidth
                };

                this.corridors.push(corridor);
            }
        }

        console.log(`Generated ${this.corridors.length} corridors`);
    }

    /**
     * Place obstacles and cover points
     */
    private placeObstacles(): void {
        // Place obstacles in rooms
        for (const room of this.rooms) {
            const numObstacles = this.randomInt(2, 5);

            for (let i = 0; i < numObstacles; i++) {
                const obstacle: Obstacle = {
                    x: room.position.x + this.random(-room.size.x / 3, room.size.x / 3),
                    z: room.position.z + this.random(-room.size.z / 3, room.size.z / 3),
                    radius: this.random(0.3, 0.8),
                    height: this.random(1.0, 2.0),
                    isCover: Math.random() > 0.5
                };

                this.obstacles.push(obstacle);

                if (obstacle.isCover) {
                    this.coverPoints.push({
                        x: obstacle.x,
                        y: 0,
                        z: obstacle.z
                    });
                }
            }
        }

        console.log(`Placed ${this.obstacles.length} obstacles, ${this.coverPoints.length} cover points`);
    }

    /**
     * Setup spawn points
     */
    private setupSpawnPoints(): void {
        // Player spawns in first room
        if (this.rooms.length > 0) {
            this.playerSpawnPoint = { ...this.rooms[0].position };
            this.playerSpawnPoint.y = 0;
        }

        // Enemy spawn points in other rooms
        for (let i = 1; i < this.rooms.length; i++) {
            const room = this.rooms[i];

            // Add 1-3 spawn points per room
            const numSpawns = this.randomInt(1, 3);

            for (let j = 0; j < numSpawns; j++) {
                this.enemySpawnPoints.push({
                    x: room.position.x + this.random(-room.size.x / 4, room.size.x / 4),
                    y: 0,
                    z: room.position.z + this.random(-room.size.z / 4, room.size.z / 4)
                });
            }
        }

        // Pickup spawn points
        for (const room of this.rooms) {
            if (Math.random() > 0.5) {
                this.pickupSpawnPoints.push({
                    x: room.position.x + this.random(-room.size.x / 3, room.size.x / 3),
                    y: 0.5,
                    z: room.position.z + this.random(-room.size.z / 3, room.size.z / 3)
                });
            }
        }

        console.log(`Setup spawn points: ${this.enemySpawnPoints.length} enemy, ${this.pickupSpawnPoints.length} pickup`);
    }

    /**
     * Setup patrol paths for AI
     */
    private setupPatrolPaths(): void {
        // Create patrol points in each room
        for (const room of this.rooms) {
            // Add corners as patrol points
            const halfX = room.size.x / 3;
            const halfZ = room.size.z / 3;

            this.patrolPoints.push(
                { x: room.position.x + halfX, y: 0, z: room.position.z + halfZ },
                { x: room.position.x - halfX, y: 0, z: room.position.z + halfZ },
                { x: room.position.x - halfX, y: 0, z: room.position.z - halfZ },
                { x: room.position.x + halfX, y: 0, z: room.position.z - halfZ }
            );
        }

        console.log(`Created ${this.patrolPoints.length} patrol points`);
    }

    /**
     * Bake NavMesh for pathfinding
     */
    private bakeNavMesh(): void {
        // Simplified NavMesh - in real implementation, use proper NavMesh generation
        // Add walkable points from rooms and corridors

        for (const room of this.rooms) {
            const samples = 20;
            for (let i = 0; i < samples; i++) {
                this.navMeshPoints.push({
                    x: room.position.x + this.random(-room.size.x / 2, room.size.x / 2),
                    y: 0,
                    z: room.position.z + this.random(-room.size.z / 2, room.size.z / 2)
                });
            }
        }

        console.log(`Baked NavMesh with ${this.navMeshPoints.length} points`);
    }

    /**
     * Create level geometry (walls, floors)
     */
    private createGeometry(): void {
        // In real implementation, create actual mesh geometry
        // For now, just log the creation

        console.log('Creating level geometry...');

        // Create floors for each room
        for (const room of this.rooms) {
            this.createFloor(room);
            this.createWalls(room);
        }

        // Create corridor geometry
        for (const corridor of this.corridors) {
            this.createCorridor(corridor);
        }

        // Create obstacle meshes
        for (const obstacle of this.obstacles) {
            this.createObstacleMesh(obstacle);
        }
    }

    /**
     * Create floor mesh for room
     */
    private createFloor(room: Room): void {
        // Mock implementation - would create actual floor mesh
        console.log(`Creating floor for room at (${room.position.x}, ${room.position.z})`);
    }

    /**
     * Create wall meshes for room
     */
    private createWalls(room: Room): void {
        // Mock implementation - would create actual wall meshes
        console.log(`Creating walls for room at (${room.position.x}, ${room.position.z})`);
    }

    /**
     * Create corridor geometry
     */
    private createCorridor(corridor: Corridor): void {
        // Mock implementation
        console.log('Creating corridor geometry');
    }

    /**
     * Create obstacle mesh
     */
    private createObstacleMesh(obstacle: Obstacle): void {
        // Mock implementation - would create box or cylinder mesh
    }

    /**
     * Setup level lighting
     */
    private setupLighting(): void {
        // Add lights to rooms
        for (const room of this.rooms) {
            // Ceiling light
            const lightPos = {
                x: room.position.x,
                y: room.size.y - 0.5,
                z: room.position.z
            };

            // Mock light creation
            console.log(`Creating light at (${lightPos.x}, ${lightPos.y}, ${lightPos.z})`);
        }
    }

    /**
     * Get player spawn point
     */
    getPlayerSpawnPoint(): Vector3 {
        return { ...this.playerSpawnPoint };
    }

    /**
     * Get random enemy spawn point
     */
    getRandomSpawnPoint(): Vector3 {
        if (this.enemySpawnPoints.length === 0) {
            return { x: 10, y: 0, z: 10 };
        }

        const index = this.randomInt(0, this.enemySpawnPoints.length - 1);
        return { ...this.enemySpawnPoints[index] };
    }

    /**
     * Get patrol points near position
     */
    getPatrolPoints(position: Vector3, count: number): Vector3[] {
        // Find nearest patrol points
        const sorted = [...this.patrolPoints].sort((a, b) => {
            const distA = this.distanceBetween(position, a);
            const distB = this.distanceBetween(position, b);
            return distA - distB;
        });

        return sorted.slice(0, Math.min(count, sorted.length));
    }

    /**
     * Find nearest cover point
     */
    findNearestCover(position: Vector3, threatPosition: Vector3): Vector3 | null {
        let bestCover: Vector3 | null = null;
        let bestScore = -Infinity;

        for (const cover of this.coverPoints) {
            // Distance to cover (closer is better)
            const distToCover = this.distanceBetween(position, cover);

            // Distance from threat (farther is better)
            const distFromThreat = this.distanceBetween(cover, threatPosition);

            // Score based on both distances
            const score = distFromThreat - distToCover * 0.5;

            if (score > bestScore) {
                bestScore = score;
                bestCover = cover;
            }
        }

        return bestCover;
    }

    /**
     * Get ground height at position
     */
    getGroundHeight(x: number, z: number): number {
        // Simplified - always return 0
        // In real game, would check actual geometry
        return 0;
    }

    /**
     * Get all obstacles
     */
    getObstacles(): Obstacle[] {
        return this.obstacles;
    }

    /**
     * Get all rooms
     */
    getRooms(): Room[] {
        return this.rooms;
    }

    /**
     * Get all corridors
     */
    getCorridors(): Corridor[] {
        return this.corridors;
    }

    /**
     * Calculate distance between two points
     */
    private distanceBetween(a: Vector3, b: Vector3): number {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Random integer between min and max (inclusive)
     */
    private randomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Random float between min and max
     */
    private random(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }
}
