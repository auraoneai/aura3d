/**
 * Aura3D translator: SceneSpec -> `@aura3d/engine` public API.
 *
 * Rules for this file (audit integrity):
 *  - Only public `@aura3d/engine` exports are used (createAuraApp, scene, model,
 *    primitives, instances, lights, camera, material, environments, effects,
 *    defineAuraAssets). No renderer internals, no `three`.
 *  - Every SceneSpec field the public API cannot express is rendered without
 *    and logged as "missing" or "partial" in the capability log. Nothing here
 *    tunes the scene to look better or worse than the spec.
 */
import {
  camera,
  createAuraApp,
  defineAuraAssets,
  effects,
  environments,
  instances,
  lights,
  material,
  model,
  nodeHandleExtensionFor,
  primitives,
  scene,
  type AuraApp,
  type AuraActorAnimationApi,
  type AuraMaterialSpec,
  type AuraNodeInput
} from "@aura3d/engine";
import { hdriAssets, modelAssets, type HdriAssetId, type ModelAssetId } from "../shared/assets";
import { installFetchDedupe } from "../shared/fetch-once";
import { modelSpaceHeightAt, rampStairsHeightAt } from "../shared/terrain";
import { createHeightFieldGround } from "@aura3d/animation";
import type { BrokenControlId } from "../shared/contracts";
import type { CapabilityEntry, CapabilityStatus, MaterialSpec, ReadyPayload, SceneSpec } from "../shared/types";

/**
 * Per-run overrides from the page router (PRD-12 §7.1/§8.4). Broken controls
 * expressible through the public API today: no-shadows (castShadow: false),
 * no-ibl (environments.hdri intensity 0), dpr-half (pixelRatio 0.5x), flat-sky
 * (color background). no-aa / no-tonemap / albedo-only are NOT expressible and
 * are never captured: the scene throws `NotExpressibleVariantError`, recorded
 * by capture as an audit failure and measured on the three side (§8.4).
 */
export interface RunOptions {
  readonly variant?: "default" | "aura3d-tuned" | BrokenControlId;
  readonly dpr?: 1 | 2;
  readonly qrFlags?: readonly string[];
  /**
   * PRD-06 T3.9: adapter hook that reads live app state after settle (e.g.
   * imported-asset evidence such as foot-planting feet) and returns fields
   * merged into ReadyPayload.extra.
   */
  readonly collectExtra?: (app: AuraApp) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>;
}

// Variant machinery lives in aura3d/lib/variants.ts (T2.4, §8.4).
import { applyVariantSpec, NotExpressibleVariantError } from "./lib/variants";
import { adapterBudgetMs, DEFAULT_CAPTURE_TIMEOUT_MS, waitForFirstDraw } from "./lib/failfast";
export { NotExpressibleVariantError } from "./lib/variants";

declare const __AURA3D_VERSION__: string;

/*
 * Typed asset map, written the way `aura3d assets typegen` emits it: id, type,
 * format, url, hash, bounds, metadata. Built from the shared asset table so
 * both engines fetch the same URL.
 */
function modelDefinition(id: ModelAssetId) {
  const entry = modelAssets[id];
  return {
    type: "model" as const,
    format: "glb",
    url: entry.url,
    hash: entry.sha256,
    bounds: entry.worldSize,
    metadata: { animations: entry.animations, license: entry.provenance, sourcePath: entry.repoPath }
  };
}

function hdriDefinition(id: HdriAssetId) {
  const entry = hdriAssets[id];
  return { type: "texture" as const, format: "hdr", url: entry.url, hash: entry.sha256, metadata: { license: entry.provenance, sourcePath: entry.repoPath } };
}

const auraModelAssets = defineAuraAssets({
  damagedHelmet: modelDefinition("damagedHelmet"),
  antiqueCamera: modelDefinition("antiqueCamera"),
  clearCoatTest: modelDefinition("clearCoatTest"),
  compareTransmission: modelDefinition("compareTransmission"),
  sheenTestGrid: modelDefinition("sheenTestGrid"),
  soldier: modelDefinition("soldier"),
  auraClashPlayerRig: modelDefinition("auraClashPlayerRig"),
  cesiumMan: modelDefinition("cesiumMan"),
  robotExpressive: modelDefinition("robotExpressive"),
  fox: modelDefinition("fox"),
  rockA: modelDefinition("rockA"),
  rockB: modelDefinition("rockB"),
  crate: modelDefinition("crate"),
  carConcept: modelDefinition("carConcept"),
  littlestTokyo: modelDefinition("littlestTokyo")
});

