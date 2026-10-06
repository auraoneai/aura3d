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
  primitives,
  scene,
  type AuraApp,
  type AuraMaterialSpec,
  type AuraNodeInput
} from "@aura3d/engine";
import { hdriAssets, modelAssets, type HdriAssetId, type ModelAssetId } from "../shared/assets";
import { installFetchDedupe } from "../shared/fetch-once";
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
}

export class NotExpressibleVariantError extends Error {
  readonly variant: string;
  constructor(variant: string) {
    super(`broken-control ${variant} not expressible via the Aura public API`);
    this.name = "NotExpressibleVariantError";
    this.variant = variant;
  }
}

const AURA_EXPRESSIBLE_VARIANTS: ReadonlySet<string> = new Set(["no-shadows", "no-ibl", "dpr-half", "flat-sky"]);

function applyVariantSpec(spec: SceneSpec, variant: string | undefined): SceneSpec {
  if (!variant || variant === "default" || variant === "aura3d-tuned") return spec;
  if (!AURA_EXPRESSIBLE_VARIANTS.has(variant)) throw new NotExpressibleVariantError(variant);
  if (variant === "no-shadows") {
    return { ...spec, lights: spec.lights.map((light) => ("castShadow" in light ? { ...light, castShadow: false } : light)) };
  }
  if (variant === "no-ibl") {
    return { ...spec, environment: spec.environment ? { ...spec.environment, intensity: 0 } : spec.environment };
  }
  if (variant === "flat-sky") {
    if (spec.background.kind !== "hdri") return spec;
    return { ...spec, background: { kind: "color", color: spec.background.fallbackColor } };
  }
  return spec;
}

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
  cesiumMan: modelDefinition("cesiumMan"),
  fox: modelDefinition("fox"),
  rockA: modelDefinition("rockA"),
  rockB: modelDefinition("rockB"),
  crate: modelDefinition("crate")
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

  // Tone mapping / exposure
  log.add("tone-mapping:aces-filmic", "supported", "Production bridge submits operator \"aces\"; no public option to select an operator.");
  log.add("tone-mapping:agx", "missing", "No public tone-mapping selector; AuraRendererDiagnosticReport.toneMapping is typed as the literal \"aces-filmic\".");
  log.add("tone-mapping:neutral", "missing", "No public tone-mapping selector (Khronos PBR Neutral unavailable).");
  log.add("exposure", spec.exposure === 1 ? "partial" : "missing", "createAuraApp has no exposure option; the production bridge hard-codes toneMapping.exposure = 1 while diagnostics report a name-inferred category exposure preset (see extra.reportedExposure). effects.colorGrade({ exposure }) is recorded but not executed.");

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
        // loop:false + captureTime pins the sampled pose (resolveAnimationSeconds).
        node = node.animate({ clip: object.animation.clip, loop: false, captureTime: object.animation.time });
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

  for (const node of nodes) built.add(node);
  return built;
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
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    pixelRatio: (variant === "dpr-half" ? 0.5 : 1) * (opts.dpr ?? spec.resolution.devicePixelRatio),
    resize: false,
    autoStart: false
  });
  await app.ready();

  // Wait for the first real draw (all typed GLBs are loaded by the mount).
  const drawDeadline = performance.now() + 90_000;
  while (performance.now() < drawDeadline) {
    app.step(0);
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 || diagnostics.errors.length > 0) break;
    await sleep(50);
  }

  // Wait for the HDRI chain to swap in (or fail loudly).
  if (spec.environment) {
    const hdriDeadline = performance.now() + 180_000;
    while (performance.now() < hdriDeadline) {
      const environment = rendererDiagnostics(app)?.environment;
      if (environment?.iblPixelBacked || environment?.hdriStatus === "ready" || environment?.hdriStatus === "fallback") break;
      app.step(0);
      await sleep(100);
    }
    const environment = rendererDiagnostics(app)?.environment;
    log.add("hdri-ibl", environment?.iblPixelBacked ? "supported" : "missing", `environments.hdri(): hdriStatus=${environment?.hdriStatus ?? "unknown"} iblPixelBacked=${String(environment?.iblPixelBacked ?? false)}`);
  }

  // Advance simulated time to the capture time, then settle.
  app.step(spec.time);
  for (let frame = 0; frame < spec.settleFrames; frame += 1) {
    await nextFrame();
    app.step(0);
  }
  await nextFrame();

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
