/**
 * `output/HdrTarget.ts` (PRD-01 §6.4/§8.4, C-05) — the linear-HDR scene target
 * under `A3D_QR_CORE_OUTPUT`: color attachment 0 is the probed HDR format
 * (`rgba16f` when the `hdr-render-targets` capability exists; the
 * `r11f_g11f_b10f` middle rung of the contract probe is not representable by
 * `RenderTargetDescriptor.colorAttachments`, so the probe collapses to
 * `rgba16f`/`rgba8`), depth as a sampleable `depthTexture`, optional MSAA
 * `sampleCount`, and — when `backgroundCoverage` is on — a second `rgba8`
 * attachment at location 1 written by generated programs (`outCoverage`).
 * The target is resized lazily to the render-scale dimensions.
 */

import type { RenderDevice, RenderTarget } from "../RenderDevice";
import { probeHdrTargetFormat } from "../contracts/output";

export interface HdrTargetOptions {
  readonly width: number;
  readonly height: number;
  /** `true` allocates the BACKGROUND_COVERAGE MRT attachment (location 1, rgba8). */
  readonly coverage?: boolean;
  /** MSAA sample count (1 = no multisample). Clamped to the device limit by the device. */
  readonly sampleCount?: number;
}

export function createHdrTarget(device: RenderDevice, options: HdrTargetOptions): RenderTarget {
  const format = probeHdrTargetFormat(device);
  const coverage = options.coverage === true;
  return device.createRenderTarget({
    label: "prd01-hdr-scene",
    width: Math.max(1, Math.floor(options.width)),
    height: Math.max(1, Math.floor(options.height)),
    format: "rgba8", // overridden per-attachment by colorAttachments[0]
    colorAttachments: coverage
      ? [{ format: format === "r11f_g11f_b10f" ? "rgba16f" : format }, { format: "rgba8" }]
      : [{ format: format === "r11f_g11f_b10f" ? "rgba16f" : format }],
    depth: "texture",
    sampleCount: Math.max(1, Math.floor(options.sampleCount ?? 1))
  });
}

/**
 * Cached-per-call-site helper: returns `current` unchanged when it already
 * matches the requested size/options, else disposes and recreates it.
 */
export function ensureHdrTarget(
  device: RenderDevice,
  current: RenderTarget | null,
  options: HdrTargetOptions
): RenderTarget {
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));
  const sampleCount = Math.max(1, Math.floor(options.sampleCount ?? 1));
  const coverage = options.coverage === true;
  const matches =
    current !== null &&
    !current.disposed &&
    current.width === width &&
    current.height === height &&
    (current.sampleCount ?? 1) === sampleCount &&
    (current.colorTextures?.length ?? 1) === (coverage ? 2 : 1);
  if (matches) return current;
  current?.dispose();
  return createHdrTarget(device, { ...options, width, height, coverage, sampleCount });
}
