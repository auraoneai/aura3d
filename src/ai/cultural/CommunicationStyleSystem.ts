import { Logger } from '../../core/Logger';
import { Culture } from './Culture';

/**
 * Communication context
 */
export interface CommunicationContext {
  /** Formality level */
  formality?: 'formal' | 'informal' | 'neutral';
  /** Communication setting */
  setting?: 'public' | 'private' | 'professional' | 'casual';
  /** Relationship to audience */
  relationship?: 'stranger' | 'acquaintance' | 'friend' | 'family' | 'superior' | 'subordinate';
  /** Emotional context */
  emotion?: 'positive' | 'negative' | 'neutral';
  /** Topic sensitivity */
  sensitivity?: 'high' | 'medium' | 'low';
}

/**
 * Communication Style System
 *
 * Manages cultural communication patterns including directness, formality,
 * context-dependence, and linguistic conventions.
 *
 * @example
 * ```typescript
 * const commSystem = new CommunicationStyleSystem();
 *
 * const message = commSystem.formatMessage(
 *   japaneseCulture,
 *   'request',
 *   westernCulture,
 *   'Could you help me?'
 * );
 *
 * const style = commSystem.getPreferredStyle(culture, context);
 * ```
 */
export class CommunicationStyleSystem {
  private logger: Logger;

  /**
   * Creates a new communication style system
   */
  constructor() {
    this.logger = new Logger('CommunicationStyleSystem');
  }

  /**
   * Formats a message according to cultural communication style
   *
   * @param speakerCulture - Speaker's culture
   * @param messageType - Type of message
   * @param audienceCulture - Audience's culture
   * @param content - Message content
   * @param context - Communication context
   * @returns Formatted message
   */
  formatMessage(
    speakerCulture: Culture,
    messageType: string,
    audienceCulture: Culture,
    content: string,
    context: CommunicationContext = {}
  ): string {
    let formattedMessage = content;

    formattedMessage = this.adjustDirectness(
      formattedMessage,
      speakerCulture,
      audienceCulture,
      messageType
    );

    formattedMessage = this.adjustFormality(
      formattedMessage,
      speakerCulture,
      audienceCulture,
      context
    );

    formattedMessage = this.addCulturalMarkers(
      formattedMessage,
      speakerCulture,
      messageType,
      context
    );

    return formattedMessage;
  }

  /**
   * Adjusts message directness based on cultures
   */
  private adjustDirectness(
    message: string,
    speakerCulture: Culture,
    audienceCulture: Culture,
    messageType: string
  ): string {
    const shouldBeIndirect = this.shouldUseIndirectCommunication(
      speakerCulture,
      audienceCulture,
      messageType
    );

    if (shouldBeIndirect && messageType === 'request') {
      if (!message.toLowerCase().includes('could') &&
          !message.toLowerCase().includes('would') &&
          !message.toLowerCase().includes('might')) {
        return `I was wondering if you might ${message.toLowerCase()}`;
      }
    }

    if (shouldBeIndirect && messageType === 'refusal') {
      if (message.toLowerCase().startsWith('no')) {
        return `I appreciate the offer, but it might be difficult at this time.`;
      }
    }

    if (!shouldBeIndirect && speakerCulture.communicationStyle === 'direct') {
      message = message.replace(/I was wondering if/gi, '');
      message = message.replace(/might you/gi, 'you should');
      message = message.replace(/could you possibly/gi, 'please');
    }

    return message.trim();
  }

  /**
   * Adjusts message formality
   */
  private adjustFormality(
    message: string,
    speakerCulture: Culture,
    audienceCulture: Culture,
    context: CommunicationContext
  ): string {
    const formalityLevel = this.determineFormalityLevel(
      speakerCulture,
      audienceCulture,
      context
    );

    if (formalityLevel === 'formal') {
      message = message.replace(/\bhey\b/gi, 'Hello');
      message = message.replace(/\byeah\b/gi, 'yes');
      message = message.replace(/\bnope\b/gi, 'no');
      message = message.replace(/\bgonna\b/gi, 'going to');
      message = message.replace(/\bwanna\b/gi, 'want to');
    }

    if (formalityLevel === 'informal' && !message.endsWith('!')) {
      if (Math.random() > 0.7) {
        message = message.replace(/\.$/, '!');
      }
    }

    return message;
  }

  /**
   * Adds cultural communication markers
   */
  private addCulturalMarkers(
    message: string,
    culture: Culture,
    messageType: string,
    context: CommunicationContext
  ): string {
    if (culture.powerDistanceScore > 0.6 && context.relationship === 'superior') {
      if (!message.toLowerCase().startsWith('please')) {
        message = `Please, ${message.charAt(0).toLowerCase()}${message.slice(1)}`;
      }
    }

    if (culture.uncertaintyAvoidanceScore > 0.7) {
      if (messageType === 'proposal' && !message.includes('plan')) {
        message = `As planned, ${message.charAt(0).toLowerCase()}${message.slice(1)}`;
      }
    }

    if (culture.individualismScore < 0.4 && messageType === 'decision') {
      if (!message.includes('we') && !message.includes('our')) {
        message = message.replace(/\bI\b/g, 'we');
        message = message.replace(/\bmy\b/g, 'our');
      }
    }

    return message;
  }

  /**
   * Determines if indirect communication should be used
   */
  private shouldUseIndirectCommunication(
    speakerCulture: Culture,
    audienceCulture: Culture,
    messageType: string
  ): boolean {
    if (messageType === 'refusal' || messageType === 'criticism') {
      return speakerCulture.communicationStyle === 'indirect' ||
             audienceCulture.communicationStyle === 'indirect';
    }

    if (speakerCulture.powerDistanceScore > 0.6) {
      return true;
    }

    return speakerCulture.communicationStyle === 'indirect';
  }

