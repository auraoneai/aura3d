/**
 * PRD-07 lane adapter runner (Aura side). Same contract as
 * `aura3d/common.ts` (createAuraApp on production, step to the capture time,
 * settle frames, ReadyPayload) but honours the PRD-07 §6.2 emitter options
 * (`seed`, `size`, `blend`, `maxParticles`, `prewarm`) and lane object kinds
 * (`flipbook`, `emitterSet`).
 *
 * Flags: `--flags <list>` appends `?a3d-qr=<list>` (C-33); the engine resolves
 * flags only from `createAuraApp` options, so the param is read here and
 * forwarded. Absent param = flags off (the flag-off sentinel run).
 */
import {
  camera,
  createAuraApp,
  effects,
  lights,
  primitives,
  scene,
  sky,
  type AuraApp,
  type AuraMaterialSpec,
  type AuraNodeInput,
  type AuraSceneBuilder
} from "@aura3d/engine";
import type { CapabilityEntry, CapabilityStatus, MaterialSpec, ReadyPayload } from "../../../shared/types";
import type { AuraVfxKind } from "@aura3d/engine/contracts";
import type { BurstSheetSpec, EmitterMemberSpec, Prd07SceneSpec } from "../../../scenes/prd07/specs";

declare const __AURA3D_VERSION__: string;

class CapabilityLog {
  readonly entries: CapabilityEntry[] = [];
  add(feature: string, status: CapabilityStatus, detail: string): void {
    this.entries.push({ feature, status, detail });
  }
}

function toAuraMaterial(spec: MaterialSpec): AuraMaterialSpec {
  return {
    color: spec.color,
    roughness: spec.roughness,
    metallic: spec.metalness,
    metalness: spec.metalness,
    ...(spec.emissive !== undefined ? { emissive: spec.emissive } : {}),
    ...(spec.emissiveIntensity !== undefined ? { emissiveIntensity: spec.emissiveIntensity } : {})
  };
}

function flagsFromUrl(): readonly string[] | undefined {
  const raw = new URLSearchParams(window.location.search).get("a3d-qr");
  if (raw === null || raw === "" || raw === "none") return undefined;
  return raw.split(",").filter(Boolean);
}

interface EffectsDiagnosticsShape {
  readonly nodes?: readonly {
    readonly id: string; readonly effect: string; readonly live: number;
    readonly drawCalls: number; readonly instancesDrawn: number;
    readonly zeroPixelFrames: number;
  }[];
  readonly batches?: number;
  readonly liveParticles?: number;
  readonly pixelBacked?: readonly string[];
  readonly errors?: readonly { readonly code: string; readonly nodeId: string; readonly message: string }[];
}

function effectsDiagnostics(app: AuraApp): EffectsDiagnosticsShape | undefined {
  const diagnostics = app.diagnostics() as unknown as { effects?: EffectsDiagnosticsShape };
  return diagnostics.effects;
}

function particleNode(object: { readonly name: string; readonly seed: number; readonly count: number; readonly center: readonly [number, number, number]; readonly radius: number; readonly height: number; readonly color: string; readonly size: number; readonly blending: string; readonly rate?: number }, spec: Prd07SceneSpec): AuraNodeInput {
  const prewarm = spec.time + spec.settleFrames / 60;
  return effects.particles({
    name: object.name,
    emitter: "fountain",
    radius: object.radius,
    height: object.height,
    color: object.color,
    // PRD-07 §6.2 surface: deterministic seed, world-space sprite size,
    // explicit blend, emitter cap and steady-state prewarm.
    seed: object.seed,
    size: object.size,
    blend: object.blending === "additive" ? "additive" : "alpha",
    maxParticles: object.count,
    prewarm,
    ...(object.rate !== undefined ? { rate: object.rate } : {})
  }).position(object.center[0], object.center[1], object.center[2]);
}

