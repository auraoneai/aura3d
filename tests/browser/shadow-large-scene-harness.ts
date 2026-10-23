import { prd02ShadowBridgeReason, prd02ShadowDepthProbe } from "@aura3d/rendering/lanes";
import { createAuraApp, camera, defineAuraAssets, effects, environments, lights, material, model, primitives, scene } from "@aura3d/engine";

// The production bridge only engages for a typed same-origin GLB with hash + provenance; this is the
// repo's robotcand asset declared inline (src/aura-assets.ts is not part of the remote build context).
const assets = defineAuraAssets({
  robotcand: {
    type: "model",
    format: "glb",
    url: "/aura-assets/robotcand.f71a4701.glb",
    hash: "sha256-f71a470103b0ff13cf36f465ef958e283392414e157cce08e6e2a424cef35516",
    bounds: [15.914, 25.053, 10.001],
    sizeBytes: 3901144,
    metadata: {
      provenance: {
        sourcePath: "public/aura-assets/robotcand.f71a4701.glb",
        sha256: "sha256-f71a470103b0ff13cf36f465ef958e283392414e157cce08e6e2a424cef35516",
        license: "CC-BY-4.0"
      },
      sourcePath: "public/aura-assets/robotcand.f71a4701.glb",
      license: "CC-BY-4.0"
    }
  }
} as never) as { readonly robotcand: never };

/**
 * Large-scene directional shadow probe: a 900 m ground plane, a road of buildings out to
 * 220 m and a high sun. The same scene is rendered with the sun's shadow off (control) and
 * on; open ground and sun-facing walls must keep the control's brightness, shadows only
 * darken the lee of occluders.
 */
export interface BandMetric { readonly band: string; readonly meanLuma: number; readonly pixels: number }
export interface ShadowProbeCapture {
  readonly id: string;
  readonly bands: readonly BandMetric[];
  readonly shadows: { readonly requested: boolean; readonly mapRendered: boolean; readonly mapSampled: boolean; readonly label?: string };
  readonly runtimeBackend: string | undefined;
  readonly bridgeReason: string;
  readonly depthProbe: unknown;
}

declare global {
  interface Window {
    __SHADOW_PROBE__?: { capture(id: string, shadow: boolean, far: number, variant?: ProbeVariant): Promise<ShadowProbeCapture> };
    __SHADOW_PROBE_ERROR__?: string;
  }
}

export interface ProbeVariant {
  /** Only a few barriers cast (every house and the ground opt out), as in the Ninja Runner scene. */
  readonly sparseCasters?: boolean;
  readonly hdri?: boolean;
  readonly hemisphere?: boolean;
  readonly fog?: boolean;
  readonly ao?: boolean;
  readonly post?: boolean;
}

window.__SHADOW_PROBE__ = { capture };

