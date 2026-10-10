/**
 * PRD-09 T1 fixture: a fighter-shaped game built entirely on `createGame`.
 * Two combatants and a third, uninvolved animated node (the corner spotlight
 * orbit) — the `light-hit` scenario freezes only the struck actor through the
 * session hit-stop path, which is what `hitstop.spec` needs without depending
 * on a route's own sources.
 */
import { lights, material, primitives, scene } from "@aura3d/engine";
import { createGame } from "@aura3d/game";

const MAT = material.pbr({ name: "fixture canvas mat", color: "#262a33", roughness: 0.95 });
const APRON = material.pbr({ name: "fixture ring apron", color: "#3b4256", roughness: 0.8 });
const STRIKER = material.pbr({ name: "striker", color: "#c23333", roughness: 0.5 });
const TARGET = material.pbr({ name: "target", color: "#2f5fc2", roughness: 0.5 });
const BEACON = material.pbr({ name: "corner beacon", color: "#f4c13d", roughness: 0.3, emissive: "#f4c13d", emissiveIntensity: 0.8 });

const game = createGame({
  id: "a3g-fixture-fighter",
  target: document.getElementById("app")!,
  scene: () =>
    scene()
      .background("#0a0c12")
      .addMany([
        primitives.box({ name: "mat", material: MAT }).position(0, -0.01, 0).scale([3.2, 0.02, 3.2]),
        primitives.box({ name: "apron", material: APRON }).position(0, -0.06, 0).scale([3.6, 0.08, 3.6]),
        // Striker advances and swings; target is the hit-stoppable actor.
        primitives.capsule({ name: "striker", material: STRIKER }).position(-0.7, 0.45, 0).scale([0.16, 0.36, 0.16]),
        primitives.capsule({ name: "target", material: TARGET }).position(0.7, 0.45, 0).scale([0.16, 0.36, 0.16]),
        // Third, uninvolved animated node: orbits a corner post every frame.
        primitives.sphere({ name: "corner beacon", material: BEACON }).position(1.5, 1.1, 1.5).scale([0.05, 0.05, 0.05]),
        lights.point({ name: "key", color: "#fff0d8", intensity: 3.0 }).position(0, 2.4, 0.6),
        lights.ambient({ name: "room", color: "#2b3450", intensity: 0.25 })
      ]),
  scenarios: {
    // ?capture=scenario&scenario=light-hit — scripted review take: the strike
    // lands and freezes only the struck actor for two frames.
    "light-hit": {
      description: "striker lands a jab; target hit-stops, beacon keeps orbiting",
      async setup(g) {
        g.session.transition("playing");
        const striker = g.app.scene.node("striker");
        striker.setPosition(0.45, 0.45, 0);
        await new Promise((r) => setTimeout(r, 60));
        g.session.hitStop(0.045, { actors: ["target"] });
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

// Per-frame animation: the struck "target" actor uses hit-stop-scaled dt so
// the freeze is visible; the uninvolved "corner beacon" orbits on raw dt.
let t = 0;
game.app.onFrame(({ dt }) => {
  t += dt;
  const targetDt = game.sessionImpl.scaledDt(dt, "target");
  const target = game.app.scene.node("target");
  const beacon = game.app.scene.node("corner beacon");
  const pos = target.position;
  target.setPosition(pos[0], pos[1] + targetDt * 0.3, pos[2]);
  beacon.setPosition(
    1.5 + 0.25 * Math.cos(t * 2.4),
    1.1 + 0.12 * Math.sin(t * 4.8),
    1.5 + 0.25 * Math.sin(t * 2.4)
  );
});

game.start();
void game.ready().then(() => {
  document.body.dataset.a3gFixture = "ready";
});
