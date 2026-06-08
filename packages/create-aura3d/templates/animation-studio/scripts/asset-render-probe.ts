/**
 * asset-render-probe.ts — the REAL "does it actually render?" gate for cast resolution.
 *
 * Metadata lies: a GLB can declare embedded textures yet render as a flat white silhouette
 * (malformed Sketchfab/FBX exports — alphaMode=BLEND, nested transforms, textures not wired
 * to baseColor). The only reliable test is to RENDER it and look at the pixels. This probe
 * loads ONE candidate against a NEUTRAL GREYSCALE background, captures a raw frame, and
 * measures whether the character body actually carries colour or detail. A robot that comes
 * out uniform white (low chroma AND low luma variance) is rejected before it can be cast.
 */

import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { startWarmVite, seekAndReadPixels, rawRgbaToPng } from "./render-core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, "..");
const MONOREPO_ROOT = resolve(TEMPLATE_ROOT, "../../../..");

const PROBE_W = 384;
const PROBE_H = 384;

export interface ProbeVerdict {
  readonly ok: boolean;
  readonly meanChroma: number;
  readonly lumaStd: number;
  readonly bodyFraction: number;
  readonly reason: string;
  /**
   * RENDERED detail grade (A/B/C) from the captured pixels — complements resolve-asset's
   * metadata mesh grade (poly/texture/material). A character that renders with both real surface
   * colour AND shading variance reads A; flat-but-coloured reads B; barely-textured reads C.
   * This is the "material validity" lever measured at the pixel level, where metadata can lie.
   */
  readonly detailGrade: "A" | "B" | "C";
}

/** Grade the RENDERED body detail from measured chroma (surface colour) + luma variance (form). */
function gradeRenderedDetail(meanChroma: number, lumaStd: number): "A" | "B" | "C" {
  if (meanChroma > 0.08 && lumaStd > 0.18) return "A"; // rich colour + strong form shading
  if (meanChroma > 0.03 || lumaStd > 0.22) return "B"; // some colour OR good form
  return "C";                                          // flat / low-detail body
}

/** Minimal one-character document on a neutral greyscale stage, close-up on the body. */
function probeDocument(url: string, clip: string, scale: number, heightUnits: number): unknown {
  const grey3: [number, number, number] = [0.2, 0.2, 0.21];
  const white: [number, number, number] = [1, 1, 1];
  const h = Math.max(0.6, heightUnits * scale);
  return {
    id: "probe",
    duration: 2,
    assets: { characters: [{ id: "probe", url, scale, defaultClip: clip, mouthMorphIndex: -1 }], props: [] },
    set: {
      clearColor: [0.04, 0.04, 0.05, 1],
      studioLightingScale: 0.5,
      environment: {
        color: grey3, intensity: 0.5,
        proceduralMap: { skyColor: grey3, horizonColor: grey3, groundColor: grey3, specularColor: grey3, intensity: 0.5, specularIntensity: 0.4 }
      },
      pieces: [],
      // NEUTRAL WHITE 3-point rig (mirrors moon-garden's intensities, which light the astronaut
      // properly). White so the background stays greyscale and the body shows its TRUE colour —
      // a real textured character lights up; the broken-white one stays flat.
      lights: [
        { id: "probe-key", kind: "point", color: white, position: [-2.6, 3.6, 2.6], intensity: 4.4, range: 18 },
        { id: "probe-fill", kind: "point", color: white, position: [2.4, 2.0, 1.4], intensity: 2.2, range: 13 },
        { id: "probe-rim", kind: "point", color: white, position: [0.4, 1.8, -2.0], intensity: 2.8, range: 13 }
      ]
    },
    walkableBounds: { min: [-2, 0, -2], max: [2, 0, 2] },
    shots: [{ shotId: "probe-shot", presetId: "two-shot", startTime: 0, endTime: 2, cameraSubject: [0, h * 0.45, 0] }],
    blocking: [{ characterId: "probe", shots: [{ shotId: "probe-shot", clip, waypoints: [{ time: 0, position: [0, 0, 0], yaw: 0 }] }] }],
    setDressing: [],
    worldState: { glowSpanSeconds: 2 }
  };
}

