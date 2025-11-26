import { Culture, CultureUtils } from './Culture';

/**
 * Culture Presets
 *
 * Predefined cultures based on Hofstede's research and cultural studies.
 * Values are approximations for educational and simulation purposes.
 */

/**
 * Western/American culture preset
 * High individualism, low power distance, moderate uncertainty avoidance
 */
export const WesternCulture: Culture = CultureUtils.createCulture(
  'western',
  'Western (American)',
  {
    individualism: 0.91,
    powerDistance: 0.40,
    uncertaintyAvoidance: 0.46,
    masculinity: 0.62,
    longTermOrientation: 0.26,
    indulgence: 0.68
  }
);

/**
 * Japanese culture preset
 * Moderate individualism, high uncertainty avoidance, long-term orientation
 */
export const JapaneseCulture: Culture = {
  ...CultureUtils.createCulture(
    'japanese',
    'Japanese',
    {
      individualism: 0.46,
      powerDistance: 0.54,
      uncertaintyAvoidance: 0.92,
      masculinity: 0.95,
      longTermOrientation: 0.88,
      indulgence: 0.42
    }
  ),
  communicationStyle: 'indirect',
  greetingStyle: 'formal',
  personalSpacePreference: 'medium',
  eyeContactNorm: 'moderate',
  description: 'Japanese culture values harmony, respect for hierarchy, and long-term planning'
};

/**
 * Chinese culture preset
 * Low individualism (collectivist), high power distance, very long-term oriented
 */
export const ChineseCulture: Culture = {
  ...CultureUtils.createCulture(
    'chinese',
    'Chinese',
    {
      individualism: 0.20,
      powerDistance: 0.80,
      uncertaintyAvoidance: 0.30,
      masculinity: 0.66,
      longTermOrientation: 0.87,
      indulgence: 0.24
    }
  ),
  communicationStyle: 'indirect',
  greetingStyle: 'formal',
  personalSpacePreference: 'close',
  eyeContactNorm: 'moderate',
  description: 'Chinese culture emphasizes collectivism, hierarchy, and long-term thinking'
};

/**
 * German culture preset
 * High individualism, low power distance, very high uncertainty avoidance
 */
export const GermanCulture: Culture = {
  ...CultureUtils.createCulture(
    'german',
    'German',
    {
      individualism: 0.67,
      powerDistance: 0.35,
      uncertaintyAvoidance: 0.65,
      masculinity: 0.66,
      longTermOrientation: 0.83,
      indulgence: 0.40
    }
  ),
  communicationStyle: 'direct',
  greetingStyle: 'formal',
  personalSpacePreference: 'distant',
  eyeContactNorm: 'direct',
  description: 'German culture values precision, rules, and direct communication'
};

/**
 * Brazilian culture preset
 * Moderate individualism, high power distance, high indulgence
 */
export const BrazilianCulture: Culture = {
  ...CultureUtils.createCulture(
    'brazilian',
    'Brazilian',
    {
      individualism: 0.38,
      powerDistance: 0.69,
      uncertaintyAvoidance: 0.76,
      masculinity: 0.49,
      longTermOrientation: 0.44,
      indulgence: 0.59
    }
  ),
  communicationStyle: 'indirect',
  greetingStyle: 'informal',
  personalSpacePreference: 'close',
  eyeContactNorm: 'direct',
  description: 'Brazilian culture is warm, relationship-focused, and hierarchical'
};

/**
 * Scandinavian (Swedish) culture preset
 * High individualism, very low power distance, low uncertainty avoidance
 */
export const ScandinavianCulture: Culture = {
  ...CultureUtils.createCulture(
    'scandinavian',
    'Scandinavian (Swedish)',
    {
      individualism: 0.71,
      powerDistance: 0.31,
      uncertaintyAvoidance: 0.29,
      masculinity: 0.05,
      longTermOrientation: 0.53,
      indulgence: 0.78
    }
  ),
  communicationStyle: 'direct',
  greetingStyle: 'informal',
  personalSpacePreference: 'distant',
  eyeContactNorm: 'direct',
  conflictResolutionStyle: 'collaborative',
  description: 'Scandinavian culture emphasizes equality, work-life balance, and consensus'
};

/**
 * Indian culture preset
 * Low individualism, very high power distance, moderate uncertainty avoidance
 */
