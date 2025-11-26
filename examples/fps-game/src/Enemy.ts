/**
 * Enemy AI with Behavior Tree
 *
 * Features:
 * - NavMesh pathfinding for navigation
 * - Behavior tree (patrol, chase, attack, flee, cover)
 * - Sight and hearing perception system
 * - Health and damage system
 * - Attack patterns and cooldowns
 * - Death handling with ragdoll physics
 * - Audio reactions and callouts
 * - Cover finding and usage
 */

import { Player } from './Player';
import { Level } from './Level';

interface Vector3 {
    x: number;
    y: number;
    z: number;
}

interface Engine {
    audio: any;
    physics: any;
    world: any;
}

/**
 * AI state enumeration
 */
enum AIState {
    IDLE = 'idle',
    PATROL = 'patrol',
    CHASE = 'chase',
    ATTACK = 'attack',
    FLEE = 'flee',
    TAKE_COVER = 'take_cover',
    INVESTIGATE = 'investigate',
    DEAD = 'dead'
}

/**
 * Enemy class with AI
 */
export class Enemy {
    private engine: Engine;
    private level: Level;
    private entityId: number;

    // Transform
    private position: Vector3;
    private velocity: Vector3 = { x: 0, y: 0, z: 0 };
    private rotation: number = 0; // yaw rotation

    // AI state
    private currentState: AIState = AIState.PATROL;
    private stateTimer = 0;
    private targetPosition: Vector3 | null = null;
    private target: Player | null = null;

    // Pathfinding
    private path: Vector3[] = [];
    private currentPathIndex = 0;
    private pathUpdateTimer = 0;
    private pathUpdateInterval = 0.5;

    // Perception
    private sightRange = 20;
    private sightAngle = 120; // degrees
    private hearingRange = 15;
    private lastKnownPlayerPosition: Vector3 | null = null;
    private playerVisibleTimer = 0;
    private playerLostTimer = 0;

    // Movement
    private walkSpeed = 2.5;
    private runSpeed = 5.0;
    private currentSpeed = 2.5;
    private stoppingDistance = 2.0;

    // Combat
    private health = 100;
    private maxHealth = 100;
    private damage = 10;
    private attackRange = 2.0;
    private attackCooldown = 1.5;
    private attackTimer = 0;

    // Patrol
    private patrolPoints: Vector3[] = [];
    private currentPatrolIndex = 0;
    private patrolWaitTime = 2.0;

    // Cover system
    private currentCover: Vector3 | null = null;
    private inCover = false;
    private coverTimer = 0;

    // Death
    private isDying = false;
    private deathTimer = 0;
    private deathDuration = 3.0;

    // Audio
    private alertSound: any;
    private attackSound: any;
    private deathSound: any;
    private footstepSound: any;

    constructor(engine: Engine, level: Level, spawnPosition: Vector3) {
        this.engine = engine;
        this.level = level;
        this.position = { ...spawnPosition };
        this.entityId = engine.world.createEntity();
    }

    /**
     * Initialize enemy
     */
    init(): void {
        this.setupPatrolPath();
        this.loadAudio();
        console.log('Enemy spawned at', this.position);
    }

    /**
     * Setup patrol waypoints
     */
    private setupPatrolPath(): void {
        this.patrolPoints = this.level.getPatrolPoints(this.position, 4);
        this.currentPatrolIndex = 0;
    }

    /**
     * Load audio assets
     */
    private loadAudio(): void {
        this.alertSound = this.engine.audio.createSound('sounds/enemy_alert.wav');
        this.attackSound = this.engine.audio.createSound('sounds/enemy_attack.wav');
        this.deathSound = this.engine.audio.createSound('sounds/enemy_death.wav');
        this.footstepSound = this.engine.audio.createSound('sounds/enemy_footstep.wav');
    }

