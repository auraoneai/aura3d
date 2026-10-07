/**
 * PRD-01 lane mount helper (Aura side). Translates a Prd01LaneSceneSpec into an
 * AuraSceneSnapshot and mounts it through the public `createAuraApp` path —
 * the same surface the lane's C-06/C-07 work lands on. Capability gaps (blend
 * modes, tessellation, output options, skinned assets) are recorded, not
 * approximated silently.
 */

import {
  AuraNodeBuilder,
  createAuraApp,
  group,
  instances,
  lights,
  material,
  primitives,
  scene,
  camera
} from "@aura3d/engine";
import type {
  AuraApp,
  AuraColor,
  AuraLightNode,
  AuraPrimitiveNode,
  AuraSceneNode,
  AuraSceneSnapshot,
  AuraVec3
} from "@aura3d/engine";
import { RenderPipeline } from "@aura3d/rendering";
import type { CapabilityEntry, CapabilityStatus, ReadyPayload } from "../../../shared/types";
import type {
  Prd01LaneSceneSpec,
  Prd01LightSpec,
  Prd01MaterialSpec,
  Prd01ShapeName,
  Prd01ShapeNode,
  Prd01Transform
} from "../../../scenes/prd01/types";

declare const __AURA3D_VERSION__: string;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

class CapabilityLog {
  readonly entries: CapabilityEntry[] = [];
  add(feature: string, status: CapabilityStatus, detail: string): void {
    this.entries.push({ feature, status, detail });
  }
}

const PRIMITIVES: Record<Prd01ShapeName, (options: Parameters<typeof primitives.box>[0]) => AuraNodeBuilder<AuraPrimitiveNode>> = {
  box: primitives.box,
  sphere: primitives.sphere,
  plane: primitives.plane,
  cylinder: primitives.cylinder,
  capsule: primitives.capsule,
  torus: primitives.torus
};

function auraMaterial(spec: Prd01MaterialSpec, log: CapabilityLog, context: string) {
  if (spec.blend && spec.blend !== "normal") {
    log.add(`blend:${spec.blend}`, "missing", `${context}: AuraMaterialSpec has no blend field; rendered with normal alpha.`);
  }
  if (spec.opacity !== undefined && spec.opacity < 1 && !spec.blend) {
    log.add("alpha-opacity", "partial", `${context}: opacity ${spec.opacity} applied without a declared blend mode.`);
  }
  return material.pbr({
    color: spec.color as AuraColor,
    metalness: spec.metalness,
    roughness: spec.roughness,
    emissive: spec.emissive as AuraColor | undefined,
    emissiveIntensity: spec.emissiveIntensity,
    opacity: spec.opacity
  });
}

function applyTransform(builder: AuraNodeBuilder<AuraSceneNode>, transform: Prd01Transform): AuraNodeBuilder<AuraSceneNode> {
  if (transform.position) builder = builder.position(...(transform.position as [number, number, number]));
  if (transform.rotation) builder = builder.rotate(...(transform.rotation as [number, number, number]));
  if (transform.scale !== undefined) builder = builder.scale(transform.scale as number | [number, number, number]);
  if (transform.rotation) {
    // ZYX order is today's behaviour (C-06 rotationOrder is diagnostic-only until Phase 1).
  }
  return builder;
}

function shapeNodeToAura(node: Prd01ShapeNode, log: CapabilityLog): AuraSceneNode {
  const builder = PRIMITIVES[node.shape]({
    name: node.id,
    material: auraMaterial(node.material, log, node.id),
    size: node.size as number | AuraVec3 | undefined
  });
  const transformed = applyTransform(builder as AuraNodeBuilder<AuraSceneNode>, node) as AuraNodeBuilder<AuraPrimitiveNode>;
  const json = transformed.toJSON();
  if (node.children?.length) {
    // Nested children inside a primitive are not expressible in the public node
    // graph — wrap the primitive in a group carrying them instead.
    return group(node.id, [json, ...node.children.map((child) => shapeNodeToAura(child, log))]).toJSON();
  }
  return json;
}

