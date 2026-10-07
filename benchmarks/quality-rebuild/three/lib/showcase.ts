/**
 * T2.1 — `runThreeShowcase` (§9.1): the well-built three.js r185 reference
 * pipeline for `referenceProfile: "showcase"` scenes.
 *
 * Builds the scene through the same contract translator as `runThreeScene`
 * (identical fetches, lights, CSM, HDRI env), then re-renders through the
 * showcase composer with the spec's `showcase` overrides:
 *   RenderPass → GTAOPass (ao) → UnrealBloomPass (bloom) → SMAAPass (msaa4+smaa) → OutputPass.
 * The composer is constructed over an explicit HalfFloat samples:4 target —
 * `EffectComposer`'s default target has no multisampling, so "msaa4" without
 * it would silently mean no MSAA.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GroundedSkybox } from "three/examples/jsm/objects/GroundedSkybox.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { runThreeScene, type RunOptions } from "../common";
import { ContactShadows } from "./contact-shadows";
import type { ReadyPayload, SceneSpec, ShowcaseSpec } from "../../shared/types";

/** §9.1 — resolved per-scene showcase settings (see SceneSpec.showcase). */
export interface ShowcaseOptions {
  readonly toneMapping: "agx" | "neutral" | "aces-filmic";
  readonly ao: { readonly kind: "gtao"; readonly radius: number; readonly distanceExponent: number } | null;
  readonly bloom: { readonly strength: number; readonly radius: number; readonly threshold: number } | null;
  readonly aa: "msaa4+smaa" | "msaa4";
  readonly shadows: { readonly type: "pcf" | "vsm"; readonly mapSize: 2048 | 4096; readonly radius: number; readonly bias: number; readonly normalBias: number } | null;
  readonly contactShadows: { readonly size: number; readonly blur: number; readonly darkness: number } | null;
  readonly background: "hdri" | "grounded-skybox" | "color";
  readonly anisotropy: "max";
}

const TONE_MAPPING: Record<ShowcaseOptions["toneMapping"], THREE.ToneMapping> = {
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
  "aces-filmic": THREE.ACESFilmicToneMapping
};

function showcaseOptions(spec: SceneSpec): ShowcaseOptions {
  const s = spec.showcase ?? ({} as ShowcaseSpec);
  return {
    toneMapping: spec.toneMapping,
    ao: s.ao ? { kind: "gtao", radius: s.ao.radius, distanceExponent: s.ao.distanceExponent } : null,
    bloom: spec.bloom ? { strength: spec.bloom.strength, radius: spec.bloom.radius, threshold: spec.bloom.threshold } : null,
    aa: s.aa ?? "msaa4+smaa",
    shadows: spec.shadows
      ? { type: "pcf", mapSize: (spec.shadows.mapSize === 4096 ? 4096 : 2048), radius: s.shadowRadius ?? 3, bias: spec.shadows.bias, normalBias: spec.shadows.normalBias }
      : null,
    contactShadows: s.contactShadows ?? null,
    background: s.background ?? (spec.background.kind === "hdri" ? "hdri" : "color"),
    anisotropy: s.anisotropy ?? "max"
  };
}

export async function runThreeShowcase(spec: SceneSpec, host: HTMLElement, runOpts: RunOptions = {}): Promise<ReadyPayload> {
  const opts = showcaseOptions(spec);
  // Same page, same fetch dedupe: the contract translator builds scene+graph,
  // then this pipeline re-renders with the showcase composer.
  const payload = await runThreeScene(spec, host, runOpts);
  const graph = window.__QR_THREE_GRAPH__;
  if (!graph) throw new Error("runThreeShowcase: runThreeScene did not publish __QR_THREE_GRAPH__");
  const { scene, camera, renderer } = graph;
  const { width, height } = spec.resolution;
  const dpr = renderer.getPixelRatio();

  // Tone mapping and shadow settings are renderer-level (OutputPass encodes once).
  renderer.toneMapping = TONE_MAPPING[opts.toneMapping];
  renderer.toneMappingExposure = spec.exposure;
  if (opts.shadows) {
    renderer.shadowMap.type = opts.shadows.type === "vsm" ? THREE.VSMShadowMap : THREE.PCFShadowMap;
    scene.traverse((child) => {
      const light = child as THREE.Light & { shadow?: THREE.LightShadow };
      if (!light.shadow) return;
      light.shadow.mapSize.set(opts.shadows!.mapSize, opts.shadows!.mapSize);
      light.shadow.radius = opts.shadows!.radius;
      light.shadow.bias = opts.shadows!.bias;
      light.shadow.normalBias = opts.shadows!.normalBias;
      if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
    });
  }

  // Anisotropy "max": every texture with mipmaps samples at the hardware max.
  if (opts.anisotropy === "max") {
    const max = renderer.capabilities.getMaxAnisotropy();
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const m = material as THREE.MeshStandardMaterial;
        for (const tex of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.aoMap, m.emissiveMap]) {
          if (tex) tex.anisotropy = max;
        }
      }
    });
  }

  if (opts.background === "grounded-skybox" && scene.background instanceof THREE.Texture) {
    scene.add(new GroundedSkybox(scene.background, 5, 60));
  }
  if (spec.showcase?.backgroundBlurriness !== undefined && scene.background instanceof THREE.Texture) {
    scene.backgroundBlurriness = spec.showcase.backgroundBlurriness;
  }
  if (spec.showcase?.environmentStandIn === "room-environment") {
    // §9.3 interior stand-in for ref-02 while the 2k HDRI is pending (assetTier "stand-in").
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = spec.environment?.intensity ?? 1;
    pmrem.dispose();
  }

  let contactShadows: ContactShadows | undefined;
  if (opts.contactShadows) {
    contactShadows = new ContactShadows({ size: opts.contactShadows.size, blur: opts.contactShadows.blur, darkness: opts.contactShadows.darkness });
    scene.add(contactShadows.group);
  }

  // Explicit HalfFloat samples:4 composer target — see module header.
  const target = new THREE.WebGLRenderTarget(width * dpr, height * dpr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(dpr);
  composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));
  if (opts.ao) {
    const gtao = new GTAOPass(scene, camera, width, height);
    gtao.updateGtaoMaterial({ radius: opts.ao.radius, distanceExponent: opts.ao.distanceExponent });
    composer.addPass(gtao);
  }
  if (opts.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), opts.bloom.strength, opts.bloom.radius, opts.bloom.threshold));
  if (opts.aa === "msaa4+smaa") composer.addPass(new SMAAPass());
  composer.addPass(new OutputPass());

  const renderShowcase = (): void => {
    contactShadows?.update(renderer, scene);
    composer.render();
  };
  for (let frame = 0; frame < spec.settleFrames; frame += 1) {
    renderShowcase();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  renderShowcase();

  return {
    ...payload,
    appliedToneMapping: opts.toneMapping,
    extra: {
      ...payload.extra,
      assetTier: spec.showcase?.assetTier ?? "admitted",
      showcasePipeline: `composer(${["RenderPass", opts.ao ? "GTAOPass" : null, opts.bloom ? "UnrealBloomPass" : null, opts.aa === "msaa4+smaa" ? "SMAAPass" : null, "OutputPass"].filter(Boolean).join("+")})`
    }
  };
}