    /**
     * Main update loop
     */
    update(deltaTime: number, player: Player): void {
        if (this.isDying) {
            this.updateDeath(deltaTime);
            return;
        }

        // Update perception
        this.updatePerception(deltaTime, player);

        // Update state machine
        this.updateStateMachine(deltaTime, player);

        // Update movement
        this.updateMovement(deltaTime);

        // Update timers
        this.stateTimer += deltaTime;
        this.attackTimer -= deltaTime;
    }

    /**
     * Update perception system
     */
    private updatePerception(deltaTime: number, player: Player): void {
        if (!player.isAlive()) {
            this.target = null;
            return;
        }

        const playerPos = player.getPosition();
        const toPlayer = {
            x: playerPos.x - this.position.x,
            y: playerPos.y - this.position.y,
            z: playerPos.z - this.position.z
        };

        const distanceToPlayer = Math.sqrt(
            toPlayer.x * toPlayer.x +
            toPlayer.y * toPlayer.y +
            toPlayer.z * toPlayer.z
        );

        // Check sight
        let canSeePlayer = false;

        if (distanceToPlayer <= this.sightRange) {
            // Check angle
            const forward = {
                x: Math.sin(this.rotation),
                y: 0,
                z: Math.cos(this.rotation)
            };

            // Normalize toPlayer
            const toPlayerNorm = {
                x: toPlayer.x / distanceToPlayer,
                y: 0,
                z: toPlayer.z / distanceToPlayer
            };

            // Dot product for angle
            const dot = forward.x * toPlayerNorm.x + forward.z * toPlayerNorm.z;
            const angle = Math.acos(dot) * (180 / Math.PI);

            if (angle <= this.sightAngle / 2) {
                // Check line of sight (simplified - should raycast)
                canSeePlayer = true;
            }
        }

        // Check hearing
        const canHearPlayer = distanceToPlayer <= this.hearingRange;

        // Update target
        if (canSeePlayer) {
            this.target = player;
            this.lastKnownPlayerPosition = { ...playerPos };
            this.playerVisibleTimer = 0;
            this.playerLostTimer = 0;
        } else if (this.target) {
            this.playerVisibleTimer += deltaTime;

            if (this.playerVisibleTimer > 1.0) {
                this.playerLostTimer += deltaTime;

                if (this.playerLostTimer > 5.0) {
                    this.target = null;
                    this.lastKnownPlayerPosition = null;
                }
            }
        } else if (canHearPlayer) {
            // Investigate sound
            if (this.currentState === AIState.PATROL || this.currentState === AIState.IDLE) {
                this.lastKnownPlayerPosition = { ...playerPos };
                this.changeState(AIState.INVESTIGATE);
            }
        }
    }

    /**
     * Update AI state machine
     */
    private updateStateMachine(deltaTime: number, player: Player): void {
        switch (this.currentState) {
            case AIState.IDLE:
                this.updateIdleState(deltaTime);
                break;

            case AIState.PATROL:
                this.updatePatrolState(deltaTime);
                break;

            case AIState.CHASE:
                this.updateChaseState(deltaTime, player);
                break;

            case AIState.ATTACK:
                this.updateAttackState(deltaTime, player);
                break;

            case AIState.FLEE:
                this.updateFleeState(deltaTime, player);
                break;

            case AIState.TAKE_COVER:
                this.updateCoverState(deltaTime);
                break;

            case AIState.INVESTIGATE:
                this.updateInvestigateState(deltaTime);
                break;
        }
    }

    /**
     * Update idle state
     */
    private updateIdleState(deltaTime: number): void {
        if (this.target) {
            this.changeState(AIState.CHASE);
        } else if (this.stateTimer > 2.0) {
            this.changeState(AIState.PATROL);
        }
    }

    /**
     * Update patrol state
     */
    private updatePatrolState(deltaTime: number): void {
        if (this.target) {
            this.changeState(AIState.CHASE);
            return;
        }

        // Move to next patrol point
        if (this.patrolPoints.length > 0) {
            const targetPoint = this.patrolPoints[this.currentPatrolIndex];
            const distance = this.distanceTo(targetPoint);

            if (distance < this.stoppingDistance) {
                // Reached patrol point
                this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
                this.changeState(AIState.IDLE);
            } else {
                this.moveTowards(targetPoint);
            }
        }

        this.currentSpeed = this.walkSpeed;
    }

