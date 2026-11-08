// B1 recipe 5: custom shaders. A ShaderMaterial orb (fresnel rim + clock-driven bands), a RawShaderMaterial backdrop
// (uv gradient with its own built-in declarations) and a chunk-including ShaderMaterial sign the bridge refuses and
// reports. The rest of the kiosk is plain PBR so the paired frame shows the shaders against carried materials.
import * as THREE from "three";

export const params = { glow: "#38d9ff", bands: 9, top: "#1b2440", bottom: "#4a2a5e" };

const ORB_VERTEX = `
varying vec3 vNormal;
varying vec3 vView;
varying vec2 vUv;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const ORB_FRAGMENT = `
uniform vec3 glow;
uniform float bands;
uniform float time;
varying vec3 vNormal;
varying vec3 vView;
varying vec2 vUv;
void main() {
  float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.0);
  float band = 0.5 + 0.5 * sin(vUv.y * bands * 6.28318 + time * 1.5);
  vec3 core = mix(glow * 0.25, glow, band * 0.6);
  gl_FragColor = vec4(core + rim * vec3(1.0), 1.0);
}`;

const BACKDROP_VERTEX = `precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BACKDROP_FRAGMENT = `precision highp float;
uniform vec3 top;
uniform vec3 bottom;
varying vec2 vUv;
void main() {
  float grid = step(0.96, fract(vUv.x * 12.0)) + step(0.96, fract(vUv.y * 8.0));
  vec3 base = mix(bottom, top, vUv.y);
  gl_FragColor = vec4(base + grid * 0.06, 1.0);
}`;

export default function createScene({ params: p }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0d1018");

  const floorMat = new THREE.MeshStandardMaterial({ name: "floor", color: "#2a2e38", roughness: 0.7 });
  const plinthMat = new THREE.MeshStandardMaterial({ name: "plinth", color: "#d7d9de", roughness: 0.45 });
  const trimMat = new THREE.MeshStandardMaterial({ name: "trim", color: "#c58b2b", metalness: 0.8, roughness: 0.35 });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 7), floorMat);
  floor.name = "floor";
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  scene.add(floor);

  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), new THREE.RawShaderMaterial({
    name: "backdrop_gradient",
    vertexShader: BACKDROP_VERTEX,
    fragmentShader: BACKDROP_FRAGMENT,
    uniforms: { top: { value: new THREE.Color(p.top) }, bottom: { value: new THREE.Color(p.bottom) } }
  }));
  backdrop.name = "backdrop";
  backdrop.position.set(0, 2.5, -3);
  scene.add(backdrop);

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 1.1, 32), plinthMat);
  plinth.name = "plinth";
  plinth.position.y = 0.55;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  scene.add(plinth);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 12, 48), trimMat);
  ring.name = "ring";
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.1;
  scene.add(ring);

  const orbMaterial = new THREE.ShaderMaterial({
    name: "orb_glow",
    vertexShader: ORB_VERTEX,
    fragmentShader: ORB_FRAGMENT,
    uniforms: { glow: { value: new THREE.Color(p.glow) }, bands: { value: p.bands }, time: { value: 0 } }
  });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.7, 48, 32), orbMaterial);
  orb.name = "orb";
  orb.position.y = 1.9;
  scene.add(orb);

  // Refused on purpose: three chunk includes have no Aura3D equivalent, so this sign is hidden and reported.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.ShaderMaterial({
    name: "sign_chunks",
    vertexShader: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "#include <common>\nvoid main() { gl_FragColor = vec4(vec3(saturate(0.8)), 1.0); }"
  }));
  sign.name = "sign";
  sign.position.set(2.6, 0.9, -1.2);
  scene.add(sign);

  scene.add(new THREE.HemisphereLight("#c9d6ff", "#20242c", 0.9));
  const key = new THREE.DirectionalLight("#ffffff", 2.4);
  key.name = "key";
  key.position.set(3, 6, 4);
  key.castShadow = true;
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
  camera.position.set(3.6, 2.8, 6.4);
  return {
    scene, camera, cameraTarget: [0, 1.4, -0.4],
    renderer: { toneMapping: "none", exposure: 1 },
    // The three.js page drives the clock uniform; the bridge maps it to Aura3D's uTime.
    update: (t) => { orbMaterial.uniforms.time.value = t; }
  };
}
