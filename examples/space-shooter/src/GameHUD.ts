/**
 * Space Shooter HUD
 * Complete UI overlay with health/shield bars, score, wave indicator, and boss health
 */

interface HUDData {
  score: number;
  wave: number;
  lives: number;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  weaponName: string;
  weaponAmmo: number;
  bossHealth: number;
  bossMaxHealth: number;
}

export class GameHUD {
  private canvasWidth: number;
  private canvasHeight: number;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  public render(ctx: CanvasRenderingContext2D, data: HUDData): void {
    this.renderTopBar(ctx, data);
    this.renderBottomBar(ctx, data);

    if (data.bossHealth > 0) {
      this.renderBossHealthBar(ctx, data);
    }
  }

  private renderTopBar(ctx: CanvasRenderingContext2D, data: HUDData): void {
    const padding = 20;

    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#000000';

    ctx.fillText(`Score: ${data.score}`, padding, padding + 24);

    ctx.fillText(`Wave: ${data.wave}`, padding, padding + 54);

    ctx.textAlign = 'right';
    ctx.fillText(`Lives: ${data.lives}`, this.canvasWidth - padding, padding + 24);

    ctx.shadowBlur = 0;
  }

  private renderBottomBar(ctx: CanvasRenderingContext2D, data: HUDData): void {
    const padding = 20;
    const barWidth = 250;
    const barHeight = 20;
    const barY = this.canvasHeight - padding - barHeight;

    ctx.shadowBlur = 3;
    ctx.shadowColor = '#000000';

    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText('HEALTH', padding, barY - 5);

    ctx.fillStyle = '#333333';
    ctx.fillRect(padding, barY, barWidth, barHeight);

    const healthPercent = data.health / data.maxHealth;
    const healthGradient = ctx.createLinearGradient(padding, 0, padding + barWidth, 0);
    healthGradient.addColorStop(0, '#ff0000');
    healthGradient.addColorStop(0.5, '#ff6600');
    healthGradient.addColorStop(1, '#ffaa00');
    ctx.fillStyle = healthGradient;
    ctx.fillRect(padding, barY, barWidth * healthPercent, barHeight);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(padding, barY, barWidth, barHeight);

    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${Math.floor(data.health)} / ${data.maxHealth}`,
      padding + barWidth / 2,
      barY + 14
    );

    const shieldBarY = barY - barHeight - 10;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('SHIELD', padding, shieldBarY - 5);

    ctx.fillStyle = '#333333';
    ctx.fillRect(padding, shieldBarY, barWidth, barHeight);

    const shieldPercent = data.shield / data.maxShield;
    const shieldGradient = ctx.createLinearGradient(padding, 0, padding + barWidth, 0);
    shieldGradient.addColorStop(0, '#0066ff');
    shieldGradient.addColorStop(1, '#00ccff');
    ctx.fillStyle = shieldGradient;
    ctx.fillRect(padding, shieldBarY, barWidth * shieldPercent, barHeight);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(padding, shieldBarY, barWidth, barHeight);

    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${Math.floor(data.shield)} / ${data.maxShield}`,
      padding + barWidth / 2,
      shieldBarY + 14
    );

    const weaponX = this.canvasWidth - padding - barWidth;
    const weaponY = this.canvasHeight - padding - 30;

    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffff00';
    ctx.fillText(data.weaponName.toUpperCase(), this.canvasWidth - padding, weaponY);

    if (data.weaponAmmo >= 0) {
      ctx.font = 'bold 14px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`Ammo: ${data.weaponAmmo}`, this.canvasWidth - padding, weaponY + 20);
    }

    ctx.shadowBlur = 0;
  }

  private renderBossHealthBar(ctx: CanvasRenderingContext2D, data: HUDData): void {
    const barWidth = 600;
    const barHeight = 30;
    const barX = (this.canvasWidth - barWidth) / 2;
    const barY = 80;

    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#ff0000';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#000000';
    ctx.fillText('BOSS', this.canvasWidth / 2, barY - 10);

    ctx.fillStyle = '#220000';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const bossHealthPercent = data.bossHealth / data.bossMaxHealth;

    const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
    gradient.addColorStop(0, '#ff0000');
    gradient.addColorStop(0.5, '#ff3300');
    gradient.addColorStop(1, '#ff6600');

    ctx.fillStyle = gradient;
    ctx.fillRect(barX, barY, barWidth * bossHealthPercent, barHeight);

    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 3;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    for (let i = 1; i < 4; i++) {
      const segmentX = barX + (barWidth / 4) * i;
      ctx.beginPath();
      ctx.moveTo(segmentX, barY);
      ctx.lineTo(segmentX, barY + barHeight);
      ctx.stroke();
    }

    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${Math.floor(data.bossHealth)} / ${data.bossMaxHealth}`,
      this.canvasWidth / 2,
      barY + 20
    );

    ctx.shadowBlur = 0;
  }
}
