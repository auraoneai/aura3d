import { afterEach, describe, expect, it, vi } from "vitest";
import { G3DAppLifecycle, G3DRenderer, G3DScene, Geometry, PBRMaterial } from "@galileo3d/engine/advanced-runtime";
import { MockRenderDevice } from "@galileo3d/rendering";
import { RendererV9 } from "@galileo3d/engine/rendering/advanced-runtime";
import { GLTFLoader, createRenderableScene } from "@galileo3d/engine/assets/advanced-gallery";

describe("V9 v9 public runtime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a scene graph through @galileo3d/engine/advanced-runtime without hand-built RenderItem arrays", async () => {
    const scene = new G3DScene();
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

    const renderer = await G3DRenderer.create({ backend: "mock", width: 64, height: 64 });
    const diagnostics = renderer.render(scene);

    expect(diagnostics.submittedObjects).toBe(2);
    expect(diagnostics.visibleObjects).toBe(2);
    expect(diagnostics.drawCalls).toBe(2);
    expect((renderer.device as MockRenderDevice).drawCommands.map((command) => command.label).sort()).toEqual(["floor", "subject"]);
    renderer.dispose();
  });

  it("keeps resize, frame capture, and diagnostics on the public v9 renderer wrapper", async () => {
    const scene = new G3DScene();
    scene.createRenderableMesh({
      name: "capture-subject",
      geometry: Geometry.litCube(0.5),
      material: new PBRMaterial({ name: "capture-material" })
    });

    const renderer = await G3DRenderer.create({ backend: "mock", width: 8, height: 8 });
    renderer.resize(10, 6);
    const frame = renderer.captureFrame(scene);

    expect(frame.width).toBe(10);
    expect(frame.height).toBe(6);
    expect(frame.pixels).toHaveLength(10 * 6 * 4);
    expect(renderer.getDiagnostics().drawCalls).toBe(1);
    renderer.dispose();
  });

  it("exposes the rendering v9 facade over the tested renderer implementation", async () => {
    const renderer = await RendererV9.create({ backend: "mock", width: 8, height: 8 });
    const diagnostics = renderer.render([{
      geometry: Geometry.litCube(0.5),
      material: new PBRMaterial({ name: "renderer-v9-material" }),
      label: "renderer-v9-cube"
    }]);

    expect(diagnostics.drawCalls).toBe(1);
    expect((renderer.device as MockRenderDevice).drawCommands[0]?.label).toBe("renderer-v9-cube");
    renderer.dispose();
  });

  it("exposes the assets v9 facade for GLTF loading and renderable scene creation", () => {
    expect(GLTFLoader).toBeTypeOf("function");
    expect(createRenderableScene).toBeTypeOf("function");
  });

  it("owns app route teardown for listeners, animation frames, and disposables", () => {
    const cancelledFrames: number[] = [];
    vi.stubGlobal("window", {
      requestAnimationFrame: vi.fn(() => 42),
      cancelAnimationFrame: vi.fn((handle: number) => cancelledFrames.push(handle))
    });
    const lifecycle = new G3DAppLifecycle();
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

  it("disposes v9 scene-owned geometry and material resources", () => {
    const scene = new G3DScene();
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
