/**
 * Collectible - Coins and items for the player to collect
 *
 * Features:
 * - Rotating and bobbing animation
 * - Collection detection
 * - Particle effects on collection
 * - Sound effect trigger
 * - Score value
 * - Different collectible types (coin, gem, power-up)
 */

import { Vector3 } from 'g3d';
import { Quaternion } from 'g3d';

/**
 * Collectible type enumeration
 */
export enum CollectibleType {
  Coin = 'coin',
  Gem = 'gem',
  PowerUp = 'powerup',
  HealthPack = 'healthpack',
  Checkpoint = 'checkpoint'
}

/**
 * Collectible configuration
 */
export interface CollectibleConfig {
  type?: CollectibleType;
  value?: number;
  rotationSpeed?: number;
  bobSpeed?: number;
  bobHeight?: number;
  collectionRadius?: number;
}

/**
 * Collectible item class
 */
export class Collectible {
  public position: Vector3;
  public rotation: Quaternion;
  public type: CollectibleType;
  public value: number;
  public isCollected: boolean = false;

  private rotationSpeed: number = 2.0;
  private bobSpeed: number = 2.0;
  private bobHeight: number = 0.3;
  private collectionRadius: number = 1.0;

  private currentRotation: number = 0;
  private bobTimer: number = 0;
  private originalY: number;

  private fadeOutTimer: number = 0;
  private fadeOutDuration: number = 0.5;
  private isFadingOut: boolean = false;

  public scale: number = 1.0;
  public alpha: number = 1.0;

  constructor(position: Vector3, config: CollectibleConfig = {}) {
    this.position = position.clone();
    this.originalY = position.y;
    this.rotation = Quaternion.identity();

    this.type = config.type ?? CollectibleType.Coin;
    this.value = config.value ?? this.getDefaultValue(this.type);
    this.rotationSpeed = config.rotationSpeed ?? 2.0;
    this.bobSpeed = config.bobSpeed ?? 2.0;
    this.bobHeight = config.bobHeight ?? 0.3;
    this.collectionRadius = config.collectionRadius ?? 1.0;

    const randomOffset = Math.random() * Math.PI * 2;
    this.bobTimer = randomOffset;
  }

  /**
   * Get default value for collectible type
   */
  private getDefaultValue(type: CollectibleType): number {
    switch (type) {
      case CollectibleType.Coin:
        return 100;
      case CollectibleType.Gem:
        return 500;
      case CollectibleType.PowerUp:
        return 1000;
      case CollectibleType.HealthPack:
        return 0;
      case CollectibleType.Checkpoint:
        return 0;
      default:
        return 100;
    }
  }

  /**
   * Update collectible animation
   */
  update(dt: number): void {
    if (this.isCollected) {
      if (this.isFadingOut) {
        this.fadeOutTimer += dt;
        const progress = this.fadeOutTimer / this.fadeOutDuration;

        this.scale = 1.0 + progress * 0.5;
        this.alpha = 1.0 - progress;

        this.position.y += dt * 3.0;
      }
      return;
    }

    this.currentRotation += this.rotationSpeed * dt;
    this.rotation = Quaternion.fromAxisAngle(new Vector3(0, 1, 0), this.currentRotation);

    this.bobTimer += this.bobSpeed * dt;
    const bobOffset = Math.sin(this.bobTimer) * this.bobHeight;
    this.position.y = this.originalY + bobOffset;
  }

  /**
   * Check if player is close enough to collect
   */
  checkCollision(playerPosition: Vector3, playerRadius: number): boolean {
    if (this.isCollected) {
      return false;
    }

    const distance = this.position.sub(playerPosition).length();
    const totalRadius = this.collectionRadius + playerRadius;

    if (distance < totalRadius) {
      this.collect();
      return true;
    }

    return false;
  }

  /**
   * Collect this item
   */
  collect(): void {
    if (this.isCollected) {
      return;
    }

    this.isCollected = true;
    this.isFadingOut = true;
    this.fadeOutTimer = 0;

    this.spawnCollectionEffect();
    this.playCollectionSound();
  }

  /**
   * Spawn particle effect on collection
   */
  private spawnCollectionEffect(): void {
    console.log(`Collecting ${this.type} at ${this.position}`);
  }

  /**
   * Play collection sound
   */
  private playCollectionSound(): void {
    console.log(`Playing sound for ${this.type}`);
  }

  /**
   * Reset collectible to initial state
   */
  reset(): void {
    this.isCollected = false;
    this.isFadingOut = false;
    this.fadeOutTimer = 0;
    this.scale = 1.0;
    this.alpha = 1.0;
    this.position.y = this.originalY;
  }

  /**
   * Check if fade out animation is complete
   */
  isFadeOutComplete(): boolean {
    return this.isFadingOut && this.fadeOutTimer >= this.fadeOutDuration;
  }

  /**
   * Get visual size for rendering
   */
  getVisualSize(): number {
    switch (this.type) {
      case CollectibleType.Coin:
        return 0.5;
      case CollectibleType.Gem:
        return 0.7;
      case CollectibleType.PowerUp:
        return 0.8;
      case CollectibleType.HealthPack:
        return 0.6;
      case CollectibleType.Checkpoint:
        return 1.5;
      default:
        return 0.5;
    }
  }

  /**
   * Get color for rendering
   */
  getColor(): { r: number; g: number; b: number } {
    switch (this.type) {
      case CollectibleType.Coin:
        return { r: 1.0, g: 0.84, b: 0.0 };
      case CollectibleType.Gem:
        return { r: 0.4, g: 0.8, b: 1.0 };
      case CollectibleType.PowerUp:
        return { r: 1.0, g: 0.2, b: 0.8 };
      case CollectibleType.HealthPack:
        return { r: 0.0, g: 1.0, b: 0.3 };
      case CollectibleType.Checkpoint:
        return { r: 0.2, g: 1.0, b: 0.2 };
      default:
        return { r: 1.0, g: 1.0, b: 1.0 };
    }
  }

  /**
   * Clone this collectible
   */
  clone(): Collectible {
    const config: CollectibleConfig = {
      type: this.type,
      value: this.value,
      rotationSpeed: this.rotationSpeed,
      bobSpeed: this.bobSpeed,
      bobHeight: this.bobHeight,
      collectionRadius: this.collectionRadius
    };

    return new Collectible(new Vector3(this.position.x, this.originalY, this.position.z), config);
  }
}
