// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraBackend, AuraCreateAppRendererOptions, AuraLightNode, AuraModelNode, AuraRendererDiagnosticReport, AuraRuntimeNodeRegistry, AuraSceneSnapshot, AuraVec3, ProductionRuntimeActorEntry, ProductionRuntimePrimitiveEntry, WebGLSceneRenderer } from "../nodes/types.js";
import { colorToAcesInputClearColor, colorToClearColor, colorToLinearRgb, colorToLinearRgba } from "../colorUtils.js";
import { configureBloomFusionDevice, decodedModelDirectPathBlockers, isDirectRenderPath, isFusedBloomPasses, recordDecodedDirectPathBlockers, type BloomFusionDevice } from "../app/renderPath.js";
import { createAssetProvenance, formatSkippedInlineModelWarning } from "../diagnostics.js";
import { groups } from "../nodes/groups.js";
import { primitive } from "../nodes/primitives.js";
import { ignoredOptionMessages } from "../nodes/optionDiagnostics.js";
import { createRendererDiagnosticReport } from "../rendererDiagnostics.js";
import { clamp01, createViewProjection } from "../sceneMath.js";
import { resolveCameraFrame } from "./camera.js";
import { createProductionRuntimeCollectedLights, createProductionRuntimePostprocessObservation, createProductionRuntimeShadowObservation, createProductionTexturesObservation, countContributorContentNodes, isRenderableModelNode } from "./observations.js";
import { createProductionTextObservation } from "./text.js";
import { getRootPerformanceQuality, getRootRenderSource } from "../RootRuntimeSupport.js";
import { Renderer, webGL2MaxTextureSize, type RenderBackendKind, type ProductionRendererFeature, type ProductionRendererInput, type RenderDeviceDiagnostics } from "@aura3d/rendering";
import { rendererFeatureReport, rendererInteractiveFeatureReport, validateProductionRendererInput } from "../rendererReports.js";
import { normalizeTextureBudgetBytes } from "../app/rendererOptions.js";
import { createProductionRuntimeEnvironment, environmentKnobKey } from "./environment.js";
import { contactShadowKeyWarning } from "./contactShadowKey.js";
import { applyModelTintBridge } from "./modelMaterials.js";
import { createProductionRuntimePrimitiveEntries, upgradeProductionEnvironmentHdri } from "./primitives.js";
import { qrPrimitiveGeometryOptions } from "./geometry.js";
import { createProductionRuntimeRendererInput } from "./renderInput.js";
import { createProductionRuntimeShadowOptions, describeProductionSpotShadow } from "./shadows.js";
import { upgradeProductionPrimitiveTextures } from "./textures.js";
import { upgradeCustomMaterialTextures } from "./customTextures.js";
import { createProductionRuntimeBackgroundImage } from "./backgroundImage.js";
import { createProductionParitySurfaces } from "./paritySurfaces.js";
import { createProductionLensFlares } from "./lensFlare.js";
import { camera } from "../nodes/camera.js";
import { geometry } from "../nodes/geometry.js";
import { material } from "../nodes/material.js";
import { asRuntimeCompiled, compileScene, compilerSlot, updateCompiledScene } from "../../contracts/compiler.js";
import "./compileScene.js";
import type { MountSceneCompileContext } from "./compileScene.js";
import { createDegradationSink } from "./degradation.js";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { markTiming } from "../platform.js";
import { QUALITY_TIERS, resolveTierSettings, type AuraQualityTier } from "@aura3d/rendering/contracts";
import { resolveQrFlags } from "../../contracts/flags.js";
import { applyXRViewOverride } from "../xr/xrViewOverride.js";

