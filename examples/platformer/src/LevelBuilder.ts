/**
 * LevelBuilder - Construct platformer levels with platforms and collectibles
 *
 * Features:
 * - Create multiple level layouts
 * - Place platforms of various types
 * - Spawn collectibles
 * - Set checkpoints
 * - Define hazards
 * - Set goal/end point
 */

import { Vector3 } from 'g3d';
import { PhysicsWorld } from 'g3d';
import {
  Platform,
  StaticPlatform,
  MovingPlatform,
  RotatingPlatform,
  FallingPlatform,
  BouncyPlatform,
  DisappearingPlatform
} from './Platform';
import { Collectible, CollectibleType } from './Collectible';

/**
 * Level data structure
 */
export interface LevelData {
  platforms: Platform[];
  collectibles: Collectible[];
  checkpoints: Vector3[];
  startPosition: Vector3;
  goalPosition: Vector3;
}

/**
 * Level builder class for creating platformer levels
 */
export class LevelBuilder {
  private physicsWorld: PhysicsWorld;
  private checkpoints: Vector3[] = [];

  constructor(physicsWorld: PhysicsWorld) {
    this.physicsWorld = physicsWorld;
  }

  /**
   * Build Level 1 - Tutorial level with basic platforms
   */
  buildLevel1(): LevelData {
    const platforms: Platform[] = [];
    const collectibles: Collectible[] = [];

    const groundSize = new Vector3(20, 1, 20);
    const ground = new StaticPlatform(
      this.physicsWorld,
      new Vector3(0, -0.5, 0),
      groundSize
    );
    platforms.push(ground);

    const platform1 = new StaticPlatform(
      this.physicsWorld,
      new Vector3(5, 1, 0),
      new Vector3(3, 0.5, 3)
    );
    platforms.push(platform1);

    collectibles.push(new Collectible(
      new Vector3(5, 2.5, 0),
      { type: CollectibleType.Coin }
    ));

    const platform2 = new StaticPlatform(
      this.physicsWorld,
      new Vector3(10, 2, 0),
      new Vector3(3, 0.5, 3)
    );
    platforms.push(platform2);

    collectibles.push(new Collectible(
      new Vector3(10, 3.5, 0),
      { type: CollectibleType.Coin }
    ));

    const movingPlatform1 = new MovingPlatform(
      this.physicsWorld,
      new Vector3(15, 3, 0),
      new Vector3(2, 0.5, 2),
      [new Vector3(15, 3, 5), new Vector3(15, 3, -5)],
      3.0,
      true
    );
    platforms.push(movingPlatform1);

    collectibles.push(new Collectible(
      new Vector3(15, 4.5, 0),
      { type: CollectibleType.Gem }
    ));

    const platform3 = new StaticPlatform(
      this.physicsWorld,
      new Vector3(20, 4, 0),
      new Vector3(4, 0.5, 4)
    );
    platforms.push(platform3);

    this.checkpoints.push(new Vector3(20, 5, 0));

    const bouncyPlatform = new BouncyPlatform(
      this.physicsWorld,
      new Vector3(25, 2, 0),
      new Vector3(3, 0.5, 3),
      25.0
    );
    platforms.push(bouncyPlatform);

    collectibles.push(new Collectible(
      new Vector3(25, 3.5, 0),
      { type: CollectibleType.Coin }
    ));

    const platform4 = new StaticPlatform(
      this.physicsWorld,
      new Vector3(30, 8, 0),
      new Vector3(3, 0.5, 3)
    );
    platforms.push(platform4);

    collectibles.push(new Collectible(
      new Vector3(30, 9.5, 0),
      { type: CollectibleType.Coin }
    ));

    const rotatingPlatform = new RotatingPlatform(
      this.physicsWorld,
      new Vector3(35, 8, 0),
      new Vector3(4, 0.5, 1),
      new Vector3(0, 1, 0),
      0.5
    );
    platforms.push(rotatingPlatform);

    collectibles.push(new Collectible(
      new Vector3(35, 9.5, 0),
      { type: CollectibleType.Coin }
    ));

    const fallingPlatform1 = new FallingPlatform(
      this.physicsWorld,
      new Vector3(40, 8, -3),
      new Vector3(2, 0.5, 2),
      0.5
    );
    platforms.push(fallingPlatform1);

    const fallingPlatform2 = new FallingPlatform(
      this.physicsWorld,
      new Vector3(40, 8, 0),
      new Vector3(2, 0.5, 2),
      0.5
    );
    platforms.push(fallingPlatform2);

    const fallingPlatform3 = new FallingPlatform(
      this.physicsWorld,
      new Vector3(40, 8, 3),
      new Vector3(2, 0.5, 2),
      0.5
    );
    platforms.push(fallingPlatform3);

    collectibles.push(new Collectible(
      new Vector3(40, 9.5, 0),
      { type: CollectibleType.Gem }
    ));

    const platform5 = new StaticPlatform(
      this.physicsWorld,
      new Vector3(45, 8, 0),
      new Vector3(4, 0.5, 4)
    );
    platforms.push(platform5);

    this.checkpoints.push(new Vector3(45, 9, 0));

    const disappearingPlatform1 = new DisappearingPlatform(
      this.physicsWorld,
      new Vector3(50, 8, 0),
      new Vector3(2, 0.5, 2),
      2.0,
      1.5
    );
    platforms.push(disappearingPlatform1);

    const disappearingPlatform2 = new DisappearingPlatform(
      this.physicsWorld,
      new Vector3(53, 8, 0),
      new Vector3(2, 0.5, 2),
      2.0,
      1.5
    );
    platforms.push(disappearingPlatform2);

    const goalPlatform = new StaticPlatform(
      this.physicsWorld,
      new Vector3(56, 8, 0),
      new Vector3(5, 0.5, 5)
    );
    platforms.push(goalPlatform);

    collectibles.push(new Collectible(
      new Vector3(56, 9.5, 0),
      { type: CollectibleType.PowerUp }
    ));

    return {
      platforms,
      collectibles,
      checkpoints: this.checkpoints,
      startPosition: new Vector3(0, 2, 0),
      goalPosition: new Vector3(56, 9, 0)
    };
  }

