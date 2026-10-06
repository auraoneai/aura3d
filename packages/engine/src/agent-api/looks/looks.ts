// PRD-13 T1.2/T1.3 — the `looks` authoring surface (PRD §7.1). `looks.preset`
// returns an `AuraGroupNode` named `aura-look:<id>` whose children are today's
// builders (v0), or an `AuraLookNode` under forced/provided v1 (compiled by the
// C-36 NodeHandler in T1.13). Overrides are clamped per C-34. `appOptions`
// carries the v0 renderer settings so they live in the engine, not in authored
// code. Nothing here is flag-gated itself — the expansion choice consults each
// required slot's `provided`/`flag` (CONTRACTS §5.2 sources 2–4).

import type { QrFlagName, QrFlags } from "@aura3d/rendering/contracts";
import { environmentProbeFactorySlot } from "@aura3d/rendering/contracts";
import type {
  AuraCreateAppOptions,
  AuraGroupNode,
  AuraSceneNode,
  AuraSceneSnapshot
} from "../index.js";
import { AuraNodeBuilder, defineAuraAssets, effects, environments, lights } from "../index.js";
import type { AuraLookDiagnostics, AuraLookId, AuraLookNode, AuraLookOverrides } from "../../contracts/looks.js";
import { worldQueriesSlot } from "../../contracts/world.js";
import { appExtensionsAll } from "../../contracts/app.js";
import { resolveQrFlags } from "../../contracts/flags.js";
import { lookPresets, type AuraLookPreset } from "./lookPresets.js";
import { authoredLookIds } from "./lookLint.js";

export interface AuraLookBuildOptions {
  /** Default "auto": v1 iff every required slot is provided and its flag is on. */
  readonly expansion?: "v0" | "v1" | "auto";
  /** Pass the app's flags when they are set in code (else URL/env resolved). */
  readonly flags?: QrFlags;
}

type MissingContract = AuraLookDiagnostics["missingContracts"][number];
type LookFlag = QrFlagName;

interface LookContractRequirement {
  readonly key: MissingContract;
  readonly flag: LookFlag;
  /** Extra flags the capability also needs on (ANDed with `flag`). */
  readonly alsoFlags?: readonly LookFlag[];
  /** Slot `provided` (or the app-extension equivalent when no slot exists). */
  provided(): boolean;
}

/** A PR 0a app extension is "provided" once a non-prd15 lane registers it. */
function appExtensionProvided(member: "lighting" | "post" | "output" | "quality"): boolean {
  return appExtensionsAll().some((entry) => entry.member === member && entry.owner !== "prd15");
}

/**
 * The five contracts a v1 expansion needs (C-34 missingContracts). Slots exist
 * today only for C-09 and C-26; the other three read the C-38 app-extension
 * registry (a non-prd15 entry = a real provider landed). `stubLookContractRequirements`
 * is the test seam for §7.1's "test doubles for the slots".
 */
const lookContractRequirements: readonly LookContractRequirement[] = [
  {
    key: "environments.preset", // C-09
    flag: "A3D_QR_LIGHTING",
    provided: () => environmentProbeFactorySlot.provided
  },
  {
    key: "lights.hemisphere", // C-10
    flag: "A3D_QR_LIGHTING",
    provided: () => appExtensionProvided("lighting")
  },
  {
    key: "output.preset", // C-13 + C-05
    flag: "A3D_QR_POST",
    alsoFlags: ["A3D_QR_CORE"],
    provided: () => appExtensionProvided("post") && appExtensionProvided("output")
  },
  {
    key: "world.biome", // C-26
    flag: "A3D_QR_WORLD",
    provided: () => worldQueriesSlot.provided
  },
  {
    key: "quality.auto", // C-27
    flag: "A3D_QR_TIERS",
    provided: () => appExtensionProvided("quality")
  }
];

/** Test seam: mark the named contracts provided; returns a restore function. */
export function stubLookContractRequirements(provided: readonly MissingContract[]): () => void {
  const set = new Set(provided);
  const originals = lookContractRequirements.map((req) => req.provided);
  const mutable = lookContractRequirements as unknown as { provided: () => boolean }[];
  lookContractRequirements.forEach((req, index) => {
    mutable[index].provided = () => set.has(req.key);
  });
  return () => {
    lookContractRequirements.forEach((req, index) => {
      mutable[index].provided = originals[index];
    });
  };
}

