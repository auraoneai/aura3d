/**
 * PRD-04 Aura3D translator: Prd04SceneSpec -> `@aura3d/engine` public API.
 * Lane-local mirror of the shared translator with lane extensions (variants,
 * materialOverrides tint, texture maps on primitives). Everything the API
 * cannot express lands in the capability log; nothing is tuned per-scene.
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
  type AuraApp,
  type AuraMaterialSpec,
  type AuraNodeInput
} from "@aura3d/engine";
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

function buildScene(spec: Prd04SceneSpec, log: CapabilityLog) {
  const built = scene();

  if (spec.background.kind === "color") {
    built.background(spec.background.color);
  } else {
    built.background(spec.background.fallbackColor);
    log.add("hdri-background", "missing", "scene().background() accepts only a color; rendered fallback color.");
  }
  built.camera(
    camera.perspective({
      position: spec.camera.position,
      target: spec.camera.target,
      fov: spec.camera.fov,
      near: spec.camera.near,
      far: spec.camera.far
    })
  );
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
      let node = model(asset, {
        name: object.name,
        scaleMode: "world",
        castShadow: object.castShadow,
        receiveShadow: object.receiveShadow,
        ...(object.variant ? { variant: object.variant } : {}),
        ...(object.tint
          ? { materialOverrides: [{ color: object.tint.color as `#${string}`, colorMode: "multiply" as const }] }
          : {})
      }).position(...object.position);
      if (object.rotation) node = node.rotate(...object.rotation);
      if (object.scale !== undefined) node = node.scale(object.scale);
      if (object.variant) log.add(`variant:${object.name}`, "partial", "model({variant}) passed; stub path (E29/E30) may drop it — recorded via inspectMaterials");
      if (object.tint) log.add(`tint:${object.name}`, "partial", "materialOverrides.color passed; C-15 stub lowers color-only via setTint (maps preserved iff C-15 lands)");
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

export async function runPrd04AuraScene(spec: Prd04SceneSpec, host: HTMLElement, qrFlags: readonly string[] = []): Promise<ReadyPayload> {
  const started = performance.now();
  const log = new CapabilityLog();
  host.style.width = `${spec.resolution.width}px`;
  host.style.height = `${spec.resolution.height}px`;

  const app: AuraApp = createAuraApp(host, {
    scene: buildScene(spec, log),
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    pixelRatio: spec.resolution.devicePixelRatio,
    ...(qrFlags.length > 0 ? { qualityRebuild: { flags: qrFlags } } : {}),
    resize: false,
    autoStart: false
  });
  await app.ready();

  const drawDeadline = performance.now() + 90_000;
  while (performance.now() < drawDeadline) {
    app.step(0);
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 || diagnostics.errors.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (spec.environment) {
    const hdriDeadline = performance.now() + 180_000;
    while (performance.now() < hdriDeadline) {
      const environment = (app.diagnostics().renderer as unknown as RendererDiagnosticsShape | undefined)?.environment;
      if (environment?.iblPixelBacked || environment?.hdriStatus === "ready" || environment?.hdriStatus === "fallback") break;
      app.step(0);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  app.step(spec.time);
  for (let frame = 0; frame < spec.settleFrames; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    app.step(0);
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const diagnostics = app.diagnostics();
  const renderer = app.diagnostics().renderer as unknown as RendererDiagnosticsShape | undefined;
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
      backend: diagnostics.backend,
      renderSize: diagnostics.renderSize,
      environment: renderer?.environment,
      assets: diagnostics.assets.map((asset) => ({ id: asset.id, status: asset.status }))
    }
  };
}
