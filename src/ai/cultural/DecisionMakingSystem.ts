import { Logger } from '../../core/Logger';
import { Culture } from './Culture';

/**
 * Decision context
 */
export interface DecisionContext {
  /** Type of decision */
  type?: 'individual' | 'group' | 'hierarchical';
  /** Time pressure */
  urgency?: 'low' | 'medium' | 'high';
  /** Risk level */
  risk?: 'low' | 'medium' | 'high';
  /** Stakeholders involved */
  stakeholders?: string[];
  /** Available information completeness */
  informationCompleteness?: number;
}

/**
 * Decision option with scoring
 */
export interface DecisionOption<T = any> {
  /** Option data */
  option: T;
  /** Option scores */
  scores: {
    /** Individual benefit */
    individualBenefit?: number;
    /** Group benefit */
    groupBenefit?: number;
    /** Risk level */
    risk?: number;
    /** Long-term value */
    longTermValue?: number;
    /** Short-term value */
    shortTermValue?: number;
    /** Innovation/novelty */
    innovation?: number;
    /** Tradition/stability */
    tradition?: number;
  };
}

/**
 * Decision Making System
 *
 * Provides culturally-aware decision making that considers cultural values,
 * risk tolerance, time orientation, and group vs individual priorities.
 *
 * @example
 * ```typescript
 * const decisionSystem = new DecisionMakingSystem();
 *
 * const options = [
 *   { option: 'A', scores: { individualBenefit: 0.8, risk: 0.6 } },
 *   { option: 'B', scores: { groupBenefit: 0.9, risk: 0.2 } }
 * ];
 *
 * const choice = decisionSystem.makeDecision(
 *   japaneseCulture,
 *   options,
 *   { type: 'group', risk: 'high' }
 * );
 * ```
 */
export class DecisionMakingSystem {
  private logger: Logger;

  /**
   * Creates a new decision making system
   */
  constructor() {
    this.logger = new Logger('DecisionMakingSystem');
  }

  /**
   * Makes a culturally-aware decision from options
   *
   * @param culture - Decision maker's culture
   * @param options - Available options with scores
   * @param context - Decision context
   * @returns Selected option
   */
  makeDecision<T>(
    culture: Culture,
    options: T[] | DecisionOption<T>[],
    context: DecisionContext = {}
  ): T {
    if (options.length === 0) {
      throw new Error('No options provided for decision making');
    }

    const scoredOptions = this.ensureScored(options);

    const weights = this.calculateCulturalWeights(culture, context);

    const evaluatedOptions = scoredOptions.map(option => ({
      option: option.option,
      totalScore: this.evaluateOption(option, weights, culture, context)
    }));

    evaluatedOptions.sort((a, b) => b.totalScore - a.totalScore);

    const topScore = evaluatedOptions[0].totalScore;
    const threshold = topScore * 0.95;
    const topOptions = evaluatedOptions.filter(opt => opt.totalScore >= threshold);

    let selectedOption = topOptions[0];

    if (topOptions.length > 1) {
      if (culture.uncertaintyAvoidanceScore > 0.6) {
        selectedOption = topOptions.reduce((prev, curr) =>
          this.getRiskScore(prev.option) < this.getRiskScore(curr.option) ? prev : curr
        );
      } else if (culture.longTermOrientationScore > 0.6) {
        selectedOption = topOptions.reduce((prev, curr) =>
          this.getLongTermScore(prev.option) > this.getLongTermScore(curr.option) ? prev : curr
        );
      } else {
        selectedOption = topOptions[Math.floor(Math.random() * topOptions.length)];
      }
    }

    this.logger.debug(`Decision made: option with score ${selectedOption.totalScore.toFixed(2)}`);
    return selectedOption.option;
  }

  /**
   * Ensures options have scores
   */
  private ensureScored<T>(options: T[] | DecisionOption<T>[]): DecisionOption<T>[] {
    return options.map(opt => {
      if (this.isDecisionOption(opt)) {
        return opt;
      }
      return {
        option: opt,
        scores: {
          individualBenefit: Math.random(),
          groupBenefit: Math.random(),
          risk: Math.random(),
          longTermValue: Math.random(),
          shortTermValue: Math.random(),
          innovation: Math.random(),
          tradition: Math.random()
        }
      };
    });
  }

  /**
   * Type guard for DecisionOption
   */
  private isDecisionOption<T>(obj: any): obj is DecisionOption<T> {
    return obj && typeof obj === 'object' && 'option' in obj && 'scores' in obj;
  }

  /**
   * Calculates cultural weights for decision criteria
   */
  private calculateCulturalWeights(
    culture: Culture,
    context: DecisionContext
  ): Map<string, number> {
    const weights = new Map<string, number>();

    weights.set('individualBenefit', culture.individualismScore);
    weights.set('groupBenefit', 1 - culture.individualismScore);

    const riskTolerance = 1 - culture.uncertaintyAvoidanceScore;
    weights.set('risk', riskTolerance);
    weights.set('safety', culture.uncertaintyAvoidanceScore);

    weights.set('longTermValue', culture.longTermOrientationScore);
    weights.set('shortTermValue', 1 - culture.longTermOrientationScore);

    weights.set('innovation', riskTolerance * 0.5 + (1 - culture.powerDistanceScore) * 0.5);
    weights.set('tradition', culture.uncertaintyAvoidanceScore * 0.5 + culture.longTermOrientationScore * 0.5);

    weights.set('competition', culture.masculinityScore);
    weights.set('cooperation', 1 - culture.masculinityScore);

    if (context.type === 'group') {
      weights.set('groupBenefit', weights.get('groupBenefit')! * 1.5);
      weights.set('individualBenefit', weights.get('individualBenefit')! * 0.7);
    }

    if (context.urgency === 'high') {
      weights.set('shortTermValue', weights.get('shortTermValue')! * 1.3);
    }

    if (context.risk === 'high') {
      weights.set('safety', weights.get('safety')! * 1.4);
    }

    return weights;
  }

