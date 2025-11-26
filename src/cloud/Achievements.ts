/**
 * G3D Achievements
 * Achievement system with progress tracking
 * @module Cloud
 */

import { CloudManager, CloudError } from './CloudManager';

/**
 * Achievement definition
 */
export interface Achievement {
  /** Achievement ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Icon URL */
  icon?: string;
  /** Points awarded */
  points: number;
  /** Is hidden (secret) */
  hidden: boolean;
  /** Requirements */
  requirements?: {
    /** Type of requirement */
    type: 'count' | 'boolean' | 'custom';
    /** Target value */
    target?: number;
    /** Current progress */
    current?: number;
  };
  /** Creation date */
  createdAt: number;
}

/**
 * Player achievement
 */
export interface PlayerAchievement extends Achievement {
  /** Is unlocked */
  unlocked: boolean;
  /** Progress (0-1) */
  progress: number;
  /** Unlock timestamp */
  unlockedAt?: number;
}

/**
 * Achievement event callback
 */
export type AchievementEventCallback = (achievement: PlayerAchievement) => void;

/**
 * Achievements Service
 * Manages achievements and progress tracking
 */
export class Achievements {
  private cloudManager: CloudManager;
  private achievements: Map<string, PlayerAchievement> = new Map();
  private unlockListeners: Set<AchievementEventCallback> = new Set();
  private progressListeners: Set<AchievementEventCallback> = new Set();
  private loaded: boolean = false;

  constructor(cloudManager: CloudManager) {
    this.cloudManager = cloudManager;
  }

