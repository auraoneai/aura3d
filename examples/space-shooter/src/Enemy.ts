/**
 * Enemy Types
 * Complete implementations for all enemy types with unique movement patterns and attacks
 */

import { Projectile } from './Ship';

export type EnemyType = 'fighter' | 'bomber' | 'turret' | 'carrier' | 'boss';

export abstract class Enemy {
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  public health: number;
  public maxHealth: number;
  public radius: number;
  public scoreValue: number;
  public shouldRemove: boolean = false;
  public isBoss: boolean = false;

  protected projectiles: Projectile[] = [];
  protected fireCooldown: number = 0;
  protected age: number = 0;

  constructor(x: number, y: number, health: number, radius: number, scoreValue: number) {
    this.x = x;
    this.y = y;
    this.health = health;
    this.maxHealth = health;
    this.radius = radius;
    this.scoreValue = scoreValue;
  }

  public takeDamage(damage: number): void {
    this.health -= damage;
    if (this.health <= 0) {
      this.shouldRemove = true;
    }
  }

  public abstract update(deltaTime: number, playerX: number, playerY: number): void;
  public abstract render(ctx: CanvasRenderingContext2D): void;

  public getProjectiles(): Projectile[] {
    return this.projectiles;
  }

  protected updateProjectiles(deltaTime: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.x += proj.vx * deltaTime;
      proj.y += proj.vy * deltaTime;
      proj.lifetime -= deltaTime;

      if (proj.lifetime <= 0 || proj.y > 2000) {
        this.projectiles.splice(i, 1);
      }
    }
  }
}

/**
 * Fighter - Agile, weak enemy with simple attack pattern
 */
export class Fighter extends Enemy {
  private wobblePhase: number = Math.random() * Math.PI * 2;
  private fireRate: number = 2.0;

  constructor(x: number, y: number) {
    super(x, y, 30, 15, 100);
    this.vy = 100 + Math.random() * 50;
  }

  public update(deltaTime: number, playerX: number, playerY: number): void {
    this.age += deltaTime;
    this.wobblePhase += deltaTime * 3;

    this.vx = Math.sin(this.wobblePhase) * 100;
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;

    this.fireCooldown -= deltaTime;
    if (this.fireCooldown <= 0 && this.y > 50 && this.y < 600) {
      this.fire(playerX, playerY);
      this.fireCooldown = this.fireRate;
    }

    this.updateProjectiles(deltaTime);
  }

  private fire(playerX: number, playerY: number): void {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const angle = Math.atan2(dy, dx);
    const speed = 300;

    this.projectiles.push({
      x: this.x,
      y: this.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage: 10,
      lifetime: 5,
      maxLifetime: 5
    });
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.fillStyle = '#ff4444';
    ctx.strokeStyle = '#aa0000';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(0, -this.radius);
    ctx.lineTo(-this.radius * 0.6, this.radius);
    ctx.lineTo(0, this.radius * 0.6);
    ctx.lineTo(this.radius * 0.6, this.radius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    const healthBarWidth = this.radius * 2;
    const healthPercent = this.health / this.maxHealth;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.radius - 10, healthBarWidth, 3);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.radius - 10, healthBarWidth * healthPercent, 3);

    for (const proj of this.projectiles) {
      ctx.fillStyle = '#ff6666';
      ctx.shadowBlur = 5;
      ctx.shadowColor = '#ff6666';
      ctx.fillRect(proj.x - 2, proj.y - 2, 4, 4);
    }
    ctx.shadowBlur = 0;
  }
}

/**
 * Bomber - Slow enemy that drops bombs
 */
export class Bomber extends Enemy {
  private fireRate: number = 1.5;
  private path: 'left' | 'right' | 'center';

  constructor(x: number, y: number) {
    super(x, y, 80, 25, 250);
    this.vy = 50;
    this.path = x < 400 ? 'right' : x > 1200 ? 'left' : 'center';
  }

  public update(deltaTime: number, playerX: number, playerY: number): void {
    this.age += deltaTime;

    if (this.path === 'left') {
      this.vx = -80;
    } else if (this.path === 'right') {
      this.vx = 80;
    } else {
      this.vx = 0;
    }

    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;

    this.fireCooldown -= deltaTime;
    if (this.fireCooldown <= 0 && this.y > 50 && this.y < 600) {
      this.dropBomb();
      this.fireCooldown = this.fireRate;
    }

    this.updateProjectiles(deltaTime);
  }