  /**
   * Evaluates an option based on cultural weights
   */
  private evaluateOption<T>(
    option: DecisionOption<T>,
    weights: Map<string, number>,
    culture: Culture,
    context: DecisionContext
  ): number {
    let totalScore = 0;
    let totalWeight = 0;

    const scores = option.scores;

    if (scores.individualBenefit !== undefined) {
      const weight = weights.get('individualBenefit') || 0;
      totalScore += scores.individualBenefit * weight;
      totalWeight += weight;
    }

    if (scores.groupBenefit !== undefined) {
      const weight = weights.get('groupBenefit') || 0;
      totalScore += scores.groupBenefit * weight;
      totalWeight += weight;
    }

    if (scores.risk !== undefined) {
      const weight = weights.get('risk') || 0;
      const riskScore = 1 - scores.risk;
      const safetyWeight = weights.get('safety') || 0;
      totalScore += scores.risk * weight + riskScore * safetyWeight;
      totalWeight += weight + safetyWeight;
    }

    if (scores.longTermValue !== undefined) {
      const weight = weights.get('longTermValue') || 0;
      totalScore += scores.longTermValue * weight;
      totalWeight += weight;
    }

    if (scores.shortTermValue !== undefined) {
      const weight = weights.get('shortTermValue') || 0;
      totalScore += scores.shortTermValue * weight;
      totalWeight += weight;
    }

    if (scores.innovation !== undefined) {
      const weight = weights.get('innovation') || 0;
      totalScore += scores.innovation * weight;
      totalWeight += weight;
    }

    if (scores.tradition !== undefined) {
      const weight = weights.get('tradition') || 0;
      totalScore += scores.tradition * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Gets risk score from option
   */
  private getRiskScore(option: any): number {
    if (this.isDecisionOption(option)) {
      return option.scores.risk || 0.5;
    }
    return 0.5;
  }

  /**
   * Gets long-term score from option
   */
  private getLongTermScore(option: any): number {
    if (this.isDecisionOption(option)) {
      return option.scores.longTermValue || 0.5;
    }
    return 0.5;
  }

  /**
   * Determines if decision should be made by group or individual
   *
   * @param culture - Culture
   * @param context - Decision context
   * @returns Preferred decision maker type
   */
  getPreferredDecisionMaker(
    culture: Culture,
    context: DecisionContext = {}
  ): 'individual' | 'group' | 'hierarchical' {
    if (context.type) {
      return context.type;
    }

    if (culture.powerDistanceScore > 0.7) {
      return 'hierarchical';
    }

    if (culture.individualismScore < 0.4) {
      return 'group';
    }

    return 'individual';
  }

  /**
   * Calculates decision speed preference
   *
   * @param culture - Culture
   * @param context - Decision context
   * @returns Speed preference [0-1], 0 = slow/deliberate, 1 = fast/quick
   */
  getDecisionSpeed(
    culture: Culture,
    context: DecisionContext = {}
  ): number {
    let speed = 0.5;

    speed += (1 - culture.uncertaintyAvoidanceScore) * 0.3;

    speed += culture.individualismScore * 0.2;

    if (culture.timeOrientation === 'monochronic') {
      speed += 0.2;
    } else if (culture.timeOrientation === 'polychronic') {
      speed -= 0.2;
    }

    if (context.urgency === 'high') {
      speed += 0.3;
    } else if (context.urgency === 'low') {
      speed -= 0.2;
    }

    return Math.max(0, Math.min(1, speed));
  }

  /**
   * Determines if consensus is required
   *
   * @param culture - Culture
   * @param context - Decision context
   * @returns Whether consensus is required
   */
  requiresConsensus(
    culture: Culture,
    context: DecisionContext = {}
  ): boolean {
    if (culture.individualismScore < 0.3) {
      return true;
    }

    if (context.type === 'group' && culture.individualismScore < 0.5) {
      return true;
    }

    if (culture.powerDistanceScore < 0.3 && context.stakeholders && context.stakeholders.length > 2) {
      return true;
    }

    return false;
  }

  /**
   * Gets acceptable risk level for culture
   *
   * @param culture - Culture
   * @param context - Decision context
   * @returns Acceptable risk level [0-1]
   */
  getAcceptableRiskLevel(
    culture: Culture,
    context: DecisionContext = {}
  ): number {
    let acceptableRisk = 1 - culture.uncertaintyAvoidanceScore;

    acceptableRisk *= (0.7 + culture.individualismScore * 0.3);

    if (context.type === 'group') {
      acceptableRisk *= 0.8;
    }

    return Math.max(0, Math.min(1, acceptableRisk));
  }
}
