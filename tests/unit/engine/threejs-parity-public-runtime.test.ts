import { afterEach, describe, expect, it, vi } from "vitest";
import { A3DAppLifecycle, A3DRenderer, A3DScene, Geometry, PBRMaterial } from "@aura3d/engine/advanced-runtime";
import { MockRenderDevice } from "@aura3d/rendering";
import { AdvancedRenderer } from "@aura3d/engine/rendering/advanced-runtime";
import { GLTFLoader, createRenderableScene } from "@aura3d/engine/assets/advanced-gallery";

describe("ThreejsParity threejsParity public runtime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a scene graph through @aura3d/engine/advanced-runtime without hand-built RenderItem arrays", async () => {
    const scene = new A3DScene();
    const floor = scene.createRenderableMesh({
      name: "floor",
      geometry: Geometry.litCube(1),
      geometryId: "floor-geometry",
      material: new PBRMaterial({ name: "floor-material" }),
      materialId: "floor-material"
    });
    floor.transform.setPosition(0, -0.55, -2);
    floor.transform.setScale(3, 0.08, 3);

    const subject = scene.createRenderableMesh({
      name: "subject",
      geometry: Geometry.litCube(0.5),
      geometryId: "subject-geometry",
      material: new PBRMaterial({ name: "subject-material" }),
      materialId: "subject-material"
    });
    subject.transform.setPosition(0, 0, -2);

    const renderer = await A3DRenderer.create({ backend: "mock", width: 64, height: 64 });
    const diagnostics = renderer.render(scene);

    expect(diagnostics.submittedObjects).toBe(2);
    expect(diagnostics.visibleObjects).toBe(2);
    expect(diagnostics.drawCalls).toBe(2);
    expect((renderer.device as MockRenderDevice).drawCommands.map((command) => command.label).sort()).toEqual(["floor", "subject"]);
    renderer.dispose();
  });

  it("keeps resize, frame capture, and diagnostics on the public threejsParity renderer wrapper", async () => {
    const scene = new A3DScene();
    scene.createRenderableMesh({
      name: "capture-subject",
      geometry: Geometry.litCube(0.5),
      material: new PBRMaterial({ name: "capture-material" })
    });

    const renderer = await A3DRenderer.create({ backend: "mock", width: 8, height: 8 });
    renderer.resize(10, 6);
    const frame = renderer.captureFrame(scene);

    expect(frame.width).toBe(10);
    expect(frame.height).toBe(6);
    expect(frame.pixels).toHaveLength(10 * 6 * 4);
    expect(renderer.getDiagnostics().drawCalls).toBe(1);
    const evidence = renderer.evidence({ assetFailures: ["missing:texture:arena-neon"] });
    expect(evidence).toMatchObject({
      backend: "mock",
      drawCalls: 1,
      renderSize: { width: 10, height: 6 },
      assetFailures: ["missing:texture:arena-neon"],
      contextLost: false,
      disposed: false,
      lastError: null
    });
    expect(evidence.frameTimeMs).toBeGreaterThanOrEqual(0);
    renderer.dispose();
    expect(renderer.evidence().disposed).toBe(true);
    expect(() => renderer.resize(12, 12)).toThrow(/disposed/i);
  });

  it("exposes the rendering threejsParity facade over the tested renderer implementation", async () => {
    const renderer = await AdvancedRenderer.create({ backend: "mock", width: 8, height: 8 });
    const diagnostics = renderer.render([{
      geometry: Geometry.litCube(0.5),
      material: new PBRMaterial({ name: "renderer-threejs-parity-material" }),
      label: "renderer-threejs-parity-cube"
    }]);

    expect(diagnostics.drawCalls).toBe(1);
    expect((renderer.device as MockRenderDevice).drawCommands[0]?.label).toBe("renderer-threejs-parity-cube");
    renderer.dispose();
  });

  it("exposes the assets threejsParity facade for GLTF loading and renderable scene creation", () => {
    expect(GLTFLoader).toBeTypeOf("function");
    expect(createRenderableScene).toBeTypeOf("function");
  });

  it("owns app route teardown for listeners, animation frames, and disposables", () => {
    const cancelledFrames: number[] = [];
    vi.stubGlobal("window", {
      requestAnimationFrame: vi.fn(() => 42),
      cancelAnimationFrame: vi.fn((handle: number) => cancelledFrames.push(handle))
    });
    const lifecycle = new A3DAppLifecycle();
    const target = new EventTarget();
    const disposable = { disposed: 0, dispose: vi.fn(() => { disposable.disposed += 1; }) };
    let eventCount = 0;

    lifecycle.addDisposable(disposable);
    lifecycle.addEventListener(target, "sample", () => { eventCount += 1; });
    lifecycle.requestAnimationFrame(() => { eventCount += 100; });

    target.dispatchEvent(new Event("sample"));
    lifecycle.dispose();
    lifecycle.dispose();
    target.dispatchEvent(new Event("sample"));

    expect(eventCount).toBe(1);
    expect(disposable.dispose).toHaveBeenCalledTimes(1);
    expect(cancelledFrames).toEqual([42]);
    expect(lifecycle.snapshot()).toMatchObject({
      disposed: true,
      animationFrames: 0,
      eventListeners: 0,
      disposables: 0,
      disposeCalls: 2
    });
  });

  it("disposes threejsParity scene-owned geometry and material resources", () => {
    const scene = new A3DScene();
    const geometry = Geometry.litCube(1);
    const material = new PBRMaterial({ name: "owned-material" });
    scene.createRenderableMesh({
      name: "owned-cube",
      geometry,
      material
    });

    scene.dispose();

    expect(scene.geometryLibrary.size).toBe(0);
    expect(scene.materialLibrary.size).toBe(0);
    expect(scene.collectRenderables()).toEqual([]);
    expect(() => geometry.vertexBuffer.getAttribute(0, "position")).toThrow(/disposed/i);
    expect(material.disposed).toBe(true);
  });
});
