import {
  camera,
  createAuraApp,
  defineAuraAssets,
  environments,
  lights,
  material,
  primitives,
  scene,
  type AuraSceneBuilder
} from "@aura3d/engine";

/**
 * GU47 E-B (WP-2) phase-2 receipt probe: runtime light, environment and shadow control on the production renderer.
 * Each scenario mounts its own app, pauses the loop and drives it with `app.step(1 / 60)` (a deterministic clock), then
 * reads pixels in the same task as the step plus `app.diagnostics().lighting`. Software WebGL2 on the remote runner.
 */
type ScenarioName = "colourRamp" | "pointFollow" | "spotVisibility" | "stadium" | "envRotation" | "envCrossfade";
interface Stat { readonly r: number; readonly g: number; readonly b: number; readonly luma: number }
interface Frame { readonly width: number; readonly height: number; readonly pixels: Uint8Array }
interface Crop { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }
interface LightingSection {
  readonly shadows?: readonly { readonly light: string; readonly sampled: boolean }[] | null;
  readonly punctualLights?: number | null;
  readonly localShadowLights?: number | null;
}
declare global { interface Window { __GU47_EB__?: { run(name: ScenarioName): Promise<Record<string, unknown>> } } }

const hdri = defineAuraAssets({
  meadow: { type: "texture", format: "hdr", url: "/hdri/kloppenheim_06_puresky_1k.hdr" },
  autumn: { type: "texture", format: "hdr", url: "/hdri/autumn_field_puresky_1k.hdr" }
} as never) as unknown as { readonly meadow: never; readonly autumn: never };

const FLOOR_CROP: Crop = { x0: 0.3, y0: 0.55, x1: 0.7, y1: 0.85 };
const SPOT_POOL_CROP: Crop = { x0: 0.55, y0: 0.5, x1: 0.8, y1: 0.75 };
const SKY_CROP: Crop = { x0: 0, y0: 0, x1: 1, y1: 0.3 };
const SPHERE_CROP: Crop = { x0: 0.42, y0: 0.35, x1: 0.58, y1: 0.65 };

const view = () => camera.perspective({ position: [0, 9, 12], target: [0, 0, 0], fov: 50 });
const floor = () => primitives.plane({ name: "floor", material: material.pbr({ color: "#d8d8d8", roughness: 0.85, metallic: 0 }) }).scale([24, 1, 24]);
const post = () => primitives.box({ name: "post", material: material.pbr({ color: "#b0b0b0", roughness: 0.6, metallic: 0 }) }).position(0, 1, 0).scale([0.6, 2, 0.6]);

type App = ReturnType<typeof createAuraApp>;
let clock = 0;

async function mount(build: AuraSceneBuilder): Promise<App> {
  const stage = document.getElementById("eb-stage")!;
  stage.replaceChildren();
  const app = createAuraApp(stage, { pixelRatio: 1, resize: false, renderer: { qualityProfile: "production" }, scene: build });
  const started = performance.now();
  while (performance.now() - started < 60_000 && !(app.diagnostics().drawCalls > 0)) await new Promise((resolve) => setTimeout(resolve, 50));
  if (!(app.diagnostics().drawCalls > 0)) throw new Error(`GU47 E-B probe never drew: ${JSON.stringify(app.diagnostics().errors)}`);
  app.pause();
  clock = 0;
  return app;
}

/** Wait (real time) for async uploads such as the HDRI probe, then settle one stepped frame. */
async function settle(app: App, ms: number): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < ms) await new Promise((resolve) => setTimeout(resolve, 250));
  step(app, 1 / 60);
}

function step(app: App, seconds: number): void {
  const frames = Math.max(1, Math.round(seconds * 60));
  for (let i = 0; i < frames; i += 1) app.step(1 / 60);
  clock += frames / 60;
}

/** Read the frame the last step drew (same task, before the compositor presents). Rows are bottom-up. */
function read(app: App): Frame {
  const canvas = app.canvas!;
  const gl = canvas.getContext("webgl2")!;
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return { width: canvas.width, height: canvas.height, pixels };
}

function cropStat(frame: Frame, crop: Crop): Stat {
  let r = 0; let g = 0; let b = 0; let n = 0;
  const x0 = Math.floor(crop.x0 * frame.width); const x1 = Math.ceil(crop.x1 * frame.width);
  for (let row = Math.floor(crop.y0 * frame.height); row < Math.ceil(crop.y1 * frame.height); row += 1) {
    const y = frame.height - 1 - row;
    for (let x = x0; x < x1; x += 1) {
      const i = (y * frame.width + x) * 4;
      r += frame.pixels[i]!; g += frame.pixels[i + 1]!; b += frame.pixels[i + 2]!; n += 1;
    }
  }
  const round = (v: number) => Number((v / Math.max(1, n)).toFixed(3));
  return { r: round(r), g: round(g), b: round(b), luma: round(0.2126 * r + 0.7152 * g + 0.0722 * b) };
}

