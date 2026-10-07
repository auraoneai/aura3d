// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraCreateAppRendererOptions, AuraRendererQualityPreset, AuraRendererQualityProfile, AuraRendererQualityProfileId } from "../nodes/types.js";

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
  return rendererQualityProfiles[id ?? "safe-basic"] ?? rendererQualityProfiles["safe-basic"];
}

export function normalizeCreateAppRendererOptions(options: AuraCreateAppRendererOptions | undefined): Required<AuraCreateAppRendererOptions> & {
  readonly profile: AuraRendererQualityProfile;
} {
  const profile = resolveRendererQualityProfile(options?.qualityProfile);
  const mode = options?.mode ?? profile.rendererMode;
  return {
    mode,
    fallback: options?.fallback ?? "safe-basic",
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
