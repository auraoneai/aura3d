import { Logger } from '../../core/Logger';
import { Culture } from './Culture';
import { SocialNormSystem } from './SocialNormSystem';
import { ProxemicsSystem } from './ProxemicsSystem';
import { CommunicationStyleSystem } from './CommunicationStyleSystem';
import { DecisionMakingSystem } from './DecisionMakingSystem';
import { GestureSystem } from './GestureSystem';

/**
 * Entity with cultural behavior
 */
export interface CulturalEntity {
  /** Unique entity ID */
  id: string;
  /** Assigned culture */
  culture: Culture;
  /** Entity position in world */
  position?: { x: number; y: number; z: number };
  /** Cultural personality variance [0-1] */
  personalityVariance?: number;
  /** Custom cultural traits overrides */
  traitOverrides?: Map<string, number>;
}

/**
 * Cultural behavior system configuration
 */
export interface CulturalBehaviorConfig {
  /** Enable social norms enforcement */
  enableNorms?: boolean;
  /** Enable proxemics management */
  enableProxemics?: boolean;
  /** Enable communication style adaptation */
  enableCommunication?: boolean;
  /** Enable culturally-aware decision making */
  enableDecisionMaking?: boolean;
  /** Enable gesture system */
  enableGestures?: boolean;
  /** Default culture for entities without assignment */
  defaultCulture?: Culture;
}

/**
 * Cultural interaction context
 */
export interface CulturalInteraction {
  /** Initiating entity */
  initiator: CulturalEntity;
  /** Target entity */
  target: CulturalEntity;
  /** Interaction type */
  type: string;
  /** Interaction context data */
  context?: any;
}

/**
 * Cultural Behavior System
 *
 * Central system for managing culturally-aware AI behaviors including
 * culture assignment, social norms, proxemics, communication styles,
 * and decision making.
 *
 * @example
 * ```typescript
 * const culturalSystem = new CulturalBehaviorSystem({
 *   enableNorms: true,
 *   enableProxemics: true,
 *   enableCommunication: true
 * });
 *
 * const entity = culturalSystem.createEntity('npc1', westernCulture, {
 *   x: 0, y: 0, z: 0
 * });
 *
 * const canApproach = culturalSystem.canApproach(entity1, entity2);
 * const message = culturalSystem.formatMessage(entity, 'greeting', audience);
 * ```
 */
export class CulturalBehaviorSystem {
  private logger: Logger;
  private config: Required<CulturalBehaviorConfig>;
  private entities: Map<string, CulturalEntity>;
  private normSystem?: SocialNormSystem;
  private proxemicsSystem?: ProxemicsSystem;
  private communicationSystem?: CommunicationStyleSystem;
  private decisionSystem?: DecisionMakingSystem;
  private gestureSystem?: GestureSystem;

  /**
   * Creates a new cultural behavior system
   *
   * @param config - System configuration
   */
  constructor(config: CulturalBehaviorConfig = {}) {
    this.logger = new Logger('CulturalBehaviorSystem');
    this.config = {
      enableNorms: config.enableNorms ?? true,
      enableProxemics: config.enableProxemics ?? true,
      enableCommunication: config.enableCommunication ?? true,
      enableDecisionMaking: config.enableDecisionMaking ?? true,
      enableGestures: config.enableGestures ?? true,
      defaultCulture: config.defaultCulture || this.createDefaultCulture()
    };

    this.entities = new Map();
    this.initializeSystems();
  }

  /**
   * Initializes cultural subsystems
   */
  private initializeSystems(): void {
    if (this.config.enableNorms) {
      this.normSystem = new SocialNormSystem();
      this.logger.info('Social norm system initialized');
    }

    if (this.config.enableProxemics) {
      this.proxemicsSystem = new ProxemicsSystem();
      this.logger.info('Proxemics system initialized');
    }

    if (this.config.enableCommunication) {
      this.communicationSystem = new CommunicationStyleSystem();
      this.logger.info('Communication style system initialized');
    }

    if (this.config.enableDecisionMaking) {
      this.decisionSystem = new DecisionMakingSystem();
      this.logger.info('Decision making system initialized');
    }

    if (this.config.enableGestures) {
      this.gestureSystem = new GestureSystem();
      this.logger.info('Gesture system initialized');
    }
  }

