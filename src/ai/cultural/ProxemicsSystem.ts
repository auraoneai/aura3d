import { Logger } from '../../core/Logger';
import { Culture } from './Culture';

/**
 * Proxemic zone based on Edward T. Hall's theory
 */
export enum ProxemicZone {
  INTIMATE = 'intimate',
  PERSONAL = 'personal',
  SOCIAL = 'social',
  PUBLIC = 'public'
}

/**
 * Relationship type for proxemics
 */
export type ProxemicRelationship = 'stranger' | 'acquaintance' | 'friend' | 'family';

/**
 * Proxemic zone configuration
 */
interface ZoneConfig {
  /** Minimum distance in meters */
  min: number;
  /** Maximum distance in meters */
  max: number;
  /** Zone description */
  description: string;
}

/**
 * Proxemics System
 *
 * Manages personal space and interpersonal distance based on Edward T. Hall's
 * proxemics theory. Adapts distances based on cultural preferences.
 *
 * @example
 * ```typescript
 * const proxemics = new ProxemicsSystem();
 *
 * const distance = proxemics.getAcceptableDistance(
 *   japaneseCulture,
 *   'stranger'
 * );
 *
 * const zone = proxemics.getZoneForDistance(distance);
 * console.log(`Appropriate zone: ${zone}`);
 * ```
 */
export class ProxemicsSystem {
  private logger: Logger;
  private baseZones: Map<ProxemicZone, ZoneConfig>;

  /**
   * Creates a new proxemics system
   */
  constructor() {
    this.logger = new Logger('ProxemicsSystem');
    this.baseZones = new Map();
    this.initializeBaseZones();
  }

  /**
   * Initializes base proxemic zones (US/Western standard)
   */
  private initializeBaseZones(): void {
    this.baseZones.set(ProxemicZone.INTIMATE, {
      min: 0.0,
      max: 0.45,
      description: 'Intimate distance - for close relationships'
    });

    this.baseZones.set(ProxemicZone.PERSONAL, {
      min: 0.45,
      max: 1.2,
      description: 'Personal distance - for friends and acquaintances'
    });

    this.baseZones.set(ProxemicZone.SOCIAL, {
      min: 1.2,
      max: 3.6,
      description: 'Social distance - for formal interactions'
    });

    this.baseZones.set(ProxemicZone.PUBLIC, {
      min: 3.6,
      max: Infinity,
      description: 'Public distance - for public speaking'
    });

    this.logger.info('Base proxemic zones initialized');
  }

  /**
   * Gets the acceptable distance for an interaction
   *
   * @param culture - Culture context
   * @param relationship - Relationship type
   * @returns Distance in meters
   */
  getAcceptableDistance(
    culture: Culture,
    relationship: ProxemicRelationship
  ): number {
    const baseDistance = this.getBaseDistance(relationship);
    const culturalModifier = this.getCulturalModifier(culture);

    return baseDistance * culturalModifier;
  }

  /**
   * Gets base distance for relationship type
   */
  private getBaseDistance(relationship: ProxemicRelationship): number {
    switch (relationship) {
      case 'family':
        return 0.3;
      case 'friend':
        return 0.6;
      case 'acquaintance':
        return 1.0;
      case 'stranger':
        return 1.5;
      default:
        return 1.2;
    }
  }

  /**
   * Calculates cultural modifier for distance
   */
  private getCulturalModifier(culture: Culture): number {
    let modifier = 1.0;

    switch (culture.personalSpacePreference) {
      case 'close':
        modifier *= 0.7;
        break;
      case 'medium':
        modifier *= 1.0;
        break;
      case 'distant':
        modifier *= 1.4;
        break;
    }

    modifier *= (1.0 - culture.individualismScore * 0.2);

    modifier *= (1.0 + culture.powerDistanceScore * 0.15);

    return modifier;
  }

  /**
   * Gets the proxemic zone for a given distance
   *
   * @param distance - Distance in meters
   * @returns Proxemic zone
   */
  getZoneForDistance(distance: number): ProxemicZone {
    if (distance < this.baseZones.get(ProxemicZone.INTIMATE)!.max) {
      return ProxemicZone.INTIMATE;
    } else if (distance < this.baseZones.get(ProxemicZone.PERSONAL)!.max) {
      return ProxemicZone.PERSONAL;
    } else if (distance < this.baseZones.get(ProxemicZone.SOCIAL)!.max) {
      return ProxemicZone.SOCIAL;
    } else {
      return ProxemicZone.PUBLIC;
    }
  }

