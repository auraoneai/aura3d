/**
 * PRD-03 S9 browser probe (`post-bloom-energy`, §16.1 / PRD-03:2158) on the
 * `prd03-hdr-bloom` inputs: unlit emissive spheres (black base colour,
 * emissive #ffffff, so linear luma = strength) at strength 0.5/1/2/4/8,
 * bloom threshold 1.0, knee 0.25, plus one diffuse white wall lit to linear
 * luma ≤ 0.6.
 *
 * Measurement is linear: `output.toneMapping: "linear"` with exposure 1/16
 * and no dither, so the presented RGBA8 is sRGB(clamp(x / 16)). Bloom runs
 * before the output exposure, so thresholds see the authored HDR values. Each
 * case renders bloom-on and bloom-off; halo energy is
 * Σ linear-luma(on − off) over the halo mask (the frame outside the dilated
 * sphere silhouette), × 16 back to scene units.
 *
 * Asserted by `qr-prd03-bloom-energy.spec.ts`:
 *  - strength 2/4/8: halo energy ∝ excess (1/3/7) within ±10% ("no hidden gain");
 *  - strength 0.5 and the wall: added luma ≤ 0.5% (below the knee window);
 *  - strength 8: ≤ 2% of pixels at 255 (no blow-out).
 * Strength 1 sits inside the knee and is reported, not asserted.
 */
import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";
import { installFrameCapture } from "./qr-prd03-frame-capture";
import { postV2ModulesReady } from "@aura3d/rendering";

const SIZE = 192;
const EXPOSURE = 1 / 16;

function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearLuma(pixels: Uint8Array, i: number): number {
  return 0.2126 * srgbToLinear(pixels[i]!) + 0.7152 * srgbToLinear(pixels[i + 1]!) + 0.0722 * srgbToLinear(pixels[i + 2]!);
}

type Subject = { readonly kind: "sphere"; readonly strength: number } | { readonly kind: "wall" };

async function render(subject: Subject, bloom: boolean): Promise<Uint8Array> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-2400px;top:0;width:${SIZE}px;height:${SIZE}px;`;
  document.body.appendChild(host);
  let built = scene()
    .background("#000000")
    .camera(camera.perspective({ position: [0, 0, 6], target: [0, 0, 0], fov: 30, near: 0.1, far: 40 }));
  if (subject.kind === "sphere") {
    built = built.add(primitives.sphere({
      name: "emitter",
      size: 0.7,
      material: material.emissive({ color: "#000000", emissive: "#ffffff", emissiveIntensity: subject.strength })
    }));
  } else {
    built = built
      .add(lights.directional({ name: "key", color: "#ffffff", intensity: 0.5, position: [0, 0, 6] }))
      .add(primitives.plane({ name: "wall", size: [1.2, 1, 1.2], material: material.pbr({ color: "#ffffff", roughness: 1 }) })
        .rotate(Math.PI / 2, 0, 0));
  }
  if (bloom) built = built.add(effects.bloom({ intensity: 1, threshold: 1, knee: 0.25 } as never));
  const app = createAuraApp(host, {
    scene: built,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    pixelRatio: 1,
    resize: false,
    autoStart: false,
    output: { toneMapping: "linear", exposure: EXPOSURE, dither: false },
    qualityRebuild: { flags: ["A3D_QR_POST"] }
  } as never);
  try {
    await app.ready();
    // The v2 stages load deferred; wait so measured frames run the real chain.
    await postV2ModulesReady();
    // Read each frame in its own task from the default framebuffer
    // (qr-prd03-frame-capture); settle a few frames first.
    const capture = installFrameCapture(app, host.querySelector("canvas")!);
    for (let i = 0; i < 8; i++) {
      app.step(1 / 60);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return capture.read();
  } finally {
    app.dispose();
    host.remove();
  }
}

/** Halo mask: pixels farther than `pad` px from any core pixel of the bloom-off frame. */
function haloMask(off: Uint8Array, pad: number): Uint8Array {
  const core = new Uint8Array(SIZE * SIZE);
  for (let p = 0; p < SIZE * SIZE; p++) core[p] = linearLuma(off, p * 4) > 1e-3 ? 1 : 0;
  const mask = new Uint8Array(SIZE * SIZE).fill(1);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!core[y * SIZE + x]) continue;
      for (let dy = -pad; dy <= pad; dy++) {
        for (let dx = -pad; dx <= pad; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < SIZE && xx >= 0 && xx < SIZE) mask[yy * SIZE + xx] = 0;
        }
      }
    }
  }
  return mask;
}

export interface BloomEnergyCase {
  readonly subject: string;
  readonly haloEnergy: number;
  readonly offEnergy: number;
  /** Bloom-added luma over the whole frame as a fraction of the bloom-off frame's luma. */
  readonly addedFraction: number;
  readonly saturatedFraction: number;
}

async function measure(subject: Subject): Promise<BloomEnergyCase> {
  const off = await render(subject, false);
  const on = await render(subject, true);
  const mask = haloMask(off, 2);
  let halo = 0, offTotal = 0, onTotal = 0, saturated = 0;
  for (let p = 0; p < SIZE * SIZE; p++) {
    const lOn = linearLuma(on, p * 4), lOff = linearLuma(off, p * 4);
    onTotal += lOn;
    offTotal += lOff;
    if (mask[p]) halo += lOn - lOff;
    if (on[p * 4]! === 255 && on[p * 4 + 1]! === 255 && on[p * 4 + 2]! === 255) saturated += 1;
  }
  return {
    subject: subject.kind === "sphere" ? `sphere-${subject.strength}` : "wall",
    haloEnergy: halo / EXPOSURE,
    offEnergy: offTotal / EXPOSURE,
    addedFraction: offTotal > 0 ? (onTotal - offTotal) / offTotal : 0,
    saturatedFraction: saturated / (SIZE * SIZE)
  };
}

export async function runQrPrd03BloomEnergy(): Promise<{ readonly schema: "prd03-bloom-energy/v1"; readonly cases: readonly BloomEnergyCase[] }> {
  const cases: BloomEnergyCase[] = [];
  for (const strength of [0.5, 1, 2, 4, 8]) cases.push(await measure({ kind: "sphere", strength }));
  cases.push(await measure({ kind: "wall" }));
  return { schema: "prd03-bloom-energy/v1", cases };
}

(window as { runQrPrd03BloomEnergy?: typeof runQrPrd03BloomEnergy }).runQrPrd03BloomEnergy = runQrPrd03BloomEnergy;
// 03-S18d pattern: publish readiness only after the module evaluated.
(window as { qrPrd03BloomEnergyReady?: boolean }).qrPrd03BloomEnergyReady = true;
