/**
 * Player Ship
 * Complete implementation with 6DOF movement, multiple weapon types, shield system, and boost
 */

import { Weapon, LaserWeapon, MissileWeapon, PlasmaWeapon, BeamWeapon, BombWeapon } from './Weapons';

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  lifetime: number;
  maxLifetime: number;
}

export class Ship {
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  public rotation: number = 0;
  public targetRotation: number = 0;

  public health: number = 100;
  public maxHealth: number = 100;
  public shield: number = 100;
  public maxShield: number = 100;

  public radius: number = 20;
  public invulnerable: boolean = false;
  private invulnerabilityTime: number = 0;

  private speed: number = 300;
  private baseSpeed: number = 300;
  private boostSpeed: number = 600;
  private isBoosting: boolean = false;
  private boostEnergy: number = 100;
  private maxBoostEnergy: number = 100;

  private weapons: Weapon[] = [];
  private currentWeaponIndex: number = 0;

  private projectiles: Projectile[] = [];
  private engineParticles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
  }> = [];

  private tiltAngle: number = 0;
  private shieldRechargeDelay: number = 0;
  private shieldRechargeRate: number = 20;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;

    this.weapons = [
      new LaserWeapon(),
      new MissileWeapon(),
      new PlasmaWeapon(),
      new BeamWeapon(),
      new BombWeapon()
    ];
  }

  public move(dx: number, dy: number): void {
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      this.vx = (dx / len) * this.speed;
      this.vy = (dy / len) * this.speed;

      this.tiltAngle = dx * 0.3;
    } else {
      this.vx *= 0.9;
      this.vy *= 0.9;
      this.tiltAngle *= 0.9;
    }
  }

  public aimAt(targetX: number, targetY: number): void {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    this.targetRotation = Math.atan2(dy, dx);
  }

  public boost(active: boolean): void {
    this.isBoosting = active && this.boostEnergy > 0;
  }

  public firePrimary(): void {
    const weapon = this.weapons[this.currentWeaponIndex];
    if (weapon.canFire()) {
      const projectiles = weapon.fire(this.x, this.y, this.rotation);
      this.projectiles.push(...projectiles);
    }
  }

  public fireSecondary(): void {
    const weapon = this.weapons[this.currentWeaponIndex];
    if (weapon.canFireSecondary && weapon.canFireSecondary()) {
      const projectiles = weapon.fireSecondary!(this.x, this.y, this.rotation);
      this.projectiles.push(...projectiles);
    }
  }

  public selectWeapon(index: number): void {
    if (index >= 0 && index < this.weapons.length) {
      this.currentWeaponIndex = index;
    }
  }

  public takeDamage(damage: number): void {
    if (this.invulnerable) return;

    if (this.shield > 0) {
      this.shield -= damage;
      if (this.shield < 0) {
        this.health += this.shield;
        this.shield = 0;
      }
    } else {
      this.health -= damage;
    }

    this.shieldRechargeDelay = 3.0;

    if (this.health <= 0) {
      this.health = 0;
    }
  }

  public heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  public rechargeShield(amount: number): void {
    this.shield = Math.min(this.maxShield, this.shield + amount);
  }

  public upgradeWeapon(): void {
    this.weapons[this.currentWeaponIndex].upgrade();
  }

  public increaseSpeed(amount: number, duration: number): void {
    this.baseSpeed += amount;
    this.speed = this.baseSpeed;

    setTimeout(() => {
      this.baseSpeed -= amount;
      this.speed = this.baseSpeed;
    }, duration * 1000);
  }

  public grantInvulnerability(duration: number): void {
    this.invulnerable = true;
    this.invulnerabilityTime = duration;
  }

  public reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.health = this.maxHealth;
    this.shield = this.maxShield;
    this.projectiles = [];
    this.grantInvulnerability(3);
  }

  public update(deltaTime: number, canvasWidth: number, canvasHeight: number): void {
    if (this.isBoosting && this.boostEnergy > 0) {
      this.speed = this.boostSpeed;
      this.boostEnergy -= 50 * deltaTime;
      if (this.boostEnergy < 0) {
        this.boostEnergy = 0;
        this.isBoosting = false;
      }

      this.spawnBoostParticles();
    } else {
      this.speed = this.baseSpeed;
      this.boostEnergy = Math.min(this.maxBoostEnergy, this.boostEnergy + 20 * deltaTime);
    }

    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;

    this.x = Math.max(this.radius, Math.min(canvasWidth - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(canvasHeight - this.radius, this.y));

    let angleDiff = this.targetRotation - this.rotation;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    this.rotation += angleDiff * 10 * deltaTime;

    this.spawnEngineParticles();

    for (let i = this.engineParticles.length - 1; i >= 0; i--) {
      const p = this.engineParticles[i];
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.life -= deltaTime;

      if (p.life <= 0) {
        this.engineParticles.splice(i, 1);
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.x += proj.vx * deltaTime;
      proj.y += proj.vy * deltaTime;
      proj.lifetime -= deltaTime;

      if (proj.lifetime <= 0 || proj.y < -50 || proj.x < -50 || proj.x > canvasWidth + 50) {
        this.projectiles.splice(i, 1);
      }
    }

    for (const weapon of this.weapons) {
      weapon.update(deltaTime);
    }

    if (this.shieldRechargeDelay > 0) {
      this.shieldRechargeDelay -= deltaTime;
    } else if (this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + this.shieldRechargeRate * deltaTime);
    }

    if (this.invulnerabilityTime > 0) {
      this.invulnerabilityTime -= deltaTime;
      if (this.invulnerabilityTime <= 0) {
        this.invulnerable = false;
      }
    }
  }

  private spawnEngineParticles(): void {
    const backX = this.x - Math.cos(this.rotation) * 20;
    const backY = this.y - Math.sin(this.rotation) * 20;

    this.engineParticles.push({
      x: backX + (Math.random() - 0.5) * 10,
      y: backY + (Math.random() - 0.5) * 10,
      vx: -Math.cos(this.rotation) * 50 + (Math.random() - 0.5) * 30,
      vy: -Math.sin(this.rotation) * 50 + (Math.random() - 0.5) * 30,
      life: 0.5,
      maxLife: 0.5,
      size: 3 + Math.random() * 3
    });

    if (this.engineParticles.length > 50) {
      this.engineParticles.shift();
    }
  }

  private spawnBoostParticles(): void {
    const backX = this.x - Math.cos(this.rotation) * 20;
    const backY = this.y - Math.sin(this.rotation) * 20;

    for (let i = 0; i < 3; i++) {
      this.engineParticles.push({
        x: backX + (Math.random() - 0.5) * 15,
        y: backY + (Math.random() - 0.5) * 15,
        vx: -Math.cos(this.rotation) * 150 + (Math.random() - 0.5) * 50,
        vy: -Math.sin(this.rotation) * 150 + (Math.random() - 0.5) * 50,
        life: 0.3,
        maxLife: 0.3,
        size: 5 + Math.random() * 5
      });
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    for (const particle of this.engineParticles) {
      const alpha = particle.life / particle.maxLife;
      const gradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, particle.size);

      if (this.isBoosting) {
        gradient.addColorStop(0, `rgba(0, 200, 255, ${alpha})`);
        gradient.addColorStop(1, `rgba(0, 100, 200, 0)`);
      } else {
        gradient.addColorStop(0, `rgba(255, 150, 0, ${alpha})`);
        gradient.addColorStop(1, `rgba(255, 100, 0, 0)`);
      }

      ctx.fillStyle = gradient;
      ctx.fillRect(particle.x - particle.size, particle.y - particle.size, particle.size * 2, particle.size * 2);
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    ctx.strokeStyle = this.invulnerable ? '#00ffff' : '#00aaff';
    ctx.fillStyle = '#002244';
    ctx.lineWidth = 2;

    if (this.invulnerable) {
      ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.01) * 0.3;
    }

    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-15, -12);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-15, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#00ffff';
    ctx.fillRect(-8, -2, 8, 4);

    ctx.globalAlpha = 1;
    ctx.restore();

    if (this.shield > 0) {
      const shieldAlpha = this.shield / this.maxShield;
      ctx.strokeStyle = `rgba(0, 200, 255, ${shieldAlpha * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const proj of this.projectiles) {
      ctx.fillStyle = '#00ff00';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00ff00';
      ctx.fillRect(proj.x - 3, proj.y - 8, 6, 16);
      ctx.shadowBlur = 0;
    }
  }

  public getProjectiles(): Projectile[] {
    return this.projectiles;
  }

  public get currentWeaponName(): string {
    return this.weapons[this.currentWeaponIndex].name;
  }

  public get currentWeaponAmmo(): number {
    return this.weapons[this.currentWeaponIndex].ammo;
  }
}
