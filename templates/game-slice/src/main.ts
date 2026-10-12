import { createAuraApp, looks } from "@aura3d/engine";
import { LOOK_ID, starterScene } from "./scene";

type GameDemoWindow = Window & {
  __AURA3D_GAME_DEMO__?: {
    readonly status: "booting" | "ready";
    readonly metrics: Record<string, number | string | boolean>;
  };
};

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing app root.");

root.innerHTML = `
  <main class="shell">
    <canvas data-testid="game-slice-canvas" width="960" height="540" tabindex="0"></canvas>
    <section>
      <h1>Game Slice</h1>
      <p>Click the viewport or press Space — the slice counts interactions.</p>
      <pre data-status>booting</pre>
    </section>
  </main>
`;

installStyles();

const canvas = root.querySelector<HTMLCanvasElement>("canvas");
const status = root.querySelector<HTMLElement>("[data-status]");
if (!canvas || !status) throw new Error("Template shell failed to initialize.");

const gameWindow = window as GameDemoWindow;
let interactions = 0;

// createAuraApp owns the renderer and frame loop; dispose on unload. The
// outdoor-day look supplies sky IBL, the shadowed sun key, AO, grade, bloom.
const app = createAuraApp(canvas, { scene: starterScene, ...looks.appOptions(LOOK_ID) });
window.addEventListener("beforeunload", () => app.dispose());

function publish(): void {
  const metrics = {
    template: "game-slice",
    interactions,
    look: LOOK_ID,
    publicRuntime: ["@aura3d/engine", "createAuraApp", "looks.preset"],
  };
  gameWindow.__AURA3D_GAME_DEMO__ = { status: "ready", metrics: { interactions, look: LOOK_ID } };
  status.textContent = JSON.stringify(metrics, null, 2);
}

canvas.addEventListener("pointerdown", () => { interactions += 1; publish(); });
canvas.addEventListener("keydown", (event) => {
  if (event.code === "Space") { interactions += 1; publish(); }
});

publish();

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #0f151c; color: #edf4f8; font-family: ui-sans-serif, system-ui, sans-serif; }
    .shell { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 22rem; }
    canvas { width: 100%; height: 100vh; display: block; outline: none; }
    section { border-left: 1px solid #2a3842; background: #151e25; padding: 1.25rem; display: grid; align-content: start; gap: 1rem; }
    h1, p { margin: 0; }
    p { color: #bbcad4; }
    pre { margin: 0; white-space: pre-wrap; color: #b8e4b3; font-size: 0.78rem; line-height: 1.4; }
    @media (max-width: 780px) { .shell { grid-template-columns: 1fr; } canvas { height: 64vh; } section { border-left: 0; border-top: 1px solid #2a3842; } }
  `;
  document.head.append(style);
}
