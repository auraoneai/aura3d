/**
 * PRD-01 lane mount helper (three side, r185). Renders a Prd01LaneSceneSpec
 * with the same conventions as three/common.ts: sRGB output, ACESFilmic tone
 * mapping by default, pixelRatio = stage DPR (1 for captures).
 */

import * as THREE from "three";
import type { CapabilityEntry, CapabilityStatus, ReadyPayload } from "../../../shared/types";
import type {
  Prd01BlendMode,
  Prd01LaneSceneSpec,
  Prd01LightSpec,
  Prd01MaterialSpec,
  Prd01ShapeName,
  Prd01ShapeNode
} from "../../../scenes/prd01/types";

declare const __THREE_VERSION__: string;

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

class CapabilityLog {
  readonly entries: CapabilityEntry[] = [];
  add(feature: string, status: CapabilityStatus, detail: string): void {
    this.entries.push({ feature, status, detail });
  }
}

const TONE_MAPPING: Record<string, THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping
};

const BLENDING: Record<Prd01BlendMode, THREE.Blending> = {
  normal: THREE.NormalBlending,
  additive: THREE.AdditiveBlending,
  multiply: THREE.MultiplyBlending,
  screen: THREE.CustomBlending,
  overlay: THREE.CustomBlending
};

function geometryFor(shape: Prd01ShapeName): THREE.BufferGeometry {
  switch (shape) {
    case "box":
      return new THREE.BoxGeometry(1, 1, 1);
    case "sphere":
      return new THREE.SphereGeometry(0.5, 64, 32);
    case "plane":
      return new THREE.PlaneGeometry(1, 1);
    case "cylinder":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 48);
    case "capsule":
      return new THREE.CapsuleGeometry(0.35, 0.55, 8, 32);
    case "torus":
      return new THREE.TorusGeometry(0.5, 0.2, 24, 64);
    default:
      throw new Error(`unknown shape ${shape satisfies never}`);
  }
}

function threeMaterial(spec: Prd01MaterialSpec): THREE.Material {
  if (spec.emissive !== undefined || spec.emissiveIntensity !== undefined) {
    return new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.emissive ?? spec.color).multiplyScalar(spec.emissiveIntensity ?? 1) });
  }
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.color),
    metalness: spec.metalness ?? 0,
    roughness: spec.roughness ?? 0.7
  });
  if (spec.opacity !== undefined && spec.opacity < 1) {
    mat.transparent = true;
    mat.opacity = spec.opacity;
    mat.depthWrite = false;
  }
  if (spec.blend && spec.blend !== "normal") {
    if (spec.blend === "screen") {
      mat.blending = THREE.CustomBlending;
      mat.blendEquation = THREE.AddEquation;
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneMinusSrcColorFactor;
    } else if (spec.blend === "overlay") {
      // No native overlay blending — approximate: custom src*dst-aware mix is not
      // expressible in fixed-function state; log and use screen-like one-src-dst.
      mat.blending = THREE.CustomBlending;
      mat.blendEquation = THREE.AddEquation;
      mat.blendSrc = THREE.DstColorFactor;
      mat.blendDst = THREE.OneMinusSrcColorFactor;
    } else {
      mat.blending = BLENDING[spec.blend];
    }
    mat.transparent = true;
    mat.depthWrite = false;
  }
  return mat;
}

function shapeNodeToThree(node: Prd01ShapeNode): THREE.Object3D {
  const mesh = new THREE.Mesh(geometryFor(node.shape), threeMaterial(node.material));
  mesh.name = node.id;
  mesh.rotation.order = "ZYX";
  if (node.position) mesh.position.set(...(node.position as [number, number, number]));
  if (node.rotation) mesh.rotation.set(...(node.rotation as [number, number, number]));
  if (node.scale !== undefined) {
    const s = node.scale;
    if (typeof s === "number") mesh.scale.setScalar(s);
    else mesh.scale.set(...(s as [number, number, number]));
  }
  if (node.children?.length) {
    const grp = new THREE.Group();
    grp.name = `${node.id}-children`;
    grp.add(mesh);
    for (const child of node.children) grp.add(shapeNodeToThree(child));
    return grp;
  }
  return mesh;
}

