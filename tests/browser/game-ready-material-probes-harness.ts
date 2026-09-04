/**
 * PART C2 probe harness: renders one deterministic 2D parameter-probe swatch
 * per game-ready preset, driven by the preset's own authoring parameters.
 *
 * These are parameter probes (swatch + feature response), not production
 * rendering evidence: each swatch visualizes the preset baseColor plus the
 * feature the preset owns (clearcoat streak + flake speckle, wrap glow +
 * thickness tint, thin-pane transparency over checkerboard, anisotropic
 * brush streaks, alpha-cutout leaf cards, roughness-variation grain).
 */
import { GAME_READY_MATERIAL_PRESETS } from "../../packages/materials/src/GameReadyMaterialLibrary";

interface ProbeResult {
  readonly id: string;
  readonly mean: readonly [number, number, number];
}

declare global {
  interface Window {
    __AURA3D_GAME_READY_PROBES__?: { readonly ready: boolean; readonly probes: readonly ProbeResult[] };
  }
}

const SIZE = 320;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function rgb(color: readonly number[], scale = 1): string {
  const [r, g, b] = color;
  return `rgb(${Math.round(r * 255 * scale)},${Math.round(g * 255 * scale)},${Math.round(b * 255 * scale)})`;
}

function numberParam(params: Readonly<Record<string, number | string | readonly number[]>>, name: string, fallback: number): number {
  const value = params[name];
  return typeof value === "number" ? value : fallback;
}

