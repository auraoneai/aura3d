import { Logger } from '../../core/Logger';
import { Culture } from './Culture';

/**
 * Social norm definition
 */
export interface SocialNorm {
  /** Norm ID */
  id: string;
  /** Norm name */
  name: string;
  /** Norm description */
  description: string;
  /** Interaction types this norm applies to */
  applicableInteractions: string[];
  /** Strength of the norm [0-1] */
  strength: number;
  /** Validation function */
  validate: (context: any) => boolean;
  /** Violation severity [0-1] */
  violationSeverity: number;
}

/**
 * Norm violation
 */
export interface NormViolation {
  /** Violated norm */
  norm: SocialNorm;
  /** Violation description */
  description: string;
  /** Severity [0-1] */
  severity: number;
  /** Context of violation */
  context: any;
}

/**
 * Social Norm System
 *
 * Manages and enforces cultural social norms, detecting violations
 * and providing guidance for culturally appropriate behavior.
 *
 * @example
 * ```typescript
 * const normSystem = new SocialNormSystem();
 *
 * const validation = normSystem.validateInteraction(
 *   japaneseCulture,
 *   'greeting',
 *   { formality: 'casual', context: 'business' }
 * );
 *
 * if (!validation.valid) {
 *   console.log('Violations:', validation.violations);
 * }
 * ```
 */
export class SocialNormSystem {
  private logger: Logger;
  private norms: Map<string, SocialNorm[]>;

  /**
   * Creates a new social norm system
   */
  constructor() {
    this.logger = new Logger('SocialNormSystem');
    this.norms = new Map();
    this.initializeDefaultNorms();
  }

  /**
   * Initializes default social norms
   */
  private initializeDefaultNorms(): void {
    this.addNorm('default', {
      id: 'respect_personal_space',
      name: 'Respect Personal Space',
      description: 'Maintain appropriate distance during interactions',
      applicableInteractions: ['greeting', 'conversation', 'passing'],
      strength: 0.8,
      violationSeverity: 0.6,
      validate: (context) => {
        if (!context.distance) return true;
        return context.distance >= (context.minimumDistance || 0.5);
      }
    });

    this.addNorm('default', {
      id: 'appropriate_eye_contact',
      name: 'Appropriate Eye Contact',
      description: 'Maintain culturally appropriate eye contact',
      applicableInteractions: ['conversation', 'greeting'],
      strength: 0.7,
      violationSeverity: 0.4,
      validate: (context) => {
        if (!context.eyeContact) return true;
        const expected = context.expectedEyeContact || 'moderate';
        return context.eyeContact === expected;
      }
    });

    this.addNorm('default', {
      id: 'formal_greeting_hierarchy',
      name: 'Respect Hierarchy in Greetings',
      description: 'Greet superiors with appropriate formality',
      applicableInteractions: ['greeting'],
      strength: 0.9,
      violationSeverity: 0.8,
      validate: (context) => {
        if (!context.hierarchy) return true;
        if (context.hierarchy === 'superior') {
          return context.formality === 'formal';
        }
        return true;
      }
    });

    this.addNorm('default', {
      id: 'indirect_refusal',
      name: 'Indirect Refusal',
      description: 'Refuse requests indirectly to save face',
      applicableInteractions: ['request', 'invitation'],
      strength: 0.6,
      violationSeverity: 0.5,
      validate: (context) => {
        if (!context.isRefusal) return true;
        if (context.communicationStyle === 'indirect') {
          return !context.isDirect;
        }
        return true;
      }
    });

    this.addNorm('default', {
      id: 'gift_reciprocity',
      name: 'Gift Reciprocity',
      description: 'Reciprocate gifts appropriately',
      applicableInteractions: ['gift_giving'],
      strength: 0.7,
      violationSeverity: 0.6,
      validate: (context) => {
        if (!context.isGift) return true;
        return context.hasReciprocated !== false;
      }
    });

    this.logger.info('Default social norms initialized');
  }

  /**
   * Adds a norm to a culture
   *
   * @param cultureId - Culture ID
   * @param norm - Social norm
   */
  addNorm(cultureId: string, norm: SocialNorm): void {
    if (!this.norms.has(cultureId)) {
      this.norms.set(cultureId, []);
    }
    this.norms.get(cultureId)!.push(norm);
  }

  /**
   * Removes a norm from a culture
   *
   * @param cultureId - Culture ID
   * @param normId - Norm ID
   */
  removeNorm(cultureId: string, normId: string): void {
    const cultureNorms = this.norms.get(cultureId);
    if (cultureNorms) {
      const index = cultureNorms.findIndex(n => n.id === normId);
      if (index !== -1) {
        cultureNorms.splice(index, 1);
      }
    }
  }