function resolveFlags(options?: AuraLookBuildOptions): QrFlags {
  if (options?.flags) return options.flags;
  const env = typeof process !== "undefined" && process.env ? process.env : {};
  const url = typeof location !== "undefined" ? location.href : undefined;
  return resolveQrFlags({ url, env });
}

/** A3D_QR_LOOKS_EXPANSION=v0|v1|auto (C-34 keeps A3D_LOOK_EXPANSION as alias). */
function expansionOverride(options: AuraLookBuildOptions | undefined, flags: QrFlags): "v0" | "v1" | "auto" {
  if (options?.expansion) return options.expansion;
  const env = typeof process !== "undefined" ? process.env : undefined;
  const raw = env?.A3D_QR_LOOKS_EXPANSION ?? env?.A3D_LOOK_EXPANSION ?? flags.values["A3D_QR_LOOKS_EXPANSION"];
  return raw === "v1" || raw === "v0" ? raw : "auto";
}

export interface ResolvedLookExpansion {
  readonly expansion: "v1-contracts" | "v0-current-engine";
  readonly missingContracts: readonly MissingContract[];
}

export function resolveLookExpansion(options?: AuraLookBuildOptions): ResolvedLookExpansion {
  const flags = resolveFlags(options);
  const mode = expansionOverride(options, flags);
  if (mode === "v0") return { expansion: "v0-current-engine", missingContracts: [] };
  const missing = lookContractRequirements
    .filter(
      (req) =>
        !(req.provided() && flags.on(req.flag) && (req.alsoFlags ?? []).every((flag) => flags.on(flag)))
    )
    .map((req) => req.key);
  if (mode === "v1" || missing.length === 0) {
    return { expansion: "v1-contracts", missingContracts: missing };
  }
  return { expansion: "v0-current-engine", missingContracts: missing };
}

// ---------------------------------------------------------------------------
// Overrides (T1.3): clamped per C-34. sun.azimuthDeg wraps into [0,360),
// elevationDeg clamps to [-90,90], exposureEv to [-2,2], fogDensityScale to
// [0,3]. `accent`/`background` pass through unchanged.
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function clampLookOverrides(overrides: AuraLookOverrides | undefined): AuraLookOverrides | undefined {
  if (overrides === undefined) return undefined;
  const out: {
    sun?: { azimuthDeg?: number; elevationDeg?: number };
    exposureEv?: number;
    fogDensityScale?: number;
    accent?: AuraLookOverrides["accent"];
    background?: AuraLookOverrides["background"];
  } = {};
  if (overrides.sun) {
    out.sun = {};
    if (overrides.sun.azimuthDeg !== undefined) {
      const az = Number.isFinite(overrides.sun.azimuthDeg) ? overrides.sun.azimuthDeg % 360 : 0;
      out.sun.azimuthDeg = az < 0 ? az + 360 : az;
    }
    if (overrides.sun.elevationDeg !== undefined) out.sun.elevationDeg = clamp(overrides.sun.elevationDeg, -90, 90);
  }
  if (overrides.exposureEv !== undefined) out.exposureEv = clamp(overrides.exposureEv, -2, 2);
  if (overrides.fogDensityScale !== undefined) out.fogDensityScale = clamp(overrides.fogDensityScale, 0, 3);
  if (overrides.accent !== undefined) out.accent = overrides.accent;
  if (overrides.background !== undefined) out.background = overrides.background;
  return out;
}

/** Directional key position from sun angles (same basis as lookPresets). */
function sunPosition(elevationDeg: number, azimuthDeg: number, distance = 24): [number, number, number] {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return [
    Number((distance * Math.cos(el) * Math.sin(az)).toFixed(3)),
    Number((distance * Math.sin(el)).toFixed(3)),
    Number((distance * Math.cos(el) * Math.cos(az)).toFixed(3))
  ];
}

/** Derive the preset's sun angles back from its stored key position. */
function sunAngles(position: readonly [number, number, number]): { elevationDeg: number; azimuthDeg: number } {
  const [x, y, z] = position;
  const distance = Math.hypot(x, y, z) || 1;
  return {
    elevationDeg: (Math.asin(y / distance) * 180) / Math.PI,
    azimuthDeg: (Math.atan2(x, z) * 180) / Math.PI
  };
}

/**
 * Canonical typed refs for the §7.1.1 HDRI corpus files. The scaffold copies
 * `fixtures/environment-corpus/hdri/<file>.hdr` into each template's `public/`
 * and admits it via `aura3d assets add --type texture` under the same id —
 * so the engine can reference it by name at authoring time.
 */
