import { Logger } from '../../core/Logger';

/**
 * Player skill level.
 */
export enum SkillLevel {
  BEGINNER = 'beginner',
  NOVICE = 'novice',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert'
}

/**
 * Player playstyle preference.
 */
export enum Playstyle {
  AGGRESSIVE = 'aggressive',
  DEFENSIVE = 'defensive',
  BALANCED = 'balanced',
  STEALTH = 'stealth',
  EXPLORATION = 'exploration',
  SPEEDRUN = 'speedrun',
  COMPLETIONIST = 'completionist'
}

/**
 * Player engagement level.
 */
export enum EngagementLevel {
  CASUAL = 'casual',
  REGULAR = 'regular',
  DEDICATED = 'dedicated',
  HARDCORE = 'hardcore'
}

/**
 * Skill assessment in a specific area.
 */
export interface SkillAssessment {
  /** Skill area name */
  area: string;
  /** Skill level (0-1) */
  level: number;
  /** Confidence in assessment (0-1) */
  confidence: number;
  /** Sample size used for assessment */
  sampleSize: number;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Player preference.
 */
export interface PlayerPreference {
  /** Preference category */
  category: string;
  /** Preference value/type */
  value: string;
  /** Strength of preference (0-1) */
  strength: number;
}

/**
 * Behavior pattern observed.
 */
export interface BehaviorPattern {
  /** Pattern name/type */
  name: string;
  /** Pattern description */
  description: string;
  /** Frequency of occurrence */
  frequency: number;
  /** Pattern confidence (0-1) */
  confidence: number;
  /** First observed */
  firstObserved: number;
  /** Last observed */
  lastObserved: number;
}

/**
 * Player profile data.
 */
export interface ProfileData {
  /** Unique player ID */
  playerId: string;
  /** Overall skill level */
  skillLevel: SkillLevel;
  /** Primary playstyle */
  playstyle: Playstyle;
  /** Engagement level */
  engagement: EngagementLevel;
  /** Skill assessments by area */
  skills: Map<string, SkillAssessment>;
  /** Player preferences */
  preferences: PlayerPreference[];
  /** Behavior patterns */
  patterns: BehaviorPattern[];
  /** Total playtime (ms) */
  totalPlaytime: number;
  /** Session count */
  sessionCount: number;
  /** Profile created timestamp */
  createdAt: number;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Configuration for player profile.
 */
export interface PlayerProfileConfig {
  /** Player ID */
  playerId: string;
  /** Initial skill level */
  initialSkillLevel?: SkillLevel;
  /** Auto-save interval (ms) */
  autoSaveInterval?: number;
}

/**
 * Player Profile.
 *
 * Maintains a comprehensive profile of a player including:
 * - Skill assessments in various areas
 * - Playstyle preferences
 * - Behavior patterns
 * - Engagement metrics
 *
 * Used by adaptive systems to personalize the game experience.
 *
 * @example
 * ```typescript
 * const profile = new PlayerProfile({
 *   playerId: 'player_123',
 *   initialSkillLevel: SkillLevel.BEGINNER
 * });
 *
 * profile.updateSkill('combat', 0.65, 10);
 * profile.addPreference('difficulty', 'normal', 0.8);
 * profile.setPlaystyle(Playstyle.AGGRESSIVE);
 *
 * const combatSkill = profile.getSkill('combat');
 * ```
 */
export class PlayerProfile {
  private data: ProfileData;
  private autoSaveInterval: number | null;
  private saveTimer: any;
  private logger: Logger;

