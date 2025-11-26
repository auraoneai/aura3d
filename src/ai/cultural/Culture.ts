/**
 * Culture definition with Hofstede's cultural dimensions
 *
 * Based on Geert Hofstede's cultural dimensions theory which identifies
 * six key dimensions that distinguish cultures.
 */
export interface Culture {
  /** Unique culture identifier */
  id: string;

  /** Display name */
  name: string;

  /**
   * Individualism vs Collectivism [0-1]
   * 0 = Collectivist (group harmony, interdependence)
   * 1 = Individualist (personal freedom, independence)
   */
  individualismScore: number;

  /**
   * Power Distance [0-1]
   * 0 = Low power distance (equality, flat hierarchies)
   * 1 = High power distance (hierarchy, respect for authority)
   */
  powerDistanceScore: number;

  /**
   * Uncertainty Avoidance [0-1]
   * 0 = Low (comfort with ambiguity, risk-taking)
   * 1 = High (preference for rules, structure, certainty)
   */
  uncertaintyAvoidanceScore: number;

  /**
   * Masculinity vs Femininity [0-1]
   * 0 = Feminine (cooperation, quality of life, modesty)
   * 1 = Masculine (competition, achievement, assertiveness)
   */
  masculinityScore: number;

  /**
   * Long-term vs Short-term Orientation [0-1]
   * 0 = Short-term (tradition, quick results, face-saving)
   * 1 = Long-term (perseverance, thrift, future planning)
   */
  longTermOrientationScore: number;

  /**
   * Indulgence vs Restraint [0-1]
   * 0 = Restraint (strict social norms, suppression of gratification)
   * 1 = Indulgence (free gratification, leisure, having fun)
   */
  indulgenceScore: number;

  /**
   * Communication style
   */
  communicationStyle: 'direct' | 'indirect' | 'balanced';

  /**
   * Time orientation
   */
  timeOrientation: 'monochronic' | 'polychronic' | 'balanced';

  /**
   * Conflict resolution preference
   */
  conflictResolutionStyle: 'confrontational' | 'avoidant' | 'collaborative';

  /**
   * Greeting style
   */
  greetingStyle: 'formal' | 'informal' | 'contextual';

  /**
   * Personal space preference
   */
  personalSpacePreference: 'close' | 'medium' | 'distant';

  /**
   * Eye contact norm
   */
  eyeContactNorm: 'direct' | 'moderate' | 'minimal';

  /**
   * Optional description
   */
  description?: string;

  /**
   * Custom cultural traits
   */
  customTraits?: Map<string, number>;
}

/**
 * Cultural trait definition
 */
export interface CulturalTrait {
  /** Trait ID */
  id: string;
  /** Trait name */
  name: string;
  /** Trait value [0-1] */
  value: number;
  /** Trait description */
  description?: string;
}

/**
 * Cultural dimension weights for decision making
 */
export interface CulturalDimensionWeights {
  individualism: number;
  powerDistance: number;
  uncertaintyAvoidance: number;
  masculinity: number;
  longTermOrientation: number;
  indulgence: number;
}

/**
 * Culture utility functions
 */
export class CultureUtils {
  /**
   * Calculates cultural distance between two cultures using Euclidean distance
   *
   * @param culture1 - First culture
   * @param culture2 - Second culture
   * @returns Distance value [0-1], 0 = identical, 1 = maximally different
   */
  static calculateCulturalDistance(culture1: Culture, culture2: Culture): number {
    const dimensions = [
      Math.pow(culture1.individualismScore - culture2.individualismScore, 2),
      Math.pow(culture1.powerDistanceScore - culture2.powerDistanceScore, 2),
      Math.pow(culture1.uncertaintyAvoidanceScore - culture2.uncertaintyAvoidanceScore, 2),
      Math.pow(culture1.masculinityScore - culture2.masculinityScore, 2),
      Math.pow(culture1.longTermOrientationScore - culture2.longTermOrientationScore, 2),
      Math.pow(culture1.indulgenceScore - culture2.indulgenceScore, 2)
    ];

    const sumSquares = dimensions.reduce((a, b) => a + b, 0);
    const distance = Math.sqrt(sumSquares / dimensions.length);

    return Math.min(1, distance);
  }

  /**
   * Calculates cultural similarity (inverse of distance)
   *
   * @param culture1 - First culture
   * @param culture2 - Second culture
   * @returns Similarity value [0-1], 1 = identical, 0 = maximally different
   */
  static calculateCulturalSimilarity(culture1: Culture, culture2: Culture): number {
    return 1 - this.calculateCulturalDistance(culture1, culture2);
  }

