/**
 * Smart Systems Module
 *
 * Provides intelligent, adaptive game systems including:
 * - Event tracking and analysis
 * - Player profiling and behavior analysis
 * - Dynamic difficulty adjustment
 * - Procedural content generation
 * - Adaptive AI
 *
 * @module ai/smart
 */

export {
  SmartSystemsFramework,
} from './SmartSystemsFramework';

export type {
  SmartSystemsConfig
} from './SmartSystemsFramework';

export {
  EventTracker,
  EventCategory,
  EventSeverity,
} from './EventTracker';

export type {
  EventTrackerConfig,
  GameEvent,
  EventPattern,
  EventStats
} from './EventTracker';

export {
  PlayerProfile,
  SkillLevel,
  Playstyle,
  EngagementLevel,
} from './PlayerProfile';

export type {
  PlayerProfileConfig,
  ProfileData,
  SkillAssessment,
  PlayerPreference,
  BehaviorPattern
} from './PlayerProfile';

export {
  BehaviorAnalyzer,
} from './BehaviorAnalyzer';

export type {
  BehaviorAnalyzerConfig,
  BehaviorInsight,
  SessionAnalysis
} from './BehaviorAnalyzer';

export {
  DifficultyAdjuster,
} from './DifficultyAdjuster';

export type {
  DifficultyAdjusterConfig,
  DifficultyAdjustment
} from './DifficultyAdjuster';

export {
  ContentGenerator,
  ContentType,
  ContentDifficulty,
} from './ContentGenerator';

export type {
  ContentGeneratorConfig,
  GeneratedContent,
  GenerationParams
} from './ContentGenerator';

export {
  AdaptiveAI,
  AIBehaviorMode,
  AdaptationStrategy,
} from './AdaptiveAI';

export type {
  AdaptiveAIConfig,
  AIBehaviorParams
} from './AdaptiveAI';
