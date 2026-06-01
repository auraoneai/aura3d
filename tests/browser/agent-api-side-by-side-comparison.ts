import * as THREE from "three";
import {
  camera,
  createAuraApp,
  prefabs,
  scene
} from "@aura3d/engine";

interface ComparisonResult {
  readonly status: "ready" | "error" | "waiting";
  readonly auraDrawCalls?: number;
  readonly auraNonDarkPixels?: number;
  readonly threeChildren?: number;
  readonly threeNonDarkPixels?: number;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_SIDE_BY_SIDE_COMPARISON__?: ComparisonResult;
  }
}

window.__AURA3D_SIDE_BY_SIDE_COMPARISON__ = { status: "waiting" };

void runComparison().catch((error: unknown) => {
  window.__AURA3D_SIDE_BY_SIDE_COMPARISON__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
});

async function runComparison(): Promise<void> {
  const auraCanvas = document.querySelector<HTMLCanvasElement>("#aura");
  const threeCanvas = document.querySelector<HTMLCanvasElement>("#three");
  if (!auraCanvas || !threeCanvas) throw new Error("Comparison canvases are missing.");

  const auraApp = createAuraApp(auraCanvas, {
    scene: scene()
      .background("#020617")
      .addMany(prefabs.neonTunnel({ rings: 24 }))
      .camera(camera.flythrough({ from: [0, 0.36, 1.6], to: [0, 0.36, -5.8], target: [0, 0.26, -6.8], captureTime: 0.8 })),
    pixelRatio: 1,
    resize: false
  });

  const threeState = renderRawThreeReference(threeCanvas);
  await waitForFrames(3);

  const auraDiagnostics = auraApp.diagnostics();
  if (auraDiagnostics.errors.length > 0) {
    throw new Error(auraDiagnostics.errors.join("\n"));
  }

  window.__AURA3D_SIDE_BY_SIDE_COMPARISON__ = {
    status: "ready",
    auraDrawCalls: auraDiagnostics.drawCalls,
    auraNonDarkPixels: await countNonDarkPixelsFromDataUrl(auraApp.screenshot().dataUrl),
    threeChildren: threeState.scene.children.length,
    threeNonDarkPixels: await countNonDarkPixelsFromDataUrl(threeCanvas.toDataURL("image/png"))
  };

  threeState.dispose();
  auraApp.dispose();
}

function renderRawThreeReference(canvas: HTMLCanvasElement): { readonly scene: THREE.Scene; dispose(): void } {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor("#020617");

  const rawScene = new THREE.Scene();
  rawScene.background = new THREE.Color("#020617");
  const rawCamera = new THREE.PerspectiveCamera(54, canvas.width / canvas.height, 0.1, 100);
  rawCamera.position.set(0, 0.36, 1.6);
  rawCamera.lookAt(0, 0.26, -6.8);

  rawScene.add(new THREE.AmbientLight("#35506f", 0.7));
  const key = new THREE.PointLight("#67e8f9", 2.4, 9);
  key.position.set(0, 0.55, -1.4);
  rawScene.add(key);

  const ringGeometry = new THREE.TorusGeometry(1.15, 0.022, 8, 48);
  const cyan = new THREE.MeshBasicMaterial({ color: "#67e8f9" });
  const magenta = new THREE.MeshBasicMaterial({ color: "#f472b6" });
  const floorMaterial = new THREE.MeshBasicMaterial({ color: "#123249" });
  const streakGeometry = new THREE.BoxGeometry(0.025, 0.025, 1.1);

  for (let index = 0; index < 24; index += 1) {
    const z = -index * 0.34 - 0.4;
    const ring = new THREE.Mesh(ringGeometry, index % 2 === 0 ? cyan : magenta);
    ring.position.set(0, 0.34, z);
    ring.rotation.x = Math.PI / 2;
    rawScene.add(ring);

    const left = new THREE.Mesh(streakGeometry, magenta);
    left.position.set(-0.8, -0.28, z - 0.08);
    rawScene.add(left);

    const right = new THREE.Mesh(streakGeometry, cyan);
    right.position.set(0.8, -0.28, z - 0.08);
    rawScene.add(right);
  }

  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.025, 8.6), floorMaterial);
  floor.position.set(0, -0.58, -4.2);
  rawScene.add(floor);
  renderer.render(rawScene, rawCamera);

  return {
    scene: rawScene,
    dispose() {
      renderer.dispose();
      ringGeometry.dispose();
      streakGeometry.dispose();
      floor.geometry.dispose();
      cyan.dispose();
      magenta.dispose();
      floorMaterial.dispose();
    }
  };
}

function waitForFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = count;
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

async function countNonDarkPixelsFromDataUrl(dataUrl: string): Promise<number> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return 0;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let count = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (luma > 24) count += 1;
  }
  return count;
}
