// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraCreateAppRendererOptions, AuraRendererQualityPreset, AuraRendererQualityProfile, AuraRendererQualityProfileId } from "../nodes/types.js";
import { DEFAULT_BLOOM_FUSION_MODE, isBloomFusion, type AuraBloomFusion } from "@aura3d/rendering/contracts";

/**
 * PRD 11 Phase 1 freeze (§6.2): thrown when a caller requests the frozen
 * `experimental-webgpu` quality profile. The union member stays for CCR
 * compatibility, but selecting it is a migration-time error, not a warning.
 */
export class AuraMigrationError extends Error {
  readonly code = "A3D_PROFILE_FROZEN" as const;

  constructor(message: string) {
    super(message);
    this.name = "AuraMigrationError";
  }
}

export const rendererQualityPresets: Readonly<Record<"interactive" | "screenshot", AuraRendererQualityPreset>> = {
  interactive: {
    kind: "aura-renderer-quality",
    id: "interactive",
    antialiasing: "msaa",
    shadowMap: "pcf-soft",
    pixelRatio: 1,
    preserveDrawingBuffer: true,
    maxRecommendedDrawCalls: 180,
    evidence: "keeps benchmark scenes interactive while preserving soft shadows and readable labels"
  },
  screenshot: {
    kind: "aura-renderer-quality",
    id: "screenshot",
    antialiasing: "msaa-plus-high-dpi",
    shadowMap: "pcf-soft",
    pixelRatio: 1.5,
    preserveDrawingBuffer: true,
    maxRecommendedDrawCalls: 260,
    evidence: "prioritizes benchmark screenshots with stronger edge quality for labels, axes, and neon rings"
  }
};

export const rendererQualityProfiles: Readonly<Record<AuraRendererQualityProfileId, AuraRendererQualityProfile>> = {
  "safe-basic": {
    kind: "aura-renderer-quality-profile",
    id: "safe-basic",
    label: "Safe Basic",
    rendererMode: "production",
    status: "supported",
    antialiasing: "msaa",
    pixelRatio: 1,
    preserveDrawingBuffer: true,
    maxRecommendedDrawCalls: 180,
    requestedFeatures: ["typed models", "primitives", "basic particles", "base-color textures", "runtime nodes"],
    supportedInRoot: ["typed models", "primitives", "basic particles", "base-color textures", "runtime nodes"],
    blockedInRoot: ["production PBR parity", "skinned animation mixer", "native WebGPU compute", "postprocess pass chain"],
    claimBoundary: "Root createAuraApp uses the production renderer with the conservative safe-basic feature profile. Claims still require route-specific browser evidence."
  },
  production: {
    kind: "aura-renderer-quality-profile",
    id: "production",
    label: "Production Typed GLB",
    rendererMode: "production",
    status: "supported",
    antialiasing: "msaa-plus-high-dpi",
    pixelRatio: 1.5,
    preserveDrawingBuffer: true,
    maxRecommendedDrawCalls: 260,
    requestedFeatures: ["typed GLB actors", "PBR material pipeline", "environment lighting", "shadow maps", "postprocess"],
    supportedInRoot: ["typed GLB actor bridge", "imported GLB render source", "PBR material pipeline metadata", "runtime diagnostics"],
    blockedInRoot: ["environment prefiltering without pixel proof", "shadow-map sampling without pixel proof", "postprocess pass chain without pixel proof", "native WebGPU claim without adapter/render evidence"],
    claimBoundary: "Root createAuraApp can route typed GLB manifest assets through the production runtime. Claim only the specific features proven by route diagnostics and screenshots."
  },
  cinematic: {
    kind: "aura-renderer-quality-profile",
    id: "cinematic",
    label: "Cinematic Request",
    rendererMode: "production",
    status: "fallback-only",
    antialiasing: "msaa-plus-high-dpi",
    pixelRatio: 1.5,
    preserveDrawingBuffer: true,
    maxRecommendedDrawCalls: 320,
    requestedFeatures: ["cinematic lighting", "environment lighting", "postprocess", "motion proof", "high-DPI screenshots"],
    supportedInRoot: ["high-DPI canvas sizing", "scene diagnostics", "basic particles", "camera/timeline animation"],
    blockedInRoot: ["renderer-owned bloom pass", "depth-aware postprocess", "production shadow maps", "skinned animation mixer"],
    claimBoundary: "Cinematic is an explicit request profile, not proof of production cinematic rendering."
  },
  "experimental-webgpu": {
    kind: "aura-renderer-quality-profile",
    id: "experimental-webgpu",
    label: "Experimental WebGPU Request",
    rendererMode: "production",
    status: "experimental",
    antialiasing: "msaa",
    pixelRatio: 1,
    preserveDrawingBuffer: true,
    maxRecommendedDrawCalls: 220,
    requestedFeatures: ["WebGPU adapter", "compute dispatch", "native WebGPU rendering"],
    supportedInRoot: ["capability diagnostics", "fallback route evidence"],
    blockedInRoot: ["native WebGPU claim without adapter/backend/dispatch/render evidence"],
    claimBoundary: "May only claim native WebGPU when route diagnostics and browser screenshots prove adapter, backend, dispatch, and pixels."
  }
};

