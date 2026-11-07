import * as THREE from 'three';
import { mulberry32 } from './rng';

const RIBBON_LEN = 48;
const PARTICLES = 420;
const LIFE_SECONDS = 4.6;
const GRAVITY = 4.6;

const ribbonVert = /* glsl */ `
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const ribbonFrag = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
#include <fog_pars_fragment>
void main() {
  float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
  float streak = 0.6 + 0.4 * sin(vUv.y * 70.0 + uTime * 9.0 + vUv.x * 11.0);
  float streak2 = 0.7 + 0.3 * sin(vUv.y * 33.0 + uTime * 6.0 - vUv.x * 5.0);
  float fade = smoothstep(0.0, 0.45, vUv.y);
  float a = edge * streak * streak2 * fade * 0.6;
  vec3 c = mix(vec3(0.78, 0.92, 1.0), vec3(1.0, 0.86, 0.9), 0.35);
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const pointVert = /* glsl */ `
attribute float aLife;
attribute float aSize;
uniform float uScale;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float worldSize = aSize * (0.45 + aLife * 1.6);
  gl_PointSize = max(1.0, worldSize * uScale / -mvPosition.z);
  vAlpha = pow(1.0 - aLife, 1.3) * smoothstep(0.0, 0.04, aLife) * 0.75;
  #include <fog_vertex>
}
`;

const pointFrag = /* glsl */ `
varying float vAlpha;
#include <fog_pars_fragment>
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d) * vAlpha;
  gl_FragColor = vec4(0.88, 0.95, 1.0, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export class Waterfall {
  readonly group = new THREE.Group();
  private readonly ribbonMat: THREE.ShaderMaterial;
  private readonly pointMat: THREE.ShaderMaterial;
  private readonly positions: Float32Array;
  private readonly lifeAttr: THREE.BufferAttribute;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly offset: Float32Array;
  private readonly jx: Float32Array;
  private readonly jz: Float32Array;

  /** Group origin sits on the island rim; local +z points away from the island. */
  constructor(rim: THREE.Vector3, outAngle: number, viewHeightPx: number, fovDeg: number) {
    this.group.position.copy(rim);
    this.group.rotation.y = outAngle;

    this.ribbonMat = new THREE.ShaderMaterial({
      vertexShader: ribbonVert,
      fragmentShader: ribbonFrag,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib['fog'], { uTime: { value: 0 } }]),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    const planeGeo = new THREE.PlaneGeometry(1.5, RIBBON_LEN, 1, 24);
    planeGeo.translate(0, -RIBBON_LEN / 2, 0);
    const a = new THREE.Mesh(planeGeo, this.ribbonMat);
    a.position.z = 0.25;
    const b = new THREE.Mesh(planeGeo, this.ribbonMat);
    b.position.z = 0.25;
    b.rotation.y = Math.PI / 2;
    this.group.add(a, b);

    const rng = mulberry32(777);
    this.positions = new Float32Array(PARTICLES * 3);
    this.offset = new Float32Array(PARTICLES);
    this.jx = new Float32Array(PARTICLES);
    this.jz = new Float32Array(PARTICLES);
    const life = new Float32Array(PARTICLES);
    const size = new Float32Array(PARTICLES);
    for (let i = 0; i < PARTICLES; i++) {
      this.offset[i] = rng();
      this.jx[i] = (rng() - 0.5) * 1.1;
      this.jz[i] = (rng() - 0.5) * 0.6;
      size[i] = 0.5 + rng() * 0.7;
    }
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.lifeAttr = new THREE.BufferAttribute(life, 1);
    this.lifeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aLife', this.lifeAttr);
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

    this.pointMat = new THREE.ShaderMaterial({
      vertexShader: pointVert,
      fragmentShader: pointFrag,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib['fog'],
        { uScale: { value: viewHeightPx / (2 * Math.tan((fovDeg * Math.PI) / 360)) } },
      ]),
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const points = new THREE.Points(geo, this.pointMat);
    points.frustumCulled = false;
    this.group.add(points);
    this.update(0);
  }

  update(t: number): void {
    this.ribbonMat.uniforms['uTime'].value = t;
    const life = this.lifeAttr.array as Float32Array;
    for (let i = 0; i < PARTICLES; i++) {
      const l = (t / LIFE_SECONDS + this.offset[i]) % 1;
      const age = l * LIFE_SECONDS;
      const spread = 0.35 + l * 1.3;
      this.positions[i * 3] = this.jx[i] * spread;
      this.positions[i * 3 + 1] = -0.5 * GRAVITY * age * age;
      this.positions[i * 3 + 2] = 0.3 + l * 0.8 + this.jz[i] * spread;
      life[i] = l;
    }
    this.posAttr.needsUpdate = true;
    this.lifeAttr.needsUpdate = true;
  }
}