  /**
   * Creates a new player profile.
   * @param config - Configuration options
   */
  constructor(config: PlayerProfileConfig) {
    this.logger = new Logger('PlayerProfile');
    this.autoSaveInterval = config.autoSaveInterval ?? null;
    this.saveTimer = null;

    const now = Date.now();
    this.data = {
      playerId: config.playerId,
      skillLevel: config.initialSkillLevel ?? SkillLevel.BEGINNER,
      playstyle: Playstyle.BALANCED,
      engagement: EngagementLevel.CASUAL,
      skills: new Map(),
      preferences: [],
      patterns: [],
      totalPlaytime: 0,
      sessionCount: 0,
      createdAt: now,
      lastUpdated: now
    };

    if (this.autoSaveInterval) {
      this.startAutoSave();
    }

    this.logger.info(`Player profile created for ${config.playerId}`);
  }

  /**
   * Updates skill assessment for an area.
   * @param area - Skill area
   * @param level - Skill level (0-1)
   * @param sampleSize - Number of samples used
   */
  public updateSkill(area: string, level: number, sampleSize: number = 1): void {
    const existing = this.data.skills.get(area);

    if (existing) {
      // Weighted average with existing assessment
      const totalSamples = existing.sampleSize + sampleSize;
      const newLevel = (existing.level * existing.sampleSize + level * sampleSize) / totalSamples;
      const newConfidence = Math.min(totalSamples / 100, 1.0);

      this.data.skills.set(area, {
        area,
        level: newLevel,
        confidence: newConfidence,
        sampleSize: totalSamples,
        lastUpdated: Date.now()
      });
    } else {
      this.data.skills.set(area, {
        area,
        level,
        confidence: Math.min(sampleSize / 100, 0.5),
        sampleSize,
        lastUpdated: Date.now()
      });
    }

    this.updateOverallSkillLevel();
    this.touch();
    this.logger.debug(`Skill updated: ${area} = ${level.toFixed(2)}`);
  }

  /**
   * Updates overall skill level based on individual skills.
   */
  private updateOverallSkillLevel(): void {
    if (this.data.skills.size === 0) {
      return;
    }

    const avgSkill = Array.from(this.data.skills.values())
      .reduce((sum, s) => sum + s.level, 0) / this.data.skills.size;

    if (avgSkill < 0.2) {
      this.data.skillLevel = SkillLevel.BEGINNER;
    } else if (avgSkill < 0.4) {
      this.data.skillLevel = SkillLevel.NOVICE;
    } else if (avgSkill < 0.6) {
      this.data.skillLevel = SkillLevel.INTERMEDIATE;
    } else if (avgSkill < 0.8) {
      this.data.skillLevel = SkillLevel.ADVANCED;
    } else {
      this.data.skillLevel = SkillLevel.EXPERT;
    }
  }

  /**
   * Gets skill assessment for an area.
   * @param area - Skill area
   * @returns Skill assessment, or null if not found
   */
  public getSkill(area: string): SkillAssessment | null {
    return this.data.skills.get(area) || null;
  }

  /**
   * Gets all skill assessments.
   * @returns Array of skill assessments
   */
  public getAllSkills(): SkillAssessment[] {
    return Array.from(this.data.skills.values());
  }

  /**
   * Adds or updates a preference.
   * @param category - Preference category
   * @param value - Preference value
   * @param strength - Preference strength (0-1)
   */
  public addPreference(category: string, value: string, strength: number): void {
    const existing = this.data.preferences.findIndex(
      p => p.category === category && p.value === value
    );

    if (existing >= 0) {
      // Update strength (weighted average)
      const oldStrength = this.data.preferences[existing].strength;
      this.data.preferences[existing].strength = (oldStrength + strength) / 2;
    } else {
      this.data.preferences.push({ category, value, strength });
    }

    this.touch();
    this.logger.debug(`Preference added: ${category} = ${value} (${strength.toFixed(2)})`);
  }

  /**
   * Gets preferences by category.
   * @param category - Preference category
   * @returns Array of matching preferences
   */
  public getPreferences(category: string): PlayerPreference[] {
    return this.data.preferences.filter(p => p.category === category);
  }

