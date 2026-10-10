/**
 * PRD-04 §16.2 / §16.3 — integrated acceptance probes.
 *
 * Every probe pins its own flag set (`ALL` below), so nothing is skipped on
 * `PRD04_FLAGS` (P-22); CI schedules this file in the `browser-all` job by
 * title (`qr_flags=all`). Lane-04's full capability surface is
 * `all,materials.ktx2,materials.transmission` — the area flag alone does not
 * enable the sub-flags (applyList only expands lane flags).
 *
 * Probes: tinted-hero vs three.js (S3 + §16.2), normal-tangent mirrored halves
 * ≤ 2 ΔE, KTX2 colour parity ≤ 2 ΔE + inverted-colour-space control > 5 ΔE,
 * alpha-to-coverage edge gradient ≥ 2 px, 24-light extension-material count,
 * and the transmission capture target under the union flag set.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  maskedDeltaE,
  maskedLaplacianVariance,
  meanEdgeTransitionWidth,
  mirroredDeltaE,
  shadowQuartileLuma,
  subjectMask,
} from "../../../../benchmarks/quality-rebuild/scenes/prd04/metrics";
import { startPrd04DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";
import { RESOLUTION } from "../../../../benchmarks/quality-rebuild/shared/types";
import { loadProbe, probeFrame, type Prd04ProbePayload } from "./probe";

const FLAGS = (process.env.PRD04_FLAGS ?? "none").split(",").filter(Boolean);
const ALL = "all,materials.ktx2,materials.transmission";

const capture = (engine: string, sceneId: string, extra = "") =>
  `/tests/qr/prd04/harness/prd04-capture.html?engine=${engine}&scene=${sceneId}&flags=${encodeURIComponent(ALL)}&pixels=1${extra}`;
const asset = (url: string, extra = "") =>
  `/tests/qr/prd04/harness/prd04-assets.html?asset=${encodeURIComponent(url)}&flags=${encodeURIComponent(ALL)}&render=1&pixels=1${extra}`;
const lightsUrl = (extra = "") =>
  `/tests/qr/prd04/harness/prd04-light-count.html?flags=${encodeURIComponent(ALL)}&lights=24&pixels=1${extra}`;

test.describe("PRD-04 §16.2/§16.3 integrated acceptance (qr_flags=all)", () => {
  let server: ExampleDevServer;
  const probes: Record<string, unknown>[] = [];

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    mkdirSync(resolve("tests/reports/prd04/probes"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/prd04/probes/integrated.json"),
      `${JSON.stringify({ probe: "integrated-acceptance", flags: FLAGS, probes }, null, 2)}\n`
    );
    await server.close();
  });

  test("tinted-hero: masked Laplacian >= 90% of three.js, shadow luma <= 1.1x", async ({ page }) => {
    const aura = probeFrame(
      await loadProbe(page, `${server.origin}${capture("aura3d", "prd04-tinted-hero", "&tint=%23e85d75")}`)
    );
    const three = probeFrame(
      await loadProbe(page, `${server.origin}${capture("three", "prd04-tinted-hero", "&tint=%23e85d75")}`)
    );
    const auraMask = subjectMask(aura.pixels);
    const threeMask = subjectMask(three.pixels);
    const auraLap = maskedLaplacianVariance(aura.pixels, aura.width, aura.height, auraMask);
    const threeLap = maskedLaplacianVariance(three.pixels, three.width, three.height, threeMask);
    const auraShadow = shadowQuartileLuma(aura.pixels, auraMask);
    const threeShadow = shadowQuartileLuma(three.pixels, threeMask);
    probes.push({
      probe: "tinted-hero-vs-three",
      auraLap,
      threeLap,
      auraShadow,
      threeShadow,
      lapRatio: auraLap / threeLap,
      shadowRatio: auraShadow / threeShadow
    });
    expect(auraLap, `aura Laplacian ${auraLap} >= 0.9 * three ${threeLap}`).toBeGreaterThanOrEqual(0.9 * threeLap);
    expect(auraShadow, `aura shadow ${auraShadow} <= 1.1 * three ${threeShadow}`).toBeLessThanOrEqual(1.1 * threeShadow);
  });

  test("prd04-normal-tangent: mirrored halves differ <= 2 deltaE00", async ({ page }) => {
    const frame = probeFrame(await loadProbe(page, `${server.origin}${capture("aura3d", "prd04-normal-tangent")}`));
    const mask = subjectMask(frame.pixels);
    const dE = mirroredDeltaE(frame.pixels, frame.width, frame.height, mask);
    probes.push({ probe: "normal-tangent-mirror", meanMirrorDeltaE: dE });
    expect(dE, `mirrored-halves deltaE ${dE} <= 2`).toBeLessThanOrEqual(2);
  });

  test("ktx2 uastc/etc1s within 2 deltaE00 of PNG; inverted color space > 5 deltaE", async ({ page }) => {
    const png = probeFrame(await loadProbe(page, `${server.origin}${asset("/fixtures/asset-corpus/damaged-helmet.glb")}`));
    const uastc = probeFrame(
      await loadProbe(page, `${server.origin}${asset("/fixtures/asset-corpus/damaged-helmet-uastc.glb")}`)
    );
    const etc1s = probeFrame(
      await loadProbe(page, `${server.origin}${asset("/fixtures/asset-corpus/damaged-helmet-etc1s.glb")}`)
    );
    const pngMask = subjectMask(png.pixels);
    const dEUastc = maskedDeltaE(png.pixels, uastc.pixels, pngMask);
    const dEEtc1s = maskedDeltaE(png.pixels, etc1s.pixels, pngMask);
    probes.push({ probe: "ktx2-colour-parity", dEUastc, dEEtc1s });
    expect(dEUastc, `uastc vs png deltaE ${dEUastc} <= 2`).toBeLessThanOrEqual(2);
    expect(dEEtc1s, `etc1s vs png deltaE ${dEEtc1s} <= 2`).toBeLessThanOrEqual(2);

    // §15.4 control: same PNG GLB with the decoder lying about decoded color
    // space — intent resolution must disagree hard (>> 5 deltaE).
    const wrongSpace = probeFrame(
      await loadProbe(page, `${server.origin}${asset("/fixtures/asset-corpus/damaged-helmet.glb", "&forceColorSpace=linear")}`)
    );
    const controlDE = maskedDeltaE(png.pixels, wrongSpace.pixels, pngMask);
    probes.push({ probe: "ktx2-colorspace-control", controlDE });
    expect(controlDE, `inverted-colour-space control deltaE ${controlDE} > 5`).toBeGreaterThan(5);
  });

  test("prd04-alpha-mask: alpha-to-coverage edge gradient >= 2px under all", async ({ page }) => {
    const on = probeFrame(await loadProbe(page, `${server.origin}${capture("aura3d", "prd04-alpha-mask")}`));
    const onMask = subjectMask(on.pixels);
    const widthOn = meanEdgeTransitionWidth(on.pixels, on.width, on.height, onMask);
    probes.push({ probe: "a2c-edge-gradient", flag: ALL, width: widthOn.mean, rows: widthOn.rows });
    expect(widthOn.rows, "edge rows detected").toBeGreaterThan(0);
    expect(widthOn.mean, `a2c edge gradient ${widthOn.mean}px >= 2`).toBeGreaterThanOrEqual(2);
  });

  test("24-point-light clearcoat GLB: dropping pt-19 changes pixels, lightsDroppedByMaterial == 0", async ({
    page
  }) => {
    const lit = await loadProbe(page, `${server.origin}${lightsUrl("")}`);
    const litFrame = probeFrame(lit);
    const litDropped = (lit.extra ?? {}).lightsDroppedByMaterial;
    probes.push({ probe: "light-count", lightsEvaluated: lit.extra?.["lightCount"], litDropped });
    expect(litDropped, "materials.lightsDroppedByMaterial === 0 under 24 point lights").toBe(0);

    const dropped = await loadProbe(page, `${server.origin}${lightsUrl("&lightsOff=pt-19")}`);
    const droppedFrame = probeFrame(dropped);
    const mask = subjectMask(litFrame.pixels);
    const dE = maskedDeltaE(litFrame.pixels, droppedFrame.pixels, mask);
    probes.push({ probe: "light-count-suppression", light: "pt-19", deltaE: dE });
    expect(dE, `suppressing pt-19 changes masked pixels (deltaE ${dE} > 0.2)`).toBeGreaterThan(0.2);
  });

  test("prd04-transmission under all: target active, full mip chain, readbacks 0", async ({ page }) => {
    const payload = await loadProbe(
      page,
      `${server.origin}${capture("aura3d", "prd04-transmission", "&transmission=env")}`
    );
    const expectedMips = Math.floor(Math.log2(Math.max(RESOLUTION.width, RESOLUTION.height))) + 1;
    const extra = payload.extra ?? {};
    probes.push({ probe: "transmission-under-all", extra });
    expect((extra as any).transmission?.targetActive).toBe(true);
    expect((extra as any).transmission?.mipCount).toBe(expectedMips);
    expect((extra as any).transmission?.readbacks).toBe(0);
  });
});
