/**
 * PRD-05 Aura3D translator: mounts `Prd05SceneSpec` objects whose models are
 * §6.3 optimized GLBs (EXT_meshopt_compression + KHR_mesh_quantization +
 * KHR_texture_basisu). The C-16 decoder registry is not yet on the default
 * `model()` path (05-WIRE), so the capability log does not claim it; anything
 * the public API cannot express lands in the capability log.
 */
import {
  camera,
  createAuraApp,
  defineAuraAssets,
  environments,
  lights,
  model,
  primitives,
  scene,
  material,
  resolveQrFlags,
  type AuraApp,
  type AuraSceneSnapshot
} from "@aura3d/engine";
import { setTypedGLBActorQrFlags } from "@aura3d/engine/lanes";
import { setRendererQrFlags } from "@aura3d/rendering";
import { adapterBudgetMs, DEFAULT_CAPTURE_TIMEOUT_MS, waitForFirstDraw } from "../../lib/failfast";
import { hdriAssets } from "../../../shared/assets";
import type { CapabilityEntry, CapabilityStatus, ReadyPayload } from "../../../shared/types";
import { prd05Assets, type Prd05AssetEntry } from "../../../scenes/prd05/assets";
import type { Prd05SceneSpec } from "../../../scenes/prd05/spec";

declare const __AURA3D_VERSION__: string;

// Served URLs (dist `/qr-assets/`), never repo paths: capture.mjs serves only the built dist.
const assetUrl = (entry: Prd05AssetEntry): string => entry.url;

class CapabilityLog {
  readonly entries: CapabilityEntry[] = [];
  add(feature: string, status: CapabilityStatus, detail: string): void {
    this.entries.push({ feature, status, detail });
  }
}

function prd05ModelDefinition(entry: Prd05AssetEntry) {
  return {
    type: "model" as const,
    format: "glb",
    url: assetUrl(entry),
    hash: entry.sha256,
    metadata: { license: entry.provenance, sourcePath: entry.source, provenance: { profile: entry.profile } }
  };
}

const auraModelAssets = defineAuraAssets(
  Object.fromEntries(Object.values(prd05Assets).map((entry) => [entry.id, prd05ModelDefinition(entry)]))
);

function hdriDefinition(id: keyof typeof hdriAssets) {
  const entry = hdriAssets[id];
  return { type: "texture" as const, format: "hdr", url: entry.url, hash: entry.sha256, metadata: { license: entry.provenance, sourcePath: entry.repoPath } };
}

const auraHdriAssets = defineAuraAssets({
  studioSmall08: hdriDefinition("studioSmall08"),
  autumnFieldPuresky: hdriDefinition("autumnFieldPuresky"),
  kloppenheim06Puresky: hdriDefinition("kloppenheim06Puresky")
});

