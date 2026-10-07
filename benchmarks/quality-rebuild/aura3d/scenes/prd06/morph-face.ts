// Lane adapter `prd06-morph-face` (PRD-06 T2.9), aura side: RobotExpressive
// held at the spec's fixed named morph weights. Bespoke runner (not
// runAuraScene) because ModelObjectSpec carries no morph field — the weights
// are written to the runtime node handle after the actor loads, same moment
// the three side assigns `morphTargetInfluences`.
import {
  camera,
  createAuraApp,
  defineAuraAssets,
  environments,
  lights,
  model,
  primitives,
  scene,
} from "@aura3d/engine";
import { hdriAssets, modelAssets } from "../../../shared/assets";
import type { CapabilityEntry, ReadyPayload } from "../../../shared/types";
import { prd06MorphFace } from "../../../scenes/prd06/morph-face";

declare const __AURA3D_VERSION__: string;

export default async function run(host: HTMLElement, opts?: { variant?: string; dpr?: 1 | 2; qrFlags?: readonly string[] }): Promise<ReadyPayload> {
  const started = performance.now();
  const spec = prd06MorphFace;
  const capabilityLog: CapabilityEntry[] = [];

  const auraAssets = defineAuraAssets({
    robotExpressive: {
      type: "model",
      format: "glb",
      url: modelAssets.robotExpressive.url,
      hash: modelAssets.robotExpressive.sha256,
      bounds: modelAssets.robotExpressive.worldSize,
      metadata: { animations: modelAssets.robotExpressive.animations, license: modelAssets.robotExpressive.provenance, sourcePath: modelAssets.robotExpressive.repoPath }
    },
    studioSmall08: {
      type: "texture",
      format: "hdr",
      url: hdriAssets[spec.environment!.hdri].url,
      hash: hdriAssets[spec.environment!.hdri].sha256,
      metadata: { license: hdriAssets[spec.environment!.hdri].provenance, sourcePath: hdriAssets[spec.environment!.hdri].repoPath }
    }
  } as const);

  const built = scene({ background: spec.background.kind === "color" ? { color: spec.background.color } : {} });
  built.add(camera.perspective({ fov: spec.camera.fov, near: spec.camera.near, far: spec.camera.far })
    .position(...spec.camera.position)
    .lookAt(...spec.camera.target));
  built.add(environments.hdri({ texture: auraAssets.studioSmall08, intensity: spec.environment!.intensity, rotation: spec.environment!.rotation }));
  const sun = spec.lights[0] as Extract<(typeof spec.lights)[number], { kind: "directional" }>;
  built.add(lights.directional({ name: sun.name, position: sun.position, intensity: sun.intensity, color: sun.color, shadow: sun.castShadow })
    .lookAt(sun.target[0], sun.target[1], sun.target[2]));
  const ground = spec.objects[0] as Extract<typeof spec.objects[number], { kind: "primitive" }>;
  built.add(primitives.plane({
    name: ground.name,
    material: { color: ground.material.color, roughness: ground.material.roughness, metalness: ground.material.metalness },
    size: ground.size,
    castShadow: false,
    receiveShadow: true
  }).position(...ground.position));
  built.add(model(auraAssets.robotExpressive, {
    name: "robot expressive face",
    scaleMode: "world",
    castShadow: true,
    receiveShadow: true
  }).position(0, 0, 0).runtime({ id: spec.morphFace.runtimeId }));

  const app = createAuraApp(host, {
    scene: built,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    pixelRatio: opts?.dpr ?? spec.resolution.devicePixelRatio,
    resize: false,
    autoStart: false,
    qualityRebuild: { flags: opts?.qrFlags && opts.qrFlags.length > 0 ? [...opts.qrFlags] : ["animation"] },
    animation: { mixer: "pose", defaults: "3.1" }
  });
  await app.ready();

  // Wait for the actor's first draw, then write the fixed-frame weights.
  const drawDeadline = performance.now() + 90_000;
  while (performance.now() < drawDeadline) {
    app.step(0);
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 || diagnostics.errors.length > 0) break;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  const handle = app.nodes.require(spec.morphFace.runtimeId) as {
    setMorphTargets?(weights: Readonly<Record<string, number>>): unknown;
    morphTargets?(): Readonly<Record<string, number>>;
  };
  if (typeof handle.setMorphTargets === "function") {
    handle.setMorphTargets(spec.morphFace.weights);
    capabilityLog.push({ feature: "morph-face-weights", status: "supported", detail: `setMorphTargets(${JSON.stringify(spec.morphFace.weights)})` });
  } else {
    capabilityLog.push({ feature: "morph-face-weights", status: "missing", detail: "runtime handle lacks setMorphTargets" });
  }

  // Settle frames — identical cadence to the shared frozen-model path.
  for (let i = 0; i < spec.settleFrames; i += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve(undefined)));
    app.step(0);
  }

  const diagnostics = app.diagnostics();
  return {
    engine: "aura3d",
    scene: spec.id,
    engineVersion: typeof __AURA3D_VERSION__ === "string" ? __AURA3D_VERSION__ : "dev",
    capabilityLog,
    drawCalls: diagnostics.drawCalls,
    warnings: diagnostics.warnings.map((warning) => String(warning)),
    errors: diagnostics.errors.map((error) => String(error)),
    loadMs: Math.round(performance.now() - started),
    variant: "default",
    dpr: opts?.dpr ?? 1,
    appliedToneMapping: "aces-filmic",
    appliedExposure: 1,
    lightUnits: "aura-internal",
    shadows: null,
    fallbackLightsActive: null,
    assetHashes: { robotExpressive: modelAssets.robotExpressive.sha256 },
    qrFlags: opts?.qrFlags ?? spec.qrFlags ?? [],
    extra: { morphFaceWeights: spec.morphFace.weights }
  } as ReadyPayload;
}
