/**
 * three adapter (§6.7): three r185 GLTFLoader + MeshoptDecoder + KTX2Loader +
 * RGBELoader + PMREMGenerator — the same stage doc, same camera, same HDRI +
 * ACES exposure as the Aura adapter. Debug views are ShaderMaterial overrides
 * per §6.7's list; `u_prd05DebugView`-style channels render with the same
 * visualization so both engines' sheets are comparable.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import type { LookdevStage } from "./stage";
import type { LookdevRequest } from "./shared";

export interface LookdevRunResult {
  readonly engine: "three";
  readonly glb: string;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly debugApplied: string | null;
}

const FRAG_HEADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  uniform sampler2D u_map;
  uniform sampler2D u_mrMap;
  uniform sampler2D u_normalMap;
  uniform sampler2D u_aoMap;
  uniform vec4 u_baseColorFactor;
  uniform vec2 u_mrFactors;
  uniform float u_aoIntensity;
`;

const DEBUG_SHADERS: Readonly<Record<string, { vertex?: string; fragment: string }>> = {
  baseColor: {
    fragment: FRAG_HEADER + `
      void main() {
        vec4 texel = texture2D(u_map, vUv);
        gl_FragColor = vec4(u_baseColorFactor.rgb * texel.rgb, 1.0);
      }`
  },
  normal: {
    fragment: FRAG_HEADER + `
      void main() {
        vec3 n = texture2D(u_normalMap, vUv).xyz * 2.0 - 1.0;
        gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
      }`
  },
  worldNormal: {
    fragment: FRAG_HEADER + `
      void main() { gl_FragColor = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0); }`
  },
  roughness: {
    fragment: FRAG_HEADER + `
      void main() {
        vec4 mr = texture2D(u_mrMap, vUv);
        gl_FragColor = vec4(vec3(mr.g * u_mrFactors.y), 1.0);
      }`
  },
  metallic: {
    fragment: FRAG_HEADER + `
      void main() {
        vec4 mr = texture2D(u_mrMap, vUv);
        gl_FragColor = vec4(vec3(mr.b * u_mrFactors.x), 1.0);
      }`
  },
  occlusion: {
    fragment: FRAG_HEADER + `
      void main() {
        float ao = texture2D(u_aoMap, vUv).r;
        gl_FragColor = vec4(vec3(mix(1.0, ao, u_aoIntensity)), 1.0);
      }`
  },
  uv0: {
    fragment: FRAG_HEADER + `
      void main() { gl_FragColor = vec4(fract(vUv), 0.0, 1.0); }`
  },
  uvChecker: {
    fragment: FRAG_HEADER + `
      void main() {
        vec2 c = floor(vUv * 16.0);
        float checker = mod(c.x + c.y, 2.0);
        gl_FragColor = vec4(vec3(checker * 0.85 + 0.075), 1.0);
      }`
  },
  texelDensity: {
    fragment: FRAG_HEADER + `
      uniform vec2 u_texSize;
      void main() {
        vec2 d = fwidth(vUv) * u_texSize;
        float density = max(d.x, d.y);
        // Same [0.5, 4] texels/px band as the Aura adapter's u_prd05TexelBand.
        vec3 col = density < 0.5 ? vec3(0.05, 0.10, 0.9)
          : density < 1.0 ? vec3(0.0, 0.65, 1.0)
          : density < 2.0 ? vec3(0.0, 0.85, 0.25)
          : density < 4.0 ? vec3(0.95, 0.85, 0.0)
          : vec3(0.9, 0.05, 0.05);
        gl_FragColor = vec4(col, 1.0);
      }`
  },
  mipLevel: {
    fragment: FRAG_HEADER + `
      uniform vec2 u_texSize;
      void main() {
        vec2 ddx = dFdx(vUv) * u_texSize;
        vec2 ddy = dFdy(vUv) * u_texSize;
        float lod = 0.5 * log2(max(dot(ddx, ddx), dot(ddy, ddy)));
        lod = clamp(lod, 0.0, 8.0);
        vec3 col = mix(vec3(0.0, 0.4, 1.0), vec3(1.0, 0.2, 0.0), lod / 8.0);
        gl_FragColor = vec4(col, 1.0);
      }`
  },
  facet: {
    fragment: FRAG_HEADER + `
      void main() {
        vec3 n = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
        gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
      }`
  },
  lodLevel: {
    fragment: FRAG_HEADER + `
      uniform float u_lodLevel;
      void main() {
        vec3 ramp[5] = vec3[5](
          vec3(0.1, 0.9, 0.3), vec3(0.9, 0.8, 0.1), vec3(0.9, 0.45, 0.1),
          vec3(0.9, 0.1, 0.1), vec3(0.6, 0.1, 0.9));
        gl_FragColor = vec4(ramp[int(clamp(u_lodLevel, 0.0, 4.0))], 1.0);
      }`
  },
  depth: {
    fragment: FRAG_HEADER + `
      uniform float u_cameraNear;
      uniform float u_cameraFar;
      void main() {
        float d = gl_FragCoord.z / gl_FragCoord.w;
        float v = clamp((d - u_cameraNear) / (u_cameraFar - u_cameraNear), 0.0, 1.0);
        gl_FragColor = vec4(vec3(1.0 - v), 1.0);
      }`
  },
  tangent: {
    fragment: FRAG_HEADER + `
      void main() { gl_FragColor = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0); }`
  },
  bitangent: {
    fragment: FRAG_HEADER + `
      void main() {
        vec3 n = normalize(vNormal);
        vec3 up = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 b = normalize(cross(n, normalize(cross(n, up))));
        gl_FragColor = vec4(b * 0.5 + 0.5, 1.0);
      }`
  },
  overdraw: {
    fragment: FRAG_HEADER + `
      void main() { gl_FragColor = vec4(vec3(0.08), 1.0); }`
  },
  wireframe: { fragment: FRAG_HEADER + `void main() { gl_FragColor = vec4(0.0, 1.0, 0.4, 1.0); }` },
  materialId: {
    fragment: FRAG_HEADER + `
      uniform vec3 u_idColor;
      void main() { gl_FragColor = vec4(u_idColor, 1.0); }`
  },
  triangles: {
    fragment: FRAG_HEADER + `
      void main() {
        float h = fract(sin(float(gl_PrimitiveID) * 12.9898) * 43758.5453);
        vec3 col = vec3(fract(h * 1.0), fract(h * 7.0), fract(h * 13.0));
        gl_FragColor = vec4(col * 0.85 + 0.075, 1.0);
      }`
  },
  culling: {
    fragment: FRAG_HEADER + `
      void main() {
        gl_FragColor = gl_FrontFacing ? vec4(0.1, 0.8, 0.2, 1.0) : vec4(0.85, 0.1, 0.1, 1.0);
      }`
  },
  "lighting-only": {
    fragment: FRAG_HEADER + `
      uniform vec3 u_ambient;
      uniform vec3 u_lightDir;
      uniform vec3 u_lightColor;
      void main() {
        vec3 n = normalize(vNormal);
        float ndl = max(dot(n, normalize(u_lightDir)), 0.0);
        gl_FragColor = vec4(u_ambient + u_lightColor * ndl, 1.0);
      }`
  },
  "specular-only": {
    fragment: FRAG_HEADER + `
      uniform vec3 u_lightDir;
      uniform vec3 u_lightColor;
      uniform vec3 u_camPos;
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(u_camPos - vWorldPosition);
        vec3 h = normalize(normalize(u_lightDir) + v);
        float spec = pow(max(dot(n, h), 0.0), 64.0);
        gl_FragColor = vec4(u_lightColor * spec, 1.0);
      }`
  },
  "diffuse-only": {
    fragment: FRAG_HEADER + `
      uniform vec3 u_ambient;
      uniform vec3 u_lightDir;
      uniform vec3 u_lightColor;
      void main() {
        vec3 n = normalize(vNormal);
        float ndl = max(dot(n, normalize(u_lightDir)), 0.0);
        vec4 texel = texture2D(u_map, vUv);
        vec3 albedo = u_baseColorFactor.rgb * texel.rgb;
        gl_FragColor = vec4(albedo * (u_ambient + u_lightColor * ndl), 1.0);
      }`
  }
};

const DEBUG_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function debugMaterialFor(
  view: string,
  source: THREE.Material,
  materialIndex: number,
  camPos: THREE.Vector3
): THREE.Material | null {
  const def = DEBUG_SHADERS[view];
  const src = source as THREE.MeshStandardMaterial;
  if (!def) {
    // Views handled without a custom shader.
    if (view === "wireframe") {
      const wire = src.clone();
      wire.wireframe = true;
      return wire;
    }
    return null;
  }
  const srcImage = src.map?.image as { width?: number; height?: number } | undefined;
  const texSize = new THREE.Vector2(srcImage?.width ?? 1, srcImage?.height ?? 1);
  const uniforms: Record<string, THREE.IUniform> = {
    u_map: { value: src.map ?? null },
    u_mrMap: { value: src.metalnessMap ?? src.roughnessMap ?? null },
    u_normalMap: { value: src.normalMap ?? null },
    u_aoMap: { value: src.aoMap ?? null },
    u_baseColorFactor: { value: new THREE.Vector4(src.color?.r ?? 1, src.color?.g ?? 1, src.color?.b ?? 1, src.opacity ?? 1) },
    u_mrFactors: { value: new THREE.Vector2(src.metalness ?? 1, src.roughness ?? 1) },
    u_aoIntensity: { value: src.aoMapIntensity ?? 1 },
    u_texSize: { value: texSize },
    u_lodLevel: { value: 0 },
    u_cameraNear: { value: 0.01 },
    u_cameraFar: { value: 100 },
    u_ambient: { value: new THREE.Vector3(0.05, 0.06, 0.075) },
    u_lightDir: { value: new THREE.Vector3(4, 8, 6).normalize() },
    u_lightColor: { value: new THREE.Vector3(1.0, 1.0, 0.95) },
    u_camPos: { value: camPos },
    u_idColor: { value: idColor(materialIndex) }
  };
  if (view === "overdraw") {
    return new THREE.ShaderMaterial({
      vertexShader: DEBUG_VERTEX,
      fragmentShader: def.fragment,
      uniforms,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });
  }
  return new THREE.ShaderMaterial({
    vertexShader: DEBUG_VERTEX,
    fragmentShader: def.fragment,
    uniforms,
    side: view === "culling" ? THREE.DoubleSide : src.side
  });
}

function idColor(index: number): THREE.Vector3 {
  const h = (index * 137.508) % 360;
  const c = new THREE.Color().setHSL(h / 360, 0.7, 0.55);
  return new THREE.Vector3(c.r, c.g, c.b);
}

export async function runThreeAdapter(
  request: LookdevRequest,
  stage: LookdevStage,
  host: HTMLElement
): Promise<LookdevRunResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const hdri = stage.hdris.find((entry) => entry.id === request.hdri) ?? stage.hdris[0];

  const width = host.clientWidth || 1920;
  const height = host.clientHeight || 1080;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(request.pixelRatio);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = stage.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene3 = new THREE.Scene();
  const [px, py, pz, tx, ty, tz] = request.cam;
  const camera3 = new THREE.PerspectiveCamera(request.fov, width / height, 0.01, 500);
  camera3.position.set(px, py, pz);
  camera3.lookAt(tx, ty, tz);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  try {
    const hdr = await new RGBELoader().loadAsync(hdri.path);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const envRt = pmrem.fromEquirectangular(hdr);
    scene3.environment = envRt.texture;
    scene3.environmentIntensity = hdri.intensity;
    scene3.background = hdr;
    scene3.backgroundIntensity = hdri.intensity;
  } catch (error) {
    errors.push(`hdri load failed: ${error instanceof Error ? error.message : String(error)}`);
    scene3.background = new THREE.Color("#101418");
  }
  pmrem.dispose();

  const key = new THREE.DirectionalLight("#ffffff", 1.1);
  key.position.set(4, 8, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  scene3.add(key);
  scene3.add(new THREE.AmbientLight("#8fa3b8", 0.18));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(request.radius * 8, request.radius * 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(stage.ground.color), roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = "shadow-catcher";
  scene3.add(ground);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setKTX2Loader(
    new KTX2Loader()
      .setTranscoderPath("/node_modules/three/examples/jsm/libs/basis/")
      .detectSupport(renderer)
  );

  let root: THREE.Object3D | null = null;
  try {
    const gltf = await loader.loadAsync(request.glb);
    root = gltf.scene;
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    scene3.add(root);
  } catch (error) {
    errors.push(`glb load failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  let debugApplied: string | null = null;
  if (root && request.debug) {
    const debug = request.debug;
    let materialIndex = 0;
    const indexByMaterial = new Map<THREE.Material, number>();
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!source) return;
      if (!indexByMaterial.has(source)) indexByMaterial.set(source, materialIndex++);
      const override = debugMaterialFor(debug, source!, indexByMaterial.get(source!)!, camera3.position);
      if (override) {
        mesh.material = override;
        debugApplied = debug;
      }
    });
    if (debug === "overdraw") scene3.background = new THREE.Color("#000000");
  }

  const settleFrames = 3;
  for (let frame = 0; frame < settleFrames; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    renderer.render(scene3, camera3);
  }

  let triangles = 0;
  scene3.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    triangles += geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count ?? 0) / 3;
  });

  return {
    engine: "three",
    glb: request.glb,
    drawCalls: renderer.info.render.calls,
    triangles: Math.round(triangles),
    warnings,
    errors,
    debugApplied
  };
}
