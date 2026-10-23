/**
 * Directional-shadow footprint lab: one small figure-sized caster on a ground plane, lit like Aura Slam, seen through a
 * narrow-fov far camera or a wide near one. Reports how many pixels the caster darkens with the sun shadow on vs off.
 * Query: fov, dist (camera distance scale), shadow=0|1, cascades, maxDistance, hidden=N (extra parked casters), mapSize.
 */
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

type Win = Window & { __SHADOW_LAB__?: unknown; __SHADOW_LAB_ERROR__?: string };

const q = new URLSearchParams(location.search);
const num = (k: string, d: number): number => (q.has(k) ? Number(q.get(k)) : d);

async function capture(canvas: HTMLCanvasElement): Promise<Uint8ClampedArray> {
  const url = canvas.toDataURL("image/png");
  const img = new Image();
  await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error("decode failed")); img.src = url; });
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height).data;
}

async function build(opts: { shadow: boolean; withCaster: boolean }): Promise<{ pixels: Uint8ClampedArray; dataUrl: string; diag: unknown }> {
  const canvas = document.createElement("canvas");
  canvas.id = "world";
  document.body.replaceChildren(canvas);
  canvas.width = 640;
  canvas.height = 360;
  const fov = num("fov", 15);
  const dist = num("dist", 1);
  const eye: [number, number, number] = [0, 25.5 * dist, 37.1 * dist];
  const shadowOptions = {
    ...(q.has("cascades") ? { cascades: (q.get("cascades") === "auto" ? "auto" : Number(q.get("cascades"))) as 1 | 2 | 3 | 4 | "auto" } : {}),
    ...(q.has("maxDistance") ? { maxDistance: Number(q.get("maxDistance")) } : {}),
    ...(q.has("mapSize") ? { mapSize: Number(q.get("mapSize")) as 1024 | 2048 | 4096 } : {})
  };
  const body = (x: number, z: number, tag: string) => [
    primitives.capsule({ name: `${tag}-torso`, size: [0.35, 0.69, 0.35], material: material.pbr({ color: "#f3f0dc", roughness: 0.78 }) }).position(x, 1.2, z),
    primitives.cylinder({ name: `${tag}-legL`, size: [0.14, 0.8, 0.14], material: material.pbr({ color: "#214b3e", roughness: 0.8 }) }).position(x - 0.12, 0.45, z),
    primitives.cylinder({ name: `${tag}-legR`, size: [0.14, 0.8, 0.14], material: material.pbr({ color: "#214b3e", roughness: 0.8 }) }).position(x + 0.12, 0.45, z),
    primitives.sphere({ name: `${tag}-head`, size: [0.26, 0.26, 0.26], material: material.pbr({ color: "#c9926d", roughness: 0.7 }) }).position(x, 1.7, z)
  ];
  let s = scene()
    .background("#0d2230")
    .camera(camera.perspective({ fov, near: 0.1, far: 120 * dist, position: eye, target: [0, 0, 0.7] }))
    .add(lights.ambient({ color: "#dce8f2", intensity: 0.62 }))
    .add(lights.hemisphere({ skyColor: "#eef6ff", groundColor: "#4d6358", intensity: 0.72 }))
    .add(lights.directional({ color: "#fff6e5", intensity: 1.95, position: [14, 24, 12], shadow: opts.shadow ? (Object.keys(shadowOptions).length || q.has("fit") ? { ...shadowOptions, ...(q.get("fit") === "scene" ? { fit: { center: [0, 0, 0] as [number, number, number], extent: num("fitExtent", 30), depth: num("fitDepth", 60) } } : {}) } : true) : false }))
    .add(primitives.plane({ name: "ground", size: [num("ground", 24), 1, num("ground", 24)], material: material.pbr({ color: "#2b678e", roughness: 0.9 }), ...(q.get("groundCast") === "0" ? { castShadow: false } : {}) }).position(0, -0.01, 0));
  if (opts.withCaster) for (const n of body(0, 3.0, "caster")) s = s.add(n);
  const parked = num("hidden", 0);
  for (let i = 0; i < parked; i++) for (const n of body(0, -50, `parked${i}`)) s = s.add(n);
  const app = createAuraApp(canvas, { scene: s, autoStart: false, resize: false, pixelRatio: 1, renderer: { quality: "high" } } as never);
  await app.ready();
  app.step(1 / 60);
  app.step(1 / 60);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  const pixels = await capture(canvas);
  const diag = (app as unknown as { diagnostics?: () => unknown }).diagnostics?.();
  (app as unknown as { dispose?: () => void }).dispose?.();
  return { pixels, dataUrl, diag };
}

async function measure(): Promise<unknown> {
  const withShadow = q.get("shadow") !== "0";
  const base = await build({ shadow: withShadow, withCaster: false });
  const full = await build({ shadow: withShadow, withCaster: true });
  let darker = 0, lighter = 0, changed = 0;
  for (let i = 0; i < full.pixels.length; i += 4) {
    const lf = full.pixels[i]! * 0.3 + full.pixels[i + 1]! * 0.59 + full.pixels[i + 2]! * 0.11;
    const lb = base.pixels[i]! * 0.3 + base.pixels[i + 1]! * 0.59 + base.pixels[i + 2]! * 0.11;
    if (lf < lb - 8) darker++;
    else if (lf > lb + 8) lighter++;
    let d = 0;
    for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(full.pixels[i + k]! - base.pixels[i + k]!));
    if (d > 8) changed++;
  }
  return { shadow: withShadow, darker, lighter, changed, total: full.pixels.length / 4, image: full.dataUrl, diag: full.diag };
}

(window as Win).__SHADOW_LAB__ = { ready: true, measure };