function threeLight(spec: Prd01LightSpec, movers: { light: THREE.DirectionalLight; center: THREE.Vector3; radius: number; period: number }[]): THREE.Object3D {
  if (spec.kind === "ambient") return new THREE.AmbientLight(new THREE.Color(spec.color), spec.intensity);
  const light = new THREE.DirectionalLight(new THREE.Color(spec.color), spec.intensity);
  if (spec.orbitCenter) {
    const center = new THREE.Vector3(...(spec.orbitCenter as [number, number, number]));
    const radius = spec.orbitRadius ?? 4;
    const period = spec.orbitPeriodSeconds ?? 4;
    movers.push({ light, center, radius, period });
    light.position.set(center.x + radius, center.y, center.z);
  } else {
    light.position.set(...(spec.position ?? [3, 4, 3]) as [number, number, number]);
  }
  return light;
}

export async function mountThreeLaneScene(sceneId: string, spec: Prd01LaneSceneSpec, host: HTMLElement): Promise<ReadyPayload> {
  const started = performance.now();
  const log = new CapabilityLog();
  const width = host.clientWidth || 1280;
  const height = host.clientHeight || 720;

  const params = new URLSearchParams(window.location.search);
  const tmName = params.get("tm") ?? "aces";
  const exposure = Number(params.get("exp") ?? "1");

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const toneMapping = TONE_MAPPING[tmName];
  if (toneMapping === undefined) throw new Error(`unknown tone mapping ${tmName}`);
  renderer.toneMapping = toneMapping;
  renderer.toneMappingExposure = Number.isFinite(exposure) ? exposure : 1;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(spec.background);
  const cameraObj = new THREE.PerspectiveCamera(spec.camera.fov, width / height, 0.05, 500);
  cameraObj.position.set(...(spec.camera.position as [number, number, number]));
  cameraObj.lookAt(new THREE.Vector3(...(spec.camera.target as [number, number, number])));

  const movers: { light: THREE.DirectionalLight; center: THREE.Vector3; radius: number; period: number }[] = [];
  for (const light of spec.lights) scene.add(threeLight(light, movers));

  const content = spec.content;
  if (content.kind === "hierarchy") {
    for (const grp of content.groups) {
      const g = new THREE.Group();
      g.name = grp.id;
      if (grp.transform.position) g.position.set(...(grp.transform.position as [number, number, number]));
      g.rotation.order = "ZYX";
      if (grp.transform.rotation) g.rotation.set(...(grp.transform.rotation as [number, number, number]));
      if (grp.transform.scale !== undefined) {
        const s = grp.transform.scale;
        if (typeof s === "number") g.scale.setScalar(s);
        else g.scale.set(...(s as [number, number, number]));
      }
      for (const child of grp.children) g.add(shapeNodeToThree(child));
      scene.add(g);
    }
    log.add("hierarchy-groups", "supported", "Object3D groups with nested transforms");
  } else if (content.kind === "tonemap-ramp") {
    const spacing = 0.62;
    const x0 = (-(content.emissiveStops.length - 1) * spacing) / 2;
    content.emissiveStops.forEach((stop, index) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.55, 0.08),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(stop) })
      );
      mesh.position.set(x0 + index * spacing, 0.55, 0);
      scene.add(mesh);
    });
    const grey = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.35, 0.1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(content.greyLevel) })
    );
    grey.position.set(0, -0.35, 0);
    scene.add(grey);
    log.add("tone-mapping-variant", "supported", `toneMapping=${tmName} exposure=${renderer.toneMappingExposure}`);
  } else if (content.kind === "blend-modes") {
    const spacing = 1.05;
    const x0 = (-(content.modes.length - 1) * spacing) / 2;
    content.modes.forEach((mode, index) => {
      const x = x0 + index * spacing;
      const back = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshBasicMaterial({ color: new THREE.Color(content.backColor) }));
      back.position.set(x, 0.5, -0.03);
      scene.add(back);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), threeMaterial({ color: content.frontColor, opacity: content.frontOpacity, blend: mode }));
      front.position.set(x + 0.12, 0.5, 0.03);
      front.name = `blend-front-${mode}`;
      scene.add(front);
    });
    log.add("blend-modes", "supported", "normal/additive/multiply native; screen+overlay via CustomBlending (overlay is an approximation)");
  } else if (content.kind === "specular-aa") {
    const spacing = 1.05;
    const x0 = (-(content.sphereCount - 1) * spacing) / 2;
    for (let i = 0; i < content.sphereCount; i += 1) {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.48, 96, 48),
        new THREE.MeshStandardMaterial({ color: new THREE.Color("#d7dce4"), metalness: content.metalness, roughness: content.roughness })
      );
      sphere.position.set(x0 + i * spacing, 0.55, 0);
      scene.add(sphere);
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: new THREE.Color("#1a2029"), roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    log.add("specular-aa", "supported", "metalness=1 roughness=0.05 under orbiting directional light");
  } else if (content.kind === "primitive-catalog") {
    const spacing = 1.15;
    const x0 = (-(content.shapes.length - 1) * spacing) / 2;
    content.shapes.forEach((shape, index) => {
      const mesh = new THREE.Mesh(
        geometryFor(shape),
        new THREE.MeshStandardMaterial({ color: new THREE.Color("#b8b3a9"), roughness: 0.72, metalness: 0.02 })
      );
      mesh.name = `shape-${shape}`;
      mesh.position.set(x0 + index * spacing, 0.62, 0);
      mesh.scale.setScalar(shape === "plane" ? 0.9 : 0.8);
      scene.add(mesh);
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: new THREE.Color("#151a21"), roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.05;
    scene.add(floor);
    log.add("primitive-catalog", "supported", "sphere 64x32, cylinder 48 segments — contract conventions");
  } else {
    const { rows, cols } = content.uniqueMaterials;
    const cell = 0.42;
    const x0 = (-(cols - 1) * cell) / 2;
    const z0 = 2.2;
    const geo = new THREE.BoxGeometry(0.34, 0.3, 0.34);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const hue = (360 * (row * cols + col)) / (rows * cols);
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${Math.round(hue)}, 62%, 52%)`), roughness: 0.55, metalness: 0.1 }));
        mesh.position.set(x0 + col * cell, 0.28, z0 + row * cell);
        scene.add(mesh);
      }
    }
    const inst = content.instanced;
    const ix0 = (-(inst.cols - 1) * inst.spacing) / 2;
    const iz0 = -(Math.ceil(inst.count / inst.cols) * inst.spacing) / 2 - 1.5;
    const imesh = new THREE.InstancedMesh(geometryFor(inst.shape), new THREE.MeshStandardMaterial({ color: new THREE.Color("#ffffff"), roughness: 0.6, metalness: 0.05 }), inst.count);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < inst.count; i += 1) {
      const col = i % inst.cols;
      const row = Math.floor(i / inst.cols);
      dummy.position.set(ix0 + col * inst.spacing, 0.22, iz0 + row * inst.spacing);
      dummy.scale.setScalar(0.4);
      dummy.updateMatrix();
      imesh.setMatrixAt(i, dummy.matrix);
      imesh.setColorAt(i, color.set(`hsl(${Math.round((360 * i) / inst.count)}, 55%, 55%)`));
    }
    imesh.instanceMatrix.needsUpdate = true;
    if (imesh.instanceColor) imesh.instanceColor.needsUpdate = true;
    scene.add(imesh);
    log.add("instancing", "supported", `InstancedMesh x${inst.count}`);
    if (content.skinned.requested > 0) {
      log.add("skinned-humans", "missing", `${content.skinned.requested} skinned humans declared but not mounted — no rigged assets in the lane bundle yet.`);
    }
  }

  await renderer.compileAsync(scene, cameraObj);
  const renderFrame = () => renderer.render(scene, cameraObj);
  const clock = new THREE.Clock();
  if (spec.animated && movers.length > 0) {
    renderer.setAnimationLoop(() => {
      const t = clock.getElapsedTime();
      for (const mover of movers) {
        const angle = (2 * Math.PI * t) / mover.period;
        mover.light.position.set(mover.center.x + Math.cos(angle) * mover.radius, mover.center.y, mover.center.z + Math.sin(angle) * mover.radius);
      }
      renderFrame();
    });
    for (let frame = 0; frame < 6; frame += 1) await nextFrame();
  } else {
    for (let frame = 0; frame < 12; frame += 1) {
      renderFrame();
      await nextFrame();
    }
  }

  return {
    engine: "three",
    scene: sceneId,
    engineVersion: typeof __THREE_VERSION__ === "string" ? __THREE_VERSION__ : "unknown",
    capabilityLog: log.entries,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    warnings: [],
    errors: [],
    loadMs: Math.round(performance.now() - started),
    extra: {
      revision: THREE.REVISION,
      toneMapping: tmName,
      exposure: renderer.toneMappingExposure,
      programs: renderer.info.programs?.length ?? 0
    }
  };
}
