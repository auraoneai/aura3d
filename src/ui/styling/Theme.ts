import { ColorPalette } from './ColorPalette';
import { Typography } from './Typography';
import { SpacingScale } from './Spacing';
import { Shadows } from './Shadows';
import { BorderRadii, BorderWidths } from './Borders';
import { Transitions } from './Transitions';

/**
 * Theme mode enumeration.
 */
export enum ThemeMode {
  Light = 'light',
  Dark = 'dark',
}

/**
 * Complete theme configuration containing all design tokens.
 * Defines the visual appearance of the entire UI system.
 */
export class Theme {
  /**
   * Theme name identifier.
   */
  name: string;

  /**
   * Theme mode (light or dark).
   */
  mode: ThemeMode;

  /**
   * Color palette.
   */
  colors: ColorPalette;

  /**
   * Typography scale.
   */
  typography: Typography;

  /**
   * Spacing scale.
   */
  spacing: SpacingScale;

  /**
   * Shadow definitions.
   */
  shadows: Shadows;

  /**
   * Border radius presets.
   */
  borderRadii: BorderRadii;

  /**
   * Border width presets.
   */
  borderWidths: BorderWidths;

  /**
   * Transition presets.
   */
  transitions: Transitions;

  /**
   * Creates a new Theme instance.
   *
   * @param config - Theme configuration
   */
  constructor(config: {
    name: string;
    mode: ThemeMode;
    colors: ColorPalette;
    typography: Typography;
    spacing: SpacingScale;
    shadows: Shadows;
    borderRadii: BorderRadii;
    borderWidths: BorderWidths;
    transitions: Transitions;
  }) {
    this.name = config.name;
    this.mode = config.mode;
    this.colors = config.colors;
    this.typography = config.typography;
    this.spacing = config.spacing;
    this.shadows = config.shadows;
    this.borderRadii = config.borderRadii;
    this.borderWidths = config.borderWidths;
    this.transitions = config.transitions;
  }

  /**
   * Creates a copy of this theme.
   *
   * @returns A new Theme instance with cloned properties
   */
  clone(): Theme {
    return new Theme({
      name: this.name,
      mode: this.mode,
      colors: this.colors.clone(),
      typography: this.typography.clone(),
      spacing: this.spacing.clone(),
      shadows: this.shadows.clone(),
      borderRadii: this.borderRadii.clone(),
      borderWidths: this.borderWidths.clone(),
      transitions: this.transitions.clone(),
    });
  }

  /**
   * Creates a default light theme.
   *
   * @returns A light-themed Theme instance
   */
  static createLight(): Theme {
    return new Theme({
      name: 'Light',
      mode: ThemeMode.Light,
      colors: ColorPalette.createLight(),
      typography: Typography.createDefault(),
      spacing: SpacingScale.createDefault(),
      shadows: Shadows.createLight(),
      borderRadii: BorderRadii.createDefault(),
      borderWidths: BorderWidths.createDefault(),
      transitions: Transitions.createDefault(),
    });
  }

  /**
   * Creates a default dark theme.
   *
   * @returns A dark-themed Theme instance
   */
  static createDark(): Theme {
    return new Theme({
      name: 'Dark',
      mode: ThemeMode.Dark,
      colors: ColorPalette.createDark(),
      typography: Typography.createDefault(),
      spacing: SpacingScale.createDefault(),
      shadows: Shadows.createDark(),
      borderRadii: BorderRadii.createDefault(),
      borderWidths: BorderWidths.createDefault(),
      transitions: Transitions.createDefault(),
    });
  }

  /**
   * Switches the theme mode and returns a new theme instance.
   *
   * @returns A new Theme instance with toggled mode
   */
  toggleMode(): Theme {
    const newMode = this.mode === ThemeMode.Light ? ThemeMode.Dark : ThemeMode.Light;
    const newColors = newMode === ThemeMode.Light ? ColorPalette.createLight() : ColorPalette.createDark();
    const newShadows = newMode === ThemeMode.Light ? Shadows.createLight() : Shadows.createDark();

    return new Theme({
      name: `${this.name} (${newMode})`,
      mode: newMode,
      colors: newColors,
      typography: this.typography.clone(),
      spacing: this.spacing.clone(),
      shadows: newShadows,
      borderRadii: this.borderRadii.clone(),
      borderWidths: this.borderWidths.clone(),
      transitions: this.transitions.clone(),
    });
  }

  /**
   * Creates a variant of this theme with modified properties.
   *
   * @param overrides - Properties to override
   * @returns A new Theme instance with overrides applied
   */
  withOverrides(overrides: {
    name?: string;
    mode?: ThemeMode;
    colors?: Partial<ColorPalette>;
    typography?: Partial<Typography>;
    spacing?: Partial<SpacingScale>;
    shadows?: Partial<Shadows>;
    borderRadii?: Partial<BorderRadii>;
    borderWidths?: Partial<BorderWidths>;
    transitions?: Partial<Transitions>;
  }): Theme {
    return new Theme({
      name: overrides.name ?? this.name,
      mode: overrides.mode ?? this.mode,
      colors: overrides.colors ? Object.assign(this.colors.clone(), overrides.colors) : this.colors.clone(),
      typography: overrides.typography ? Object.assign(this.typography.clone(), overrides.typography) : this.typography.clone(),
      spacing: overrides.spacing ? Object.assign(this.spacing.clone(), overrides.spacing) : this.spacing.clone(),
      shadows: overrides.shadows ? Object.assign(this.shadows.clone(), overrides.shadows) : this.shadows.clone(),
      borderRadii: overrides.borderRadii ? Object.assign(this.borderRadii.clone(), overrides.borderRadii) : this.borderRadii.clone(),
      borderWidths: overrides.borderWidths ? Object.assign(this.borderWidths.clone(), overrides.borderWidths) : this.borderWidths.clone(),
      transitions: overrides.transitions ? Object.assign(this.transitions.clone(), overrides.transitions) : this.transitions.clone(),
    });
  }
}
