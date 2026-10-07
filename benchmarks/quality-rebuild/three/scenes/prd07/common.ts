/**
 * PRD-07 lane adapter runner (three r185 side). Mirrors
 * `three/common.ts:runThreeScene` for the lane spec fields and handles the
 * lane object kinds (`flipbook`, `emitterSet`) with documented three.js
 * quality settings. No Aura3D flags apply to the reference side.
 */
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { createRng, particlePositions } from "../../../shared/procedural";
import type { CapabilityEntry, CapabilityStatus, MaterialSpec, ReadyPayload } from "../../../shared/types";
import type { EmitterMemberSpec, Prd07SceneSpec } from "../../../scenes/prd07/specs";

declare const __THREE_VERSION__: string;

const EULER_ORDER: THREE.EulerOrder = "ZYX";

class CapabilityLog {
  readonly entries: CapabilityEntry[] = [];
  add(feature: string, status: CapabilityStatus, detail: string): void {
    this.entries.push({ feature, status, detail });
  }
}

function createMaterial(spec: MaterialSpec): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.color),
    roughness: spec.roughness,
    metalness: spec.metalness,
    transparent: spec.opacity !== undefined && spec.opacity < 1,
    opacity: spec.opacity ?? 1,
    ...(spec.emissive !== undefined ? { emissive: new THREE.Color(spec.emissive), emissiveIntensity: spec.emissiveIntensity ?? 1 } : {})
  });
}

/**
 * S8 — three r185 instanced-streak rain reference: thin boxes in a
 * camera-following volume, positions advanced to the capture time by the
 * same fall speed the Aura side uses (9 m/s scaled by intensity).
 */
function rainStreaks(count: number, seed: number, extent: [number, number, number], cameraTarget: readonly number[], time: number, intensity: number): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(0.016, 0.42, 0.016);
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color("#8fa8c9"), transparent: true, opacity: 0.4, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = "instanced rain streaks";
  const rng = createRng(seed);
  const fall = 9 * (0.6 + intensity * 0.8);
  const tilt = new THREE.Matrix4().makeRotationZ(0.06);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    const ox = (rng() - 0.5) * extent[0];
    const oy = rng() * extent[1];
    const oz = (rng() - 0.5) * extent[2];
    const raw = oy - fall * time;
    const y = ((raw % extent[1]) + extent[1]) % extent[1] - extent[1] / 2;
    dummy.position.set(cameraTarget[0] + ox, cameraTarget[1] + y, cameraTarget[2] + oz);
    dummy.matrixAutoUpdate = false;
    dummy.matrix.copy(new THREE.Matrix4().setPosition(dummy.position).multiply(tilt));
    dummy.updateMatrixWorld();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** S9 — three r185 snow: Points + radial sprite, depth-varied sizes. */
function snowPoints(count: number, seed: number, extent: [number, number, number], cameraTarget: readonly number[], time: number): THREE.Points {
  const rng = createRng(seed);
  const positions = new Float32Array(count * 3);
  const fall = 1.1;
  const swayFreq = 0.5;
  for (let i = 0; i < count; i += 1) {
    const ox = (rng() - 0.5) * extent[0];
    const oy = rng() * extent[1];
    const oz = (rng() - 0.5) * extent[2];
    const phase = rng() * Math.PI * 2;
    const raw = oy - fall * time;
    const y = ((raw % extent[1]) + extent[1]) % extent[1] - extent[1] / 2;
    positions[i * 3] = cameraTarget[0] + ox + Math.sin(time * swayFreq + phase) * 0.6;
    positions[i * 3 + 1] = cameraTarget[1] + y;
    positions[i * 3 + 2] = cameraTarget[2] + oz;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  // Snowflake-ish map: soft disc with a sharper core.
  const canvas = document.createElement("canvas");
  canvas.width = 32; canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(240,246,255,0.85)");
  grad.addColorStop(1, "rgba(240,246,255,0)");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 32, 32);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.PointsMaterial({
    color: new THREE.Color("#ffffff"), size: 0.14, sizeAttenuation: true,
    map, transparent: true, depthWrite: false
  });
  const points = new THREE.Points(geometry, material);
  points.name = "snow points";
  return points;
}

