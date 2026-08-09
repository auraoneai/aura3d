import { camera, createAuraApp, distanceLod, geometry, instances, lights, material, scene, text3D, type AuraSceneBuilder, type AuraTransformSpec } from "@aura3d/engine";

declare global { interface Window { __AURA3D_ROOT_GEOMETRY__?: any } }

void run();

async function run(): Promise<void> {
  const apps: ReturnType<typeof createAuraApp>[] = [];
  try {
    const instanceCanvas = requiredCanvas("instances");
    const transforms = gridTransforms(10, 8, 0);
    const instanceApp = createAuraApp(instanceCanvas, { scene: instanceScene(transforms), autoStart: false, resize: false, pixelRatio: 1 });
    apps.push(instanceApp);
    await instanceApp.ready();
    instanceApp.step(1 / 60);
    const initialPixels = readPixels(instanceCanvas);
    const initialDiagnostics = instanceApp.diagnostics();
    const updatedTransforms = gridTransforms(10, 8, 0.18);
    instanceApp.setScene(instanceScene(updatedTransforms));
    await instanceApp.ready();
    instanceApp.step(1 / 60);
    const updatedPixels = readPixels(instanceCanvas);
    const updatedDiagnostics = instanceApp.diagnostics();

    const near = await renderLod(requiredCanvas("near"), 4.2, apps);
    const far = await renderLod(requiredCanvas("far"), 9, apps);
    const text = await renderTextAndCustom(requiredCanvas("text"), apps);
    const result = {
      status: "ready",
      renderer: "root-createAuraApp-production-runtime",
      instancing: {
        count: transforms.length,
        initialDrawCalls: initialDiagnostics.drawCalls,
        updatedDrawCalls: updatedDiagnostics.drawCalls,
        nativeInitial: initialDiagnostics.renderer?.runtime.nativeInstancedSubmissions,
        nativeUpdated: updatedDiagnostics.renderer?.runtime.nativeInstancedSubmissions,
        initialBackend: initialDiagnostics.renderer?.runtime.backend,
        updatedBackend: updatedDiagnostics.renderer?.runtime.backend,
        initialWarnings: initialDiagnostics.renderer?.runtime.warnings,
        updatedWarnings: updatedDiagnostics.renderer?.runtime.warnings,
        initialErrors: initialDiagnostics.errors,
        updatedErrors: updatedDiagnostics.errors,
        updateChangedPixels: changedPixels(initialPixels, updatedPixels),
        initialNonBlackPixels: nonBlack(initialPixels),
        updatedNonBlackPixels: nonBlack(updatedPixels),
        dataUrl: instanceCanvas.toDataURL("image/png")
      },
      lod: { near, far, changedPixels: changedPixels(near.pixels, far.pixels) },
      text,
      assertions: { rootOnlyImport: true, noDomTextRenderer: document.querySelector(".aura-world-label-layer") === null },
      lifecycle: { createdApps: apps.length, disposedApps: 0 }
    };
    apps.forEach((app) => app.dispose());
    result.lifecycle.disposedApps = apps.length;
    window.__AURA3D_ROOT_GEOMETRY__ = result;
  } catch (error) {
    window.__AURA3D_ROOT_GEOMETRY__ = { status: "error", error: error instanceof Error ? error.stack ?? error.message : String(error) };
  }
}

