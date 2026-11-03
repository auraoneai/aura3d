import { describe, expect, it } from "vitest";
import {
  TRANSMISSION_BLACKBOARD_KEY, TRANSMISSION_LANE_RESOURCE, TransmissionFrameContributor,
  itemReportsTransmissionLobe, prd04TransmissionDiagnostics
} from "../../../../packages/rendering/src/forward/Transmission";
import { capturedTransmissionTarget, isTrustedTransmissionCapturePass, releaseTransmissionFrame } from "../../../../packages/rendering/src/forward/transmissionTargetStore";
import { PRD01_FORWARD_TARGET } from "../../../../packages/rendering/src/renderer/FrameGraph";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { DrawCommand, RenderDevice, RenderTarget, RenderTargetDescriptor } from "../../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../../packages/rendering/src/TextureBinding";

const TRANSMITTING = { material: { renderState: { blend: false }, getParameter: (n: string) => n === "u_transmissionFactor" ? 0.9 : undefined } };

function fakeDevice() {
  const events: string[] = [];
  const targets: RenderTarget[] = [];
  const losses = new Set<() => void>();
  let active: RenderTarget | null = null;
  let copyFails = false, mipFails = false;
  const device = {
    kind: "mock", disposed: false, contextLost: false, generation: 1,
    events, targets,
    createRenderTarget(d: RenderTargetDescriptor) {
      const colorTexture = new Texture({ width: d.width, height: d.height, format: d.format, renderAttachment: true, mipLevelCount: d.mipLevelCount });
      const target = {
        id: targets.length + 1, label: d.label ?? "source", width: d.width, height: d.height, colorTexture, sampleCount: d.sampleCount ?? 1, disposed: false,
        dispose() { (this as { disposed: boolean }).disposed = true; colorTexture.dispose(); }
      } as RenderTarget;
      targets.push(target);
      return target;
    },
    createBuffer: () => ({ dispose: () => { events.push("buffer-dispose"); } }),
    createShaderProgram: (shader: { webgpu?: unknown; portableBindings?: unknown }) => {
      expect(shader.webgpu).toBeDefined();
      expect(shader.portableBindings).toBeDefined();
      return { dispose: () => { events.push("program-dispose"); } };
    },
    setRenderTarget(target: RenderTarget | null) { active = target; events.push(target?.label ?? "default"); },
    getRenderTarget: () => active,
    drawTransmissionCapture(command: DrawCommand) {
      events.push("copy");
      expect((command.uniforms?.get("u_source") as TextureBinding).texture).toBeTruthy();
      if (copyFails) throw new Error("copy failed");
    },
    generateRenderTargetMipmaps(target: RenderTarget) {
      events.push("mips");
      expect(target.colorTexture.mipLevelCount).toBeGreaterThan(1);
      if (mipFails) throw new Error("mip failed");
    },
    onDeviceLost(listener: () => void) { losses.add(listener); return () => losses.delete(listener); },
    failCopy() { copyFails = true; },
    failMip() { mipFails = true; },
    lose() { this.contextLost = true; for (const listener of [...losses]) listener(); }
  };
  return device;
}

type FakeDevice = ReturnType<typeof fakeDevice>;
function context(device: FakeDevice, options: {
  scope?: object; view?: string | number; frame?: number; width?: number; height?: number;
  sourceWidth?: number; sourceHeight?: number; format?: "rgba8" | "rgba16f" | "rgba32f";
  tier?: keyof typeof QUALITY_TIERS; noSource?: boolean; linear?: boolean; items?: readonly unknown[];
} = {}): FrameContributorContext {
  const source = device.createRenderTarget({ width: options.sourceWidth ?? 640, height: options.sourceHeight ?? 360, format: options.format ?? "rgba16f", label: "source", depth: false });
  device.setRenderTarget(source);
  const blackboard = new Map<string, unknown>([["prd01.outputColorSpace", options.linear === false ? "srgb" : "linear"]]);
  if (!options.noSource) blackboard.set(PRD01_FORWARD_TARGET, source);
  return {
    device: device as unknown as RenderDevice, postScopeId: options.scope ?? {}, viewId: options.view ?? "view",
    width: options.width ?? 640, height: options.height ?? 360, frameIndex: options.frame ?? 1, timeSeconds: 0,
    camera: null, source: {}, items: (options.items ?? [TRANSMITTING]) as FrameContributorContext["items"],
    tier: QUALITY_TIERS[options.tier ?? "high"], flags: { values: {}, on: () => false } as FrameContributorContext["flags"],
    sceneDepth: {} as FrameContributorContext["sceneDepth"], blackboard
  };
}

