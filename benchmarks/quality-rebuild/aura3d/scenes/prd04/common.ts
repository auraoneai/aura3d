/**
 * PRD-04 Aura3D translator: Prd04SceneSpec -> `@aura3d/engine` public API.
 * Lane-local mirror of the shared translator with lane extensions (variants,
 * materialOverrides tint, texture maps on primitives). Everything the API
 * cannot express lands in the capability log; nothing is tuned per-scene.
 *
 * P7 probe controls (§15.x): `quality` (C-27 tier before settle), `strip`
 * (camera.path orbit + per-frame luma capture), `tint` (#hex override or
 * "none" suppression — the flag decides multiply-override vs legacy tint),
 * `lightsOff` (drop one named light), `pixels` (decoded frame on extra.frame).
 */
import {
  camera,
  createAuraApp,
  defineAuraAssets,
  environments,
  lights,
  material,
  model,
  primitives,
  scene,
  resolveQrFlags,
  type AuraApp,
  type AuraMaterialSpec,
  type AuraNodeInput,
  type AuraVec3
} from "@aura3d/engine";
import { setTypedGLBActorQrFlags, setTypedGLBActorQrTransmissionMode, registeredTypedGLBActors } from "@aura3d/engine/lanes";
import { prd04TransmissionDiagnostics, resolveSamplerAnisotropy, setRendererQrFlags } from "@aura3d/rendering";
import { decodePngDataUrl, lumaMap, rowProfileSpike, temporalLumaStddev } from "../../../scenes/prd04/metrics";
import { expandPrd04FlagList } from "../../../scenes/prd04/flags";
import { hdriAssets } from "../../../shared/assets";
import type { CapabilityEntry, CapabilityStatus, ReadyPayload } from "../../../shared/types";
import { prd04ModelAssets, prd04TextureAssets } from "../../../scenes/prd04/assets";
import type { Prd04SceneSpec } from "../../../scenes/prd04/spec";

declare const __AURA3D_VERSION__: string;

const assetUrl = (repoPath: string): string => `/${repoPath}`;

class CapabilityLog {
  readonly entries: CapabilityEntry[] = [];
  add(feature: string, status: CapabilityStatus, detail: string): void {
    this.entries.push({ feature, status, detail });
  }
}

const auraHdriAssets = defineAuraAssets(
  Object.fromEntries(
    Object.values(hdriAssets).map((entry) => [
      entry.id,
      {
        type: "texture" as const,
        format: "hdr",
        url: assetUrl(entry.repoPath),
        hash: entry.sha256,
        metadata: { license: entry.provenance, sourcePath: entry.repoPath }
      }
    ])
  ) as never
);

const auraModelAssets = defineAuraAssets(
  Object.fromEntries(
    Object.values(prd04ModelAssets).map((entry) => [
      entry.id,
      {
        type: "model" as const,
        format: "glb",
        url: assetUrl(entry.repoPath),
        hash: entry.sha256,
        bounds: entry.worldSize,
        metadata: { license: entry.provenance, sourcePath: entry.repoPath }
      }
    ])
  ) as never
);

const auraTextureAssets = defineAuraAssets(
  Object.fromEntries(
    Object.values(prd04TextureAssets).flatMap((set) =>
      Object.entries(set.maps).map(([slot, map]) => [
        `${set.id}.${slot}`,
        {
          type: "texture" as const,
          format: "png",
          url: assetUrl(map.repoPath),
          hash: map.sha256,
          metadata: { license: set.provenance, sourcePath: map.repoPath }
        }
      ])
    )
  ) as never
);

export interface Prd04AuraSceneOptions {
  readonly transmission?: "auto" | "env" | "off";
  /** Set the C-27 quality tier after create (e.g. `?quality=medium` for S9). */
  readonly quality?: "low" | "medium" | "high" | "ultra";
  /** Drive `spec.strip`: orbit the camera ±`orbitDegrees`/2 while capturing. */
  readonly strip?: boolean;
  /** `#rrggbb` overrides spec tints; `"none"` suppresses them entirely. */
  readonly tint?: string;
  /** Drop the named light before compile (light-count isolation probe). */
  readonly lightsOff?: string;
  /** Include the settled frame's decoded RGBA pixels on `extra.frame`. */
  readonly pixels?: boolean;
}

/** Rotate `position` around `target` on the Y axis by `degrees`. */
function orbitY(position: AuraVec3, target: AuraVec3, degrees: number): AuraVec3 {
  const rad = (degrees * Math.PI) / 180;
  const dx = position[0] - target[0];
  const dz = position[2] - target[2];
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [target[0] + dx * cos - dz * sin, position[1], target[2] + dx * sin + dz * cos];
}

