import { Style } from './Style';
import { Logger } from '../../core/Logger';

const logger = Logger.create('StyleSheet');

/**
 * Selector types for style rules.
 */
export enum SelectorType {
  /**
   * Matches elements by ID.
   */
  Id = 'id',

  /**
   * Matches elements by class name.
   */
  Class = 'class',

  /**
   * Matches elements by tag/type.
   */
  Tag = 'tag',

  /**
   * Matches elements by state (e.g., :hover, :active).
   */
  State = 'state',

  /**
   * Universal selector (matches all).
   */
  Universal = 'universal',
}

/**
 * Represents a CSS-like selector for matching UI elements.
 */
export interface Selector {
  type: SelectorType;
  value: string;
}

/**
 * Represents a style rule with selector and style definition.
 */
export interface StyleRule {
  /**
   * Selector for matching elements.
   */
  selector: Selector;

  /**
   * Style to apply when selector matches.
   */
  style: Style;

  /**
   * Specificity value for cascade resolution (higher = more specific).
   */
  specificity: number;
}

/**
 * CSS-like style sheet system for managing style rules.
 * Supports rule matching, cascade resolution, and style composition.
 */
export class StyleSheet {
  private rules: StyleRule[] = [];
  private name: string;

  /**
   * Creates a new StyleSheet instance.
   *
   * @param name - Stylesheet name for debugging
   */
  constructor(name: string = 'default') {
    this.name = name;
  }

  /**
   * Adds a style rule to the stylesheet.
   *
   * @param selector - Selector for matching elements
   * @param style - Style to apply
   * @returns This stylesheet for chaining
   */
  addRule(selector: Selector, style: Style): this {
    const specificity = this.calculateSpecificity(selector);
    this.rules.push({ selector, style, specificity });

    logger.debug(`Added rule to "${this.name}": ${selector.type}="${selector.value}" (specificity: ${specificity})`);

    return this;
  }

  /**
   * Removes all rules matching the given selector.
   *
   * @param selector - Selector to match
   * @returns Number of rules removed
   */
  removeRule(selector: Selector): number {
    const initialLength = this.rules.length;
    this.rules = this.rules.filter(
      (rule) => rule.selector.type !== selector.type || rule.selector.value !== selector.value
    );
    const removed = initialLength - this.rules.length;

    if (removed > 0) {
      logger.debug(`Removed ${removed} rule(s) from "${this.name}"`);
    }

    return removed;
  }

  /**
   * Gets all rules matching the given element properties.
   *
   * @param elementProps - Element properties to match against
   * @returns Array of matching style rules sorted by specificity
   */
  getMatchingRules(elementProps: {
    id?: string;
    classes?: string[];
    tag?: string;
    state?: string;
  }): StyleRule[] {
    const matching: StyleRule[] = [];

    for (const rule of this.rules) {
      if (this.matchesSelector(rule.selector, elementProps)) {
        matching.push(rule);
      }
    }

    return matching.sort((a, b) => a.specificity - b.specificity);
  }

  /**
   * Resolves the final computed style for an element.
   * Applies cascade rules based on specificity.
   *
   * @param elementProps - Element properties to match against
   * @returns Computed Style instance
   */
  computeStyle(elementProps: {
    id?: string;
    classes?: string[];
    tag?: string;
    state?: string;
  }): Style {
    const matchingRules = this.getMatchingRules(elementProps);
    const computedStyle = new Style();

    for (const rule of matchingRules) {
      computedStyle.merge(rule.style);
    }

    return computedStyle;
  }

  /**
   * Checks if a selector matches the given element properties.
   *
   * @param selector - Selector to test
   * @param elementProps - Element properties
   * @returns True if selector matches, false otherwise
   */
  private matchesSelector(
    selector: Selector,
    elementProps: {
      id?: string;
      classes?: string[];
      tag?: string;
      state?: string;
    }
  ): boolean {
    switch (selector.type) {
      case SelectorType.Id:
        return elementProps.id === selector.value;

      case SelectorType.Class:
        return elementProps.classes?.includes(selector.value) ?? false;

      case SelectorType.Tag:
        return elementProps.tag === selector.value;

      case SelectorType.State:
        return elementProps.state === selector.value;

      case SelectorType.Universal:
        return true;

      default:
        return false;
    }
  }

  /**
   * Calculates specificity for a selector.
   * Higher values indicate more specific selectors.
   *
   * @param selector - Selector to calculate specificity for
   * @returns Specificity value
   */
  private calculateSpecificity(selector: Selector): number {
    switch (selector.type) {
      case SelectorType.Id:
        return 1000;

      case SelectorType.Class:
      case SelectorType.State:
        return 100;

      case SelectorType.Tag:
        return 10;

      case SelectorType.Universal:
        return 1;

      default:
        return 0;
    }
  }

  /**
   * Clears all rules from the stylesheet.
   */
  clear(): void {
    const count = this.rules.length;
    this.rules = [];
    logger.debug(`Cleared ${count} rule(s) from "${this.name}"`);
  }

  /**
   * Gets the total number of rules in the stylesheet.
   *
   * @returns Rule count
   */
  getRuleCount(): number {
    return this.rules.length;
  }

  /**
   * Creates a copy of this stylesheet.
   *
   * @returns A new StyleSheet instance with copied rules
   */
  clone(): StyleSheet {
    const cloned = new StyleSheet(`${this.name} (copy)`);
    for (const rule of this.rules) {
      cloned.addRule(rule.selector, rule.style.clone());
    }
    return cloned;
  }

  /**
   * Merges another stylesheet into this one.
   * Rules from the other stylesheet are added with their original specificity.
   *
   * @param other - Stylesheet to merge from
   * @returns This stylesheet for chaining
   */
  merge(other: StyleSheet): this {
    for (const rule of other.rules) {
      this.rules.push({
        selector: rule.selector,
        style: rule.style.clone(),
        specificity: rule.specificity,
      });
    }

    logger.debug(`Merged ${other.rules.length} rule(s) from "${other.name}" into "${this.name}"`);

    return this;
  }

  /**
   * Creates a selector for matching by ID.
   *
   * @param id - Element ID
   * @returns Selector object
   */
  static id(id: string): Selector {
    return { type: SelectorType.Id, value: id };
  }

  /**
   * Creates a selector for matching by class name.
   *
   * @param className - Class name
   * @returns Selector object
   */
  static class(className: string): Selector {
    return { type: SelectorType.Class, value: className };
  }

  /**
   * Creates a selector for matching by tag/type.
   *
   * @param tag - Tag name
   * @returns Selector object
   */
  static tag(tag: string): Selector {
    return { type: SelectorType.Tag, value: tag };
  }

  /**
   * Creates a selector for matching by state.
   *
   * @param state - State name (e.g., 'hover', 'active')
   * @returns Selector object
   */
  static state(state: string): Selector {
    return { type: SelectorType.State, value: state };
  }

  /**
   * Creates a universal selector (matches all elements).
   *
   * @returns Selector object
   */
  static universal(): Selector {
    return { type: SelectorType.Universal, value: '*' };
  }
}
