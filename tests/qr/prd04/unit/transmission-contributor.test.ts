import { describe, expect, it } from "vitest";
import {
  TRANSMISSION_BLACKBOARD_KEY,
  TRANSMISSION_LANE_RESOURCE,
  TransmissionFrameContributor,
  prd04TransmissionDiagnostics
} from "../../../../packages/rendering/src/forward/Transmission";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";

const TRANSMITTING = { material: { renderState: { blend: false }, getParameter: (n: string) => n === "u_transmissionFactor" ? 0.9 : undefined } };

function makeDevice(halfFloat: boolean) {
  return {
    probe: { halfFloatColorBuffer: halfFloat },
    createRenderTarget: (d: { width: number; height: number }) => ({
      width: d.width, height: d.height,
      colorTexture: { kind: "texture", width: d.width, height: d.height },
      dispose: () => {}
    }),
    createBuffer: () => ({ kind: "buffer" }),
    createShaderProgram: () => ({ kind: "program" }),
    setRenderTarget: () => {},
    draw: () => {},
    dispose: () => {}
  } as unknown as FrameContributorContext["device"];
}

function ctx(items: readonly unknown[], opts: { tier?: keyof typeof QUALITY_TIERS | null; halfFloat?: boolean; width?: number; height?: number } = {}): FrameContributorContext {
  const { tier = "high", halfFloat = true, width = 640, height = 360 } = opts;
  return {
    device: makeDevice(halfFloat),
    width, height, frameIndex: 0, timeSeconds: 0,
    camera: {} as FrameContributorContext["camera"], source: {} as FrameContributorContext["source"],
    items: items as FrameContributorContext["items"],
    tier: tier === null ? ({} as FrameContributorContext["tier"]) : QUALITY_TIERS[tier],
    // QrFlags needs `values` + `on` for qrCoreOutputOn; `{}` crashed the
    // contributor's flag check with `on is not a function`.
    flags: { values: {}, on: () => false } as FrameContributorContext["flags"],
    sceneDepth: {} as FrameContributorContext["sceneDepth"],
    blackboard: new Map()
  };
}

describe("prd04.transmission contributor (P4-1)", () => {
  it("returns 0 passes when no item reports the transmission lobe", () => {
    const c = new TransmissionFrameContributor();
    const context = ctx([{ material: { getParameter: () => undefined } }]);
    expect(c.passes("transmission", context)).toEqual([]);
    expect(prd04TransmissionDiagnostics().targetActive).toBe(false);
  });

  it("returns 1 pass when an item reports the lobe, publishing on the blackboard", async () => {
    const c = new TransmissionFrameContributor();
    const context = ctx([TRANSMITTING]);
    const passes = c.passes("transmission", context);
    expect(passes).toHaveLength(1);
    // T0-18(c): the copy now declares the produced colour resource — the
    // legacy `color` here since the stub flags report no CORE_OUTPUT — while
    // writing only its own namespaced lane resource.
    expect(passes[0]!.reads).toEqual(["color"]);
    expect(passes[0]!.writes).toEqual([TRANSMISSION_LANE_RESOURCE]);

    await passes[0]!.execute({ device: context.device, width: 640, height: 360 });
    const target = context.blackboard.get(TRANSMISSION_BLACKBOARD_KEY);
    expect(target).toBeDefined();
    expect((target as { width: number }).width).toBe(640);
    const d = prd04TransmissionDiagnostics();
    expect(d.targetActive).toBe(true);
    expect(d.format).toBe("rgba16f");
    expect(d.mipCount).toBe(Math.floor(Math.log2(640)) + 1);
    expect(d.scale).toBe(1);
    c.dispose();
  });

  it("uses RGBA8 + transmission-ldr-capture when halfFloatColorBuffer is false", async () => {
    const c = new TransmissionFrameContributor();
    const context = ctx([TRANSMITTING], { halfFloat: false });
    await c.passes("transmission", context)[0]!.execute({ device: context.device, width: 640, height: 360 });
    const d = prd04TransmissionDiagnostics();
    expect(d.format).toBe("rgba8");
    expect(d.issues).toContain("transmission-ldr-capture");
    c.dispose();
  });

  it("skips on Low tier; scales 0.5 on Medium", async () => {
    const low = new TransmissionFrameContributor();
    expect(low.passes("transmission", ctx([TRANSMITTING], { tier: "low" }))).toEqual([]);

    const medium = new TransmissionFrameContributor();
    const context = ctx([TRANSMITTING], { tier: "medium", width: 1280 });
    await medium.passes("transmission", context)[0]!.execute({ device: context.device, width: 1280, height: 720 });
    expect(prd04TransmissionDiagnostics().scale).toBe(0.5);
    medium.dispose();
  });
});
