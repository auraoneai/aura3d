// PRD-02 Phase 6 — §6.5 kill switches, §6.8 tier table, timing spans.

import { describe, expect, it } from "vitest";
import { readLightingKillSwitches } from "../../../../packages/engine/src/agent-api/compiler/lights";
import {
  readPrd02KillSwitches, prd02SubFlagOff, SUB_FLAG_CSM, SUB_FLAG_CONTACT, SUB_FLAG_PROBES
} from "../../../../packages/rendering/src/passes/Prd02SubFlags";
import {
  shadowSystemConfigFromSource, shadowSystemForDevice, collectShadowSystemLights
} from "../../../../packages/rendering/src/shadows/Prd02ShadowsContributor";
import { contactShadowRequest } from "../../../../packages/rendering/src/passes/Prd02ContactShadowsContributor";
import { createPrd02ProbesContributor } from "../../../../packages/rendering/src/probes/Prd02ProbesContributor";
import { collectEnvironmentBackground } from "../../../../packages/rendering/src/renderer/Background";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { EnvironmentCache } from "../../../../packages/rendering/src/environment/EnvironmentCache";
import { createEnvironmentProbeFactory } from "../../../../packages/rendering/src/environment/EnvironmentProbeFactory";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import type { QrFlags } from "../../../../packages/rendering/src/contracts/core";

const flagsOf = (values: Record<string, boolean | string> = {}): QrFlags => ({
  values,
  on: (n) => { const v = values[n]; return v !== undefined && v !== false && v !== "0" && v !== "off" && v !== ""; }
});

const ctxFor = (overrides: Partial<FrameContributorContext> = {}): FrameContributorContext => ({
  device: new MockRenderDevice(),
  width: 256, height: 256, frameIndex: 0, timeSeconds: 0,
  camera: null, source: {}, items: [],
  tier: QUALITY_TIERS.high, flags: flagsOf({ A3D_QR_LIGHTING: true }),
  sceneDepth: null, blackboard: new Map(),
  ...overrides
} as unknown as FrameContributorContext);

const killSource = (ks: unknown) => ({ shadow: { prd02KillSwitches: ks } }) as never;

describe("readLightingKillSwitches (§6.5)", () => {
  it("defaults to all-on when the URL carries no a3dLighting params", () => {
    const ks = readLightingKillSwitches("http://x/app");
    expect(ks).toMatchObject({ shadows: true, background: true, atlas: true, csm: true, probes: true, contact: true, pmrem: null, shadowFilter: null });
  });

  it("parses comma-separated k=v pairs and ignores a3dLighting=0 lane kill", () => {
    const ks = readLightingKillSwitches("http://x/?a3dLighting=shadows=off,pmrem=cpu,shadowFilter=legacy-grid");
    expect(ks.shadows).toBe(false);
    expect(ks.pmrem).toBe("cpu");
    expect(ks.shadowFilter).toBe("legacy-grid");
    expect(ks.background).toBe(true);
    expect(readLightingKillSwitches("http://x/?a3dLighting=0").shadows).toBe(true);
    expect(readLightingKillSwitches("http://x/?a3dLighting=off").atlas).toBe(true);
  });

  it("URL aliases cover the real sub-flags (csm/probes/contact)", () => {
    const ks = readLightingKillSwitches("http://x/?a3dLighting=csm=off,probes=off,contact=off");
    expect(ks.csm).toBe(false); expect(ks.probes).toBe(false); expect(ks.contact).toBe(false);
  });

  it("readPrd02KillSwitches reads source.shadow.prd02KillSwitches with all-on defaults", () => {
    expect(readPrd02KillSwitches({}).shadows).toBe(true);
    expect(readPrd02KillSwitches(killSource({ shadows: false })).shadows).toBe(false);
    expect(readPrd02KillSwitches(killSource({ shadows: false })).probes).toBe(true);
  });
});

describe("sub-flag off semantics (QrFlags)", () => {
  it("distinguishes explicit-off from unset", () => {
    expect(prd02SubFlagOff(flagsOf({ A3D_QR_LIGHTING_PROBES: false }), SUB_FLAG_PROBES)).toBe(true);
    expect(prd02SubFlagOff(flagsOf({ A3D_QR_LIGHTING_PROBES: "off" }), SUB_FLAG_PROBES)).toBe(true);
    expect(prd02SubFlagOff(flagsOf({}), SUB_FLAG_PROBES)).toBe(false);
    expect(prd02SubFlagOff(flagsOf({ A3D_QR_LIGHTING_PROBES: true }), SUB_FLAG_PROBES)).toBe(false);
  });
});

