import { Geometry, PortableShaderMaterial, Renderer, createDefaultShaderLibrary } from "@aura3d/rendering";
import { composeMat4, lookAtMat4, multiplyMat4, perspectiveMat4 } from "@aura3d/scene";
import * as THREE from "three";

const VIEWPORT = { width: 1440, height: 900, dpr: 1 } as const;
const CAMERA = { position: [0, 0.25, 3.4] as const, target: [0, 0, 0] as const, fov: 38, near: 0.1, far: 100 } as const;
const TIMES = { before: 0, after: 1.75 } as const;
const COLORS = { a: [0.05, 0.25, 1] as const, b: [1, 0.06, 0.55] as const };
const GLSL_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
uniform mat4 u_modelViewProjection;
uniform mat4 u_normalMatrix;
out vec3 v_position;
out vec3 v_normal;
void main(){v_position=a_position;v_normal=normalize(mat3(u_normalMatrix)*a_normal);gl_Position=u_modelViewProjection*vec4(a_position,1.0);}`;
const GLSL_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
in vec3 v_position;
in vec3 v_normal;
out vec4 outColor;
void main(){float field=sin(v_position.x*10.0+u_time*2.1)*cos(v_position.y*9.0-u_time)+sin(v_position.z*12.0);float rim=pow(1.0-abs(normalize(v_normal).z),2.0);vec3 color=mix(u_colorA,u_colorB,field*.25+.5)+rim*vec3(.18,.32,.8);outColor=vec4(color,1.0);}`;
const THREE_GLSL_VERTEX = `precision highp float;
out vec3 v_position;
out vec3 v_normal;
void main(){v_position=position;v_normal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const WGSL_VERTEX = `/* @aura3d-bindings */
struct Out{@builtin(position) position:vec4<f32>,@location(0) p:vec3<f32>,@location(1) n:vec3<f32>};
@vertex fn vs_main(@location(0) p:vec3<f32>,@location(1) n:vec3<f32>)->Out{var o:Out;let c=aura.u_modelViewProjection*vec4<f32>(p,1.0);o.position=vec4<f32>(c.xy,c.z*.5+c.w*.5,c.w);o.p=p;o.n=normalize((aura.u_normalMatrix*vec4<f32>(n,0.0)).xyz);return o;}`;
const WGSL_FRAGMENT = `/* @aura3d-bindings */
struct In{@location(0) p:vec3<f32>,@location(1) n:vec3<f32>};
@fragment fn fs_main(i:In)->@location(0) vec4<f32>{let f=sin(i.p.x*10.0+aura.u_time*2.1)*cos(i.p.y*9.0-aura.u_time)+sin(i.p.z*12.0);let r=pow(1.0-abs(normalize(i.n).z),2.0);let c=mix(aura.u_colorA,aura.u_colorB,f*.25+.5)+r*vec3<f32>(.18,.32,.8);return vec4<f32>(c,1.0);}`;

declare global { interface Window { __AURA_THREE_HEAD_TO_HEAD_CUSTOM_SHADER__?: any; __AURA_THREE_HEAD_TO_HEAD_CUSTOM_SHADER_ERROR__?: string } }
const state: Record<string, any> = { ready: false, workload: "custom-material-shader", viewport: VIEWPORT, contract: { camera: CAMERA, times: TIMES, colors: COLORS, formula: "shared-object-space-plasma-rim" }, aura: null, three: null, interaction: { applied: false }, lifecycle: null };
const publish = () => { state.ready = Boolean(state.aura && state.three); window.__AURA_THREE_HEAD_TO_HEAD_CUSTOM_SHADER__ = structuredClone(state); };
publish();

void run().catch((error) => { window.__AURA_THREE_HEAD_TO_HEAD_CUSTOM_SHADER_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error); });
async function run(): Promise<void> {
  const auraCanvas = requiredCanvas("aura");
  const threeCanvas = requiredCanvas("three");
  const aspect = VIEWPORT.width / VIEWPORT.height;
  const view = lookAtMat4(CAMERA.position, CAMERA.target, [0, 1, 0]);
  const projection = perspectiveMat4(CAMERA.fov * Math.PI / 180, aspect, CAMERA.near, CAMERA.far);
  const viewProjection = multiplyMat4(projection, view);
  const modelMatrix = composeMat4([0, 0, 0], [0, 0, 0, 1], [1.25, 1.25, 1.25]);
  const library = createDefaultShaderLibrary();
  const auraRenderer = await Renderer.create({ backend: "webgl2", canvas: auraCanvas, width: VIEWPORT.width, height: VIEWPORT.height, antialias: true, preserveDrawingBuffer: true, clearColor: [0.005, 0.008, 0.016, 1], shaderLibrary: library });
  const auraGeometry = Geometry.uvSphere(0.7, 64, 32, { textured: true });
  const auraMaterial = new PortableShaderMaterial({ shaderLibrary: library, name: "head-to-head-plasma", sources: { glsl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT }, wgsl: { vertex: WGSL_VERTEX, fragment: WGSL_FRAGMENT } }, requiredAttributes: ["a_position", "a_normal"], uniforms: [
    { name: "u_time", kind: "float", value: 0 }, { name: "u_colorA", kind: "vec3", value: COLORS.a }, { name: "u_colorB", kind: "vec3", value: COLORS.b }
  ] });
  const compile = auraMaterial.compile(auraRenderer.device);
  if (!compile.ok) throw new Error(`Aura custom shader compile failed: ${compile.diagnostics.join(" | ")}`);

  const threeRenderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true, preserveDrawingBuffer: true });
  threeRenderer.setPixelRatio(1); threeRenderer.setSize(VIEWPORT.width, VIEWPORT.height, false); threeRenderer.setClearColor(0x010204, 1);
  const threeScene = new THREE.Scene();
  const threeCamera = new THREE.PerspectiveCamera(CAMERA.fov, aspect, CAMERA.near, CAMERA.far); threeCamera.position.set(...CAMERA.position); threeCamera.lookAt(...CAMERA.target);
  const threeMaterial = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { u_time: { value: 0 }, u_colorA: { value: new THREE.Vector3(...COLORS.a) }, u_colorB: { value: new THREE.Vector3(...COLORS.b) } }, vertexShader: THREE_GLSL_VERTEX, fragmentShader: GLSL_FRAGMENT.replace("#version 300 es\n", ""), toneMapped: false });
  const threeGeometry = new THREE.SphereGeometry(0.875, 64, 32);
  const mesh = new THREE.Mesh(threeGeometry, threeMaterial); threeScene.add(mesh);

  const render = (phase: keyof typeof TIMES) => {
    const time = TIMES[phase];
    auraMaterial.setParameter("u_time", time);
    const auraDiagnostics = auraRenderer.render({ renderItems: [{ label: "portable-plasma-sphere", geometry: auraGeometry, material: auraMaterial, modelMatrix }] }, { viewMatrix: view, projectionMatrix: projection, viewProjectionMatrix: viewProjection });
    threeMaterial.uniforms.u_time!.value = time; threeMaterial.uniformsNeedUpdate = true; threeRenderer.render(threeScene, threeCamera);
    state.aura = { publicPackageOnly: true, publicApi: "PortableShaderMaterial + Renderer", backend: auraRenderer.device.kind, actualPortableShaderMaterial: true, actualCompiledShaderProgram: Boolean(compile.program && !compile.program.disposed), pairedSources: ["GLSL", "WGSL"], compileOk: compile.ok, drawCalls: auraDiagnostics.drawCalls, deviceDrawCalls: auraRenderer.device.getDiagnostics().drawCalls, time, pixelHash: hash(auraRenderer.device.readPixels(0, 0, VIEWPORT.width, VIEWPORT.height)) };
    const gl = threeRenderer.getContext(); const pixels = new Uint8Array(VIEWPORT.width * VIEWPORT.height * 4); gl.readPixels(0, 0, VIEWPORT.width, VIEWPORT.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    state.three = { revision: THREE.REVISION, actualRenderer: true, actualShaderMaterial: threeMaterial instanceof THREE.ShaderMaterial, actualCompiledShaderProgram: threeRenderer.info.programs?.length === 1, singleGlslPair: true, drawCalls: threeRenderer.info.render.calls, triangles: threeRenderer.info.render.triangles, time, pixelHash: hash(pixels) };
    publish();
  };
  render("before");
  document.getElementById("advance")?.addEventListener("click", () => { state.interaction = { applied: true, action: "set-u_time", from: TIMES.before, to: TIMES.after }; render("after"); });
  Object.assign(window, { __AURA_THREE_HEAD_TO_HEAD_CUSTOM_SHADER_DISPOSE__: () => { auraMaterial.dispose(); auraGeometry.dispose(); auraRenderer.dispose(); let threeMaterialDisposed = false; let threeGeometryDisposed = false; threeMaterial.addEventListener("dispose", () => { threeMaterialDisposed = true; }); threeGeometry.addEventListener("dispose", () => { threeGeometryDisposed = true; }); threeGeometry.dispose(); threeMaterial.dispose(); threeRenderer.dispose(); state.lifecycle = { auraMaterialDisposed: auraMaterial.disposed, auraVertexBufferDisposed: (auraGeometry.vertexBuffer as unknown as { disposed: boolean }).disposed, auraIndexBufferDisposed: (auraGeometry.indexBuffer as unknown as { disposed: boolean }).disposed, auraRendererDeviceDisposed: auraRenderer.device.disposed, threeMaterialDisposed, threeGeometryDisposed, threeRendererProgramsReleased: threeRenderer.info.programs?.length === 0 }; publish(); return state.lifecycle; } });
}
function requiredCanvas(id: string): HTMLCanvasElement { const canvas = document.querySelector<HTMLCanvasElement>(`#${id}`); if (!canvas) throw new Error(`Missing ${id} canvas.`); return canvas; }
function hash(bytes: Uint8Array): string { let value = 2166136261; for (const byte of bytes) { value ^= byte; value = Math.imul(value, 16777619) >>> 0; } return value.toString(16).padStart(8, "0"); }