// Built lazily on first use — a module-level `defineAuraAssets` here runs
// during `agent-api/index.ts` import evaluation (via promptRecipes → looks)
// and hits `auraAssetRefBrand`'s TDZ.
type LookHdriAssets = ReturnType<typeof buildLookHdriAssets>;
let lookHdriAssetsCache: LookHdriAssets | undefined;
function buildLookHdriAssets() {
  return defineAuraAssets({
    autumnFieldPuresky1k: { type: "texture", format: "hdr", url: "/hdri/autumn_field_puresky_1k.hdr" },
    kloppenheim06Puresky1k: { type: "texture", format: "hdr", url: "/hdri/kloppenheim_06_puresky_1k.hdr" },
    studioSmall081k: { type: "texture", format: "hdr", url: "/hdri/studio_small_08_1k.hdr" }
  });
}
function lookHdriAssets(): LookHdriAssets {
  return (lookHdriAssetsCache ??= buildLookHdriAssets());
}

const HDRI_ASSET = {
  get autumn_field_puresky_1k() { return lookHdriAssets().autumnFieldPuresky1k; },
  get kloppenheim_06_puresky_1k() { return lookHdriAssets().kloppenheim06Puresky1k; },
  get studio_small_08_1k() { return lookHdriAssets().studioSmall081k; }
} as const;

function applyOverrides(preset: AuraLookPreset, overrides: AuraLookOverrides | undefined): AuraLookPreset["v0"] {
  if (overrides === undefined) return preset.v0;
  const v0 = {
    ...preset.v0,
    key: { ...preset.v0.key },
    fog: preset.v0.fog ? { ...preset.v0.fog } : undefined,
    grade: { ...preset.v0.grade }
  };
  if (overrides.sun) {
    const base = sunAngles(preset.v0.key.position);
    const az = overrides.sun.azimuthDeg ?? base.azimuthDeg;
    const el = overrides.sun.elevationDeg ?? base.elevationDeg;
    v0.key = { ...v0.key, position: sunPosition(el, az) };
  }
  if (overrides.fogDensityScale !== undefined && v0.fog) {
    const scale = overrides.fogDensityScale;
    // near/far stored in the preset: density scales inversely with range.
    v0.fog = { ...v0.fog, near: v0.fog.near / Math.max(scale, 1e-3), far: v0.fog.far / Math.max(scale, 1e-3) };
  }
  if (overrides.background !== undefined && overrides.background !== "look") {
    v0.background = overrides.background;
  }
  return v0;
}

/** Flat v0 children for a preset (the group's contents, and `looks.nodes`). */
function v0Children(preset: AuraLookPreset, overrides: AuraLookOverrides | undefined): AuraSceneNode[] {
  const v0 = applyOverrides(preset, overrides);
  const children: AuraSceneNode[] = [];
  if (v0.hdri !== null) {
    children.push(
      environments.hdri({
        name: `look hdri ${v0.hdri}`,
        intensity: v0.environmentIntensity,
        texture: HDRI_ASSET[v0.hdri]
      }).toJSON()
    );
  }
  children.push(
    lights.directional({
      name: "look key light",
      position: v0.key.position,
      intensity: v0.key.intensity,
      color: v0.key.color,
      shadow: true
    }).toJSON()
  );
  if (v0.rim) {
    children.push(
      lights.directional({
        name: "look rim light",
        position: v0.rim.position,
        intensity: v0.rim.intensity,
        color: overrides?.accent ?? v0.rim.color
      }).toJSON()
    );
  }
  if (v0.fog && (overrides?.fogDensityScale ?? 1) > 0) {
    children.push(
      effects.fog({
        name: "look fog",
        color: v0.fog.color,
        // Base density derived from the preset range; fogDensityScale applies on top.
        density: 24 / Math.max(v0.fog.far, 1)
      }).toJSON()
    );
  }
  if (v0.effects.includes("colorGrade")) {
    children.push(
      effects.colorGrade({
        name: "look color grade",
        contrast: v0.grade.contrast,
        saturation: v0.grade.saturation,
        exposure: Math.pow(2, overrides?.exposureEv ?? 0)
      }).toJSON()
    );
  }
  if (v0.effects.includes("ambientOcclusion")) {
    children.push(effects.ambientOcclusion({ name: "look ambient occlusion" }).toJSON());
  }
  if (v0.effects.includes("bloom")) {
    children.push(
      effects.bloom({ name: "look bloom", ...(overrides?.accent ? { color: overrides.accent } : {}) }).toJSON()
    );
  }
  // "antiAlias-msaa" is a renderer setting, not a node — it flows through
  // looks.appOptions().renderer, never as an authored fxaa node.
  return children;
}

