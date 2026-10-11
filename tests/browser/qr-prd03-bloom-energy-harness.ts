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
import { frameToPngDataUrl, installFrameCapture, meanLuma, postDiagnostics } from "./qr-prd03-frame-capture";
import { postV2ModulesReady } from "@aura3d/rendering";

// configureCanvas enforces a 320×220 minimum backing store; a smaller host
// gives a wider canvas than the probe indexes (GPU run 38140351314 read a
// 320-wide frame with a smaller stride). 320 keeps the canvas square.
const SIZE = 320;
const EXPOSURE = 1 / 16;

function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearLuma(pixels: Uint8Array, i: number): number {
  return 0.2126 * srgbToLinear(pixels[i]!) + 0.7152 * srgbToLinear(pixels[i + 1]!) + 0.0722 * srgbToLinear(pixels[i + 2]!);
}

type Subject = { readonly kind: "sphere"; readonly strength: number } | { readonly kind: "wall" };

/** Diagnostics for the spec artifacts (strength-4 sphere and the wall). */
export const bloomFrames: Record<string, { png: string; meanLuma: number; diagnostics: unknown }> = {};

interface Frame { readonly pixels: Uint8Array; readonly width: number; readonly height: number }

async function render(subject: Subject, bloom: boolean): Promise<Frame> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-2400px;top:0;width:${SIZE}px;height:${SIZE}px;`;
  document.body.appendChild(host);
  let built = scene()
    .background("#000000")
    .camera(camera.perspective({ position: [0, 0, 6], target: [0, 0, 0], fov: 30, near: 0.1, far: 40 }));
  if (subject.kind === "sphere") {
    // A scene with no direct light gets the production fallback key/fill/rim
    // rig; its specular highlight on the sphere is a strength-independent
    // excess above threshold (GPU 38157297976: core = strength exactly, but
    // bloom totals 1 : 2.87 : 6.60). An authored zero-intensity light keeps
    // the rig off so the emitter is pure emission.
    built = built.add(lights.directional({ name: "no-fallback-rig", intensity: 0, position: [0, 0, 6] }));
    built = built.add(primitives.sphere({
      name: "emitter",
      size: 0.7,
      // envMapIntensity 0: the probe assumes linear luma == strength; the
      // production environment's specular on a roughness-0.35 sphere added a
      // constant (GPU 38153304062: halo 2.70 / 6.14 ≈ excess (s − 1 + 0.06)).
      material: material.emissive({ color: "#000000", emissive: "#ffffff", emissiveIntensity: subject.strength, envMapIntensity: 0 })
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
    qualityRebuild: { flags: ["post"] }
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
    const pixels = capture.read();
    const width = capture.width, height = capture.height;
    const label = `${subject.kind === "sphere" ? `sphere-${subject.strength}` : "wall"}-${bloom ? "on" : "off"}`;
    if (label.startsWith("sphere-4") || label.startsWith("wall")) {
      bloomFrames[label] = { png: frameToPngDataUrl(pixels, width, height), meanLuma: meanLuma(pixels), diagnostics: postDiagnostics(app) };
    }
    // GPU 38154706149 presented a 320×600 frame for the 320×320 host; index
    // the frame that was actually read, never the requested host size.
    return { pixels, width, height };
  } finally {
    app.dispose();
    host.remove();
  }
}

/** Halo mask: pixels farther than `pad` px from any core pixel of the bloom-off frame. */
function haloMask(off: Frame, pad: number): Uint8Array {
  const { width, height } = off;
  const core = new Uint8Array(width * height);
  // 1e-3 linear sits above the ±1 LSB dither floor on black (≈ 3e-4).
  for (let p = 0; p < width * height; p++) core[p] = linearLuma(off.pixels, p * 4) > 1e-3 ? 1 : 0;
  const mask = new Uint8Array(width * height).fill(1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!core[y * width + x]) continue;
      for (let dy = -pad; dy <= pad; dy++) {
        for (let dx = -pad; dx <= pad; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < height && xx >= 0 && xx < width) mask[yy * width + xx] = 0;
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
  /** Scene-linear luma at the frame centre of the bloom-off frame (sphere core ≈ strength). */
  readonly coreLuma?: number;
  readonly offMeanLuma?: number;
  readonly onMeanLuma?: number;
  readonly pixelCount?: number;
  readonly frameSize?: readonly [number, number];
}

async function measure(subject: Subject): Promise<BloomEnergyCase> {
  const offFrame = await render(subject, false);
  const onFrame = await render(subject, true);
  if (onFrame.width !== offFrame.width || onFrame.height !== offFrame.height) {
    throw new Error(`bloom on/off frames differ in size: ${onFrame.width}x${onFrame.height} vs ${offFrame.width}x${offFrame.height}`);
  }
  const { width, height } = offFrame;
  const off = offFrame.pixels, on = onFrame.pixels;
  const mask = haloMask(offFrame, 2);
  const pixelTotal = width * height;
  let halo = 0, offTotal = 0, onTotal = 0, saturated = 0;
  for (let p = 0; p < pixelTotal; p++) {
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
    saturatedFraction: saturated / pixelTotal,
    // Diagnostics: GPU lane 38127246424 logged frame mean luma 9.55 for a
    // render whose case reported offEnergy 0 — record both sides here.
    coreLuma: linearLuma(off, (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4) / EXPOSURE,
    offMeanLuma: meanLuma(off),
    onMeanLuma: meanLuma(on),
    pixelCount: pixelTotal,
    frameSize: [width, height] as const
  };
}

export async function runQrPrd03BloomEnergy(): Promise<{ readonly schema: "prd03-bloom-energy/v1"; readonly cases: readonly BloomEnergyCase[]; readonly frames: typeof bloomFrames }> {
  const cases: BloomEnergyCase[] = [];
  for (const strength of [0.5, 1, 2, 4, 8]) cases.push(await measure({ kind: "sphere", strength }));
  cases.push(await measure({ kind: "wall" }));
  return { schema: "prd03-bloom-energy/v1", cases, frames: bloomFrames };
}

(window as { runQrPrd03BloomEnergy?: typeof runQrPrd03BloomEnergy }).runQrPrd03BloomEnergy = runQrPrd03BloomEnergy;
// 03-S18d pattern: publish readiness only after the module evaluated.
(window as { qrPrd03BloomEnergyReady?: boolean }).qrPrd03BloomEnergyReady = true;
