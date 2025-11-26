import { Logger } from '../../core/Logger';
import { PlayerProfile, Playstyle, SkillLevel } from './PlayerProfile';

/**
 * Generated content types.
 */
export enum ContentType {
  LEVEL = 'level',
  QUEST = 'quest',
  ENEMY_ENCOUNTER = 'enemy_encounter',
  PUZZLE = 'puzzle',
  REWARD = 'reward',
  NARRATIVE = 'narrative'
}

/**
 * Content difficulty tier.
 */
export enum ContentDifficulty {
  TRIVIAL = 'trivial',
  EASY = 'easy',
  MODERATE = 'moderate',
  CHALLENGING = 'challenging',
  EXTREME = 'extreme'
}

/**
 * Generated content piece.
 */
export interface GeneratedContent {
  /** Content ID */
  id: string;
  /** Content type */
  type: ContentType;
  /** Content difficulty */
  difficulty: ContentDifficulty;
  /** Content data/parameters */
  data: Record<string, any>;
  /** Estimated completion time (ms) */
  estimatedDuration: number;
  /** Tags for categorization */
  tags: string[];
  /** Generation timestamp */
  generatedAt: number;
}

/**
 * Content generation parameters.
 */
export interface GenerationParams {
  /** Content type to generate */
  type: ContentType;
  /** Target difficulty (optional, will be inferred if not provided) */
  difficulty?: ContentDifficulty;
  /** Additional constraints */
  constraints?: Record<string, any>;
  /** Seed for reproducible generation */
  seed?: number;
}

/**
 * Configuration for content generator.
 */
export interface ContentGeneratorConfig {
  /** Random seed for deterministic generation */
  seed?: number;
  /** Enable playstyle-based customization */
  enablePlaystyleCustomization?: boolean;
  /** Enable skill-based scaling */
  enableSkillScaling?: boolean;
}

/**
 * Procedural Content Generator.
 *
 * Generates game content tailored to player profile.
 * Adjusts difficulty, style, and content type based on
 * player skill, playstyle, and preferences.
 *
 * @example
 * ```typescript
 * const generator = new ContentGenerator({
 *   enablePlaystyleCustomization: true,
 *   enableSkillScaling: true
 * });
 *
 * const quest = generator.generateContent(profile, {
 *   type: ContentType.QUEST
 * });
 *
 * const encounter = generator.generateContent(profile, {
 *   type: ContentType.ENEMY_ENCOUNTER,
 *   difficulty: ContentDifficulty.CHALLENGING
 * });
 * ```
 */
export class ContentGenerator {
  private random: () => number;
  private enablePlaystyleCustomization: boolean;
  private enableSkillScaling: boolean;
  private nextId: number;
  private logger: Logger;

  /**
   * Creates a new content generator.
   * @param config - Configuration options
   */
  constructor(config: ContentGeneratorConfig = {}) {
    this.logger = new Logger('ContentGenerator');
    this.enablePlaystyleCustomization = config.enablePlaystyleCustomization ?? true;
    this.enableSkillScaling = config.enableSkillScaling ?? true;
    this.nextId = 1;

    // Initialize random number generator
    if (config.seed !== undefined) {
      this.random = this.seededRandom(config.seed);
      this.logger.debug(`Using seeded RNG with seed ${config.seed}`);
    } else {
      this.random = Math.random;
    }

    this.logger.info('Content generator initialized');
  }

