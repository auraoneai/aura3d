import { Logger } from '../../core/Logger';
import { Culture } from './Culture';

/**
 * Gesture definition
 */
export interface Gesture {
  /** Gesture ID */
  id: string;
  /** Gesture name */
  name: string;
  /** Gesture type */
  type: 'greeting' | 'agreement' | 'disagreement' | 'respect' | 'dismissal' | 'beckoning' | 'other';
  /** Gesture description */
  description: string;
  /** Cultural appropriateness [0-1] */
  appropriateness: number;
  /** Formality level */
  formality: 'formal' | 'informal' | 'neutral';
  /** Body parts involved */
  bodyParts: string[];
  /** Animation hint (for 3D implementation) */
  animationHint?: string;
}

/**
 * Gesture context
 */
export interface GestureContext {
  /** Situation type */
  situation?: 'greeting' | 'farewell' | 'agreement' | 'disagreement' | 'respect' | 'casual';
  /** Formality level */
  formality?: 'formal' | 'informal' | 'neutral';
  /** Relationship to other party */
  relationship?: 'stranger' | 'acquaintance' | 'friend' | 'family' | 'superior' | 'subordinate';
  /** Public or private setting */
  setting?: 'public' | 'private';
}

/**
 * Gesture System
 *
 * Manages culturally-appropriate gestures and body language including
 * greetings, expressions, and non-verbal communication.
 *
 * @example
 * ```typescript
 * const gestureSystem = new GestureSystem();
 *
 * const gesture = gestureSystem.getGesture(
 *   japaneseCulture,
 *   'greeting',
 *   { formality: 'formal', relationship: 'superior' }
 * );
 *
 * console.log(`Perform: ${gesture.description}`);
 * ```
 */
export class GestureSystem {
  private logger: Logger;
  private gestures: Map<string, Gesture[]>;

  /**
   * Creates a new gesture system
   */
  constructor() {
    this.logger = new Logger('GestureSystem');
    this.gestures = new Map();
    this.initializeDefaultGestures();
  }

  /**
   * Initializes default gesture library
   */
  private initializeDefaultGestures(): void {
    this.addGesture('default', {
      id: 'handshake',
      name: 'Handshake',
      type: 'greeting',
      description: 'Extend right hand for a firm handshake',
      appropriateness: 0.8,
      formality: 'neutral',
      bodyParts: ['right_hand'],
      animationHint: 'handshake_neutral'
    });

    this.addGesture('default', {
      id: 'nod',
      name: 'Nod',
      type: 'agreement',
      description: 'Nod head up and down',
      appropriateness: 0.9,
      formality: 'neutral',
      bodyParts: ['head'],
      animationHint: 'head_nod'
    });

    this.addGesture('default', {
      id: 'shake_head',
      name: 'Head Shake',
      type: 'disagreement',
      description: 'Shake head side to side',
      appropriateness: 0.7,
      formality: 'neutral',
      bodyParts: ['head'],
      animationHint: 'head_shake'
    });

    this.addGesture('default', {
      id: 'wave',
      name: 'Wave',
      type: 'greeting',
      description: 'Wave hand in friendly greeting',
      appropriateness: 0.7,
      formality: 'informal',
      bodyParts: ['hand'],
      animationHint: 'wave_casual'
    });

    this.addGesture('default', {
      id: 'slight_bow',
      name: 'Slight Bow',
      type: 'respect',
      description: 'Slight bow of the head',
      appropriateness: 0.8,
      formality: 'formal',
      bodyParts: ['head', 'upper_body'],
      animationHint: 'bow_slight'
    });

    this.addGesture('default', {
      id: 'thumbs_up',
      name: 'Thumbs Up',
      type: 'agreement',
      description: 'Raise thumb upward',
      appropriateness: 0.6,
      formality: 'informal',
      bodyParts: ['hand'],
      animationHint: 'thumbs_up'
    });

    this.addGesture('default', {
      id: 'eye_contact',
      name: 'Direct Eye Contact',
      type: 'respect',
      description: 'Maintain direct eye contact',
      appropriateness: 0.7,
      formality: 'neutral',
      bodyParts: ['eyes'],
      animationHint: 'eye_contact_direct'
    });

    this.addGesture('default', {
      id: 'avoid_eye_contact',
      name: 'Avoid Eye Contact',
      type: 'respect',
      description: 'Lower gaze respectfully',
      appropriateness: 0.6,
      formality: 'formal',
      bodyParts: ['eyes'],
      animationHint: 'eye_contact_avoid'
    });

    this.logger.info('Default gestures initialized');
  }

  /**
   * Adds a gesture to a culture
   *
   * @param cultureId - Culture ID
   * @param gesture - Gesture definition
   */
  addGesture(cultureId: string, gesture: Gesture): void {
    if (!this.gestures.has(cultureId)) {
      this.gestures.set(cultureId, []);
    }
    this.gestures.get(cultureId)!.push(gesture);
  }

  /**
   * Gets appropriate gesture for culture and context
   *
   * @param culture - Culture
   * @param gestureType - Type of gesture or situation
   * @param context - Gesture context
   * @returns Gesture description or undefined
   */
  getGesture(
    culture: Culture,
    gestureType: string,
    context: GestureContext = {}
  ): string | undefined {
    const gesture = this.selectGesture(culture, gestureType, context);
    return gesture?.description;
  }

  /**
   * Gets full gesture object for culture and context
   *
   * @param culture - Culture
   * @param gestureType - Type of gesture or situation
   * @param context - Gesture context
   * @returns Gesture object or undefined
   */
  getGestureObject(
    culture: Culture,
    gestureType: string,
    context: GestureContext = {}
  ): Gesture | undefined {
    return this.selectGesture(culture, gestureType, context);
  }