function buildScene(spec: Prd04SceneSpec, log: CapabilityLog, options: Prd04AuraSceneOptions) {
  const built = scene();

  if (spec.background.kind === "color") {
    built.background(spec.background.color);
  } else {
    built.background(spec.background.fallbackColor);
    log.add("hdri-background", "missing", "scene().background() accepts only a color; rendered fallback color.");
  }

  const strip = options.strip === true && spec.strip !== undefined;
  if (strip) {
    const half = spec.strip!.orbitDegrees / 2;
    const seconds = Math.max(0.1, (spec.strip!.frames * spec.strip!.intervalMs) / 1000);
    built.camera(
      camera.path({
        from: orbitY(spec.camera.position, spec.camera.target, -half),
        to: orbitY(spec.camera.position, spec.camera.target, half),
        target: spec.camera.target,
        seconds,
        easing: "linear"
      })
    );
    log.add("camera:strip-orbit", "supported", `camera.path ±${half}° over ${seconds}s (frames=${spec.strip!.frames})`);
  } else {
    built.camera(
      camera.perspective({
        position: spec.camera.position,
        target: spec.camera.target,
        fov: spec.camera.fov,
        near: spec.camera.near,
        far: spec.camera.far
      })
    );
  }
  log.add("tone-mapping:aces-filmic", "supported", "production bridge submits operator aces; exposure pinned 1");

  const nodes: AuraNodeInput[] = [];
  if (spec.environment) {
    nodes.push(
      environments.hdri({
        texture: (auraHdriAssets as Record<string, never>)[spec.environment.hdri],
        intensity: spec.environment.intensity,
        rotation: spec.environment.rotation
      })
    );
  }
  for (const light of spec.lights) {
    if (options.lightsOff !== undefined && light.name === options.lightsOff) {
      log.add(`light:${light.name}`, "supported", `light ${light.name} suppressed by ?lightsOff (probe control)`);
      continue;
    }
    if (light.kind === "ambient") {
      nodes.push(lights.ambient({ name: light.name, intensity: light.intensity, color: light.color }));
    } else if (light.kind === "directional") {
      nodes.push(
        lights
          .directional({ name: light.name, position: light.position, intensity: light.intensity, color: light.color, shadow: light.castShadow })
          .lookAt(...light.target)
      );
    } else if (light.kind === "point") {
      nodes.push(lights.point({ name: light.name, position: light.position, intensity: light.intensity, color: light.color }));
      log.add(`point-light-range:${light.name}`, "partial", "lights.point() has no range option");
    } else {
      nodes.push(
        lights.spot({
          name: light.name,
          position: light.position,
          target: light.target,
          angle: light.angle,
          penumbra: light.penumbra,
          intensity: light.intensity,
          color: light.color,
          shadow: light.castShadow
        })
      );
    }
  }

  for (const object of spec.objects) {
    if (object.kind === "primitive") {
      const maps = object.textureMaps;
      if (maps?.anisotropy === "tier") {
        log.add("texture-anisotropy:tier", "partial", "anisotropy 'tier' leaves the API default (8)");
      }
      const materialSpec: AuraMaterialSpec = {
        color: object.material.color,
        roughness: object.material.roughness,
        metallic: object.material.metalness,
        metalness: object.material.metalness,
        ...(maps
          ? {
              texture: auraTextureAssets[`${maps.textureSet}.color` as keyof typeof auraTextureAssets],
              normal: auraTextureAssets[`${maps.textureSet}.normal` as keyof typeof auraTextureAssets],
              roughnessMap: auraTextureAssets[`${maps.textureSet}.roughness` as keyof typeof auraTextureAssets],
              metalnessMap: auraTextureAssets[`${maps.textureSet}.metalness` as keyof typeof auraTextureAssets],
              ...(maps.anisotropy !== "tier" ? { textureAnisotropy: maps.anisotropy } : {}),
              texTransforms: {
                baseColor: { scale: [maps.repeat, maps.repeat] as [number, number] },
                normal: { scale: [maps.repeat, maps.repeat] as [number, number] },
                metallicRoughness: { scale: [maps.repeat, maps.repeat] as [number, number] }
              }
            }
          : {})
      };
      if (maps) {
        log.add("texture-maps", "supported", `${maps.textureSet} repeat=${maps.repeat} aniso=${maps.anisotropy}`);
      }
      nodes.push(
        primitives.plane({
          name: object.name,
          material: material.pbr(materialSpec),
          size: object.size,
          castShadow: object.castShadow,
          receiveShadow: object.receiveShadow
        }).position(...object.position)
      );
    } else {
      const asset = (auraModelAssets as Record<string, never>)[object.asset];
      // `material.color` on a GLB model routes through the C-15 tint bridge:
      // flag-on it becomes a multiply materialOverride (maps preserved),
      // flag-off it becomes the legacy tint (emissive glow). That contrast is
      // exactly what the S3 control measures — do NOT split the write path.
      const tint = options.tint === "none" ? undefined : options.tint ?? object.tint?.color;
      const emissive = options.tint === "none" ? undefined : object.tint?.emissiveColor;
      let node = model(asset, {
        name: object.name,
        scaleMode: "world",
        castShadow: object.castShadow,
        receiveShadow: object.receiveShadow,
        ...(object.variant ? { variant: object.variant } : {}),
        ...(tint ? { material: { color: tint, ...(emissive ? { emissive } : {}) } } : {})
      }).position(...object.position);
      if (object.rotation) node = node.rotate(...object.rotation);
      if (object.scale !== undefined) node = node.scale(object.scale);
      if (object.variant) log.add(`variant:${object.name}`, "partial", "model({variant}) passed; stub path (E29/E30) may drop it — recorded via inspectMaterials");
      if (tint) log.add(`tint:${object.name}`, "partial", "material.color passed; C-15 bridge → overrides (flag-on) or legacy tint (flag-off)");
      nodes.push(node);
    }
  }
  for (const node of nodes) built.add(node);
  return built;
}

