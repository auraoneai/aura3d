/**
 * G3D Space Shooter Example
 * Demonstrates: Particles, Object Pooling, Scoring, Audio, Enemy AI
 *
 * A complete space shooter with:
 * - Player ship with multiple weapon types
 * - Enemy waves with various AI patterns
 * - Boss battles with multiple phases
 * - Power-up system
 * - Particle effects for explosions and engines
 * - Spatial audio
 * - Advanced scoring system
 */

import { Ship } from './Ship';
import { WaveManager } from './WaveManager';
import { PowerUp } from './PowerUp';
import { SpaceEnvironment } from './SpaceEnvironment';
import { GameHUD } from './GameHUD';
import { Enemy } from './Enemy';

interface GameState {
  score: number;
  wave: number;
  lives: number;
  gameOver: boolean;
  paused: boolean;
  started: boolean;
}

class SpaceShooter {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ship: Ship | null = null;
  private waveManager: WaveManager | null = null;
  private environment: SpaceEnvironment | null = null;
  private hud: GameHUD | null = null;

  private enemies: Enemy[] = [];
  private powerUps: PowerUp[] = [];
  private explosionParticles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    color: string;
  }> = [];

  private state: GameState = {
    score: 0,
    wave: 0,
    lives: 3,
    gameOver: false,
    paused: false,
    started: false
  };

  private lastTime: number = 0;
  private animationId: number = 0;

  private keys: Set<string> = new Set();
  private mouseX: number = 0;
  private mouseY: number = 0;
  private mouseDown: boolean = false;
  private mouseRightDown: boolean = false;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.setupInput();
  }

  private resizeCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private setupInput(): void {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toUpperCase());

      if (e.key === ' ') {
        e.preventDefault();
        if (this.ship) this.ship.boost(true);
      }

      if (e.key.toLowerCase() === 'tab') {
        e.preventDefault();
        this.togglePause();
      }

      const weaponKeys = ['1', '2', '3', '4', '5'];
      if (weaponKeys.includes(e.key) && this.ship) {
        this.ship.selectWeapon(parseInt(e.key) - 1);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toUpperCase());

      if (e.key === ' ' && this.ship) {
        this.ship.boost(false);
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        if (!this.state.started) {
          this.startGame();
        }
      } else if (e.button === 2) {
        this.mouseRightDown = true;
        e.preventDefault();
      }
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      else if (e.button === 2) this.mouseRightDown = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  async init(): Promise<void> {
    this.hideLoading();

    this.environment = new SpaceEnvironment(this.canvas.width, this.canvas.height);
    this.hud = new GameHUD(this.canvas.width, this.canvas.height);

    this.showStartScreen();
  }

  private showStartScreen(): void {
    const draw = () => {
      if (this.state.started) return;

      this.environment!.update(0.016);
      this.environment!.render(this.ctx);

      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      this.ctx.font = 'bold 72px Arial';
      this.ctx.fillStyle = '#00ffff';
      this.ctx.textAlign = 'center';
      this.ctx.shadowBlur = 20;
      this.ctx.shadowColor = '#00ffff';
      this.ctx.fillText('SPACE SHOOTER', this.canvas.width / 2, this.canvas.height / 2 - 100);

      this.ctx.font = '24px Arial';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.shadowBlur = 10;
      this.ctx.fillText('Click to Start', this.canvas.width / 2, this.canvas.height / 2);

      this.ctx.font = '18px Arial';
      this.ctx.fillStyle = '#aaaaaa';
      this.ctx.shadowBlur = 0;
      const controls = [
        'WASD/Arrows: Move',
        'Mouse: Aim',
        'Left Click: Fire Primary',
        'Right Click: Fire Secondary',
        'Space: Boost',
        '1-5: Select Weapon',
        'Tab: Pause'
      ];
      controls.forEach((text, i) => {
        this.ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2 + 80 + i * 25);
      });

      requestAnimationFrame(draw);
    };
    draw();
  }

  private startGame(): void {
    this.state.started = true;
    this.state.score = 0;
    this.state.wave = 0;
    this.state.lives = 3;
    this.state.gameOver = false;

    this.ship = new Ship(this.canvas.width / 2, this.canvas.height - 100);
    this.waveManager = new WaveManager(this.canvas.width, this.canvas.height);
    this.enemies = [];
    this.powerUps = [];

    this.lastTime = performance.now();
    this.gameLoop();
  }

  private togglePause(): void {
    if (!this.state.started || this.state.gameOver) return;
    this.state.paused = !this.state.paused;
  }

  private gameLoop = (): void => {
    const currentTime = performance.now();
    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    if (!this.state.paused && !this.state.gameOver) {
      this.update(deltaTime);
    }

    this.render();

    this.animationId = requestAnimationFrame(this.gameLoop);
  }

  private update(deltaTime: number): void {
    this.environment!.update(deltaTime);

    if (this.ship) {
      const moveX = (this.keys.has('D') || this.keys.has('ARROWRIGHT') ? 1 : 0) -
                    (this.keys.has('A') || this.keys.has('ARROWLEFT') ? 1 : 0);
      const moveY = (this.keys.has('S') || this.keys.has('ARROWDOWN') ? 1 : 0) -
                    (this.keys.has('W') || this.keys.has('ARROWUP') ? 1 : 0);

      this.ship.move(moveX, moveY);
      this.ship.aimAt(this.mouseX, this.mouseY);

      if (this.mouseDown) this.ship.firePrimary();
      if (this.mouseRightDown) this.ship.fireSecondary();

      this.ship.update(deltaTime, this.canvas.width, this.canvas.height);
    }

    this.updateEnemies(deltaTime);
    this.updatePowerUps(deltaTime);
    this.updateParticles(deltaTime);
    this.checkCollisions();
    this.spawnWave(deltaTime);
  }

  private updateEnemies(deltaTime: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      if (this.ship) {
        enemy.update(deltaTime, this.ship.x, this.ship.y);
      } else {
        enemy.update(deltaTime, 0, 0);
      }

      if (enemy.shouldRemove || enemy.y > this.canvas.height + 100) {
        this.enemies.splice(i, 1);
      }
    }
  }

  private updatePowerUps(deltaTime: number): void {
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const powerUp = this.powerUps[i];
      powerUp.update(deltaTime);

      if (powerUp.shouldRemove || powerUp.y > this.canvas.height + 50) {
        this.powerUps.splice(i, 1);
      }
    }
  }

  private updateParticles(deltaTime: number): void {
    for (let i = this.explosionParticles.length - 1; i >= 0; i--) {
      const p = this.explosionParticles[i];
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.life -= deltaTime;

      if (p.life <= 0) {
        this.explosionParticles.splice(i, 1);
      }
    }
  }

  private checkCollisions(): void {
    if (!this.ship || this.ship.invulnerable) return;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      const shipProjectiles = this.ship.getProjectiles();
      for (let j = shipProjectiles.length - 1; j >= 0; j--) {
        const proj = shipProjectiles[j];
        const dx = proj.x - enemy.x;
        const dy = proj.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < enemy.radius + 5) {
          enemy.takeDamage(proj.damage);
          shipProjectiles.splice(j, 1);

          if (enemy.health <= 0) {
            this.createExplosion(enemy.x, enemy.y, enemy.radius);
            this.state.score += enemy.scoreValue;

            if (Math.random() < 0.15) {
              this.powerUps.push(new PowerUp(enemy.x, enemy.y));
            }

            this.enemies.splice(i, 1);
          }
          break;
        }
      }

      if (enemy.health > 0) {
        const dx = this.ship.x - enemy.x;
        const dy = this.ship.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.ship.radius + enemy.radius) {
          this.ship.takeDamage(25);
          enemy.takeDamage(999);
          this.createExplosion(enemy.x, enemy.y, enemy.radius);
          this.enemies.splice(i, 1);

          if (this.ship.health <= 0) {
            this.shipDestroyed();
          }
        }
      }

      const enemyProjectiles = enemy.getProjectiles();
      for (let j = enemyProjectiles.length - 1; j >= 0; j--) {
        const proj = enemyProjectiles[j];
        const dx = proj.x - this.ship.x;
        const dy = proj.y - this.ship.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.ship.radius + 5) {
          this.ship.takeDamage(proj.damage);
          enemyProjectiles.splice(j, 1);

          if (this.ship.health <= 0) {
            this.shipDestroyed();
          }
        }
      }
    }

    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const powerUp = this.powerUps[i];
      const dx = this.ship.x - powerUp.x;
      const dy = this.ship.y - powerUp.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < this.ship.radius + powerUp.radius) {
        powerUp.apply(this.ship);
        this.powerUps.splice(i, 1);
      }
    }
  }

  private spawnWave(deltaTime: number): void {
    if (!this.waveManager) return;

    const newEnemies = this.waveManager.update(deltaTime, this.enemies.length);
    this.enemies.push(...newEnemies);

    if (this.waveManager.currentWave > this.state.wave) {
      this.state.wave = this.waveManager.currentWave;
    }
  }

  private createExplosion(x: number, y: number, size: number): void {
    const particleCount = Math.floor(size * 2);
    const colors = ['#ff6600', '#ff9900', '#ffcc00', '#ff3300'];

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 200;
      this.explosionParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1,
        size: 2 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  private shipDestroyed(): void {
    if (!this.ship) return;

    this.createExplosion(this.ship.x, this.ship.y, 40);
    this.state.lives--;

    if (this.state.lives <= 0) {
      this.gameOver();
    } else {
      setTimeout(() => {
        if (this.ship) {
          this.ship.reset(this.canvas.width / 2, this.canvas.height - 100);
        }
      }, 2000);
    }
  }

  private gameOver(): void {
    this.state.gameOver = true;
    this.ship = null;
  }

  private render(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.environment!.render(this.ctx);

    for (const powerUp of this.powerUps) {
      powerUp.render(this.ctx);
    }

    for (const enemy of this.enemies) {
      enemy.render(this.ctx);
    }

    if (this.ship) {
      this.ship.render(this.ctx);
    }

    for (const particle of this.explosionParticles) {
      const alpha = particle.life / particle.maxLife;
      this.ctx.fillStyle = particle.color;
      this.ctx.globalAlpha = alpha;
      this.ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    }
    this.ctx.globalAlpha = 1;

    this.hud!.render(this.ctx, {
      score: this.state.score,
      wave: this.state.wave,
      lives: this.state.lives,
      health: this.ship ? this.ship.health : 0,
      maxHealth: this.ship ? this.ship.maxHealth : 100,
      shield: this.ship ? this.ship.shield : 0,
      maxShield: this.ship ? this.ship.maxShield : 100,
      weaponName: this.ship ? this.ship.currentWeaponName : '',
      weaponAmmo: this.ship ? this.ship.currentWeaponAmmo : 0,
      bossHealth: this.getBossHealth(),
      bossMaxHealth: this.getBossMaxHealth()
    });

    if (this.state.paused) {
      this.renderPauseScreen();
    }

    if (this.state.gameOver) {
      this.renderGameOverScreen();
    }
  }

  private getBossHealth(): number {
    const boss = this.enemies.find(e => e.isBoss);
    return boss ? boss.health : 0;
  }

  private getBossMaxHealth(): number {
    const boss = this.enemies.find(e => e.isBoss);
    return boss ? boss.maxHealth : 0;
  }

  private renderPauseScreen(): void {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.font = 'bold 64px Arial';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2);

    this.ctx.font = '24px Arial';
    this.ctx.fillText('Press TAB to resume', this.canvas.width / 2, this.canvas.height / 2 + 60);
  }

  private renderGameOverScreen(): void {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.font = 'bold 72px Arial';
    this.ctx.fillStyle = '#ff3333';
    this.ctx.textAlign = 'center';
    this.ctx.shadowBlur = 20;
    this.ctx.shadowColor = '#ff3333';
    this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 50);

    this.ctx.font = '32px Arial';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.shadowBlur = 0;
    this.ctx.fillText(`Final Score: ${this.state.score}`, this.canvas.width / 2, this.canvas.height / 2 + 30);
    this.ctx.fillText(`Wave Reached: ${this.state.wave}`, this.canvas.width / 2, this.canvas.height / 2 + 70);

    this.ctx.font = '24px Arial';
    this.ctx.fillStyle = '#aaaaaa';
    this.ctx.fillText('Refresh to play again', this.canvas.width / 2, this.canvas.height / 2 + 130);
  }

  private hideLoading(): void {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.classList.add('hidden');
  }
}

const game = new SpaceShooter();
game.init();