export async function createProductionRuntimeSceneRenderer(
  canvas: HTMLCanvasElement,
  snapshot: AuraSceneSnapshot,
  rendererOptions?: AuraCreateAppRendererOptions,
  runtimeNodes?: AuraRuntimeNodeRegistry,
  qrFlags?: QrFlags,
  degradation?: import("../app/mountRenderer.js").AuraSceneDegradationOptions,
  canvasContext?: import("../app/mountRenderer.js").AuraCanvasContextOptions
): Promise<WebGLSceneRenderer> {
  const flags = qrFlags ?? resolveQrFlags({});
  const flattened = groups.flatten(snapshot.nodes);
  const renderableModelNodes = flattened.filter(isRenderableModelNode);
  const modelNodes = renderableModelNodes.filter((node) =>
    createAssetProvenance(node.asset).source === "typed-aura-assets-manifest"
  );
  const skippedInlineModelWarnings = renderableModelNodes
    .filter((node) => createAssetProvenance(node.asset).source === "inline-definition")
    .map((node) => formatSkippedInlineModelWarning(node));
  /*
   * Loaded here rather than imported at module scope (WS-2.2). This function is only reached when the
   * scene contains a typed GLB, so the glTF loader is downloaded exactly when it is needed.
   */
  const flagsOn = flags.on("A3D_QR_COMPILER") && compilerSlot.provided;
  let actorEntries: ProductionRuntimeActorEntry[] = flagsOn
    ? [] // flag-on: the C-36 compile owns entry assembly (see below)
    : modelNodes.length > 0
    ? await (async () => {
        const { createTypedGLBActor } = await import("../../production-runtime/TypedGLBActor.js");
        // Q-15-1 (#461, C-16 §7.3): with A3D_QR_ASSETS on, compressed GLBs
        // (meshopt/draco/KTX2) require their decoders from /aura-decoders/
        // and fail closed with AssetDecoderUnavailable; flag off spreads {}.
        const { typedGLBActorDecoderOptions } = await import("../AssetDecoders.js");
        const decoderOptions = typedGLBActorDecoderOptions(flags, undefined);
        return await Promise.all(modelNodes.map(async (node, index) => ({
          node,
          actor: await createTypedGLBActor({
            asset: node.asset,
            id: node.runtime?.id ?? node.asset.id ?? `model-${index + 1}`,
            name: node.name ?? node.asset.id ?? `model-${index + 1}`,
            width: canvas.width,
            height: canvas.height,
            ...(node.hiddenNodeNames ? { hiddenNodeNames: node.hiddenNodeNames } : {}),
            ...(node.role === "primaryWorld" ? { consolidateStaticMeshes: true } : {}),
            ...decoderOptions,
            ...applyModelTintBridge(node)
          })
        })));
      })()
    : [];
  let primitiveEntries: readonly ProductionRuntimePrimitiveEntry[] = flagsOn ? [] : createProductionRuntimePrimitiveEntries(flattened, qrPrimitiveGeometryOptions(flags, resolveMountQuality(rendererOptions), canvas));
  // T2.4 — C-29 `Renderer.create` replaces `ProductionRuntimeRenderer.create`.
  // `preserveDrawingBuffer` is gone: frame capture flows through the C-05
  // `captureFrame`/`toBlob` path after a synchronous render, not the raw
  // WebGL drawing buffer.
  markTiming("a3d:mount:renderer-create:start");
  const productionRenderer = await Renderer.create({
    canvas,
    width: canvas.width,
    height: canvas.height,
    backend: (rendererOptions?.backend as RenderBackendKind | undefined) ?? "webgl2",
    antialias: true,
    // Only set when asked: the device default (false) is what a plain app needs.
    ...(canvasContext?.preserveDrawingBuffer === true ? { preserveDrawingBuffer: true } : {}),
    requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets", "hdr-image-based-lighting"],
    // Evidence/QA runs (a render source), strict apps and `?diag=1` read the GL error every frame; everything else samples it.
    ...(getRootRenderSource(canvas) || degradation?.strict === true || (typeof location !== "undefined" && /[?&]diag=1(&|$)/.test(location.search))
      ? { errorCheckMode: "frame" as const }
      : {}),
    // Background colors are display intent. Pre-invert the renderer's coupled
    // matrix-fitted ACES transform so presentation preserves that authored color.
    // Direct path: nothing tone-maps the clear (the canvas is written as-is), so the authored display colour is the clear.
    clearColor: isDirectRenderPath(canvas) ? colorToClearColor(snapshot.background) : colorToAcesInputClearColor(snapshot.background),
    // C-05 (A3D_QR_CORE_OUTPUT): the HDR target clears to the linear
    // background; alpha carries `background(c, { toneMapped })` coverage.
    outputClearColor: outputClearColor(snapshot),
    // T0-28: the app's resolved flags bind to this renderer's device, so two
    // apps on one page never read each other's flags through FrameGraph.
    qrFlags: flags
  });
  markTiming("a3d:mount:renderer-create:resolved");
  // quality auto / cinematic: allow look-neutral bloom pass fusion (`production` never does).
  configureBloomFusionDevice(productionRenderer.device as unknown as BloomFusionDevice, canvas, rendererOptions);
  // Same gate, WP-7: sun cascades no receiver can select are not redrawn (pixel-identical; `production` keeps drawing every cascade).
  if (isFusedBloomPasses(canvas)) (productionRenderer.device as unknown as { skipUnusedShadowCascades?: boolean }).skipUnusedShadowCascades = true;
  // T4.2: a throwing mount (compile handler, HDRI upgrade, C-36 strict)
  // must not leak the created renderer or the HDRI environment.
  let disposeHdriEnvironment: (() => void) | null = null;
  try {
    let latestDeviceDiagnostics: RenderDeviceDiagnostics = productionRenderer.getDiagnostics();
    let latestFeatures: readonly ProductionRendererFeature[] = rendererFeatureReport(productionRenderer);
    // M2 streaming distances measure against the live camera eye; refreshed
    // every render so residency follows the camera instead of mount intent.
    let latestCameraEye: AuraVec3 = resolveCameraFrame(snapshot, snapshot.camera, 0, runtimeNodes).eye;
    const runtimeWarnings = new Set<string>(skippedInlineModelWarnings);
    // C1 textured upgrade: fire-and-forget after mount. Scalar first frames stay
    // fast; outcomes land in textureUpgradeWarnings, which render() never clears
    // (per-frame runtimeWarnings are rebuilt every frame).
    const textureUpgradeWarnings = new Set<string>();
    void upgradeProductionPrimitiveTextures(primitiveEntries, (message) => {
      textureUpgradeWarnings.add(message);
    }, webGL2MaxTextureSize(canvas)).catch((error) => {
      textureUpgradeWarnings.add(`textured upgrade pass failed (${error instanceof Error ? error.message : String(error)}); scalar materials retained`);
    });
    // R-26: asset-ref textures on material.custom / material.node uniforms.
    void upgradeCustomMaterialTextures(primitiveEntries, (message) => {
      textureUpgradeWarnings.add(message);
    }).catch((error) => {
      textureUpgradeWarnings.add(`custom material texture pass failed (${error instanceof Error ? error.message : String(error)}); white fallback retained`);
    });
    const productionEnvironment = createProductionRuntimeEnvironment(snapshot, flags, { implicitFill: false });
    // B3 HDRI upgrade: fire-and-forget after mount. First frames render the
    // studio procedural fallback; the HDR chain swaps the lighting object the
    // render closure reads every frame. Outcomes land in hdriWarnings, which
    // render() never clears (per-frame runtimeWarnings are rebuilt every frame).
    let currentEnvironmentLighting = productionEnvironment.lighting;
    const mountKnobKey = environmentKnobKey(snapshot);
    let liveKnob: { nodes: unknown; lighting: typeof currentEnvironmentLighting | null } = { nodes: null, lighting: null };
    const hdriWarnings = new Set<string>();
    // LIGHT-09: mount-time lighting warning, kept with the other persistent environment warnings.
    const contactKeyWarning = contactShadowKeyWarning(snapshot);
    if (contactKeyWarning) hdriWarnings.add(contactKeyWarning);
    const hdriState: {
      status: "none" | "pending" | "ready" | "fallback";
      maxLinearValue?: number;
      specularMipCount?: number;
      dualProbe?: boolean;
    } = { status: productionEnvironment.hdriUrl ? "pending" : "none" };
    if (flattened.some((node) => node.kind === "environment" && node.environment === "hdri" && (node.texture as { kind?: string } | undefined)?.kind !== "aura-asset-ref")) {
      hdriWarnings.add("hdri environment has no texture asset ref; studio procedural fallback retained");
    }
    if (productionEnvironment.hdriUrl) {
      const hdriUrl = productionEnvironment.hdriUrl;
      const hdriReflectionUrl = productionEnvironment.hdriReflectionUrl;
      const hdriIntensity = productionEnvironment.intensity;
      const hdriRotation = productionEnvironment.hdriRotation;
      void upgradeProductionEnvironmentHdri(hdriUrl, hdriIntensity, hdriReflectionUrl, hdriRotation)
        .then((result) => {
          disposeHdriEnvironment?.();
          disposeHdriEnvironment = result.dispose;
          currentEnvironmentLighting = result.lighting;
          hdriState.status = "ready";
          hdriState.maxLinearValue = result.maxLinearValue;
          hdriState.specularMipCount = result.specularMipCount;
          hdriState.dualProbe = result.dualProbe;
        })
        .catch((error) => {
          hdriState.status = "fallback";
          hdriWarnings.add(`HDRI upgrade failed for ${hdriUrl} (${error instanceof Error ? error.message : String(error)}); studio procedural fallback retained`);
        });
    }
    const productionRuntimeLights = createProductionRuntimeCollectedLights(snapshot, flags, { hemisphereAsEnvironment: true });
    // threejs-parity L7/SG-10: `scene().background({ texture | cube })` —
    // async decode like the C1/B3 upgrades; feeds `source.environmentBackground`
    // without ever touching `environmentLighting` (no implicit IBL).
    const backgroundImage = createProductionRuntimeBackgroundImage(snapshot, (message) => {
      runtimeWarnings.add(message);
    });
    // threejs-parity L7/SC-01+AD-15: `cameras.cube`/`surfaces.mirror` captures.
    const paritySurfaces = createProductionParitySurfaces(productionRenderer, (message) => {
      runtimeWarnings.add(message);
    });
    // threejs-parity AD-15 (P2): `lights.lensFlare` additive flare sprites, chained after the surfaces.
    const lensFlares = createProductionLensFlares((message) => {
      runtimeWarnings.add(message);
    });
    const prepareParitySurfaces = (source: ProductionRendererInput["source"], time: number): ProductionRendererInput["source"] =>
      lensFlares.prepare(
        paritySurfaces.prepare(source, snapshot, runtimeNodes, time, canvas.width / Math.max(1, canvas.height), { width: canvas.width, height: canvas.height }),
        snapshot,
        runtimeNodes,
        time,
        canvas.width / Math.max(1, canvas.height),
        canvas.height
      );

    // T3.11 (C-36): compile once at mount. With A3D_QR_COMPILER off the contract
    // stub returns `source: null` and every call below keeps the legacy path
    // byte-identical; with the flag on, the real compile owns entry assembly and
    // `updateCompiledScene` builds each frame's RenderSource.
    const sceneCompileCtx: MountSceneCompileContext = {
      renderer: productionRenderer,
      assets: undefined,
      // TIER: the caller's quality governor value reaches the compile ctx —
      // rendererOptions.quality.tier (C-27, prd11) wins; absent/"auto" keeps
      // the desktop default "high" (the same stub resolution the lighting
      // handlers use for their own auto tier).
      quality: resolveMountQuality(rendererOptions),
      strict: degradation?.strict ?? flags.on("A3D_QR_STRICT"),
      flags,
      // T4.1: the C-36 degrade handler. Strict → AuraRuntimeError with code and
      // cause; non-strict → C-38 onDegradation + warn-once per (code,nodeId).
      degrade: createDegradationSink({
        strict: degradation?.strict ?? flags.on("A3D_QR_STRICT"),
        ...(degradation?.onDegradation ? { onDegradation: degradation.onDegradation } : {}),
        warn: (message) => { runtimeWarnings.add(message); }
      }),
      canvas,
      environmentLighting: (liveSnapshot) => {
        // LIGHT-07: the knob was computed from the mount snapshot. When runtime adds or removes change the
        // environment or light nodes (liveNodes is replaced on every add/remove), recompute it from the live set.
        if (!liveSnapshot) return currentEnvironmentLighting;
        if (liveKnob.nodes !== liveSnapshot.nodes) {
          const key = environmentKnobKey(liveSnapshot);
          liveKnob = {
            nodes: liveSnapshot.nodes,
            lighting: key === mountKnobKey ? null : createProductionRuntimeEnvironment(liveSnapshot, flags, { implicitFill: false }).lighting
          };
        }
        return liveKnob.lighting ?? currentEnvironmentLighting;
      },
      collectedLights: productionRuntimeLights,
      runtimeWarnings,
      ...(runtimeNodes ? { runtimeNodes } : {})
    };
    markTiming("a3d:mount:compile-scene:start");
    const compiledScene = await compileScene(snapshot, sceneCompileCtx);
    markTiming("a3d:mount:compile-scene:resolved");
    const compiled = asRuntimeCompiled(compiledScene);
    const probeStatus = (): "pending" | "ready" | "fallback" | undefined =>
      (compiledScene as { environmentProbeStatus?: "pending" | "ready" | "fallback" }).environmentProbeStatus;
    if (compiled) {
      actorEntries = compiled.actorEntries as ProductionRuntimeActorEntry[];
      primitiveEntries = compiled.primitiveEntries as ProductionRuntimePrimitiveEntry[];
      // #1142: the C1 textured upgrade above ran on the pre-compile entry list,
      // which is empty with A3D_QR_COMPILER on — compiled primitives never got
      // their base-colour/normal/roughness maps. Run it on the compiled set.
      void upgradeProductionPrimitiveTextures(primitiveEntries, (message) => {
        textureUpgradeWarnings.add(message);
      }, webGL2MaxTextureSize(canvas)).catch((error) => {
        textureUpgradeWarnings.add(`textured upgrade pass failed (${error instanceof Error ? error.message : String(error)}); scalar materials retained`);
      });
      void upgradeCustomMaterialTextures(primitiveEntries, (message) => {
        textureUpgradeWarnings.add(message);
      }).catch((error) => {
        textureUpgradeWarnings.add(`custom material texture pass failed (${error instanceof Error ? error.message : String(error)}); white fallback retained`);
      });
      // C-37: bind the mounted compiled scene so registry add/remove can take the
      // subtree-compile path (no remount) under A3D_QR_COMPILER.
      (runtimeNodes as { attachCompiled?: (scene: unknown) => void } | undefined)?.attachCompiled?.(compiledScene);
    }
    // RP-01 (lane E1): the GLBs are decoded now; tell the frame loop about BLEND/transmission materials the direct path cannot draw.
    if (isDirectRenderPath(canvas)) recordDecodedDirectPathBlockers(canvas, decodedModelDirectPathBlockers(actorEntries));
    const authoredLightNodes = flattened.filter((node): node is AuraLightNode => node.kind === "light");
    const authoredDirectLightNodes = authoredLightNodes.filter((node) => node.light !== "ambient");
    const authoredAmbientLightCount = authoredLightNodes.length - authoredDirectLightNodes.length;
    const authoredAreaProxyCount = authoredDirectLightNodes.filter((node) => node.light === "rect" || node.light === "softbox").length;

    // N1 + G1 + M2 observations refresh on every diagnostics read from the
    // live entries/device state — never cached intent.
    const buildDiagnostics = (): AuraRendererDiagnosticReport => {
      const shadowObservation = createProductionRuntimeShadowObservation(
        { ...createProductionRuntimeShadowOptions(snapshot, productionRuntimeLights), ...(getRootPerformanceQuality(canvas) ? { size: getRootPerformanceQuality(canvas)!.shadowSize } : {}) },
        latestDeviceDiagnostics,
        productionRenderer.getShadowEvidence()
      );
      const spotCaster = productionRuntimeLights.find((light) => light.castsShadow);
      const spotAngle = spotCaster?.kind === "spot" ? spotCaster.spotAngle : undefined;
      const texturesObservation = createProductionTexturesObservation(
        primitiveEntries,
        latestCameraEye,
        rendererOptions?.textureBudgetBytes ?? normalizeTextureBudgetBytes(undefined)
      );
      const streamingWarnings = texturesObservation.overBudget
        ? [`texture streaming over budget by ${texturesObservation.overBudgetBytes} bytes `
          + `(${texturesObservation.residentEntries} resident, `
          + `${texturesObservation.evictedEntries.length} evicted: ${texturesObservation.evictedEntries.join(", ") || "none"}); `
          + `raise renderer.textureBudgetBytes above ${texturesObservation.requestedBytes} bytes or move textures closer`]
        : [];
      return createRendererDiagnosticReport(
        snapshot,
        {
          mounted: true,
          backend: "production-runtime",
          postprocess: createProductionRuntimePostprocessObservation(latestDeviceDiagnostics),
          shadow: {
            ...shadowObservation,
            spot: describeProductionSpotShadow({
              requested: flattened.some((node) => node.kind === "light" && node.light === "spot" && node.shadow === true),
              casterIsSpot: spotCaster?.kind === "spot",
              ...(spotCaster === undefined ? {} : { casterName: spotCaster.source.name }),
              ...(spotAngle === undefined ? {} : { angle: spotAngle }),
              ...(spotCaster?.kind === "spot" ? { penumbra: spotCaster.penumbra, range: spotCaster.range } : {}),
              mapRendered: shadowObservation.mapRendered,
              mapSampled: shadowObservation.mapSampled
            })
          },
          text: createProductionTextObservation(primitiveEntries),
          textures: texturesObservation,
        environment: {
          enabled: true,
          preset: productionEnvironment.preset,
          intensity: productionEnvironment.intensity,
          evidence: hdriState.status === "ready"
            ? `${productionEnvironment.evidence} — HDRI chain ready${hdriState.dualProbe ? " (dual-probe: illumination diffuse + reflection specular)" : " (single probe)"} (maxLinear ${hdriState.maxLinearValue}, ${hdriState.specularMipCount} specular mips)`
            : productionEnvironment.evidence,
          // B3 iblPixelBacked: true only after the HDR chain swaps the live
          // lighting object. Procedural first frames and fallbacks never claim it.
          // #1142: when the compiled C-09 probe owns IBL (compiler + lighting),
          // a still-pending probe acquire keeps the scene "pending" too, so
          // captures wait for real specular instead of the analytic floor.
          iblPixelBacked: hdriState.status === "ready" && probeStatus() !== "pending",
          hdriStatus: probeStatus() === "pending" && hdriState.status !== "none" ? "pending" : hdriState.status,
          ...(hdriState.dualProbe === undefined ? {} : { dualProbe: hdriState.dualProbe }),
          ...(productionEnvironment.hdriRotation === undefined ? {} : { hdriRotation: productionEnvironment.hdriRotation })
        },
        warnings: [
          `Production runtime bridge active with ${actorEntries.length} typed GLB actor${actorEntries.length === 1 ? "" : "s"} and ${primitiveEntries.length} Aura primitive${primitiveEntries.length === 1 ? "" : "s"} on ${productionRenderer.device.kind as AuraBackend}.`,
          ...(authoredDirectLightNodes.length === 0
            ? ["Production runtime direct-light fallback active: the scene has no authored directional, point, studio, rect, or softbox light."]
            : [`Production runtime derived ${productionRuntimeLights.length} collected direct light${productionRuntimeLights.length === 1 ? "" : "s"} from ${authoredDirectLightNodes.length} authored scene light${authoredDirectLightNodes.length === 1 ? "" : "s"}.`]),
          ...(authoredAmbientLightCount > 0
            ? [`${authoredAmbientLightCount} authored ambient light${authoredAmbientLightCount === 1 ? "" : "s"} remain environment-lighting intent and are not mislabeled as direct CollectedLight entries.`]
            : []),
          ...(authoredAreaProxyCount > 0
            ? [`${authoredAreaProxyCount} authored rect/softbox light${authoredAreaProxyCount === 1 ? "" : "s"} use bounded spot-light proxies whose cone and range derive from authored width and height; this does not claim physical area-light shading.`]
            : []),
          ...(flattened.some((node) => node.kind === "effect")
            ? ["Effect nodes are requested in the scene graph; production bridge diagnostics report them, but unsupported postprocess/effect passes remain non-pixel-backed until the runtime feature reports support."]
            : []),

          ...latestFeatures
            .filter((feature) => feature.state !== "supported")
            .map((feature) => `Production runtime feature ${feature.id} is ${feature.state}: ${feature.detail}`),
          ...new Set([...skippedInlineModelWarnings, ...(flagsOn ? [] : ignoredOptionMessages(flattened).map((entry) => entry.message)), ...runtimeWarnings]),
          ...textureUpgradeWarnings,
          ...streamingWarnings,
          ...hdriWarnings
        ],
        deviceDiagnostics: latestDeviceDiagnostics,
        lodSelections: primitiveEntries
          .filter((entry) => Boolean(entry.node.lod?.levels.length))
          .map((entry) => ({
            nodeName: entry.node.name ?? "unnamed distance LOD",
            levelIndex: entry.currentLodIndex,
            levelName: entry.resources[entry.currentLodIndex]?.name ?? `level-${entry.currentLodIndex}`
          })),
        texturedMaterials: primitiveEntries.flatMap((entry) =>
          entry.resources.map((resource) => ({
            nodeName: entry.node.name ?? `aura-primitive-${entry.node.primitive}`,
            levelName: resource.name,
            status: resource.textureStatus,
            slots: resource.textureSlots,
            pixelBacked: resource.textureStatus === "textured" && resource.texturedMaterial !== null,
            warnings: resource.textureWarnings
          }))
        )
        },
        rendererOptions
      );
    };

    let preparedFrame: { readonly time: number; readonly input: ProductionRendererInput } | undefined;
    const buildFrame = (time: number): ProductionRendererInput => {
      latestCameraEye = resolveCameraFrame(snapshot, snapshot.camera, time, runtimeNodes).eye;
      const wrapWithBackgroundImage = (input: ProductionRendererInput): ProductionRendererInput => {
        const background = backgroundImage?.current();
        // A resolved authored image background replaces the compiled/legacy
        // source's environmentBackground; unset → the frame flows unchanged.
        if (!background) return input;
        return { ...input, source: { ...input.source, environmentBackground: background } };
      };
      if (compiled) {
        // C-36 real path: per-frame update on the mounted compiled scene.
        updateCompiledScene(compiledScene, snapshot, runtimeNodes as AuraRuntimeNodeRegistry, time, flags);
        return wrapWithBackgroundImage(compiled.lastInput! as ProductionRendererInput);
      }
      runtimeWarnings.clear();
      return wrapWithBackgroundImage(createProductionRuntimeRendererInput(
        snapshot,
        canvas,
        actorEntries,
        primitiveEntries,
        time,
        runtimeNodes,
        runtimeWarnings,
        currentEnvironmentLighting,
        productionRuntimeLights
      ));
    };
  /*
   * #1175: PRD-10 world terrain/water/grass nodes are real renderable content
   * (the prd10 frame contributor draws them with their own geometry and
   * programs), so they count toward the production content rule alongside
   * mesh primitives. Without this, a world-only scene failed "requires at least
   * one real mesh primitive" and never ran a frame.
   */
  const contributorContent = { contributorDrawnNodes: countContributorContentNodes(flattened) };
  const validateFrameInput = (input: ProductionRendererInput): void => validateProductionRendererInput(input, contributorContent);
  const takePreparedFrame = (time: number): ProductionRendererInput => {
      const prepared = preparedFrame?.time === time ? preparedFrame.input : undefined;
      preparedFrame = undefined;
      return prepared ?? buildFrame(time);
    };

    return {
      get backend() {
        return productionRenderer.device.kind as AuraBackend;
      },
      get diagnostics() {
        return buildDiagnostics();
      },
      update(time) {
        // Building the frame applies controller-bound actor clips, root-motion
        // consumption, foot IK, morphs and imported-asset evidence. Discarding the
        // returned input deliberately avoids a GPU/device submission.
        preparedFrame = { time, input: buildFrame(time) };
      },
      render(time) {
        const input = takePreparedFrame(time);
        validateFrameInput(input);
        // threejs-parity SC-04: while an XR eye is installed on this canvas, render with its matrices and eye position.
        const xrFrame = applyXRViewOverride(canvas, input);
        latestDeviceDiagnostics = productionRenderer.render(prepareParitySurfaces(xrFrame.source, time), xrFrame.camera as typeof input.camera);
        getRootRenderSource(canvas)?.onFrame?.(latestDeviceDiagnostics, [...(input.source.collectRenderItems?.() ?? [])]);
        latestFeatures = rendererInteractiveFeatureReport(productionRenderer, latestDeviceDiagnostics, input);
        return latestDeviceDiagnostics.drawCalls;
      },
      async renderAsync(time) {
        const input = takePreparedFrame(time);
        validateFrameInput(input);
        latestDeviceDiagnostics = await productionRenderer.renderAsync(prepareParitySurfaces(input.source, time), input.camera);
        getRootRenderSource(canvas)?.onFrame?.(latestDeviceDiagnostics, [...(input.source.collectRenderItems?.() ?? [])]);
        latestFeatures = rendererInteractiveFeatureReport(productionRenderer, latestDeviceDiagnostics, input);
        return latestDeviceDiagnostics.drawCalls;
      },
      viewProjection(time) {
        return createViewProjection(snapshot, canvas.width / Math.max(1, canvas.height), time, runtimeNodes);
      },
      // threejs-parity L7/SR-07: `app.precompile` — compiles the generated
      // programs this frame's draw records need, without presenting pixels.
      async precompile(time = 0) {
        const input = buildFrame(time);
        return productionRenderer.precompile(input.source, input.camera);
      },
      // PRD-01 C-05 seam (Q-15-1): the lane's `Renderer` when the backend is WebGL2.
      get auraRenderer() {
        return productionRenderer;
      },
      resetTemporalHistory(reason) {
        productionRenderer.resetTemporalHistory(reason);
      },
      resize(width, height) {
        productionRenderer.resize(width, height);
      },
      onDeviceLost(listener) {
        return productionRenderer.onDeviceLost(listener);
      },
      onDeviceRestored(listener) {
        return productionRenderer.onDeviceRestored(listener);
      },
      deviceLost() {
        return productionRenderer.isDeviceLost();
      },
      dispose() {
        disposeHdriEnvironment?.();
        backgroundImage?.dispose();
        paritySurfaces.dispose();
        lensFlares.dispose();
        productionRenderer.dispose();
        if (compiled) {
          (runtimeNodes as { detachCompiled?: (scene: unknown) => void } | undefined)?.detachCompiled?.(compiledScene);
          compiled.dispose();
          return;
        }
        for (const { actor } of actorEntries) actor.dispose();
        for (const { resources } of primitiveEntries) {
          for (const { geometry, shadowGeometry, material, texturedMaterial, textureDisposer } of resources) {
            textureDisposer?.();
            geometry.dispose();
            shadowGeometry?.dispose();
            material.dispose();
            texturedMaterial?.dispose();
          }
        }
      }
    };
  } catch (mountError) {
    // Flow analysis narrows the declared-`null` disposer to `never` here
    // (its try-body assignment never ran on this path); the cast restores the
    // declared type for the optional call.
    const disposeEnv = disposeHdriEnvironment as (() => void) | null;
    try { disposeEnv?.(); } catch { /* best-effort dispose */ }
    productionRenderer.dispose();
    throw mountError;
  }
}