interface RendererDiagnosticsShape {
  readonly warnings?: readonly string[];
  readonly environment?: { readonly iblPixelBacked?: boolean; readonly hdriStatus?: string };
  readonly runtime?: { readonly backend?: string };
}

const nextFrame = (): Promise<void> => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export async function runPrd04AuraScene(
  spec: Prd04SceneSpec,
  host: HTMLElement,
  qrFlags: readonly string[] = [],
  options: Prd04AuraSceneOptions = {}
): Promise<ReadyPayload> {
  const started = performance.now();
  const log = new CapabilityLog();
  // Stage marker: the capture spec surfaces `window.__QR_STAGE__` on timeouts so a
  // hung page reports WHERE it wedged instead of a bare waitForFunction error.
  const stage = (s: string) => { (window as { __QR_STAGE__?: string }).__QR_STAGE__ = s; };
  stage("flags");
  // Lane-04 seams until lane-15 wires them inside createAuraApp (qr-request):
  // `qualityRebuild.flags` is resolved again for the actor path (createAuraApp
  // resolves it for renderer extensions only), and `renderer.transmission`
  // resolves through `setTypedGLBActorQrTransmissionMode`.
  // `all,-x` leave-one-out runs need the expander — applyList can't express an
  // `all` token inside a comma list (qr-request to:prd15).
  const flagInput = expandPrd04FlagList(qrFlags);
  const resolvedFlags = resolveQrFlags({ options: flagInput });
  setTypedGLBActorQrFlags(resolvedFlags);
  setRendererQrFlags(resolvedFlags);
  setTypedGLBActorQrTransmissionMode(options.transmission);
  host.style.width = `${spec.resolution.width}px`;
  host.style.height = `${spec.resolution.height}px`;

  stage("create-app");
  const app: AuraApp = createAuraApp(host, {
    scene: buildScene(spec, log, options),
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    pixelRatio: spec.resolution.devicePixelRatio,
    // createAuraApp's flags field is `readonly string[]` (lane-15 signature) —
    // it resolves for renderer extensions only; the actor seams above carry the
    // expanded object so `all,-x` still reaches the materials path correctly.
    ...(qrFlags.length > 0 ? { qualityRebuild: { flags: qrFlags } } : {}),
    resize: false,
    autoStart: false
  });
  stage("app-ready");
  await app.ready();
  if (options.quality !== undefined && app.quality) {
    await app.quality.set(options.quality);
    log.add("quality-tier", "supported", `app.quality.set("${options.quality}") applied before settle`);
  }

  stage("first-draw");
  const drawDeadline = performance.now() + 90_000;
  while (performance.now() < drawDeadline) {
    app.step(0);
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 || diagnostics.errors.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (spec.environment) {
    stage("hdri");
    const hdriDeadline = performance.now() + 180_000;
    while (performance.now() < hdriDeadline) {
      const environment = (app.diagnostics().renderer as unknown as RendererDiagnosticsShape | undefined)?.environment;
      if (environment?.iblPixelBacked || environment?.hdriStatus === "ready" || environment?.hdriStatus === "fallback") break;
      app.step(0);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  stage("settle");
  app.step(spec.time);
  for (let frame = 0; frame < spec.settleFrames; frame += 1) {
    await nextFrame();
    app.step(0);
  }
  await nextFrame();

  // P7/S6 strip capture: `spec.strip.frames` luma maps at `intervalMs` steps
  // while the camera.path orbit sweeps ±orbitDegrees/2.
  let stripReport: Record<string, unknown> | undefined;
  const wantStrip = options.strip === true && spec.strip !== undefined;
  const frameLumas: Float32Array[] = [];
  let stripMask: Uint8Array | undefined;
  let stripWidth = 0;
  let stripHeight = 0;
  if (wantStrip) {
    const interval = spec.strip!.intervalMs / 1000;
    for (let i = 0; i < spec.strip!.frames; i++) {
      app.step(interval);
      await nextFrame();
      const shot = app.screenshot();
      const decoded = await decodePngDataUrl(shot.dataUrl);
      frameLumas.push(lumaMap(decoded.pixels));
      if (i === spec.strip!.frames - 1) {
        stripWidth = decoded.width;
        stripHeight = decoded.height;
        stripMask = new Uint8Array(decoded.pixels.length / 4);
        for (let p = 0; p < stripMask.length; p++) {
          // Ground-plane subject mask: any pixel brighter than the hdri sky
          // floor. The plane fills the lower ~half of the frame at this camera.
          const l = frameLumas[i]![p]!;
          stripMask[p] = l > 0.02 && p >= Math.floor(stripMask.length * 0.45) ? 1 : 0;
        }
      }
    }
    const far = temporalLumaStddev(frameLumas, stripWidth, stripHeight, stripMask!, 1 / 3, "bottom");
    const near = temporalLumaStddev(frameLumas, stripWidth, stripHeight, stripMask!, 1 / 3, "top");
    stripReport = {
      frames: spec.strip!.frames,
      intervalMs: spec.strip!.intervalMs,
      orbitDegrees: spec.strip!.orbitDegrees,
      farThirdLumaStd: far.mean,
      nearThirdLumaStd: near.mean,
      maskedPixels: far.maskedPixels,
      tileFreqSpike: rowProfileSpike(frameLumas[frameLumas.length - 1]!, stripWidth, stripHeight, stripMask!).spike
    };
  }
  stage("diagnostics");

  const diagnostics = app.diagnostics();
  const renderer = app.diagnostics().renderer as unknown as RendererDiagnosticsShape | undefined;

  const tier = app.quality?.tier ?? "high";
  const aniso = resolveSamplerAnisotropy({ tier, deviceMax: 16 });
  const inspectMaterials = registeredTypedGLBActors().flatMap((actor) =>
    actor.inspectMaterials().map((info) => ({
      actor: actor.id,
      name: info.name,
      featureKey: info.featureKey,
      baseColorFactor: info.baseColorFactor,
      enabledMaps: info.enabledMaps,
      extensions: info.extensions,
      lightsEvaluated: info.lightsEvaluated,
      warnings: info.warnings
    }))
  );

  let frame: Record<string, unknown> | undefined;
  if (options.pixels === true) {
    const shot = app.screenshot();
    const decoded = await decodePngDataUrl(shot.dataUrl);
    frame = decoded;
  }

  return {
    engine: "aura3d",
    scene: spec.id,
    engineVersion: __AURA3D_VERSION__,
    capabilityLog: log.entries,
    drawCalls: diagnostics.drawCalls,
    warnings: [...diagnostics.warnings, ...(renderer?.warnings ?? [])],
    errors: [...diagnostics.errors],
    loadMs: Math.round(performance.now() - started),
    extra: {
      // The flags actually applied to createAuraApp (requested list lands on
      // payload.qrFlags in the harness; this is the applied truth).
      appliedQrFlags: [...qrFlags],
      appliedTransmissionMode: options.transmission ?? "auto",
      appliedQualityTier: tier,
      samplerAnisotropy: { tier, requestedApplied: aniso.applied, detail: aniso.detail },
      backend: diagnostics.backend,
      renderSize: diagnostics.renderSize,
      environment: renderer?.environment,
      materials: diagnostics.materials,
      transmission: prd04TransmissionDiagnostics(),
      inspectMaterials,
      assets: diagnostics.assets.map((asset) => ({ id: asset.id, status: asset.status })),
      ...(stripReport ? { strip: stripReport } : {}),
      ...(frame ? { frame } : {})
    }
  };
}
