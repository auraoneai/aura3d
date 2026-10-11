/**
 * 02-S1 — PRD-02 legacy golden over all 18 C-30 base scenes (flag off).
 *
 * With A3D_QR_LIGHTING off, the CPU RenderSource lighting terms of every base
 * scene (environment lighting bundle incl. texture byte hashes, collected
 * lights, shadow options) must be byte-equal to the `85aafcd0` lineage.
 *
 * Fixtures (tests/qr/prd02/golden/):
 * - `base-scene-snapshots.json`: the 18 `AuraSceneSnapshot`s produced by the
 *   benchmark translator (`benchmarks/quality-rebuild/aura3d/common.ts`
 *   `buildAuraScene(getSceneSpec(id))`) on 1faf31b7, with the 16-instancing
 *   per-instance `instances`/`instanceColors` arrays removed (the legacy
 *   functions never read them; outputs were identical with and without).
 * - `golden-85aafcd0.json`: those snapshots fed through the 85aafcd0
 *   `createProductionRuntimeEnvironment` / `...CollectedLights` /
 *   `...ShadowOptions` (agent-api/index.ts at 85aafcd0) and the projection
 *   below. Regenerate only from a detached 85aafcd0 worktree with this same
 *   projection; never from current code.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { createProductionRuntimeEnvironment } from "../../../../packages/engine/src/agent-api/compiler/environment.js";
import { createProductionRuntimeCollectedLights } from "../../../../packages/engine/src/agent-api/compiler/observations.js";
import { createProductionRuntimeShadowOptions } from "../../../../packages/engine/src/agent-api/compiler/shadows.js";
import type { AuraSceneSnapshot } from "../../../../packages/engine/src/agent-api/index";
import "../../../../packages/engine/src/lanes/index"; // lane registrations must not perturb flag-off paths

const FIXTURES = new URL("../../../qr/prd02/golden/", import.meta.url);
const snapshots = JSON.parse(readFileSync(new URL("base-scene-snapshots.json", FIXTURES), "utf8")) as Record<string, AuraSceneSnapshot>;
const golden = JSON.parse(readFileSync(new URL("golden-85aafcd0.json", FIXTURES), "utf8")) as Record<string, unknown>;

const BASE_SCENES = [
  "01-simple-geometry", "02-pbr-product", "03-damaged-helmet", "04-clearcoat", "05-transmission",
  "06-metal-roughness-sweep", "07-sheen-fabric", "08-skinned-character", "09-outdoor-environment",
  "10-indoor-environment", "11-multiple-lights", "12-shadows", "13-ibl-only", "14-particles",
  "15-animation-skinning", "16-instancing", "17-large-environment", "18-game-scene"
] as const;

// ---- projection (must stay identical to the one that produced the golden) ----
const round = (v: number): number => Math.round(v * 1e6) / 1e6;

function hashBytes(value: unknown, hash: ReturnType<typeof createHash>, seen = new Set<unknown>()): void {
  if (value === null || value === undefined || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (ArrayBuffer.isView(value)) {
    hash.update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) hashBytes(v, hash, seen);
    return;
  }
  for (const key of Object.keys(value).sort()) hashBytes((value as Record<string, unknown>)[key], hash, seen);
}

function textureSummary(t: Record<string, unknown>): unknown {
  const hash = createHash("sha256");
  hashBytes(t, hash);
  return {
    label: t.label ?? null, width: t.width ?? null, height: t.height ?? null,
    format: t.format ?? null, dimension: t.dimension ?? "2d", bytesSha256: hash.digest("hex")
  };
}

function project(v: unknown): unknown {
  if (typeof v === "number") return round(v);
  if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>, round);
  if (Array.isArray(v)) return v.map(project);
  if (v && typeof v === "object") {
    const o = v as Record<string, any>;
    if (o.texture && typeof o.texture === "object" && "width" in o.texture) {
      return {
        name: o.name ?? null,
        texture: textureSummary(o.texture),
        sampler: o.sampler
          ? { minFilter: o.sampler.minFilter, magFilter: o.sampler.magFilter, addressU: o.sampler.addressU, addressV: o.sampler.addressV }
          : null
      };
    }
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, project(o[k])]));
  }
  return v;
}

function cpuTerms(snapshot: AuraSceneSnapshot): unknown {
  const env = createProductionRuntimeEnvironment(snapshot) as any;
  const lights = createProductionRuntimeCollectedLights(snapshot) as readonly any[];
  const shadows = (createProductionRuntimeShadowOptions as (s: AuraSceneSnapshot, l: readonly unknown[]) => unknown)(snapshot, lights);
  return project({
    env: { preset: env.preset, intensity: env.intensity, lighting: env.lighting, hdriUrl: env.hdriUrl ?? null },
    lights: lights.map((l) => ({
      kind: l.kind, color: l.color, intensity: l.intensity, position: l.position, direction: l.direction,
      range: l.range, spotAngle: l.spotAngle, penumbra: l.penumbra, castsShadow: l.castsShadow, layerMask: l.layerMask
    })),
    shadows: shadows ?? null
  });
}


// This file pins the A3D_QR_LIGHTING-off contract. The compile path reads the
// ambient env (compiler/lights.ts prd02LightingOn), and lighting is now
// default-on (flags.state.ts), so pin it off explicitly.
beforeAll(() => {
  vi.stubEnv("A3D_QR_LIGHTING", "0");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("02-S1 prd02 legacy golden — 18 C-30 base scenes, flag off (85aafcd0 lineage)", () => {
  it("fixtures cover exactly the 18 base scenes", () => {
    expect(Object.keys(snapshots).sort()).toEqual([...BASE_SCENES]);
    expect(Object.keys(golden).sort()).toEqual([...BASE_SCENES]);
  });

  for (const id of BASE_SCENES) {
    it(`${id}: CPU lighting terms are byte-equal to 85aafcd0`, () => {
      // Texture bytes are compared through their SHA-256; every other term is
      // compared value-for-value after the 1e-6 rounding of the projection.
      expect(JSON.parse(JSON.stringify(cpuTerms(snapshots[id]!)))).toStrictEqual(golden[id]);
    });
  }
});