function drawCheckerboard(context: CanvasRenderingContext2D, rand: () => number): void {
  void rand;
  const cell = 32;
  for (let y = 0; y < SIZE / cell; y++) {
    for (let x = 0; x < SIZE / cell; x++) {
      context.fillStyle = (x + y) % 2 === 0 ? "#c8d2da" : "#3c4650";
      context.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}

function paintBase(context: CanvasRenderingContext2D, base: readonly number[], dark = 0.55): void {
  const gradient = context.createLinearGradient(0, 0, 0, SIZE);
  gradient.addColorStop(0, rgb(base, 1.25));
  gradient.addColorStop(0.55, rgb(base, 1));
  gradient.addColorStop(1, rgb(base, dark));
  context.fillStyle = gradient;
  context.fillRect(0, 0, SIZE, SIZE);
}

function specularBlob(context: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number): void {
  const glow = context.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, `rgba(255,255,255,${alpha})`);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = glow;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function renderProbe(canvas: HTMLCanvasElement, presetId: string, params: Readonly<Record<string, number | string | readonly number[]>>): void {
  const context = canvas.getContext("2d");
  if (!context) throw new Error(`2d context unavailable for ${presetId}`);
  const seed = [...presetId].reduce((sum, ch) => sum + ch.charCodeAt(0), 7);
  const rand = mulberry32(seed);
  const base = (params.baseColor ?? params.color ?? [0.5, 0.5, 0.5]) as readonly number[];

  switch (presetId) {
    case "carPaint": {
      paintBase(context, base, 0.35);
      specularBlob(context, SIZE * 0.38, SIZE * 0.3, 120, 0.85);
      context.fillStyle = "rgba(255,255,255,0.5)";
      context.fillRect(SIZE * 0.1, SIZE * 0.62, SIZE * 0.8, 6);
      const flakes = Math.round(numberParam(params, "flakeDensity", 0.6) * 1500);
      const strength = numberParam(params, "flakeNormalScale", 0.35);
      for (let i = 0; i < flakes; i++) {
        const shade = rand();
        context.fillStyle = shade > 0.5 ? `rgba(255,255,255,${0.25 + strength * 0.6})` : `rgba(0,0,0,${0.2 + strength * 0.4})`;
        context.fillRect(rand() * SIZE, rand() * SIZE, 1.6, 1.6);
      }
      break;
    }
    case "skinSSS-approx": {
      paintBase(context, base, 0.5);
      const tint = (params.thicknessTint ?? [0.98, 0.35, 0.25]) as readonly number[];
      const wrap = context.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.1, SIZE / 2, SIZE / 2, SIZE * 0.62);
      wrap.addColorStop(0, "rgba(255,244,230,0.5)");
      wrap.addColorStop(0.55, "rgba(255,244,230,0.08)");
      wrap.addColorStop(1, rgb(tint, 0.55));
      context.fillStyle = wrap;
      context.fillRect(0, 0, SIZE, SIZE);
      specularBlob(context, SIZE * 0.42, SIZE * 0.34, 70, 0.35);
      break;
    }
    case "glassThin": {
      drawCheckerboard(context, rand);
      context.globalAlpha = 0.55;
      paintBase(context, base, 0.8);
      context.globalAlpha = 1;
      context.save();
      context.translate(SIZE / 2, SIZE / 2);
      context.rotate(-0.5);
      context.fillStyle = "rgba(255,255,255,0.55)";
      context.fillRect(-SIZE * 0.55, -18, SIZE * 1.1, 10);
      context.fillStyle = "rgba(255,255,255,0.28)";
      context.fillRect(-SIZE * 0.55, -2, SIZE * 1.1, 22);
      context.restore();
      context.strokeStyle = "rgba(240,250,255,0.9)";
      context.lineWidth = 5;
      context.strokeRect(8, 8, SIZE - 16, SIZE - 16);
      break;
    }
    case "brushedMetal": {
      paintBase(context, base, 0.5);
      const streaks = 220;
      for (let i = 0; i < streaks; i++) {
        const y = rand() * SIZE;
        const light = rand() > 0.5;
        context.fillStyle = light ? `rgba(255,255,255,${0.04 + numberParam(params, "anisotropy", 0.85) * 0.12})` : "rgba(10,14,20,0.12)";
        context.fillRect(0, y, SIZE, 1 + rand() * 2);
      }
      const band = context.createLinearGradient(SIZE * 0.3, 0, SIZE * 0.62, 0);
      band.addColorStop(0, "rgba(255,255,255,0)");
      band.addColorStop(0.5, "rgba(255,255,255,0.4)");
      band.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = band;
      context.fillRect(0, 0, SIZE, SIZE);
      break;
    }
    case "foliage": {
      drawCheckerboard(context, rand);
      const leaf = base;
      const glow = (params.translucencyColor ?? [0.55, 0.8, 0.3]) as readonly number[];
      for (let i = 0; i < 46; i++) {
        const x = SIZE * 0.12 + rand() * SIZE * 0.76;
        const y = SIZE * 0.1 + rand() * SIZE * 0.8;
        const rx = 14 + rand() * 26;
        const ry = 8 + rand() * 14;
        const rot = rand() * Math.PI;
        const sunSide = x > SIZE * 0.55;
        context.save();
        context.translate(x, y);
        context.rotate(rot);
        context.fillStyle = sunSide ? rgb(glow, 0.85) : rgb(leaf, 0.95);
        context.beginPath();
        context.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(20,40,16,0.8)";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(-rx, 0);
        context.lineTo(rx, 0);
        context.stroke();
        context.restore();
      }
      break;
    }
    case "concreteAsphalt": {
      paintBase(context, base, 0.7);
      const variation = numberParam(params, "roughnessVariation", 0.25);
      for (let i = 0; i < 260; i++) {
        const delta = (rand() - 0.5) * variation * 2 * 255;
        const x = rand() * SIZE;
        const y = rand() * SIZE;
        const r = 3 + rand() * 16;
        context.fillStyle = delta >= 0 ? `rgba(255,255,255,${Math.min(0.5, Math.abs(delta) / 255)})` : `rgba(0,0,0,${Math.min(0.5, Math.abs(delta) / 255)})`;
        context.beginPath();
        context.arc(x, y, r, 0, Math.PI * 2);
        context.fill();
      }
      for (let i = 0; i < 2200; i++) {
        const v = rand() > 0.5 ? 255 : 0;
        context.fillStyle = `rgba(${v},${v},${v},0.08)`;
        context.fillRect(rand() * SIZE, rand() * SIZE, 1.4, 1.4);
      }
      break;
    }
    default:
      paintBase(context, base);
  }
}

function meanColor(canvas: HTMLCanvasElement): [number, number, number] {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2d context unavailable for readout");
  const data = context.getImageData(0, 0, SIZE, SIZE).data;
  let r = 0;
  let g = 0;
  let b = 0;
  const count = SIZE * SIZE;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i] ?? 0;
    g += data[i + 1] ?? 0;
    b += data[i + 2] ?? 0;
  }
  return [r / count, g / count, b / count];
}

const grid = document.querySelector("#probe-grid");
if (!grid) throw new Error("missing #probe-grid");
const probes: ProbeResult[] = [];
for (const preset of GAME_READY_MATERIAL_PRESETS) {
  const figure = document.createElement("figure");
  figure.className = "probe";
  figure.id = `probe-${preset.id}`;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  renderProbe(canvas, preset.id, preset.parameters);
  const caption = document.createElement("figcaption");
  caption.textContent = `${preset.label} — ${preset.features.join(" + ")}`;
  figure.append(canvas, caption);
  grid.append(figure);
  const mean = meanColor(canvas);
  probes.push({ id: preset.id, mean: [Math.round(mean[0]), Math.round(mean[1]), Math.round(mean[2])] });
}
window.__AURA3D_GAME_READY_PROBES__ = { ready: true, probes };
