import {
  auraClashOriginalFighterById,
  auraClashOriginalRoster,
  type AuraClashFighterDefinition,
  type AuraClashFighterId
} from "./fighters";

export type RouteMode =
  | "playable"
  | "evidence"
  | "accessibility"
  | "deploy"
  | "poster"
  | "home";

export type AnimationState =
  | "idle"
  | "light"
  | "heavy"
  | "special"
  | "guard"
  | "dash"
  | "jump"
  | "hitstun"
  | "victory"
  | "defeat";

export type AuraClashCombatAction =
  | "moveLeft"
  | "moveRight"
  | "jump"
  | "light"
  | "heavy"
  | "special"
  | "guard"
  | "dash"
  | "pause"
  | "reset";

export type Fighter = {
  id: AuraClashFighterId;
  name: string;
  callsign: string;
  title: string;
  archetype: string;
  palette: string;
  special: string;
  assetKey: string;
  health: number;
  guard: number;
  meter: number;
  combo: number;
};

export type AuraClashRouteDefinition = Readonly<{
  mode: RouteMode;
  path: `/${string}`;
  label: string;
  purpose: string;
  staticSafe: boolean;
  requiredSignals: readonly string[];
}>;

export type AuraClashActionTuning = Readonly<{
  action: Exclude<AuraClashCombatAction, "pause" | "reset">;
  label: string;
  keyboard: string;
  animationState: AnimationState;
  damage: number;
  guardDamage: number;
  meterDelta: number;
  comboDelta: number;
  minimumMeter: number;
  playerLog: string;
  rivalLog: string;
}>;

export const AURA_CLASH_ROUTES = [
  {
    mode: "playable",
    path: "/playable/",
    label: "Playable",
    purpose:
      "Hands-on arcade route with keyboard actions, roster selection, HUD state, AI pressure, and typed Aura3D GLB scene composition.",
    staticSafe: true,
    requiredSignals: [
      "Character select includes all six original fighters.",
      "Combat actions update health, guard, meter, combo, animation, and combat log state.",
      "Scene composition uses registered typed Aura3D asset members instead of string model ids."
    ]
  },
  {
    mode: "evidence",
    path: "/evidence/",
    label: "Evidence",
    purpose:
      "Developer proof route for typed asset provenance, control coverage, route coverage, and acceptance gates.",
    staticSafe: true,
    requiredSignals: [
      "Typed fighter asset members are inspectable.",
      "Original fighter definitions expose stats, moves, and combo routes as data.",
      "Launch gates remain explicit about visual QA and deployment readiness."
    ]
  },
  {
    mode: "accessibility",
    path: "/accessibility/",
    label: "Accessibility",
    purpose:
      "Accessible combat route with reduced motion, reduced flash, high contrast HUD, keyboard parity, and aria-live combat logs.",
    staticSafe: true,
    requiredSignals: [
      "Reduced motion softens dash and animation-heavy presentation.",
      "Reduced flash suppresses high-energy impact bursts.",
      "Combat state is text-backed and not color-only."
    ]
  },
  {
    mode: "deploy",
    path: "/deploy-check/",
    label: "Deploy check",
    purpose:
      "Deployment-readiness route that can be loaded directly by static hosting and CI route-health checks.",
    staticSafe: true,
    requiredSignals: [
      "Direct route loading resolves without client-side route mutation.",
      "Typed assets and public asset paths are named for deployment review.",
      "Promotion remains gated until screenshot and visual QA approval."
    ]
  },
  {
    mode: "poster",
    path: "/poster/",
    label: "Poster",
    purpose:
      "Capture-safe route for launch posters, social cards, and six-fighter roster screenshots.",
    staticSafe: true,
    requiredSignals: [
      "Mara Volt and Rook Atlas hero-versus composition is available.",
      "Super impact and six-fighter roster scenarios have explicit required elements.",
      "Poster copy remains original IP and avoids invented asset claims."
    ]
  },
  {
    mode: "home",
    path: "/",
    label: "Home",
    purpose:
      "Default Aura Clash landing state when no explicit route segment is present.",
    staticSafe: true,
    requiredSignals: [
      "Route fallback keeps playable content reachable.",
      "Navigation exposes playable, evidence, accessibility, deploy, and poster routes.",
      "Runtime copy remains consistent with the current app shell."
    ]
  }
] as const satisfies readonly AuraClashRouteDefinition[];

