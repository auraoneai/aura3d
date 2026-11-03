import { afterEach, describe, expect, it, vi } from "vitest";
import { parseIES } from "@aura3d/assets";
import { createAuraApp, lights, material, primitives, scene } from "../../../packages/engine/src/public/index";
import { MockRenderDevice, type DrawCommand, type RenderShaderProgram, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import type { Texture } from "../../../packages/rendering/src/Texture";

// Small, independently authored measured table: one horizontal row of candelas.
const distribution = `IESNA:LM-63-2002
TILT=NONE
1 1000 1 3 1 1 2 0 0 0
1 1 40
0 90 180
0
100 40 0`;

interface SubmittedDraw {
  readonly label?: string;
  readonly source?: ShaderSources;
  readonly uniforms: ReadonlyMap<string, unknown>;
  readonly atlas: Texture | null;
  readonly atlasLive: boolean;
  readonly atlasData: Float32Array | null;
}

class CapturingDevice extends MockRenderDevice {
  readonly sources = new Map<number, ShaderSources>();
  readonly submitted: SubmittedDraw[] = [];
  readonly generation = 1;
  private readonly lossListeners = new Set<() => void>();
  private readonly completions: Array<() => void> = [];
  get lossListenerCount(): number { return this.lossListeners.size; }

  onDeviceLost(listener: () => void): () => void {
    this.lossListeners.add(listener);
    return () => { this.lossListeners.delete(listener); };
  }

  supportsSubmittedWorkCompletion(): boolean { return true; }

  waitForSubmittedWork(): Promise<void> {
    return new Promise((resolve) => { this.completions.push(resolve); });
  }

  completeSubmittedWork(): void {
    for (const complete of this.completions.splice(0)) complete();
  }

  override createShaderProgram(source: ShaderSources): RenderShaderProgram {
    const program = super.createShaderProgram(source);
    this.sources.set(program.id, source);
    return program;
  }

  override draw(command: DrawCommand): void {
    const uniforms = new Map<string, unknown>();
    for (const [name, value] of command.uniforms ?? []) {
      uniforms.set(name, value instanceof Float32Array ? value.slice() : value);
    }
    const binding = uniforms.get("u_a3dPhotometricAtlas");
    const atlas = binding instanceof TextureBinding ? binding.texture : null;
    this.submitted.push({
      label: command.label,
      source: command.shader ? this.sources.get(command.shader.id) : undefined,
      uniforms,
      atlas,
      atlasLive: atlas !== null && !atlas.disposed,
      atlasData: atlas?.data instanceof Float32Array ? atlas.data.slice() : null
    });
    super.draw(command);
  }
}

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

/** Replace device acquisition only; the app, compiler and Renderer remain real. */
function useCaptureDevice(): CapturingDevice[] {
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { href: "http://localhost/", search: "" }, addEventListener() {}, removeEventListener() {} });
  const devices: CapturingDevice[] = [];
  vi.spyOn(Renderer, "create").mockImplementation(async (options = {}) => {
    const device = new CapturingDevice();
    const renderer = new Renderer(device, { ...options, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    // The public root selects WebGL2; command execution remains the mock device.
    Object.defineProperty(device, "kind", { value: "webgl2" });
    Object.defineProperty(device, "info", { value: { ...device.info, capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets"] } });
    devices.push(device);
    return renderer;
  });
  return devices;
}

function publicScene() {
  return scene()
    .add(primitives.box({ name: "receiver", material: material.pbr({ color: "#ffffff" }) }))
    .add(lights.point({ name: "ordinary", intensity: 3, position: [1, 2, 1] }))
    .add(lights.spot({
      name: "measured", intensity: 0, position: [0, 4, 0], target: [0, 0, 0],
      photometricProfile: { profile: parseIES(distribution), scale: 2, rotation: 0.5 }
    }).runtime({ id: "measured" }));
}

function flags(generator: boolean) {
  return {
    A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true,
    A3D_QR_CORE: generator, A3D_QR_CORE_GENERATOR: generator,
    A3D_QR_MATERIALS: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false
  } as const;
}

function sceneDraw(device: CapturingDevice): SubmittedDraw {
  const draw = device.submitted.find((entry) => entry.label?.includes(":receiver"));
  if (!draw) throw new Error("The public scene receiver did not submit a draw");
  return draw;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("public photometric profile source path", () => {
  it("carries a public light through compilation to the submitted renderer draw and releases frame atlases", async () => {
    const devices = useCaptureDevice();
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: publicScene(), autoStart: false, resize: false,
      renderer: { photometricProfiles: true },
      qualityRebuild: { flags: flags(true), allowUrlFlags: false }
    });
    try {
      await app.readyStrict({ stage: "first-frame" });
      const device = devices[0]!;
      const visible = sceneDraw(device);
      expect(visible.source?.generatedProgram?.features.features["a3d.photometricProfile"]).toBe(true);
      expect(visible.atlasLive).toBe(true);
      expect(Array.from(visible.uniforms.get("u_a3dPhotometricOffsets") as Float32Array).slice(0, 8)).toEqual([0, 0, 0, 0, 0, 3, 4, 3]);
      expect(Array.from(visible.uniforms.get("u_a3dPhotometricMeta") as Float32Array).slice(0, 8)).toEqual([0, 0, 0, 0, 1, 0, 2, 0.5]);
      expect(visible.atlasData && Array.from(visible.atlasData.slice(0, 7))).toEqual([0, 90, 180, 0, 100, 40, 0]);
      expect((visible.uniforms.get("u_lightData") as Float32Array)[27]).toBe(0);
      expect(visible.atlas?.disposed).toBe(false);
      device.completeSubmittedWork();
      await Promise.resolve();
      expect(visible.atlas?.disposed).toBe(true);

      const handle = app.nodes.require("measured");
      expect(typeof handle.setLight).toBe("function");
      handle.setLight!({ intensity: 12 });
      device.submitted.length = 0;
      app.step(0);
      const changedScalar = sceneDraw(device);
      expect((changedScalar.uniforms.get("u_lightData") as Float32Array)[27]).toBe(12);
      expect((changedScalar.uniforms.get("u_a3dPhotometricMeta") as Float32Array)[6]).toBe(2);
      expect(changedScalar.atlas?.disposed).toBe(false);
      device.completeSubmittedWork();
      await Promise.resolve();
      expect(changedScalar.atlas?.disposed).toBe(true);

      handle.setVisible(false);
      device.submitted.length = 0;
      app.step(0);
      const hidden = sceneDraw(device);
      expect(hidden.source?.generatedProgram?.features.features["a3d.photometricProfile"]).toBe(true);
      expect((hidden.uniforms.get("u_a3dPhotometricOffsets") as Float32Array)[7]).toBe(3);
      expect((hidden.uniforms.get("u_a3dPhotometricMeta") as Float32Array)[6]).toBe(0);
      expect(hidden.atlasLive).toBe(true);
      expect(hidden.atlas?.disposed).toBe(false);
      device.completeSubmittedWork();
      await Promise.resolve();
      expect(hidden.atlas?.disposed).toBe(true);

      handle.setVisible(true);
      device.submitted.length = 0;
      app.step(0);
      const restored = sceneDraw(device);
      expect((restored.uniforms.get("u_a3dPhotometricMeta") as Float32Array)[6]).toBe(2);
      expect((restored.uniforms.get("u_lightData") as Float32Array)[27]).toBe(12);
      expect(restored.atlas?.disposed).toBe(false);
      device.completeSubmittedWork();
      await Promise.resolve();
      expect(restored.atlas?.disposed).toBe(true);
      expect(app.diagnostics().warnings.some((warning) => warning.includes("PHOTOMETRIC_PROFILE_UNSUPPORTED"))).toBe(false);
      const atlases = [visible.atlas, changedScalar.atlas, hidden.atlas, restored.atlas];
      await app.disposeAsync();
      expect(atlases.every((atlas) => atlas?.disposed === true)).toBe(true);
      expect(device.disposed).toBe(true);
      expect(device.lossListenerCount).toBe(0);
    } finally { app.dispose(); }
  });

  it("reports an unsupported public draw before non-strict scalar fallback", async () => {
    const devices = useCaptureDevice();
    const onDegradation = vi.fn();
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: publicScene(), autoStart: false, resize: false, strict: false, onDegradation,
      renderer: { photometricProfiles: true },
      qualityRebuild: { flags: flags(false), allowUrlFlags: false }
    });
    try {
      await app.readyStrict({ stage: "first-frame" });
      const draw = sceneDraw(devices[0]!);
      expect(draw.source?.generatedProgram?.features.features["a3d.photometricProfile"]).toBeUndefined();
      expect(draw.uniforms.has("u_a3dPhotometricAtlas")).toBe(false);
      expect(onDegradation).toHaveBeenCalledWith(expect.objectContaining({ code: "capability-degraded", message: expect.stringContaining("PHOTOMETRIC_PROFILE_UNSUPPORTED") }));
      expect(app.diagnostics().warnings.some((warning) => warning.includes("PHOTOMETRIC_PROFILE_UNSUPPORTED"))).toBe(true);
      const firstDiagnostics = app.diagnostics();
      const firstWarning = firstDiagnostics.warnings.find((warning) => warning.includes("PHOTOMETRIC_PROFILE_UNSUPPORTED"));
      expect(firstWarning).toMatch(/view .+, frame \d+,/);
      expect(firstDiagnostics.renderer?.warnings).toContain(firstWarning);
      expect(firstDiagnostics.renderer?.runtime.warnings).toContain(firstWarning);
      const firstFrame = Number(firstWarning!.match(/frame (\d+)/)![1]);
      app.step(0);
      const nextWarning = app.diagnostics().warnings.find((warning) => warning.includes("PHOTOMETRIC_PROFILE_UNSUPPORTED"));
      expect(Number(nextWarning?.match(/frame (\d+)/)?.[1])).toBeGreaterThan(firstFrame);
    } finally { app.dispose(); }
  });

  it("keeps the default public scalar fallback visible in app diagnostics", async () => {
    const devices = useCaptureDevice();
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: publicScene(), autoStart: false, resize: false, strict: false,
      qualityRebuild: { flags: flags(true), allowUrlFlags: false }
    });
    try {
      await app.readyStrict({ stage: "first-frame" });
      expect(sceneDraw(devices[0]!).uniforms.has("u_a3dPhotometricAtlas")).toBe(false);
      expect(app.diagnostics().warnings.some((warning) => warning.includes("LIGHT_MODULATION_UNSUPPORTED:") && warning.includes("photometricProfile"))).toBe(true);
    } finally { app.dispose(); }
  });

  it("bounds and redacts light warnings when earlier renderer details exhaust their budget", async () => {
    useCaptureDevice();
    const secret = "untrusted-test-secret";
    const crowdedScene = publicScene();
    for (let index = 0; index < 6; index += 1) {
      crowdedScene.add(primitives.box({ name: `long-${index}-${"x".repeat(2000)}`, material: material.pbr({ color: "#ffffff" }) }));
    }
    crowdedScene.add(lights.spot({ name: `fixture token=${secret}`, photometricProfile: { profile: parseIES(distribution) } }));
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: crowdedScene, autoStart: false, resize: false, strict: false,
      qualityRebuild: { flags: flags(true), allowUrlFlags: false }
    });
    try {
      await app.readyStrict({ stage: "first-frame" });
      const diagnostics = app.diagnostics();
      expect(JSON.stringify(diagnostics.renderer)).toContain("[truncated]");
      const warning = diagnostics.warnings.find((entry) => entry.includes("LIGHT_MODULATION_UNSUPPORTED:") && entry.includes("fixture"));
      expect(warning).toContain("token=[redacted]");
      expect(warning!.length).toBeLessThanOrEqual(2049);
      expect(JSON.stringify(diagnostics)).not.toContain(secret);
    } finally { app.dispose(); }
  });

  it("rejects an unsupported public draw in strict mode before submitting the receiver", async () => {
    const devices = useCaptureDevice();
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: publicScene(), autoStart: false, resize: false, strict: true,
      renderer: { photometricProfiles: true },
      qualityRebuild: { flags: flags(false), allowUrlFlags: false }
    });
    try {
      await expect(app.readyStrict({ stage: "first-frame" })).rejects.toThrow(/PHOTOMETRIC_PROFILE_UNSUPPORTED/);
      expect(devices[0]!.submitted.some((entry) => entry.label?.includes(":receiver"))).toBe(false);
    } finally { app.dispose(); }
  });
});