  /**
   * Gets the strongest preference in a category.
   * @param category - Preference category
   * @returns Strongest preference, or null if none
   */
  public getStrongestPreference(category: string): PlayerPreference | null {
    const prefs = this.getPreferences(category);
    if (prefs.length === 0) {
      return null;
    }
    return prefs.reduce((strongest, p) => p.strength > strongest.strength ? p : strongest);
  }

  /**
   * Adds a behavior pattern.
   * @param pattern - Partial pattern data (firstObserved auto-set)
   */
  public addPattern(pattern: Omit<BehaviorPattern, 'firstObserved' | 'lastObserved'>): void {
    const existing = this.data.patterns.find(p => p.name === pattern.name);

    if (existing) {
      existing.frequency = pattern.frequency;
      existing.confidence = pattern.confidence;
      existing.lastObserved = Date.now();
    } else {
      const now = Date.now();
      this.data.patterns.push({
        ...pattern,
        firstObserved: now,
        lastObserved: now
      });
    }

    this.touch();
    this.logger.debug(`Pattern added: ${pattern.name}`);
  }

  /**
   * Gets all behavior patterns.
   * @returns Array of patterns
   */
  public getPatterns(): BehaviorPattern[] {
    return [...this.data.patterns];
  }

  /**
   * Sets the primary playstyle.
   * @param playstyle - Playstyle
   */
  public setPlaystyle(playstyle: Playstyle): void {
    this.data.playstyle = playstyle;
    this.touch();
    this.logger.debug(`Playstyle set to ${playstyle}`);
  }

  /**
   * Gets the primary playstyle.
   * @returns Playstyle
   */
  public getPlaystyle(): Playstyle {
    return this.data.playstyle;
  }

  /**
   * Sets the engagement level.
   * @param engagement - Engagement level
   */
  public setEngagement(engagement: EngagementLevel): void {
    this.data.engagement = engagement;
    this.touch();
    this.logger.debug(`Engagement set to ${engagement}`);
  }

  /**
   * Gets the engagement level.
   * @returns Engagement level
   */
  public getEngagement(): EngagementLevel {
    return this.data.engagement;
  }

  /**
   * Adds playtime.
   * @param duration - Duration in milliseconds
   */
  public addPlaytime(duration: number): void {
    this.data.totalPlaytime += duration;
    this.touch();
  }

  /**
   * Increments session count.
   */
  public incrementSessionCount(): void {
    this.data.sessionCount++;
    this.touch();
  }

  /**
   * Gets the overall skill level.
   * @returns Skill level
   */
  public getSkillLevel(): SkillLevel {
    return this.data.skillLevel;
  }

  /**
   * Gets the player ID.
   * @returns Player ID
   */
  public getPlayerId(): string {
    return this.data.playerId;
  }

  /**
   * Gets total playtime.
   * @returns Playtime in milliseconds
   */
  public getTotalPlaytime(): number {
    return this.data.totalPlaytime;
  }

  /**
   * Gets session count.
   * @returns Number of sessions
   */
  public getSessionCount(): number {
    return this.data.sessionCount;
  }

  /**
   * Updates the lastUpdated timestamp.
   */
  private touch(): void {
    this.data.lastUpdated = Date.now();
  }

  /**
   * Starts auto-save timer.
   */
  private startAutoSave(): void {
    if (this.saveTimer) {
      return;
    }

    this.saveTimer = setInterval(() => {
      this.logger.debug('Auto-save triggered');
      // In real implementation, would persist to storage
    }, this.autoSaveInterval!);
  }

  /**
   * Stops auto-save timer.
   */
  public stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  /**
   * Exports profile as JSON.
   * @returns JSON representation
   */
  public toJSON(): any {
    return {
      ...this.data,
      skills: Array.from(this.data.skills.entries())
    };
  }

  /**
   * Imports profile from JSON.
   * @param json - JSON data
   */
  public fromJSON(json: any): void {
    this.data = {
      ...json,
      skills: new Map(json.skills)
    };
    this.logger.info('Profile imported from JSON');
  }
}