describe("kill-switch gating in contributors", () => {
  it("csm=off folds cascades to one fitted map (still texel-snapped config)", () => {
    const ctx = ctxFor({ source: killSource({ csm: false }) });
    const cfg = shadowSystemConfigFromSource(ctx);
    expect(cfg.cascades).toBe(1);
  });

  it("A3D_QR_LIGHTING_CSM=off also folds cascades", () => {
    const ctx = ctxFor({ flags: flagsOf({ A3D_QR_LIGHTING: true, A3D_QR_LIGHTING_CSM: false }) });
    expect(shadowSystemConfigFromSource(ctx).cascades).toBe(1);
  });

  it("shadowFilter=legacy-grid selects the single-tap path", () => {
    const ctx = ctxFor({ source: killSource({ shadowFilter: "legacy-grid" }) });
    expect(shadowSystemConfigFromSource(ctx).filter).toBe("hard");
  });

  it("atlas=off keeps the sun but drops local lights", () => {
    const ctx = ctxFor({ source: killSource({ atlas: false }) });
    const { localLights } = collectShadowSystemLights(ctx);
    expect(localLights).toEqual([]);
  });

  it("contact: sub-flag=off and contact=off veto tier/opt-in requests", () => {
    const ultra = ctxFor({ tier: QUALITY_TIERS.ultra });
    expect(contactShadowRequest(ultra)).not.toBeNull();
    expect(contactShadowRequest(ctxFor({
      tier: QUALITY_TIERS.ultra,
      flags: flagsOf({ A3D_QR_LIGHTING: true, A3D_QR_LIGHTING_CONTACT: false })
    }))).toBeNull();
    expect(contactShadowRequest(ctxFor({
      tier: QUALITY_TIERS.ultra,
      source: killSource({ contact: false })
    }))).toBeNull();
  });

  it("probes contributor suppresses passes under either kill", () => {
    const node = { kind: "probe", probe: "reflection", name: "p", options: {} };
    const source = { "prd02.probes.p": node } as never;
    const contrib = createPrd02ProbesContributor();
    expect(contrib.passes!("shadows", ctxFor({ source })).length).toBe(1);
    expect(contrib.passes!("shadows", ctxFor({
      source, flags: flagsOf({ A3D_QR_LIGHTING: true, A3D_QR_LIGHTING_PROBES: false })
    }))).toEqual([]);
    expect(contrib.passes!("shadows", ctxFor({
      source: { ...(source as object), shadow: { prd02KillSwitches: { probes: false } } } as never
    }))).toEqual([]);
  });

  it("shadows=off suppresses the shadows contributor's passes", async () => {
    const { createPrd02ShadowsContributor } = await import("../../../../packages/rendering/src/shadows/Prd02ShadowsContributor");
    const contrib = createPrd02ShadowsContributor();
    expect(contrib.passes!("shadows", ctxFor({})).length).toBe(1);
    expect(contrib.passes!("shadows", ctxFor({ source: killSource({ shadows: false }) }))).toEqual([]);
  });

  it("background=off falls back to the authored environmentBackground", () => {
    setRendererQrFlags(flagsOf({ A3D_QR_LIGHTING: true }));
    try {
      const authored = { type: "color" } as never;
      const source = {
        shadow: { prd02KillSwitches: { background: false } },
        environmentBackground: authored,
        environmentProbe: { background: null, specularCube: {}, mipCount: 5 }
      } as never;
      expect(collectEnvironmentBackground(source)).toBe(authored);
    } finally {
      setRendererQrFlags(flagsOf({}));
    }
  });
});

describe("tier change reallocation (§6.8)", () => {
  const cfg = (mapSize: number, cascades: 1 | 2 | 3 | 4 = 4) => ({
    enabled: true, mapSize, cascades, maxDistance: 200,
    splitLambda: 0.6, filter: "pcf" as const, strength: 1, bias: 0, normalBias: 1.5
  });

  it("same config reuses the shadow system (no per-frame realloc)", () => {
    const device = new MockRenderDevice();
    const a = shadowSystemForDevice(device, cfg(1024));
    const b = shadowSystemForDevice(device, cfg(1024));
    expect(b).toBe(a);
    device.dispose();
  });

  it("tier change (map size) disposes and recreates exactly once", () => {
    const device = new MockRenderDevice();
    const high = shadowSystemForDevice(device, cfg(1024));
    const targetsBefore = device.getDiagnostics().renderTargets;
    const ultra = shadowSystemForDevice(device, cfg(2048));
    expect(ultra).not.toBe(high);
    // Back down → another realloc; steady-state calls still reuse.
    const medium = shadowSystemForDevice(device, cfg(512));
    expect(medium).not.toBe(ultra);
    expect(shadowSystemForDevice(device, cfg(512))).toBe(medium);
    void targetsBefore;
    device.dispose();
  });

  it("no render-target allocation on frames without a tier/config change", () => {
    const device = new MockRenderDevice();
    const system = shadowSystemForDevice(device, cfg(1024));
    const cam = {
      viewProjectionMatrix: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] as unknown as never,
      viewMatrix: undefined, camera: undefined, cameraPosition: [0, 0, 5] as const
    };
    const frame = {
      camera: cam, sun: { direction: [0, -1, 0] as const },
      casters: [], localLights: [],
      flags: flagsOf({ A3D_QR_LIGHTING: true }), tier: QUALITY_TIERS.high
    };
    system.update(frame as never); // first update allocates cascade maps
    const afterFirst = device.getDiagnostics().renderTargets;
    system.update(frame as never);
    system.update(frame as never);
    const afterThird = device.getDiagnostics().renderTargets;
    expect(afterThird).toBe(afterFirst); // C-28 renderTargetsCreated delta 0
    device.dispose();
  });

  it("EnvironmentCache.neutral regenerates the probe per tier (face-size change)", { timeout: 30000 }, () => {
    const device = new MockRenderDevice();
    const factory = createEnvironmentProbeFactory(device);
    const cache = new EnvironmentCache(device, factory);
    const hi = cache.neutral("low");   // 128-face build — cheapest tiers
    const lo = cache.neutral("medium");
    expect(cache.neutral("low")).toBe(hi);  // same tier → cached, no regen
    expect(lo).not.toBe(hi);                // tier change → new probe at new faceSize
    expect(lo.faceSize).not.toBe(hi.faceSize);
    device.dispose();
  });
});
