/**
 * VoxelPlayer.ts
 * Minecraft-style player controller with movement, block interaction, and physics
 */

import { Vector3 } from '../../../src/math/Vector3';
import { VoxelWorld } from '../../../src/voxel/VoxelWorld';
import { Inventory } from './Inventory';
import { BlockRegistry, BlockType } from './BlockTypes';

/**
 * Player mode
 */
export enum PlayerMode {
  Survival,
  Creative
}

/**
 * Ray cast result
 */
interface RaycastResult {
  hit: boolean;
  position: Vector3 | null;
  normal: Vector3 | null;
  distance: number;
}

/**
 * Voxel player controller
 */
export class VoxelPlayer {
  private position: Vector3;
  private velocity: Vector3;
  private rotation: Vector3; // pitch, yaw, roll
  private onGround: boolean = false;
  private mode: PlayerMode = PlayerMode.Creative;

  private moveSpeed: number = 4.3; // blocks per second
  private jumpSpeed: number = 8.0;
  private flySpeed: number = 10.0;
  private gravity: number = 28.0;
  private friction: number = 0.91;

  private playerWidth: number = 0.6;
  private playerHeight: number = 1.8;
  private playerEyeHeight: number = 1.62;

  private isFlying: boolean = false;
  private isSneaking: boolean = false;
  private isSwimming: boolean = false;

  private blockBreakProgress: number = 0;
  private blockBreakPosition: Vector3 | null = null;
  private blockBreakTime: number = 0;

  private readonly REACH_DISTANCE = 5.0;

  constructor(startPosition: Vector3) {
    this.position = startPosition.clone();
    this.velocity = new Vector3(0, 0, 0);
    this.rotation = new Vector3(0, 0, 0);
  }