function meanAbsDiff(a: Frame, b: Frame, crop: Crop): number {
  let sum = 0; let n = 0;
  for (let row = Math.floor(crop.y0 * a.height); row < Math.ceil(crop.y1 * a.height); row += 1) {
    const y = a.height - 1 - row;
    for (let x = Math.floor(crop.x0 * a.width); x < Math.ceil(crop.x1 * a.width); x += 1) {
      const i = (y * a.width + x) * 4;
      sum += Math.abs(a.pixels[i]! - b.pixels[i]!) + Math.abs(a.pixels[i + 1]! - b.pixels[i + 1]!) + Math.abs(a.pixels[i + 2]! - b.pixels[i + 2]!);
      n += 3;
    }
  }
  return Number((sum / Math.max(1, n)).toFixed(3));
}

/** Luma-weighted x centroid (0..1) of the pixels brighter than half the frame's peak. */
function brightCentroidX(frame: Frame): number {
  let peak = 0;
  const luma = (i: number) => 0.2126 * frame.pixels[i]! + 0.7152 * frame.pixels[i + 1]! + 0.0722 * frame.pixels[i + 2]!;
  for (let i = 0; i < frame.pixels.length; i += 4) peak = Math.max(peak, luma(i));
  let sum = 0; let weight = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const l = luma((y * frame.width + x) * 4);
      if (l < peak * 0.5) continue;
      sum += x * l; weight += l;
    }
  }
  return Number((sum / Math.max(1, weight) / frame.width).toFixed(4));
}

function jpeg(frame: Frame): string {
  const copy = document.createElement("canvas");
  copy.width = frame.width; copy.height = frame.height;
  const ctx = copy.getContext("2d")!;
  const image = ctx.createImageData(frame.width, frame.height);
  for (let y = 0; y < frame.height; y += 1) {
    image.data.set(frame.pixels.subarray((frame.height - 1 - y) * frame.width * 4, (frame.height - y) * frame.width * 4), y * frame.width * 4);
  }
  ctx.putImageData(image, 0, 0);
  return copy.toDataURL("image/jpeg", 0.9).split(",")[1] ?? "";
}

function lighting(app: App): LightingSection {
  return ((app.diagnostics() as unknown as { lighting?: LightingSection }).lighting) ?? {};
}

const localRows = (section: LightingSection) => (section.shadows ?? []).filter((row) => row.light.startsWith("local-"));

