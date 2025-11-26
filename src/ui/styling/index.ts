/**
 * UI Styling and Theme System exports.
 *
 * Provides a comprehensive styling system with:
 * - CSS-like style sheets with cascade and specificity
 * - Theme system with light/dark modes
 * - Color palettes with semantic naming
 * - Typography scales (h1-h6, body, caption)
 * - Spacing scales (xs, sm, md, lg, xl)
 * - Shadow definitions for elevation
 * - Border radius and width presets
 * - Transition and animation utilities
 *
 * @module styling
 */

export {
  Style,
  FontWeight,
  TextAlign,
  VerticalAlign,
  Display,
  Position,
  Overflow,
  Cursor,
  BorderStyle,
  spacing,
  borderRadius,
  border,
  shadow,
} from './Style';
export type {
  Border,
  Shadow,
  Spacing,
  BorderRadius,
} from './Style';

export {
  ColorPalette,
} from './ColorPalette';

export {
  Typography,
} from './Typography';
export type {
  TypographyStyle,
} from './Typography';

export {
  SpacingScale,
} from './Spacing';

export {
  Shadows,
} from './Shadows';

export {
  BorderRadii,
  BorderWidths,
} from './Borders';

export {
  Transitions,
  EasingFunction,
} from './Transitions';
export type {
  TransitionConfig,
} from './Transitions';

export {
  Theme,
  ThemeMode,
} from './Theme';

export {
  ThemeProvider,
} from './ThemeProvider';
export type {
  ThemeChangeCallback,
} from './ThemeProvider';

export {
  StyleSheet,
  SelectorType,
} from './StyleSheet';
export type {
  StyleRule,
  Selector,
} from './StyleSheet';

export {
  StyleResolver,
} from './StyleResolver';
export type {
  StyleInheritance,
} from './StyleResolver';