export const IndianCulture: Culture = {
  ...CultureUtils.createCulture(
    'indian',
    'Indian',
    {
      individualism: 0.48,
      powerDistance: 0.77,
      uncertaintyAvoidance: 0.40,
      masculinity: 0.56,
      longTermOrientation: 0.51,
      indulgence: 0.26
    }
  ),
  communicationStyle: 'indirect',
  greetingStyle: 'formal',
  personalSpacePreference: 'medium',
  eyeContactNorm: 'moderate',
  description: 'Indian culture values hierarchy, spirituality, and family'
};

/**
 * Middle Eastern (Arab) culture preset
 * Low individualism, high power distance, moderate uncertainty avoidance
 */
export const MiddleEasternCulture: Culture = {
  ...CultureUtils.createCulture(
    'middle_eastern',
    'Middle Eastern (Arab)',
    {
      individualism: 0.38,
      powerDistance: 0.80,
      uncertaintyAvoidance: 0.68,
      masculinity: 0.53,
      longTermOrientation: 0.23,
      indulgence: 0.34
    }
  ),
  communicationStyle: 'indirect',
  greetingStyle: 'formal',
  personalSpacePreference: 'close',
  eyeContactNorm: 'moderate',
  description: 'Middle Eastern culture emphasizes honor, hospitality, and family ties'
};

/**
 * British culture preset
 * High individualism, low power distance, low uncertainty avoidance
 */
export const BritishCulture: Culture = {
  ...CultureUtils.createCulture(
    'british',
    'British',
    {
      individualism: 0.89,
      powerDistance: 0.35,
      uncertaintyAvoidance: 0.35,
      masculinity: 0.66,
      longTermOrientation: 0.51,
      indulgence: 0.69
    }
  ),
  communicationStyle: 'indirect',
  greetingStyle: 'formal',
  personalSpacePreference: 'distant',
  eyeContactNorm: 'moderate',
  description: 'British culture values politeness, understatement, and tradition'
};

/**
 * Australian culture preset
 * Very high individualism, low power distance, low uncertainty avoidance
 */
export const AustralianCulture: Culture = {
  ...CultureUtils.createCulture(
    'australian',
    'Australian',
    {
      individualism: 0.90,
      powerDistance: 0.38,
      uncertaintyAvoidance: 0.51,
      masculinity: 0.61,
      longTermOrientation: 0.21,
      indulgence: 0.71
    }
  ),
  communicationStyle: 'direct',
  greetingStyle: 'informal',
  personalSpacePreference: 'medium',
  eyeContactNorm: 'direct',
  description: 'Australian culture is egalitarian, informal, and direct'
};

/**
 * Russian culture preset
 * Low individualism, very high power distance, very high uncertainty avoidance
 */
export const RussianCulture: Culture = {
  ...CultureUtils.createCulture(
    'russian',
    'Russian',
    {
      individualism: 0.39,
      powerDistance: 0.93,
      uncertaintyAvoidance: 0.95,
      masculinity: 0.36,
      longTermOrientation: 0.81,
      indulgence: 0.20
    }
  ),
  communicationStyle: 'indirect',
  greetingStyle: 'formal',
  personalSpacePreference: 'close',
  eyeContactNorm: 'direct',
  description: 'Russian culture values strength, hierarchy, and emotional restraint'
};

/**
 * Collection of all preset cultures
 */
export const CulturePresets: Map<string, Culture> = new Map([
  ['western', WesternCulture],
  ['japanese', JapaneseCulture],
  ['chinese', ChineseCulture],
  ['german', GermanCulture],
  ['brazilian', BrazilianCulture],
  ['scandinavian', ScandinavianCulture],
  ['indian', IndianCulture],
  ['middle_eastern', MiddleEasternCulture],
  ['british', BritishCulture],
  ['australian', AustralianCulture],
  ['russian', RussianCulture]
]);

/**
 * Gets a culture preset by ID
 *
 * @param id - Culture ID
 * @returns Culture or undefined
 */
export function getCulturePreset(id: string): Culture | undefined {
  return CulturePresets.get(id);
}

/**
 * Gets all available culture preset IDs
 *
 * @returns Array of culture IDs
 */
export function getCulturePresetIds(): string[] {
  return Array.from(CulturePresets.keys());
}

/**
 * Gets all available culture presets
 *
 * @returns Array of cultures
 */
export function getAllCulturePresets(): Culture[] {
  return Array.from(CulturePresets.values());
}