const scenarios: Record<ScenarioName, () => Promise<Record<string, unknown>>> = {
  /** Directional colour ramp white -> red over 2 s (setLight transitionSeconds). */
  async colourRamp() {
    const app = await mount(scene().camera(view()).add(floor()).add(lights.directional({ name: "sun", position: [3, 8, 2], intensity: 2.5, color: "#ffffff" }).runtime({ id: "sun" })));
    try {
      app.nodes.require("sun").setLight!({ color: "#ff0000" }, { transitionSeconds: 2 });
      const samples: { t: number; stat: Stat }[] = [];
      const frames: Record<string, string> = {};
      for (const t of [0, 0.5, 1, 1.5, 2, 2.5]) {
        step(app, t === 0 ? 1 / 60 : 0.5);
        const frame = read(app);
        samples.push({ t, stat: cropStat(frame, FLOOR_CROP) });
        if (t === 0 || t === 1 || t === 2) frames[`ramp-${t}s`] = jpeg(frame);
      }
      return { samples, frames };
    } finally { app.dispose(); }
  },
  /** A point light follows setPosition every frame: the lit pool's centroid moves with it. */
  async pointFollow() {
    const app = await mount(scene().camera(view()).add(floor()).add(lights.point({ name: "lamp", position: [-4, 1.2, 0], intensity: 6, distance: 6, color: "#ffffff" }).runtime({ id: "lamp" })));
    try {
      const lamp = app.nodes.require("lamp");
      const samples: { x: number; centroid: number }[] = [];
      for (const x of [-4, -2, 0, 2, 4]) {
        lamp.setPosition(x, 1.2, 0);
        step(app, 1 / 60);
        samples.push({ x, centroid: brightCentroidX(read(app)) });
      }
      return { samples };
    } finally { app.dispose(); }
  },
  /** setVisible(false) on a shadowed spot removes its light, its shadow row and its count. */
  async spotVisibility() {
    const app = await mount(scene().camera(view()).add(floor()).add(post())
      .add(lights.directional({ name: "sun", position: [4, 8, 3], intensity: 1.5, color: "#ffffff", shadow: true }))
      .add(lights.spot({ name: "spot", position: [3, 6, 3], target: [2, 0, 2], angle: 0.5, intensity: 60, distance: 20, color: "#ffffff", shadow: true }).runtime({ id: "spot" })));
    try {
      step(app, 1 / 60);
      const beforeFrame = read(app);
      const before = { lighting: lighting(app), pool: cropStat(beforeFrame, SPOT_POOL_CROP) };
      app.nodes.require("spot").setVisible(false);
      step(app, 1 / 60);
      const afterFrame = read(app);
      const after = { lighting: lighting(app), pool: cropStat(afterFrame, SPOT_POOL_CROP) };
      return { before, after, frames: { "spot-visible": jpeg(beforeFrame), "spot-hidden": jpeg(afterFrame) } };
    } finally { app.dispose(); }
  },
  /** 4-spot stadium at High: sun + 2 local shadow casters, 2 sampled local rows. */
  async stadium() {
    let build = scene().camera(view()).add(floor()).add(post())
      .add(lights.directional({ name: "sun", position: [6, 12, 4], intensity: 1.5, color: "#ffffff", shadow: true }));
    [[-8, 10, -8], [8, 10, -8], [-8, 10, 8], [8, 10, 8]].forEach((position, index) => {
      build = build.add(lights.spot({ name: `floodlight-${index}`, position: position as [number, number, number], target: [0, 0, 0], angle: 0.6, intensity: 60 - index * 5, distance: 30, color: "#ffffff", shadow: true }).runtime({ id: `floodlight-${index}` }));
    });
    const app = await mount(build);
    try {
      step(app, 1 / 60);
      const section = lighting(app);
      return { lighting: section, sampledLocalRows: localRows(section).filter((row) => row.sampled).length, frames: { stadium: jpeg(read(app)) } };
    } finally { app.dispose(); }
  },
  /** setEnvironmentRotation(pi / 2) moves the sky and the reflections (environmentProbeRotation). */
  async envRotation() {
    const app = await mount(scene().camera(camera.perspective({ position: [0, 1.2, 4], target: [0, 1, 0], fov: 55 }))
      .add(environments.hdri({ texture: hdri.meadow, intensity: 1, background: true }))
      .add(primitives.sphere({ name: "chrome", material: material.pbr({ color: "#ffffff", roughness: 0.08, metallic: 1 }) }).position(0, 1, 0)));
    try {
      await settle(app, 8000);
      const zero = read(app);
      app.lighting.setEnvironmentRotation(Math.PI / 2);
      step(app, 1 / 60);
      const quarter = read(app);
      return {
        skyDiff: meanAbsDiff(zero, quarter, SKY_CROP),
        sphereDiff: meanAbsDiff(zero, quarter, SPHERE_CROP),
        frames: { "env-rot-0": jpeg(zero), "env-rot-90": jpeg(quarter) }
      };
    } finally { app.dispose(); }
  },
  /** setEnvironment(autumn, { crossfadeSeconds: 1 }): the environment term dips and comes back on the new sky. */
  async envCrossfade() {
    const app = await mount(scene().camera(camera.perspective({ position: [0, 1.2, 4], target: [0, 1, 0], fov: 55 }))
      .add(environments.hdri({ texture: hdri.meadow, intensity: 1, background: true }))
      .add(primitives.sphere({ name: "chrome", material: material.pbr({ color: "#ffffff", roughness: 0.3, metallic: 1 }) }).position(0, 1, 0)));
    try {
      await settle(app, 8000);
      const series: { t: number; sphere: Stat }[] = [{ t: 0, sphere: cropStat(read(app), SPHERE_CROP) }];
      app.lighting.setEnvironment(hdri.autumn, { crossfadeSeconds: 1, background: true });
      for (let i = 1; i <= 16; i += 1) {
        step(app, 0.25);
        await new Promise((resolve) => setTimeout(resolve, 250));
        series.push({ t: clock, sphere: cropStat(read(app), SPHERE_CROP) });
      }
      return { series };
    } finally { app.dispose(); }
  }
};

window.__GU47_EB__ = { run: (name) => scenarios[name]() };