  /**
   * Creates a default neutral culture
   */
  private createDefaultCulture(): Culture {
    return {
      id: 'neutral',
      name: 'Neutral',
      individualismScore: 0.5,
      powerDistanceScore: 0.5,
      uncertaintyAvoidanceScore: 0.5,
      masculinityScore: 0.5,
      longTermOrientationScore: 0.5,
      indulgenceScore: 0.5,
      communicationStyle: 'balanced',
      timeOrientation: 'balanced',
      conflictResolutionStyle: 'collaborative',
      greetingStyle: 'formal',
      personalSpacePreference: 'medium',
      eyeContactNorm: 'moderate'
    };
  }

  /**
   * Creates a new cultural entity
   *
   * @param id - Entity ID
   * @param culture - Entity's culture
   * @param position - Entity position
   * @param personalityVariance - Individual variance from cultural norms [0-1]
   * @returns Created entity
   */
  createEntity(
    id: string,
    culture?: Culture,
    position?: { x: number; y: number; z: number },
    personalityVariance: number = 0.1
  ): CulturalEntity {
    const entity: CulturalEntity = {
      id,
      culture: culture || this.config.defaultCulture,
      position,
      personalityVariance: Math.max(0, Math.min(1, personalityVariance)),
      traitOverrides: new Map()
    };

    this.entities.set(id, entity);
    this.logger.debug(`Entity created: ${id} with culture ${entity.culture.name}`);

    return entity;
  }

  /**
   * Gets an entity by ID
   *
   * @param id - Entity ID
   * @returns Entity or undefined
   */
  getEntity(id: string): CulturalEntity | undefined {
    return this.entities.get(id);
  }

  /**
   * Updates an entity's culture
   *
   * @param id - Entity ID
   * @param culture - New culture
   */
  updateEntityCulture(id: string, culture: Culture): void {
    const entity = this.entities.get(id);
    if (entity) {
      entity.culture = culture;
      this.logger.debug(`Entity ${id} culture updated to ${culture.name}`);
    }
  }

  /**
   * Updates an entity's position
   *
   * @param id - Entity ID
   * @param position - New position
   */
  updateEntityPosition(id: string, position: { x: number; y: number; z: number }): void {
    const entity = this.entities.get(id);
    if (entity) {
      entity.position = position;
    }
  }

  /**
   * Removes an entity
   *
   * @param id - Entity ID
   */
  removeEntity(id: string): void {
    this.entities.delete(id);
    this.logger.debug(`Entity removed: ${id}`);
  }

  /**
   * Checks if an entity can approach another based on cultural norms and proxemics
   *
   * @param initiator - Approaching entity
   * @param target - Target entity
   * @param relationship - Relationship type
   * @returns Whether approach is acceptable
   */
  canApproach(
    initiator: CulturalEntity,
    target: CulturalEntity,
    relationship: 'stranger' | 'acquaintance' | 'friend' | 'family' = 'stranger'
  ): boolean {
    if (!this.proxemicsSystem) return true;

    if (!initiator.position || !target.position) return true;

    const distance = this.calculateDistance(initiator.position, target.position);
    const acceptableDistance = this.proxemicsSystem.getAcceptableDistance(
      target.culture,
      relationship
    );

    return distance >= acceptableDistance;
  }

  /**
   * Gets the recommended distance for interaction
   *
   * @param culture - Culture
   * @param relationship - Relationship type
   * @returns Recommended distance in meters
   */
  getRecommendedDistance(
    culture: Culture,
    relationship: 'stranger' | 'acquaintance' | 'friend' | 'family'
  ): number {
    if (!this.proxemicsSystem) return 1.2;
    return this.proxemicsSystem.getAcceptableDistance(culture, relationship);
  }