function buildPrd07AuraScene(spec: Prd07SceneSpec, log: CapabilityLog): AuraSceneBuilder {
  const built = scene();
  const nodes: AuraNodeInput[] = [];

  if (spec.background.kind === "color") {
    built.background(spec.background.color);
  }
  // P3-T7 sky nodes — real `sky` builder output (ignored by the renderer
  // unless A3D_QR_VFX_SKY is on; legacy prims still render flag-off).
  let dayNightLight = false;
  if (spec.dayNight) {
    const dn = sky.dayNight({ hour: spec.dayNight.hour, seed: spec.dayNight.seed, starLimit: spec.dayNight.starLimit, cloudLimit: spec.dayNight.cloudLimit });
    for (const node of dn.nodes) built.add(node);
    built.background(dn.background);
    log.add("dayNight", "supported", `sky.dayNight hour ${spec.dayNight.hour} — ${dn.visibleStarCount} stars, sky spec ${dn.sky.model}`);
    dayNightLight = true; // dayNight emits its own key light
  }
  if (spec.skyPreetham) {
    nodes.push(sky.preetham({ sun: { elevationDeg: spec.skyPreetham.elevationDeg, azimuthDeg: spec.skyPreetham.azimuthDeg }, turbidity: spec.skyPreetham.turbidity }));
    log.add("sky-preetham", "supported", `sun ${spec.skyPreetham.elevationDeg}°/${spec.skyPreetham.azimuthDeg}°, turbidity ${spec.skyPreetham.turbidity ?? "default"}`);
  }
  if (spec.fog) {
    // §6.6 authored fields on the node — resolve-time defaults apply under
    // A3D_QR_VFX_FOG; flag-off the node compiles to the legacy exp2 carve.
    nodes.push(
      effects.fog({
        name: "fog",
        density: spec.fog.density,
        color: spec.fog.color,
        // §6.6 fog mode — lands on the node as runtime data; AuraEffectNode's
        // typed `mode` slot is the antialias union, hence the value cast.
        mode: spec.fog.mode as never,
        ...(spec.fog.heightDensity !== undefined ? { heightDensity: spec.fog.heightDensity } : {}),
        ...(spec.fog.heightFalloff !== undefined ? { heightFalloff: spec.fog.heightFalloff } : {}),
        ...(spec.fog.heightReference !== undefined ? { heightReference: spec.fog.heightReference } : {}),
        ...(spec.fog.start !== undefined ? { start: spec.fog.start } : {}),
        ...(spec.fog.maxOpacity !== undefined ? { maxOpacity: spec.fog.maxOpacity } : {}),
        ...(spec.fog.absorption !== undefined ? { absorption: [...spec.fog.absorption] } : {}),
        ...(spec.fog.near !== undefined ? { near: spec.fog.near } : {}),
        ...(spec.fog.far !== undefined ? { far: spec.fog.far } : {}),
        ...(spec.fog.transitionSeconds !== undefined ? { transitionSeconds: spec.fog.transitionSeconds } : {})
      })
    );
    log.add(`fog-${spec.fog.mode}`, "supported", `${spec.fog.color} density ${spec.fog.density}${spec.fog.heightDensity !== undefined ? ` σh ${spec.fog.heightDensity}` : ""}${spec.fog.absorption ? ` σ=${spec.fog.absorption}` : ""} — §6.6 node (vfx.fog)`);
  }
  for (const volume of spec.fogVolumes ?? []) {
    nodes.push(
      effects.fogVolume({
        name: "fog-volume",
        position: [...volume.position] as [number, number, number],
        size: [...volume.size] as [number, number, number],
        ...(volume.density !== undefined ? { density: volume.density } : {}),
        ...(volume.shape !== undefined ? { shape: volume.shape } : {})
      })
    );
    log.add("fogVolume", "supported", `${volume.shape ?? "box"} @ ${volume.position} size ${volume.size} density ${volume.density ?? 0.25}`);
  }
  built.camera(camera.perspective({
    position: spec.camera.position,
    target: spec.camera.target,
    fov: spec.camera.fov,
    near: spec.camera.near,
    far: spec.camera.far
  }));
  log.add("tone-mapping:aces-filmic", "supported", "Production bridge submits operator \"aces\".");

  for (const light of spec.lights) {
    if (light.kind === "directional" && dayNightLight) continue; // avoid double key light
    if (light.kind === "ambient") {
      nodes.push(lights.ambient({ name: light.name, intensity: light.intensity, color: light.color }));
    } else if (light.kind === "directional") {
      nodes.push(lights.directional({ name: light.name, position: light.position, intensity: light.intensity, color: light.color, shadow: light.castShadow })
        .lookAt(light.target[0], light.target[1], light.target[2]));
    } else if (light.kind === "point") {
      nodes.push(lights.point({ name: light.name, position: light.position, intensity: light.intensity, color: light.color }));
    }
  }

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
      nodes.push(node);
    } else if (object.kind === "particles") {
      nodes.push(particleNode(object, spec));
      log.add("particles", "supported", `effects.particles ${object.count} max, seed ${object.seed}, blend ${object.blending}, size ${object.size}`);
    } else if (object.kind === "flipbook") {
      nodes.push(effects.flipbook({
        name: object.name,
        color: object.color ?? "#ffb347",
        spriteColumns: object.atlas.columns,
        spriteRows: object.atlas.rows,
        frameRate: object.atlas.frameRate,
        seed: object.atlas.seed,
        size: object.size,
        blend: object.blending ?? "alpha"
      }).position(...object.position));
      log.add("flipbook", "partial", `effects.flipbook ${object.atlas.columns}x${object.atlas.rows} @ ${object.atlas.frameRate}fps — atlas sampling lands with P1-T11/T12.`);
    } else if (object.kind === "emitterSet") {
      for (const member of object.emitters) {
        nodes.push(particleNode({ ...member }, spec));
      }
      log.add("emitterSet", "supported", `${object.emitters.length} emitters, ${object.emitters.reduce((s: number, e: EmitterMemberSpec) => s + e.count, 0)} total particles`);
    } else if (object.kind === "trail") {
      nodes.push(effects.trail({
        name: object.name,
        color: object.color,
        path: object.path,
        ...(object.width !== undefined ? { width: object.width } : {}),
        ...(object.maxPoints !== undefined ? { maxPoints: object.maxPoints } : {}),
        ...(object.orientation !== undefined ? { orientation: object.orientation } : {})
      }));
      log.add("trail", "supported", `effects.trail ${object.path.length} path points, width ${object.width ?? 0.3}`);
    } else if (object.kind === "beam") {
      nodes.push(effects.beam({
        name: object.name,
        from: object.from,
        to: object.to,
        color: object.color,
        ...(object.widthWorld !== undefined ? { widthWorld: object.widthWorld } : {}),
        ...(object.intensity !== undefined ? { intensity: object.intensity } : {})
      }));
      log.add("beam", "supported", `effects.beam ${object.from} → ${object.to}`);
    } else if (object.kind === "lightCone") {
      nodes.push(effects.lightCone({
        name: object.name,
        color: object.color,
        position: object.position,
        direction: object.direction,
        ...(object.length !== undefined ? { length: object.length } : {}),
        ...(object.coneAngle !== undefined ? { coneAngle: object.coneAngle } : {}),
        ...(object.softness !== undefined ? { softness: object.softness } : {}),
        ...(object.intensity !== undefined ? { intensity: object.intensity } : {})
      }));
      log.add("lightCone", "supported", `effects.lightCone length ${object.length ?? 6}`);
    } else if (object.kind === "auroraRibbon") {
      nodes.push(effects.auroraRibbon({
        name: object.name,
        color: object.color,
        ...(object.colorTop !== undefined ? { colorTop: object.colorTop } : {}),
        position: object.position,
        ...(object.width !== undefined ? { width: object.width } : {}),
        ...(object.height !== undefined ? { height: object.height } : {}),
        ...(object.segments !== undefined ? { segments: object.segments } : {}),
        ...(object.sway !== undefined ? { sway: object.sway } : {}),
        ...(object.shimmer !== undefined ? { shimmer: object.shimmer } : {}),
        ...(object.intensity !== undefined ? { intensity: object.intensity } : {})
      }));
      log.add("auroraRibbon", "supported", `effects.auroraRibbon ${object.width ?? 12}×${object.height ?? 8}`);
    } else if (object.kind === "meshParticles") {
      nodes.push(effects.meshParticles({
        name: object.name,
        color: object.color,
        position: object.position,
        ...(object.count !== undefined ? { particleCount: object.count } : {}),
        ...(object.seed !== undefined ? { seed: object.seed } : {})
      }));
      log.add("meshParticles", "supported", `effects.meshParticles ${object.count ?? 32} instances`);
    } else if (object.kind === "burstSheet") {
      // Spawns happen on the stepped clock in runPrd07AuraScene, not at build.
      log.add("burstSheet", "supported", `${object.kinds.length} kinds × ${object.ages.length} ages × ${object.panels.length} panels`);
    }
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