  /**
   * Blends two cultures based on a weight
   *
   * @param culture1 - First culture
   * @param culture2 - Second culture
   * @param weight - Blend weight [0-1], 0 = all culture1, 1 = all culture2
   * @returns Blended culture
   */
  static blendCultures(culture1: Culture, culture2: Culture, weight: number): Culture {
    const w = Math.max(0, Math.min(1, weight));
    const invW = 1 - w;

    return {
      id: `${culture1.id}_${culture2.id}_blend`,
      name: `${culture1.name}-${culture2.name} Blend`,
      individualismScore: culture1.individualismScore * invW + culture2.individualismScore * w,
      powerDistanceScore: culture1.powerDistanceScore * invW + culture2.powerDistanceScore * w,
      uncertaintyAvoidanceScore: culture1.uncertaintyAvoidanceScore * invW + culture2.uncertaintyAvoidanceScore * w,
      masculinityScore: culture1.masculinityScore * invW + culture2.masculinityScore * w,
      longTermOrientationScore: culture1.longTermOrientationScore * invW + culture2.longTermOrientationScore * w,
      indulgenceScore: culture1.indulgenceScore * invW + culture2.indulgenceScore * w,
      communicationStyle: w > 0.5 ? culture2.communicationStyle : culture1.communicationStyle,
      timeOrientation: w > 0.5 ? culture2.timeOrientation : culture1.timeOrientation,
      conflictResolutionStyle: w > 0.5 ? culture2.conflictResolutionStyle : culture1.conflictResolutionStyle,
      greetingStyle: w > 0.5 ? culture2.greetingStyle : culture1.greetingStyle,
      personalSpacePreference: w > 0.5 ? culture2.personalSpacePreference : culture1.personalSpacePreference,
      eyeContactNorm: w > 0.5 ? culture2.eyeContactNorm : culture1.eyeContactNorm
    };
  }

  /**
   * Validates culture dimension values
   *
   * @param culture - Culture to validate
   * @returns Validation result
   */
  static validateCulture(culture: Culture): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const validateScore = (score: number, name: string) => {
      if (score < 0 || score > 1) {
        errors.push(`${name} must be between 0 and 1, got ${score}`);
      }
    };

    validateScore(culture.individualismScore, 'individualismScore');
    validateScore(culture.powerDistanceScore, 'powerDistanceScore');
    validateScore(culture.uncertaintyAvoidanceScore, 'uncertaintyAvoidanceScore');
    validateScore(culture.masculinityScore, 'masculinityScore');
    validateScore(culture.longTermOrientationScore, 'longTermOrientationScore');
    validateScore(culture.indulgenceScore, 'indulgenceScore');

    if (!culture.id || culture.id.trim().length === 0) {
      errors.push('Culture ID is required');
    }

    if (!culture.name || culture.name.trim().length === 0) {
      errors.push('Culture name is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Creates a culture from dimension scores
   *
   * @param id - Culture ID
   * @param name - Culture name
   * @param scores - Dimension scores
   * @returns Culture object
   */
  static createCulture(
    id: string,
    name: string,
    scores: {
      individualism: number;
      powerDistance: number;
      uncertaintyAvoidance: number;
      masculinity: number;
      longTermOrientation: number;
      indulgence: number;
    }
  ): Culture {
    const communicationStyle = scores.individualism > 0.6 ? 'direct' :
      scores.individualism < 0.4 ? 'indirect' : 'balanced';

    const personalSpace = scores.individualism > 0.6 ? 'distant' :
      scores.individualism < 0.4 ? 'close' : 'medium';

    const greetingStyle = scores.powerDistance > 0.6 ? 'formal' :
      scores.powerDistance < 0.4 ? 'informal' : 'contextual';

    const timeOrientation = scores.longTermOrientation > 0.6 ? 'monochronic' :
      scores.longTermOrientation < 0.4 ? 'polychronic' : 'balanced';

    const conflictStyle = scores.masculinity > 0.6 ? 'confrontational' :
      scores.masculinity < 0.4 ? 'avoidant' : 'collaborative';

    const eyeContact = scores.powerDistance < 0.4 ? 'direct' :
      scores.powerDistance > 0.6 ? 'minimal' : 'moderate';

    return {
      id,
      name,
      individualismScore: scores.individualism,
      powerDistanceScore: scores.powerDistance,
      uncertaintyAvoidanceScore: scores.uncertaintyAvoidance,
      masculinityScore: scores.masculinity,
      longTermOrientationScore: scores.longTermOrientation,
      indulgenceScore: scores.indulgence,
      communicationStyle,
      timeOrientation,
      conflictResolutionStyle: conflictStyle,
      greetingStyle,
      personalSpacePreference: personalSpace,
      eyeContactNorm: eyeContact
    };
  }
}
