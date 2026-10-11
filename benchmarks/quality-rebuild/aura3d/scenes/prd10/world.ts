/**
 * Lane prd10 world-node builders for the benchmark adapters (aura3d).
 *
 * With `world` resolved ON for the capture, each outdoor prd10 scene swaps its
 * primitive stand-ins (planes / instanced cylinders) for the real PRD-10
 * runtime: `world.terrain` (CDLOD + splat), `world.grass`, `world.water`.
 * With `world` OFF the spec renders exactly as before, so `none` vs `world`
 * captures compare the stand-in against the real world system.
 *
 * `world` is not yet on a public engine subpath (#249), so it is imported from
 * the engine source module; the benchmark aliases `@aura3d/engine` to the same
 * source tree, so the terrain/water registries are the ones the engine reads.
 */
import { resolveQrFlags } from "@aura3d/engine";
import type { AuraApp, AuraNodeInput } from "@aura3d/engine";
import { frameContributors } from "@aura3d/rendering/contracts";
import { world } from "../../../../../packages/engine/src/agent-api/world/index";
import { terrainRecordFor, terrainRecordIds } from "../../../../../packages/engine/src/agent-api/world/terrain";
import { terrainDiagnostics } from "../../../../../packages/engine/src/production-runtime/world/TerrainRuntime";
import type { SceneSpec } from "../../../shared/types";

/** True when the capture's flag list resolves `A3D_QR_WORLD` on (`world`, `all`, `$ALL` lists, …). */
export function worldOn(qrFlags: readonly string[] | undefined): boolean {
  if (!qrFlags || qrFlags.length === 0) return false;
  // One comma list, so `-world` exclusions apply (an array input drops them: #1116).
  return resolveQrFlags({ options: [qrFlags.join(",")], env: {} }).on("A3D_QR_WORLD");
}

/**
 * World builders serialize to C-36 world nodes (`kind: "terrain" | "water" |
 * "grass"`) that the prd10 node handlers compile; `AuraSceneNode` does not
 * list those kinds yet, so the serialized node is passed through as input.
 */
const asNode = (builder: { toJSON(): unknown }): AuraNodeInput => builder.toJSON() as unknown as AuraNodeInput;

interface WorldScene {
  /** Spec objects the world nodes replace (by name). */
  readonly replaces: readonly string[];
  readonly nodes: () => readonly AuraNodeInput[];
}

const meadowLayers = [
  { name: "grass-meadow", preset: "grass-meadow" as const },
  { name: "rock-cliff", preset: "rock-cliff" as const },
  { name: "snow", preset: "snow" as const }
];

function terrainFlyover(): readonly AuraNodeInput[] {
  return [
    asNode(world.terrain({
      id: "prd10-flyover-terrain",
      size: [220, 220],
      origin: [-110, -0.5, -110],
      heightScale: 16,
      height: { kind: "procedural", seed: 11, octaves: 5, baseFrequency: 2.2, ridged: 0.35 },
      layers: meadowLayers,
      collider: false,
      castShadow: true
    }))
  ];
}

function terrainLayers(): readonly AuraNodeInput[] {
  return [
    asNode(world.terrain({
      id: "prd10-layers-terrain",
      size: [120, 80],
      origin: [-60, 0, -40],
      heightScale: 9,
      height: { kind: "procedural", seed: 23, octaves: 4, baseFrequency: 2.6, terrace: 0.2 },
      layers: [
        { name: "grass-meadow", preset: "grass-meadow" },
        { name: "dirt-path", preset: "dirt-path" },
        { name: "rock-scree", preset: "rock-scree" },
        { name: "sand-beach", preset: "sand-beach" }
      ],
      collider: false
    }))
  ];
}