function measureBody(raw: Uint8Array): ProbeVerdict {
  // Body pixels = clearly brighter than the dark neutral background.
  let n = 0, chromaSum = 0, lumaSum = 0;
  const lumas: number[] = [];
  for (let i = 0; i < raw.length; i += 4) {
    const r = raw[i]! / 255, g = raw[i + 1]! / 255, b = raw[i + 2]! / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luma < 0.12) continue;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    n += 1; chromaSum += chroma; lumaSum += luma; lumas.push(luma);
  }
  const total = raw.length / 4;
  const bodyFraction = n / total;
  if (n < total * 0.01) return { ok: false, meanChroma: 0, lumaStd: 0, bodyFraction, reason: "body-not-visible", detailGrade: "C" };
  const meanChroma = chromaSum / n;
  const meanLuma = lumaSum / n;
  let varSum = 0;
  for (const l of lumas) varSum += (l - meanLuma) * (l - meanLuma);
  const lumaStd = Math.sqrt(varSum / n);
  // The reliable signal is CHROMA (real surface colour). A flat untextured body reads ~0
  // chroma no matter how it is lit; luma variance is fooled by the rig's shading gradients.
  // A very high luma-variance fallback still admits a genuinely detailed grey/metallic body.
  const ok = meanChroma > 0.025 || lumaStd > 0.30;
  return { ok, meanChroma: +meanChroma.toFixed(3), lumaStd: +lumaStd.toFixed(3), bodyFraction: +bodyFraction.toFixed(3), reason: ok ? "renders-textured" : "flat-untextured-body", detailGrade: gradeRenderedDetail(meanChroma, lumaStd) };
}

/**
 * A WARM probe harness: one Vite + Chromium, reused to render-test MANY candidates (the
 * resolver may sift dozens). Start once, probe each, close once — instead of paying the
 * ~10s browser/Vite startup per candidate.
 */
export class ProbeSession {
  private constructor(private readonly vite: Awaited<ReturnType<typeof startWarmVite>>, private readonly browser: import("@playwright/test").Browser, private readonly routeUrl: string) {}

  static async start(): Promise<ProbeSession> {
    const vite = await startWarmVite(TEMPLATE_ROOT, MONOREPO_ROOT);
    const address = vite.httpServer?.address();
    if (!address || typeof address === "string") { await vite.close(); throw new Error("probe vite failed"); }
    const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swdecoder", "--ignore-gpu-blocklist"] });
    return new ProbeSession(vite, browser, `http://127.0.0.1:${address.port}/live-route.html`);
  }

  async probe(url: string, clip: string, scale: number, heightUnits: number): Promise<ProbeVerdict> {
    const page = await this.browser.newPage({ viewport: { width: PROBE_W + 40, height: PROBE_H + 40 } });
    try {
      await page.addInitScript(() => { (window as unknown as { __AURA_LIVE_ROUTE_HEADLESS__: boolean }).__AURA_LIVE_ROUTE_HEADLESS__ = true; });
      await page.addInitScript((d) => { (window as unknown as { __AURA_EPISODE_DOCUMENT__: unknown }).__AURA_EPISODE_DOCUMENT__ = d; }, probeDocument(url, clip, scale, heightUnits));
      await page.goto(this.routeUrl, { waitUntil: "load", timeout: 60_000 });
      await page.waitForFunction(() => {
        const w = window as unknown as { __AURA_LIVE_ROUTE_READY__?: unknown; __AURA_LIVE_ROUTE_ERROR__?: string };
        if (w.__AURA_LIVE_ROUTE_ERROR__) throw new Error(`route error: ${w.__AURA_LIVE_ROUTE_ERROR__}`);
        return Boolean(w.__AURA_LIVE_ROUTE_READY__);
      }, { timeout: 60_000 });
      const { raw } = await seekAndReadPixels(page, 0.5, PROBE_W, PROBE_H);
      if (process.env.AURA_PROBE_DEBUG) writeFileSync(resolve(TEMPLATE_ROOT, `dist/probe-${process.env.AURA_PROBE_DEBUG}.png`), await rawRgbaToPng(raw, PROBE_W, PROBE_H));
      return measureBody(raw);
    } catch (err) {
      return { ok: false, meanChroma: 0, lumaStd: 0, bodyFraction: 0, reason: `probe-error: ${err instanceof Error ? err.message : String(err)}`, detailGrade: "C" };
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> { await this.browser.close(); await this.vite.close(); }
}

/** One-shot convenience wrapper (starts + closes its own session). */
export async function probeCharacterRender(url: string, clip: string, scale: number, heightUnits: number): Promise<ProbeVerdict> {
  const session = await ProbeSession.start();
  try { return await session.probe(url, clip, scale, heightUnits); }
  finally { await session.close(); }
}