  /**
   * Selects appropriate gesture based on culture and context
   */
  private selectGesture(
    culture: Culture,
    gestureType: string,
    context: GestureContext
  ): Gesture | undefined {
    const cultureGestures = this.gestures.get(culture.id) || [];
    const defaultGestures = this.gestures.get('default') || [];
    const allGestures = [...cultureGestures, ...defaultGestures];

    let candidates = allGestures.filter(g =>
      g.type === gestureType || g.id === gestureType
    );

    if (candidates.length === 0) {
      candidates = allGestures.filter(g =>
        g.name.toLowerCase().includes(gestureType.toLowerCase())
      );
    }

    if (candidates.length === 0) {
      return undefined;
    }

    candidates = this.filterByFormality(candidates, context, culture);

    candidates = this.filterByRelationship(candidates, context, culture);

    candidates.sort((a, b) => {
      const scoreA = this.scoreGesture(a, culture, context);
      const scoreB = this.scoreGesture(b, culture, context);
      return scoreB - scoreA;
    });

    return candidates[0];
  }

  /**
   * Filters gestures by formality
   */
  private filterByFormality(
    gestures: Gesture[],
    context: GestureContext,
    culture: Culture
  ): Gesture[] {
    const requiredFormality = context.formality || this.inferFormality(culture, context);

    if (requiredFormality === 'neutral') {
      return gestures;
    }

    const filtered = gestures.filter(g => g.formality === requiredFormality);
    return filtered.length > 0 ? filtered : gestures;
  }

  /**
   * Infers formality from culture and context
   */
  private inferFormality(culture: Culture, context: GestureContext): 'formal' | 'informal' | 'neutral' {
    if (context.relationship === 'superior' || culture.powerDistanceScore > 0.7) {
      return 'formal';
    }

    if (context.relationship === 'friend' || context.relationship === 'family') {
      return 'informal';
    }

    return 'neutral';
  }

  /**
   * Filters gestures by relationship
   */
  private filterByRelationship(
    gestures: Gesture[],
    context: GestureContext,
    culture: Culture
  ): Gesture[] {
    if (context.relationship === 'superior' && culture.powerDistanceScore > 0.6) {
      return gestures.filter(g => g.formality !== 'informal');
    }

    return gestures;
  }

  /**
   * Scores a gesture for appropriateness
   */
  private scoreGesture(
    gesture: Gesture,
    culture: Culture,
    context: GestureContext
  ): number {
    let score = gesture.appropriateness;

    if (gesture.id === 'eye_contact' && culture.eyeContactNorm === 'direct') {
      score += 0.3;
    } else if (gesture.id === 'avoid_eye_contact' && culture.eyeContactNorm === 'minimal') {
      score += 0.3;
    }

    if (gesture.type === 'respect' && culture.powerDistanceScore > 0.6) {
      score += 0.2;
    }

    if (gesture.formality === 'formal' && culture.powerDistanceScore > 0.7) {
      score += 0.2;
    }

    if (gesture.formality === 'informal' && culture.indulgenceScore > 0.6) {
      score += 0.1;
    }

    return Math.min(1, score);
  }

  /**
   * Gets greeting gesture for culture
   *
   * @param culture - Culture
   * @param context - Gesture context
   * @returns Greeting gesture
   */
  getGreetingGesture(
    culture: Culture,
    context: GestureContext = {}
  ): Gesture | undefined {
    if (culture.greetingStyle === 'formal' || context.relationship === 'superior') {
      const bow = this.gestures.get(culture.id)?.find(g => g.id === 'bow');
      if (bow) return bow;

      const formalHandshake = this.gestures.get('default')?.find(g =>
        g.id === 'handshake' || g.id === 'slight_bow'
      );
      return formalHandshake;
    }

    if (culture.greetingStyle === 'informal') {
      return this.getGestureObject(culture, 'wave', context);
    }

    return this.getGestureObject(culture, 'handshake', context);
  }

  /**
   * Gets all gestures for a culture
   *
   * @param cultureId - Culture ID
   * @returns Array of gestures
   */
  getAllGestures(cultureId: string): Gesture[] {
    const cultureGestures = this.gestures.get(cultureId) || [];
    const defaultGestures = this.gestures.get('default') || [];
    return [...cultureGestures, ...defaultGestures];
  }

  /**
   * Checks if a gesture is appropriate for a culture
   *
   * @param gesture - Gesture to check
   * @param culture - Culture
   * @param context - Context
   * @returns Appropriateness score [0-1]
   */
  getGestureAppropriateness(
    gesture: Gesture,
    culture: Culture,
    context: GestureContext = {}
  ): number {
    return this.scoreGesture(gesture, culture, context);
  }

  /**
   * Gets gestures by type
   *
   * @param cultureId - Culture ID
   * @param type - Gesture type
   * @returns Matching gestures
   */
  getGesturesByType(
    cultureId: string,
    type: Gesture['type']
  ): Gesture[] {
    const allGestures = this.getAllGestures(cultureId);
    return allGestures.filter(g => g.type === type);
  }

  /**
   * Removes a gesture from a culture
   *
   * @param cultureId - Culture ID
   * @param gestureId - Gesture ID
   */
  removeGesture(cultureId: string, gestureId: string): void {
    const cultureGestures = this.gestures.get(cultureId);
    if (cultureGestures) {
      const index = cultureGestures.findIndex(g => g.id === gestureId);
      if (index !== -1) {
        cultureGestures.splice(index, 1);
      }
    }
  }
}
