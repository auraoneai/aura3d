/**
 * B1 three.js asset bridge: walk a built three.js scene, assign stable ids,
 * pull out what the bridge emits natively (lights, camera, background, output),
 * and classify every construct as supported / approximated / unsupported.
 *
 * Nothing is silently substituted: anything the GLB cannot carry and the
 * emitted source does not reproduce is an `unsupported` row, and anything the
 * bridge changes on the way (a stripped texture, a converted material) is at
 * least `approximated`. Suggested native routes reuse the `aura3d migrate
 * three` mapping table so the two tools give the same advice.
 */

import { threeMappingFor } from "../migrate-three/mappings.js";
import type {
  BridgeCamera,
  BridgeLight,
  BridgeSceneData,
  CompatRow,
  ThreeBridgeFactoryResult,
  ThreeLike,
  ThreeMaterialLike,
  ThreeObjectLike,
  ThreeVector3Like
} from "./contract.js";

type Vec3 = readonly [number, number, number];

const TEXTURE_SLOTS = [
  "map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap", "alphaMap", "bumpMap",
  "displacementMap", "lightMap", "clearcoatMap", "clearcoatNormalMap", "clearcoatRoughnessMap",
  "transmissionMap", "thicknessMap", "sheenColorMap", "sheenRoughnessMap", "specularIntensityMap",
  "specularColorMap", "iridescenceMap", "iridescenceThicknessMap", "anisotropyMap", "envMap", "gradientMap", "matcap"
] as const;

/** Materials GLTFExporter writes as-is (core glTF PBR or its KHR extensions). */
const EXPORTED_AS_IS = new Set(["MeshStandardMaterial", "MeshPhysicalMaterial"]);
/** Materials GLTFExporter converts to a metallic-roughness material with a warning. */
const EXPORT_CONVERTED = new Set(["MeshLambertMaterial", "MeshPhongMaterial", "MeshToonMaterial", "MeshMatcapMaterial", "MeshNormalMaterial", "MeshDepthMaterial", "MeshDistanceMaterial", "LineBasicMaterial", "LineDashedMaterial", "PointsMaterial"]);

/** Path separator inside stable ids. three's PropertyBinding reserves `[ ] . : /` in node names, so ids avoid them. */
export const ID_SEPARATOR = "__";