  /**
   * Validates a cultural interaction against social norms
   *
   * @param interaction - Interaction to validate
   * @returns Validation result with violations
   */
  validateInteraction(interaction: CulturalInteraction): {
    valid: boolean;
    violations: string[];
  } {
    if (!this.normSystem) {
      return { valid: true, violations: [] };
    }

    return this.normSystem.validateInteraction(
      interaction.initiator.culture,
      interaction.type,
      interaction.context
    );
  }

  /**
   * Formats a message according to cultural communication style
   *
   * @param entity - Speaking entity
   * @param messageType - Type of message
   * @param audience - Audience culture
   * @param content - Message content
   * @returns Formatted message
   */
  formatMessage(
    entity: CulturalEntity,
    messageType: string,
    audience: Culture,
    content: string
  ): string {
    if (!this.communicationSystem) return content;

    return this.communicationSystem.formatMessage(
      entity.culture,
      messageType,
      audience,
      content
    );
  }

  /**
   * Makes a culturally-aware decision
   *
   * @param entity - Decision-making entity
   * @param options - Available options
   * @param context - Decision context
   * @returns Selected option
   */
  makeDecision<T>(
    entity: CulturalEntity,
    options: T[],
    context: any
  ): T {
    if (!this.decisionSystem || options.length === 0) {
      return options[0];
    }

    return this.decisionSystem.makeDecision(
      entity.culture,
      options,
      context
    );
  }

  /**
   * Gets appropriate gesture for context
   *
   * @param entity - Entity performing gesture
   * @param gestureType - Type of gesture
   * @returns Gesture description
   */
  getGesture(
    entity: CulturalEntity,
    gestureType: string
  ): string | undefined {
    if (!this.gestureSystem) return undefined;

    return this.gestureSystem.getGesture(
      entity.culture,
      gestureType
    );
  }

  /**
   * Calculates cultural compatibility between two entities
   *
   * @param entity1 - First entity
   * @param entity2 - Second entity
   * @returns Compatibility score [0-1]
   */
  calculateCompatibility(
    entity1: CulturalEntity,
    entity2: CulturalEntity
  ): number {
    const c1 = entity1.culture;
    const c2 = entity2.culture;

    const dimensions = [
      Math.abs(c1.individualismScore - c2.individualismScore),
      Math.abs(c1.powerDistanceScore - c2.powerDistanceScore),
      Math.abs(c1.uncertaintyAvoidanceScore - c2.uncertaintyAvoidanceScore),
      Math.abs(c1.masculinityScore - c2.masculinityScore),
      Math.abs(c1.longTermOrientationScore - c2.longTermOrientationScore),
      Math.abs(c1.indulgenceScore - c2.indulgenceScore)
    ];

    const averageDifference = dimensions.reduce((a, b) => a + b, 0) / dimensions.length;

    return 1 - averageDifference;
  }

  /**
   * Calculates distance between two positions
   */
  private calculateDistance(
    pos1: { x: number; y: number; z: number },
    pos2: { x: number; y: number; z: number }
  ): number {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const dz = pos2.z - pos1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Gets all entities
   */
  getAllEntities(): CulturalEntity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Gets entities by culture
   *
   * @param cultureId - Culture ID
   * @returns Entities with that culture
   */
  getEntitiesByCulture(cultureId: string): CulturalEntity[] {
    return Array.from(this.entities.values()).filter(
      entity => entity.culture.id === cultureId
    );
  }

  /**
   * Gets the social norm system
   */
  getNormSystem(): SocialNormSystem | undefined {
    return this.normSystem;
  }

  /**
   * Gets the proxemics system
   */
  getProxemicsSystem(): ProxemicsSystem | undefined {
    return this.proxemicsSystem;
  }

  /**
   * Gets the communication style system
   */
  getCommunicationSystem(): CommunicationStyleSystem | undefined {
    return this.communicationSystem;
  }

  /**
   * Gets the decision making system
   */
  getDecisionSystem(): DecisionMakingSystem | undefined {
    return this.decisionSystem;
  }

  /**
   * Gets the gesture system
   */
  getGestureSystem(): GestureSystem | undefined {
    return this.gestureSystem;
  }
}
