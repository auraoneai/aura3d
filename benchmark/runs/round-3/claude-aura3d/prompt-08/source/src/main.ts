import {
  type AuraApp,
  camera,
  createAuraApp,
  effects,
  lights,
  prefabs,
  scene,
} from "@aura3d/engine";

type Mode = "day" | "night";

/**
 * Per-mode environment recipe. The geometry (20 buildings, windows, streets,
 * street lights) is identical in both modes — only the sky (scene background)
 * and the lighting rig change, which is exactly what the day/night toggle is
 * meant to demonstrate.
 */
const ENVIRONMENT: Record<
  Mode,
  {
    readonly sky: string;
    readonly caption: string;
    readonly glyph: string;
    readonly buttonLabel: string;
    readonly apply: (s: ReturnType<typeof scene>) => void;
  }
> = {
  day: {
    sky: "#a9cef4",
    caption: "Daytime — 20 buildings, lit windows, streets & street lights.",
    glyph: "🌙",
    buttonLabel: "Switch to Night",
    apply: (s) => {
      // Bright sky-fill plus a warm, high key light reads as midday.
      s.add(lights.ambient({ intensity: 0.95, color: "#dcebff" }));
      s.add(
        lights.directional({
          position: [6, 9, 5],
          intensity: 1.75,
          color: "#fff4df",
        }),
      );
      // Subtle haze gives the block aerial depth without hiding the towers.
      s.add(effects.fog({ density: 0.04, color: "#bcd6f2" }));
    },
  },
  night: {
    sky: "#070b18",
    caption: "Night — windows and street lamps glow against a dark sky.",
    glyph: "☀️",
    buttonLabel: "Switch to Day",
    apply: (s) => {
      // Dim, cool moonlight lets the emissive windows and lamps dominate.
      s.add(lights.ambient({ intensity: 0.18, color: "#22304f" }));
      s.add(
        lights.directional({
          position: [-6, 8, -4],
          intensity: 0.4,
          color: "#8195cf",
        }),
      );
      // Warm pools under the street lamps reinforce the lighting change.
      s.add(lights.point({ position: [-3.15, 0.9, 0.35], intensity: 0.5, color: "#ffd98a" }));
      s.add(lights.point({ position: [2.15, 0.9, 0.35], intensity: 0.5, color: "#ffd98a" }));
      s.add(lights.point({ position: [-3.15, 0.9, -1.75], intensity: 0.5, color: "#ffd98a" }));
      s.add(lights.point({ position: [2.15, 0.9, -1.75], intensity: 0.5, color: "#ffd98a" }));
      s.add(effects.fog({ density: 0.07, color: "#070b18" }));
      // Bloom makes the lit windows and lamps glow at night.
      s.add(effects.bloom({ intensity: 0.5 }));
    },
  },
};

function buildScene(mode: Mode) {
  const env = ENVIRONMENT[mode];
  const s = scene()
    .background(env.sky)
    // 20 box towers with varying heights + lit window bands, asphalt streets
    // with lane stripes, and street-light poles with glowing lamps.
    .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true }))
    .camera(
      camera.perspective({
        position: [0, 3.0, 6.2],
        target: [0, 0.7, -0.7],
        fov: 52,
      }),
    );
  env.apply(s);
  return s;
}

const stage = document.querySelector<HTMLElement>("#stage");
const toggle = document.querySelector<HTMLButtonElement>("#toggle");
const toggleLabel = document.querySelector<HTMLElement>("#toggle-label");
const toggleGlyph = document.querySelector<HTMLElement>("#toggle .glyph");
const caption = document.querySelector<HTMLElement>("#caption");

let mode: Mode = "day";
let app: AuraApp | null = null;

function render() {
  const env = ENVIRONMENT[mode];

  // The toggle is a discrete user action (not a per-frame loop), so rebuilding
  // the single app to swap sky + lighting is the supported pattern. dispose()
  // tears down the WebGL context but leaves the old <canvas> in the DOM, so we
  // clear the stage before mounting a fresh one.
  app?.dispose();
  if (stage) stage.innerHTML = "";

  app = createAuraApp(stage ?? "#app", { scene: buildScene(mode) });

  document.body.dataset.mode = mode;
  if (caption) caption.textContent = env.caption;
  if (toggleLabel) toggleLabel.textContent = env.buttonLabel;
  if (toggleGlyph) toggleGlyph.textContent = env.glyph;
}

toggle?.addEventListener("click", () => {
  mode = mode === "day" ? "night" : "day";
  render();
});

render();
