import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Geometry, IndexBuffer, PlanarReflectionCapture, Renderer, UnlitMaterial,
  VertexBuffer, VertexFormat, computePlanarViewMatrix, createPlanarProjectionMatrix,
  multiplyPlanarMatrices } from '@aura3d/rendering';
import { VISUAL_SETTINGS_301 as SETTINGS, captureSettings301, type VisualCapture301 } from './muse3jsparity-301-visual-cases';

/** Flat-water planar reflection benchmark. No ocean simulation or root-API claim. */
const BROKEN_REFLECTION_PLANE_Y = 3.4;
export async function captureWaterPair301(engine: 'aura' | 'three', enabled: boolean, frame: number, broken = false): Promise<VisualCapture301> {
  const canvas = document.createElement('canvas');
  canvas.width = SETTINGS.width; canvas.height = SETTINGS.height;
  document.body.appendChild(canvas);
  const eye = SETTINGS.camera.position as [number, number, number];
  const target = SETTINGS.camera.target as [number, number, number];
  const x = Math.sin(frame / 60) * 0.65;
  const projection = createPlanarProjectionMatrix(SETTINGS.camera.fov * Math.PI / 180,
    SETTINGS.width / SETTINGS.height, SETTINGS.camera.near, SETTINGS.camera.far);
  const direct = multiplyPlanarMatrices(projection, computePlanarViewMatrix(eye, target, [0, 1, 0]));
  let pixels: Uint8Array;
  const passes: string[] = broken ? [`negative-control:reflection-plane-y=${BROKEN_REFLECTION_PLANE_Y};expected-y=0`] : [];
  let dispose = () => {};
  try {
    if (engine === 'aura') {
      const renderer = await Renderer.create({ backend: 'webgl2', canvas, width: SETTINGS.width,
        height: SETTINGS.height, clearColor: [5 / 255, 7 / 255, 13 / 255, 1] });
      const cube = Geometry.litCube(0.9);
      const red = new UnlitMaterial({ color: [1, 0.06, 0.015, 1] });
      const blue = new UnlitMaterial({ color: [0.015, 0.35, 1, 1] });
      const plain = new UnlitMaterial({ color: [5 / 255, 7 / 255, 13 / 255, 1] });
      const capture = new PlanarReflectionCapture(renderer.device, broken ? BROKEN_REFLECTION_PLANE_Y : 0, { resolution: SETTINGS.width,
        clearColor: [5 / 255, 7 / 255, 13 / 255, 1], label: '301-water-pair' });
      dispose = () => { plain.dispose(); red.dispose(); blue.dispose(); cube.dispose(); capture.dispose(); renderer.dispose(); };
      const items = [
        { geometry: cube, material: red, modelMatrix: translation(x - 0.65, 0.75, 0), label: '301-reflected-red' },
        { geometry: cube, material: blue, modelMatrix: translation(x + 0.65, 0.75, -0.5), label: '301-reflected-blue' },
      ];
      const mirror = enabled ? capture.capture(view => {
        // Renderer owns viewport validation. The reflection target is deliberately
        // square on both opponents; switch this owner to its exact target dimensions
        // for capture, then restore the presented 600x380 frame even on failure.
        renderer.resize(view.renderTarget.width, view.renderTarget.height);
        try {
          renderer.render({ renderItems: items, renderTarget: view.renderTarget, cameraPosition: view.mirror.eye,
            cameraPolicy: 'require', environmentLighting: false, frustumCulling: false },
          { viewProjectionMatrix: view.viewProjectionMatrix });
          passes.push('native-planar-reflected-geometry');
        } finally {
          renderer.resize(SETTINGS.width, SETTINGS.height);
        }
      }, eye, target, [0, 1, 0], projection) : null;
      // Dense mesh evaluates the actual mirrored projection at each vertex; this is
      // surface geometry sampling captured scene color, not a screen-space overlay.
      const floor = projectedFloor(mirror?.frame.viewProjectionMatrix ?? direct);
      const reflection = mirror ? capture.createReflectorMaterial('301-water-reflection') : null;
      dispose = () => { reflection?.dispose(); plain.dispose(); red.dispose(); blue.dispose();
        floor.dispose(); cube.dispose(); capture.dispose(); renderer.dispose(); };
      renderer.render({ renderItems: [...items, { geometry: floor, material: reflection ?? plain,
        label: '301-water-surface' }], cameraPosition: eye, cameraPolicy: 'require',
        environmentLighting: false, frustumCulling: false }, { viewProjectionMatrix: direct });
      passes.push(enabled ? 'native-reflection-textured-water-surface' : 'native-disabled-water-surface');
      renderer.device.setRenderTarget(null);
      pixels = renderer.device.readPixels(0, 0, SETTINGS.width, SETTINGS.height);
    } else {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
      renderer.setPixelRatio(SETTINGS.pixelRatio); renderer.setSize(SETTINGS.width, SETTINGS.height, false);
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
      const scene = new THREE.Scene(); scene.background = new THREE.Color().setRGB(5 / 255, 7 / 255, 13 / 255);
      const camera = new THREE.PerspectiveCamera(SETTINGS.camera.fov, SETTINGS.width / SETTINGS.height,
        SETTINGS.camera.near, SETTINGS.camera.far);
      camera.position.set(...eye); camera.lookAt(...target);
      const cube = new THREE.BoxGeometry(0.9, 0.9, 0.9);
      const red = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1, 0.06, 0.015) });
      const blue = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.015, 0.35, 1) });
      const a = new THREE.Mesh(cube, red); a.position.set(x - 0.65, 0.75, 0);
      const b = new THREE.Mesh(cube, blue); b.position.set(x + 0.65, 0.75, -0.5); scene.add(a, b);
      const geometry = new THREE.PlaneGeometry(6, 6);
      const reflector = new Reflector(geometry, { color: 0xffffff, textureWidth: SETTINGS.width,
        textureHeight: SETTINGS.width, multisample: 0, clipBias: 0 });
      // Stock Reflector applies an overlay tint. Its neutral value is 0.5.
      if (!(reflector.material instanceof THREE.ShaderMaterial)) throw new Error('Reflector must expose its shader uniforms');
      reflector.material.uniforms['color']!.value.setRGB(0.5, 0.5, 0.5);
      reflector.rotation.x = -Math.PI / 2;
      if (broken) {
        const captureReflection = reflector.onBeforeRender.bind(reflector);
        reflector.onBeforeRender = (...args) => {
          // Corrupt only the mirror capture plane; retain identical visible geometry.
          const actualWorld = reflector.matrixWorld.clone();
          reflector.matrixWorld.elements[13] = BROKEN_REFLECTION_PLANE_Y;
          try { captureReflection(...args); } finally { reflector.matrixWorld.copy(actualWorld); }
        };
      }
      const plain = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(5 / 255, 7 / 255, 13 / 255) });
      const floor = new THREE.Mesh(geometry, plain); floor.rotation.x = -Math.PI / 2;
      scene.add(enabled ? reflector : floor);
      dispose = () => { reflector.dispose(); geometry.dispose(); cube.dispose(); red.dispose(); blue.dispose();
        plain.dispose(); renderer.dispose(); renderer.forceContextLoss(); };
      renderer.render(scene, camera);
      passes.push(enabled ? 'three-r185-native-reflector-scene-and-surface' : 'three-r185-disabled-water-surface');
      const gl = renderer.getContext(); pixels = new Uint8Array(SETTINGS.width * SETTINGS.height * 4);
      gl.readPixels(0, 0, SETTINGS.width, SETTINGS.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Three water readback failed');
    }
    const topDown = new Uint8ClampedArray(pixels.length);
    const stride = SETTINGS.width * 4;
    for (let y = 0; y < SETTINGS.height; y++) topDown.set(pixels.subarray(y * stride, (y + 1) * stride), (SETTINGS.height - 1 - y) * stride);
    const image = document.createElement('canvas'); image.width = SETTINGS.width; image.height = SETTINGS.height;
    image.getContext('2d')!.putImageData(new ImageData(topDown, SETTINGS.width, SETTINGS.height), 0, 0);
    return { family: 'water-reflections', engine, enabled, frame, width: SETTINGS.width, height: SETTINGS.height,
      pixels: Array.from(topDown), dataUrl: image.toDataURL('image/png'), passes, errors: [], settings: SETTINGS,
      actualSettings: { ...captureSettings301('water-reflections'), width: canvas.width, height: canvas.height },
      claimSurface: 'rendering internals: flat-water native planar reflected geometry and GPU surface sampling; no refraction, waves, ocean spectrum, or root createAuraApp claim' };
  } finally { dispose(); canvas.remove(); }
}
function translation(x: number, y: number, z: number): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}
function projectedFloor(vp: Float32Array): Geometry {
  const n = 64, vertices = new VertexBuffer(VertexFormat.P3N3T2, (n + 1) ** 2), indices: number[] = [];
  for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) {
    const px = x / n * 6 - 3, pz = z / n * 6 - 3, i = z * (n + 1) + x;
    const w = vp[3]! * px + vp[11]! * pz + vp[15]!;
    vertices.setAttribute(i, 'position', [px, 0, pz]); vertices.setAttribute(i, 'normal', [0, 1, 0]);
    vertices.setAttribute(i, 'uv', [(vp[0]! * px + vp[8]! * pz + vp[12]!) / w * 0.5 + 0.5,
      (vp[1]! * px + vp[9]! * pz + vp[13]!) / w * 0.5 + 0.5]);
    if (z < n && x < n) { const a = i, b = i + 1, c = i + n + 1, d = c + 1; indices.push(a, c, b, b, c, d); }
  }
  return new Geometry(vertices, new IndexBuffer(indices, (n + 1) ** 2));
}


export { expectedWaterReflectionCenters301, calculateWaterReflectionProjectionError301 } from './muse3jsparity-301-water-quality';
