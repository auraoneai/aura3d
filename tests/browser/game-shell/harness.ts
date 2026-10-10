/**
 * game-shell harness (PRD-09 §15): mounts the table fixture through
 * `createGame` and exposes the game plus pixel/session helpers the
 * game-shell specs assert. Never imports route code.
 *
 * `?animate=0` disables the per-frame node motion (hit-stop and the
 * control-node checks need it on; overlay-identity wants a still frame).
 * `?overlay=dom` forces the DOM overlay path (shell.overlay: "dom").
 */
import { instances, lights, material, primitives, scene } from "@aura3d/engine";
import { createGame, type Prd09Game } from "@aura3d/game";

const params = new URLSearchParams(location.search);
const ANIMATE = params.get("animate") !== "0";

const FELT = material.pbr({ name: "fixture felt", color: "#0f7a4d", roughness: 0.92 });
const RAIL = material.pbr({ name: "fixture walnut rail", color: "#5a3b22", roughness: 0.6 });
const CUE_BALL = material.pbr({ name: "cue ball", color: "#f8f6f0", roughness: 0.25, clearcoat: 0.8 });
const RED_BALL = material.pbr({ name: "red ball", color: "#b91c1c", roughness: 0.25, clearcoat: 0.8 });
const BLACK_BALL = material.pbr({ name: "eight ball", color: "#1f2937", roughness: 0.25, clearcoat: 0.8 });
const SPARK = material.pbr({ name: "spark marker", color: "#ffcf33", roughness: 0.4, emissive: "#ff9a00", emissiveIntensity: 0.8 });

function buildScene() {
  return scene()
    .background("#070d0a")
    .addMany([
      primitives.box({ name: "table bed", material: FELT }).position(0, -0.02, 0).scale([2.0, 0.04, 1.0]),
      primitives.box({ name: "rail n", material: RAIL }).position(0, 0.05, -0.53).scale([2.1, 0.1, 0.08]),
      primitives.box({ name: "rail s", material: RAIL }).position(0, 0.05, 0.53).scale([2.1, 0.1, 0.08]),
      primitives.box({ name: "rail e", material: RAIL }).position(1.03, 0.05, 0).scale([0.08, 0.1, 1.0]),
      primitives.box({ name: "rail w", material: RAIL }).position(-1.03, 0.05, 0).scale([0.08, 0.1, 1.0]),
      primitives.sphere({ name: "cue ball", material: CUE_BALL }).position(-0.6, 0.03, 0).scale([0.06, 0.06, 0.06]),
      primitives.sphere({ name: "red ball", material: RED_BALL }).position(0.3, 0.03, -0.05).scale([0.06, 0.06, 0.06]),
      primitives.sphere({ name: "eight ball", material: BLACK_BALL }).position(0.36, 0.03, 0.04).scale([0.06, 0.06, 0.06]),
      primitives.sphere({ name: "spark marker", material: SPARK }).position(0, 0.3, 0).scale([0.04, 0.04, 0.04]),
      instances.sphere({
        name: "fx markers",
        material: SPARK,
        transforms: [
          { position: [-0.5, 0.1, -0.3], scale: 0.05 },
          { position: [-0.2, 0.1, -0.3], scale: 0.05 },
          { position: [0.1, 0.1, -0.3], scale: 0.05 }
        ]
      }),
      lights.point({ name: "pendant", color: "#fff3d0", intensity: 4.0 }).position(0, 1.6, 0),
      lights.ambient({ name: "room", color: "#35435a", intensity: 0.2 })
    ]);
}

function canvasPixels(): number[] | null {
  const canvas = document.querySelector<HTMLCanvasElement>("#app canvas");
  if (!canvas) return null;
  const w = Math.max(1, canvas.width);
  const h = Math.max(1, canvas.height);
  const probe = document.createElement("canvas");
  probe.width = w;
  probe.height = h;
  const ctx = probe.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  // Downsample to a compact per-pixel RGBA list (every 4th row/col) so the
  // evaluate payload stays small enough for Playwright serialization.
  const out: number[] = [];
  const stride = 4 * 4;
  for (let i = 0; i < data.length; i += stride * 4) out.push(data[i], data[i + 1], data[i + 2]);
  return out;
}

function canvasLuma(): number | null {
  const px = canvasPixels();
  if (!px || px.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < px.length; i += 3) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  return sum / (px.length / 3);
}

async function main(): Promise<void> {
  const target = document.getElementById("app")!;
  const game = createGame<string, string>({
    id: "a3g-fixture-table",
    target,
    scene: buildScene,
    scenarios: {
      pot: {
        description: "cue ball pots the red ball corner-right",
        async setup(g) {
          g.session.transition("playing");
          const cue = g.app.scene.node("cue ball");
          cue.setPosition(-0.35, 0.03, 0.01);
          await new Promise((r) => setTimeout(r, 120));
          cue.setPosition(0.22, 0.03, -0.04);
        }
      },
      "light-hit": {
        description: "struck actor hit-stop: cue ball freezes, eight ball keeps drifting",
        async setup(g) {
          g.session.transition("playing");
          g.session.hitStop(0.045, { actors: ["cue"] });
        }
      },
      frozen: {
        description: "static playing frame for pixel comparisons",
        async setup(g) {
          g.session.transition("playing");
        }
      }
    },
    qualityRebuild: { flags: ["game"] }
  });

  // Two animated nodes: "cue ball" is hit-stoppable as actor "cue";
  // "eight ball" is the uninvolved control node that always moves.
  if (ANIMATE) {
    let t = 0;
    game.app.onFrame(({ dt }) => {
      t += dt;
      const cueDt = game.sessionImpl.scaledDt(dt, "cue");
      const cue = game.app.scene.node("cue ball");
      const eight = game.app.scene.node("eight ball");
      const cuePos = cue.position;
      const eightPos = eight.position;
      cue.setPosition(cuePos[0] + cueDt * 0.5, cuePos[1], cuePos[2]);
      eight.setPosition(eightPos[0], eightPos[1], eightPos[2] + dt * 0.4 * Math.sin(t * 3));
    });
  }

  game.start();
  await game.ready();

  window.__AURA3D_SHELL__ = {
    status: "ready",
    game,
    readPixels: () => canvasPixels(),
    readLuma: () => canvasLuma(),
    sparkScreenPos: { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 3) }
  };
  document.body.dataset.a3gShell = "ready";
}

main().catch((error) => {
  window.__AURA3D_SHELL__ = { status: "error", error: String(error) };
});