  /**
   * Checks if a distance is appropriate for the relationship and culture
   *
   * @param distance - Actual distance in meters
   * @param culture - Culture context
   * @param relationship - Relationship type
   * @returns Whether the distance is appropriate
   */
  isDistanceAppropriate(
    distance: number,
    culture: Culture,
    relationship: ProxemicRelationship
  ): boolean {
    const acceptable = this.getAcceptableDistance(culture, relationship);
    const tolerance = acceptable * 0.3;

    return distance >= acceptable - tolerance;
  }

  /**
   * Gets the comfort level for a given distance
   *
   * @param distance - Actual distance in meters
   * @param culture - Culture context
   * @param relationship - Relationship type
   * @returns Comfort level [0-1], 1 = most comfortable
   */
  getComfortLevel(
    distance: number,
    culture: Culture,
    relationship: ProxemicRelationship
  ): number {
    const acceptable = this.getAcceptableDistance(culture, relationship);
    const difference = Math.abs(distance - acceptable);

    const maxDeviation = acceptable * 0.5;
    const comfort = Math.max(0, 1 - difference / maxDeviation);

    return comfort;
  }

  /**
   * Suggests optimal distance for interaction
   *
   * @param culture - Culture context
   * @param relationship - Relationship type
   * @param interactionType - Type of interaction
   * @returns Suggested distance in meters
   */
  suggestDistance(
    culture: Culture,
    relationship: ProxemicRelationship,
    interactionType: string = 'conversation'
  ): number {
    let baseDistance = this.getAcceptableDistance(culture, relationship);

    switch (interactionType) {
      case 'greeting':
        baseDistance *= 1.1;
        break;
      case 'conversation':
        baseDistance *= 1.0;
        break;
      case 'collaboration':
        baseDistance *= 0.9;
        break;
      case 'passing':
        baseDistance *= 1.3;
        break;
    }

    if (culture.greetingStyle === 'formal') {
      baseDistance *= 1.1;
    }

    return baseDistance;
  }

  /**
   * Gets the appropriate zone for a relationship
   *
   * @param relationship - Relationship type
   * @returns Proxemic zone
   */
  getZoneForRelationship(relationship: ProxemicRelationship): ProxemicZone {
    switch (relationship) {
      case 'family':
        return ProxemicZone.INTIMATE;
      case 'friend':
        return ProxemicZone.PERSONAL;
      case 'acquaintance':
        return ProxemicZone.SOCIAL;
      case 'stranger':
        return ProxemicZone.SOCIAL;
      default:
        return ProxemicZone.SOCIAL;
    }
  }

  /**
   * Calculates if someone is invading personal space
   *
   * @param distance - Actual distance in meters
   * @param culture - Culture context
   * @param relationship - Relationship type
   * @returns Whether personal space is being invaded
   */
  isInvadingPersonalSpace(
    distance: number,
    culture: Culture,
    relationship: ProxemicRelationship
  ): boolean {
    const acceptable = this.getAcceptableDistance(culture, relationship);
    const threshold = acceptable * 0.7;

    return distance < threshold;
  }

  /**
   * Gets zone configuration
   *
   * @param zone - Proxemic zone
   * @returns Zone configuration
   */
  getZoneConfig(zone: ProxemicZone): ZoneConfig | undefined {
    return this.baseZones.get(zone);
  }

  /**
   * Gets all zones
   */
  getAllZones(): Map<ProxemicZone, ZoneConfig> {
    return new Map(this.baseZones);
  }

  /**
   * Adjusts distance for cultural context
   *
   * @param baseDistance - Base distance
   * @param fromCulture - Source culture
   * @param toCulture - Target culture
   * @returns Adjusted distance
   */
  adjustDistanceForCultures(
    baseDistance: number,
    fromCulture: Culture,
    toCulture: Culture
  ): number {
    const fromModifier = this.getCulturalModifier(fromCulture);
    const toModifier = this.getCulturalModifier(toCulture);

    const avgModifier = (fromModifier + toModifier) / 2;

    return baseDistance * avgModifier;
  }

  /**
   * Calculates territorial behavior strength
   *
   * @param culture - Culture context
   * @returns Territorial strength [0-1]
   */
  getTerritorialStrength(culture: Culture): number {
    let strength = 0.5;

    strength += culture.individualismScore * 0.3;

    strength += culture.uncertaintyAvoidanceScore * 0.2;

    return Math.max(0, Math.min(1, strength));
  }
}