  /**
   * Creates a seeded pseudo-random number generator.
   * @param seed - The random seed
   * @returns A random function
   */
  private seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  /**
   * Generates content based on player profile.
   * @param profile - Player profile
   * @param params - Generation parameters
   * @returns Generated content
   */
  public generateContent(profile: PlayerProfile, params: GenerationParams): GeneratedContent {
    const difficulty = params.difficulty || this.inferDifficulty(profile);
    const id = `content_${this.nextId++}`;

    let data: Record<string, any> = {};
    let estimatedDuration = 0;
    const tags: string[] = [];

    switch (params.type) {
      case ContentType.LEVEL:
        data = this.generateLevel(profile, difficulty, params.constraints);
        estimatedDuration = 300000; // 5 minutes
        tags.push('procedural', 'level');
        break;

      case ContentType.QUEST:
        data = this.generateQuest(profile, difficulty, params.constraints);
        estimatedDuration = 600000; // 10 minutes
        tags.push('quest', 'objective');
        break;

      case ContentType.ENEMY_ENCOUNTER:
        data = this.generateEnemyEncounter(profile, difficulty, params.constraints);
        estimatedDuration = 120000; // 2 minutes
        tags.push('combat', 'encounter');
        break;

      case ContentType.PUZZLE:
        data = this.generatePuzzle(profile, difficulty, params.constraints);
        estimatedDuration = 180000; // 3 minutes
        tags.push('puzzle', 'challenge');
        break;

      case ContentType.REWARD:
        data = this.generateReward(profile, difficulty, params.constraints);
        estimatedDuration = 0;
        tags.push('reward', 'loot');
        break;

      case ContentType.NARRATIVE:
        data = this.generateNarrative(profile, difficulty, params.constraints);
        estimatedDuration = 60000; // 1 minute
        tags.push('story', 'narrative');
        break;
    }

    this.logger.debug(`Generated ${params.type} content (${difficulty})`);

    return {
      id,
      type: params.type,
      difficulty,
      data,
      estimatedDuration,
      tags,
      generatedAt: Date.now()
    };
  }

  /**
   * Infers appropriate difficulty from player profile.
   * @param profile - Player profile
   * @returns Inferred difficulty
   */
  private inferDifficulty(profile: PlayerProfile): ContentDifficulty {
    if (!this.enableSkillScaling) {
      return ContentDifficulty.MODERATE;
    }

    const skillLevel = profile.getSkillLevel();

    switch (skillLevel) {
      case SkillLevel.BEGINNER:
        return ContentDifficulty.EASY;
      case SkillLevel.NOVICE:
        return ContentDifficulty.MODERATE;
      case SkillLevel.INTERMEDIATE:
        return ContentDifficulty.MODERATE;
      case SkillLevel.ADVANCED:
        return ContentDifficulty.CHALLENGING;
      case SkillLevel.EXPERT:
        return ContentDifficulty.EXTREME;
      default:
        return ContentDifficulty.MODERATE;
    }
  }

  /**
   * Generates a procedural level.
   * @param profile - Player profile
   * @param difficulty - Content difficulty
   * @param constraints - Additional constraints
   * @returns Level data
   */
  private generateLevel(
    profile: PlayerProfile,
    difficulty: ContentDifficulty,
    constraints?: Record<string, any>
  ): Record<string, any> {
    const playstyle = profile.getPlaystyle();

    const sizeMultiplier = this.getDifficultyMultiplier(difficulty);
    const baseSize = 100;
    const size = Math.floor(baseSize * sizeMultiplier);

    const enemyCount = this.getEnemyCount(difficulty, playstyle);
    const resourceCount = this.getResourceCount(difficulty, playstyle);

    return {
      size,
      enemyCount,
      resourceCount,
      hasSecretAreas: playstyle === Playstyle.EXPLORATION || playstyle === Playstyle.COMPLETIONIST,
      hasTimeLimit: playstyle === Playstyle.SPEEDRUN,
      layout: this.random() > 0.5 ? 'linear' : 'branching',
      theme: this.selectTheme(profile),
      checkpoints: Math.max(1, Math.floor(size / 50))
    };
  }

