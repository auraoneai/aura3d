// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraBackend, AuraCreateAppRendererOptions, AuraLightNode, AuraModelNode, AuraRendererDiagnosticReport, AuraRuntimeNodeRegistry, AuraSceneSnapshot, AuraVec3, ProductionRuntimeActorEntry, ProductionRuntimePrimitiveEntry, WebGLSceneRenderer } from "../nodes/types.js";
import { colorToAcesInputClearColor, colorToLinearRgb, colorToLinearRgba } from "../colorUtils.js";
import { createAssetProvenance } from "../diagnostics.js";
import { groups } from "../nodes/groups.js";
import { primitive } from "../nodes/primitives.js";
import { createRendererDiagnosticReport } from "../rendererDiagnostics.js";
import { clamp01, createViewProjection } from "../sceneMath.js";
import { resolveCameraFrame } from "./camera.js";
import { createProductionRuntimeCollectedLights, createProductionRuntimePostprocessObservation, createProductionRuntimeShadowObservation, createProductionTexturesObservation, isRenderableModelNode } from "./observations.js";
import { createProductionTextObservation } from "./text.js";
import { getRootPerformanceQuality, getRootRenderSource } from "../RootRuntimeSupport.js";
import { Renderer, type RenderBackendKind, type ProductionRendererFeature, type ProductionRendererInput, type RenderDeviceDiagnostics } from "@aura3d/rendering";
import { rendererFeatureReport, rendererInteractiveFeatureReport, validateProductionRendererInput } from "../rendererReports.js";
import { normalizeTextureBudgetBytes } from "../app/rendererOptions.js";
import { createProductionRuntimeEnvironment } from "./environment.js";
import { webGL2MaxTextureSize } from "./webglRuntime.js";
import { applyModelTintBridge } from "./modelMaterials.js";
import { createProductionRuntimePrimitiveEntries, upgradeProductionEnvironmentHdri } from "./primitives.js";
import { createProductionRuntimeRendererInput } from "./renderInput.js";
import { createProductionRuntimeShadowOptions, describeProductionSpotShadow } from "./shadows.js";
import { upgradeProductionPrimitiveTextures } from "./textures.js";
import { camera } from "../nodes/camera.js";
import { geometry } from "../nodes/geometry.js";
import { material } from "../nodes/material.js";
import { asRuntimeCompiled, compileScene, updateCompiledScene } from "../../contracts/compiler.js";
import type { MountSceneCompileContext } from "./compileScene.js";
import { createDegradationSink } from "./degradation.js";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { resolveQrFlags } from "../../contracts/flags.js";

