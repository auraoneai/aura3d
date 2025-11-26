import { Style } from './Style';
import { StyleSheet } from './StyleSheet';
import { Theme } from './Theme';
import { Logger } from '../../core/Logger';

const logger = Logger.create('StyleResolver');

/**
 * Style inheritance configuration for an element.
 */
export interface StyleInheritance {
  /**
   * Inline styles (highest priority).
   */
  inline?: Style;

  /**
   * Element classes for stylesheet matching.
   */
  classes?: string[];

  /**
   * Element ID for stylesheet matching.
   */
  id?: string;

  /**
   * Element tag/type for stylesheet matching.
   */
  tag?: string;

  /**
   * Current element state (e.g., 'hover', 'active').
   */
  state?: string;

  /**
   * Parent element's computed style for inheritance.
   */
  parent?: Style;
}

/**
 * Resolves final styles by combining theme defaults, stylesheets, inheritance, and inline styles.
 * Implements CSS cascade rules with proper specificity handling.
 */
export class StyleResolver {
  private theme: Theme;
  private stylesheets: StyleSheet[] = [];

  /**
   * Creates a new StyleResolver instance.
   *
   * @param theme - Theme to use for default values
   */
  constructor(theme: Theme) {
    this.theme = theme;
  }

  /**
   * Sets the theme for style resolution.
   *
   * @param theme - New theme to use
   */
  setTheme(theme: Theme): void {
    this.theme = theme;
    logger.info(`Theme changed to "${theme.name}"`);
  }

  /**
   * Gets the current theme.
   *
   * @returns Current Theme instance
   */
  getTheme(): Theme {
    return this.theme;
  }

  /**
   * Adds a stylesheet to the resolver.
   * Stylesheets are applied in the order they are added.
   *
   * @param stylesheet - Stylesheet to add
   */
  addStyleSheet(stylesheet: StyleSheet): void {
    this.stylesheets.push(stylesheet);
    logger.debug(`Added stylesheet, total: ${this.stylesheets.length}`);
  }

  /**
   * Removes a stylesheet from the resolver.
   *
   * @param stylesheet - Stylesheet to remove
   * @returns True if removed, false if not found
   */
  removeStyleSheet(stylesheet: StyleSheet): boolean {
    const index = this.stylesheets.indexOf(stylesheet);
    if (index !== -1) {
      this.stylesheets.splice(index, 1);
      logger.debug(`Removed stylesheet, remaining: ${this.stylesheets.length}`);
      return true;
    }
    return false;
  }

  /**
   * Clears all stylesheets from the resolver.
   */
  clearStyleSheets(): void {
    const count = this.stylesheets.length;
    this.stylesheets = [];
    logger.debug(`Cleared ${count} stylesheet(s)`);
  }

  /**
   * Resolves the final computed style for an element.
   * Applies styles in order: theme defaults -> stylesheets -> parent inheritance -> inline.
   *
   * @param inheritance - Style inheritance configuration
   * @returns Computed Style instance
   */
  resolve(inheritance: StyleInheritance): Style {
    const computed = new Style();

    // Step 1: Apply theme defaults based on tag
    this.applyThemeDefaults(computed, inheritance.tag);

    // Step 2: Apply stylesheet rules (in order, sorted by specificity within each sheet)
    for (const stylesheet of this.stylesheets) {
      const sheetStyle = stylesheet.computeStyle({
        id: inheritance.id,
        classes: inheritance.classes,
        tag: inheritance.tag,
        state: inheritance.state,
      });
      computed.merge(sheetStyle);
    }

    // Step 3: Apply inherited properties from parent
    if (inheritance.parent) {
      this.applyInheritance(computed, inheritance.parent);
    }

    // Step 4: Apply inline styles (highest priority)
    if (inheritance.inline) {
      computed.merge(inheritance.inline);
    }

    return computed;
  }

