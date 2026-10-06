// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraEffectNode, AuraSceneSnapshot } from "../index.js";
import { clampNumber, colorToRgba, groups, resolveNativeBloomRadius } from "../index.js";
import { resolveVolumetricFog, type CollectedLight, type RendererPostProcessOptions } from "@aura3d/rendering";
import { lights } from "../nodes/lights.js";
import { recordSubmittedPostprocess } from "../postBridge.js";

export function createProductionRuntimePostprocess(
  snapshot: AuraSceneSnapshot,
  lights: readonly CollectedLight[] = [],
  renderWidth = 1280,
  renderHeight = 720,
  temporalSupported = true,
  attach?: { readonly canvas?: HTMLCanvasElement }
): RendererPostProcessOptions {
  const nodes = groups.flatten(snapshot.nodes);
  const authoredBloom = nodes.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "bloom");
  // A5: the DISTINCT volumetric-fog node submits the depth-aware inscatter
  // pass (renderer-owned depth attaches automatically); quality "off" (or no
  // node) submits nothing and the scene keeps forward exp2 fog only.
  const authoredVolumetricFog = nodes.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "volumetric-fog");
  const volumetricPass = authoredVolumetricFog
    ? resolveVolumetricFog(
      {
        density: authoredVolumetricFog.density,
        intensity: authoredVolumetricFog.intensity,
        ...(authoredVolumetricFog.lightPosition ? { lightPosition: authoredVolumetricFog.lightPosition } : {}),
        ...(authoredVolumetricFog.heightFalloff !== undefined ? { heightFalloff: authoredVolumetricFog.heightFalloff } : {}),
        ...(authoredVolumetricFog.heightReference !== undefined ? { heightReference: authoredVolumetricFog.heightReference } : {}),
        ...(authoredVolumetricFog.volumetricQuality ? { quality: authoredVolumetricFog.volumetricQuality } : {})
      },
      lights,
      renderWidth,
      renderHeight
    ).pass
    : null;
  const bloomRequested = Boolean(authoredBloom);
  // Root previously advertised `ssao` in `requestedPasses` whenever a scene added
  // effects.ambientOcclusion() or effects.contactOcclusion(), but never submitted
  // an `ssao` option to the renderer. The advertised pass could therefore never
  // run, and `ambientOcclusionPass` was permanently false. Submit the real option
  // so the request and the rendered pass agree.
  const authoredAmbientOcclusion = nodes.find(
    (node): node is AuraEffectNode => node.kind === "effect" && node.effect === "ambient-occlusion"
  );
  const authoredContactOcclusion = nodes.find(
    (node): node is AuraEffectNode => node.kind === "effect" && node.effect === "contact-occlusion"
  );
  const authoredOcclusion = authoredAmbientOcclusion ?? authoredContactOcclusion;
  // The renderer owns temporal GPU inputs. Root checks actual drawable
  // geometry before requesting them; unsupported scenes retain ordinary output.
  const authoredColorGrade = nodes.find(
    (node): node is AuraEffectNode => node.kind === "effect" && node.effect === "color-grade"
  );
  const authoredAntiAlias = nodes.find(
    (node): node is AuraEffectNode => node.kind === "effect" && node.effect === "anti-alias"
  );
  const authoredOutline = nodes.find(
    (node): node is AuraEffectNode => node.kind === "effect" && node.effect === "outline"
  );
  const authoredSsr = nodes.find(
    (node): node is AuraEffectNode => node.kind === "effect" && node.effect === "screen-space-reflections"
  );
  const authoredDof = nodes.find(
    (node): node is AuraEffectNode => node.kind === "effect" && node.effect === "depth-of-field"
  );
  const authoredMotionBlur = nodes.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "motion-blur");
  const temporalRequested = temporalSupported && (Boolean(authoredMotionBlur) || authoredAntiAlias?.mode === "taa");
  let sceneKey = productionTemporalSceneKeys.get(snapshot);
  if (!sceneKey) { sceneKey = `root-scene-${++productionTemporalSceneSequence}`; productionTemporalSceneKeys.set(snapshot, sceneKey); }
  const fxaaRequested = (authoredAntiAlias?.mode ?? "fxaa") === "fxaa";
  const outlineChannels = colorToRgba(authoredOutline?.color ?? "#ff9822");
  const options: RendererPostProcessOptions = {
    // Tone mapping requires unclamped linear input. RGBA8 quantized dark clear
    // colors and clipped highlights before ACES, which produced washed-out output.
    targetFormat: "rgba16f",
    ...(temporalRequested ? {
      temporal: { sceneKey },
      ...(authoredMotionBlur ? { motionBlur: { samples: 8, scale: clampNumber(authoredMotionBlur.intensity ?? .5, 0, 2) } } : {}),
      ...(authoredAntiAlias?.mode === "taa" ? { taa: { blend: .9 } } : {})
    } : {}),
    ...(bloomRequested ? {
      bloom: {
        threshold: clampNumber(authoredBloom?.threshold ?? 0.78, 0, 1),
        intensity: clampNumber(authoredBloom?.intensity ?? 0.3, 0, 2),
        // Public bloom radius follows the normalized UnrealBloomPass-style
        // control used by routes and prefabs (normally 0..1), while the native
        // separable blur consumes an integer pixel kernel. Preserve legacy
        // explicit pixel kernels above 1 and spread normalized values across
        // 1..4 so common authored values such as 0.22/0.38 do not all collapse
        // to a one-pixel blur after rounding.
        radius: resolveNativeBloomRadius(authoredBloom?.radius),
        ...(authoredBloom?.quality !== undefined ? { quality: authoredBloom.quality } : {}),
        ...(authoredBloom?.softKnee !== undefined ? { softKnee: authoredBloom.softKnee } : {}),
        ...(authoredBloom?.shoulder !== undefined ? { shoulder: authoredBloom.shoulder } : {})
      }
    } : {}),
    ...(authoredOcclusion ? {
      ssao: {
        // The renderer's SSAO radius is an integer sample-kernel size in pixels
        // (1-8), while the public effect `radius` is a world-space extent whose
        // default is 0.42. Passing the authored value straight through threw
        // "SSAO radius must be an integer in [1, 8]" and left the route with zero
        // draw calls, so it is mapped onto the kernel range instead.
        radius: Math.max(1, Math.min(8, Math.round((authoredOcclusion.radius ?? 0.42) * 8))),
        intensity: clampNumber(authoredOcclusion.intensity ?? 0.32, 0, 1),
        bias: 0.025
      }
    } : {}),
    toneMapping: {
      exposure: 1,
      whitePoint: 1,
      operator: "aces",
      inputColorSpace: "linear",
      outputColorSpace: "srgb"
    },
    ...(authoredColorGrade ? {
      colorGrade: {
        contrast: clampNumber(authoredColorGrade.contrast ?? 1, 0, 3),
        saturation: clampNumber(authoredColorGrade.saturation ?? 1, 0, 3)
      }
    } : {}),
    ...(authoredOutline ? {
      outline: {
        color: [
          Math.round(outlineChannels[0] * 255),
          Math.round(outlineChannels[1] * 255),
          Math.round(outlineChannels[2] * 255),
          255
        ] as const,
        width: Math.max(1, Math.min(6, Math.round(authoredOutline.width ?? 3))),
        threshold: clampNumber(authoredOutline.threshold ?? 0.12, 0, 4),
        opacity: clampNumber(authoredOutline.intensity ?? 0.9, 0, 1)
      }
    } : {}),
    ...(fxaaRequested && authoredAntiAlias ? { fxaa: {} } : {}),
    ...(authoredSsr ? {
      ssr: {
        intensity: clampNumber(authoredSsr.intensity ?? 0.9, 0, 2),
        maxDistance: 18
      }
    } : {}),
    ...(authoredDof ? {
      depthOfField: {
        focusDepth: clampNumber(authoredDof.focus ?? 0.02, 0, 1),
        focusRange: clampNumber(0.02 + clampNumber(authoredDof.aperture ?? 0.35, 0, 1) * 0.3, 0.001, 1),
        maxRadius: Math.max(0, Math.min(8, Math.round(authoredDof.maxBlur ?? 4)))
      }
    } : {}),
    ...(volumetricPass ? { volumetricLight: volumetricPass } : {})
  };
  // C-31 feed (lane 03): the post/exposure diagnostics sections report what was
  // actually submitted — including the pinned `toneMapping.exposure: 1` while
  // authored grade exposure stays diagnostic-only until Phase 1 wiring.
  recordSubmittedPostprocess(options, {
    canvas: attach?.canvas,
    renderWidth,
    renderHeight,
    temporalRequested,
    authored: {
      bloom: bloomRequested,
      ambientOcclusion: Boolean(authoredAmbientOcclusion),
      contactOcclusion: Boolean(authoredContactOcclusion),
      colorGrade: Boolean(authoredColorGrade),
      antiAlias: Boolean(authoredAntiAlias),
      outline: Boolean(authoredOutline),
      ssr: Boolean(authoredSsr),
      depthOfField: Boolean(authoredDof),
      motionBlur: Boolean(authoredMotionBlur),
      volumetricFog: Boolean(authoredVolumetricFog),
      colorGradeExposure: typeof authoredColorGrade?.exposure === "number" ? authoredColorGrade.exposure : null,
      antiAliasMode: authoredAntiAlias?.mode ?? null
    }
  });
  return options;
}

const productionTemporalSceneKeys = new WeakMap<AuraSceneSnapshot, string>();

let productionTemporalSceneSequence = 0;
