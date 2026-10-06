/**
 * PRD-07 lane adapter runner (three r185 side). Mirrors
 * `three/common.ts:runThreeScene` for the lane spec fields and handles the
 * lane object kinds (`flipbook`, `emitterSet`) with documented three.js
 * quality settings. No Aura3D flags apply to the reference side.
 */
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { particlePositions } from "../../../shared/procedural";
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
    ...(spec.emissive !== undefined ? { emissive: new THREE.Color(spec.emissive), emissiveIntensity: spec.emissiveIntensity ?? 1 } : {})
  });
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

  for (const object of spec.objects) {
    if (object.kind === "primitive") {
      const mesh = new THREE.Mesh(createGeometry(object.shape, object.size), createMaterial(object.material));
      mesh.name = object.name;
      mesh.position.set(...object.position);
      if (object.rotation) mesh.rotation.set(...object.rotation, EULER_ORDER);
      mesh.castShadow = object.castShadow;
      mesh.receiveShadow = object.receiveShadow;
      scene.add(mesh);
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
    }
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