  /**
   * Applies theme default styles based on element tag.
   *
   * @param style - Style to apply defaults to
   * @param tag - Element tag/type
   */
  private applyThemeDefaults(style: Style, tag?: string): void {
    const { colors, typography, spacing } = this.theme;

    // Apply base defaults
    style.color = colors.text.clone();
    style.fontFamily = typography.body.fontFamily;
    style.fontSize = typography.body.fontSize;
    style.fontWeight = typography.body.fontWeight;
    style.lineHeight = typography.body.lineHeight;

    // Apply tag-specific defaults
    if (tag) {
      switch (tag.toLowerCase()) {
        case 'h1':
          style.fontSize = typography.h1.fontSize;
          style.fontWeight = typography.h1.fontWeight;
          style.lineHeight = typography.h1.lineHeight;
          style.fontFamily = typography.h1.fontFamily;
          break;

        case 'h2':
          style.fontSize = typography.h2.fontSize;
          style.fontWeight = typography.h2.fontWeight;
          style.lineHeight = typography.h2.lineHeight;
          style.fontFamily = typography.h2.fontFamily;
          break;

        case 'h3':
          style.fontSize = typography.h3.fontSize;
          style.fontWeight = typography.h3.fontWeight;
          style.lineHeight = typography.h3.lineHeight;
          style.fontFamily = typography.h3.fontFamily;
          break;

        case 'h4':
          style.fontSize = typography.h4.fontSize;
          style.fontWeight = typography.h4.fontWeight;
          style.lineHeight = typography.h4.lineHeight;
          style.fontFamily = typography.h4.fontFamily;
          break;

        case 'h5':
          style.fontSize = typography.h5.fontSize;
          style.fontWeight = typography.h5.fontWeight;
          style.lineHeight = typography.h5.lineHeight;
          style.fontFamily = typography.h5.fontFamily;
          break;

        case 'h6':
          style.fontSize = typography.h6.fontSize;
          style.fontWeight = typography.h6.fontWeight;
          style.lineHeight = typography.h6.lineHeight;
          style.fontFamily = typography.h6.fontFamily;
          break;

        case 'caption':
          style.fontSize = typography.caption.fontSize;
          style.fontWeight = typography.caption.fontWeight;
          style.lineHeight = typography.caption.lineHeight;
          break;

        case 'code':
          style.fontSize = typography.code.fontSize;
          style.fontWeight = typography.code.fontWeight;
          style.lineHeight = typography.code.lineHeight;
          style.fontFamily = typography.code.fontFamily;
          break;

        case 'button':
          style.fontSize = typography.button.fontSize;
          style.fontWeight = typography.button.fontWeight;
          style.lineHeight = typography.button.lineHeight;
          style.padding = {
            top: spacing.md,
            right: spacing.lg,
            bottom: spacing.md,
            left: spacing.lg,
          };
          style.borderRadius = this.theme.borderRadii.all(this.theme.borderRadii.md);
          style.backgroundColor = colors.primary.clone();
          style.color = colors.surface.clone();
          break;
      }
    }
  }

  /**
   * Applies inheritable properties from parent style.
   * Only certain properties are inherited (following CSS inheritance rules).
   *
   * @param style - Style to apply inheritance to
   * @param parent - Parent style to inherit from
   */
  private applyInheritance(style: Style, parent: Style): void {
    // Inherit text properties if not already set
    if (style.color === undefined && parent.color !== undefined) {
      style.color = parent.color.clone();
    }

    if (style.fontFamily === undefined && parent.fontFamily !== undefined) {
      style.fontFamily = parent.fontFamily;
    }

    if (style.fontSize === undefined && parent.fontSize !== undefined) {
      style.fontSize = parent.fontSize;
    }

    if (style.fontWeight === undefined && parent.fontWeight !== undefined) {
      style.fontWeight = parent.fontWeight;
    }

    if (style.lineHeight === undefined && parent.lineHeight !== undefined) {
      style.lineHeight = parent.lineHeight;
    }

    if (style.textAlign === undefined && parent.textAlign !== undefined) {
      style.textAlign = parent.textAlign;
    }

    if (style.cursor === undefined && parent.cursor !== undefined) {
      style.cursor = parent.cursor;
    }
  }

  /**
   * Creates a new style by merging multiple styles in order.
   * Later styles override earlier ones.
   *
   * @param styles - Array of styles to merge
   * @returns Merged Style instance
   */
  static mergeStyles(...styles: Style[]): Style {
    const result = new Style();
    for (const style of styles) {
      result.merge(style);
    }
    return result;
  }
}
