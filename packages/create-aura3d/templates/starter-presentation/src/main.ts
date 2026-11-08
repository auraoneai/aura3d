// Starter: animated presentation. A 15-second looping keynote in three beats on one dark stage:
//   0-5 s  title: the headline rises into place while the camera dollies in;
//   5-10 s product: a chrome sculpture spins on a glowing plinth while the camera arcs around it;
//  10-15 s numbers: five bars grow from the floor while the camera pulls back to show the whole stage.
// Everything is driven from one clock in onFrame with small easing helpers, so beats are easy to retime or add.
// `?t=7.5` freezes the clock at 7.5 s (captures, reviews). The look (`night-city`) brings the dark sky,
// reflections, haze and bloom; the overrides trim fog and exposure for a clean stage.
import { camera, createAuraApp, looks, material, primitives, scene, text3D } from "@aura3d/engine";

const LOOK_ID = "night-city" as const;
const LOOP_SECONDS = 15;
const BARS = [0.9, 1.5, 1.2, 2.3, 3.1]; // bar heights in metres: your data
const BAR_COLORS = ["#3b82f6", "#22d3ee", "#a78bfa", "#f472b6", "#fbbf24"];

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (v: number): number => { const x = clamp01(v); return x * x * (3 - 2 * x); };
const beat = (t: number, start: number, length: number): number => smooth((t - start) / length); // 0 -> 1 across a window
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const lerp3 = (a: readonly number[], b: readonly number[], k: number): [number, number, number] => [lerp(a[0]!, b[0]!, k), lerp(a[1]!, b[1]!, k), lerp(a[2]!, b[2]!, k)];

// text3D lays text out from its left edge; centre a line by shifting it half its laid-out width.
const textWidth = (node: ReturnType<typeof text3D>): number => (node.toJSON() as { text3D?: { sdfWidthWorld?: number } }).text3D?.sdfWidthWorld ?? 0;
const headline = text3D("AURA3D", { name: "headline", size: 0.9, depth: 0.12, letterSpacing: 0.06, backend: "sdf", material: material.emissive({ color: "#ffffff", emissive: "#e8eeff", emissiveIntensity: 1.4 }) });
const subtitle = text3D("Typed 3D for the browser", { name: "subtitle", size: 0.28, depth: 0.02, backend: "sdf", material: material.emissive({ color: "#9cc7ff", emissive: "#6fb2ff", emissiveIntensity: 1.2 }) });
const HEADLINE_X = -textWidth(headline) / 2;
const SUBTITLE_X = -textWidth(subtitle) / 2;

const stage = scene()
  .add(looks.preset(LOOK_ID, { exposureEv: -0.2, fogDensityScale: 0.25, background: "#070a12" }))
  .add(primitives.plane({ name: "stage floor", size: [60, 1, 60], material: material.pbr({ color: "#0d1018", roughness: 0.6, metallic: 0 }), receiveShadow: true })) // matte: a glossy floor mirrors the look HDRI as blown white patches
  // Beat 1: headline and subtitle.
  .add(headline.position(HEADLINE_X, 2.6, -2).runtime({ id: "headline", mutable: true }))
  .add(subtitle.position(SUBTITLE_X, 1.9, -2).runtime({ id: "subtitle", mutable: true }))
  // Beat 2: the product on a plinth with a glowing ring.
  .add(primitives.cylinder({ name: "plinth", size: [1.6, 0.5, 1.6], material: material.pbr({ color: "#1a1e29", roughness: 0.3, metallic: 0.6 }) }).position(0, 0.25, 0))
  .add(primitives.cylinder({ name: "plinth glow", size: [1.66, 0.04, 1.66], material: material.emissive({ color: "#6fb2ff", emissive: "#3d8bff", emissiveIntensity: 3 }) }).position(0, 0.5, 0))
  .add(primitives.torusKnot({ name: "product", size: 0.55, params: { tubularSegments: 200, radialSegments: 28, tubeRadius: 0.22, p: 2, q: 3 }, material: material.chrome({ color: "#e6e9f0" }), castShadow: true }).position(0, 1.3, 0).runtime({ id: "product", mutable: true }));