export const AURA_CLASH_ROUTE_COPY = {
  evidence:
    "Evidence route: archive hashes, staged source manifests, generated GLBs, and typed Aura3D asset registration are documented for review.",
  accessibility:
    "Accessibility route: keyboard-friendly actions, semantic buttons, high-contrast toggle, reduced-motion toggle, reduced-flash toggle, and aria-live combat logs are part of the launch gate.",
  deploy:
    "Deploy-check route: this static shell proves route metadata, typed scene asset availability, direct fight-scene composition, runtime fallback handling, and public route readiness before promotion.",
  poster:
    "Poster route: capture-focused layout for Open Graph and marketing screenshots once visual composition passes review.",
  playable:
    "Playable route: the first vertical slice composes the clean duel stage plus selected Quaternius fighter GLBs with an interactive combat HUD and AI pressure loop.",
  home:
    "Aura Clash route: original Aura3D fighting-game showcase using typed Quaternius GLB assets and a composed neon city arena."
} as const satisfies Record<RouteMode, string>;

export const AURA_CLASH_ACTION_TUNING = {
  moveLeft: {
    action: "moveLeft",
    label: "A / ← · Move left",
    keyboard: "A / ArrowLeft",
    animationState: "dash",
    damage: 0,
    guardDamage: 0,
    meterDelta: 2,
    comboDelta: 0,
    minimumMeter: 0,
    playerLog:
      "{player} shifts left across the combat lane.",
    rivalLog:
      "{rival} shifts left and changes the spacing."
  },
  moveRight: {
    action: "moveRight",
    label: "D / → · Move right",
    keyboard: "D / ArrowRight",
    animationState: "dash",
    damage: 0,
    guardDamage: 0,
    meterDelta: 2,
    comboDelta: 0,
    minimumMeter: 0,
    playerLog:
      "{player} shifts right across the combat lane.",
    rivalLog:
      "{rival} shifts right and changes the spacing."
  },
  jump: {
    action: "jump",
    label: "W · Jump",
    keyboard: "W",
    animationState: "jump",
    damage: 0,
    guardDamage: 0,
    meterDelta: 3,
    comboDelta: 0,
    minimumMeter: 0,
    playerLog:
      "{player} jumps over the rooftop lane and lands ready to pressure.",
    rivalLog:
      "{rival} jumps to reset the exchange."
  },
  light: {
    action: "light",
    label: "J · Light combo",
    keyboard: "J",
    animationState: "light",
    damage: 8,
    guardDamage: 10,
    meterDelta: 7,
    comboDelta: 1,
    minimumMeter: 0,
    playerLog:
      "{player} chains a light combo. Meter builds and the crowd strip pulses.",
    rivalLog:
      "{rival} pokes with a light string and clips the player's guard."
  },
  heavy: {
    action: "heavy",
    label: "K · Heavy strike",
    keyboard: "K",
    animationState: "heavy",
    damage: 14,
    guardDamage: 18,
    meterDelta: 10,
    comboDelta: 1,
    minimumMeter: 0,
    playerLog:
      "{player} lands a heavy strike. The rival reels in hitstun.",
    rivalLog:
      "{rival} answers with a heavy swing and pushes the player back."
  },
  special: {
    action: "special",
    label: "L · Aura Burst",
    keyboard: "L",
    animationState: "special",
    damage: 24,
    guardDamage: 30,
    meterDelta: -35,
    comboDelta: 3,
    minimumMeter: 35,
    playerLog:
      "{player} spends meter on {special}. Aura Burst detonates across the lane.",
    rivalLog:
      "{rival} fires {special}; the HUD records an incoming Aura Burst."
  },
  guard: {
    action: "guard",
    label: "Shift · Block",
    keyboard: "Shift",
    animationState: "guard",
    damage: 0,
    guardDamage: -16,
    meterDelta: 5,
    comboDelta: 0,
    minimumMeter: 0,
    playerLog:
      "{player} guards and steadies the meter. Incoming pressure is reduced.",
    rivalLog:
      "{rival} guards and waits for a counter window."
  },
  dash: {
    action: "dash",
    label: "Space · Dash",
    keyboard: "Space",
    animationState: "dash",
    damage: 0,
    guardDamage: 0,
    meterDelta: 4,
    comboDelta: 0,
    minimumMeter: 0,
    playerLog:
      "{player} dashes through the neon lane and resets spacing.",
    rivalLog:
      "{rival} dashes to change the range before the next exchange."
  }
} as const satisfies Record<
  Exclude<AuraClashCombatAction, "pause" | "reset">,
  AuraClashActionTuning
