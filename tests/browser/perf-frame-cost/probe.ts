import { camera, createAuraApp, createCountedRng, effects, environments, instances, lights, material, primitives, scene } from "@aura3d/engine";

/** Frame-cost probe page (remote only; see tests/browser/perf-frame-cost.spec.ts). Query: scene=cube|forest, trees, rocks, shadow=0|1, fog=0|1, post=0|1. */
type V3 = [number, number, number];
const q = new URLSearchParams(location.search);
const sceneName = q.get("scene") ?? "cube";
const trees = Number(q.get("trees") ?? 8000);
const rocks = Number(q.get("rocks") ?? 2000);
const shadow = q.get("shadow") !== "0";
const fog = q.get("fog") !== "0";
const envNone = q.get("env") === "none";
const W = 640, H = 360;

const canvas = document.createElement("canvas");
canvas.width = W; canvas.height = H;
canvas.style.cssText = `width:${W}px;height:${H}px;display:block`;
document.body.appendChild(canvas);

function forestScene() {
  const rng = createCountedRng(7);
  const trunks: { position: V3; rotation: V3; scale: number }[] = [];
  const canopies: typeof trunks = [];
  const canopyColors: string[] = [];
  const rockT: typeof trunks = [];
  const rockColors: string[] = [];
  for (let i = 0; i < trees; i++) {
    const x = (rng.next() - 0.5) * 160, z = (rng.next() - 0.5) * 160, s = 0.7 + rng.next() * 0.9, yaw = rng.next() * Math.PI * 2;
    trunks.push({ position: [x, 0.6 * s, z], rotation: [0, yaw, 0], scale: s });
    canopies.push({ position: [x, 2.1 * s, z], rotation: [0, yaw, 0], scale: s });
    canopyColors.push(`hsl(${Math.round(97 + rng.next() * 29)} 45% ${Math.round(20 + rng.next() * 12)}%)`);
  }
  for (let i = 0; i < rocks; i++) {
    const s = 0.3 + rng.next() * 0.8;
    rockT.push({ position: [(rng.next() - 0.5) * 160, 0.25 * s, (rng.next() - 0.5) * 160], rotation: [0, rng.next() * Math.PI * 2, 0], scale: s });
    rockColors.push(`hsl(29 5% ${Math.round(30 + rng.next() * 20)}%)`);
  }
  let s = scene()
    .background("#aab8c4")
    .camera(camera.perspective({ fov: 50, near: 0.1, far: 400, position: [0, 9, 34], target: [0, 3, 0] }))
    .add(lights.hemisphere({ skyColor: "#dce8f2", groundColor: "#4d6358", intensity: 1.1 }))
    .add(lights.directional({ color: "#fff4e0", intensity: 2.4, position: [30, 50, 20], shadow }));
  if (fog) s = s.add(effects.fog({ color: "#aab8c4", density: 0.012 }));
  if (envNone) s = s.add(environments.none());
  s = s.add(primitives.plane({ name: "ground", size: [400, 1, 400], material: material.pbr({ color: "#566b4a", roughness: 1 }) }));
  if (trees > 0) {
    s = s.add(instances.cylinder({ name: "trunks", size: [0.36, 1.2, 0.36], transforms: trunks, castShadow: shadow, material: material.pbr({ color: "#6b4a32", roughness: 0.95 }) }));
    s = s.add(instances.cone({ name: "canopies", size: [1.8, 2.2, 1.8], transforms: canopies, colors: canopyColors, castShadow: shadow, material: material.pbr({ color: "#ffffff", roughness: 0.85 }) }));
  }
  if (rocks > 0) s = s.add(instances.sphere({ name: "rocks", size: [1, 1, 1], transforms: rockT, colors: rockColors, castShadow: shadow, material: material.pbr({ color: "#ffffff", roughness: 0.9 }) }));
  return s;
}

function cubeScene() {
  let s = scene()
    .camera(camera.perspective({ fov: 50, near: 0.1, far: 100, position: [2, 2, 4], target: [0, 0.5, 0] }))
    .add(lights.ambient({ color: "#ffffff", intensity: 1 }));
  if (envNone) s = s.add(environments.none());
  if (q.get("bloom") === "1") s = s.add(effects.bloom({ intensity: 0.6, threshold: 0.8 }));
  if (shadow && q.get("cubeshadow") === "1") {
    s = s.add(lights.directional({ color: "#fff4e0", intensity: 2.4, position: [4, 8, 3], shadow: true }))
      .add(primitives.plane({ name: "floor", size: [20, 1, 20], material: material.pbr({ color: "#566b4a", roughness: 1 }) }));
  }
  return s.add(primitives.box({ name: "cube", size: [1, 1, 1], material: material.pbr({ color: "#d86a3a" }) }).runtime({ id: "cube" }));
}

const w = window as unknown as Record<string, unknown>;
const t0 = performance.now();
try {
  let frame: (dt: number) => void;
  let diagnostics: () => unknown = () => null;
  let tCreated = 0;
  if (sceneName === "bench") {
    // tools/bench-vs-threejs/<name>/aura/scene.ts, built from workspace source through the dev server aliases.
    const mod = await import(/* @vite-ignore */ `/tools/bench-vs-threejs/${q.get("name")}/aura/scene.ts`) as { start(canvas: HTMLCanvasElement): Promise<{ frame(dt: number): void }> };
    tCreated = performance.now();
    const handle = await mod.start(canvas);
    frame = (dt) => handle.frame(dt);
  } else {
    const app = createAuraApp(canvas, {
      autoStart: false, resize: false, pixelRatio: 1,
      renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
      ...(sceneName === "forest" ? { output: { toneMapping: "aces" as const } } : {}),
      scene: sceneName === "forest" ? forestScene() : cubeScene()
    });
    tCreated = performance.now();
    await app.ready();
    const cube = sceneName === "cube" ? app.nodes.require("cube") : null;
    let t = 0;
    frame = (dt) => {
      t += dt;
      if (cube) cube.setRotation(0, t, 0);
      else app.camera?.setPose({ position: [Math.sin(t * 0.15) * 12, 9, 34], target: [0, 3, 0], fov: 50 });
      app.step(dt);
    };
    diagnostics = () => { try { return JSON.parse(JSON.stringify(app.diagnostics())); } catch (e) { return String(e); } };
  }
  const tReady = performance.now();
  const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
  const sink = new Uint8Array(4);
  w.__PROBE__ = {
    ready: true,
    setup: { createMs: tCreated - t0, readyMs: tReady - tCreated },
    frame: (dt: number) => { const a = performance.now(); frame(dt); const b = performance.now(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sink); return { cpuMs: b - a, totalMs: performance.now() - a }; },
    luma: () => {
      frame(1 / 60);
      const buf = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i += 4) sum += 0.2126 * buf[i]! + 0.7152 * buf[i + 1]! + 0.0722 * buf[i + 2]!;
      return sum / (W * H);
    },
    diagnostics
  };
} catch (error) {
  w.__PROBE__ = { ready: false, error: String((error as Error)?.stack ?? error) };
}