export async function createProductionRuntimeSceneRenderer(
  canvas: HTMLCanvasElement,
  snapshot: AuraSceneSnapshot,
  rendererOptions?: AuraCreateAppRendererOptions,
  runtimeNodes?: AuraRuntimeNodeRegistry,
  qrFlags?: QrFlags,
  degradation?: import("../app/mountRenderer.js").AuraSceneDegradationOptions
): Promise<WebGLSceneRenderer> {
  const flags = qrFlags ?? resolveQrFlags({});
  const flattened = groups.flatten(snapshot.nodes);
  const modelNodes = flattened.filter((node): node is AuraModelNode =>
    isRenderableModelNode(node) && createAssetProvenance(node.asset).source === "typed-aura-assets-manifest"
  );
  /*
   * Loaded here rather than imported at module scope (WS-2.2). This function is only reached when the
   * scene contains a typed GLB, so the glTF loader is downloaded exactly when it is needed.
   */
  const flagsOn = flags.on("A3D_QR_COMPILER");
  let actorEntries: ProductionRuntimeActorEntry[] = flagsOn
    ? [] // flag-on: the C-36 compile owns entry assembly (see below)
    : modelNodes.length > 0
    ? await (async () => {
        const { createTypedGLBActor } = await import("../../production-runtime/TypedGLBActor.js");
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
            ...applyModelTintBridge(node)
          })
        })));
      })()
    : [];
  let primitiveEntries: readonly ProductionRuntimePrimitiveEntry[] = flagsOn ? [] : createProductionRuntimePrimitiveEntries(flattened);
  // T2.4 — C-29 `Renderer.create` replaces `ProductionRuntimeRenderer.create`.
  // `preserveDrawingBuffer` is gone: frame capture flows through the C-05
  // `captureFrame`/`toBlob` path after a synchronous render, not the raw
  // WebGL drawing buffer.
  const productionRenderer = await Renderer.create({
    canvas,
    width: canvas.width,
    height: canvas.height,
    backend: (rendererOptions?.backend as RenderBackendKind | undefined) ?? "webgl2",
    antialias: true,
    requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets", "hdr-image-based-lighting"],
    ...(getRootRenderSource(canvas) ? { errorCheckMode: "frame" as const } : {}),
    // Background colors are display intent. Pre-invert the renderer's coupled
    // matrix-fitted ACES transform so presentation preserves that authored color.
    clearColor: colorToAcesInputClearColor(snapshot.background)
  });
  let latestDeviceDiagnostics: RenderDeviceDiagnostics = productionRenderer.getDiagnostics();
  let latestFeatures: readonly ProductionRendererFeature[] = rendererFeatureReport(productionRenderer);
  // M2 streaming distances measure against the live camera eye; refreshed
  // every render so residency follows the camera instead of mount intent.
  let latestCameraEye: AuraVec3 = resolveCameraFrame(snapshot, snapshot.camera, 0, runtimeNodes).eye;
  const runtimeWarnings = new Set<string>();
  // C1 textured upgrade: fire-and-forget after mount. Scalar first frames stay
  // fast; outcomes land in textureUpgradeWarnings, which render() never clears
  // (per-frame runtimeWarnings are rebuilt every frame).
  const textureUpgradeWarnings = new Set<string>();
  void upgradeProductionPrimitiveTextures(primitiveEntries, (message) => {
    textureUpgradeWarnings.add(message);
  }, webGL2MaxTextureSize(canvas)).catch((error) => {
    textureUpgradeWarnings.add(`textured upgrade pass failed (${error instanceof Error ? error.message : String(error)}); scalar materials retained`);
  });
  const productionEnvironment = createProductionRuntimeEnvironment(snapshot);
  // B3 HDRI upgrade: fire-and-forget after mount. First frames render the
  // studio procedural fallback; the HDR chain swaps the lighting object the
  // render closure reads every frame. Outcomes land in hdriWarnings, which
  // render() never clears (per-frame runtimeWarnings are rebuilt every frame).
  let currentEnvironmentLighting = productionEnvironment.lighting;
  const hdriWarnings = new Set<string>();
  const hdriState: {
    status: "none" | "pending" | "ready" | "fallback";
    maxLinearValue?: number;
    specularMipCount?: number;
    dualProbe?: boolean;
  } = { status: productionEnvironment.hdriUrl ? "pending" : "none" };
  let disposeHdriEnvironment: (() => void) | null = null;
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
  const productionRuntimeLights = createProductionRuntimeCollectedLights(snapshot);

  // T3.11 (C-36): compile once at mount. With A3D_QR_COMPILER off the contract
  // stub returns `source: null` and every call below keeps the legacy path
  // byte-identical; with the flag on, the real compile owns entry assembly and
  // `updateCompiledScene` builds each frame's RenderSource.
  const sceneCompileCtx: MountSceneCompileContext = {
    renderer: productionRenderer,
    assets: undefined,
    quality: { tier: "high" } as MountSceneCompileContext["quality"],
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
    environmentLighting: () => currentEnvironmentLighting,
    collectedLights: productionRuntimeLights,
    runtimeWarnings,
    ...(runtimeNodes ? { runtimeNodes } : {})
  };
  const compiledScene = await compileScene(snapshot, sceneCompileCtx);
  const compiled = asRuntimeCompiled(compiledScene);
  if (compiled) {
    actorEntries = compiled.actorEntries as ProductionRuntimeActorEntry[];
    primitiveEntries = compiled.primitiveEntries as ProductionRuntimePrimitiveEntry[];
    // C-37: bind the mounted compiled scene so registry add/remove can take the
    // subtree-compile path (no remount) under A3D_QR_COMPILER.
    (runtimeNodes as { attachCompiled?: (scene: unknown) => void } | undefined)?.attachCompiled?.(compiledScene);
  }
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
        iblPixelBacked: hdriState.status === "ready",
        hdriStatus: hdriState.status,
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
        ...runtimeWarnings,
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
    if (compiled) {
      // C-36 real path: per-frame update on the mounted compiled scene.
      updateCompiledScene(compiledScene, snapshot, runtimeNodes as AuraRuntimeNodeRegistry, time);
      return compiled.lastInput! as ProductionRendererInput;
    }
    runtimeWarnings.clear();
    return createProductionRuntimeRendererInput(
      snapshot,
      canvas,
      actorEntries,
      primitiveEntries,
      time,
      runtimeNodes,
      runtimeWarnings,
      currentEnvironmentLighting,
      productionRuntimeLights
    );
  };
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
      validateProductionRendererInput(input);
      latestDeviceDiagnostics = productionRenderer.render(input.source, input.camera);
      getRootRenderSource(canvas)?.onFrame?.(latestDeviceDiagnostics, [...(input.source.collectRenderItems?.() ?? [])]);
      latestFeatures = rendererInteractiveFeatureReport(productionRenderer, latestDeviceDiagnostics, input);
      return latestDeviceDiagnostics.drawCalls;
    },
    async renderAsync(time) {
      const input = takePreparedFrame(time);
      validateProductionRendererInput(input);
      latestDeviceDiagnostics = await productionRenderer.renderAsync(input.source, input.camera);
      getRootRenderSource(canvas)?.onFrame?.(latestDeviceDiagnostics, [...(input.source.collectRenderItems?.() ?? [])]);
      latestFeatures = rendererInteractiveFeatureReport(productionRenderer, latestDeviceDiagnostics, input);
      return latestDeviceDiagnostics.drawCalls;
    },
    viewProjection(time) {
      return createViewProjection(snapshot, canvas.width / Math.max(1, canvas.height), time, runtimeNodes);
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
      productionRenderer.dispose();
      if (compiled) {
        (runtimeNodes as { detachCompiled?: (scene: unknown) => void } | undefined)?.detachCompiled?.(compiledScene);
        compiled.dispose();
        return;
      }
      for (const { actor } of actorEntries) actor.dispose();
      for (const { resources } of primitiveEntries) {
        for (const { geometry, material, texturedMaterial, textureDisposer } of resources) {
          textureDisposer?.();
          geometry.dispose();
          material.dispose();
          texturedMaterial?.dispose();
        }
      }
    }
  };
}