  /**
   * Load achievements
   */
  public async loadAchievements(): Promise<void> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot load achievements while offline', 'OFFLINE');
    }

    try {
      const response = await this.cloudManager.requestWithRetry<{
        achievements: PlayerAchievement[];
      }>('/achievements', { method: 'GET' });

      this.achievements.clear();
      for (const achievement of response.achievements) {
        this.achievements.set(achievement.id, achievement);
      }

      this.loaded = true;
      console.log(`[Achievements] Loaded ${this.achievements.size} achievements`);
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to load achievements',
        'ACHIEVEMENTS_LOAD_FAILED'
      );
    }
  }

  /**
   * Get all achievements
   */
  public getAchievements(includeHidden: boolean = false): PlayerAchievement[] {
    const achievements = Array.from(this.achievements.values());

    if (!includeHidden) {
      return achievements.filter(a => !a.hidden || a.unlocked);
    }

    return achievements;
  }

  /**
   * Get achievement by ID
   */
  public getAchievement(achievementId: string): PlayerAchievement | undefined {
    return this.achievements.get(achievementId);
  }

  /**
   * Unlock achievement
   */
  public async unlock(achievementId: string): Promise<PlayerAchievement> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot unlock achievement while offline', 'OFFLINE');
    }

    if (!this.cloudManager.auth.isAuthenticated()) {
      throw new CloudError('Not authenticated', 'NOT_AUTHENTICATED');
    }

    const achievement = this.achievements.get(achievementId);
    if (!achievement) {
      throw new CloudError(`Achievement not found: ${achievementId}`, 'NOT_FOUND');
    }

    if (achievement.unlocked) {
      return achievement;
    }

    try {
      const response = await this.cloudManager.requestWithRetry<PlayerAchievement>(
        `/achievements/${achievementId}/unlock`,
        { method: 'POST' }
      );

      // Update local state
      response.unlocked = true;
      response.progress = 1;
      response.unlockedAt = Date.now();
      this.achievements.set(achievementId, response);

      // Notify listeners
      this.notifyUnlock(response);

      console.log('[Achievements] Unlocked:', achievementId);
      return response;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to unlock achievement',
        'ACHIEVEMENT_UNLOCK_FAILED'
      );
    }
  }

  /**
   * Update achievement progress
   */
  public async updateProgress(
    achievementId: string,
    progress: number
  ): Promise<PlayerAchievement> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot update progress while offline', 'OFFLINE');
    }

    if (!this.cloudManager.auth.isAuthenticated()) {
      throw new CloudError('Not authenticated', 'NOT_AUTHENTICATED');
    }

    const achievement = this.achievements.get(achievementId);
    if (!achievement) {
      throw new CloudError(`Achievement not found: ${achievementId}`, 'NOT_FOUND');
    }

    if (achievement.unlocked) {
      return achievement;
    }

    // Clamp progress to 0-1
    const clampedProgress = Math.max(0, Math.min(1, progress));

    try {
      const response = await this.cloudManager.requestWithRetry<PlayerAchievement>(
        `/achievements/${achievementId}/progress`,
        {
          method: 'PATCH',
          body: JSON.stringify({ progress: clampedProgress })
        }
      );

      // Update local state
      response.progress = clampedProgress;
      this.achievements.set(achievementId, response);

      // Check if achievement should be unlocked
      if (clampedProgress >= 1 && !response.unlocked) {
        return await this.unlock(achievementId);
      }

      // Notify progress listeners
      this.notifyProgress(response);

      return response;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to update progress',
        'ACHIEVEMENT_PROGRESS_FAILED'
      );
    }
  }

  /**
   * Increment achievement progress
   */
  public async incrementProgress(
    achievementId: string,
    amount: number = 1
  ): Promise<PlayerAchievement> {
    const achievement = this.achievements.get(achievementId);
    if (!achievement) {
      throw new CloudError(`Achievement not found: ${achievementId}`, 'NOT_FOUND');
    }

    if (!achievement.requirements?.target) {
      throw new CloudError('Achievement has no progress target', 'NO_TARGET');
    }

    const current = achievement.requirements.current || 0;
    const newCurrent = current + amount;
    const newProgress = newCurrent / achievement.requirements.target;

    // Update requirements
    achievement.requirements.current = newCurrent;

    return await this.updateProgress(achievementId, newProgress);
  }

  /**
   * Get unlocked achievements
   */
  public getUnlockedAchievements(): PlayerAchievement[] {
    return Array.from(this.achievements.values()).filter(a => a.unlocked);
  }

  /**
   * Get locked achievements
   */
  public getLockedAchievements(includeHidden: boolean = false): PlayerAchievement[] {
    const locked = Array.from(this.achievements.values()).filter(a => !a.unlocked);

    if (!includeHidden) {
      return locked.filter(a => !a.hidden);
    }

    return locked;
  }

  /**
   * Get total points earned
   */
  public getTotalPoints(): number {
    return Array.from(this.achievements.values())
      .filter(a => a.unlocked)
      .reduce((sum, a) => sum + a.points, 0);
  }

  /**
   * Get completion percentage
   */
  public getCompletionPercentage(): number {
    if (this.achievements.size === 0) {
      return 0;
    }

    const unlocked = this.getUnlockedAchievements().length;
    return (unlocked / this.achievements.size) * 100;
  }

  /**
   * Check if achievement is unlocked
   */
  public isUnlocked(achievementId: string): boolean {
    const achievement = this.achievements.get(achievementId);
    return achievement?.unlocked ?? false;
  }

  /**
   * Get achievement progress
   */
  public getProgress(achievementId: string): number {
    const achievement = this.achievements.get(achievementId);
    return achievement?.progress ?? 0;
  }

  /**
   * Add unlock listener
   */
  public onAchievementUnlocked(callback: AchievementEventCallback): () => void {
    this.unlockListeners.add(callback);

    return () => {
      this.unlockListeners.delete(callback);
    };
  }

  /**
   * Add progress listener
   */
  public onProgressUpdated(callback: AchievementEventCallback): () => void {
    this.progressListeners.add(callback);

    return () => {
      this.progressListeners.delete(callback);
    };
  }

  /**
   * Notify unlock listeners
   */
  private notifyUnlock(achievement: PlayerAchievement): void {
    for (const listener of this.unlockListeners) {
      try {
        listener(achievement);
      } catch (error) {
        console.error('[Achievements] Unlock listener error:', error);
      }
    }
  }

  /**
   * Notify progress listeners
   */
  private notifyProgress(achievement: PlayerAchievement): void {
    for (const listener of this.progressListeners) {
      try {
        listener(achievement);
      } catch (error) {
        console.error('[Achievements] Progress listener error:', error);
      }
    }
  }

  /**
   * Create achievement (admin)
   */
  public async createAchievement(achievement: Omit<Achievement, 'id' | 'createdAt'>): Promise<Achievement> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot create achievement while offline', 'OFFLINE');
    }

    try {
      const response = await this.cloudManager.requestWithRetry<Achievement>(
        '/achievements',
        {
          method: 'POST',
          body: JSON.stringify(achievement)
        }
      );

      console.log('[Achievements] Created:', response.id);
      return response;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to create achievement',
        'ACHIEVEMENT_CREATE_FAILED'
      );
    }
  }

  /**
   * Reset achievement progress
   */
  public async resetProgress(achievementId: string): Promise<void> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot reset progress while offline', 'OFFLINE');
    }

    try {
      await this.cloudManager.requestWithRetry(
        `/achievements/${achievementId}/reset`,
        { method: 'POST' }
      );

      const achievement = this.achievements.get(achievementId);
      if (achievement) {
        achievement.unlocked = false;
        achievement.progress = 0;
        achievement.unlockedAt = undefined;
        if (achievement.requirements) {
          achievement.requirements.current = 0;
        }
      }

      console.log('[Achievements] Progress reset:', achievementId);
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to reset progress',
        'ACHIEVEMENT_RESET_FAILED'
      );
    }
  }
}
