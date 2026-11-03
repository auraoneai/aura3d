import { beforeAll, describe, expect, it } from "vitest";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import type { DrawCommand, MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { registerFrameContributor } from "../../../packages/rendering/src/contracts/frameGraph";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerPrd04ShaderFeatures } from "../../../packages/rendering/src/materials/features";
import { registerPrd04MaterialLobes } from "../../../packages/rendering/src/materials/lobes";
import { registerPrd04ShaderChunks } from "../../../packages/rendering/src/shaders/physical/index";
import { transmissionFrameContributor } from "../../../packages/rendering/src/forward/Transmission";
import "../../../packages/rendering/src/lanes/prd01";

beforeAll(() => {
  registerPrd04ShaderChunks();
  registerPrd04MaterialLobes();
  registerPrd04ShaderFeatures();
});

const flags = createTrustedQrFlags(Object.fromEntries(["A3D_QR_CORE", "A3D_QR_CORE_OUTPUT", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION"].map((name) => [name, true])));

async function frame(items: (geometry: Geometry, m: { opaque: UnlitMaterial; glass: PBRMaterial; blend: UnlitMaterial }) => readonly object[], asynchronous: boolean) {
  const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
  const device = renderer.device as MockRenderDevice & { drawTransmissionCapture(command: DrawCommand): void };
  device.drawTransmissionCapture = (command) => device.draw(command);
  const unregister = registerFrameContributor(transmissionFrameContributor);
  const geometry = Geometry.box();
  const materials = {
    opaque: new UnlitMaterial({ name: "opaque" }),
    glass: new PBRMaterial({ transmissionFactor: 0.8 }),
    blend: new UnlitMaterial({ name: "blend", color: [1, 1, 1, 0.5], renderState: { blend: true, blendMode: "alpha", depthWrite: false } })
  };
  try {
    const source = { cameraPolicy: "identity" as const, renderItems: items(geometry, materials) };
    if (asynchronous) await renderer.renderAsync({ source, frameId: 1 });
    else renderer.render({ source, frameId: 1 });
    return device.drawCommands.map((command) => command.label);
  } finally {
    unregister(); renderer.dispose(); geometry.dispose();
    for (const material of Object.values(materials)) material.dispose();
  }
}

describe("renderOrder across split renderer phases", () => {
  it.each([false, true])("draws an opaque item ordered after transmission once, after the capture (async=%s)", async (asynchronous) => {
    const labels = await frame((geometry, m) => [
      { geometry, material: m.opaque, label: "late-opaque", renderOrder: 2 },
      { geometry, material: m.blend, label: "blend", renderOrder: 1 },
      { geometry, material: m.glass, label: "glass", renderOrder: 0 },
      { geometry, material: m.opaque, label: "early-opaque", renderOrder: 0 }
    ], asynchronous);
    const copy = labels.indexOf("prd04-transmission-scene-color-copy");
    expect(labels.filter((label) => label === "late-opaque")).toHaveLength(1);
    expect(labels.indexOf("early-opaque")).toBeLessThan(copy);
    expect(copy).toBeLessThan(labels.indexOf("glass"));
    expect(labels.indexOf("glass")).toBeLessThan(labels.indexOf("blend"));
    expect(labels.indexOf("blend")).toBeLessThan(labels.indexOf("late-opaque"));
  });

  it.each([false, true])("interleaves transmission with blended draws by renderOrder (async=%s)", async (asynchronous) => {
    const labels = await frame((geometry, m) => [
      { geometry, material: m.glass, label: "glass", renderOrder: 3 },
      { geometry, material: m.blend, label: "blend-1", renderOrder: 1 },
      { geometry, material: m.blend, label: "blend-5", renderOrder: 5 },
      { geometry, material: m.opaque, label: "opaque", renderOrder: 0 }
    ], asynchronous);
    const copy = labels.indexOf("prd04-transmission-scene-color-copy");
    expect(labels.indexOf("opaque")).toBeLessThan(copy);
    expect(labels.filter((label) => label === "glass")).toHaveLength(1);
    expect(copy).toBeLessThan(labels.indexOf("blend-1"));
    expect(labels.indexOf("blend-1")).toBeLessThan(labels.indexOf("glass"));
    expect(labels.indexOf("glass")).toBeLessThan(labels.indexOf("blend-5"));
  });

  it("still refuses transparent color that would have to precede the opaque capture", async () => {
    await expect(frame((geometry, m) => [
      { geometry, material: m.blend, label: "blend", renderOrder: 0 },
      { geometry, material: m.opaque, label: "opaque", renderOrder: 1 },
      { geometry, material: m.glass, label: "glass", renderOrder: 2 }
    ], false)).rejects.toMatchObject({ code: "RENDER_ORDER_PHASE_CONFLICT" });
  });
});