export function resolveRendererQualityProfile(id: AuraRendererQualityProfileId | undefined): AuraRendererQualityProfile {
  if (id === "experimental-webgpu") {
    throw new AuraMigrationError(
      "Renderer quality profile \"experimental-webgpu\" is frozen by PRD 11 (WebGPU is an experimental probe device; no game uses it). Use \"production\" or \"safe-basic\"."
    );
  }
  return rendererQualityProfiles[id ?? "safe-basic"] ?? rendererQualityProfiles["safe-basic"];
}

export function normalizeCreateAppRendererOptions(options: AuraCreateAppRendererOptions | undefined): Required<AuraCreateAppRendererOptions> & {
  readonly profile: AuraRendererQualityProfile;
} {
  const profile = resolveRendererQualityProfile(options?.qualityProfile);
  const mode = options?.mode ?? profile.rendererMode;
  return {
    mode,
    // 4.0 Live Fix E1: no fallback renderer exists; the deprecated field is
    // only echoed into diagnostics when a caller still passes it.
    fallback: options?.fallback,
    qualityProfile: profile.id,
    textureBudgetBytes: normalizeTextureBudgetBytes(options?.textureBudgetBytes),
    profile: profile
  } as Required<AuraCreateAppRendererOptions> & { readonly profile: AuraRendererQualityProfile };
}

export function normalizeTextureBudgetBytes(value: number | undefined): number {
  if (value === undefined) return 256 * 1024 * 1024;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Aura3D textureBudgetBytes must be a positive byte count.");
  }
  return Math.floor(value);
}

/* ------------------------------------------------------------------ */
/* PRD-11 Wave B RendererOptions (C-27): one parser for the lane-11    */
/* renderer options plus the URL overrides, used by the `quality` app  */
/* extension. Invalid values throw so a typo never silently runs auto. */
/* ------------------------------------------------------------------ */

export type AuraQualityTierName = "low" | "medium" | "high" | "ultra";

export interface ParsedQualityRendererOptions {
  readonly requested: AuraQualityTierName | "auto";
  /** `"url"` when `?aura3d-quality=` chose the tier; `"options"` otherwise. */
  readonly requestedSource: "url" | "options";
  readonly overrides: Readonly<Record<string, unknown>> | undefined;
  readonly adaptive: boolean;
  /** `"url"` when `?aura3d-adaptive=` set it. */
  readonly adaptiveSource: "url" | "options";
  readonly targetFrameRate: number | undefined;
  readonly batching: boolean | "auto";
  /** One-time deprecation warnings for this call (empty after the first). */
  readonly warnings: readonly string[];
}

const QUALITY_TIER_NAMES: readonly string[] = ["low", "medium", "high", "ultra"];
const warnedDeprecations = new Set<string>();

function parseTier(value: unknown, where: string): AuraQualityTierName | "auto" {
  if (value === undefined || value === "auto") return "auto";
  if (typeof value === "string" && QUALITY_TIER_NAMES.includes(value)) return value as AuraQualityTierName;
  throw new Error(`QUALITY_OPTION_INVALID:${where}=${String(value)} (expected low|medium|high|ultra|auto)`);
}

function deprecation(id: string, message: string, out: string[]): void {
  if (warnedDeprecations.has(id)) return;
  warnedDeprecations.add(id);
  out.push(message);
}

/** Test seam: forget which one-time deprecation warnings were already emitted. */
export function resetRendererOptionDeprecationsForTests(): void {
  warnedDeprecations.clear();
  warnedUrlValues.clear();
}