export function slugId(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Stable id per object: an explicit `userData.auraId` wins; otherwise the
 * parent id plus the slugged name (or lower-cased type), suffixed `_1`, `_2`
 * among same-named siblings. The same generator structure and seed therefore
 * yields the same ids, so native edits keyed by id survive regeneration.
 * Writes the id to `userData.auraId` (exported as glTF extras) and to `name`
 * (glTF node name, what `hiddenNodeNames` addresses); the original name is
 * kept in `userData.threeName`, and `renamed` maps original name to id so
 * animation tracks addressed by name can be retargeted.
 */
export function assignStableIds(root: ThreeObjectLike, rows: CompatRow[], renamed: Map<string, string> = new Map()): string[] {
  const ids: string[] = [];
  const used = new Set<string>();
  const visit = (object: ThreeObjectLike, parentId: string): void => {
    const seen = new Map<string, number>();
    for (const child of object.children) {
      const explicit = typeof child.userData.auraId === "string" && child.userData.auraId.length > 0 ? child.userData.auraId.replace(/[[\].:/\\]/g, "_") : undefined;
      let id: string;
      if (explicit !== undefined) {
        id = explicit;
      } else {
        const base = slugId(child.name) || child.type.toLowerCase();
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        const local = n === 0 ? base : `${base}_${n}`;
        id = parentId ? `${parentId}${ID_SEPARATOR}${local}` : local;
      }
      if (used.has(id)) {
        let k = 1;
        while (used.has(`${id}~${k}`)) k += 1;
        rows.push({ status: "approximated", construct: "userData.auraId", subject: id, note: `duplicate stable id; this node was renamed ${id}~${k}. Give each node a unique userData.auraId.` });
        id = `${id}~${k}`;
      }
      used.add(id);
      if (child.name && child.name !== id) {
        child.userData.threeName = child.name;
        if (!renamed.has(child.name)) renamed.set(child.name, id);
      }
      child.userData.auraId = id;
      child.name = id;
      ids.push(id);
      visit(child, id);
    }
  };
  visit(root, "");
  return ids;
}

function hex(color: { getHexString(): string } | undefined, fallback = "#ffffff"): string {
  return color ? `#${color.getHexString()}` : fallback;
}

function round(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function vec(v: ThreeVector3Like): Vec3 {
  return [round(v.x), round(v.y), round(v.z)];
}

/** Native route for a construct, from the `aura3d migrate three` mapping table (its long note stays in that table). */
function suggestion(construct: string): { nativeTarget?: string } {
  const row = threeMappingFor(construct);
  if (!row || !row.target) return {};
  return { nativeTarget: row.target };
}

function materialList(object: ThreeObjectLike): ThreeMaterialLike[] {
  if (!object.material) return [];
  return Array.isArray(object.material) ? object.material : [object.material];
}

interface TextureLike {
  readonly isTexture?: boolean;
  readonly isDataTexture?: boolean;
  readonly isCompressedTexture?: boolean;
  readonly image?: { readonly data?: unknown; readonly width?: number; readonly height?: number } | null;
  readonly format?: number;
}

export interface AnalyzeOutput {
  readonly data: BridgeSceneData;
  readonly rows: CompatRow[];
  /** Undo the export-time edits (lights detached, unsupported textures stripped). */
  restore(): void;
}

/**
 * Analyse the factory result and prepare the scene for export. Lights are
 * detached (the bridge emits them as native `lights.*` nodes so they stay
 * editable and are not doubled through KHR_lights_punctual); textures the
 * headless exporter cannot rasterise are detached and reported.
 */
export function analyzeAndPrepare(THREE: ThreeLike, name: string, result: ThreeBridgeFactoryResult, rows: CompatRow[], nodeIds: readonly string[]): AnalyzeOutput {
  const Vector3 = THREE.Vector3 as new (x?: number, y?: number, z?: number) => ThreeVector3Like;
  const MaterialProto = (THREE.Material as { prototype: { onBeforeCompile?: unknown } } | undefined)?.prototype;
  const scene = result.scene;
  scene.updateMatrixWorld(true);

  const lights: BridgeLight[] = [];
  const hidden: string[] = [];
  const materialNames: string[] = [];
  const undo: (() => void)[] = [];
  const seenMaterials = new Set<string>();
  let castShadow = false;
  let receiveShadow = false;
  let unnamedMaterial = 0;
  const detach: ThreeObjectLike[] = [];
  const flatBaked = new Map<unknown, unknown>();
  const uncarried = new Set<string>();

  scene.traverse((object) => {
    if (object === scene) return;
    const id = String(object.userData.auraId ?? object.name);
    if (!object.visible) {
      hidden.push(id);
      rows.push({ status: "supported", construct: "Object3D.visible=false", subject: id, note: "exported with onlyVisible:false and hidden again through model({ hiddenNodeNames })" });
    }
    if (object.isLight) {
      detach.push(object);
      const kind = object.type;
      const world = vec(object.getWorldPosition(new Vector3()));
      const targetWorld = object.target ? (object.target.updateMatrixWorld(true), vec(object.target.getWorldPosition(new Vector3()))) : undefined;
      const base = { id, color: hex(object.color), intensity: round(object.intensity ?? 1) };
      if (kind === "AmbientLight") lights.push({ ...base, kind: "ambient" });
      else if (kind === "HemisphereLight") lights.push({ ...base, kind: "hemisphere", groundColor: hex(object.groundColor, "#444444"), position: world });
      else if (kind === "DirectionalLight") lights.push({ ...base, kind: "directional", position: world, ...(targetWorld ? { target: targetWorld } : {}), shadow: object.castShadow === true });
      else if (kind === "PointLight") lights.push({ ...base, kind: "point", position: world, ...(object.distance ? { distance: round(object.distance) } : {}), decay: object.decay ?? 2, shadow: object.castShadow === true });
      else if (kind === "SpotLight") lights.push({ ...base, kind: "spot", position: world, ...(targetWorld ? { target: targetWorld } : {}), ...(object.distance ? { distance: round(object.distance) } : {}), decay: object.decay ?? 2, angle: round(object.angle ?? Math.PI / 3), penumbra: round(object.penumbra ?? 0), shadow: object.castShadow === true });
      else {
        rows.push({ status: "unsupported", construct: kind, subject: id, note: "light type is not emitted by the bridge", ...suggestion(kind) });
        return;
      }
      rows.push({ status: "supported", construct: kind, subject: id, note: `emitted as native lights.${lights[lights.length - 1]!.kind} (world-space position/target; three intensity carried 1:1)` });
      return;
    }
    if (object.isCamera) {
      detach.push(object);
      if (object !== result.camera) rows.push({ status: "unsupported", construct: object.type, subject: id, note: "extra cameras are not emitted; only the factory's main camera becomes the scene camera" });
      return;
    }
    if (object.isSprite) {
      rows.push({ status: "unsupported", construct: "Sprite", subject: id, note: "GLTFExporter skips sprites", ...suggestion("Sprite") });
      return;
    }
    if (object.isPoints || object.isLine) {
      const construct = object.isPoints ? "Points" : object.type;
      rows.push({ status: "approximated", construct, subject: id, note: "exported as a glTF POINTS/LINES primitive; point size and line width are not carried", ...(object.isPoints ? { nativeTarget: suggestion("Points").nativeTarget } : {}) });
    }
    if (object.isMesh) {
      if (object.castShadow) castShadow = true;
      if (object.receiveShadow) receiveShadow = true;
      if (object.isInstancedMesh) {
        rows.push(object.instanceColor
          ? { status: "approximated", construct: "InstancedMesh.instanceColor", subject: id, note: "instances export through EXT_mesh_gpu_instancing; per-instance colours are written as _COLOR_0 and may render with the base colour" }
          : { status: "supported", construct: "InstancedMesh", subject: id, note: "exported through EXT_mesh_gpu_instancing" });
      } else if (object.isSkinnedMesh) {
        rows.push({ status: "supported", construct: "SkinnedMesh", subject: id, note: "skin and joints exported" });
      }
      // glTF has no flatShading flag: bake faceted normals into a non-indexed copy so the look survives.
      const geometry = object.geometry as (ThreeObjectLike["geometry"] & { index?: unknown; toNonIndexed?: () => unknown; clone?: () => unknown }) | undefined;
      if (geometry && materialList(object).some((m) => m.flatShading === true)) {
        let baked = flatBaked.get(geometry) as { computeVertexNormals(): void } | undefined;
        if (!baked) {
          baked = (geometry.index ? geometry.toNonIndexed!() : geometry.clone!()) as { computeVertexNormals(): void };
          baked.computeVertexNormals();
          flatBaked.set(geometry, baked);
        }
        const holder = object as { geometry?: unknown };
        holder.geometry = baked;
        undo.push(() => { holder.geometry = geometry; });
        rows.push({ status: "supported", construct: "material.flatShading", subject: id, note: "glTF has no flat-shading flag; faceted normals baked into a non-indexed geometry copy" });
      }
      const morph = object.geometry?.morphAttributes ?? {};
      if (Object.values(morph).some((list) => Array.isArray(list) && list.length > 0)) rows.push({ status: "supported", construct: "morphTargets", subject: id, note: "morph targets exported" });
    }
    const materials = materialList(object);
    for (const material of materials) {
      if (seenMaterials.has(material.uuid)) continue;
      seenMaterials.add(material.uuid);
      if (!material.name) {
        (material as { name: string }).name = `${slugId(name)}_${material.type.replace(/Material$/, "").toLowerCase()}_${unnamedMaterial}`;
        unnamedMaterial += 1;
      }
      materialNames.push(material.name);
      if (classifyMaterial(material, MaterialProto, rows)) uncarried.add(material.uuid);
      for (const slot of TEXTURE_SLOTS) {
        const texture = material[slot] as TextureLike | null | undefined;
        if (!texture || texture.isTexture !== true) continue;
        if (slot === "envMap" || slot === "gradientMap" || slot === "matcap") {
          rows.push({ status: "unsupported", construct: `material.${slot}`, subject: material.name, note: `${slot} has no glTF slot and is dropped by GLTFExporter` });
          continue;
        }
        if (texture.isDataTexture && texture.image?.data) {
          rows.push({ status: "supported", construct: `material.${slot}`, subject: material.name, note: "DataTexture pixels baked into the GLB as PNG (static procedural pattern)" });
          continue;
        }
        (material as Record<string, unknown>)[slot] = null;
        undo.push(() => { (material as Record<string, unknown>)[slot] = texture; });
        rows.push({ status: "unsupported", construct: `material.${slot}`, subject: material.name, note: texture.isCompressedTexture ? "compressed textures cannot be re-encoded headless; detached before export" : "image/canvas/video textures cannot be rasterised headless; detached before export (pass a DataTexture, or admit the image as its own texture asset)" });
      }
    }
    if (object.isMesh && materials.some((m) => uncarried.has(m.uuid)) && object.visible) {
      hidden.push(id);
      rows.push({ status: "unsupported", construct: "Mesh", subject: id, note: "uses a material the bridge cannot carry; hidden in the Aura3D output rather than shown with a substitute" });
    }
  });

  // Lights and cameras leave the export: they are emitted as native nodes instead.
  for (const light of detach) {
    const parent = light.parent;
    if (!parent) continue;
    const index = parent.children.indexOf(light);
    light.removeFromParent();
    undo.push(() => { parent.children.splice(index, 0, light); (light as { parent: ThreeObjectLike | null }).parent = parent; });
  }

  // Scene-level state.
  let background: string | undefined;
  const bg = scene.background as { isColor?: boolean; getHexString?: () => string } | null | undefined;
  if (bg && bg.isColor && bg.getHexString) {
    background = `#${bg.getHexString()}`;
    rows.push({ status: "supported", construct: "Scene.background", subject: "scene", note: "emitted as scene({ background })" });
  } else if (bg) {
    rows.push({ status: "unsupported", construct: "Scene.background", subject: "scene", note: "texture/cube backgrounds are not carried; set a native sky or scene background" });
  }
  if (scene.fog) {
    const construct = scene.fog.isFogExp2 ? "FogExp2" : "Fog";
    rows.push({ status: "unsupported", construct, subject: "scene", note: "fog is not emitted (distance semantics differ); add native fog by hand", ...suggestion(construct) });
  }
  let environment: BridgeSceneData["environment"];
  if (result.environment?.kind === "room") {
    environment = { kind: "room", intensity: result.environment.intensity ?? 1 };
    rows.push({ status: "approximated", construct: "RoomEnvironment", subject: "scene", note: "image-based light emitted as environments.neutral (a generated room probe, not three's PMREM)", nativeTarget: "environments.neutral" });
  } else if (scene.environment) {
    rows.push({ status: "unsupported", construct: "Scene.environment", subject: "scene", note: "an environment texture without an `environment` hint is not carried; declare { environment: { kind: \"room\" } } or add native environments.*" });
  }
  for (const pass of result.post ?? []) {
    const passName = typeof pass === "string" ? pass : ((pass as { constructor?: { name?: string } }).constructor?.name ?? "Pass");
    rows.push({ status: "unsupported", construct: passName, subject: "post", note: "post-processing is never emitted by the bridge", ...suggestion(passName) });
  }
  const clipNames: string[] = [];
  for (const clip of result.clips ?? []) {
    const clipName = String((clip as { name?: string }).name ?? `clip_${clipNames.length}`);
    clipNames.push(clipName);
    rows.push({ status: "supported", construct: "AnimationClip", subject: clipName, note: "exported explicitly through GLTFExporter({ animations })" });
  }

  let camera: BridgeCamera | undefined;
  const cam = result.camera;
  if (cam && cam.isCamera) {
    cam.updateMatrixWorld(true);
    const position = vec(cam.getWorldPosition(new Vector3()));
    let target = result.cameraTarget;
    if (!target) {
      const dir = cam.getWorldDirection(new Vector3());
      target = [round(position[0] + dir.x * 10), round(position[1] + dir.y * 10), round(position[2] + dir.z * 10)];
    }
    if (cam.type === "PerspectiveCamera") {
      camera = { position, target: [...target] as unknown as Vec3, fov: round(cam.fov ?? 50), near: cam.near ?? 0.1, far: cam.far ?? 2000 };
      rows.push({ status: "supported", construct: "PerspectiveCamera", subject: "camera", note: "emitted as camera.perspective (position, look-at target, vertical fov, near, far)" });
    } else {
      rows.push({ status: "unsupported", construct: cam.type, subject: "camera", note: "only PerspectiveCamera is emitted" });
    }
  }

  const toneMapping = result.renderer?.toneMapping ?? "none";
  rows.push({ status: "supported", construct: "WebGLRenderer.toneMapping", subject: "output", note: `emitted as createAuraApp({ output: { toneMapping: "${toneMapping}", exposure } })` });

  return {
    data: {
      name,
      nodeIds,
      hiddenNodeNames: hidden,
      materials: materialNames,
      clips: clipNames,
      lights,
      ...(camera ? { camera } : {}),
      ...(background ? { background } : {}),
      toneMapping,
      exposure: result.renderer?.exposure ?? 1,
      ...(environment ? { environment } : {}),
      castShadow,
      receiveShadow
    },
    rows,
    restore() { for (const fn of undo.reverse()) fn(); }
  };
}

/** Returns true when the material cannot be carried at all (the meshes using it are hidden, not substituted). */
function classifyMaterial(material: ThreeMaterialLike, proto: { onBeforeCompile?: unknown } | undefined, rows: CompatRow[]): boolean {
  const subject = material.name;
  if (typeof material.onBeforeCompile === "function" && proto && material.onBeforeCompile !== proto.onBeforeCompile) {
    rows.push({ status: "unsupported", construct: "onBeforeCompile", subject, note: "shader patches are not exported; the GLB carries the unpatched base material", nativeTarget: "material.custom" });
  }
  if (material.isNodeMaterial) {
    rows.push({ status: "unsupported", construct: material.type, subject, note: "node materials are not exported; meshes using it are hidden in the Aura3D output (port the graph by hand)", ...suggestion(material.type) });
    return true;
  } else if (material.isShaderMaterial) {
    rows.push({ status: "unsupported", construct: material.type, subject, note: "custom shaders are not exported; GLTFExporter would write a default material, so meshes using it are hidden in the Aura3D output (port the shader by hand)", ...suggestion(material.type) });
    return true;
  } else if (EXPORTED_AS_IS.has(material.type)) {
    rows.push({ status: "supported", construct: material.type, subject, note: material.type === "MeshPhysicalMaterial" ? "exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular)" : "exported as glTF metallic-roughness PBR" });
  } else if (material.type === "MeshBasicMaterial") {
    rows.push({ status: "approximated", construct: material.type, subject, note: "exported with KHR_materials_unlit (parsed with limits by the Aura3D loader)" });
  } else if (EXPORT_CONVERTED.has(material.type)) {
    rows.push({ status: "approximated", construct: material.type, subject, note: "GLTFExporter converts this to metallic-roughness PBR (colour and emissive kept; shading model changes)", ...suggestion(material.type) });
  } else {
    rows.push({ status: "unsupported", construct: material.type, subject, note: "unknown material type; meshes using it are hidden in the Aura3D output" });
    return true;
  }
  return false;
}

/** Point clip tracks addressed by an original node name at that node's stable id. */
export function retargetClipTracks(clips: readonly unknown[], renamed: ReadonlyMap<string, string>): number {
  let changed = 0;
  for (const clip of clips) {
    for (const track of (clip as { tracks?: { name: string }[] }).tracks ?? []) {
      const dot = track.name.indexOf(".");
      if (dot <= 0) continue;
      const node = track.name.slice(0, dot);
      const id = renamed.get(node);
      if (id !== undefined) { track.name = id + track.name.slice(dot); changed += 1; }
    }
  }
  return changed;
}