function instanceScene(transforms: readonly AuraTransformSpec[]): AuraSceneBuilder {
  const colors = transforms.map((_, index) => index % 3 === 0 ? "#ffba38" : index % 3 === 1 ? "#34d8ff" : "#a77bff");
  return scene().background("#05070b").camera(camera.orthographic({ position: [0, 5, 7], target: [0, 0, 0], orthographicSize: 3.8 }))
    .add(lights.directional({ intensity: 3.2 }).position(4, 7, 6))
    .add(instances.box({ name: "root instanced field", transforms, colors, material: material.pbr({ color: "#ffffff", roughness: 0.35, metallic: 0.08 }), scale: 0.42 }));
}
function gridTransforms(columns: number, rows: number, phase: number): AuraTransformSpec[] {
  const result: AuraTransformSpec[] = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) result.push({ position: [(column - (columns - 1) / 2) * 0.62, Math.sin(column * 0.7 + row + phase) * 0.14, (row - (rows - 1) / 2) * 0.62], rotation: [0, phase + column * 0.08, 0], scale: 0.72 + (row % 3) * 0.08 });
  return result;
}
async function renderLod(canvas: HTMLCanvasElement, distance: number, apps: ReturnType<typeof createAuraApp>[]) {
  const built = scene().background("#05070b").camera(camera.perspective({ position: [0, 0.4, distance], target: [0, 0.2, 0], fov: 38 }))
    .add(lights.directional({ intensity: 3 }).position(3, 5, 5))
    .add(distanceLod({ name: "root distance lod", levels: [{ name: "near sphere", maxDistance: 5, primitive: "sphere", material: material.pbr({ color: "#38d9ff", roughness: 0.22 }) }, { name: "far box", primitive: "box", material: material.pbr({ color: "#ff8e3c", roughness: 0.65 }) }], hysteresis: 0.5, scale: 1.6 }));
  const app = createAuraApp(canvas, { scene: built, autoStart: false, resize: false, pixelRatio: 1 }); apps.push(app); await app.ready(); app.step(1 / 60);
  const pixels = readPixels(canvas); return { distance, pixels: [...pixels], nonBlackPixels: nonBlack(pixels), center: [...pixels.slice(((Math.floor(canvas.height / 2) * canvas.width + Math.floor(canvas.width / 2)) * 4), ((Math.floor(canvas.height / 2) * canvas.width + Math.floor(canvas.width / 2)) * 4) + 4)], dataUrl: canvas.toDataURL("image/png") };
}
async function renderTextAndCustom(canvas: HTMLCanvasElement, apps: ReturnType<typeof createAuraApp>[]) {
  const pyramid = geometry.define({ kind: "aura-custom-geometry", positions: [[0, 1.2, 0], [-0.8, -0.5, 0.65], [0.8, -0.5, 0.65], [0.8, -0.5, -0.65], [-0.8, -0.5, -0.65]], indices: [0,1,2,0,2,3,0,3,4,0,4,1,1,4,3,1,3,2] });
  const built = scene().background("#05070b").camera(camera.perspective({ position: [1.2, 1.4, 7], target: [0.8, 0.5, 0], fov: 42 }))
    .add(lights.directional({ intensity: 4 }).position(4, 6, 5))
    .add(text3D("AURA3D", { name: "depth text mesh", size: 0.72, depth: 0.22, position: [-2.2, 0.15, 0], rotation: [-0.12, 0.18, 0], material: material.pbr({ color: "#f7c84b", metallic: 0.35, roughness: 0.28 }) }))
    .add(geometry.custom(pyramid, { name: "custom indexed pyramid", position: [2.1, 0.2, -0.15], material: material.pbr({ color: "#61e1b7", metallic: 0.12, roughness: 0.3 }) }));
  const app = createAuraApp(canvas, { scene: built, autoStart: false, resize: false, pixelRatio: 1 }); apps.push(app); await app.ready(); app.step(1 / 60);
  const pixels = readPixels(canvas); return { nonBlackPixels: nonBlack(pixels), uniqueColors: uniqueColors(pixels), drawCalls: app.diagnostics().drawCalls, backend: app.diagnostics().renderer?.runtime.backend, textMetadata: built.toJSON().nodes.find((node: any) => node.text3D)?.text3D, customKind: built.toJSON().nodes.find((node: any) => node.name === "custom indexed pyramid")?.geometry?.kind, dataUrl: canvas.toDataURL("image/png") };
}
function requiredCanvas(id: string): HTMLCanvasElement { const canvas = document.querySelector<HTMLCanvasElement>(`#${id}`); if (!canvas) throw new Error(`Missing ${id} canvas.`); return canvas; }
function readPixels(canvas: HTMLCanvasElement): Uint8Array { const gl = canvas.getContext("webgl2"); if (!gl) throw new Error("Expected WebGL2 root renderer."); const pixels = new Uint8Array(canvas.width * canvas.height * 4); gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; }
function changedPixels(a: Uint8Array | readonly number[], b: Uint8Array | readonly number[]): number { let changed = 0; for (let index = 0; index < Math.min(a.length, b.length); index += 4) if (Math.abs(a[index]! - b[index]!) + Math.abs(a[index + 1]! - b[index + 1]!) + Math.abs(a[index + 2]! - b[index + 2]!) > 8) changed += 1; return changed; }
function nonBlack(pixels: Uint8Array): number { let count = 0; for (let index = 0; index < pixels.length; index += 4) if (pixels[index]! + pixels[index + 1]! + pixels[index + 2]! > 18) count += 1; return count; }
function uniqueColors(pixels: Uint8Array): number { const colors = new Set<number>(); for (let index = 0; index < pixels.length; index += 4) colors.add(((pixels[index]! >> 4) << 8) | ((pixels[index + 1]! >> 4) << 4) | (pixels[index + 2]! >> 4)); return colors.size; }

export {};