  private dropBomb(): void {
    const bombCount = 3;
    for (let i = 0; i < bombCount; i++) {
      this.projectiles.push({
        x: this.x + (i - 1) * 20,
        y: this.y,
        vx: (i - 1) * 50,
        vy: 200,
        damage: 20,
        lifetime: 10,
        maxLifetime: 10
      });
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.fillStyle = '#8844ff';
    ctx.strokeStyle = '#4400aa';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius, this.radius * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#6622cc';
    ctx.fillRect(-this.radius * 0.3, -this.radius, this.radius * 0.6, this.radius * 0.5);
    ctx.fillRect(-this.radius * 0.8, 0, this.radius * 0.3, this.radius * 0.4);
    ctx.fillRect(this.radius * 0.5, 0, this.radius * 0.3, this.radius * 0.4);

    ctx.restore();

    const healthBarWidth = this.radius * 2;
    const healthPercent = this.health / this.maxHealth;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.radius - 10, healthBarWidth, 3);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.radius - 10, healthBarWidth * healthPercent, 3);

    for (const proj of this.projectiles) {
      ctx.fillStyle = '#ff44ff';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ff44ff';
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
}

/**
 * Turret - Stationary enemy with rotating gun
 */
export class Turret extends Enemy {
  private rotation: number = 0;
  private fireRate: number = 1.0;

  constructor(x: number, y: number) {
    super(x, y, 100, 20, 300);
    this.vy = 30;
  }

  public update(deltaTime: number, playerX: number, playerY: number): void {
    this.age += deltaTime;
    this.y += this.vy * deltaTime;

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    this.rotation = Math.atan2(dy, dx);

    this.fireCooldown -= deltaTime;
    if (this.fireCooldown <= 0 && this.y > 50 && this.y < 700) {
      this.fire();
      this.fireCooldown = this.fireRate;
    }

    this.updateProjectiles(deltaTime);
  }

  private fire(): void {
    const speed = 400;
    const burstCount = 3;

    for (let i = 0; i < burstCount; i++) {
      const spreadAngle = this.rotation + (i - 1) * 0.1;
      this.projectiles.push({
        x: this.x,
        y: this.y,
        vx: Math.cos(spreadAngle) * speed,
        vy: Math.sin(spreadAngle) * speed,
        damage: 15,
        lifetime: 5,
        maxLifetime: 5
      });
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.fillStyle = '#44ff44';
    ctx.strokeStyle = '#00aa00';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.rotate(this.rotation);
    ctx.fillStyle = '#00aa00';
    ctx.fillRect(0, -5, this.radius * 1.5, 10);

    ctx.restore();

    const healthBarWidth = this.radius * 2;
    const healthPercent = this.health / this.maxHealth;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.radius - 10, healthBarWidth, 3);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.radius - 10, healthBarWidth * healthPercent, 3);

    for (const proj of this.projectiles) {
      ctx.fillStyle = '#44ff44';
      ctx.shadowBlur = 5;
      ctx.shadowColor = '#44ff44';
      ctx.fillRect(proj.x - 3, proj.y - 3, 6, 6);
    }
    ctx.shadowBlur = 0;
  }
}

/**
 * Carrier - Large enemy that spawns fighters
 */
export class Carrier extends Enemy {
  private spawnCooldown: number = 0;
  private spawnRate: number = 3.0;
  private spawnedFighters: number = 0;
  private maxSpawns: number = 5;

  constructor(x: number, y: number) {
    super(x, y, 200, 40, 500);
    this.vy = 40;
  }

  public update(deltaTime: number, playerX: number, playerY: number): void {
    this.age += deltaTime;
    this.y += this.vy * deltaTime;

    this.spawnCooldown -= deltaTime;

    this.updateProjectiles(deltaTime);
  }

  public canSpawn(): boolean {
    return this.spawnCooldown <= 0 && this.spawnedFighters < this.maxSpawns && this.y > 100;
  }