function lightToAura(spec: Prd01LightSpec, log: CapabilityLog): AuraSceneNode {
  if (spec.kind === "ambient") return lights.ambient({ intensity: spec.intensity, color: spec.color as AuraColor }).toJSON();
  const orbiting = spec.orbitCenter !== undefined;
  if (orbiting) {
    log.add(
      "light-orbit",
      "partial",
      "Azimuthal light motion via a group orbit animation is approximate until the C-06 runtime drives transforms; strip sigma is computed from whatever actually rendered."
    );
  }
  const lightJson = lights
    .directional({
      position: (spec.orbitCenter
        ? [(spec.orbitCenter[0] ?? 0) + (spec.orbitRadius ?? 4), spec.orbitCenter[1], spec.orbitCenter[2]]
        : spec.position) as AuraVec3,
      intensity: spec.intensity,
      color: spec.color as AuraColor
    })
    .toJSON();
  if (!orbiting) return lightJson;
  return group(`orbit-${spec.color}`, [lightJson], {
    position: spec.orbitCenter,
    animation: {
      clip: "spin",
      loop: true,
      easing: "linear",
      duration: spec.orbitPeriodSeconds,
      orbitRadius: spec.orbitRadius
    }
  }).toJSON();
}

function buildSnapshot(spec: Prd01LaneSceneSpec, log: CapabilityLog): AuraSceneSnapshot {
  const builder = scene().background(spec.background as AuraColor).camera(
    camera.perspective({ position: spec.camera.position as AuraVec3, target: spec.camera.target as AuraVec3, fov: spec.camera.fov })
  );
  for (const light of spec.lights) builder.add(lightToAura(light, log));

  const content = spec.content;
  if (content.kind === "hierarchy") {
    for (const grp of content.groups) {
      const g = group(
        grp.id,
        grp.children.map((child) => shapeNodeToAura(child, log)),
        { position: grp.transform.position, rotation: grp.transform.rotation, scale: grp.transform.scale }
      );
      builder.add(g);
    }
  } else if (content.kind === "tonemap-ramp") {
    const spacing = 0.62;
    const x0 = (-(content.emissiveStops.length - 1) * spacing) / 2;
    content.emissiveStops.forEach((stop, index) => {
      builder.add(
        primitives
          .box({
            name: `swatch-${index}`,
            material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: stop }),
            size: [0.55, 0.55, 0.08]
          })
          .position(x0 + index * spacing, 0.55, 0)
          .toJSON()
      );
    });
    builder.add(
      primitives
        .box({
          name: "grey-18",
          material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: content.greyLevel })
        })
        .position(0, -0.35, 0)
        .scale([0.7, 0.35, 0.1])
        .toJSON()
    );
  } else if (content.kind === "blend-modes") {
    const spacing = 1.05;
    const x0 = (-(content.modes.length - 1) * spacing) / 2;
    content.modes.forEach((mode, index) => {
      const x = x0 + index * spacing;
      builder.add(
        primitives
          .plane({ name: `blend-back-${mode}`, material: auraMaterial({ color: content.backColor, roughness: 1 }, log, `blend-back-${mode}`) })
          .position(x, 0.5, -0.03)
          .rotate(Math.PI / 2, 0, 0)
          .scale([0.85, 0.85, 1])
          .toJSON()
      );
      builder.add(
        primitives
          .plane({
            name: `blend-front-${mode}`,
            material: auraMaterial({ color: content.frontColor, opacity: content.frontOpacity, blend: mode, roughness: 1 }, log, `blend-front-${mode}`)
          })
          .position(x + 0.12, 0.5, 0.03)
          .rotate(Math.PI / 2, 0, 0)
          .scale([0.85, 0.85, 1])
          .toJSON()
      );
    });
  } else if (content.kind === "specular-aa") {
    const spacing = 1.05;
    const x0 = (-(content.sphereCount - 1) * spacing) / 2;
    for (let i = 0; i < content.sphereCount; i += 1) {
      builder.add(
        primitives
          .sphere({
            name: `chrome-${i}`,
            material: material.pbr({ color: "#d7dce4", metalness: content.metalness, roughness: content.roughness })
          })
          .position(x0 + i * spacing, 0.55, 0)
          .scale(0.48)
          .toJSON()
      );
    }
    builder.add(
      primitives
        .plane({ name: "floor", material: material.pbr({ color: "#1a2029", roughness: 0.9, metalness: 0 }) })
        .position(0, 0, 0)
        .scale([14, 1, 14])
        .toJSON()
    );
  } else if (content.kind === "primitive-catalog") {
    const spacing = 1.15;
    const x0 = (-(content.shapes.length - 1) * spacing) / 2;
    content.shapes.forEach((shape, index) => {
      builder.add(
        applyTransform(
          PRIMITIVES[shape]({
            name: `shape-${shape}`,
            material: material.pbr({ color: "#b8b3a9", roughness: 0.72, metalness: 0.02 })
          }) as AuraNodeBuilder<AuraSceneNode>,
          { position: [x0 + index * spacing, 0.62, 0], scale: shape === "plane" ? [0.9, 0.9, 1] : 0.8 }
        ).toJSON()
      );
    });
    builder.add(
      primitives
        .plane({ name: "floor", material: material.pbr({ color: "#151a21", roughness: 0.95 }) })
        .position(0, 0.05, 0)
        .scale([14, 1, 14])
        .toJSON()
    );
  } else {
    // draw-throughput: unique-material grid + instanced block.
    const { rows, cols } = content.uniqueMaterials;
    const cell = 0.42;
    const x0 = (-(cols - 1) * cell) / 2;
    const z0 = 2.2;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const hue = Math.round((360 * (row * cols + col)) / (rows * cols));
        builder.add(
          primitives
            .box({
              name: `um-${row}-${col}`,
              material: material.pbr({ color: `hsl(${hue}, 62%, 52%)` as AuraColor, roughness: 0.55, metalness: 0.1 })
            })
            .position(x0 + col * cell, 0.28, z0 + row * cell)
            .scale([0.34, 0.3, 0.34])
            .toJSON()
        );
      }
    }
    const transforms: { position: AuraVec3; scale: AuraVec3 }[] = [];
    const colors: AuraColor[] = [];
    const inst = content.instanced;
    const ix0 = (-(inst.cols - 1) * inst.spacing) / 2;
    const iz0 = -(Math.ceil(inst.count / inst.cols) * inst.spacing) / 2 - 1.5;
    for (let i = 0; i < inst.count; i += 1) {
      const col = i % inst.cols;
      const row = Math.floor(i / inst.cols);
      transforms.push({ position: [ix0 + col * inst.spacing, 0.22, iz0 + row * inst.spacing] as AuraVec3, scale: [0.4, 0.4, 0.4] as AuraVec3 });
      colors.push(`hsl(${Math.round((360 * i) / inst.count)}, 55%, 55%)` as AuraColor);
    }
    builder.add(instances.box({ name: "instanced-10k", transforms, colors, material: material.pbr({ roughness: 0.6, metalness: 0.05 }) }).toJSON());
    if (content.skinned.requested > 0) {
      log.add("skinned-humans", "missing", `${content.skinned.requested} skinned humans declared but not mounted — rigged assets are not part of the lane scene bundle yet.`);
    }
  }
  return builder.toJSON();
}