  /**
   * Update player physics and movement
   */
  public update(deltaTime: number, world: VoxelWorld, input: PlayerInput): void {
    // Handle mode toggles
    if (input.toggleFly) {
      this.toggleFly();
    }

    // Calculate movement
    const moveDir = this.calculateMoveDirection(input);

    if (this.isFlying) {
      this.updateFlying(deltaTime, moveDir, input);
    } else {
      this.updateWalking(deltaTime, moveDir, input, world);
    }

    // Apply velocity
    const oldPosition = this.position.clone();
    this.position.add(this.velocity.clone().multiplyScalar(deltaTime));

    // Collision detection
    if (!this.isFlying) {
      this.handleCollisions(world, oldPosition);
    }

    // Update rotation
    this.rotation.x += input.lookDelta.x;
    this.rotation.y += input.lookDelta.y;

    // Clamp pitch
    this.rotation.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotation.y));

    // Normalize yaw
    this.rotation.x = this.rotation.x % (Math.PI * 2);
  }

  /**
   * Calculate movement direction from input
   */
  private calculateMoveDirection(input: PlayerInput): Vector3 {
    const dir = new Vector3(0, 0, 0);

    const forward = new Vector3(
      Math.sin(this.rotation.x),
      0,
      Math.cos(this.rotation.x)
    ).normalize();

    const right = new Vector3(
      forward.z,
      0,
      -forward.x
    ).normalize();

    if (input.forward) dir.add(forward);
    if (input.backward) dir.subtract(forward);
    if (input.right) dir.add(right);
    if (input.left) dir.subtract(right);

    if (dir.length() > 0) {
      dir.normalize();
    }

    return dir;
  }

  /**
   * Update flying movement
   */
  private updateFlying(deltaTime: number, moveDir: Vector3, input: PlayerInput): void {
    const speed = input.sprint ? this.flySpeed * 2 : this.flySpeed;

    this.velocity.x = moveDir.x * speed;
    this.velocity.z = moveDir.z * speed;

    if (input.jump) {
      this.velocity.y = speed;
    } else if (input.sneak) {
      this.velocity.y = -speed;
    } else {
      this.velocity.y = 0;
    }
  }

  /**
   * Update walking movement
   */
  private updateWalking(deltaTime: number, moveDir: Vector3, input: PlayerInput, world: VoxelWorld): void {
    const speed = input.sprint ? this.moveSpeed * 1.3 : this.moveSpeed;
    const sneakMultiplier = input.sneak ? 0.3 : 1.0;

    // Horizontal movement
    this.velocity.x = moveDir.x * speed * sneakMultiplier;
    this.velocity.z = moveDir.z * speed * sneakMultiplier;

    // Jumping
    if (input.jump && this.onGround) {
      this.velocity.y = this.jumpSpeed;
      this.onGround = false;
    }

    // Apply gravity
    this.velocity.y -= this.gravity * deltaTime;

    // Terminal velocity
    this.velocity.y = Math.max(-50, Math.min(50, this.velocity.y));

    // Check if in water
    this.checkWater(world);
  }

  /**
   * Handle collisions with world
   */
  private handleCollisions(world: VoxelWorld, oldPosition: Vector3): void {
    const bounds = this.getPlayerBounds();
    this.onGround = false;

    // Check all potential collision blocks
    for (let x = Math.floor(bounds.min.x); x <= Math.ceil(bounds.max.x); x++) {
      for (let y = Math.floor(bounds.min.y); y <= Math.ceil(bounds.max.y); y++) {
        for (let z = Math.floor(bounds.min.z); z <= Math.ceil(bounds.max.z); z++) {
          const voxel = world.getVoxelAt(x, y, z);
          if (voxel && voxel.solid) {
            this.resolveCollision(x, y, z, oldPosition);
          }
        }
      }
    }
  }

  /**
   * Resolve collision with a block
   */
  private resolveCollision(blockX: number, blockY: number, blockZ: number, oldPosition: Vector3): void {
    const bounds = this.getPlayerBounds();

    const blockMin = new Vector3(blockX, blockY, blockZ);
    const blockMax = new Vector3(blockX + 1, blockY + 1, blockZ + 1);

    // Check if overlapping
    if (
      bounds.max.x > blockMin.x && bounds.min.x < blockMax.x &&
      bounds.max.y > blockMin.y && bounds.min.y < blockMax.y &&
      bounds.max.z > blockMin.z && bounds.min.z < blockMax.z
    ) {
      // Calculate overlap on each axis
      const overlapX = Math.min(bounds.max.x - blockMin.x, blockMax.x - bounds.min.x);
      const overlapY = Math.min(bounds.max.y - blockMin.y, blockMax.y - bounds.min.y);
      const overlapZ = Math.min(bounds.max.z - blockMin.z, blockMax.z - bounds.min.z);

      // Resolve on axis with smallest overlap
      if (overlapY <= overlapX && overlapY <= overlapZ) {
        // Y-axis collision
        if (this.velocity.y < 0) {
          this.position.y = blockMax.y;
          this.onGround = true;
        } else {
          this.position.y = blockMin.y - this.playerHeight;
        }
        this.velocity.y = 0;
      } else if (overlapX <= overlapZ) {
        // X-axis collision
        if (this.position.x < blockX + 0.5) {
          this.position.x = blockMin.x - this.playerWidth / 2;
        } else {
          this.position.x = blockMax.x + this.playerWidth / 2;
        }
        this.velocity.x = 0;
      } else {
        // Z-axis collision
        if (this.position.z < blockZ + 0.5) {
          this.position.z = blockMin.z - this.playerWidth / 2;
        } else {
          this.position.z = blockMax.z + this.playerWidth / 2;
        }
        this.velocity.z = 0;
      }
    }
  }

  /**
   * Get player bounding box
   */
  private getPlayerBounds(): { min: Vector3; max: Vector3 } {
    const halfWidth = this.playerWidth / 2;

    return {
      min: new Vector3(
        this.position.x - halfWidth,
        this.position.y,
        this.position.z - halfWidth
      ),
      max: new Vector3(
        this.position.x + halfWidth,
        this.position.y + this.playerHeight,
        this.position.z + halfWidth
      )
    };
  }

  /**
   * Check if player is in water
   */
  private checkWater(world: VoxelWorld): void {
    const eyePos = this.getEyePosition();
    const voxel = world.getVoxelAt(
      Math.floor(eyePos.x),
      Math.floor(eyePos.y),
      Math.floor(eyePos.z)
    );

    this.isSwimming = voxel?.type === 5; // Water type

    if (this.isSwimming) {
      this.velocity.y *= 0.8; // Water resistance
    }
  }

  /**
   * Raycast from player to find block
   */
  public raycast(world: VoxelWorld): RaycastResult {
    const start = this.getEyePosition();
    const direction = this.getLookDirection();

    let t = 0;
    const step = 0.1;

    while (t < this.REACH_DISTANCE) {
      const x = start.x + direction.x * t;
      const y = start.y + direction.y * t;
      const z = start.z + direction.z * t;

      const blockX = Math.floor(x);
      const blockY = Math.floor(y);
      const blockZ = Math.floor(z);

      const voxel = world.getVoxelAt(blockX, blockY, blockZ);

      if (voxel && voxel.solid) {
        // Hit a block - calculate normal
        const localX = x - blockX;
        const localY = y - blockY;
        const localZ = z - blockZ;

        let normal = new Vector3(0, 1, 0);

        const epsilon = 0.01;
        if (localX < epsilon) normal = new Vector3(-1, 0, 0);
        else if (localX > 1 - epsilon) normal = new Vector3(1, 0, 0);
        else if (localY < epsilon) normal = new Vector3(0, -1, 0);
        else if (localY > 1 - epsilon) normal = new Vector3(0, 1, 0);
        else if (localZ < epsilon) normal = new Vector3(0, 0, -1);
        else if (localZ > 1 - epsilon) normal = new Vector3(0, 0, 1);

        return {
          hit: true,
          position: new Vector3(blockX, blockY, blockZ),
          normal: normal,
          distance: t
        };
      }

      t += step;
    }

    return {
      hit: false,
      position: null,
      normal: null,
      distance: this.REACH_DISTANCE
    };
  }

  /**
   * Handle block breaking
   */
  public updateBlockBreaking(deltaTime: number, world: VoxelWorld, input: PlayerInput, inventory: Inventory): number {
    if (!input.breakBlock) {
      this.blockBreakProgress = 0;
      this.blockBreakPosition = null;
      this.blockBreakTime = 0;
      return 0;
    }

    const raycast = this.raycast(world);
    if (!raycast.hit || !raycast.position) {
      this.blockBreakProgress = 0;
      this.blockBreakPosition = null;
      return 0;
    }

    // Check if same block
    if (
      !this.blockBreakPosition ||
      !raycast.position.equals(this.blockBreakPosition)
    ) {
      this.blockBreakPosition = raycast.position.clone();
      this.blockBreakProgress = 0;
      this.blockBreakTime = 0;
    }

    // Get block hardness
    const voxel = world.getVoxelAt(
      raycast.position.x,
      raycast.position.y,
      raycast.position.z
    );

    if (!voxel) return 0;

    const blockType = voxel.type as BlockType;
    const hardness = BlockRegistry.getHardness(blockType);

    if (hardness < 0) {
      // Unbreakable
      return 0;
    }

    // Creative mode instant break
    if (this.mode === PlayerMode.Creative) {
      world.destroyVoxelAt(raycast.position.x, raycast.position.y, raycast.position.z);
      this.blockBreakProgress = 0;
      return 0;
    }

    // Update progress
    const breakSpeed = 1.0 / Math.max(0.1, hardness);
    this.blockBreakTime += deltaTime;
    this.blockBreakProgress = Math.min(1.0, this.blockBreakTime * breakSpeed);

    // Break block
    if (this.blockBreakProgress >= 1.0) {
      world.destroyVoxelAt(raycast.position.x, raycast.position.y, raycast.position.z);

      // Add to inventory
      const props = BlockRegistry.get(blockType);
      if (props && props.dropsItem) {
        inventory.addItem(props.dropsItem, 1);
      }

      this.blockBreakProgress = 0;
      this.blockBreakPosition = null;
      this.blockBreakTime = 0;
    }

    return this.blockBreakProgress;
  }

  /**
   * Handle block placement
   */
  public placeBlock(world: VoxelWorld, inventory: Inventory): boolean {
    const raycast = this.raycast(world);
    if (!raycast.hit || !raycast.position || !raycast.normal) {
      return false;
    }

    // Calculate placement position
    const placePos = raycast.position.clone().add(raycast.normal);

    // Check if player would be inside block
    if (this.wouldCollideWithBlock(placePos)) {
      return false;
    }

    // Get selected block
    const selectedBlock = inventory.getSelectedBlockType();
    if (selectedBlock === BlockType.Air) {
      return false;
    }

    // Creative mode - unlimited blocks
    if (this.mode === PlayerMode.Creative) {
      const material = BlockRegistry.getMaterial(selectedBlock);
      world.setVoxelAt(placePos.x, placePos.y, placePos.z, material);
      return true;
    }

    // Survival mode - use from inventory
    if (inventory.useSelectedItem()) {
      const material = BlockRegistry.getMaterial(selectedBlock);
      world.setVoxelAt(placePos.x, placePos.y, placePos.z, material);
      return true;
    }

    return false;
  }

  /**
   * Check if placing block would collide with player
   */
  private wouldCollideWithBlock(blockPos: Vector3): boolean {
    const bounds = this.getPlayerBounds();
    const blockMin = blockPos;
    const blockMax = blockPos.clone().add(new Vector3(1, 1, 1));

    return (
      bounds.max.x > blockMin.x && bounds.min.x < blockMax.x &&
      bounds.max.y > blockMin.y && bounds.min.y < blockMax.y &&
      bounds.max.z > blockMin.z && bounds.min.z < blockMax.z
    );
  }

  /**
   * Toggle fly mode
   */
  public toggleFly(): void {
    if (this.mode === PlayerMode.Creative) {
      this.isFlying = !this.isFlying;
      if (this.isFlying) {
        this.velocity.y = 0;
      }
    }
  }

  /**
   * Get player position
   */
  public getPosition(): Vector3 {
    return this.position.clone();
  }

  /**
   * Get eye position
   */
  public getEyePosition(): Vector3 {
    return new Vector3(
      this.position.x,
      this.position.y + this.playerEyeHeight,
      this.position.z
    );
  }

  /**
   * Get look direction
   */
  public getLookDirection(): Vector3 {
    return new Vector3(
      Math.sin(this.rotation.x) * Math.cos(this.rotation.y),
      Math.sin(this.rotation.y),
      Math.cos(this.rotation.x) * Math.cos(this.rotation.y)
    ).normalize();
  }

  /**
   * Get rotation
   */
  public getRotation(): Vector3 {
    return this.rotation.clone();
  }

  /**
   * Set position
   */
  public setPosition(position: Vector3): void {
    this.position = position.clone();
  }

  /**
   * Set mode
   */
  public setMode(mode: PlayerMode): void {
    this.mode = mode;
    if (mode === PlayerMode.Survival) {
      this.isFlying = false;
    }
  }

  /**
   * Get mode
   */
  public getMode(): PlayerMode {
    return this.mode;
  }

  /**
   * Is on ground
   */
  public isOnGround(): boolean {
    return this.onGround;
  }
}

/**
 * Player input state
 */
export interface PlayerInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
  breakBlock: boolean;
  placeBlock: boolean;
  toggleFly: boolean;
  lookDelta: Vector3;
}