  public spawnFighter(): Fighter | null {
    if (this.canSpawn()) {
      this.spawnCooldown = this.spawnRate;
      this.spawnedFighters++;
      return new Fighter(this.x + (Math.random() - 0.5) * 60, this.y);
    }
    return null;
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.fillStyle = '#ffaa00';
    ctx.strokeStyle = '#aa6600';
    ctx.lineWidth = 3;

    ctx.fillRect(-this.radius, -this.radius * 0.6, this.radius * 2, this.radius * 1.2);

    ctx.fillStyle = '#ff8800';
    ctx.fillRect(-this.radius * 1.2, -this.radius * 0.3, this.radius * 0.4, this.radius * 0.6);
    ctx.fillRect(this.radius * 0.8, -this.radius * 0.3, this.radius * 0.4, this.radius * 0.6);

    ctx.strokeRect(-this.radius, -this.radius * 0.6, this.radius * 2, this.radius * 1.2);

    ctx.restore();

    const healthBarWidth = this.radius * 2;
    const healthPercent = this.health / this.maxHealth;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.radius - 15, healthBarWidth, 5);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.radius - 15, healthBarWidth * healthPercent, 5);
  }
}

/**
 * Boss - Multi-phase boss with complex attack patterns
 */
export class Boss extends Enemy {
  private phase: number = 1;
  private maxPhases: number = 3;
  private attackCooldown: number = 0;
  private movePattern: number = 0;
  private targetX: number;

  constructor(x: number, y: number) {
    super(x, y, 1000, 60, 5000);
    this.isBoss = true;
    this.targetX = x;
    this.vy = 50;
  }

  public update(deltaTime: number, playerX: number, playerY: number): void {
    this.age += deltaTime;

    if (this.y < 150) {
      this.y += this.vy * deltaTime;
    } else {
      this.vy = 0;
      this.movePattern += deltaTime;

      this.targetX = 800 + Math.sin(this.movePattern * 0.5) * 300;
      const dx = this.targetX - this.x;
      this.vx = dx * 2;
      this.x += this.vx * deltaTime;
    }

    const phaseHealth = this.maxHealth / this.maxPhases;
    const currentPhase = Math.ceil(this.health / phaseHealth);
    if (currentPhase < this.phase) {
      this.phase = currentPhase;
    }

    this.attackCooldown -= deltaTime;
    if (this.attackCooldown <= 0 && this.y >= 150) {
      this.attack(playerX, playerY);
      this.attackCooldown = 2.0 / this.phase;
    }

    this.updateProjectiles(deltaTime);
  }

  private attack(playerX: number, playerY: number): void {
    const speed = 350;

    if (this.phase === 3) {
      const spiral = 24;
      const spiralOffset = this.age * 2;
      for (let i = 0; i < spiral; i++) {
        const angle = (i / spiral) * Math.PI * 2 + spiralOffset;
        this.projectiles.push({
          x: this.x,
          y: this.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          damage: 25,
          lifetime: 8,
          maxLifetime: 8
        });
      }
    } else if (this.phase === 2) {
      const rays = 16;
      for (let i = 0; i < rays; i++) {
        const angle = (i / rays) * Math.PI * 2;
        this.projectiles.push({
          x: this.x,
          y: this.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          damage: 20,
          lifetime: 6,
          maxLifetime: 6
        });
      }
    } else {
      const shots = 5;
      for (let i = 0; i < shots; i++) {
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const angle = Math.atan2(dy, dx) + (i - 2) * 0.2;
        this.projectiles.push({
          x: this.x,
          y: this.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          damage: 15,
          lifetime: 7,
          maxLifetime: 7
        });
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);

    const colors = ['#ff0000', '#ff6600', '#ffcc00'];
    ctx.fillStyle = colors[this.phase - 1];
    ctx.strokeStyle = '#aa0000';
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(0, -this.radius);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? this.radius : this.radius * 0.7;
      ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -10, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-15, 5, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(15, 5, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    const healthBarWidth = this.radius * 3;
    const healthPercent = this.health / this.maxHealth;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.radius - 20, healthBarWidth, 8);
    ctx.fillStyle = colors[this.phase - 1];
    ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.radius - 20, healthBarWidth * healthPercent, 8);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x - healthBarWidth / 2, this.y - this.radius - 20, healthBarWidth, 8);

    for (const proj of this.projectiles) {
      ctx.fillStyle = colors[this.phase - 1];
      ctx.shadowBlur = 10;
      ctx.shadowColor = colors[this.phase - 1];
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
}