/**
 * Parse `renderer.quality` (tier string or `{ tier, overrides }`),
 * `renderer.adaptive`, `renderer.targetFrameRate`, `renderer.batching`, and
 * the URL overrides `?aura3d-quality=<tier|auto>` / `?aura3d-adaptive=0|1`,
 * which apply in every build and win over options (the decision then reports
 * `source: "url"`). `qualityProfile` and root `performanceQuality` stay
 * accepted and emit a one-time deprecation warning pointing at `quality`.
 */
export function parseQualityRendererOptions(
  renderer: AuraCreateAppRendererOptions | undefined,
  search: string | null = typeof location !== "undefined" ? location.search : null,
  root: { readonly performanceQuality?: unknown } = {},
  urlPolicy?: Pick<UrlOptionPolicy, "strict">
): ParsedQualityRendererOptions {
  const warnings: string[] = [];
  const quality = renderer?.quality;
  let requested: AuraQualityTierName | "auto";
  let overrides: Readonly<Record<string, unknown>> | undefined;
  if (quality !== null && typeof quality === "object") {
    const shaped = quality as { readonly tier?: unknown; readonly overrides?: unknown };
    requested = parseTier(shaped.tier, "renderer.quality.tier");
    if (shaped.overrides !== undefined && (shaped.overrides === null || typeof shaped.overrides !== "object")) {
      throw new Error("QUALITY_OPTION_INVALID:renderer.quality.overrides (expected an object)");
    }
    overrides = shaped.overrides as Readonly<Record<string, unknown>> | undefined;
  } else {
    requested = parseTier(quality, "renderer.quality");
  }

  const adaptiveOption = renderer?.adaptive;
  if (adaptiveOption !== undefined && typeof adaptiveOption !== "boolean") {
    throw new Error(`QUALITY_OPTION_INVALID:renderer.adaptive=${String(adaptiveOption)} (expected boolean)`);
  }
  let adaptive = adaptiveOption !== false;

  const targetFrameRate = renderer?.targetFrameRate;
  if (targetFrameRate !== undefined && (!Number.isFinite(targetFrameRate) || targetFrameRate <= 0)) {
    throw new Error(`QUALITY_OPTION_INVALID:renderer.targetFrameRate=${String(targetFrameRate)} (expected a positive number)`);
  }

  const batchingOption = renderer?.batching;
  if (batchingOption !== undefined && typeof batchingOption !== "boolean" && batchingOption !== "auto") {
    throw new Error(`QUALITY_OPTION_INVALID:renderer.batching=${String(batchingOption)} (expected boolean|"auto")`);
  }
  const batching = (batchingOption ?? "auto") as boolean | "auto";

  let requestedSource: "url" | "options" = "options";
  let adaptiveSource: "url" | "options" = "options";
  if (search) {
    const params = new URLSearchParams(search);
    const urlTier = params.get("aura3d-quality");
    if (urlTier !== null) {
      // RP-04: a URL typo warns and keeps the code option (strict apps still throw).
      if (urlTier === "auto" || QUALITY_TIER_NAMES.includes(urlTier)) {
        requested = urlTier as AuraQualityTierName | "auto";
        requestedSource = "url";
      } else {
        ignoreInvalidUrlValue(`?aura3d-quality=${urlTier} (expected low|medium|high|ultra|auto); using "${requested}"`, { strict: urlPolicy?.strict, warnings, console: false });
      }
    }
    const urlAdaptive = params.get("aura3d-adaptive");
    if (urlAdaptive !== null) {
      if (urlAdaptive === "0" || urlAdaptive === "1") {
        adaptive = urlAdaptive === "1";
        adaptiveSource = "url";
      } else {
        ignoreInvalidUrlValue(`?aura3d-adaptive=${urlAdaptive} (expected 0|1); using ${adaptive ? "1" : "0"}`, { strict: urlPolicy?.strict, warnings, console: false });
      }
    }
  }

  if (renderer?.qualityProfile !== undefined) {
    deprecation("qualityProfile", "Aura3D: renderer.qualityProfile is deprecated; use renderer.quality (\"low\"|\"medium\"|\"high\"|\"ultra\"|\"auto\").", warnings);
  }
  if (root.performanceQuality !== undefined) {
    deprecation("performanceQuality", "Aura3D: performanceQuality is deprecated; use renderer.quality and renderer.adaptive.", warnings);
  }

  return { requested, requestedSource, overrides, adaptive, adaptiveSource, targetFrameRate, batching, warnings };
}

