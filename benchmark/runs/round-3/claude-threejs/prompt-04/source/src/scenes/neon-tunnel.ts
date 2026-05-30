import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/**
 * Neon Tunnel Flythrough (plain three.js)
 *
 * - Procedurally generated tube geometry (TubeGeometry along a closed
 *   CatmullRom curve) seen from the inside (BackSide).
 * - Emissive segments: a scrolling neon grid baked into the tunnel wall plus
 *   bright glowing rings placed at intervals along the path.
 * - UnrealBloom postprocessing makes the emissive surfaces glow.
 * - Exponential fog gives depth falloff so the tunnel fades into the distance.
 * - The camera is animated continuously along the curve for the flythrough.
 *
 * Returns a disposer that stops the loop and releases GPU resources.
 */
export function startNeonTunnel(container: HTMLElement): () => void {
  // Palette ----------------------------------------------------------------
  const BG = new THREE.Color("#05020f");
  const NEON_CYAN = new THREE.Color("#00f0ff");
  const NEON_MAGENTA = new THREE.Color("#ff2bd6");

  // Renderer ---------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // Scene / camera / fog ---------------------------------------------------
  const scene = new THREE.Scene();
  scene.background = BG;
  // Depth falloff: the tunnel dissolves into the dark distance.
  scene.fog = new THREE.FogExp2(BG.getHex(), 0.045);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    300,
  );

  // 1) Flight path: a closed, winding curve through 3D space ----------------
  const pathPoints = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(6, 3, -14),
    new THREE.Vector3(2, -4, -30),
    new THREE.Vector3(-8, 1, -44),
    new THREE.Vector3(-4, 6, -60),
    new THREE.Vector3(7, 2, -74),
    new THREE.Vector3(10, -5, -90),
    new THREE.Vector3(0, -2, -104),
    new THREE.Vector3(-9, 3, -118),
    new THREE.Vector3(-3, 5, -134),
  ];
  const curve = new THREE.CatmullRomCurve3(pathPoints, true, "catmullrom", 0.5);

  // 2) Tube geometry around the curve --------------------------------------
  const TUBE_RADIUS = 2.4;
  const tubeGeometry = new THREE.TubeGeometry(curve, 800, TUBE_RADIUS, 28, true);

  // 3) Emissive neon-grid texture for the tunnel wall ----------------------
  const gridTexture = makeNeonGridTexture();
  gridTexture.wrapS = THREE.RepeatWrapping;
  gridTexture.wrapT = THREE.RepeatWrapping;
  // S runs along the tube, T runs around it.
  gridTexture.repeat.set(70, 4);

  const tubeMaterial = new THREE.MeshStandardMaterial({
    side: THREE.BackSide,
    color: new THREE.Color("#0a0820"),
    map: gridTexture,
    emissive: new THREE.Color("#ffffff"),
    emissiveMap: gridTexture,
    emissiveIntensity: 2.6,
    metalness: 0.6,
    roughness: 0.35,
  });

  const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
  scene.add(tube);

  // 4) Bright emissive rings spaced along the path -------------------------
  const disposables: { dispose: () => void }[] = [tubeGeometry, gridTexture, tubeMaterial];
  const RING_COUNT = 70;
  const up = new THREE.Vector3(0, 1, 0);
  const ringGeo = new THREE.TorusGeometry(TUBE_RADIUS * 0.92, 0.06, 8, 48);
  disposables.push(ringGeo);
  for (let i = 0; i < RING_COUNT; i++) {
    const u = i / RING_COUNT;
    const center = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u).normalize();

    // HDR colours (values > 1) push the bloom threshold so the rings glow.
    const base = i % 2 === 0 ? NEON_CYAN : NEON_MAGENTA;
    const color = base.clone().multiplyScalar(2.2);
    const ringMat = new THREE.MeshBasicMaterial({ color, toneMapped: true });
    disposables.push(ringMat);

    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(center);
    ring.quaternion.setFromUnitVectors(up, tangent);
    scene.add(ring);
  }

  // 5) Lighting: ambient fill + a point light riding with the camera -------
  const ambient = new THREE.AmbientLight(0x404a7a, 1.4);
  scene.add(ambient);
  const headLight = new THREE.PointLight(0x88aaff, 40, 50, 2);
  scene.add(headLight);

  // 6) Postprocessing: bloom -----------------------------------------------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.4, // strength
    0.7, // radius
    0.2, // threshold
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // 7) Animation loop ------------------------------------------------------
  const SPEED = 0.018; // fraction of the loop per second
  const camPos = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const clock = new THREE.Clock();
  let raf = 0;
  let running = true;

  const animate = () => {
    if (!running) return;
    raf = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    const u = (t * SPEED) % 1;
    const ahead = (u + 0.01) % 1;
    curve.getPointAt(u, camPos);
    curve.getPointAt(ahead, lookAt);
    camera.position.copy(camPos);
    camera.lookAt(lookAt);
    headLight.position.copy(camPos);

    // Scroll the wall texture for a sense of speed.
    gridTexture.offset.x = -t * 0.6;
    // Subtle pulse on the emissive wall.
    tubeMaterial.emissiveIntensity = 2.2 + 0.6 * Math.sin(t * 1.5);

    composer.render();
  };
  animate();

  // 8) Resize --------------------------------------------------------------
  const onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
  };
  window.addEventListener("resize", onResize);

  // Disposer ---------------------------------------------------------------
  return () => {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    composer.dispose();
    renderer.dispose();
    for (const d of disposables) d.dispose();
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  };
}

/**
 * Build a dark canvas texture with a glowing neon grid (rings + rails).
 * Used as both the base map and the emissive map of the tunnel wall.
 */
function makeNeonGridTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#070318";
  ctx.fillRect(0, 0, size, size);

  const drawLine = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    width: number,
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };

  // Rings: vertical lines in texture space (constant position along the tube).
  drawLine(size * 0.5, 0, size * 0.5, size, "#00f0ff", 10);
  drawLine(size * 0.08, 0, size * 0.08, size, "#ff2bd6", 6);
  drawLine(size * 0.92, 0, size * 0.92, size, "#ff2bd6", 6);
  // Rails: horizontal lines (run along the length of the tube).
  drawLine(0, size * 0.25, size, size * 0.25, "#2a6cff", 4);
  drawLine(0, size * 0.75, size, size * 0.75, "#2a6cff", 4);

  ctx.shadowBlur = 0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
