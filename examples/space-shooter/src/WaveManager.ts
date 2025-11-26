/**
 * Enemy Wave System
 * Manages wave spawning with formations, difficulty scaling, and boss waves
 */

import { Enemy, Fighter, Bomber, Turret, Carrier, Boss } from './Enemy';

type FormationType = 'line' | 'v-formation' | 'surround' | 'random' | 'sides';

interface WaveDefinition {
  enemyType: 'fighter' | 'bomber' | 'turret' | 'carrier' | 'boss';
  count: number;
  formation: FormationType;
  delay: number;
}

export class WaveManager {
  public currentWave: number = 0;
  private canvasWidth: number;
  private canvasHeight: number;
  private waveTimer: number = 0;
  private spawnDelay: number = 3.0;
  private currentWaveDefinition: WaveDefinition | null = null;
  private enemiesSpawned: number = 0;
  private spawnTimer: number = 0;
  private betweenWaves: boolean = true;

  private waves: WaveDefinition[] = [
    { enemyType: 'fighter', count: 5, formation: 'line', delay: 0.5 },
    { enemyType: 'fighter', count: 8, formation: 'v-formation', delay: 0.4 },
    { enemyType: 'bomber', count: 4, formation: 'line', delay: 0.8 },
    { enemyType: 'fighter', count: 10, formation: 'surround', delay: 0.3 },
    { enemyType: 'turret', count: 6, formation: 'random', delay: 0.6 },
    { enemyType: 'bomber', count: 6, formation: 'sides', delay: 0.5 },
    { enemyType: 'fighter', count: 12, formation: 'v-formation', delay: 0.3 },
    { enemyType: 'carrier', count: 2, formation: 'line', delay: 2.0 },
    { enemyType: 'turret', count: 8, formation: 'surround', delay: 0.5 },
    { enemyType: 'boss', count: 1, formation: 'random', delay: 0 }
  ];

  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  public update(deltaTime: number, currentEnemyCount: number): Enemy[] {
    const newEnemies: Enemy[] = [];

    this.waveTimer += deltaTime;

    if (this.betweenWaves) {
      if (currentEnemyCount === 0 && this.waveTimer >= this.spawnDelay) {
        this.startNextWave();
      }
      return newEnemies;
    }

    if (!this.currentWaveDefinition) {
      return newEnemies;
    }

    this.spawnTimer -= deltaTime;

    if (this.spawnTimer <= 0 && this.enemiesSpawned < this.currentWaveDefinition.count) {
      const enemy = this.spawnEnemy(
        this.currentWaveDefinition.enemyType,
        this.currentWaveDefinition.formation,
        this.enemiesSpawned,
        this.currentWaveDefinition.count
      );

      if (enemy) {
        newEnemies.push(enemy);
        this.enemiesSpawned++;
        this.spawnTimer = this.currentWaveDefinition.delay;

        if (enemy instanceof Carrier) {
          for (let i = 0; i < 3; i++) {
            const carrierEnemy = enemy as Carrier;
            const fighter = carrierEnemy.spawnFighter();
            if (fighter) {
              newEnemies.push(fighter);
            }
          }
        }
      }

      if (this.enemiesSpawned >= this.currentWaveDefinition.count) {
        this.betweenWaves = true;
        this.waveTimer = 0;
      }
    }

    return newEnemies;
  }

  private startNextWave(): void {
    this.currentWave++;
    this.betweenWaves = false;
    this.enemiesSpawned = 0;
    this.spawnTimer = 0;

    const waveIndex = (this.currentWave - 1) % this.waves.length;
    this.currentWaveDefinition = { ...this.waves[waveIndex] };

    const difficultyScale = 1 + Math.floor((this.currentWave - 1) / this.waves.length) * 0.5;
    this.currentWaveDefinition.count = Math.floor(this.currentWaveDefinition.count * difficultyScale);

    if (this.currentWave % 10 === 0) {
      this.currentWaveDefinition = {
        enemyType: 'boss',
        count: 1,
        formation: 'random',
        delay: 0
      };
    }
  }

  private spawnEnemy(
    type: string,
    formation: FormationType,
    index: number,
    total: number
  ): Enemy | null {
    const position = this.getFormationPosition(formation, index, total);

    switch (type) {
      case 'fighter':
        return new Fighter(position.x, position.y);
      case 'bomber':
        return new Bomber(position.x, position.y);
      case 'turret':
        return new Turret(position.x, position.y);
      case 'carrier':
        return new Carrier(position.x, position.y);
      case 'boss':
        return new Boss(this.canvasWidth / 2, -100);
      default:
        return null;
    }
  }

  private getFormationPosition(
    formation: FormationType,
    index: number,
    total: number
  ): { x: number; y: number } {
    const padding = 100;
    const usableWidth = this.canvasWidth - padding * 2;

    switch (formation) {
      case 'line':
        return {
          x: padding + (index / (total - 1 || 1)) * usableWidth,
          y: -50
        };

      case 'v-formation':
        const centerIndex = (total - 1) / 2;
        const offset = Math.abs(index - centerIndex);
        return {
          x: padding + (index / (total - 1 || 1)) * usableWidth,
          y: -50 - offset * 40
        };

      case 'surround':
        const angle = (index / total) * Math.PI;
        const radius = 300;
        const centerX = this.canvasWidth / 2;
        return {
          x: centerX + Math.cos(angle - Math.PI / 2) * radius,
          y: -100 + Math.sin(angle - Math.PI / 2) * radius
        };

      case 'sides':
        const side = index % 2;
        const groupIndex = Math.floor(index / 2);
        const groupTotal = Math.ceil(total / 2);
        return {
          x: side === 0 ? padding : this.canvasWidth - padding,
          y: -50 - groupIndex * 80
        };

      case 'random':
      default:
        return {
          x: padding + Math.random() * usableWidth,
          y: -50 - Math.random() * 200
        };
    }
  }
}
