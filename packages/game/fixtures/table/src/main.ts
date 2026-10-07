/**
 * PRD-09 reference fixture: a billiards-shaped game built entirely on
 * `createGame`. One table, three balls, a `pot` scenario. It never imports
 * route code — the migration CI serves it to prove the shared runtime ships
 * the same look routes used to hand-build.
 */
import { lights, material, primitives, scene } from "@aura3d/engine";
import { createGame } from "@aura3d/game";

const FELT = material.pbr({ name: "fixture felt", color: "#0f7a4d", roughness: 0.92 });
const RAIL = material.pbr({ name: "fixture walnut rail", color: "#5a3b22", roughness: 0.6 });
const CUE_BALL = material.pbr({ name: "cue ball", color: "#f8f6f0", roughness: 0.25, clearcoat: 0.8 });
const RED_BALL = material.pbr({ name: "red ball", color: "#b91c1c", roughness: 0.25, clearcoat: 0.8 });
const BLACK_BALL = material.pbr({ name: "eight ball", color: "#1f2937", roughness: 0.25, clearcoat: 0.8 });

const game = createGame({
  id: "a3g-fixture-table",
  target: document.getElementById("app")!,
  scene: () =>
    scene()
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
        lights.point({ name: "pendant", color: "#fff3d0", intensity: 4.0 }).position(0, 1.6, 0),
        lights.ambient({ name: "room", color: "#35435a", intensity: 0.2 })
      ]),
  scenarios: {
    // ?capture=scenario&scenario=pot — scripted review take.
    pot: {
      description: "cue ball pots the red ball corner-right",
      async setup(g) {
        g.session.transition("playing");
        const cue = g.app.scene.node("cue ball");
        cue.setPosition(-0.35, 0.03, 0.01);
        await new Promise((r) => setTimeout(r, 120));
        cue.setPosition(0.22, 0.03, -0.04);
      }
    }
  },
  qualityRebuild: { flags: ["game"] }
});

game.start();
void game.ready().then(() => {
  document.body.dataset.a3gFixture = "ready";
});