  /**
   * Determines appropriate formality level
   */
  private determineFormalityLevel(
    speakerCulture: Culture,
    audienceCulture: Culture,
    context: CommunicationContext
  ): 'formal' | 'informal' | 'neutral' {
    if (context.formality) {
      return context.formality;
    }

    if (context.relationship === 'superior') {
      return 'formal';
    }

    if (context.setting === 'professional') {
      return 'formal';
    }

    if (speakerCulture.powerDistanceScore > 0.6 ||
        audienceCulture.powerDistanceScore > 0.6) {
      return 'formal';
    }

    if (context.relationship === 'friend' || context.relationship === 'family') {
      if (speakerCulture.indulgenceScore > 0.6) {
        return 'informal';
      }
    }

    return 'neutral';
  }

  /**
   * Gets preferred communication style for a culture and context
   *
   * @param culture - Culture
   * @param context - Communication context
   * @returns Communication style description
   */
  getPreferredStyle(
    culture: Culture,
    context: CommunicationContext = {}
  ): {
    directness: 'direct' | 'indirect' | 'balanced';
    formality: 'formal' | 'informal' | 'neutral';
    verbosity: 'concise' | 'moderate' | 'elaborate';
    emotionExpression: 'reserved' | 'moderate' | 'expressive';
  } {
    const directness = culture.communicationStyle;

    let formality: 'formal' | 'informal' | 'neutral' = 'neutral';
    if (culture.powerDistanceScore > 0.6) {
      formality = 'formal';
    } else if (culture.powerDistanceScore < 0.4 && culture.indulgenceScore > 0.6) {
      formality = 'informal';
    }

    let verbosity: 'concise' | 'moderate' | 'elaborate' = 'moderate';
    if (culture.uncertaintyAvoidanceScore > 0.7) {
      verbosity = 'elaborate';
    } else if (culture.individualismScore > 0.7 && culture.timeOrientation === 'monochronic') {
      verbosity = 'concise';
    }

    let emotionExpression: 'reserved' | 'moderate' | 'expressive' = 'moderate';
    if (culture.masculinityScore > 0.6 || culture.uncertaintyAvoidanceScore > 0.7) {
      emotionExpression = 'reserved';
    } else if (culture.indulgenceScore > 0.6) {
      emotionExpression = 'expressive';
    }

    return {
      directness,
      formality,
      verbosity,
      emotionExpression
    };
  }

  /**
   * Translates message tone between cultures
   *
   * @param message - Original message
   * @param fromCulture - Source culture
   * @param toCulture - Target culture
   * @returns Translated message
   */
  translateTone(
    message: string,
    fromCulture: Culture,
    toCulture: Culture
  ): string {
    const fromStyle = this.getPreferredStyle(fromCulture);
    const toStyle = this.getPreferredStyle(toCulture);

    let translated = message;

    if (fromStyle.directness === 'direct' && toStyle.directness === 'indirect') {
      translated = `Perhaps ${translated.charAt(0).toLowerCase()}${translated.slice(1)}`;
    }

    if (fromStyle.formality === 'informal' && toStyle.formality === 'formal') {
      translated = this.adjustFormality(translated, fromCulture, toCulture, {
        formality: 'formal'
      });
    }

    if (fromStyle.verbosity === 'concise' && toStyle.verbosity === 'elaborate') {
      translated = `Allow me to explain: ${translated}`;
    }

    return translated;
  }

  /**
   * Determines if honorifics should be used
   *
   * @param culture - Culture
   * @param context - Communication context
   * @returns Whether to use honorifics
   */
  shouldUseHonorifics(
    culture: Culture,
    context: CommunicationContext
  ): boolean {
    if (culture.powerDistanceScore > 0.6) {
      return true;
    }

    if (context.relationship === 'superior') {
      return true;
    }

    if (context.formality === 'formal' && culture.powerDistanceScore > 0.4) {
      return true;
    }

    return false;
  }

  /**
   * Gets appropriate greeting for culture and context
   *
   * @param culture - Culture
   * @param context - Communication context
   * @returns Greeting string
   */
  getGreeting(
    culture: Culture,
    context: CommunicationContext = {}
  ): string {
    const formality = this.determineFormalityLevel(culture, culture, context);

    if (formality === 'formal') {
      if (culture.powerDistanceScore > 0.6) {
        return 'Good day. It is an honor to meet you.';
      }
      return 'Hello. Pleased to meet you.';
    }

    if (formality === 'informal') {
      if (culture.indulgenceScore > 0.6) {
        return 'Hey there! Great to see you!';
      }
      return 'Hi! Nice to see you.';
    }

    return 'Hello. Nice to meet you.';
  }

  /**
   * Gets appropriate farewell for culture and context
   *
   * @param culture - Culture
   * @param context - Communication context
   * @returns Farewell string
   */
  getFarewell(
    culture: Culture,
    context: CommunicationContext = {}
  ): string {
    const formality = this.determineFormalityLevel(culture, culture, context);

    if (formality === 'formal') {
      return 'Goodbye. It was a pleasure.';
    }

    if (formality === 'informal') {
      return 'See you later!';
    }

    return 'Goodbye. Take care.';
  }

  /**
   * Determines if silence is appropriate
   *
   * @param culture - Culture
   * @param context - Communication context
   * @returns Whether silence is culturally appropriate
   */
  isSilenceAppropriate(
    culture: Culture,
    context: CommunicationContext
  ): boolean {
    if (culture.communicationStyle === 'indirect') {
      return true;
    }

    if (context.emotion === 'negative' && culture.uncertaintyAvoidanceScore > 0.6) {
      return true;
    }

    if (culture.longTermOrientationScore > 0.7) {
      return true;
    }

    return false;
  }
}
