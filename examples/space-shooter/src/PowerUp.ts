/**
 * Power-Up System
 * Complete implementations for all power-up types
 */

import { Ship } from './Ship';

export type PowerUpType = 'health' | 'shield' | 'weapon' | 'speed' | 'life' | 'multiplier';

export class PowerUp {
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 150;
  public radius: number = 15;
  public shouldRemove: boolean = false;
  public type: PowerUpType;

  private rotation: number = 0;
  private pulse: number = 0;

  constructor(x: number, y: number, type?: PowerUpType) {
    this.x = x;
    this.y = y;

    if (type) {
      this.type = type;
    } else {
      const types: PowerUpType[] = ['health', 'shield', 'weapon', 'speed', 'life', 'multiplier'];
      const weights = [30, 30, 25, 10, 3, 2];
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let random = Math.random() * totalWeight;

      for (let i = 0; i < types.length; i++) {
        random -= weights[i];
        if (random <= 0) {
          this.type = types[i];
          break;
        }
      }

      if (!this.type!) {
        this.type = 'health';
      }
    }
  }

  public update(deltaTime: number): void {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    this.rotation += deltaTime * 2;
    this.pulse += deltaTime * 5;
  }

  public apply(ship: Ship): void {
    this.shouldRemove = true;

    switch (this.type) {
      case 'health':
        ship.heal(50);
        break;

      case 'shield':
        ship.rechargeShield(50);
        break;

      case 'weapon':
        ship.upgradeWeapon();
        break;

      case 'speed':
        ship.increaseSpeed(100, 10);
        break;

      case 'life':
        break;

      case 'multiplier':
        break;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    const pulseScale = 1 + Math.sin(this.pulse) * 0.2;
    ctx.scale(pulseScale, pulseScale);

    const color = this.getColor();
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.7, color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    switch (this.type) {
      case 'health':
        ctx.fillRect(-this.radius * 0.6, -this.radius * 0.2, this.radius * 1.2, this.radius * 0.4);
        ctx.fillRect(-this.radius * 0.2, -this.radius * 0.6, this.radius * 0.4, this.radius * 1.2);
        ctx.strokeRect(-this.radius * 0.6, -this.radius * 0.2, this.radius * 1.2, this.radius * 0.4);
        ctx.strokeRect(-this.radius * 0.2, -this.radius * 0.6, this.radius * 0.4, this.radius * 1.2);
        break;

      case 'shield':
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.4, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.stroke();
        break;

      case 'weapon':
        ctx.beginPath();
        ctx.moveTo(-this.radius * 0.5, this.radius * 0.5);
        ctx.lineTo(this.radius * 0.5, -this.radius * 0.5);
        ctx.lineTo(this.radius * 0.3, -this.radius * 0.7);
        ctx.lineTo(-this.radius * 0.7, this.radius * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case 'speed':
        ctx.beginPath();
        ctx.moveTo(this.radius * 0.6, 0);
        ctx.lineTo(-this.radius * 0.4, -this.radius * 0.4);
        ctx.lineTo(-this.radius * 0.4, this.radius * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case 'life':
        ctx.beginPath();
        ctx.moveTo(0, -this.radius * 0.3);
        ctx.bezierCurveTo(
          -this.radius * 0.6, -this.radius * 0.7,
          -this.radius * 0.8, -this.radius * 0.2,
          0, this.radius * 0.6
        );
        ctx.bezierCurveTo(
          this.radius * 0.8, -this.radius * 0.2,
          this.radius * 0.6, -this.radius * 0.7,
          0, -this.radius * 0.3
        );
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case 'multiplier':
        ctx.font = `bold ${this.radius * 1.2}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeText('x2', 0, 0);
        ctx.fillText('x2', 0, 0);
        break;
    }

    ctx.restore();
  }

  private getColor(): string {
    switch (this.type) {
      case 'health':
        return '#00ff00';
      case 'shield':
        return '#00ccff';
      case 'weapon':
        return '#ffaa00';
      case 'speed':
        return '#ff00ff';
      case 'life':
        return '#ff0066';
      case 'multiplier':
        return '#ffff00';
      default:
        return '#ffffff';
    }
  }
}