  /**
   * Gets all norms for a culture
   *
   * @param cultureId - Culture ID
   * @returns Array of social norms
   */
  getNorms(cultureId: string): SocialNorm[] {
    const cultureNorms = this.norms.get(cultureId) || [];
    const defaultNorms = this.norms.get('default') || [];
    return [...cultureNorms, ...defaultNorms];
  }

  /**
   * Validates an interaction against social norms
   *
   * @param culture - Culture context
   * @param interactionType - Type of interaction
   * @param context - Interaction context
   * @returns Validation result with violations
   */
  validateInteraction(
    culture: Culture,
    interactionType: string,
    context: any = {}
  ): { valid: boolean; violations: string[] } {
    const norms = this.getNorms(culture.id);
    const applicableNorms = norms.filter(norm =>
      norm.applicableInteractions.includes(interactionType)
    );

    const violations: string[] = [];

    applicableNorms.forEach(norm => {
      const enhancedContext = this.enhanceContext(context, culture);

      if (!norm.validate(enhancedContext)) {
        const violation = `${norm.name}: ${norm.description}`;
        violations.push(violation);
        this.logger.debug(`Norm violation detected: ${violation}`);
      }
    });

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Enhances context with cultural information
   */
  private enhanceContext(context: any, culture: Culture): any {
    return {
      ...context,
      culture,
      expectedEyeContact: culture.eyeContactNorm,
      communicationStyle: culture.communicationStyle,
      minimumDistance: this.getMinimumDistance(culture),
      powerDistance: culture.powerDistanceScore
    };
  }

  /**
   * Gets minimum acceptable distance based on culture
   */
  private getMinimumDistance(culture: Culture): number {
    switch (culture.personalSpacePreference) {
      case 'close':
        return 0.3;
      case 'medium':
        return 0.6;
      case 'distant':
        return 1.2;
      default:
        return 0.6;
    }
  }

  /**
   * Detects violations in an interaction
   *
   * @param culture - Culture context
   * @param interactionType - Type of interaction
   * @param context - Interaction context
   * @returns Array of norm violations
   */
  detectViolations(
    culture: Culture,
    interactionType: string,
    context: any = {}
  ): NormViolation[] {
    const norms = this.getNorms(culture.id);
    const applicableNorms = norms.filter(norm =>
      norm.applicableInteractions.includes(interactionType)
    );

    const violations: NormViolation[] = [];
    const enhancedContext = this.enhanceContext(context, culture);

    applicableNorms.forEach(norm => {
      if (!norm.validate(enhancedContext)) {
        violations.push({
          norm,
          description: `Violated ${norm.name}: ${norm.description}`,
          severity: norm.violationSeverity * norm.strength,
          context: enhancedContext
        });
      }
    });

    return violations;
  }

  /**
   * Gets the severity of a behavior
   *
   * @param culture - Culture context
   * @param interactionType - Type of interaction
   * @param context - Interaction context
   * @returns Severity score [0-1], 0 = no violations, 1 = severe violations
   */
  getViolationSeverity(
    culture: Culture,
    interactionType: string,
    context: any = {}
  ): number {
    const violations = this.detectViolations(culture, interactionType, context);

    if (violations.length === 0) return 0;

    const totalSeverity = violations.reduce((sum, v) => sum + v.severity, 0);
    return Math.min(1, totalSeverity / violations.length);
  }

  /**
   * Suggests corrections for norm violations
   *
   * @param violations - Detected violations
   * @returns Array of suggestions
   */
  suggestCorrections(violations: NormViolation[]): string[] {
    return violations.map(violation => {
      const norm = violation.norm;
      return `To follow "${norm.name}": ${norm.description}`;
    });
  }

  /**
   * Checks if an interaction is culturally appropriate
   *
   * @param culture - Culture context
   * @param interactionType - Type of interaction
   * @param context - Interaction context
   * @returns Whether the interaction is appropriate
   */
  isAppropriate(
    culture: Culture,
    interactionType: string,
    context: any = {}
  ): boolean {
    const validation = this.validateInteraction(culture, interactionType, context);
    return validation.valid;
  }

  /**
   * Gets norm strength for a specific interaction
   *
   * @param culture - Culture context
   * @param interactionType - Type of interaction
   * @returns Average norm strength [0-1]
   */
  getNormStrength(culture: Culture, interactionType: string): number {
    const norms = this.getNorms(culture.id);
    const applicableNorms = norms.filter(norm =>
      norm.applicableInteractions.includes(interactionType)
    );

    if (applicableNorms.length === 0) return 0;

    const totalStrength = applicableNorms.reduce((sum, norm) => sum + norm.strength, 0);
    return totalStrength / applicableNorms.length;
  }
}