const auraHdriAssets = defineAuraAssets({
  studioSmall08: hdriDefinition("studioSmall08"),
  autumnFieldPuresky: hdriDefinition("autumnFieldPuresky"),
  kloppenheim06Puresky: hdriDefinition("kloppenheim06Puresky")
});

class CapabilityLog {
  readonly entries: CapabilityEntry[] = [];
  add(feature: string, status: CapabilityStatus, detail: string): void {
    this.entries.push({ feature, status, detail });
  }
}

const PHYSICAL_KEYS = ["clearcoat", "clearcoatRoughness", "sheen", "sheenColor", "sheenRoughness", "transmission", "thickness", "ior"] as const;

function toAuraMaterial(spec: MaterialSpec): AuraMaterialSpec {
  const common: AuraMaterialSpec = {
    color: spec.color,
    roughness: spec.roughness,
    metallic: spec.metalness,
    metalness: spec.metalness,
    ...(spec.emissive !== undefined ? { emissive: spec.emissive } : {}),
    ...(spec.emissiveIntensity !== undefined ? { emissiveIntensity: spec.emissiveIntensity } : {}),
    ...(spec.opacity !== undefined ? { opacity: spec.opacity } : {}),
    ...(spec.envMapIntensity !== undefined ? { envMapIntensity: spec.envMapIntensity } : {})
  };
  const usesPhysical = PHYSICAL_KEYS.some((key) => spec[key] !== undefined);
  if (!usesPhysical) return material.pbr(common);
  return material.physical({
    ...common,
    ...(spec.clearcoat !== undefined ? { clearcoat: spec.clearcoat } : {}),
    ...(spec.clearcoatRoughness !== undefined ? { clearcoatRoughness: spec.clearcoatRoughness } : {}),
    ...(spec.sheen !== undefined ? { sheen: spec.sheen } : {}),
    ...(spec.sheenColor !== undefined ? { sheenColor: spec.sheenColor } : {}),
    ...(spec.sheenRoughness !== undefined ? { sheenRoughness: spec.sheenRoughness } : {}),
    ...(spec.transmission !== undefined ? { transmission: spec.transmission } : {}),
    ...(spec.thickness !== undefined ? { thickness: spec.thickness } : {}),
    ...(spec.ior !== undefined ? { ior: spec.ior } : {})
  });
}

