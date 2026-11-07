import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.2, 0.15, -1).normalize();

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Colors are authored directly in display (sRGB) space; no colorspace chunk is included.
const frag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSun;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = clamp(h, 0.0, 1.0);
  float sunDot = clamp(dot(d, uSun), 0.0, 1.0);
  float ang = acos(sunDot);

  vec3 horizon = vec3(1.00, 0.60, 0.34);
  vec3 pink    = vec3(0.95, 0.38, 0.52);
  vec3 purple  = vec3(0.45, 0.28, 0.62);
  vec3 top     = vec3(0.17, 0.17, 0.44);

  vec3 col = mix(horizon, pink, smoothstep(0.0, 0.2, t));
  col = mix(col, purple, smoothstep(0.12, 0.5, t));
  col = mix(col, top, smoothstep(0.45, 1.0, t));

  // below the horizon: warm haze fading to dusky lavender
  vec3 low1 = vec3(0.96, 0.52, 0.52);
  vec3 low2 = vec3(0.62, 0.42, 0.68);
  float b = clamp(-h, 0.0, 1.0);
  vec3 below = mix(low1, low2, smoothstep(0.0, 0.5, b));
  col = mix(col, below, smoothstep(0.0, 0.12, b));

  // warm glow around the sun
  float warm = pow(sunDot, 4.0);
  col = mix(col, vec3(1.0, 0.68, 0.36), warm * 0.55);
  col += vec3(1.0, 0.55, 0.22) * exp(-ang * 7.0) * 0.55;

  // sun disc
  float disc = 1.0 - smoothstep(0.095, 0.108, ang);
  col = mix(col, vec3(1.0, 0.95, 0.75), disc);

  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { uSun: { value: SUN_DIR.clone() } },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
