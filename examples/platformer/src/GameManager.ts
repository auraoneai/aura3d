/**
 * GameManager - Manage game state, score, lives, and progression
 *
 * Features:
 * - Score tracking and calculation
 * - Lives system
 * - Checkpoint management
 * - Game state (playing, paused, game over)
 * - Level progression
 * - High score persistence
 * - Statistics tracking
 */

import { Vector3 } from 'g3d';

/**
 * Game state enumeration
 */
export enum GameState {
  MainMenu = 'mainmenu',
  Playing = 'playing',
  Paused = 'paused',
  LevelComplete = 'levelcomplete',
  GameOver = 'gameover'
}

/**
 * Game statistics
 */
export interface GameStats {
  totalScore: number;
  coinsCollected: number;
  totalCoins: number;
  deaths: number;
  jumps: number;
  doubleJumps: number;
  wallJumps: number;
  timeElapsed: number;
  checkpointsReached: number;
}

/**
 * Save data structure
 */
export interface SaveData {
  highScore: number;
  levelsCompleted: number;
  totalCoinsCollected: number;
  totalPlayTime: number;
}

/**
 * Game manager class for state and progression
 */
export class GameManager {
  public state: GameState = GameState.MainMenu;
  public score: number = 0;
  public lives: number = 3;
  public maxLives: number = 5;
  public currentLevel: number = 1;

  public coinsCollected: number = 0;
  public totalCoins: number = 0;

  public lastCheckpoint: Vector3 = new Vector3(0, 2, 0);

  private stats: GameStats = {
    totalScore: 0,
    coinsCollected: 0,
    totalCoins: 0,
    deaths: 0,
    jumps: 0,
    doubleJumps: 0,
    wallJumps: 0,
    timeElapsed: 0,
    checkpointsReached: 0
  };

  private saveData: SaveData = {
    highScore: 0,
    levelsCompleted: 0,
    totalCoinsCollected: 0,
    totalPlayTime: 0
  };

  private readonly COIN_VALUE = 100;
  private readonly GEM_VALUE = 500;
  private readonly POWERUP_VALUE = 1000;
  private readonly CHECKPOINT_BONUS = 250;
  private readonly LIFE_BONUS = 5000;

  constructor() {
    this.loadSaveData();
  }

  /**
   * Start a new game
   */
  startGame(): void {
    this.state = GameState.Playing;
    this.score = 0;
    this.lives = 3;
    this.currentLevel = 1;
    this.coinsCollected = 0;
    this.lastCheckpoint = new Vector3(0, 2, 0);

    this.resetStats();
  }

  /**
   * Reset game to initial state
   */
  resetGame(): void {
    this.score = 0;
    this.lives = 3;
    this.coinsCollected = 0;
    this.lastCheckpoint = new Vector3(0, 2, 0);
    this.state = GameState.Playing;

    this.resetStats();
  }

  /**
   * Add score to total
   */
  addScore(points: number): void {
    this.score += points;
    this.stats.totalScore = this.score;

    if (this.score > this.saveData.highScore) {
      this.saveData.highScore = this.score;
      this.saveSaveData();
    }
  }

  /**
   * Collect a coin
   */
  collectCoin(): void {
    this.coinsCollected++;
    this.stats.coinsCollected++;
    this.addScore(this.COIN_VALUE);

    if (this.coinsCollected % 10 === 0) {
      this.addExtraLife();
    }
  }

  /**
   * Collect a gem (worth more than coin)
   */
  collectGem(): void {
    this.coinsCollected++;
    this.stats.coinsCollected++;
    this.addScore(this.GEM_VALUE);
  }

  /**
   * Collect a power-up
   */
  collectPowerUp(): void {
    this.addScore(this.POWERUP_VALUE);
  }

  /**
   * Set checkpoint position
   */
  setCheckpoint(position: Vector3): void {
    const isNewCheckpoint = !this.lastCheckpoint.equals(position);

    if (isNewCheckpoint) {
      this.lastCheckpoint = position.clone();
      this.stats.checkpointsReached++;
      this.addScore(this.CHECKPOINT_BONUS);
    }
  }