export async function runPrd07AuraScene(spec: Prd07SceneSpec, host: HTMLElement): Promise<ReadyPayload> {
  const started = performance.now();
  const log = new CapabilityLog();
  const flags = flagsFromUrl();
  const builtScene = buildPrd07AuraScene(spec, log);
  const app = createAuraApp(host, {
    scene: builtScene,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    pixelRatio: spec.resolution.devicePixelRatio,
    resize: false,
    autoStart: false,
    ...(flags !== undefined ? { qualityRebuild: { flags: [...flags] } } : {})
  });
  await app.ready();

  const drawDeadline = performance.now() + 90_000;
  while (performance.now() < drawDeadline) {
    app.step(0);
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 || diagnostics.errors.length > 0) break;
    await sleep(50);
  }

  const sheets = spec.objects.filter((o): o is BurstSheetSpec => o.kind === "burstSheet");
  if (spec.fogTransition) {
    // P4-T8 S16 — setFog(from), step to the transition point, setFog(to) with
    // transitionSeconds, then step exactly half the transition so the capture
    // lands at the blend midpoint.
    const atmosphereApi = (app as unknown as { atmosphere?: { setFog(spec: unknown, o?: { transitionSeconds?: number }): void } }).atmosphere;
    if (atmosphereApi) {
      atmosphereApi.setFog(spec.fogTransition.from);
      app.step(spec.fogTransition.atSeconds);
      atmosphereApi.setFog(spec.fogTransition.to, { transitionSeconds: spec.fogTransition.to.transitionSeconds });
      app.step((spec.fogTransition.to.transitionSeconds ?? 1) / 2);
      log.add("fog-transition", "supported", `${spec.fogTransition.from.mode}→${spec.fogTransition.to.mode} over ${spec.fogTransition.to.transitionSeconds ?? 1}s — captured at midpoint`);
    } else {
      log.add("fog-transition", "missing", "app.atmosphere unavailable (flags off?)");
      app.step(spec.time);
    }
  } else if (sheets.length === 0) {
    // Advance simulated time to the capture time, then settle.
    app.step(spec.time);
  } else {
    // S3 staged spawn: cell (kind, age, panel) bursts at spec.time − age so
    // every column shows exactly `age` seconds of life at capture.
    let elapsed = 0;
    for (const sheet of sheets) {
      const rows = sheet.kinds.length;
      const cols = sheet.ages.length;
      const [sx, sy] = sheet.spacing;
      const cells: { at: number; kind: string; position: [number, number, number]; seed: number }[] = [];
      for (let pi = 0; pi < sheet.panels.length; pi++) {
        const panel = sheet.panels[pi];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const age = sheet.ages[c];
            cells.push({
              at: spec.time - age,
              kind: sheet.kinds[r],
              position: [panel[0] + (c - (cols - 1) / 2) * sx, panel[1] + ((rows - 1) / 2 - r) * sy, panel[2]],
              seed: (sheet.seed ?? 0) + pi * 997 + r * 31 + c
            });
          }
        }
      }
      cells.sort((a, b) => a.at - b.at);
      const effectsApi = app.effects;
      const burst = effectsApi ? effectsApi.burst.bind(effectsApi) : null;
      for (const cell of cells) {
        if (cell.at > elapsed) { app.step(cell.at - elapsed); elapsed = cell.at; }
        burst?.(cell.kind as AuraVfxKind, cell.position, { count: sheet.burstCount, seed: cell.seed });
      }
    }
    app.step(spec.time - elapsed);
  }
  for (let frame = 0; frame < spec.settleFrames; frame += 1) {
    await nextFrame();
    app.step(0);
  }
  await nextFrame();

  const diagnostics = app.diagnostics();
  const fx = effectsDiagnostics(app);
  if (fx) {
    log.add("effects-nodes", "supported", `${fx.nodes?.length ?? 0} effect nodes, ${fx.liveParticles ?? 0} live particles, ${fx.batches ?? 0} batches, pixelBacked=[${(fx.pixelBacked ?? []).join(",")}]`);
    for (const error of fx.errors ?? []) log.add(`effects-error:${error.code}`, "missing", `${error.nodeId}: ${error.message}`);
  } else {
    log.add("effects-nodes", "missing", "diagnostics().effects section absent (A3D_QR_VFX off)");
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
    extra: {
      backend: diagnostics.backend,
      renderSize: diagnostics.renderSize,
      qrFlags: flags ?? [],
      effects: fx
    }
  };
}
