/**
 * PRD-15 T6.1 — the Three.js → @aura3d/engine mapping table.
 *
 * Each entry covers one construct the migrator rewrites. "exact" means the
 * target factory is a drop-in; "approximate" means semantics survive but
 * options or framing differ; "none" rows are reported with a TODO comment
 * and no rewrite.
 */

export interface ThreeMapping {
  /** Construct key as produced by parse (e.g. "BoxGeometry", "GLTFLoader.load"). */
  readonly construct: string;
  /** Aura3D factory the construct maps to ("" for none). */
  readonly target: string;
  /** Engine namespace member the emitted code imports (for the rewritten import line). */
  readonly engineImport?: string;
  readonly mapping: "exact" | "approximate" | "none";
  readonly note: string;
}

export const THREE_TO_A3D_MAPPINGS: readonly ThreeMapping[] = [
  { construct: "Scene", target: "scene", engineImport: "scene", mapping: "approximate", note: "THREE.Scene graph root maps to scene({ nodes }); node add/remove calls migrate to nodes[] entries." },
  { construct: "PerspectiveCamera", target: "camera.perspective", engineImport: "camera", mapping: "approximate", note: "fov maps 1:1; position/target move into camera spec options instead of set/lookAt calls." },
  { construct: "Mesh", target: "primitives", engineImport: "primitives", note: "Mesh is not a standalone object: emit the matching primitives.* or model() node and carry material over.", mapping: "approximate" },
  { construct: "BoxGeometry", target: "primitives.box", engineImport: "primitives", mapping: "approximate", note: "width/height/depth args map to a primitives.box size option; generated call keeps args in a TODO comment." },
  { construct: "SphereGeometry", target: "primitives.sphere", engineImport: "primitives", mapping: "approximate", note: "radius/segments args map to primitives.sphere options; generated call keeps args in a TODO comment." },
  { construct: "CylinderGeometry", target: "primitives.cylinder", engineImport: "primitives", mapping: "approximate", note: "radius/height args map to primitives.cylinder options; generated call keeps args in a TODO comment." },
  { construct: "PlaneGeometry", target: "primitives.plane", engineImport: "primitives", mapping: "approximate", note: "width/height args map to primitives.plane options; generated call keeps args in a TODO comment." },
  { construct: "TorusGeometry", target: "primitives.torus", engineImport: "primitives", mapping: "approximate", note: "radius/tube args map to primitives.torus options; generated call keeps args in a TODO comment." },
  { construct: "MeshStandardMaterial", target: "material.pbr", engineImport: "material", mapping: "approximate", note: "color/metalness/roughness map to material.pbr options; envMapIntensity semantics differ." },
  { construct: "MeshPhysicalMaterial", target: "material.physical", engineImport: "material", mapping: "approximate", note: "clearcoat, transmission and sheen survive as material.physical options (engine material-physical layer bounds them)." },
  { construct: "DirectionalLight", target: "lights.directional", engineImport: "lights", mapping: "approximate", note: "color/intensity map; position becomes a spec option and shadow becomes a boolean flag." },
  { construct: "PointLight", target: "lights.point", engineImport: "lights", mapping: "approximate", note: "color/intensity/distance map to lights.point options." },
  { construct: "SpotLight", target: "lights.spot", engineImport: "lights", mapping: "approximate", note: "angle/penumbra/decay/distance map to lights.spot options." },
  { construct: "AmbientLight", target: "lights.ambient", engineImport: "lights", mapping: "approximate", note: "color/intensity map to lights.ambient options." },
  { construct: "HemisphereLight", target: "lights.ambient", engineImport: "lights", mapping: "approximate", note: "sky/ground two-tone shading approximates to ambient until the lights.hemisphere contract lands; keep the pair of tints in the TODO comment." },
  { construct: "GLTFLoader", target: "", mapping: "none", note: "loader objects disappear — the load call becomes model(assets.<typedKey>); see the .load row." },
  { construct: "GLTFLoader.load", target: "model", engineImport: "model", mapping: "approximate", note: "loader.load(url) becomes model(assets.<typedKey>) — register the GLB via `aura3d assets add` and reference the generated asset key." },
  { construct: "RGBELoader", target: "", mapping: "none", note: "loader objects disappear — RGBELoader+PMREMGenerator collapses into environments.hdri; see the .load row." },
  { construct: "RGBELoader.load", target: "environments.hdri", engineImport: "environments", mapping: "approximate", note: "RGBELoader + PMREMGenerator collapses into environments.hdri({ texture: assets.<hdrKey> }); register the .hdr via `aura3d assets add`." },
  { construct: "OrbitControls", target: "camera.orbit", engineImport: "camera", mapping: "approximate", note: "OrbitControls target/damping maps to camera.orbit({ target, distance, fov }); per-frame input comes from the runtime, not listeners." },
  { construct: "InstancedMesh", target: "instances.box", engineImport: "instances", mapping: "approximate", note: "InstancedMesh maps to instances.<shape>({ transforms: [...] }); pick the instances factory matching the underlying geometry." },
  { construct: "Euler", target: "rotation", mapping: "approximate", note: "Euler('XYZ') order maps to rotation: [x, y, z] on the node builder; non-XYZ orders need quaternion composition — flagged in TODO." },
  { construct: "WebGLRenderer", target: "createAuraApp", engineImport: "createAuraApp", mapping: "approximate", note: "WebGLRenderer + render loop maps to createAuraApp({ scene }) lifecycle; setSize/animation loops fold into the app spec." },
  { construct: "Vector3", target: "[x, y, z]", mapping: "approximate", note: "Vector3 maps to AuraVec3 tuples; mutate via node builder position()/scale() instead of .set()." },
  { construct: "Color", target: "#rrggbb", mapping: "approximate", note: "THREE.Color maps to hex strings or [r,g,b] arrays in material/light options." },
  { construct: "TextureLoader.load", target: "assets", engineImport: "assets", mapping: "approximate", note: "TextureLoader.load(url) maps to a typed aura-assets texture ref (assets.<key>) plus material options." },
  { construct: "Clock", target: "useAuraFrame", mapping: "approximate", note: "THREE.Clock/getDelta folds into the frame callback's dt argument." },
];

const byConstruct = new Map<string, ThreeMapping>(THREE_TO_A3D_MAPPINGS.map((m) => [m.construct, m]));

export function threeMappingFor(construct: string): ThreeMapping | undefined {
  return byConstruct.get(construct);
}
