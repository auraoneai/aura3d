/**
 * Audit lane E2 (live-games 4.5.0 audit): LIGHT-04, LIGHT-05, LIGHT-07, LIGHT-08.
 *
 * - LIGHT-05: an authored hemisphere light next to an environment node used to be dropped (prd02.explicit passed no
 *   hemisphere); it now reaches the PRD-02 chunk.
 * - LIGHT-08: the hemisphere was a flat mean(sky, ground) inside the ambient term; it is now the directional
 *   u_hemiSky/u_hemiGround/u_hemiDirection pair the chunk evaluates per normal (three.js r185 HemisphereLight).
 * - LIGHT-04: a look added at runtime next to an authored ambient keeps its fill only if resolution skips the yield
 *   rule toJSON applies; resolution now applies it.
 * - LIGHT-07: the environment knob is recomputed when runtime adds change the environment or light nodes.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { AuraSceneSnapshot } from "@aura3d/engine";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { resolveEnvironment } from "../../../packages/engine/src/contracts/environment";
import {
  createProductionRuntimeEnvironment,
  environmentKnobKey,
  prd02HemisphereTerm,
  prd02LightTerms,
  registerPrd02EnvironmentSources
} from "../../../packages/engine/src/agent-api/compiler/environment";
import { colorToLinearRgb } from "../../../packages/engine/src/agent-api/colorUtils";
import "../../../packages/rendering/src/lanes/prd02";
import { applyPrd02EnvironmentUniforms, prd02AmbientAndHemisphere } from "../../../packages/rendering/src/ForwardPass";
import { resolvePrd02EnvironmentLighting } from "../../../packages/rendering/src/renderer/Background";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { buildNeutralRoomLegacyProbe } from "../../../packages/rendering/src/environment/probeBuild";
import { LIGHTING_IBL_CALL_GLSL } from "../../../packages/rendering/src/shaders/chunks/lighting_ibl.glsl";
import { ambientToExitRadiance } from "../../../packages/rendering/src/LightUniforms";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIGHTING = resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true } });
const BASE = resolveQrFlags({ options: ["none"] });
afterEach(() => setRendererQrFlags(BASE));

const snapshot = (nodes: readonly unknown[]): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0",
  background: "#000000",
  camera: { mode: "orbit", position: [0, 2, 5], target: [0, 0, 0] },
  nodes: nodes as never,
  diagnostics: { enabled: false }
});

const hemi = { kind: "light", light: "hemisphere", name: "h", intensity: 0.8, color: "#bcd7ff", groundColor: "#352f28", position: [0, 1, 0] };
const ambient = { kind: "light", light: "ambient", name: "a", intensity: 0.4, color: "#ffffff" };
const sun = { kind: "light", light: "directional", name: "sun", intensity: 2, color: "#ffffff", position: [3, 4, 3] };
const hdri = { kind: "environment", environment: "hdri", intensity: 0.9, texture: { kind: "aura-asset-ref", url: "/aura-environments/x.hdr" } };
const sky = colorToLinearRgb("#bcd7ff");
const ground = colorToLinearRgb("#352f28");

registerPrd02EnvironmentSources();

describe("LIGHT-08: lights-only scenes bind the hemisphere as a directional pair", () => {
  it("neutral-room resolution carries the ambient alone and the sky/ground pair premultiplied by intensity", () => {
    const resolution = resolveEnvironment(snapshot([hemi, ambient, sun]), "high", LIGHTING);
    expect(resolution.kind).toBe("neutral-room");
    expect(resolution.ambient?.intensity).toBeCloseTo(0.4, 6);
    expect(resolution.ambient?.color).toBe("#ffffff");
    for (let i = 0; i < 3; i += 1) {
      expect(resolution.hemisphere!.sky[i]).toBeCloseTo(sky[i]! * 0.8, 6);
      expect(resolution.hemisphere!.ground[i]).toBeCloseTo(ground[i]! * 0.8, 6);
    }
    expect(resolution.hemisphere!.direction).toEqual([0, 1, 0]);
  });

  it("no hemisphere light: no pair and the ambient term is unchanged", () => {
    const resolution = resolveEnvironment(snapshot([ambient, sun]), "high", LIGHTING);
    expect(resolution.hemisphere ?? null).toBeNull();
    expect(resolution.ambient?.intensity).toBeCloseTo(0.4, 6);
  });

  it("a second, differently aimed hemisphere is folded into the ambient as its flat mean", () => {
    const tilted = { ...hemi, name: "h2", intensity: 0.2, position: [1, 0, 0] };
    const terms = prd02LightTerms(snapshot([hemi, tilted]));
    expect(terms.hemisphere!.sky[0]).toBeCloseTo(sky[0]! * 0.8, 6);
    const mean = [0, 1, 2].map((i) => ((sky[i]! + ground[i]!) / 2) * 0.2);
    expect(terms.ambient!.intensity).toBeCloseTo(Math.max(...mean), 5);
  });

  it("the hemisphere direction follows the light position (three's HemisphereLight up)", () => {
    const term = prd02HemisphereTerm(snapshot([{ ...hemi, position: [0, 0, 2] }]));
    expect(term!.direction).toEqual([0, 0, 1]);
  });
});

describe("LIGHT-05: an authored hemisphere next to an environment node contributes", () => {
  it("prd02.explicit resolution carries the hemisphere pair (it was dropped before)", () => {
    const resolution = resolveEnvironment(snapshot([hdri, hemi, sun]), "high", LIGHTING);
    expect(resolution.kind).toBe("explicit");
    expect(resolution.hemisphere).toBeTruthy();
    expect(resolution.hemisphere!.sky[2]).toBeCloseTo(sky[2]! * 0.8, 6);
    expect(resolution.ambient).toBeNull();
  });
});

describe("Background and ForwardPass carry the pair to the PRD-02 chunk", () => {
  const probe = buildNeutralRoomLegacyProbe();
  const pair = { sky: [sky[0]! * 0.8, sky[1]! * 0.8, sky[2]! * 0.8] as const, ground: [ground[0]! * 0.8, ground[1]! * 0.8, ground[2]! * 0.8] as const, direction: [0, 1, 0] as const };

  it("the lighting object folds the flat mean into color/intensity for ambient-only programs and keeps the pair", () => {
    setRendererQrFlags(LIGHTING);
    const lighting = resolvePrd02EnvironmentLighting({
      environmentProbe: probe,
      environmentProbeAmbient: { color: [1, 1, 1], intensity: 0.4 },
      environmentProbeHemisphere: pair
    } as never)!;
    for (let i = 0; i < 3; i += 1) {
      expect(lighting.color[i]! * lighting.intensity).toBeCloseTo(0.4 + (pair.sky[i]! + pair.ground[i]!) / 2, 6);
    }
    expect(lighting.hemisphere?.sky[0]).toBeCloseTo(pair.sky[0], 9);
    const split = prd02AmbientAndHemisphere(lighting);
    for (let i = 0; i < 3; i += 1) expect(split.ambient.color[i]! * split.ambient.intensity).toBeCloseTo(0.4, 6);
    expect(split.hemisphere?.ground[1]).toBeCloseTo(pair.ground[1], 9);
  });

  it("the memo returns a new lighting object when only the hemisphere changes", () => {
    setRendererQrFlags(LIGHTING);
    const base = { environmentProbe: probe, environmentProbeAmbient: null };
    const a = resolvePrd02EnvironmentLighting({ ...base, environmentProbeHemisphere: pair } as never)!;
    const b = resolvePrd02EnvironmentLighting({ ...base, environmentProbeHemisphere: { ...pair, sky: [1, 1, 1] } } as never)!;
    const c = resolvePrd02EnvironmentLighting({ ...base, environmentProbeHemisphere: null } as never)!;
    expect(a.hemisphere?.sky[0]).toBeCloseTo(pair.sky[0], 9);
    expect(b.hemisphere?.sky[0]).toBe(1);
    expect(c.hemisphere).toBeUndefined();
    expect(c.intensity).toBe(0);
  });

  it("the uniform pack binds u_hemiSky/u_hemiGround/u_hemiDirection and the ambient without the mean", () => {
    const uniforms = new Map<string, unknown>();
    const color: [number, number, number] = [0, 0, 0];
    const total = [0, 1, 2].map((i) => 0.4 + (pair.sky[i]! + pair.ground[i]!) / 2);
    const peak = Math.max(...total);
    for (let i = 0; i < 3; i += 1) color[i] = total[i]! / peak;
    applyPrd02EnvironmentUniforms(
      { color, intensity: peak, environmentProbe: probe, environmentMapIntensity: 0, environmentMapSpecularIntensity: 0, hemisphere: pair } as never,
      { label: "t" } as never,
      { getParameter: () => 1 } as never,
      uniforms as never
    );
    const skyU = uniforms.get("u_hemiSky") as number[];
    const groundU = uniforms.get("u_hemiGround") as number[];
    const ambientU = uniforms.get("u_ambientIrradiance") as number[];
    for (let i = 0; i < 3; i += 1) {
      expect(skyU[i]).toBeCloseTo(pair.sky[i]!, 9);
      expect(groundU[i]).toBeCloseTo(pair.ground[i]!, 9);
      expect(ambientU[i]).toBeCloseTo(ambientToExitRadiance([1, 1, 1], 0.4)[i]!, 6);
    }
    expect(uniforms.get("u_hemiDirection")).toEqual([0, 1, 0]);
  });

  it("no hemisphere: the pack is unchanged (ambient passed through, zero pair)", () => {
    const uniforms = new Map<string, unknown>();
    applyPrd02EnvironmentUniforms(
      { color: [1, 0.5, 0.25], intensity: 0.6, environmentProbe: probe, environmentMapIntensity: 1, environmentMapSpecularIntensity: 1 } as never,
      { label: "t" } as never,
      { getParameter: () => 1 } as never,
      uniforms as never
    );
    expect(uniforms.get("u_hemiSky")).toEqual([0, 0, 0]);
    expect(uniforms.get("u_ambientIrradiance")).toEqual(ambientToExitRadiance([1, 0.5, 0.25], 0.6));
  });

  it("the chunk applies the pair as a Lambert term outside the probe's multiscatter irradiance", () => {
    expect(LIGHTING_IBL_CALL_GLSL).toContain("vec3 a3dHemiIrradiance = mix(u_hemiGround, u_hemiSky, dot(N, u_hemiDirection) * 0.5 + 0.5);");
    expect(LIGHTING_IBL_CALL_GLSL).toContain("a3dPrd02Irradiance - u_ambientIrradiance - a3dHemiIrradiance");
    expect(LIGHTING_IBL_CALL_GLSL).toContain("(u_ambientIrradiance + a3dHemiIrradiance * 0.31830989) * material.diffuseContribution");
  });

  it("per-normal value matches three r185: up gets sky, down gets ground, horizontal keeps the old flat mean", () => {
    const evalHemi = (n: readonly [number, number, number]) => {
      const t = (n[0] * pair.direction[0] + n[1] * pair.direction[1] + n[2] * pair.direction[2]) * 0.5 + 0.5;
      return [0, 1, 2].map((i) => pair.ground[i]! + (pair.sky[i]! - pair.ground[i]!) * t);
    };
    const up = evalHemi([0, 1, 0]);
    const down = evalHemi([0, -1, 0]);
    const side = evalHemi([1, 0, 0]);
    for (let i = 0; i < 3; i += 1) {
      expect(up[i]).toBeCloseTo(pair.sky[i]!, 9);
      expect(down[i]).toBeCloseTo(pair.ground[i]!, 9);
      expect(side[i]).toBeCloseTo((pair.sky[i]! + pair.ground[i]!) / 2, 9);
    }
  });
});

describe("LIGHT-04: a runtime look fill yields to an authored ambient at resolution time", () => {
  const lookGroup = {
    kind: "group",
    name: "look",
    children: [
      { kind: "environment", environment: "neutral", intensity: 0.58, lookFill: true },
      { kind: "light", light: "directional", name: "look key light", intensity: 0.7, position: [2, 4, 2] }
    ]
  };

  it("an un-yielded snapshot (runtime add) resolves to the neutral room with the ambient, not to the fill", () => {
    const resolution = resolveEnvironment(snapshot([ambient, lookGroup]), "high", LIGHTING);
    expect(resolution.kind).toBe("neutral-room");
    expect(resolution.ambient?.intensity).toBeCloseTo(0.4, 6);
  });

  it("the knob ignores the yielded fill (authored-lights, IBL 0/0)", () => {
    const env = createProductionRuntimeEnvironment(snapshot([ambient, lookGroup]), LIGHTING, { implicitFill: false });
    expect(env.preset).toBe("authored-lights");
    expect(env.lighting.environmentMapIntensity).toBe(0);
  });

  it("without an authored ambient the look fill still lights the scene", () => {
    const resolution = resolveEnvironment(snapshot([lookGroup]), "high", LIGHTING);
    expect(resolution.kind).toBe("explicit");
    expect(resolution.intensity).toBeCloseTo(0.58, 6);
  });
});

describe("LIGHT-07: the knob key changes when an environment is added at runtime", () => {
  it("environmentKnobKey differs between the lights-only mount and the live set with an environment", () => {
    const mount = snapshot([sun, ambient]);
    const live = snapshot([sun, ambient, { kind: "environment", environment: "neutral", intensity: 0.7 }]);
    expect(environmentKnobKey(mount)).not.toBe(environmentKnobKey(live));
    expect(environmentKnobKey(mount)).toBe(environmentKnobKey(snapshot([sun, ambient])));
    // The recomputed knob carries the authored intensity (the mount knob was 0/0).
    expect(createProductionRuntimeEnvironment(mount, LIGHTING, { implicitFill: false }).lighting.environmentMapIntensity).toBe(0);
    expect(createProductionRuntimeEnvironment(live, LIGHTING, { implicitFill: false }).lighting.environmentMapIntensity).toBeCloseTo(0.7, 6);
  });

  it("non-lighting node changes keep the key (no recompute on gameplay adds)", () => {
    const box = { kind: "primitive", primitive: "box", name: "crate" };
    expect(environmentKnobKey(snapshot([sun, box]))).toBe(environmentKnobKey(snapshot([sun])));
  });
});

describe("the generated forward program with prd02.ibl still compiles (glslangValidator)", () => {
  const hasGlslang = spawnSync("glslangValidator", ["--version"], { encoding: "utf8" }).status === 0;
  it.skipIf(!hasGlslang && process.env.A3D_REQUIRE_GLSLANG !== "1")("fragment stage validates", () => {
    const program = generateProgramImpl(
      normalizeProgramFeatures({
        pass: "forward",
        lighting: "lit",
        environment: "pmrem-cube",
        lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: true },
        features: { "prd02.ibl": true }
      } as never),
      { flags: LIGHTING }
    );
    expect(program.fragment).toContain("a3dHemiIrradiance");
    const dir = mkdtempSync(join(tmpdir(), "e2-hemi-"));
    try {
      const file = join(dir, "forward.frag");
      writeFileSync(file, program.fragment);
      const run = spawnSync("glslangValidator", ["-S", "frag", file], { encoding: "utf8" });
      expect(run.stdout + run.stderr).not.toMatch(/ERROR/);
      expect(run.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