function meadowGrass(): readonly AuraNodeInput[] {
  const terrain = world.terrain({
    id: "prd10-meadow-terrain",
    size: [60, 60],
    origin: [-30, 0, -30],
    heightScale: 1.2,
    height: { kind: "procedural", seed: 5, octaves: 3, baseFrequency: 1.5 },
    layers: [{ name: "grass-meadow", preset: "grass-meadow" }, { name: "dirt-path", preset: "dirt-path" }],
    collider: false
  });
  return [asNode(terrain), asNode(world.grass({ id: "prd10-meadow-grass", terrain: terrain.handle }))];
}

function coastWater(): readonly AuraNodeInput[] {
  return [
    asNode(world.terrain({
      id: "prd10-coast-terrain",
      size: [140, 120],
      origin: [-70, -2.5, -100],
      heightScale: 7,
      height: { kind: "procedural", seed: 41, octaves: 4, baseFrequency: 1.8 },
      layers: [
        { name: "sand-beach", preset: "sand-beach" },
        { name: "grass-dry", preset: "grass-dry" },
        { name: "rock-cliff", preset: "rock-cliff" }
      ],
      collider: false
    })),
    asNode(world.water({ id: "prd10-coast-sea", kind: "ocean", shape: { kind: "infinite", radius: 400 }, height: 0.4, waves: "moderate" }))
  ];
}

const WORLD_SCENES: Readonly<Record<string, WorldScene>> = {
  "prd10-terrain-flyover": { replaces: ["terrain ground", "terrain hills"], nodes: terrainFlyover },
  "prd10-terrain-layers": { replaces: ["grass layer", "rock layer", "sand layer", "scree layer", "terrain hills"], nodes: terrainLayers },
  "prd10-meadow-grass": { replaces: ["meadow floor", "grass blades"], nodes: meadowGrass },
  "prd10-coast-water": { replaces: ["sea", "beach", "terrain hills"], nodes: coastWater }
};

/** Scene ids whose adapters render real world nodes when `world` is on. */
export const PRD10_WORLD_SCENE_IDS: readonly string[] = Object.keys(WORLD_SCENES);

/** The spec to render: stand-ins removed when the world nodes replace them. */
export function prd10SpecFor(spec: SceneSpec, on: boolean): SceneSpec {
  const entry = WORLD_SCENES[spec.id];
  if (!on || !entry) return spec;
  return { ...spec, objects: spec.objects.filter((object) => !entry.replaces.includes(object.name)) };
}

/** World nodes appended to the built scene (empty when `world` is off or the scene has none yet). */
export function prd10WorldNodes(sceneId: string, on: boolean): readonly AuraNodeInput[] {
  const entry = WORLD_SCENES[sceneId];
  return on && entry ? entry.nodes() : [];
}

/**
 * ReadyPayload.extra.world: what the world runtime actually did this capture
 * (C-36 world diagnostics, registered terrain records with resolved grids, and
 * whether the prd10 frame contributor is active for the app's flags) so a
 * none-vs-world frame difference — or its absence — is attributable.
 */
export function prd10WorldEvidence(app: AuraApp, qrFlags: readonly string[]): Readonly<Record<string, unknown>> {
  // The engine's own C-31 "world" section (collected by the engine's module
  // instances), not this adapter's imports.
  let diagnostics: unknown = null;
  try {
    diagnostics = (app.diagnostics() as unknown as { world?: unknown }).world ?? null;
  } catch (error) {
    diagnostics = { error: error instanceof Error ? error.message : String(error) };
  }
  // Same (array) input createAuraApp resolves, so this is the app's flag view.
  const flags = resolveQrFlags({ options: [...qrFlags], env: {} });
  return {
    world: {
      diagnostics,
      flagOn: flags.on("A3D_QR_WORLD"),
      terrainRecords: terrainRecordIds().map((id) => ({ id, grid: terrainRecordFor(id)?.grid != null })),
      terrainDraws: terrainDiagnostics(),
      contributors: frameContributors(flags as unknown as Parameters<typeof frameContributors>[0]).map((c) => c.id),
      errors: app.diagnostics().errors.slice(0, 5)
    }
  };
}
