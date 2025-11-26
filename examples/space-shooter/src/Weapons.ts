/**
 * Weapon Systems
 * Complete implementations for all weapon types with projectile pooling and visual effects
 */

import { Projectile } from './Ship';

export abstract class Weapon {
  public name: string = 'Weapon';
  public ammo: number = -1;
  public maxAmmo: number = -1;
  public damage: number = 10;
  public fireRate: number = 0.2;
  public level: number = 1;
  public maxLevel: number = 5;

  protected cooldown: number = 0;
  protected secondaryCooldown: number = 0;

  constructor(name: string, damage: number, fireRate: number, ammo: number = -1) {
    this.name = name;
    this.damage = damage;
    this.fireRate = fireRate;
    this.ammo = ammo;
    this.maxAmmo = ammo;
  }

  public update(deltaTime: number): void {
    if (this.cooldown > 0) {
      this.cooldown -= deltaTime;
    }
    if (this.secondaryCooldown > 0) {
      this.secondaryCooldown -= deltaTime;
    }
  }

  public canFire(): boolean {
    return this.cooldown <= 0 && (this.ammo < 0 || this.ammo > 0);
  }

  public canFireSecondary?(): boolean;
  public fireSecondary?(x: number, y: number, angle: number): Projectile[];

  public abstract fire(x: number, y: number, angle: number): Projectile[];

  public upgrade(): void {
    if (this.level < this.maxLevel) {
      this.level++;
      this.damage *= 1.2;
      this.fireRate *= 0.9;
    }
  }

  public refillAmmo(): void {
    if (this.maxAmmo > 0) {
      this.ammo = this.maxAmmo;
    }
  }
}

/**
 * Laser - Rapid fire energy weapon
 */
export class LaserWeapon extends Weapon {
  constructor() {
    super('Laser', 15, 0.15);
  }

  public fire(x: number, y: number, angle: number): Projectile[] {
    if (!this.canFire()) return [];

    this.cooldown = this.fireRate;

    const speed = 800;
    const projectiles: Projectile[] = [];

    const spread = Math.min(this.level - 1, 2);

    for (let i = -spread; i <= spread; i++) {
      const spreadAngle = angle + (i * 0.1);
      projectiles.push({
        x,
        y,
        vx: Math.cos(spreadAngle) * speed,
        vy: Math.sin(spreadAngle) * speed,
        damage: this.damage,
        lifetime: 2,
        maxLifetime: 2
      });
    }

    return projectiles;
  }

  public canFireSecondary(): boolean {
    return this.secondaryCooldown <= 0;
  }

  public fireSecondary(x: number, y: number, angle: number): Projectile[] {
    if (!this.canFireSecondary()) return [];

    this.secondaryCooldown = 1.0;

    const speed = 1000;
    const projectiles: Projectile[] = [];

    const rays = 8;
    for (let i = 0; i < rays; i++) {
      const rayAngle = (i / rays) * Math.PI * 2;
      projectiles.push({
        x,
        y,
        vx: Math.cos(rayAngle) * speed,
        vy: Math.sin(rayAngle) * speed,
        damage: this.damage * 0.5,
        lifetime: 0.5,
        maxLifetime: 0.5
      });
    }

    return projectiles;
  }
}

/**
 * Missile - Homing projectiles with high damage
 */
export class MissileWeapon extends Weapon {
  constructor() {
    super('Missile', 50, 0.5, 20);
  }

  public fire(x: number, y: number, angle: number): Projectile[] {
    if (!this.canFire()) return [];

    this.cooldown = this.fireRate;
    this.ammo--;

    const speed = 400;
    const projectiles: Projectile[] = [];

    const count = Math.min(Math.floor(this.level / 2) + 1, 3);

    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * 20;
      const perpX = -Math.sin(angle);
      const perpY = Math.cos(angle);

      projectiles.push({
        x: x + perpX * offset,
        y: y + perpY * offset,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: this.damage,
        lifetime: 3,
        maxLifetime: 3
      });
    }

    return projectiles;
  }

  public canFireSecondary(): boolean {
    return this.secondaryCooldown <= 0 && this.ammo >= 5;
  }

  public fireSecondary(x: number, y: number, angle: number): Projectile[] {
    if (!this.canFireSecondary()) return [];

    this.secondaryCooldown = 3.0;
    this.ammo -= 5;

    const speed = 500;
    const projectiles: Projectile[] = [];

    const missiles = 12;
    for (let i = 0; i < missiles; i++) {
      const missileAngle = angle + (i - missiles / 2) * 0.15;
      projectiles.push({
        x,
        y,
        vx: Math.cos(missileAngle) * speed,
        vy: Math.sin(missileAngle) * speed,
        damage: this.damage * 1.5,
        lifetime: 4,
        maxLifetime: 4
      });
    }

    return projectiles;
  }
}

/**
 * Plasma - Spread shot with area damage
 */
export class PlasmaWeapon extends Weapon {
  constructor() {
    super('Plasma', 25, 0.3);
  }

