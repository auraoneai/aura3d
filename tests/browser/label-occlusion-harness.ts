/**
 * WS-2.7 harness — a label behind geometry, and the same label in front of it.
 *
 * Uses only `@aura3d/engine` (R1 harness-import shape). The two scenes are identical except for the
 * subject's z, so anything that changes between them is attributable to occlusion and nothing else.
 */
import { camera, createAuraApp, labels, lights, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "../../src/aura-assets";

let mixedApp: ReturnType<typeof createAuraApp> | undefined;
async function mixedLabels(options: { tick: boolean; fontSize: number; cameraX: number }) {
  const host = document.querySelector<HTMLDivElement>("#mixed-labels") ?? document.createElement("div");
  host.id = "mixed-labels";
  host.style.cssText = "position:relative;width:100%;height:520px";
  if (!host.isConnected) document.body.replaceChildren(host);
  const canvas = host.querySelector("canvas") ?? document.createElement("canvas");
  canvas.width = Math.min(window.innerWidth - 16, 1000);
  canvas.height = 520;
  host.append(canvas);
  const built = scene().background("#172132")
    .camera(camera.perspective({ position: [options.cameraX, 1, 8], target: [0, 1, 0], fov: 45 }))
    .add(lights.studio())
    .add(model(assets.robotcand, { name: "label-hero", targetHeight: 2.2 }))
    .add(labels.hud("Label placement", { name: "mixed-hud" }))
    .add(labels.billboard("Annotation", { name: "mixed-fixed-annotation", position: [-2.5, 2.5, 0], occlusionAware: false }))
    .add(labels.axisTick("0", { name: "mixed-fixed-tick", position: [-2.5, 0.2, 0], occlusionAware: false }));
  for (let i = 0; i < 12; i++) {
    const config = { name: `mixed-${i}`, position: [-2.5, 1.5, 0] as const, size: options.fontSize / 46, occlusionAware: false };
    built.add(options.tick ? labels.axisTick(`Tick ${i}`, config) : labels.billboard(`Note ${i}`, config));
  }
  if (mixedApp) mixedApp.setScene(built);
  else mixedApp = createAuraApp(canvas, { scene: built, autoStart: false, pixelRatio: 1, resize: false });
  await mixedApp.ready();
  mixedApp.step(1 / 60);
  await document.fonts.ready;
  mixedApp.step(1 / 60);
  const diagnostics = mixedApp.diagnostics();
  const canvasRect = canvas.getBoundingClientRect();
  const rectangles = [...host.querySelectorAll<HTMLElement>("[data-aura-label-id]")].map(element => {
    const rect = element.getBoundingClientRect();
    return { id: element.dataset.auraLabelId, role: element.dataset.labelRole, visible: element.style.display !== "none",
      x: rect.x - canvasRect.x, y: rect.y - canvasRect.y, width: rect.width, height: rect.height };
  });
  const protectedHeroRect = {
    x: canvasRect.width * 0.36,
    y: canvasRect.height * 0.18,
    width: canvasRect.width * 0.28,
    height: canvasRect.height * 0.72
  };
  const gl = canvas.getContext("webgl2");
  const pixels = gl ? new Uint8Array(canvas.width * canvas.height * 4) : null;
  if (gl && pixels) gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let heroRegionColoredPixels = 0;
  if (pixels) {
    const scaleX = canvas.width / Math.max(1, canvasRect.width);
    const scaleY = canvas.height / Math.max(1, canvasRect.height);
    const x0 = Math.max(0, Math.floor(protectedHeroRect.x * scaleX));
    const x1 = Math.min(canvas.width, Math.ceil((protectedHeroRect.x + protectedHeroRect.width) * scaleX));
    const y0 = Math.max(0, Math.floor((canvasRect.height - protectedHeroRect.y - protectedHeroRect.height) * scaleY));
    const y1 = Math.min(canvas.height, Math.ceil((canvasRect.height - protectedHeroRect.y) * scaleY));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const offset = (y * canvas.width + x) * 4;
      const r = pixels[offset]!, g = pixels[offset + 1]!, b = pixels[offset + 2]!;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 12 || Math.max(r, g, b) > 70) heroRegionColoredPixels++;
    }
  }
  return { projected: diagnostics.labels, telemetry: diagnostics.labelTelemetry, rectangles, protectedHeroRect, heroRegionColoredPixels,
    viewport: { width: canvasRect.width, height: canvasRect.height }, typedHero: assets.robotcand.hash };
}
(window as unknown as { __mixedLabels: typeof mixedLabels }).__mixedLabels = mixedLabels;

interface Reading {
  readonly occluded: boolean;
  readonly opacity: number;
  readonly visible: boolean;
  readonly domOpacity: string;
  readonly domOccludedAttribute: string;
}

async function measure(subjectZ: number): Promise<Reading> {
  const host = document.createElement("div");
  host.style.position = "relative";
  document.body.append(host);
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  host.append(canvas);

  /*
   * Camera at +z looking at the origin. A large opaque wall sits at z = 0. The subject is either behind
   * it (negative z) or in front of it (positive z), and carries the label.
   */
  const built = scene()
    .background("#05070b")
    .camera(camera.perspective({ position: [0, 0, 6], target: [0, 0, 0], fov: 45 }))
    .add(lights.directional({ name: "key", intensity: 2.5 }).position(2, 3, 4))
    .add(primitives.box({ name: "wall", material: material.pbr({ color: "#3a4453" }) }).position(0, 0, 0).scale([4, 4, 0.2]))
    .add(primitives.sphere({ name: "subject", material: material.pbr({ color: "#e05252" }) }).position(0, 0, subjectZ).scale([0.5, 0.5, 0.5]))
    .add(labels.anchor("Rear axle", "subject", { name: "subject callout", position: [1.4, 0.9, subjectZ] }));

  const app = createAuraApp(canvas, { scene: built, autoStart: false, pixelRatio: 1, resize: false });
  await app.ready();
  app.step(1 / 60);

  const projected = (app.diagnostics().labels ?? []).find((entry) => entry.id === "subject callout");
  const element = host.querySelector<HTMLElement>(".aura-world-label-layer [role='note']");
  return {
    occluded: projected?.occluded ?? false,
    opacity: projected?.occlusionOpacity ?? 1,
    visible: projected?.visible ?? false,
    domOpacity: element?.style.opacity ?? "",
    domOccludedAttribute: element?.dataset.occluded ?? ""
  };
}

async function main(): Promise<void> {
  // Behind the wall, then in front of it. Same scene otherwise.
  const behind = await measure(-1.5);
  const inFront = await measure(1.5);
  (window as unknown as { __labelOcclusionProbe: unknown }).__labelOcclusionProbe = { behind, inFront };
}

void main().catch((error: unknown) => {
  (window as unknown as { __labelOcclusionProbeError: string }).__labelOcclusionProbeError =
    error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
});