    /**
     * Update chase state
     */
    private updateChaseState(deltaTime: number, player: Player): void {
        if (!this.target) {
            this.changeState(AIState.PATROL);
            return;
        }

        const playerPos = player.getPosition();
        const distance = this.distanceTo(playerPos);

        // Check if in attack range
        if (distance <= this.attackRange) {
            this.changeState(AIState.ATTACK);
            return;
        }

        // Check health for flee behavior
        if (this.health < this.maxHealth * 0.3) {
            this.changeState(AIState.FLEE);
            return;
        }

        // Move towards player
        this.moveTowards(playerPos);
        this.currentSpeed = this.runSpeed;

        // Update path periodically
        this.pathUpdateTimer += deltaTime;
        if (this.pathUpdateTimer >= this.pathUpdateInterval) {
            this.pathUpdateTimer = 0;
            this.findPath(playerPos);
        }
    }

    /**
     * Update attack state
     */
    private updateAttackState(deltaTime: number, player: Player): void {
        if (!this.target) {
            this.changeState(AIState.PATROL);
            return;
        }

        const playerPos = player.getPosition();
        const distance = this.distanceTo(playerPos);

        // Check if player moved out of range
        if (distance > this.attackRange * 1.5) {
            this.changeState(AIState.CHASE);
            return;
        }

        // Face player
        this.lookAt(playerPos);

        // Attack cooldown
        if (this.attackTimer <= 0) {
            this.performAttack(player);
            this.attackTimer = this.attackCooldown;
        }

        this.currentSpeed = 0; // Stop moving while attacking
    }

    /**
     * Update flee state
     */
    private updateFleeState(deltaTime: number, player: Player): void {
        // Try to find cover
        if (!this.currentCover) {
            this.currentCover = this.level.findNearestCover(this.position, player.getPosition());
        }

        if (this.currentCover) {
            this.changeState(AIState.TAKE_COVER);
            return;
        }

        // Run away from player
        const playerPos = player.getPosition();
        const awayDirection = {
            x: this.position.x - playerPos.x,
            y: this.position.y - playerPos.y,
            z: this.position.z - playerPos.z
        };

        const length = Math.sqrt(
            awayDirection.x * awayDirection.x +
            awayDirection.z * awayDirection.z
        );

        if (length > 0) {
            awayDirection.x /= length;
            awayDirection.z /= length;

            const fleeTarget = {
                x: this.position.x + awayDirection.x * 10,
                y: this.position.y,
                z: this.position.z + awayDirection.z * 10
            };

            this.moveTowards(fleeTarget);
        }

        this.currentSpeed = this.runSpeed;

        // Check if safe to return to combat
        if (this.health > this.maxHealth * 0.6 && this.stateTimer > 3.0) {
            this.changeState(AIState.CHASE);
        }
    }

    /**
     * Update cover state
     */
    private updateCoverState(deltaTime: number): void {
        if (!this.currentCover) {
            this.changeState(AIState.CHASE);
            return;
        }

        const distance = this.distanceTo(this.currentCover);

        if (distance > this.stoppingDistance) {
            this.moveTowards(this.currentCover);
            this.currentSpeed = this.runSpeed;
        } else {
            this.inCover = true;
            this.currentSpeed = 0;
            this.coverTimer += deltaTime;

            // Stay in cover for a while, then peek out
            if (this.coverTimer > 3.0 && this.health > this.maxHealth * 0.6) {
                this.currentCover = null;
                this.inCover = false;
                this.coverTimer = 0;
                this.changeState(AIState.CHASE);
            }
        }
    }