  /**
   * Generates a quest.
   * @param profile - Player profile
   * @param difficulty - Content difficulty
   * @param constraints - Additional constraints
   * @returns Quest data
   */
  private generateQuest(
    profile: PlayerProfile,
    difficulty: ContentDifficulty,
    constraints?: Record<string, any>
  ): Record<string, any> {
    const playstyle = profile.getPlaystyle();

    const objectives: string[] = [];

    if (playstyle === Playstyle.AGGRESSIVE || playstyle === Playstyle.BALANCED) {
      objectives.push(`defeat_${this.random() > 0.5 ? 'enemies' : 'boss'}`);
    }

    if (playstyle === Playstyle.EXPLORATION || playstyle === Playstyle.COMPLETIONIST) {
      objectives.push('explore_area');
      objectives.push('find_collectibles');
    }

    if (playstyle === Playstyle.STEALTH) {
      objectives.push('avoid_detection');
    }

    if (playstyle === Playstyle.SPEEDRUN) {
      objectives.push('complete_within_time');
    }

    return {
      objectives,
      difficulty,
      rewards: this.generateReward(profile, difficulty),
      optional: this.random() > 0.7,
      hasStory: this.random() > 0.5
    };
  }

  /**
   * Generates an enemy encounter.
   * @param profile - Player profile
   * @param difficulty - Content difficulty
   * @param constraints - Additional constraints
   * @returns Encounter data
   */
  private generateEnemyEncounter(
    profile: PlayerProfile,
    difficulty: ContentDifficulty,
    constraints?: Record<string, any>
  ): Record<string, any> {
    const playstyle = profile.getPlaystyle();
    const combatSkill = profile.getSkill('combat');

    const baseEnemyCount = this.getEnemyCount(difficulty, playstyle);
    const enemyCount = combatSkill && combatSkill.level > 0.7
      ? Math.ceil(baseEnemyCount * 1.2)
      : baseEnemyCount;

    const enemyTypes: string[] = [];
    const numTypes = Math.min(3, Math.max(1, Math.floor(enemyCount / 2)));

    for (let i = 0; i < numTypes; i++) {
      enemyTypes.push(this.selectEnemyType(difficulty));
    }

    return {
      enemyCount,
      enemyTypes,
      isBoss: difficulty === ContentDifficulty.EXTREME && this.random() > 0.5,
      hasWaves: playstyle === Playstyle.AGGRESSIVE,
      allowsStealth: playstyle === Playstyle.STEALTH,
      arena: playstyle === Playstyle.DEFENSIVE ? 'enclosed' : 'open'
    };
  }

  /**
   * Generates a puzzle.
   * @param profile - Player profile
   * @param difficulty - Content difficulty
   * @param constraints - Additional constraints
   * @returns Puzzle data
   */
  private generatePuzzle(
    profile: PlayerProfile,
    difficulty: ContentDifficulty,
    constraints?: Record<string, any>
  ): Record<string, any> {
    const complexityMultiplier = this.getDifficultyMultiplier(difficulty);
    const steps = Math.floor(3 * complexityMultiplier);

    const puzzleTypes = ['logic', 'spatial', 'pattern', 'timing'];
    const type = puzzleTypes[Math.floor(this.random() * puzzleTypes.length)];

    return {
      type,
      steps,
      hasHints: difficulty <= ContentDifficulty.MODERATE,
      timeLimit: profile.getPlaystyle() === Playstyle.SPEEDRUN ? 60000 : null,
      allowsRetry: true
    };
  }

  /**
   * Generates rewards.
   * @param profile - Player profile
   * @param difficulty - Content difficulty
   * @param constraints - Additional constraints
   * @returns Reward data
   */
  private generateReward(
    profile: PlayerProfile,
    difficulty: ContentDifficulty,
    constraints?: Record<string, any>
  ): Record<string, any> {
    const valueMultiplier = this.getDifficultyMultiplier(difficulty);

    return {
      experience: Math.floor(100 * valueMultiplier),
      currency: Math.floor(50 * valueMultiplier),
      items: this.generateItems(difficulty),
      unlocks: difficulty >= ContentDifficulty.CHALLENGING ? ['achievement'] : []
    };
  }