  /**
   * Build Level 2 - Advanced level with more challenges
   */
  buildLevel2(): LevelData {
    const platforms: Platform[] = [];
    const collectibles: Collectible[] = [];

    const ground = new StaticPlatform(
      this.physicsWorld,
      new Vector3(0, -0.5, 0),
      new Vector3(15, 1, 15)
    );
    platforms.push(ground);

    const spiralRadius = 10;
    const spiralHeight = 20;
    const numPlatforms = 12;

    for (let i = 0; i < numPlatforms; i++) {
      const angle = (i / numPlatforms) * Math.PI * 3;
      const height = (i / numPlatforms) * spiralHeight;
      const x = Math.cos(angle) * spiralRadius;
      const z = Math.sin(angle) * spiralRadius;

      const platform = new StaticPlatform(
        this.physicsWorld,
        new Vector3(x, height, z),
        new Vector3(2, 0.5, 2)
      );
      platforms.push(platform);

      collectibles.push(new Collectible(
        new Vector3(x, height + 1.5, z),
        { type: CollectibleType.Coin }
      ));

      if (i % 3 === 0) {
        this.checkpoints.push(new Vector3(x, height + 1, z));
      }
    }

    const topPlatform = new StaticPlatform(
      this.physicsWorld,
      new Vector3(0, spiralHeight + 2, 0),
      new Vector3(5, 0.5, 5)
    );
    platforms.push(topPlatform);

    collectibles.push(new Collectible(
      new Vector3(0, spiralHeight + 3.5, 0),
      { type: CollectibleType.PowerUp }
    ));

    return {
      platforms,
      collectibles,
      checkpoints: this.checkpoints,
      startPosition: new Vector3(0, 2, 0),
      goalPosition: new Vector3(0, spiralHeight + 3, 0)
    };
  }

  /**
   * Build Level 3 - Parkour challenge
   */
  buildLevel3(): LevelData {
    const platforms: Platform[] = [];
    const collectibles: Collectible[] = [];

    const startPlatform = new StaticPlatform(
      this.physicsWorld,
      new Vector3(0, 0, 0),
      new Vector3(5, 0.5, 5)
    );
    platforms.push(startPlatform);

    for (let i = 0; i < 10; i++) {
      const x = i * 4 + 5;
      const y = Math.sin(i * 0.5) * 3 + 3;
      const z = Math.cos(i * 0.7) * 5;

      if (i % 2 === 0) {
        const fallingPlatform = new FallingPlatform(
          this.physicsWorld,
          new Vector3(x, y, z),
          new Vector3(2, 0.5, 2),
          0.3
        );
        platforms.push(fallingPlatform);
      } else {
        const movingPlatform = new MovingPlatform(
          this.physicsWorld,
          new Vector3(x, y, z),
          new Vector3(2, 0.5, 2),
          [new Vector3(x, y + 2, z), new Vector3(x, y - 2, z)],
          2.0,
          true
        );
        platforms.push(movingPlatform);
      }

      collectibles.push(new Collectible(
        new Vector3(x, y + 1.5, z),
        { type: i % 3 === 0 ? CollectibleType.Gem : CollectibleType.Coin }
      ));

      if (i % 3 === 0) {
        this.checkpoints.push(new Vector3(x, y + 1, z));
      }
    }

    const endPlatform = new StaticPlatform(
      this.physicsWorld,
      new Vector3(50, 5, 0),
      new Vector3(6, 0.5, 6)
    );
    platforms.push(endPlatform);

    collectibles.push(new Collectible(
      new Vector3(50, 6.5, 0),
      { type: CollectibleType.PowerUp }
    ));

    return {
      platforms,
      collectibles,
      checkpoints: this.checkpoints,
      startPosition: new Vector3(0, 2, 0),
      goalPosition: new Vector3(50, 6, 0)
    };
  }

  /**
   * Get all checkpoints in the level
   */
  getCheckpoints(): Vector3[] {
    return this.checkpoints;
  }

  /**
   * Clear all checkpoints
   */
  clearCheckpoints(): void {
    this.checkpoints = [];
  }

  /**
   * Add a custom checkpoint
   */
  addCheckpoint(position: Vector3): void {
    this.checkpoints.push(position);
  }
}