function probeScene(shadow: boolean, far: number, variant: ProbeVariant) {
  const sparse = variant.sparseCasters === true;
  const builder = scene()
    .background("#7aa0c8")
    .camera(camera.perspective({ position: [0, 3.2, 14], target: [0, 1.6, -40], fov: 52, far }))
    .add(primitives.plane({ name: "ground", material: material.pbr({ color: "#b9b39a", roughness: 0.9, metallic: 0 }), ...(sparse ? { castShadow: false, receiveShadow: true } : {}) })
      .position(0, 0, 0).scale([900, 1, 900]));
  for (let i = 0; i < 18; i += 1) {
    const z = -8 - i * 12;
    for (const side of [-1, 1]) {
      builder.add(primitives.box({ name: `house-${side}-${i}`, material: material.pbr({ color: "#d8c9a8", roughness: 0.8, metallic: 0 }), ...(sparse ? { castShadow: false, receiveShadow: true } : {}) })
        .position(side * 11, 3, z).scale([6, 6, 7]));
    }
  }
  if (sparse) {
    for (let i = 0; i < 5; i += 1) {
      builder.add(primitives.box({ name: `barrier-${i}`, material: material.pbr({ color: "#a07040", roughness: 0.8, metallic: 0 }), castShadow: true })
        .position(-3 + (i % 3) * 3, 0.75, -20 - i * 25).scale([2, 1.5, 0.6]));
    }
  }
  if (variant.hdri) builder.add(environments.hdri({ name: "sky ibl", intensity: 0.7, background: false, texture: { type: "texture", format: "hdr", url: "/hdri/autumn_field_puresky_1k.hdr" } as never }));
  if (variant.hemisphere) builder.add(lights.hemisphere({ name: "sky fill", skyColor: "#d3ebf3", groundColor: "#80715b", intensity: 0.5 }));
  if (variant.fog) builder.add(effects.fog({ name: "haze", color: "#b5c8c4", density: 0.0028 }));
  if (variant.ao) builder.add(effects.ambientOcclusion({ name: "ao" }));
  if (variant.post) {
    builder
      .add(effects.bloom({ name: "bloom", intensity: 0.35, threshold: 1.0, radius: 0.4 }))
      .add(effects.colorGrade({ name: "grade", contrast: 1.06, saturation: 1.08 }))
      .add(effects.vignette({ name: "vignette", intensity: 0.22, smoothness: 0.7 }))
      .add(effects.antiAlias({ name: "aa", mode: "fxaa" }));
  }
  builder.add(model(assets.robotcand, { name: "typed occluder", targetMaxDimension: 2 }).position(0, 1, 6).runtime({ id: "occluder" }));
  return builder.add(lights.directional({
    name: "sun", position: [-40, 67, 56], target: [0, 0, 0], intensity: 2.8, color: "#ffe3b1", shadow
  }));
}

async function capture(id: string, shadow: boolean, far: number, variant: ProbeVariant = {}): Promise<ShadowProbeCapture> {
  const stage = document.getElementById("stage")!;
  stage.replaceChildren();
  const app = createAuraApp(stage, {
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: probeScene(shadow, far, variant)
  });
  const started = performance.now();
  while (!(app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0)) {
    if (performance.now() - started > 60_000) throw new Error("timed out waiting for first draw");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const canvas = app.canvas!;
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true })!;
  const w = canvas.width;
  const h = canvas.height;
  const pixels = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  // readPixels is bottom-up: y = 0 is the bottom row. Bands are fractions of frame height from the top.
  const bandDefs: readonly (readonly [string, number, number, number, number])[] = [
    ["ground-near", 0.82, 0.98, 0.42, 0.58],
    ["ground-mid", 0.64, 0.74, 0.46, 0.54],
    ["ground-far", 0.56, 0.60, 0.47, 0.53],
    ["wall-left", 0.35, 0.60, 0.05, 0.30],
    ["wall-right", 0.35, 0.60, 0.70, 0.95]
  ];
  const bands: BandMetric[] = bandDefs.map(([band, top0, top1, x0, x1]) => {
    let sum = 0;
    let count = 0;
    for (let ty = Math.floor(top0 * h); ty < Math.floor(top1 * h); ty += 1) {
      const y = h - 1 - ty;
      for (let x = Math.floor(x0 * w); x < Math.floor(x1 * w); x += 1) {
        const i = (y * w + x) * 4;
        sum += pixels[i]! * 0.2126 + pixels[i + 1]! * 0.7152 + pixels[i + 2]! * 0.0722;
        count += 1;
      }
    }
    return { band, meanLuma: Number((sum / Math.max(1, count)).toFixed(2)), pixels: count };
  });
  const d = app.diagnostics();
  const result: ShadowProbeCapture = {
    id,
    bands,
    runtimeBackend: d.renderer?.runtime.backend,
    bridgeReason: prd02ShadowBridgeReason(),
    depthProbe: (() => { try { return prd02ShadowDepthProbe(); } catch (error) { return String(error); } })(),
    shadows: {
      requested: d.renderer?.shadows.requested ?? false,
      mapRendered: d.renderer?.shadows.mapRendered ?? false,
      mapSampled: d.renderer?.shadows.mapSampled ?? false,
      ...(d.renderer?.shadows.label ? { label: d.renderer.shadows.label } : {})
    }
  };
  app.dispose();
  return result;
}