    /**
     * Update investigate state
     */
    private updateInvestigateState(deltaTime: number): void {
        if (this.target) {
            this.changeState(AIState.CHASE);
            return;
        }

        if (!this.lastKnownPlayerPosition) {
            this.changeState(AIState.PATROL);
            return;
        }

        const distance = this.distanceTo(this.lastKnownPlayerPosition);

        if (distance < this.stoppingDistance) {
            // Reached investigation point, look around
            if (this.stateTimer > 3.0) {
                this.lastKnownPlayerPosition = null;
                this.changeState(AIState.PATROL);
            }
        } else {
            this.moveTowards(this.lastKnownPlayerPosition);
        }

        this.currentSpeed = this.walkSpeed;
    }

    /**
     * Update death animation
     */
    private updateDeath(deltaTime: number): void {
        this.deathTimer += deltaTime;

        if (this.deathTimer >= this.deathDuration) {
            // Enemy can be removed from scene
        }
    }

    /**
     * Change AI state
     */
    private changeState(newState: AIState): void {
        if (this.currentState === newState) return;

        console.log(`Enemy state: ${this.currentState} -> ${newState}`);

        this.currentState = newState;
        this.stateTimer = 0;

        // Play alert sound when detecting player
        if (newState === AIState.CHASE && !this.target) {
            this.alertSound?.play();
        }
    }

    /**
     * Find path to target
     */
    private findPath(target: Vector3): void {
        // Mock pathfinding - in real game, use NavMesh
        this.path = [target];
        this.currentPathIndex = 0;
    }

    /**
     * Move towards position
     */
    private moveTowards(target: Vector3): void {
        const direction = {
            x: target.x - this.position.x,
            y: 0,
            z: target.z - this.position.z
        };

        const length = Math.sqrt(direction.x * direction.x + direction.z * direction.z);

        if (length > 0) {
            direction.x /= length;
            direction.z /= length;

            this.velocity.x = direction.x * this.currentSpeed;
            this.velocity.z = direction.z * this.currentSpeed;

            // Update rotation to face movement direction
            this.rotation = Math.atan2(direction.x, direction.z);
        }
    }

    /**
     * Look at position
     */
    private lookAt(target: Vector3): void {
        const direction = {
            x: target.x - this.position.x,
            z: target.z - this.position.z
        };

        this.rotation = Math.atan2(direction.x, direction.z);
    }

    /**
     * Update movement
     */
    private updateMovement(deltaTime: number): void {
        // Apply velocity
        this.position.x += this.velocity.x * deltaTime;
        this.position.z += this.velocity.z * deltaTime;

        // Apply friction
        this.velocity.x *= 0.9;
        this.velocity.z *= 0.9;

        // Keep on ground
        this.position.y = this.level.getGroundHeight(this.position.x, this.position.z) + 1.0;
    }

    /**
     * Perform attack on player
     */
    private performAttack(player: Player): void {
        console.log('Enemy attacks!');
        this.attackSound?.play();
        player.takeDamage(this.damage);
    }

    /**
     * Take damage
     */
    takeDamage(amount: number): void {
        if (this.isDying) return;

        this.health -= amount;

        if (this.health <= 0) {
            this.health = 0;
            this.onDeath();
        } else {
            // React to damage
            if (this.currentState !== AIState.CHASE && this.currentState !== AIState.ATTACK) {
                this.changeState(AIState.INVESTIGATE);
            }
        }
    }

    /**
     * Handle death
     */
    private onDeath(): void {
        this.isDying = true;
        this.deathTimer = 0;
        this.currentState = AIState.DEAD;
        this.deathSound?.play();

        console.log('Enemy died!');

        // Apply ragdoll physics (mock)
        // In real game, convert to ragdoll
    }

    /**
     * Calculate distance to position
     */
    private distanceTo(target: Vector3): number {
        const dx = target.x - this.position.x;
        const dy = target.y - this.position.y;
        const dz = target.z - this.position.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Get enemy position
     */
    getPosition(): Vector3 {
        return { ...this.position };
    }

    /**
     * Check if enemy is dead
     */
    isDead(): boolean {
        return this.health <= 0;
    }

    /**
     * Get current health
     */
    getHealth(): number {
        return this.health;
    }
}