function capture(contributor: TransmissionFrameContributor, frame: FrameContributorContext) {
  const passes = contributor.passes("transmission", frame);
  expect(passes).toHaveLength(1);
  expect(passes[0]!.reads).toEqual(["color"]);
  expect(passes[0]!.writes).toEqual([TRANSMISSION_LANE_RESOURCE]);
  passes[0]!.execute({ device: frame.device, width: frame.width, height: frame.height });
}

describe("frame-owned transmission capture", () => {
  it("trusts only the original unmodified provider pass for direct replay", () => {
    const device = fakeDevice(), contributor = new TransmissionFrameContributor(), frame = context(device);
    const pass = contributor.passes("transmission", frame)[0]!;
    expect(isTrustedTransmissionCapturePass(pass)).toBe(true);
    expect(isTrustedTransmissionCapturePass({ name: pass.name, reads: pass.reads, writes: pass.writes, execute: pass.execute })).toBe(false);
    const execute = pass.execute;
    pass.execute = () => {};
    expect(isTrustedTransmissionCapturePass(pass)).toBe(false);
    pass.execute = execute;
    (pass.reads as string[]).push("unexpected");
    expect(isTrustedTransmissionCapturePass(pass)).toBe(false);
    contributor.dispose();
  });

  it("copies before generating and publishes only the actual source-sized mip chain", () => {
    const device = fakeDevice(), contributor = new TransmissionFrameContributor();
    const frame = context(device, { width: 1280, height: 720, sourceWidth: 640, sourceHeight: 360, tier: "medium" });
    device.events.length = 0;
    capture(contributor, frame);
    const result = capturedTransmissionTarget(frame)!;
    expect(result).toBe(frame.blackboard.get(TRANSMISSION_BLACKBOARD_KEY));
    expect([result.width, result.height, result.mipCount]).toEqual([320, 180, 9]);
    expect(device.events).toEqual(["prd04-transmission-scene-color", "copy", "source", "mips"]);
    expect(prd04TransmissionDiagnostics(frame)).toMatchObject({ targetActive: true, format: "rgba16f", sourceCopied: true, mipCount: 9, readbacks: 0 });
    releaseTransmissionFrame(frame);
    expect(capturedTransmissionTarget(frame)).toBeUndefined();
    contributor.dispose();
  });

  it("reports LDR from the actual source format", () => {
    const device = fakeDevice(), contributor = new TransmissionFrameContributor();
    const frame = context(device, { format: "rgba8" });
    capture(contributor, frame);
    expect(prd04TransmissionDiagnostics(frame)).toMatchObject({ format: "rgba8", issues: ["transmission-ldr-capture"] });
    contributor.dispose();
  });

  it("reads the opaque resource actually declared by the renderer's split route", () => {
    const device = fakeDevice(), contributor = new TransmissionFrameContributor(), frame = context(device);
    frame.blackboard.set("prd01.opaqueColorResource", "aura.scene.color.opaque");
    const pass = contributor.passes("transmission", frame)[0]!;
    expect(pass.reads).toEqual(["aura.scene.color.opaque"]);
    pass.execute({ device: frame.device, width: frame.width, height: frame.height });
    expect(capturedTransmissionTarget(frame)).toBeDefined();
    contributor.dispose();
  });

  it("honors an explicit renderer decision that no transmission capture is planned", () => {
    const device = fakeDevice(), contributor = new TransmissionFrameContributor(), frame = context(device);
    frame.blackboard.set("prd01.transmissionCapturePlanned", false);
    expect(contributor.passes("transmission", frame)).toEqual([]);
    expect(prd04TransmissionDiagnostics(frame).targetActive).toBe(false);
    contributor.dispose();
  });

  it("does not publish when the source is missing or nonlinear", () => {
    const device = fakeDevice(), contributor = new TransmissionFrameContributor();
    for (const frame of [context(device, { noSource: true }), context(device, { linear: false })]) {
      expect(() => capture(contributor, frame)).toThrow();
      expect(capturedTransmissionTarget(frame)).toBeUndefined();
      expect(prd04TransmissionDiagnostics(frame).targetActive).toBe(false);
    }
    expect(device.events).not.toContain("copy");
    contributor.dispose();
  });

  it("restores the source and publishes nothing when copy or mip generation fails", () => {
    for (const failure of ["copy", "mip"] as const) {
      const device = fakeDevice(), contributor = new TransmissionFrameContributor();
      const frame = context(device);
      const source = frame.blackboard.get(PRD01_FORWARD_TARGET);
      if (failure === "copy") device.failCopy(); else device.failMip();
      expect(() => capture(contributor, frame)).toThrow();
      expect(device.getRenderTarget()).toBe(source);
      expect(capturedTransmissionTarget(frame)).toBeUndefined();
      expect(prd04TransmissionDiagnostics(frame)).toMatchObject({ targetActive: false, sourceCopied: failure === "mip", mipCount: 0 });
      contributor.dispose();
    }
  });

  it("rejects a device without an actual mip-generation method", () => {
    const device = fakeDevice(), contributor = new TransmissionFrameContributor(), frame = context(device);
    (device as { generateRenderTargetMipmaps?: unknown }).generateRenderTargetMipmaps = undefined;
    expect(() => capture(contributor, frame)).toThrow("generate the transmission mip chain");
    expect(capturedTransmissionTarget(frame)).toBeUndefined();
    contributor.dispose();
  });

  it("isolates scopes, views, frames and device generation; releases only the requested owner", () => {
    const device = fakeDevice(), contributor = new TransmissionFrameContributor(), ownerA = {}, ownerB = {};
    const a = context(device, { scope: ownerA, view: "left", frame: 4 });
    capture(contributor, a);
    const targetA = capturedTransmissionTarget(a)!.target;
    const b = context(device, { scope: ownerB, view: "left", frame: 4 });
    capture(contributor, b);
    const targetB = capturedTransmissionTarget(b)!.target;
    expect(targetA).not.toBe(targetB);
    expect(capturedTransmissionTarget(a)?.target).toBe(targetA);
    expect(capturedTransmissionTarget({ ...a, postScopeId: ownerB })).toBeUndefined();
    expect(capturedTransmissionTarget({ ...a, viewId: "right" })).toBeUndefined();
    expect(capturedTransmissionTarget({ ...a, frameIndex: 5 })).toBeUndefined();
    const right = context(device, { scope: ownerA, view: "right", frame: 4 });
    capture(contributor, right);
    const targetRight = capturedTransmissionTarget(right)!.target;
    contributor.releaseView(device as unknown as RenderDevice, ownerA, "left");
    expect(targetA.disposed).toBe(true);
    expect(capturedTransmissionTarget(a)).toBeUndefined();
    expect(capturedTransmissionTarget(b)?.target).toBe(targetB);
    expect(capturedTransmissionTarget(right)?.target).toBe(targetRight);
    const next = context(device, { scope: ownerA, view: "right", frame: 5 });
    capture(contributor, next);
    expect(capturedTransmissionTarget(right)).toBeUndefined();
    expect(capturedTransmissionTarget(next)?.target).toBe(targetRight);
    device.generation++;
    expect(capturedTransmissionTarget(next)).toBeUndefined();
    expect(capturedTransmissionTarget(b)).toBeUndefined();
    contributor.dispose();
    expect(targetB.disposed).toBe(true);
    expect(targetRight.disposed).toBe(true);
  });

  it("revokes the prior frame before resize or a frame without transmitting items", () => {
    const device = fakeDevice(), contributor = new TransmissionFrameContributor(), scope = {};
    const first = context(device, { scope, frame: 1, sourceWidth: 32, sourceHeight: 16 });
    capture(contributor, first);
    const firstTarget = capturedTransmissionTarget(first)!.target;
    const resized = context(device, { scope, frame: 2, sourceWidth: 16, sourceHeight: 8 });
    capture(contributor, resized);
    expect(capturedTransmissionTarget(first)).toBeUndefined();
    expect(firstTarget.disposed).toBe(true);
    const secondTarget = capturedTransmissionTarget(resized)!.target;
    expect([secondTarget.width, secondTarget.height]).toEqual([16, 8]);
    const empty = context(device, { scope, frame: 3, items: [] });
    expect(contributor.passes("transmission", empty)).toEqual([]);
    expect(capturedTransmissionTarget(resized)).toBeUndefined();
    contributor.dispose();
  });

  it("allows a one-pixel capture without inventing a mip-generation operation", () => {
    const device = fakeDevice(), contributor = new TransmissionFrameContributor();
    const frame = context(device, { sourceWidth: 1, sourceHeight: 1 });
    (device as { generateRenderTargetMipmaps?: unknown }).generateRenderTargetMipmaps = undefined;
    capture(contributor, frame);
    expect(capturedTransmissionTarget(frame)?.mipCount).toBe(1);
    expect(device.events).not.toContain("mips");
    contributor.dispose();
  });

  it("revokes captures and retires view resources on device loss", () => {
    const device = fakeDevice(), contributor = new TransmissionFrameContributor(), frame = context(device);
    capture(contributor, frame);
    const target = capturedTransmissionTarget(frame)!.target;
    device.lose();
    expect(target.disposed).toBe(true);
    expect(capturedTransmissionTarget(frame)).toBeUndefined();
    contributor.dispose();
  });

  it("detects tiny live factors, enabled maps and blended materials, but skips empty/low frames", () => {
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) });
    const map = new TextureBinding({ name: "u_transmissionTexture", texture });
    const item = { material: { renderState: { blend: true }, getParameter: (n: string) => n === "u_transmissionTexture" ? map : undefined } };
    expect(itemReportsTransmissionLobe(item as never)).toBe(true);
    expect(itemReportsTransmissionLobe({ material: { getParameter: (n: string) => n === "u_transmissionFactor" ? 0.0001 : 0 } } as never)).toBe(true);
    const contributor = new TransmissionFrameContributor(), device = fakeDevice();
    expect(contributor.passes("transmission", context(device, { tier: "low" }))).toEqual([]);
    expect(contributor.passes("transmission", context(device, { items: [] }))).toEqual([]);
    contributor.dispose();
    texture.dispose();
  });

  it("rejects malformed frame identities before creating capture resources", () => {
    const device = fakeDevice(), contributor = new TransmissionFrameContributor();
    for (const bad of [{ viewId: "" }, { viewId: Number.NaN }, { frameIndex: -1 }, { postScopeId: undefined }]) {
      const frame = { ...context(device), ...bad } as FrameContributorContext;
      expect(() => contributor.passes("transmission", frame)).toThrow(/identity/i);
    }
    expect(device.targets.every((target) => target.label !== "prd04-transmission-scene-color")).toBe(true);
    contributor.dispose();
  });
});