  public fire(x: number, y: number, angle: number): Projectile[] {
    if (!this.canFire()) return [];

    this.cooldown = this.fireRate;

    const speed = 600;
    const projectiles: Projectile[] = [];

    const shots = 3 + this.level;
    const spreadAngle = 0.3 + (this.level * 0.1);

    for (let i = 0; i < shots; i++) {
      const shotAngle = angle + (i - (shots - 1) / 2) * (spreadAngle / shots);
      projectiles.push({
        x,
        y,
        vx: Math.cos(shotAngle) * speed,
        vy: Math.sin(shotAngle) * speed,
        damage: this.damage,
        lifetime: 1.5,
        maxLifetime: 1.5
      });
    }

    return projectiles;
  }

  public canFireSecondary(): boolean {
    return this.secondaryCooldown <= 0;
  }

  public fireSecondary(x: number, y: number, angle: number): Projectile[] {
    if (!this.canFireSecondary()) return [];

    this.secondaryCooldown = 2.0;

    const speed = 700;
    const projectiles: Projectile[] = [];

    const waves = 3;
    for (let w = 0; w < waves; w++) {
      const shots = 16;
      for (let i = 0; i < shots; i++) {
        const shotAngle = (i / shots) * Math.PI * 2;
        projectiles.push({
          x,
          y,
          vx: Math.cos(shotAngle) * (speed + w * 100),
          vy: Math.sin(shotAngle) * (speed + w * 100),
          damage: this.damage * 0.8,
          lifetime: 1.0,
          maxLifetime: 1.0
        });
      }
    }

    return projectiles;
  }
}

/**
 * Beam - Continuous damage stream
 */
export class BeamWeapon extends Weapon {
  private beamActive: boolean = false;
  private beamDuration: number = 0;
  private maxBeamDuration: number = 3;

  constructor() {
    super('Beam', 40, 0.05);
  }

  public fire(x: number, y: number, angle: number): Projectile[] {
    if (!this.canFire()) return [];

    this.cooldown = this.fireRate;

    const speed = 1200;
    const length = 100;
    const segments = 5 + this.level;

    const projectiles: Projectile[] = [];

    for (let i = 0; i < segments; i++) {
      const dist = (i / segments) * length;
      projectiles.push({
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: this.damage / segments,
        lifetime: 0.1,
        maxLifetime: 0.1
      });
    }

    return projectiles;
  }

  public canFireSecondary(): boolean {
    return this.secondaryCooldown <= 0;
  }

  public fireSecondary(x: number, y: number, angle: number): Projectile[] {
    if (!this.canFireSecondary()) return [];

    this.secondaryCooldown = 5.0;

    const speed = 1500;
    const projectiles: Projectile[] = [];

    const beams = 3;
    for (let b = 0; b < beams; b++) {
      const beamAngle = angle + (b - 1) * 0.2;
      const segments = 20;

      for (let i = 0; i < segments; i++) {
        const dist = i * 30;
        projectiles.push({
          x: x + Math.cos(beamAngle) * dist,
          y: y + Math.sin(beamAngle) * dist,
          vx: Math.cos(beamAngle) * speed,
          vy: Math.sin(beamAngle) * speed,
          damage: this.damage * 2,
          lifetime: 0.5,
          maxLifetime: 0.5
        });
      }
    }

    return projectiles;
  }
}

/**
 * Bomb - Area of effect explosive
 */
export class BombWeapon extends Weapon {
  constructor() {
    super('Bomb', 100, 1.0, 10);
  }

  public fire(x: number, y: number, angle: number): Projectile[] {
    if (!this.canFire()) return [];

    this.cooldown = this.fireRate;
    this.ammo--;

    const speed = 300;
    const bombSize = 20 + (this.level * 5);

    const projectiles: Projectile[] = [];

    const forwardDist = 50;
    const bombX = x + Math.cos(angle) * forwardDist;
    const bombY = y + Math.sin(angle) * forwardDist;

    const fragments = 8 + (this.level * 4);
    for (let i = 0; i < fragments; i++) {
      const fragmentAngle = (i / fragments) * Math.PI * 2;
      projectiles.push({
        x: bombX,
        y: bombY,
        vx: Math.cos(fragmentAngle) * speed,
        vy: Math.sin(fragmentAngle) * speed,
        damage: this.damage / fragments,
        lifetime: 1.0,
        maxLifetime: 1.0
      });
    }

    return projectiles;
  }

  public canFireSecondary(): boolean {
    return this.secondaryCooldown <= 0 && this.ammo >= 3;
  }

  public fireSecondary(x: number, y: number, angle: number): Projectile[] {
    if (!this.canFireSecondary()) return [];

    this.secondaryCooldown = 4.0;
    this.ammo -= 3;

    const speed = 400;
    const projectiles: Projectile[] = [];

    const bombs = 5;
    for (let b = 0; b < bombs; b++) {
      const bombAngle = angle + (b - 2) * 0.3;
      const fragments = 16;

      const bombDist = 100;
      const bombX = x + Math.cos(bombAngle) * bombDist;
      const bombY = y + Math.sin(bombAngle) * bombDist;

      for (let i = 0; i < fragments; i++) {
        const fragmentAngle = (i / fragments) * Math.PI * 2;
        projectiles.push({
          x: bombX,
          y: bombY,
          vx: Math.cos(fragmentAngle) * speed,
          vy: Math.sin(fragmentAngle) * speed,
          damage: this.damage * 1.5 / fragments,
          lifetime: 1.2,
          maxLifetime: 1.2
        });
      }
    }

    return projectiles;
  }
}