function buildScene(spec: Prd05SceneSpec, log: CapabilityLog): AuraSceneSnapshot {
  const built = scene();
  if (spec.background.kind === "hdri") {
    built.background(spec.background.fallbackColor);
    log.add("hdri-background", "partial", `scene().background() accepts only a color; rendered solid ${spec.background.fallbackColor} under the ${spec.background.hdri} IBL environment.`);
    built.add(environments.hdri({ texture: auraHdriAssets[spec.background.hdri], intensity: spec.background.intensity }));
  } else {
    built.background(spec.background.color);
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
  for (const light of spec.lights) {
    if (light.kind === "ambient") built.add(lights.ambient({ name: light.name, color: light.color, intensity: light.intensity }));
    else if (light.kind === "directional") {
      built.add(
        lights.directional({
          name: light.name,
          color: light.color,
          intensity: light.intensity,
          position: light.position,
          target: light.target,
          shadow: light.castShadow
        })
      );
    } else {
      log.add(`light:${light.kind}`, "missing", `${light.name}: kind not expressible in scene lights`);
    }
  }
  for (const object of spec.objects) {
    if (object.kind === "primitive") {
      built.add(
        primitives.plane({
          name: object.name,
          material: material.pbr({ color: object.material.color, roughness: object.material.roughness, metalness: object.material.metalness }),
          size: object.size,
          castShadow: object.castShadow,
          receiveShadow: object.receiveShadow
        }).position(...object.position)
      );
      continue;
    }
    const asset = auraModelAssets[object.asset];
    let node = model(asset, {
      name: object.name,
      scaleMode: "world",
      castShadow: object.castShadow,
      receiveShadow: object.receiveShadow
    }).position(...object.position);
    if (object.rotation) node = node.rotate(...object.rotation);
    if (object.scale !== undefined) node = node.scale(object.scale);
    built.add(node);
  }
  return built.toJSON();
}

const nextFrame = (): Promise<void> => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export interface Prd05AuraSceneOptions {
  readonly qrFlags?: readonly string[];
}

export async function runPrd05AuraScene(spec: Prd05SceneSpec, host: HTMLElement, options: Prd05AuraSceneOptions = {}): Promise<ReadyPayload> {
  const started = performance.now();
  const log = new CapabilityLog();
  const qrFlags = options.qrFlags ?? spec.qrFlags ?? [];
  const resolvedFlags = resolveQrFlags({ options: [...qrFlags] });
  setTypedGLBActorQrFlags(resolvedFlags);
  setRendererQrFlags(resolvedFlags);
  host.style.width = `${spec.resolution.width}px`;
  host.style.height = `${spec.resolution.height}px`;

  const app: AuraApp = createAuraApp(host, {
    scene: buildScene(spec, log),
    renderer: { qualityProfile: "production" },
    pixelRatio: spec.resolution.devicePixelRatio,
    ...(qrFlags.length > 0 ? { qualityRebuild: { flags: [...qrFlags] } } : {}),
    resize: false,
    autoStart: false
  });
  await app.ready();

  // T0-22: fail closed. A mount that records errors with zero draws, or never
  // draws inside 0.8 × the capture timeout, throws NoDrawError so the page
  // publishes __QR_ERROR__ instead of a masked READY (same helper as
  // aura3d/common.ts).
  const runQuery = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const budgetMs = adapterBudgetMs(Number(runQuery.get("timeout")) || DEFAULT_CAPTURE_TIMEOUT_MS);
  await waitForFirstDraw(app, Math.max(1, Math.min(90_000, budgetMs - (performance.now() - started))));

  app.step(spec.time);
  for (let frame = 0; frame < spec.settleFrames; frame += 1) {
    await nextFrame();
    app.step(0);
  }
  await nextFrame();

  const diagnostics = app.diagnostics();
  const assets = diagnostics.assets.map((asset) => ({ id: asset.id, status: asset.status }));
  const failed = assets.filter((asset) => asset.status === "error");
  if (failed.length) {
    log.add("optimized-glb-load", "missing", `assets failed to load: ${failed.map((a) => a.id).join(", ")}`);
  } else {
    // No C-16 claim: this adapter passes no decoders and the default model()
    // path does not forward the registry yet (05-WIRE, Q-04-1 #448), so the
    // decode path is not attributable from here.
    log.add(
      "optimized-glb-load",
      "partial",
      `${assets.length} optimized GLB(s) loaded; decoder path unattributed (C-16 registry not on the default model() path, 05-WIRE)`
    );
  }

  return {
    engine: "aura3d",
    scene: spec.id,
    engineVersion: __AURA3D_VERSION__,
    capabilityLog: log.entries,
    drawCalls: diagnostics.drawCalls,
    warnings: [...diagnostics.warnings],
    errors: [...diagnostics.errors],
    loadMs: Math.round(performance.now() - started),
    qrFlags: [...qrFlags],
    extra: {
      backend: diagnostics.backend,
      renderSize: diagnostics.renderSize,
      assets,
      optimizedAssets: Object.values(prd05Assets)
        .filter((a) => spec.objects.some((o) => o.kind === "model" && o.asset === a.id))
        .map((a) => ({ id: a.id, sha256: a.sha256, profile: a.profile, extensions: a.gltfExtensions }))
    }
  };
}