// Beat 3: bars to the right of the plinth, each grown from the floor by setScale + setPosition.
BARS.forEach((_, i) => stage.add(
  primitives.roundedBox({ name: `bar ${i}`, size: [0.42, 1, 0.42], material: material.pbr({ color: BAR_COLORS[i]!, roughness: 0.35, metallic: 0.1, emissive: BAR_COLORS[i]!, emissiveIntensity: 0.35 }), castShadow: true })
    .position(2.4 + i * 0.6, 0.01, 0.4).runtime({ id: `bar-${i}`, mutable: true })
));

// Keep the 16:9 horizontal field of view on narrower (portrait) windows by widening the vertical one.
const fitFov = (fov: number): number => {
  const aspect = innerWidth / Math.max(1, innerHeight);
  if (aspect >= 16 / 9) return fov;
  const half = Math.atan(Math.tan((fov * Math.PI) / 360) * (16 / 9));
  return Math.min(80, (2 * Math.atan(Math.tan(half) / aspect) * 180) / Math.PI);
};

const SHOTS = { // camera position and target per beat
  title: { from: [0, 2.4, 9], to: [0, 2.3, 6.2], target: [0, 2.1, -2] },
  product: { position: (k: number): [number, number, number] => [Math.sin(-0.7 + k * 1.4) * 5.8, 2.1, Math.cos(-0.7 + k * 1.4) * 5.8], target: [0, 1.1, 0] },
  numbers: { from: [3.2, 2.4, 6], to: [1.8, 3.4, 9.5], target: [2.2, 1.3, 0] }
} as const;

const app = createAuraApp("#app", {
  scene: stage.camera(camera.perspective({ position: [0, 2.4, 9], target: [0, 2.1, -2], fov: 40 })),
  ...looks.appOptions(LOOK_ID)
});

const frozenParam = Number(new URLSearchParams(location.search).get("t") ?? Number.NaN);
const frozen = Number.isFinite(frozenParam) ? frozenParam : null; // ignore missing or malformed ?t=
let clock = frozen ?? 0;
app.onFrame((frame) => {
  if (frozen === null) clock += frame.dt;
  const t = clock % LOOP_SECONDS;

  // Title: rise and settle in the first 1.5 s, then lift out of frame before beat 2 so it never sits behind the product.
  const rise = beat(t, 0.2, 1.5);
  const exit = 6 * beat(t, 4.2, 0.8);
  app.nodes.require("headline").setPosition(HEADLINE_X, lerp(1.6, 2.6, rise) + exit, -2).setScale(lerp(0.85, 1, rise));
  app.nodes.require("subtitle").setPosition(SUBTITLE_X, lerp(1.2, 1.9, beat(t, 0.8, 1.5)) + exit, -2);

  // Product: always spinning, lifts in at the start of beat 2.
  app.nodes.require("product").setRotation(0.3, t * 0.9, 0).setPosition(0, lerp(0.9, 1.3, beat(t, 4.6, 1.2)), 0);

  // Bars: staggered growth in beat 3, collapse again at the loop end.
  BARS.forEach((h, i) => {
    const k = beat(t, 10.2 + i * 0.25, 1.1) * (1 - beat(t, 14.4, 0.5));
    const height = Math.max(0.02, h * k);
    app.nodes.require(`bar-${i}`).setScale([1, height, 1]).setPosition(2.4 + i * 0.6, height / 2, 0.4);
  });

  // Camera: one shot per beat, eased cuts between them.
  let position: [number, number, number];
  let target: readonly number[];
  if (t < 5) { position = lerp3(SHOTS.title.from, SHOTS.title.to, beat(t, 0, 5)); target = SHOTS.title.target; }
  else if (t < 10) { position = SHOTS.product.position(beat(t, 5, 5)); target = SHOTS.product.target; }
  else { position = lerp3(SHOTS.numbers.from, SHOTS.numbers.to, beat(t, 10, 5)); target = SHOTS.numbers.target; }
  app.camera?.setPose({ position, target: [target[0]!, target[1]!, target[2]!], fov: fitFov(40) });
});

(window as unknown as { __AURA3D_STARTER__?: unknown }).__AURA3D_STARTER__ = {
  starter: "presentation",
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  hero: { procedural: "text3D headline, chrome sculpture and data bars on one stage", loopSeconds: LOOP_SECONDS, beats: ["title", "product", "numbers"] },
  clock: () => clock
};

void app.ready().then(() => {
  const diagnostics = app.diagnostics();
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
  (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__ = { ready: true, diagnostics };
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});