function buildAuraScene(spec: SceneSpec, log: CapabilityLog) {
  const built = scene();
  const nodes: AuraNodeInput[] = [];

  // Background
  if (spec.background.kind === "color") {
    built.background(spec.background.color);
  } else {
    built.background(spec.background.fallbackColor);
    log.add("hdri-background", "missing", `scene().background() accepts only a color; environments.hdri() has no background/skybox option. Rendered solid ${spec.background.fallbackColor} instead of ${spec.background.hdri}.`);
  }

  // Camera
  built.camera(camera.perspective({
    position: spec.camera.position,
    target: spec.camera.target,
    fov: spec.camera.fov,
    near: spec.camera.near,
    far: spec.camera.far
  }));

  // Tone mapping / exposure. Under `A3D_QR_CORE_OUTPUT` the C-05 surface
  // (`app.setOutput`) is the public selector and drives the real operator list;
  // flag-off keeps the legacy production bridge (single "aces" present path).
  const tmQuery = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const tmName = tmQuery.get("tm") ?? tmQuery.get("aura3d-tonemap");
  const expParam = tmQuery.get("exp") ?? tmQuery.get("aura3d-exp");
  const tmExposure = expParam === null ? NaN : Number(expParam);
  log.add("tone-mapping:aces-filmic", "supported", "C-05 `app.setOutput` selects the operator under A3D_QR_CORE_OUTPUT (aces is the frozen default); flag-off keeps the single \"aces\" present path.");
  log.add("tone-mapping:agx", tmName === "agx" ? "supported" : "partial", "A3D_QR_CORE_OUTPUT adds the r185 AgX operator via `app.setOutput`/?aura3d-tonemap; flag-off has no public selector.");
  log.add("tone-mapping:neutral", tmName === "neutral" ? "supported" : "partial", "A3D_QR_CORE_OUTPUT adds the Khronos PBR Neutral operator via `app.setOutput`; flag-off has no public selector.");
  log.add("exposure", "partial", "`app.setOutput({ exposure })` multiplies into u_exposure under A3D_QR_CORE_OUTPUT (spec.exposure stays un-wired: createAuraApp takes no exposure option).");

  // Environment
  if (spec.environment) {
    nodes.push(environments.hdri({
      texture: auraHdriAssets[spec.environment.hdri],
      intensity: spec.environment.intensity,
      rotation: spec.environment.rotation
    }));
  }

  // Lights
  const hasEnvironment = Boolean(spec.environment);
  const hasAmbient = spec.lights.some((light) => light.kind === "ambient");
  if (!hasEnvironment && !hasAmbient) {
    log.add("implicit-environment", "partial", "Scene declares neither environment nor ambient; the production bridge injects a generated environment preset chosen from node-name substrings.");
  }
  const shadowRequests = spec.lights.filter((light) => (light.kind === "directional" || light.kind === "spot") && light.castShadow);
  for (const light of spec.lights) {
    if (light.kind === "ambient") {
      if (hasEnvironment) log.add("ambient-with-environment", "missing", `Ambient "${light.name}" is ignored by the production bridge when an environment node exists.`);
      nodes.push(lights.ambient({ name: light.name, intensity: light.intensity, color: light.color }));
    } else if (light.kind === "directional") {
      nodes.push(lights.directional({ name: light.name, position: light.position, intensity: light.intensity, color: light.color, shadow: light.castShadow })
        .lookAt(light.target[0], light.target[1], light.target[2]));
    } else if (light.kind === "point") {
      nodes.push(lights.point({ name: light.name, position: light.position, intensity: light.intensity, color: light.color }));
      log.add(`point-light-range:${light.name}`, "partial", `lights.point() has no distance/decay option; production bridge uses fixed range 10 * scale (spec range ${light.range === 0 ? "infinite" : light.range}).`);
    } else {
      nodes.push(lights.spot({
        name: light.name,
        position: light.position,
        target: light.target,
        angle: light.angle,
        penumbra: light.penumbra,
        // Spec range 0 means physically infinite; Aura requires a finite distance, so the public default is used.
        ...(light.range > 0 ? { distance: light.range } : {}),
        intensity: light.intensity,
        color: light.color,
        shadow: light.castShadow
      }));
      if (light.range === 0) log.add(`spot-light-range:${light.name}`, "partial", "Spec asks for infinite range; lights.spot() distance is finite (public default 12 used).");
    }
  }
  if (shadowRequests.length > 1) {
    log.add("multiple-shadow-casters", "missing", `Spec requests ${shadowRequests.length} shadow casters (${shadowRequests.map((light) => light.name).join(", ")}); the production bridge has a single caster slot (resolveProductionShadowCasterIndex).`);
  }
  if (spec.shadows) {
    log.add("shadow-map-config", "missing", `No public mapSize/bias/normalBias/frustum options; spec asks mapSize ${spec.shadows.mapSize}, bias ${spec.shadows.bias}, normalBias ${spec.shadows.normalBias}, extent ${spec.shadows.directionalExtent}. Observed values are in extra.shadows.`);
  }
  if (spec.csm) {
    log.add("cascaded-shadow-maps", "partial", `No public CSM option (cascades/maxFar). Spec asks ${spec.csm.cascades} cascades to ${spec.csm.maxFar}; whatever the runtime submits is in extra.shadows.observed.`);
  }

  // Objects
  for (const object of spec.objects) {
    if (object.kind === "primitive") {
      let node = primitives[object.shape]({
        name: object.name,
        material: toAuraMaterial(object.material),
        size: object.size,
        castShadow: object.castShadow,
        receiveShadow: object.receiveShadow
      }).position(...object.position);
      if (object.rotation) node = node.rotate(...object.rotation);
      if (object.scale !== undefined) node = node.scale(object.scale);
      nodes.push(node);
    } else if (object.kind === "model") {
      let node = model(auraModelAssets[object.asset], {
        name: object.name,
        // Native glTF units, same as three.js. The default "normalized" mode rescales every model to 1.55 units.
        scaleMode: "world",
        castShadow: object.castShadow,
        receiveShadow: object.receiveShadow
      }).position(...object.position);
      if (object.rotation) node = node.rotate(...object.rotation);
      if (object.scale !== undefined) node = node.scale(object.scale);
      if (object.animation) {
        // loop:false + captureTime pins the sampled pose (resolveAnimationSeconds);
        // loop:true keeps the clip playing across captured frames (perf-tier).
        node = node.animate(object.animation.loop
          ? { clip: object.animation.clip, loop: true, startTime: object.animation.time }
          : { clip: object.animation.clip, loop: false, captureTime: object.animation.time });
        if (object.animation.footIk) {
          if (!spec.terrain) {
            throw new Error(`${spec.id}: animation.footIk requires SceneSpec.terrain for the analytic ground`);
          }
          // Runtime id the lane collector uses for nodes.get() → socket().
          node = node.runtime({ id: object.animation.footIk.runtimeId });
        } else if (object.animation.runtimeId !== undefined) {
          node = node.runtime({ id: object.animation.runtimeId });
        }
      }
      nodes.push(node);
    } else if (object.kind === "instanced") {
      nodes.push(instances[object.shape]({
        name: object.name,
        material: toAuraMaterial(object.material),
        size: object.size,
        castShadow: object.castShadow,
        receiveShadow: object.receiveShadow,
        transforms: object.transforms.map((transform) => ({
          position: transform.position,
          ...(transform.rotation ? { rotation: transform.rotation } : {}),
          ...(transform.scale !== undefined ? { scale: transform.scale } : {})
        })),
        ...(object.colors ? { colors: object.colors as readonly `#${string}`[] } : {})
      }));
    } else {
      nodes.push(effects.particles({
        name: object.name,
        particleCount: object.count,
        emitter: "fountain",
        radius: object.radius,
        height: object.height,
        color: object.color,
        materialMode: "additive-glow"
      }).position(...object.center));
      log.add("particles:seeded-positions", "missing", `effects.particles() generates positions internally; no seed or explicit position buffer, so the spec's seeded distribution (seed ${object.seed}) cannot be reproduced.`);
      log.add("particles:sprite-size", "missing", `No sprite size option (spec ${object.size}); engine sizeOverLife defaults used.`);
    }
  }

  if (spec.objects.some((object) => (object.kind === "primitive" || object.kind === "instanced") && (object.shape === "sphere" || object.shape === "cylinder"))) {
    log.add("primitive-tessellation", "missing", "primitives.sphere/cylinder expose no segment options; production meshes are fixed (sphere 16x12, cylinder 24 segments, no cylinder UVs/tangents). three.js side uses SphereGeometry(64x32), CylinderGeometry(48).");
  }

  if (spec.fog) {
    nodes.push(effects.fog({ density: spec.fog.density, color: spec.fog.color, intensity: 1 }));
    log.add("fog", "partial", "effects.fog() maps to exponential-squared fog but caps opacity at 0.25 + 0.55 * intensity (max 0.80), so distant geometry never fully fogs as FogExp2 does.");
  }
  if (spec.bloom) {
    nodes.push(effects.bloom({ intensity: spec.bloom.strength, radius: spec.bloom.radius, threshold: spec.bloom.threshold, quality: "cinematic" }));
    log.add("bloom", "partial", "effects.bloom() radius/threshold units are engine-specific; antiBlowout clamps intensity to <= 0.92 by default.");
  }

  // Lane-prd03 `postExtras` (Phase 4, lane-local — shared/types.ts is lane-12):
  // the authored post nodes the shared SceneSpec cannot carry.
  const postExtras = (spec as { postExtras?: Prd03PostExtrasLike }).postExtras;
  if (postExtras?.antiAlias) nodes.push(effects.antiAlias({ mode: postExtras.antiAlias }));
  if (postExtras?.motionBlur) {
    nodes.push(effects.motionBlur({
      ...(postExtras.motionBlur.intensity !== undefined ? { intensity: postExtras.motionBlur.intensity } : {}),
      ...(postExtras.motionBlur.shutter !== undefined ? { shutter: postExtras.motionBlur.shutter } : {}),
      ...(postExtras.motionBlur.maxBlur !== undefined ? { maxBlur: postExtras.motionBlur.maxBlur } : {}),
      ...(postExtras.motionBlur.samples !== undefined ? { samples: postExtras.motionBlur.samples } : {}),
      ...(postExtras.motionBlur.tileSize !== undefined ? { tileSize: postExtras.motionBlur.tileSize } : {}),
      ...(postExtras.motionBlur.timeScale !== undefined ? { timeScale: postExtras.motionBlur.timeScale } : {})
    }));
  }
  if (postExtras?.depthOfField) {
    nodes.push(effects.depthOfField({
      ...(postExtras.depthOfField.focusDistance !== undefined ? { focusDistance: postExtras.depthOfField.focusDistance } : {}),
      ...(postExtras.depthOfField.fStop !== undefined ? { fStop: postExtras.depthOfField.fStop } : {}),
      ...(postExtras.depthOfField.focalLength !== undefined ? { focalLength: postExtras.depthOfField.focalLength } : {})
    }));
  }

  for (const node of nodes) built.add(node);
  return built;
}