  /**
   * Generates narrative content.
   * @param profile - Player profile
   * @param difficulty - Content difficulty
   * @param constraints - Additional constraints
   * @returns Narrative data
   */
  private generateNarrative(
    profile: PlayerProfile,
    difficulty: ContentDifficulty,
    constraints?: Record<string, any>
  ): Record<string, any> {
    return {
      type: this.random() > 0.5 ? 'dialogue' : 'cutscene',
      tone: this.selectNarrativeTone(profile),
      length: difficulty === ContentDifficulty.TRIVIAL ? 'short' : 'medium',
      hasChoices: this.random() > 0.6
    };
  }

  /**
   * Gets difficulty multiplier.
   * @param difficulty - Difficulty level
   * @returns Multiplier value
   */
  private getDifficultyMultiplier(difficulty: ContentDifficulty): number {
    switch (difficulty) {
      case ContentDifficulty.TRIVIAL:
        return 0.5;
      case ContentDifficulty.EASY:
        return 0.75;
      case ContentDifficulty.MODERATE:
        return 1.0;
      case ContentDifficulty.CHALLENGING:
        return 1.5;
      case ContentDifficulty.EXTREME:
        return 2.0;
      default:
        return 1.0;
    }
  }

  /**
   * Calculates enemy count based on difficulty and playstyle.
   * @param difficulty - Difficulty level
   * @param playstyle - Player playstyle
   * @returns Enemy count
   */
  private getEnemyCount(difficulty: ContentDifficulty, playstyle: Playstyle): number {
    let base = Math.floor(3 * this.getDifficultyMultiplier(difficulty));

    if (playstyle === Playstyle.AGGRESSIVE) {
      base = Math.ceil(base * 1.5);
    } else if (playstyle === Playstyle.STEALTH) {
      base = Math.ceil(base * 0.7);
    }

    return Math.max(1, base);
  }

  /**
   * Calculates resource count.
   * @param difficulty - Difficulty level
   * @param playstyle - Player playstyle
   * @returns Resource count
   */
  private getResourceCount(difficulty: ContentDifficulty, playstyle: Playstyle): number {
    let base = Math.floor(5 * (1 / this.getDifficultyMultiplier(difficulty)));

    if (playstyle === Playstyle.EXPLORATION || playstyle === Playstyle.COMPLETIONIST) {
      base = Math.ceil(base * 1.5);
    }

    return Math.max(1, base);
  }

  /**
   * Selects theme based on profile.
   * @param profile - Player profile
   * @returns Theme name
   */
  private selectTheme(profile: PlayerProfile): string {
    const themes = ['forest', 'dungeon', 'ruins', 'castle', 'cave'];
    return themes[Math.floor(this.random() * themes.length)];
  }

  /**
   * Selects enemy type based on difficulty.
   * @param difficulty - Difficulty level
   * @returns Enemy type
   */
  private selectEnemyType(difficulty: ContentDifficulty): string {
    const easyEnemies = ['goblin', 'skeleton', 'slime'];
    const hardEnemies = ['ogre', 'dragon', 'demon'];

    const pool = difficulty <= ContentDifficulty.MODERATE ? easyEnemies : hardEnemies;
    return pool[Math.floor(this.random() * pool.length)];
  }

  /**
   * Generates item rewards.
   * @param difficulty - Difficulty level
   * @returns Array of items
   */
  private generateItems(difficulty: ContentDifficulty): string[] {
    const count = Math.floor(this.random() * 3) + 1;
    const items: string[] = [];

    for (let i = 0; i < count; i++) {
      items.push(difficulty >= ContentDifficulty.CHALLENGING ? 'rare_item' : 'common_item');
    }

    return items;
  }

  /**
   * Selects narrative tone.
   * @param profile - Player profile
   * @returns Narrative tone
   */
  private selectNarrativeTone(profile: PlayerProfile): string {
    const tones = ['serious', 'humorous', 'dramatic', 'mysterious'];
    return tones[Math.floor(this.random() * tones.length)];
  }

  /**
   * Reseeds the random number generator.
   * @param seed - New seed value
   */
  public reseed(seed: number): void {
    this.random = this.seededRandom(seed);
    this.logger.debug(`RNG reseeded with ${seed}`);
  }
}
