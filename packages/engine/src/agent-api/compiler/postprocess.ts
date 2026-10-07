// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraEffectNode, AuraSceneSnapshot } from "../nodes/types.js";
import { AuraRuntimeError } from "./errors.js";
import type { AuraAntiAliasMode } from "../../contracts/post.js";
import { colorToRgba } from "../colorUtils.js";
import { clampNumber, resolveNativeBloomRadius } from "../compiler/observations.js";
import { groups } from "../nodes/groups.js";
import { resolveCameraClipping } from "../RootRuntimeSupport.js";
import { QUALITY_TIERS, resolvePostAntiAlias, resolvePostTier, resolveVolumetricFog, postVelocityCoverage, type CollectedLight, type RendererPostProcessOptions } from "@aura3d/rendering";
import { lights } from "../nodes/lights.js";
import {
  authoredPostContextFor,
  createRootPostPipeline,
  recordSubmittedPostprocess,
  validatePostEffectNode,
  type PostFieldDiagnostic
} from "../postBridge.js";

export function createProductionRuntimePostprocess(
  snapshot: AuraSceneSnapshot,
  lights: readonly CollectedLight[] = [],
  renderWidth = 1280,
  renderHeight = 720,
  temporalSupported = true,
  attach?: { readonly canvas?: HTMLCanvasElement; readonly frameTime?: number }
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
  // PRD-03 Phase 1 (flag A3D_QR_POST): the authored anti-alias mode resolves
  // through the C-27 tier row — "auto" (or a missing mode) resolves via
  // `resolvePostAntiAlias`, which never returns FXAA on a multisampled
  // forward target. Flag-off keeps the legacy "mode ?? fxaa" semantics and
  // the resolution stays null.
  const authoredPostContext = authoredPostContextFor(attach?.canvas);
  const postFlagOn = authoredPostContext?.flags.post === true;
  const resolvedTier = authoredPostContext?.qualityTier && authoredPostContext.qualityTier !== "auto" ? authoredPostContext.qualityTier : "high";
  // `postAuthored` carries the authored/default split: a node whose list lacks
  // `mode` counts as `auto` (the factory's `mode ?? "fxaa"` fill is a default,
  // not an authored choice). Nodes serialized without `postAuthored` resolve
  // from `mode` directly.
  const authoredAaMode: AuraAntiAliasMode = authoredAntiAlias
    ? authoredAntiAlias.postAuthored !== undefined
      ? authoredAntiAlias.postAuthored.includes("mode")
        ? ((authoredAntiAlias.mode ?? "auto") as AuraAntiAliasMode)
        : "auto"
      : ((authoredAntiAlias.mode ?? "auto") as AuraAntiAliasMode)
    : "auto";
  const resolvedAa = postFlagOn && authoredAntiAlias
    ? resolvePostAntiAlias({
      settings: QUALITY_TIERS[resolvedTier],
      tier: resolvedTier,
      authored: authoredAaMode,
      renderPixels: Math.max(1, Math.round(renderWidth)) * Math.max(1, Math.round(renderHeight)),
      // Compile-time facts: a static frame qualifies (moving 0/0). When the
      // route's geometry cannot support temporal inputs, mark one mover
      // without history so TAA resolves to its coverage fallback.
      // PRD-03 Phase 4: prefer the live C-14 coverage (movers vs movers with
      // history); before the first prepared frame it reads {0,0} = static.
      velocity: (() => {
        if (!temporalSupported) return { moving: 1, movingWithHistory: 0 };
        try {
          const c = postVelocityCoverage();
          return { moving: c.moving, movingWithHistory: c.movingWithHistory };
        } catch {
          return { moving: 0, movingWithHistory: 0 };
        }
      })()
    })
    : null;
  const temporalRequested = temporalSupported && (Boolean(authoredMotionBlur) || authoredAntiAlias?.mode === "taa" || resolvedAa?.mode === "taa");
  let sceneKey = productionTemporalSceneKeys.get(snapshot);
  if (!sceneKey) { sceneKey = `root-scene-${++productionTemporalSceneSequence}`; productionTemporalSceneKeys.set(snapshot, sceneKey); }
  const fxaaRequested = resolvedAa ? resolvedAa.mode === "fxaa" : (authoredAntiAlias?.mode ?? "fxaa") === "fxaa";
  const outlineChannels = colorToRgba(authoredOutline?.color ?? "#ff9822");
  let options: RendererPostProcessOptions = {
    // Tone mapping requires unclamped linear input. RGBA8 quantized dark clear
    // colors and clipped highlights before ACES, which produced washed-out output.
    targetFormat: "rgba16f",
    ...(temporalRequested ? {
      temporal: { sceneKey, ...(attach?.frameTime !== undefined ? { frameTime: attach.frameTime } : {}) },
      ...(authoredMotionBlur ? { motionBlur: { samples: 8, scale: clampNumber(authoredMotionBlur.intensity ?? .5, 0, 2) } } : {}),
      ...(authoredAntiAlias?.mode === "taa" || resolvedAa?.mode === "taa" ? { taa: { blend: .9 } } : {})
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
    // PRD-03 §6.4 (flag-on): exposure is a linear multiplier,
    // `output.exposure × colorGrade.exposure` (autoEv lands with C-13 auto-exposure).
    // The operator comes from C-38 `options.output`; "none" disables the pass.
    toneMapping: postFlagOn && authoredPostContext?.output?.toneMapping === "none"
      ? false
      : {
        exposure: postFlagOn
          ? (authoredPostContext?.output?.exposure ?? 1) * (typeof authoredColorGrade?.exposure === "number" ? authoredColorGrade.exposure : 1)
          : 1,
        whitePoint: 1,
        operator: postFlagOn
          ? (authoredPostContext?.output?.toneMapping && authoredPostContext.output.toneMapping !== "none"
            ? authoredPostContext.output.toneMapping
            : "aces")
          : "aces",
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
    // Flag-on: the resolved mode carries the forward-target sample count and
    // the FXAA pass presents through the dedicated r185 split + dither; a
    // `smaa` resolution submits no pass — SMAA is not implemented on the
    // legacy chain (Phase 3); the honest no-AA frame is reported via the
    // resolution reason in the submitted record.
    ...(resolvedAa ? { sampleCount: resolvedAa.sampleCount } : {}),
    ...(fxaaRequested && authoredAntiAlias ? { fxaa: resolvedAa ? { variant: "r185" as const } : {} } : {}),
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
    // §6.9 (Phase 3): on the strict v2 route the volumetric-fog node maps to
    // S4 god rays and the CPU `volumetric-light` pass is not emitted.
    ...(volumetricPass && !(postFlagOn && !authoredPostContext?.compatPost3) ? { volumetricLight: volumetricPass } : {}),
    // PRD-03 §6.11 / CCR-03-1 (flag-on): forward the real camera clipping so
    // depth-gated passes linearize against the authored range instead of the
    // 0.1/1000 placeholder.
    ...(postFlagOn ? {
      depthRange: {
        ...resolveCameraClipping({ near: snapshot.camera?.near, far: snapshot.camera?.far }),
        projection: (snapshot.camera?.mode === "orthographic" || snapshot.camera?.mode === "isometric" ? "orthographic" : "perspective") as "perspective" | "orthographic"
      }
    } : {})
  };

  // PRD-03 §7.1 / Phase 2 (flag-on): field allowlists + the v2 pipeline bag.
  // An unknown effect-node field throws POST_FIELD_UNSUPPORTED inside the
  // compile so `app.ready()` rejects before the first frame — the error never
  // lands in `diagnostics.errors`. `compat.post === "3.0"` opts out of the v2
  // chain entirely; flag-off warns (`option-ignored`) as before.
  const fieldDiagnostics: PostFieldDiagnostic[] = [];
  for (const node of nodes) {
    if (node.kind !== "effect") continue;
    const nodeDiagnostics = validatePostEffectNode(node);
    if (nodeDiagnostics) fieldDiagnostics.push(...nodeDiagnostics);
  }
  const strictPostFields = postFlagOn && !authoredPostContext?.compatPost3;
  if (strictPostFields) {
    const unsupported = fieldDiagnostics.find((diagnostic) => diagnostic.code === "POST_FIELD_UNSUPPORTED");
    if (unsupported) {
      throw new AuraRuntimeError("POST_FIELD_UNSUPPORTED", unsupported.message);
    }
    const tierSettings = QUALITY_TIERS[resolvedTier];
    // §6.8 (Phase 5): the C-27 row for the resolved tier gates which authored
    // or preset-contributed stages run (GTAO samples, DOF/MB enables, grain/CA).
    const tierResolution = resolvePostTier(tierSettings, resolvedTier, {
      taaResolved: resolvedAa?.mode === "taa" || authoredAntiAlias?.mode === "taa",
      autoExposureAuthored: authoredPostContext?.output?.autoExposure !== undefined && authoredPostContext?.output?.autoExposure !== false
    });
    const pipelineResult = createRootPostPipeline(snapshot, snapshot.camera, authoredPostContext?.output, tierSettings, lights, tierResolution);
    fieldDiagnostics.push(...pipelineResult.diagnostics);
    // The fields are readonly, so the v2 additions come in as a rebuilt
    // object — flag-off keeps the legacy bag untouched (byte-equal).
    options = {
      ...options,
      pipeline: {
        ...pipelineResult.options,
        // The tier resolution (Phase 1) supplies the AA mode — the bridge's
        // "off" placeholder is never the answer under a strict field check.
        antiAliasing: resolvedAa?.mode ?? authoredAntiAlias?.mode ?? "off",
        // Phase 4: stamp the §8.6 TAA bag only when TAA actually runs — a
        // coverage fallback (msaa/smaa + TAA_VELOCITY_COVERAGE) must not
        // re-arm it through the `pipeline.taa` presence check in v2Stages.
        ...((resolvedAa ? resolvedAa.mode === "taa" : authoredAntiAlias?.mode === "taa") ? {
          taa: {
            feedbackMin: 0.88,
            feedbackMax: 0.97,
            varianceGamma: 1.0,
            upscale: Boolean((pipelineResult.options.renderScale ?? 1) < 1),
            sharpness: typeof authoredAntiAlias?.sharpness === "number" ? authoredAntiAlias.sharpness : 0.2
          }
        } : {})
      },
      v2: true
    };
  }
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
      antiAliasMode: authoredAntiAlias?.mode ?? null,
      resolvedAntiAlias: resolvedAa
        ? { mode: resolvedAa.mode, sampleCount: resolvedAa.sampleCount, ...(resolvedAa.reason ? { reason: resolvedAa.reason } : {}) }
        : null,
      depthRange: options.depthRange
        ? { near: options.depthRange.near, far: options.depthRange.far, projection: options.depthRange.projection ?? "perspective" }
        : null,
      fieldDiagnostics,
      v2: options.v2 === true
    }
  });
  return options;
}

const productionTemporalSceneKeys = new WeakMap<AuraSceneSnapshot, string>();

let productionTemporalSceneSequence = 0;