function describeOrThrow(id: AuraLookId): AuraLookPreset {
  const preset = lookPresets[id];
  if (preset === undefined) throw new Error(`LOOK_UNKNOWN:${id}`);
  return preset;
}

/** Flat v0 children for a look id (same list the `aura-look:<id>` group
 *  carries). The C-36 `look` NodeHandler emits these when it falls back
 *  (T1.13); exported for it, not part of the authoring surface. */
export function expandLookChildren(
  id: AuraLookId,
  overrides?: AuraLookOverrides
): readonly AuraSceneNode[] {
  return v0Children(describeOrThrow(id), clampLookOverrides(overrides));
}

export const looks = {
  /**
   * v0 → AuraGroupNode "aura-look:<id>" with today's env/light/effect children.
   * v1 → the AuraLookNode the C-36 NodeHandler compiles (T1.13). v1 needs every
   * required contract provided and its flag on; forced v1 emits the node even
   * when slots are stubbed (the handler then records `capability-degraded`).
   */
  preset(
    id: AuraLookId,
    overrides?: AuraLookOverrides,
    options?: AuraLookBuildOptions
  ): AuraNodeBuilder<AuraGroupNode> | AuraLookNode {
    const preset = describeOrThrow(id);
    const clamped = clampLookOverrides(overrides);
    const expansion = resolveLookExpansion(options);
    if (expansion.expansion === "v1-contracts") {
      return { kind: "look", look: id, ...(clamped ? { overrides: clamped } : {}) };
    }
    return new AuraNodeBuilder<AuraGroupNode>({
      kind: "group",
      name: `aura-look:${id}`,
      // The look's horizon-matched background rides on the group so consumers
      // (the C-36 handler, diagnostics, lint, template authors via
      // `looks.describe(id).v0.background`) read it without re-deriving.
      background:
        clamped?.background !== undefined && clamped.background !== "look"
          ? clamped.background
          : preset.v0.background,
      children: v0Children(preset, clamped)
    } as AuraGroupNode);
  },

  /** Flat v0 children (same list the group carries). */
  nodes(id: AuraLookId, overrides?: AuraLookOverrides): readonly AuraNodeBuilder<AuraSceneNode>[] {
    const preset = describeOrThrow(id);
    return v0Children(preset, clampLookOverrides(overrides)).map((node) => new AuraNodeBuilder(node));
  },

  /** v0 only: renderer quality + DPR cap live here, not in authored code.
   *  Returns {} when the expansion resolves to v1 (C-27 takes over, §7.1). */
  appOptions(id: AuraLookId, options?: AuraLookBuildOptions): Pick<AuraCreateAppOptions, "pixelRatio" | "renderer"> {
    describeOrThrow(id);
    if (resolveLookExpansion(options).expansion === "v1-contracts") return {};
    const dpr = typeof globalThis.devicePixelRatio === "number" ? globalThis.devicePixelRatio : 1;
    return {
      renderer: { qualityProfile: "production" },
      pixelRatio: Math.min(dpr, 2)
    };
  },

  list(): readonly AuraLookId[] {
    return Object.keys(lookPresets) as AuraLookId[];
  },

  describe(id: AuraLookId): AuraLookPreset {
    return describeOrThrow(id);
  },

  /**
   * Which look a snapshot actually carries (§7.1 source labels). Authored
   * nodes win; `biome-default`/`neutral-env` are runtime-applied states the
   * C-31 assembly reports — until then the source is `none` and the id
   * `"engine-default"`. T1.3: a second authored look makes the last one win.
   */
  resolveDefault(snapshot: AuraSceneSnapshot): {
    readonly id: AuraLookId | "engine-default";
    readonly source: "authored" | "biome-default" | "neutral-env" | "none";
  } {
    const ids = authoredLookIds(snapshot);
    if (ids.length > 0) return { id: ids[ids.length - 1], source: "authored" };
    return { id: "engine-default", source: "none" };
  }
} as const;

export type LooksApi = typeof looks;