interface SteadyStateCounters {
  readonly programCompiles: number | null;
  readonly bufferCreates: number | null;
  readonly renderTargetsCreated: number | null;
}

/** C-28 counters via the lane's diagnostics sections (null when unobservable). */
function steadyStateCounters(app: AuraApp): SteadyStateCounters {
  const d = app.diagnostics() as unknown as {
    programs?: { deviceProgramCompiles?: number | null };
    frameAllocations?: { device?: { bufferCreates?: number; renderTargetsCreated?: number } | null };
  };
  return {
    programCompiles: d.programs?.deviceProgramCompiles ?? null,
    bufferCreates: d.frameAllocations?.device?.bufferCreates ?? null,
    renderTargetsCreated: d.frameAllocations?.device?.renderTargetsCreated ?? null
  };
}

export interface LaneMountOptions {
  readonly settleFrames?: number;
  readonly stepDt?: number;
  /** Phase 6 (§15): steady-state measurement window length in frames. */
  readonly measureFrames?: number;
}

export async function mountAuraLaneScene(sceneId: string, spec: Prd01LaneSceneSpec, host: HTMLElement, options: LaneMountOptions = {}): Promise<ReadyPayload> {
  const started = performance.now();
  const log = new CapabilityLog();
  const snapshot = buildSnapshot(spec, log);
  const qrList = new URLSearchParams(window.location.search).get("a3d-qr") ?? "none";
  const animated = spec.animated === true;
  const app = createAuraApp(host, {
    scene: snapshot,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    pixelRatio: 1,
    resize: false,
    autoStart: animated,
    qualityRebuild: { flags: [qrList] }
  });
  await app.ready();

  // Phase 5 (§14): tonemap A/B + exposure ramp. `tm`/`exp` go through the C-05
  // surface (in-shader path under A3D_QR_CORE_OUTPUT; recorded intent otherwise).
  const tmParams = new URLSearchParams(window.location.search);
  const tmName = tmParams.get("tm") ?? tmParams.get("aura3d-tonemap");
  const expParam = tmParams.get("exp") ?? tmParams.get("aura3d-exp");
  const tmExposure = expParam === null ? NaN : Number(expParam);
  if (tmName !== null || Number.isFinite(tmExposure)) {
    app.setOutput?.({
      ...(tmName !== null ? { toneMapping: tmName as "aces" | "agx" | "neutral" | "none" | "linear" | "reinhard" } : {}),
      ...(Number.isFinite(tmExposure) ? { exposure: tmExposure } : {})
    });
    log.add("tone-mapping-variant", app.setOutput ? "supported" : "missing", `setOutput toneMapping=${tmName ?? "default"} exposure=${tmExposure}`);
  }

  const drawDeadline = performance.now() + 60_000;
  while (performance.now() < drawDeadline) {
    if (!animated) app.step(0);
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 || diagnostics.errors.length > 0) break;
    await sleep(50);
  }
  if (animated) {
    // Live motion: let the RAF loop run; strip captures photograph it mid-flight.
    for (let frame = 0; frame < (options.settleFrames ?? 6); frame += 1) await nextFrame();
  } else {
    const settleFrames = options.settleFrames ?? 12;
    const stepDt = options.stepDt ?? 1 / 30;
    for (let frame = 0; frame < settleFrames; frame += 1) {
      app.step(stepDt);
      await nextFrame();
    }
  }

  // Phase 6 (§15): steady-state measurement window. After the settle frames
  // the flagged path must be flat — zero program compiles, zero GL object
  // creations (C-28 deltas), zero RenderPipeline constructions, and a JS heap
  // delta ≤ 16 KB/frame. `performance.memory` is Chromium-only; absent → the
  // heap row reports "partial" rather than fabricating a number.
  const measureFrames = options.measureFrames ?? 120;
  const stepDt2 = options.stepDt ?? 1 / 30;
  const heapBefore = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  const before = steadyStateCounters(app);
  const pipelineBefore = RenderPipeline.constructedCount;
  for (let frame = 0; frame < measureFrames; frame += 1) {
    if (!animated) app.step(stepDt2);
    await nextFrame();
  }
  const after = steadyStateCounters(app);
  const heapAfter = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  const pipelineDelta = RenderPipeline.constructedCount - pipelineBefore;
  const compileDelta = (after.programCompiles ?? 0) - (before.programCompiles ?? 0);
  const bufferDelta = (after.bufferCreates ?? 0) - (before.bufferCreates ?? 0);
  const targetDelta = (after.renderTargetsCreated ?? 0) - (before.renderTargetsCreated ?? 0);
  const heapDeltaPerFrame = heapBefore !== undefined && heapAfter !== undefined ? (heapAfter - heapBefore) / measureFrames : null;
  log.add("zero-program-compiles", compileDelta === 0 ? "supported" : "missing", `programCompiles delta ${compileDelta} over ${measureFrames} frames`);
  log.add("zero-object-creates", bufferDelta === 0 && targetDelta === 0 ? "supported" : "missing", `bufferCreates ${bufferDelta} renderTargetsCreated ${targetDelta} over ${measureFrames} frames`);
  log.add("zero-pipeline-constructions", pipelineDelta === 0 ? "supported" : "missing", `RenderPipeline.constructedCount delta ${pipelineDelta} over ${measureFrames} frames`);
  log.add("js-heap-delta", heapDeltaPerFrame === null ? "partial" : heapDeltaPerFrame <= 16_384 ? "supported" : "missing", heapDeltaPerFrame === null ? "performance.memory unavailable" : `jsHeapDelta ${heapDeltaPerFrame.toFixed(0)} B/frame over ${measureFrames} frames`);

  const diagnostics = app.diagnostics();

  return {
    engine: "aura3d",
    scene: sceneId,
    engineVersion: typeof __AURA3D_VERSION__ === "string" ? __AURA3D_VERSION__ : "unknown",
    capabilityLog: log.entries,
    drawCalls: diagnostics.drawCalls,
    warnings: [...diagnostics.warnings],
    errors: [...diagnostics.errors],
    loadMs: Math.round(performance.now() - started),
    extra: {
      flags: qrList,
      drawCalls: diagnostics.drawCalls,
      output: (diagnostics as unknown as Record<string, unknown>).output,
      resolution: (diagnostics as unknown as Record<string, unknown>).resolution,
      programs: (diagnostics as unknown as Record<string, unknown>).programs,
      frameAllocations: (diagnostics as unknown as Record<string, unknown>).frameAllocations
    }
  };
}