  /**
   * Lose a life
   */
  loseLife(): void {
    this.lives--;
    this.stats.deaths++;

    if (this.lives <= 0) {
      this.gameOver();
    }
  }

  /**
   * Add an extra life
   */
  addExtraLife(): void {
    if (this.lives < this.maxLives) {
      this.lives++;
      this.addScore(this.LIFE_BONUS);
    }
  }

  /**
   * Set total coins in level
   */
  setTotalCoins(count: number): void {
    this.totalCoins = count;
    this.stats.totalCoins = count;
  }

  /**
   * Complete current level
   */
  completeLevel(): void {
    this.state = GameState.LevelComplete;

    const completionBonus = 10000;
    this.addScore(completionBonus);

    if (this.coinsCollected === this.totalCoins) {
      const perfectBonus = 5000;
      this.addScore(perfectBonus);
    }

    const livesBonus = this.lives * 1000;
    this.addScore(livesBonus);

    this.saveData.levelsCompleted = Math.max(
      this.saveData.levelsCompleted,
      this.currentLevel
    );
    this.saveSaveData();
  }

  /**
   * Handle game over
   */
  gameOver(): void {
    this.state = GameState.GameOver;

    this.saveData.totalCoinsCollected += this.coinsCollected;
    this.saveData.totalPlayTime += this.stats.timeElapsed;
    this.saveSaveData();
  }

  /**
   * Pause the game
   */
  pause(): void {
    if (this.state === GameState.Playing) {
      this.state = GameState.Paused;
    }
  }

  /**
   * Resume the game
   */
  resume(): void {
    if (this.state === GameState.Paused) {
      this.state = GameState.Playing;
    }
  }

  /**
   * Track jump statistics
   */
  recordJump(): void {
    this.stats.jumps++;
  }

  /**
   * Track double jump statistics
   */
  recordDoubleJump(): void {
    this.stats.doubleJumps++;
  }

  /**
   * Track wall jump statistics
   */
  recordWallJump(): void {
    this.stats.wallJumps++;
  }

  /**
   * Update time elapsed
   */
  updateTime(deltaTime: number): void {
    if (this.state === GameState.Playing) {
      this.stats.timeElapsed += deltaTime;
    }
  }

  /**
   * Get current statistics
   */
  getStats(): GameStats {
    return { ...this.stats };
  }

  /**
   * Get save data
   */
  getSaveData(): SaveData {
    return { ...this.saveData };
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = {
      totalScore: 0,
      coinsCollected: 0,
      totalCoins: 0,
      deaths: 0,
      jumps: 0,
      doubleJumps: 0,
      wallJumps: 0,
      timeElapsed: 0,
      checkpointsReached: 0
    };
  }

  /**
   * Load save data from localStorage
   */
  private loadSaveData(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const savedData = localStorage.getItem('g3d-platformer-save');
      if (savedData) {
        this.saveData = JSON.parse(savedData);
      }
    } catch (error) {
      console.error('Failed to load save data:', error);
    }
  }

  /**
   * Save data to localStorage
   */
  private saveSaveData(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem('g3d-platformer-save', JSON.stringify(this.saveData));
    } catch (error) {
      console.error('Failed to save data:', error);
    }
  }

  /**
   * Clear save data
   */
  clearSaveData(): void {
    this.saveData = {
      highScore: 0,
      levelsCompleted: 0,
      totalCoinsCollected: 0,
      totalPlayTime: 0
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('g3d-platformer-save');
    }
  }

  /**
   * Get completion percentage
   */
  getCompletionPercentage(): number {
    if (this.totalCoins === 0) {
      return 0;
    }
    return (this.coinsCollected / this.totalCoins) * 100;
  }

  /**
   * Get grade based on performance
   */
  getGrade(): string {
    const percentage = this.getCompletionPercentage();

    if (percentage === 100 && this.stats.deaths === 0) {
      return 'S';
    } else if (percentage >= 90) {
      return 'A';
    } else if (percentage >= 75) {
      return 'B';
    } else if (percentage >= 60) {
      return 'C';
    } else if (percentage >= 40) {
      return 'D';
    } else {
      return 'F';
    }
  }

  /**
   * Format time as MM:SS
   */
  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