/** I4 — three r185 light-cone approximation for volumetric shafts. */
function lightConeMesh(options: { position: readonly number[]; direction: readonly number[]; length?: number; coneAngle?: number; color: string; intensity?: number }): THREE.Mesh {
  const length = options.length ?? 6;
  const radius = Math.tan(options.coneAngle ?? 0.3) * length;
  const geometry = new THREE.CylinderGeometry(0.02, radius, length, 24, 1, true);
  geometry.translate(0, -length / 2, 0);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(options.color),
    transparent: true,
    opacity: 0.1 * (options.intensity ?? 0.7),
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "light cone approx";
  mesh.position.set(options.position[0]!, options.position[1]!, options.position[2]!);
  const dir = new THREE.Vector3(options.direction[0]!, options.direction[1]!, options.direction[2]!).normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  return mesh;
}

function createGeometry(shape: string, size: readonly [number, number, number]): THREE.BufferGeometry {
  if (shape === "box") return new THREE.BoxGeometry(1, 1, 1).scale(size[0], size[1], size[2]);
  if (shape === "sphere") return new THREE.SphereGeometry(0.5, 64, 32).scale(size[0], size[1], size[2]);
  if (shape === "cylinder") return new THREE.CylinderGeometry(0.5, 0.5, 1, 48).scale(size[0], size[1], size[2]);
  const geometry = new THREE.PlaneGeometry(1, 1).scale(size[0], size[2], 1);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function createSpriteTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Deterministic seeded flipbook atlas: `columns*rows` frames of an expanding
 * fireball that cools into smoke (bright core -> dark alpha blob). Same seed
 * on both adapters must not be assumed pixel-identical — the Aura side draws
 * its own baked atlas once P1-T11/T12 land; S2 judges the read, not pixels.
 */
function createFlipbookAtlas(columns: number, rows: number, seed: number): THREE.Texture {
  const cell = 128;
  const canvas = document.createElement("canvas");
  canvas.width = columns * cell;
  canvas.height = rows * cell;
  const context = canvas.getContext("2d")!;
  const frames = columns * rows;
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const blobs: readonly { x: number; y: number; r: number; j: number }[] = Array.from({ length: 9 }, () => ({
    x: (next() - 0.5) * 0.5,
    y: (next() - 0.5) * 0.5,
    r: 0.35 + next() * 0.45,
    j: next()
  }));
  for (let frame = 0; frame < frames; frame += 1) {
    const t = frame / Math.max(1, frames - 1);
    const cx = (frame % columns) * cell;
    const cy = Math.floor(frame / columns) * cell;
    context.save();
    context.translate(cx, cy);
    context.beginPath();
    context.rect(0, 0, cell, cell);
    context.clip();
    // Fireball expands then dissipates: radius grows, heat cools.
    const heat = Math.max(0, 1 - t * 1.4);
    for (const blob of blobs) {
      const grow = 0.25 + t * 1.3;
      const bx = cell * 0.5 + blob.x * cell * (0.2 + t * 0.7);
      const by = cell * 0.5 + blob.y * cell * (0.2 + t * 0.7) - t * cell * 0.12;
      const br = blob.r * cell * grow * 0.5;
      const alpha = Math.max(0, (1 - t) * (0.85 + blob.j * 0.15));
      const gradient = context.createRadialGradient(bx, by, 0, bx, by, br);
      const rr = Math.round(255);
      const gg = Math.round(140 + 80 * (1 - heat));
      const bb = Math.round(50 + 130 * (1 - heat));
      gradient.addColorStop(0, `rgba(${rr},${gg},${bb},${alpha.toFixed(3)})`);
      gradient.addColorStop(0.6, `rgba(${rr},${gg},${bb},${(alpha * 0.45).toFixed(3)})`);
      gradient.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, cell, cell);
    }
    context.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

interface FlipbookHandle {
  readonly texture: THREE.Texture;
  readonly columns: number;
  readonly rows: number;
  readonly frame: number;
}

/** Advance a sprite's UV window to `frame` (col-major within the sheet). */
function setFlipbookFrame(texture: THREE.Texture, columns: number, rows: number, frame: number): void {
  const col = frame % columns;
  const row = Math.floor(frame / columns) % rows;
  texture.repeat.set(1 / columns, 1 / rows);
  texture.offset.set(col / columns, 1 - (row + 1) / rows);
  texture.needsUpdate = true;
}

function pointsFor(member: EmitterMemberSpec, texture: THREE.Texture): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(particlePositions(member.count, member.seed, member.center, member.radius, member.height), 3));
  const material = new THREE.PointsMaterial({
    color: new THREE.Color(member.color),
    size: member.size,
    sizeAttenuation: true,
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: member.blending === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  const points = new THREE.Points(geometry, material);
  points.name = member.name;
  return points;
}

async function nextFrame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

export async function runPrd07ThreeScene(spec: Prd07SceneSpec, host: HTMLElement): Promise<ReadyPayload> {
  const started = performance.now();
  const log = new CapabilityLog();
  const warnings: string[] = [];
  const errors: string[] = [];

  if (THREE.REVISION !== "185") errors.push(`Expected three r185 (0.185.1); loaded r${THREE.REVISION}.`);

  const { width, height, devicePixelRatio } = spec.resolution;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = spec.exposure;
  renderer.shadowMap.enabled = Boolean(spec.shadows);
  renderer.info.autoReset = false;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  log.add("tone-mapping:aces-filmic", "supported", "renderer.toneMapping = ACESFilmicToneMapping");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(spec.camera.fov, width / height, spec.camera.near, spec.camera.far);
  camera.position.set(...spec.camera.position);
  camera.lookAt(new THREE.Vector3(...spec.camera.target));
  camera.updateMatrixWorld();

  if (spec.background.kind === "color") scene.background = new THREE.Color(spec.background.color);
  if (spec.fog) {
    if (spec.fog.mode === "exp2") {
      scene.fog = new THREE.FogExp2(new THREE.Color(spec.fog.color), spec.fog.density);
      log.add("fog-exp2", "supported", `FogExp2 ${spec.fog.color} density ${spec.fog.density}`);
    } else {
      // Approximation: three has no height/absorption/linear §6.6 fog — fold
      // heightDensity into the FogExp2 constant and mark partial.
      const approx = spec.fog.mode === "absorption"
        ? (0.2126 * spec.fog.absorption![0] + 0.7152 * spec.fog.absorption![1] + 0.0722 * spec.fog.absorption![2])
        : spec.fog.density + (spec.fog.heightDensity ?? 0);
      scene.fog = new THREE.FogExp2(new THREE.Color(spec.fog.color), approx);
      log.add(`fog-${spec.fog.mode}`, "partial", `FogExp2 approximation density ${approx.toFixed(4)} (three lacks §6.6 modes)`);
    }
  }
  if (spec.fogTransition) {
    // No three equivalent — apply the target spec statically.
    scene.fog = new THREE.FogExp2(new THREE.Color(spec.fogTransition.to.color), spec.fogTransition.to.density);
    log.add("fog-transition", "partial", `setFog transition has no three equivalent; target ${spec.fogTransition.to.color} density ${spec.fogTransition.to.density} applied statically`);
  }
  for (const _v of spec.fogVolumes ?? []) {
    log.add("fogVolume", "missing", "local fog volumes have no three equivalent");
  }

  // P3-T7 sky scenes — r185 Sky.js at the same sun as the Aura spec.
  if (spec.skyPreetham) {
    const skyMesh = new Sky();
    skyMesh.scale.setScalar(450000);
    const theta = (spec.skyPreetham.azimuthDeg * Math.PI) / 180;
    const phi = Math.PI / 2 - (spec.skyPreetham.elevationDeg * Math.PI) / 180;
    const sun = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    const uniforms = skyMesh.material.uniforms;
    uniforms.sunPosition!.value.copy(sun);
    uniforms.turbidity!.value = spec.skyPreetham.turbidity ?? 10;
    uniforms.rayleigh!.value = 3;
    uniforms.mieCoefficient!.value = 0.005;
    uniforms.mieDirectionalG!.value = 0.8;
    scene.add(skyMesh);
    log.add("sky-preetham", "supported", `Sky.js turbidity ${spec.skyPreetham.turbidity ?? 10}, rayleigh 3, sun ${spec.skyPreetham.elevationDeg}°/${spec.skyPreetham.azimuthDeg}°`);
  }
  if (spec.dayNight) {
    const skyMesh = new Sky();
    skyMesh.scale.setScalar(450000);
    // Mirror createDayNightSky: azimuth = (hour-6)/12·π, elevation = sin(azimuth)·1.1.
    const angle = ((spec.dayNight.hour - 6) / 12) * Math.PI;
    const elevation = Math.sin(angle) * 1.1;
    const phi = Math.PI / 2 - elevation;
    const sun = new THREE.Vector3().setFromSphericalCoords(1, phi, angle);
    const uniforms = skyMesh.material.uniforms;
    uniforms.sunPosition!.value.copy(sun);
    uniforms.turbidity!.value = 10;
    uniforms.rayleigh!.value = 2;
    uniforms.mieCoefficient!.value = 0.005;
    uniforms.mieDirectionalG!.value = 0.7;
    scene.add(skyMesh);
    log.add("dayNight", "partial", `Sky.js sun at hour ${spec.dayNight.hour} (elevation ${(elevation * 180 / Math.PI).toFixed(1)}°); no stars/moon on the three side`);
  }

  for (const light of spec.lights) {
    if (light.kind === "ambient") {
      scene.add(new THREE.AmbientLight(new THREE.Color(light.color), light.intensity));
    } else if (light.kind === "directional") {
      const directional = new THREE.DirectionalLight(new THREE.Color(light.color), light.intensity);
      directional.position.set(...light.position);
      directional.target.position.set(...light.target);
      directional.castShadow = light.castShadow;
      scene.add(directional, directional.target);
    } else if (light.kind === "point") {
      const point = new THREE.PointLight(new THREE.Color(light.color), light.intensity);
      point.position.set(...light.position);
      scene.add(point);
    }
  }

  const spriteTexture = createSpriteTexture();
  const flipbooks: FlipbookHandle[] = [];

  const meshesByName = new Map<string, THREE.Mesh>();
  for (const object of spec.objects) {
    if (object.kind === "primitive") {
      const mesh = new THREE.Mesh(createGeometry(object.shape, object.size), createMaterial(object.material));
      mesh.name = object.name;
      mesh.position.set(...object.position);
      if (object.rotation) mesh.rotation.set(...object.rotation, EULER_ORDER);
      mesh.castShadow = object.castShadow;
      mesh.receiveShadow = object.receiveShadow;
      scene.add(mesh);
      meshesByName.set(object.name, mesh);
    } else if (object.kind === "decal") {
      // §6.9 — r185 DecalGeometry projected onto the named host primitive.
      // `runtime` decals render identically on the three side.
      const host = meshesByName.get(object.target);
      const normal = new THREE.Vector3(...(object.normal ?? [0, 1, 0])).normalize();
      const projector = new THREE.Object3D();
      projector.position.set(...object.position);
      projector.lookAt(projector.position.clone().add(normal));
      projector.rotateZ(((object.rotationDeg ?? 0) * Math.PI) / 180);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(object.color),
        transparent: true,
        opacity: object.opacity ?? 0.85,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        depthTest: true,
        depthWrite: false,
        roughness: 0.9,
        metalness: 0
      });
      if (host) {
        const geometry = new DecalGeometry(
          host,
          projector.position,
          projector.rotation.clone(),
          new THREE.Vector3(object.size[0], object.size[1], 0.6)
        );
        const decalMesh = new THREE.Mesh(geometry, material);
        decalMesh.name = object.name;
        scene.add(decalMesh);
        log.add("decal", "supported", `DecalGeometry "${object.name}" on "${object.target}" (${object.size[0]}×${object.size[1]})`);
      } else {
        log.add("decal", "missing", `target "${object.target}" not a scene primitive`);
      }
    } else if (object.kind === "particles") {
      scene.add(pointsFor({ name: object.name, seed: object.seed, count: object.count, center: object.center, radius: object.radius, height: object.height, color: object.color, size: object.size, blending: object.blending }, spriteTexture));
      log.add("particles", "supported", `THREE.Points x${object.count}, seeded positions, ${object.blending}`);
    } else if (object.kind === "flipbook") {
      const atlas = createFlipbookAtlas(object.atlas.columns, object.atlas.rows, object.atlas.seed);
      setFlipbookFrame(atlas, object.atlas.columns, object.atlas.rows, 0);
      const material = new THREE.SpriteMaterial({
        map: atlas,
        color: object.color ? new THREE.Color(object.color) : new THREE.Color(0xffffff),
        transparent: true,
        depthWrite: false,
        blending: object.blending === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending
      });
      const sprite = new THREE.Sprite(material);
      sprite.name = object.name;
      sprite.position.set(...object.position);
      sprite.scale.setScalar(object.size);
      scene.add(sprite);
      const frames = object.atlas.columns * object.atlas.rows;
      const start = object.startAt ?? 0;
      flipbooks.push({
        texture: atlas,
        columns: object.atlas.columns,
        rows: object.atlas.rows,
        frame: Math.floor(((spec.time + start) * object.atlas.frameRate) % frames)
      });
      log.add("flipbook", "supported", `THREE.Sprite + SpriteMaterial, ${object.atlas.columns}x${object.atlas.rows} sheet, frame @ capture t=${spec.time}`);
    } else if (object.kind === "emitterSet") {
      for (const member of object.emitters) scene.add(pointsFor(member, spriteTexture));
      log.add("emitterSet", "supported", `${object.emitters.length} emitters, ${object.emitters.reduce((s, e) => s + e.count, 0)} points total`);
    } else if (object.kind === "weather") {
      const extent: [number, number, number] = object.weather === "snow" ? [36, 18, 36] : [40, 24, 40];
      const count = object.weather === "snow" ? 4000 : 3500;
      if (object.weather === "snow") {
        scene.add(snowPoints(count, object.seed ?? 1, extent, spec.camera.target, spec.time));
        log.add("weather-snow", "supported", `THREE.Points ${count} flakes, seeded, advanced to t=${spec.time}`);
      } else {
        scene.add(rainStreaks(count, object.seed ?? 1, extent, spec.camera.target, spec.time, object.intensity));
        log.add("weather-rain", "supported", `InstancedMesh ${count} streaks, advanced to t=${spec.time}`);
      }
    } else if (object.kind === "lightCone") {
      scene.add(lightConeMesh(object));
      log.add("lightCone", "partial", "additive cone approximation (no inscatter)");
    }
  }
  if (spec.volumetric) {
    // I4 approximation: a global FogExp2 at the volumetric density — froxel
    // shafts have no three equivalent without a custom raymarch pass.
    scene.fog = new THREE.FogExp2(new THREE.Color(spec.volumetric.color ?? "#cfd8e6"), spec.volumetric.density * 3);
    log.add("volumetric", "partial", `FogExp2 approximation at density ${spec.volumetric.density * 3} — no froxel shafts`);
  }

  for (const fb of flipbooks) setFlipbookFrame(fb.texture, fb.columns, fb.rows, fb.frame);

  const renderFrame = (): void => {
    renderer.info.reset();
    renderer.render(scene, camera);
  };

  await renderer.compileAsync(scene, camera);
  for (let frame = 0; frame < spec.settleFrames; frame += 1) {
    renderFrame();
    await nextFrame();
  }
  renderFrame();
  await nextFrame();

  return {
    engine: "three",
    scene: spec.id,
    engineVersion: __THREE_VERSION__,
    capabilityLog: log.entries,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    warnings,
    errors,
    loadMs: Math.round(performance.now() - started),
    extra: { revision: THREE.REVISION, programs: renderer.info.programs?.length ?? 0 }
  };
}
