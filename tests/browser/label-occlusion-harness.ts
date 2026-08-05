/**
 * WS-2.7 harness — a label behind geometry, and the same label in front of it.
 *
 * Uses only `@aura3d/engine` (R1 harness-import shape). The two scenes are identical except for the
 * subject's z, so anything that changes between them is attributable to occlusion and nothing else.
 */
import { camera, createAuraApp, labels, lights, material, primitives, scene } from "@aura3d/engine";

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