/**
 * TIER: resolve the mount compile ctx quality surface from the caller's
 * renderer options. `renderer.quality` is a tier name or `{ tier }` (C-27,
 * prd11; `parseQualityRendererOptions` accepts both); absent or "auto" keeps
 * the desktop default "high", the same stub resolution the lighting handlers
 * apply to their own auto tier. The string form used to be ignored here
 * (top-tennis C11), so `renderer: { quality: "low" }` mounted at "high".
 */
export function resolveMountQuality(
  rendererOptions?: AuraCreateAppRendererOptions
): MountSceneCompileContext["quality"] {
  const option = rendererOptions?.quality as unknown;
  const governed = typeof option === "string" ? option : (option as { tier?: unknown } | undefined)?.tier;
  const tier: AuraQualityTier =
    typeof governed === "string" && governed !== "auto" && governed in QUALITY_TIERS ? (governed as AuraQualityTier) : "high";
  return { ...resolveTierSettings(tier), tier };
}

/**
 * C-05 HDR-target clear: the linear background. Alpha is OutputPass coverage:
 * 1 = tone-mapped with the scene (PRD-01 default), 0 = `toneMapped: false`,
 * passed through untouched (three r185's raw clear).
 */
export function outputClearColor(snapshot: Pick<AuraSceneSnapshot, "background" | "backgroundToneMapped">): readonly [number, number, number, number] {
  const [red, green, blue] = colorToLinearRgba(snapshot.background);
  return [red, green, blue, snapshot.backgroundToneMapped === false ? 0 : 1];
}
