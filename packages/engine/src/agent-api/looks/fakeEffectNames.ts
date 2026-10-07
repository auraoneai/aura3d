// PRD-13 T1.4 — the 41 fake-effect node names (research/12 §4.4), generated once
// by `rg -o 'name: *"[^"]+"' packages/engine/src/agent-api/index.ts` (read-only)
// and committed. Each name belongs to a node that imitates an engine feature
// (blob-shadow primitives, emissive "reflection cards", painted glow halos)
// instead of using the real feature. Names that are real lights (softbox /
// rect / key / fill rigs), UI meters, or material properties are excluded.

export const FAKE_EFFECT_NAMES = [
  "authored humanoid renderer contact occlusion",
  "authored humanoid soft contact shadow",
  "ball contact shadow on felt",
  "black reflection contrast strip",
  "blue rear foot motion streak",
  "blue shoulder motion streak",
  "center flythrough camera path glow",
  "chrome bright reflection card",
  "chrome dark reflection card",
  "clearcoat amber base reflection",
  "cool blue environment reflection panel",
  "cool cyan studio reflection panel",
  "cup success glow marker",
  "cyan body motion trail ribbon behind torso",
  "emissive glow spill on lab floor",
  "falling collision splash particle band",
  "glass dark contrast card",
  "glass white contrast card",
  "humanoid contact shadow",
  "inspection only left softbox card",
  "inspection only right softbox card",
  "large emissive magenta glow halo",
  "older blue mist particles after ground collision",
  "optional authored humanoid stride streak left foot",
  "optional authored humanoid stride streak rear foot",
  "orange forward foot motion streak",
  "orange obstacle contact flash",
  "painted particle collision splash ring",
  "rear warm reflection card rim softbox rubber sole edge kicker",
  "soft product contact shadow from footprint",
  "split material reflection wall",
  "subtle collision contact patch cluster center",
  "subtle collision contact patch under settled pile",
  "subtle fall motion streak",
  "tiny vanishing point glow beyond tunnel",
  "transparent moving ball ghost 1",
  "transparent moving ball ghost 2",
  "warm amber studio reflection panel",
  "warm gold environment reflection panel",
  "white softbox reflection strip",
  "wide amber solar glow halo shader"
] as const;

/**
 * Generic stems distilled from the 41 names (plus the §6.2 exemplars
 * "wet reflection", "puddle streak", "rain splash"). Showcase apps copy the
 * pattern with different prefixes ("hero contact shadow"), so the lint rule
 * matches these as case-insensitive substrings; the verbatim 41 names above
 * are the frozen research record.
 */
export const FAKE_EFFECT_STEMS = [
  "contact shadow",
  "contact patch",
  "contact occlusion",
  "contact flash",
  "reflection card",
  "reflection panel",
  "reflection strip",
  "reflection wall",
  "contrast card",
  "contrast strip",
  "softbox card",
  "glow halo",
  "glow spill",
  "glow marker",
  "path glow",
  "motion streak",
  "motion trail",
  "stride streak",
  "splash ring",
  "splash particle",
  "mist particle",
  "vanishing point glow",
  "moving ball ghost",
  "wet reflection",
  "puddle streak",
  "rain splash",
  "glow halo shader"
] as const;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Case-insensitive matcher over the verbatim names and the generic stems. */
export const FAKE_EFFECT_PATTERN = new RegExp(
  `(?:${[...FAKE_EFFECT_STEMS, ...FAKE_EFFECT_NAMES].map(escapeRegExp).join("|")})`,
  "i"
);

/** True when a node name imitates an engine feature (§6.2 `look/fake-effect-names`). */
export function isFakeEffectName(name: string | undefined): boolean {
  return name !== undefined && FAKE_EFFECT_PATTERN.test(name);
}