/** How URL-sourced debug switches behave on an invalid value (RP-04). */
export interface UrlOptionPolicy {
  /** Throw on an invalid URL value, like an invalid code option. Default false: warn and fall back. */
  readonly strict?: boolean;
  /** Receives one `QUALITY_URL_IGNORED:` message per ignored URL value. */
  readonly warnings?: string[];
  /** Also `console.warn` the message (once per message). Default true; false when the caller prints `warnings` itself. */
  readonly console?: boolean;
}

const warnedUrlValues = new Set<string>();

/**
 * RP-04: a typo in a debug URL switch (`?aura3d-render=`, `?aura3d-bloom-fusion=`, `?aura3d-quality=`, `?aura3d-adaptive=`) used to
 * throw inside the mount, so every game showed its "needs WebGL 2" error screen. URL values are a tester's switch, not code: warn
 * once (console and `diagnostics().warnings`) and keep the code option or default. Strict apps keep the throw.
 */
export function ignoreInvalidUrlValue(message: string, policy: UrlOptionPolicy | undefined): void {
  if (policy?.strict) throw new Error(`QUALITY_OPTION_INVALID:${message}`);
  const warning = `QUALITY_URL_IGNORED: ${message}`;
  policy?.warnings?.push(warning);
  if (policy?.console !== false && !warnedUrlValues.has(warning)) {
    warnedUrlValues.add(warning);
    if (typeof console !== "undefined") console.warn(`[aura3d] ${warning}`);
  }
}

/**
 * Bloom pass-fusion mode (PRD beat-threejs-2 contract 2.1): `renderer.bloomFusion` (`"separable"` default | `"fused-2d"`),
 * overridden by `?aura3d-bloom-fusion=`. An invalid code option throws so a typo never silently runs the default; an invalid URL
 * value warns and falls back to the code option (RP-04) unless `policy.strict`. The mode only takes effect under
 * `quality: "auto"` / `"cinematic"`; `production` never fuses.
 */
export function parseBloomFusionOption(
  renderer: Pick<AuraCreateAppRendererOptions, "bloomFusion"> | undefined,
  search: string | null = typeof location !== "undefined" ? location.search : null,
  policy?: UrlOptionPolicy
): AuraBloomFusion {
  const mode: unknown = renderer?.bloomFusion ?? DEFAULT_BLOOM_FUSION_MODE;
  if (!isBloomFusion(mode)) throw new Error(`QUALITY_OPTION_INVALID:renderer.bloomFusion=${String(mode)} (expected separable|fused-2d)`);
  if (search) {
    const fromUrl = new URLSearchParams(search).get("aura3d-bloom-fusion");
    if (fromUrl !== null) {
      if (isBloomFusion(fromUrl)) return fromUrl;
      ignoreInvalidUrlValue(`?aura3d-bloom-fusion=${fromUrl} (expected separable|fused-2d); using "${mode}"`, policy);
    }
  }
  return mode;
}

/**
 * Top-tennis C11 (engine part): `renderer.quality` diagnostics, reported in `diagnostics().warnings` (not the console, since the
 * string form is valid). A tier-name string is a fixed tier: every device, phones included, mounts at that tier, which a reader
 * of `renderer: { quality: "high" }` easily takes for a no-op or for "best available". An unknown name used to mount at "high"
 * with no message while the quality lane is off.
 */
export function rendererQualityWarnings(renderer: Pick<AuraCreateAppRendererOptions, "quality"> | undefined): string[] {
  const quality = renderer?.quality as unknown;
  if (quality === undefined || quality === "auto") return [];
  const tier = typeof quality === "string" ? quality : quality !== null && typeof quality === "object" ? (quality as { tier?: unknown }).tier : quality;
  if (tier === undefined || tier === "auto") return [];
  if (typeof tier !== "string" || !QUALITY_TIER_NAMES.includes(tier)) {
    return [`RENDERER_QUALITY_INVALID: renderer.quality${typeof quality === "object" ? ".tier" : ""}=${String(tier)} is not a tier (expected low|medium|high|ultra|auto); the mount uses "high".`];
  }
  if (typeof quality !== "string") return [];
  return [`RENDERER_QUALITY_STRING: renderer.quality "${tier}" is a fixed tier, so every device, phones included, mounts at "${tier}" (pixel-ratio cap, shadow and post settings). Use "auto" or { tier: "auto" } to let the tier follow the device where the quality lane (A3D_QR_TIERS) is on.`];
}