/** Structural mirror of `Prd03PostExtras` in `scenes/prd03/specs.ts` (kept inline so common.ts does not import lane spec files). The engine node accepts only `fxaa`/`taa`/`off` (msaa/smaa were dropped from `AuraEffectNode.mode`). */
interface Prd03PostExtrasLike {
  readonly antiAlias?: "fxaa" | "taa" | "off";
  readonly motionBlur?: {
    readonly intensity?: number;
    readonly shutter?: number;
    readonly maxBlur?: number;
    readonly samples?: number;
    readonly tileSize?: number;
    readonly timeScale?: number;
  };
  readonly depthOfField?: {
    readonly focusDistance?: number;
    readonly fStop?: number;
    readonly focalLength?: number;
  };
  readonly cameraPan?: {
    readonly from: { readonly position: readonly number[]; readonly target: readonly number[] };
    readonly to: { readonly position: readonly number[]; readonly target: readonly number[] };
  };
  readonly cameraCut?: { readonly at: number; readonly position: readonly number[]; readonly target: readonly number[] };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function nextFrame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

interface RendererDiagnosticsShape {
  readonly warnings?: readonly string[];
  readonly exposure?: { readonly category?: string; readonly exposure?: number };
  readonly toneMapping?: string;
  readonly environment?: { readonly iblPixelBacked?: boolean; readonly hdriStatus?: string; readonly preset?: string };
  readonly shadows?: Readonly<Record<string, unknown>>;
  readonly bloom?: Readonly<Record<string, unknown>>;
  readonly runtime?: { readonly backend?: string };
  readonly lighting?: { readonly fallbackLightsActive?: boolean };
  readonly appliedLook?: { readonly exposure?: number; readonly toneMapping?: string };
}

function rendererDiagnostics(app: AuraApp): RendererDiagnosticsShape | undefined {
  return app.diagnostics().renderer as unknown as RendererDiagnosticsShape | undefined;
}

export async function runAuraScene(rawSpec: SceneSpec, host: HTMLElement, opts: RunOptions = {}): Promise<ReadyPayload> {
  const started = performance.now();
  installFetchDedupe();
  const log = new CapabilityLog();
  const variant = opts.variant ?? "default";
  const spec = applyVariantSpec(rawSpec, variant);
  if (variant !== "default" && variant !== "aura3d-tuned") {
    log.add(`variant:${variant}`, "supported", "Broken-control variant applied through the public API.");
  }
  const builtScene = buildAuraScene(spec, log);
  const app = createAuraApp(host, {
    scene: builtScene,
    // T0-13: only qualityProfile — renderer.mode/renderer.fallback are not
    // public keys and A3D_QR_STRICT throws AuraMigrationError on them.
    // resolveRendererQualityProfile("production").rendererMode === "production".
    renderer: { qualityProfile: "production" },
    pixelRatio: (variant === "dpr-half" ? 0.5 : 1) * (opts.dpr ?? spec.resolution.devicePixelRatio),
    resize: false,
    autoStart: false,
    // createAuraApp resolves flags from options only — a URL ?a3d-qr list is
    // never consulted once the app installs its resolved set, so lane scenes
    // must pass spec/harness qrFlags through here (e.g. "animation" for the
    // prd06 actor-extension onLoad publishes + handle.animation sources).
    ...((opts.qrFlags ?? spec.qrFlags)?.length
      ? { qualityRebuild: { flags: [...(opts.qrFlags ?? spec.qrFlags)!] } }
      : {})
  });
  await app.ready();

  // PRD-01 Phase 5: `tm`/`exp` (or `aura3d-tonemap`/`aura3d-exp`) select the
  // output operator through the C-05 surface — the base-scene A/B wiring.
  const runQuery = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const runTm = runQuery.get("tm") ?? runQuery.get("aura3d-tonemap");
  const runExpParam = runQuery.get("exp") ?? runQuery.get("aura3d-exp");
  const runExposure = runExpParam === null ? NaN : Number(runExpParam);
  if (runTm !== null || Number.isFinite(runExposure)) {
    app.setOutput?.({
      ...(runTm !== null ? { toneMapping: runTm as "aces" | "agx" | "neutral" | "none" | "linear" | "reinhard" } : {}),
      ...(Number.isFinite(runExposure) ? { exposure: runExposure } : {})
    });
  }

  // T0-10: the adapter must conclude inside the page's waitForFunction window,
  // so every wait below is capped at 0.8 × the capture timeout capture.mjs
  // forwards as ?timeout=<ms> (default 240 s).
  const adapterDeadline = performance.now() + adapterBudgetMs(Number(runQuery.get("timeout")) || DEFAULT_CAPTURE_TIMEOUT_MS);

  // Wait for the first real draw (all typed GLBs are loaded by the mount).
  // T0-10: fail fast — a mount/renderer failure (errors recorded, zero draws)
  // throws immediately, and a dead pipeline with zero errors throws
  // NoDrawError on deadline; either way the page publishes __QR_ERROR__ and
  // capture.mjs records the real failure instead of a masked ready/timeout.
  await waitForFirstDraw(app, Math.max(1, Math.min(90_000, adapterDeadline - performance.now())));

  // PRD-06 T3.9: spec-declared `animation.footIk` registers the foot-ik pose
  // constraint on the actor once it is loaded (draw-wait above guarantees the
  // mount); the analytic GroundRaycaster comes from the shared terrain spec.
  for (const object of spec.objects) {
    if (object.kind !== "model" || !object.animation?.footIk) continue;
    const terrain = spec.terrain!;
    const handle = app.nodes.get(object.animation.footIk.runtimeId);
    if (!handle) {
      log.add(`footIk:${object.name}`, "missing", `runtime node "${object.animation.footIk.runtimeId}" not found`);
      continue;
    }
    const extension = nodeHandleExtensionFor("animation");
    const animationApi = extension?.create(handle, app) as AuraActorAnimationApi | undefined;
    if (!animationApi?.ik) {
      log.add(`footIk:${object.name}`, "missing", "node.animation.ik unavailable (A3D_QR_ANIMATION off or non-model node)");
      continue;
    }
    try {
      animationApi.ik.add({
        kind: "foot-ik",
        legs: object.animation.footIk.legs.map((leg) => ({
          root: leg.hip,
          mid: leg.knee,
          tip: leg.ankle,
          ...(leg.ankleHeight !== undefined ? { ankleHeight: leg.ankleHeight } : {})
        })),
        // The constraint + socket matrices live in the actor's own space; wrap
        // the world-space heightfield with the model node's transform so feet
        // plant on the terrain under the model, not at the origin.
        ground: createHeightFieldGround(
          // The solver raycasts in the actor's model space (mm.col-major mount
          // transform inverts to world units); wrap the world-space heightAt.
          modelSpaceHeightAt((x: number, z: number) => rampStairsHeightAt(terrain, x, z), object)
        ),
        ...(object.animation.footIk.pelvis !== undefined ? { pelvis: object.animation.footIk.pelvis } : {})
      });
      log.add(`footIk:${object.name}`, "supported", `ik.add foot-ik, ${object.animation.footIk.legs.length} legs on analytic terrain`);
    } catch (error) {
      log.add(`footIk:${object.name}`, "missing", `ik.add threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // PRD-06 T4.1/§13: spec-declared `animation.springChains` register spring-bone
  // constraints on the actor (after foot-IK, so springs see the post-IK pose).
  for (const object of spec.objects) {
    if (object.kind !== "model" || !object.animation?.springChains?.length) continue;
    const runtimeId = object.animation.runtimeId ?? object.animation.footIk?.runtimeId;
    const handle = runtimeId !== undefined ? app.nodes.get(runtimeId) : undefined;
    if (!handle) {
      log.add(`springChains:${object.name}`, "missing", `runtime node "${runtimeId ?? "(none)"}" not found`);
      continue;
    }
    const extension = nodeHandleExtensionFor("animation");
    const animationApi = extension?.create(handle, app) as AuraActorAnimationApi | undefined;
    if (!animationApi?.springBones) {
      log.add(`springChains:${object.name}`, "missing", "node.animation.springBones unavailable (A3D_QR_ANIMATION off or non-model node)");
      continue;
    }
    try {
      animationApi.springBones.add({ chains: object.animation.springChains });
      log.add(`springChains:${object.name}`, "supported", `springBones.add, ${object.animation.springChains.length} chains`);
    } catch (error) {
      log.add(`springChains:${object.name}`, "missing", `springBones.add threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Wait for the HDRI chain to swap in (or fail loudly). T0-10: bounded by
  // the adapter deadline and abandoned on recorded errors — after a failed
  // mount the chain can never resolve.
  if (spec.environment) {
    const hdriDeadline = Math.min(performance.now() + 180_000, adapterDeadline);
    while (performance.now() < hdriDeadline) {
      const environment = rendererDiagnostics(app)?.environment;
      if (environment?.iblPixelBacked || environment?.hdriStatus === "ready" || environment?.hdriStatus === "fallback") break;
      if (app.diagnostics().errors.length > 0) break;
      app.step(0);
      await sleep(100);
    }
    const environment = rendererDiagnostics(app)?.environment;
    log.add("hdri-ibl", environment?.iblPixelBacked ? "supported" : "missing", `environments.hdri(): hdriStatus=${environment?.hdriStatus ?? "unknown"} iblPixelBacked=${String(environment?.iblPixelBacked ?? false)}`);
  }

  // Advance simulated time to the capture time, then settle.
  // Lane-prd03 `postExtras` camera moves (Phase 4): a `cameraPan` lerps the
  // presented pose at 60 fps across spec.time; a `cameraCut` fires one
  // `setPose({cut:true})` + `app.cutCamera()` (C-14 temporal reset) at `at`
  // seconds. Specs without extras keep the single-step behavior.
  const postExtras = (spec as { postExtras?: Prd03PostExtrasLike }).postExtras;
  const cameraCtl = (app as { camera?: { setPose?: (p: { position: readonly number[]; target: readonly number[] }, o?: { cut?: boolean }) => void } }).camera;
  const cameraNode = (app as { nodes?: { all(): readonly { kind: string; setPosition(x: number, y: number, z: number): unknown }[] } })
    .nodes?.all().find((node) => node.kind === "camera");
  const lerp3 = (a: readonly number[], b: readonly number[], t: number): readonly number[] =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // Position-pan fallback for the pre-C-22 surface: setPosition on the runtime
  // camera node (the target stays fixed → the pan is a yaw — what the velocity
  // probes measure). When `app.camera.setPose` lands it takes over for
  // position+target pans.
  const moveCamera = (position: readonly number[], target: readonly number[], cut: boolean) => {
    if (cameraCtl?.setPose) {
      cameraCtl.setPose({ position, target }, { cut });
    } else if (cameraNode?.setPosition) {
      cameraNode.setPosition(position[0], position[1], position[2]);
      if (cut) (app as { cutCamera?: () => void }).cutCamera?.();
    }
    return cameraCtl?.setPose !== undefined || cameraNode?.setPosition !== undefined;
  };
  if (postExtras?.cameraPan || postExtras?.cameraCut) {
    if (cameraCtl?.setPose === undefined && cameraNode?.setPosition === undefined) {
      log.add("camera-pan", "missing", "postExtras cameraPan/cameraCut has no runtime camera surface (C-22 app.camera and app.nodes camera node both absent) — camera stays at spec pose");
    }
    const dt = 1 / 60;
    let cutDone = false;
    for (let t = 0; t < spec.time - 1e-9; t += dt) {
      const advance = Math.min(dt, spec.time - t);
      const at = Math.min(1, (t + advance) / spec.time);
      if (postExtras.cameraPan) {
        moveCamera(
          lerp3(postExtras.cameraPan.from.position, postExtras.cameraPan.to.position, at),
          lerp3(postExtras.cameraPan.from.target, postExtras.cameraPan.to.target, at),
          false
        );
      }
      if (!cutDone && postExtras.cameraCut && t + advance >= postExtras.cameraCut.at) {
        moveCamera(postExtras.cameraCut.position, postExtras.cameraCut.target, true);
        (app as { cutCamera?: () => void }).cutCamera?.();
        cutDone = true;
      }
      app.step(advance);
      await nextFrame();
    }
    if (postExtras.cameraCut && !cutDone) {
      log.add("camera-cut", "missing", `cameraCut.at ${postExtras.cameraCut.at} exceeds spec.time ${spec.time}; cut never fired`);
    }
  } else {
    app.step(spec.time);
  }
  for (let frame = 0; frame < spec.settleFrames; frame += 1) {
    await nextFrame();
    app.step(0);
  }
  await nextFrame();

  // PRD-01 Phase 6 (§15/I8): the flagged path must compile nothing after
  // ready+settle — read the C-31 programs section before and after an extra
  // window so a warmup straggler can't hide behind the settle loop.
  const programsBefore = (app.diagnostics() as unknown as { programs?: { deviceProgramCompiles?: number | null } }).programs?.deviceProgramCompiles ?? null;
  for (let frame = 0; frame < 30; frame += 1) {
    app.step(0);
    await nextFrame();
  }
  const programsAfter = (app.diagnostics() as unknown as { programs?: { deviceProgramCompiles?: number | null } }).programs?.deviceProgramCompiles ?? null;
  if (programsBefore !== null || programsAfter !== null) {
    const delta = (programsAfter ?? 0) - (programsBefore ?? 0);
    log.add("zero-program-compiles", delta === 0 ? "supported" : "missing", `programCompiles delta ${delta} over 30 extra frames`);
  }

  const diagnostics = app.diagnostics();
  const renderer = rendererDiagnostics(app);
  const assetErrors = diagnostics.assets.filter((asset) => asset.status !== "ready");
  for (const asset of assetErrors) log.add(`asset:${asset.id}`, "missing", `${asset.status}: ${asset.message ?? ""}`);
  log.add("renderer-backend", renderer?.runtime?.backend === "production-runtime" ? "supported" : "partial", `mounted backend: ${renderer?.runtime?.backend ?? diagnostics.backend}`);
  if (spec.shadows && renderer?.shadows) {
    const shadows = renderer.shadows as { mapRendered?: boolean; mapSampled?: boolean };
    log.add("shadow-map", shadows.mapRendered && shadows.mapSampled ? "supported" : "missing", `mapRendered=${String(shadows.mapRendered)} mapSampled=${String(shadows.mapSampled)}`);
  }
  if (spec.bloom && renderer?.bloom) {
    log.add("bloom-pass", renderer.bloom.rendered ? "supported" : "missing", `bloom.rendered=${String(renderer.bloom.rendered)}`);
  }

  const rendererShadows = renderer?.shadows as { mapRendered?: boolean; mapSampled?: boolean; mapSize?: number; strength?: number; casterName?: string } | undefined;
  const assetHashes: Record<string, string> = {};
  for (const object of spec.objects) {
    if (object.kind === "model") assetHashes[object.asset] = modelAssets[object.asset as ModelAssetId].sha256;
  }
  if (spec.environment) assetHashes[spec.environment.hdri] = hdriAssets[spec.environment.hdri].sha256;
  if (spec.background.kind === "hdri") assetHashes[spec.background.hdri] = hdriAssets[spec.background.hdri].sha256;

  // C-30 ReadyPayloadV2: appliedLook/fallbackLights come from diagnostics()
  // (C-31 sections by lanes 05/12); wherever the stub reports null, null stays null.
  const appliedLook = renderer?.appliedLook;
  const fallbackLights = renderer?.lighting?.fallbackLightsActive ?? null;

  return {
    engine: "aura3d",
    scene: spec.id,
    engineVersion: __AURA3D_VERSION__,
    capabilityLog: log.entries,
    drawCalls: diagnostics.drawCalls,
    warnings: [...diagnostics.warnings, ...(renderer?.warnings ?? [])],
    errors: [...diagnostics.errors],
    loadMs: Math.round(performance.now() - started),
    variant,
    dpr: opts.dpr ?? 1,
    appliedExposure: appliedLook?.exposure ?? null,
    appliedToneMapping: appliedLook?.toneMapping ?? renderer?.toneMapping ?? null,
    lightUnits: renderer ? "aura-internal" : "unknown",
    shadows: rendererShadows ? {
      mapRendered: rendererShadows.mapRendered ?? false,
      mapSampled: rendererShadows.mapSampled ?? false,
      mapSize: rendererShadows.mapSize ?? null,
      strength: rendererShadows.strength ?? null,
      casterName: rendererShadows.casterName ?? null
    } : null,
    fallbackLightsActive: fallbackLights,
    assetHashes,
    qrFlags: opts.qrFlags ?? spec.qrFlags ?? [],
    extra: {
      ...(await opts.collectExtra?.(app) ?? {}),
      backend: diagnostics.backend,
      renderSize: diagnostics.renderSize,
      reportedToneMapping: renderer?.toneMapping,
      reportedExposure: renderer?.exposure,
      environment: renderer?.environment,
      shadows: renderer?.shadows,
      bloom: renderer?.bloom,
      assets: diagnostics.assets.map((asset) => ({ id: asset.id, status: asset.status }))
    }
  };
}
