/**
 * Scene-level runner for the §16.4 metrics: given decoded captures (engine
 * default + broken controls) and the spec's analytic masks, compute the
 * per-scene metric table. Everything is keyed so `report.json` is
 * self-describing and the flag-none baseline can be diffed run to run.
 */
import { analyticMasks, maskPixelCount, shadowReceiverMask } from "../../../../benchmarks/quality-rebuild/scenes/prd02/masks";
import type { SceneSpec } from "../../../../benchmarks/quality-rebuild/shared/types";
import {
  channelRatio,
  clippingFraction,
  coverage,
  diffPixelRatio,
  edgeDensity,
  hfEnergy,
  lumaRange,
  maskIoU,
  meanFrameDiff,
  shadowDrop,
  shadowMask,
  stdLuma,
  type MaskBuffer,
  type PixelBuffer
} from "./regionMetrics";

export interface SceneCaptureSet {
  readonly aura: PixelBuffer;
  readonly three: PixelBuffer;
  /** Broken-control renders, keyed `"<engine>-<control>"` (e.g. "three-no-shadows"). */
  readonly controls?: Readonly<Record<string, PixelBuffer>>;
  /** Temporal strip frames (ordered), when the spec declares `strip`. */
  readonly stripFrames?: readonly PixelBuffer[];
}

export interface SceneMetricResult {
  readonly scene: string;
  readonly masks: Readonly<Record<string, number>>; // mask name -> pixel count
  readonly metrics: Readonly<Record<string, number | string | readonly number[]>>;
  readonly skipped: readonly string[];
}

export function computeSceneMetrics(
  sceneId: string,
  spec: SceneSpec,
  capture: SceneCaptureSet
): SceneMetricResult {
  const size = { width: capture.aura.width, height: capture.aura.height };
  const masks = analyticMasks(spec, size);
  const threeOff = capture.controls?.["three-no-shadows"];
  const auraOff = capture.controls?.["aura-no-shadows"];
  const metrics: Record<string, number | string | readonly number[]> = {};
  const skipped: string[] = [];

  // shadow-receiver mask needs the three-side no-shadows control.
  let receiver = masks["shadow-receiver"] as MaskBuffer | undefined;
  if (spec.masks?.includes("shadow-receiver")) {
    if (threeOff) {
      receiver = shadowReceiverMask(capture.three, threeOff);
      masks["shadow-receiver"] = receiver;
    } else {
      skipped.push("shadow-receiver mask: needs three no-shadows control render");
    }
  }

  const maskCounts: Record<string, number> = {};
  for (const [name, mask] of Object.entries(masks)) if (mask) maskCounts[name] = maskPixelCount(mask);

  // --- shadow-drop (01/08/12/15/17/18-class + fixtures) ----------------------
  if (receiver && threeOff && auraOff) {
    metrics["three.shadowDrop"] = shadowDrop(capture.three, threeOff, receiver);
    metrics["aura.shadowDrop"] = shadowDrop(capture.aura, auraOff, receiver);
    metrics["shadowDrop.ratio"] = metrics["three.shadowDrop"]
      ? (metrics["aura.shadowDrop"] as number) / (metrics["three.shadowDrop"] as number)
      : 0;
    const threeMask = shadowMask(capture.three, threeOff);
    const auraMask = shadowMask(capture.aura, auraOff);
    metrics["shadow.iou"] = maskIoU(auraMask, threeMask);
  } else if (spec.masks?.includes("shadow-receiver")) {
    skipped.push("shadow-drop: needs aura/three no-shadows controls");
  }

  // --- second-caster coverage (12) -------------------------------------------
  if (spec.primaryCriterion === "second-caster-coverage" && receiver && threeOff && auraOff) {
    const threeMask = shadowMask(capture.three, threeOff);
    const auraMask = shadowMask(capture.aura, auraOff);
    const threeCov = coverage(threeMask, receiver);
    const auraCov = coverage(auraMask, receiver);
    metrics["coverage.three"] = threeCov;
    metrics["coverage.aura"] = auraCov;
    metrics["coverage.ratio"] = threeCov ? auraCov / threeCov : 0;
  }

  // --- unrequested shadows (11, 13, 14-style) --------------------------------
  const anyLightCasts = spec.lights.some((light) => "castShadow" in light && light.castShadow);
  if (!anyLightCasts && spec.brokenControls?.includes("no-shadows")) {
    const frame = new Uint8Array(size.width * size.height).fill(255);
    if (auraOff) metrics["unrequestedShadows.aura"] = diffPixelRatio(capture.aura, auraOff, frame);
    if (threeOff) metrics["unrequestedShadows.three"] = diffPixelRatio(capture.three, threeOff, frame);
  }

  // --- sky band (09, 13) ------------------------------------------------------
  if (masks.sky) {
    metrics["skyStd.aura"] = stdLuma(capture.aura, masks.sky);
    metrics["skyStd.three"] = stdLuma(capture.three, masks.sky);
    metrics["skyStd.ratio"] = metrics["skyStd.three"]
      ? (metrics["skyStd.aura"] as number) / (metrics["skyStd.three"] as number)
      : 0;
  }

  // --- sky tint (13) ----------------------------------------------------------
  if (spec.primaryCriterion === "diffuse-sky-tint" && masks["object-id"]) {
    metrics["skyTint.aura"] = channelRatio(capture.aura, masks["object-id"], 2, 0);
    metrics["skyTint.three"] = channelRatio(capture.three, masks["object-id"], 2, 0);
  }

  // --- specular HF energy (06) -----------------------------------------------
  if (masks.metal) {
    metrics["specularHf.aura"] = hfEnergy(capture.aura, masks.metal);
    metrics["specularHf.three"] = hfEnergy(capture.three, masks.metal);
    metrics["specularR1Gradient.aura"] = lumaRange(capture.aura, masks.metal).range;
    metrics["specularR1Gradient.three"] = lumaRange(capture.three, masks.metal).range;
  }

  // --- edge density (17 building band: silhouette-edge over subject) ----------
  if (masks["silhouette-edge"]) {
    metrics["edgeDensity.aura"] = edgeDensity(capture.aura, masks["silhouette-edge"]);
    metrics["edgeDensity.three"] = edgeDensity(capture.three, masks["silhouette-edge"]);
    metrics["edgeDensity.ratio"] = metrics["edgeDensity.three"]
      ? (metrics["edgeDensity.aura"] as number) / (metrics["edgeDensity.three"] as number)
      : 0;
  }

  // --- clipping near practicals (10) ------------------------------------------
  if (spec.primaryCriterion === "clipping-near-practicals" && masks["object-id"]) {
    metrics["clipping.aura"] = clippingFraction(capture.aura, masks["object-id"]);
    metrics["clipping.three"] = clippingFraction(capture.three, masks["object-id"]);
  }

  // --- temporal shimmer (strip) -------------------------------------------------
  if (capture.stripFrames && capture.stripFrames.length >= 2 && masks["silhouette-edge"]) {
    metrics["temporal.meanFrameDiff"] = meanFrameDiff(capture.stripFrames, masks["silhouette-edge"]);
  }

  return { scene: sceneId, masks: maskCounts, metrics, skipped };
}
