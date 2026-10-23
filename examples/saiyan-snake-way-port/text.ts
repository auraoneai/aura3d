/**
 * Player-facing wording. The simulation keeps the original's identifiers and strings (its replay
 * tests compare them), so every string shown on screen goes through `displayText`, which swaps the
 * franchise terms for this port's generic ones. The public page never names the original's
 * characters, items or places (docs/workflows/crayon-game-reverse-engineering.md section 4).
 */

const RULES: readonly (readonly [RegExp, string])[] = [
  [/KAIO-KEN\s*×/g, "SURGE ×"],
  [/KAIO-KEN/g, "SURGE"],
  [/Kaio-ken/g, "Surge"],
  [/SENZU BEAN/g, "VITAL SEED"],
  [/YEMMA'S STAMP/g, "WAYPOINT STAMP"],
  [/POWER POLE/g, "GRAPPLE STAFF"],
  [/PRINCESS SNAKE'S PALACE/g, "THE SERPENT HALL"],
  [/SAIBAMAN/g, "BRUTE"],
  [/King Kai's world is down there/g, "the world below is waiting"],
  [/\bKI\b/g, "SPARK"],
  [/\bki\b/g, "spark"],
  [/\bKi\b/g, "Spark"]
];

export function displayText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out;
}

/** Terms that must never reach the screen (checked against every string the simulation can emit). */
export const FORBIDDEN_DISPLAY_TERMS: readonly RegExp[] = [
  /kaio/i, /saiyan/i, /goku/i, /senzu/i, /yemma/i, /king kai/i, /princess snake/i, /nimbus/i, /power pole/i, /saibaman/i,
  /kamehameha/i, /dragon/i, /\bki\b/i
];