>;

export const AURA_CLASH_MATCH_CONFIG = {
  defaultPlayerIndex: 0,
  defaultRivalIndex: 1,
  roundSeconds: 90,
  maxHealth: 100,
  maxGuard: 100,
  meterCap: 100,
  arenaName: "Neon Downtown Rooftop",
  arenaAssetMember: "assets.arenaNeonDowntown",
  duelStageAssetMember: "assets.auraClashDuelStage",
  liveSceneComposition: "assets.auraClashDuelStage + selected assets.fighter* GLBs",
  sourcePacks: "Quaternius CC0 standard packs",
  runtime: "@aura3d/engine 1.0.5+"
} as const;

export const AURA_CLASH_ANIMATION_STATES = [
  "idle",
  "light",
  "heavy",
  "special",
  "guard",
  "dash",
  "jump",
  "hitstun",
  "victory",
  "defeat"
] as const satisfies readonly AnimationState[];

export const AURA_CLASH_TYPED_FIGHTER_ASSET_MEMBERS =
  auraClashOriginalRoster.map((fighter) => fighter.asset.typedAssetMember);

export function getRouteMode(path: string): RouteMode {
  if (path.includes("/evidence")) return "evidence";
  if (path.includes("/accessibility")) return "accessibility";
  if (path.includes("/deploy-check")) return "deploy";
  if (path.includes("/poster")) return "poster";
  if (path.includes("/playable")) return "playable";
  return "home";
}

export function getAuraClashRoute(path: string): AuraClashRouteDefinition {
  const mode = getRouteMode(path);
  return (
    AURA_CLASH_ROUTES.find((route) => route.mode === mode) ??
    AURA_CLASH_ROUTES[0]
  );
}

export function routeCopyForMode(mode: RouteMode): string {
  return AURA_CLASH_ROUTE_COPY[mode];
}

export function runtimeFighter(
  fighter: AuraClashFighterDefinition
): Fighter {
  return {
    id: fighter.id,
    name: fighter.name,
    callsign: fighter.metadata.callsign,
    title: fighter.metadata.title,
    archetype: fighter.metadata.archetype,
    palette: fighter.visualProfile.palette.displayName,
    special: fighter.moveKit.signature.name,
    assetKey: fighter.asset.fighter,
    health: fighter.stats.maxHealth,
    guard: fighter.stats.maxGuard,
    meter: fighter.stats.startingMeter,
    combo: 0
  };
}

export const roster: Fighter[] = auraClashOriginalRoster.map(runtimeFighter);

export const ORIGINAL_ROSTER = auraClashOriginalRoster;

export function fighterDefinitionById(
  id: string
): AuraClashFighterDefinition {
  return auraClashOriginalFighterById(id);
}

export function fighterById(id: string): Fighter {
  const definition = auraClashOriginalFighterById(id);
  return runtimeFighter(definition);
}

export function freshFighter(index: number): Fighter {
  const source = roster[index] ?? roster[0];
  return {
    ...source,
    health: AURA_CLASH_MATCH_CONFIG.maxHealth,
    guard: AURA_CLASH_MATCH_CONFIG.maxGuard,
    meter: source.meter,
    combo: 0
  };
}

export function rivalIndexForPlayer(index: number): number {
  if (roster.length <= 1) return 0;
  return index === 1 ? 0 : 1;
}

export function formatActionLog(
  template: string,
  fighter: Fighter
): string {
  return template
    .replaceAll("{player}", fighter.name)
    .replaceAll("{rival}", fighter.name)
    .replaceAll("{special}", fighter.special);
}
