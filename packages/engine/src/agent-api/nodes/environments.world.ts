// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

/**
 * PRD-10 §7.1.2 — `environments.outdoor/room/space/underwater`.
 *
 * Flag on (`A3D_QR_WORLD_BIOME`): each emits a `biome` node with
 * `scope:"environment"` — sky/sun/fog untouched, only the C-09 env source
 * resolves. Flag off: the builder emits `environments.studio()` instead and
 * records an `option-ignored` degradation the flag-on compile drains via
 * `takeWorldEnvDegradations` (a flag-off app never sees a world node).
 */
import type { AuraEnvironmentNode, AuraEnvironmentOptions, AuraNodeBuilder } from "../index.js";
import { envSourceBuilders } from "./environments.js";
import type { AuraBiomeNode } from "../world/biomes.js";
import type { AuraBiomeId } from "../../contracts/world.js";
import { AuraWorldNodeBuilder } from "../world/terrain.js";
import { worldBuilderSubflagOn } from "../world/flags.js";
import { worldBiome } from "../world/timeOfDay.js";
import type { AuraDegradation } from "../../contracts/compiler.js";

/** Flag on → biome builder; flag off → studio builder (issue #135: biome isn't in the AuraSceneNode union yet). */
type WorldEnvBuilderOut =
  | AuraWorldNodeBuilder<AuraBiomeNode>
  | AuraNodeBuilder<AuraEnvironmentNode>;

type OutdoorBiome = Extract<AuraBiomeId, "outdoor-day" | "golden-hour" | "overcast" | "alpine-snow">;

/** Degradations queued by flag-off builds; drained by the flag-on compile path. */
const pendingDegradations: Omit<AuraDegradation, "frame">[] = [];
export function takeWorldEnvDegradations(): Omit<AuraDegradation, "frame">[] {
  return pendingDegradations.splice(0, pendingDegradations.length);
}

const OPTION_IGNORED = (builder: string): Omit<AuraDegradation, "frame"> => ({
  code: "option-ignored",
  message: `${builder}: A3D_QR_WORLD_BIOME is off — emitted environments.studio() instead; biome options ignored`
});

// §7.1.2: environments.* emit scope:"environment" — sky/sun/fog untouched.
const biome = (...args: Parameters<typeof worldBiome>): AuraWorldNodeBuilder<AuraBiomeNode> =>
  worldBiome(...args);

const withStudioFallback = (
  builder: string,
  options: AuraEnvironmentOptions,
  make: () => AuraWorldNodeBuilder<AuraBiomeNode>
): WorldEnvBuilderOut => {
  if (worldBuilderSubflagOn("A3D_QR_WORLD_BIOME")) return make();
  pendingDegradations.push(OPTION_IGNORED(builder));
  return envSourceBuilders.studio(options);
};

/** PRD 10 world environment builders — spread into `environments` (index.ts:3084). */
export const worldEnvBuilders = {
  outdoor: (
    options: AuraEnvironmentOptions & { readonly biome?: OutdoorBiome } = {}
  ): WorldEnvBuilderOut =>
    withStudioFallback("environments.outdoor", options, () =>
      biome(options.biome ?? "outdoor-day",
        options.intensity !== undefined ? { environment: { intensity: options.intensity } } : undefined,
        "environment").name(options.name ?? "outdoor biome environment")),
  room: (
    options: AuraEnvironmentOptions & { readonly colorTemperatureK?: number } = {}
  ): WorldEnvBuilderOut =>
    withStudioFallback("environments.room", options, () =>
      // colorTemperatureK maps to the rig's sun color temp (interior warm ↔ 2700K, neutral ↔ 4000K)
      biome("interior-neutral",
        options.colorTemperatureK !== undefined ? { sun: { colorTemperatureK: options.colorTemperatureK } } : undefined,
        "environment").name(options.name ?? "room biome environment")),
  space: (options: AuraEnvironmentOptions = {}): WorldEnvBuilderOut =>
    withStudioFallback("environments.space", options, () =>
      biome("space", undefined, "environment").name(options.name ?? "space biome environment")),
  underwater: (options: AuraEnvironmentOptions = {}): WorldEnvBuilderOut =>
    withStudioFallback("environments.underwater", options, () =>
      biome("underwater", undefined, "environment").name(options.name ?? "underwater biome environment"))
};
