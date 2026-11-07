// fx522: the prefabs.miniGolfHole() scene on the branch engine with Rapier present (headless app in Node).
import { createAuraApp, prefabs, scene } from "@aura3d/engine";
const nodes = prefabs.miniGolfHole();
const app = createAuraApp(undefined, { scene: scene().add(...nodes) });
await app.ready();
let events = 0;
for (let step = 0; step < 240; step++) events += app.physics.step(1 / 60).length;
const ground = app.physics.bodies.get("designed mini golf felt base course boundaries");
const d = app.diagnostics();
console.log(JSON.stringify({
  declaredBodies: nodes.filter((n) => n.physics).length,
  registryIds: app.physics.bodies.ids(),
  ground: ground && { type: ground.type, position: ground.position() },
  steps: 240, collisionEvents: events,
  rayDownAtCup: app.physics.queries.raycast([1.55, 2, -1.18], [0, -1, 0])?.nodeName ?? null,
  backend: d.backend, errors: d.errors
}, null, 2));
app.dispose();
process.exit(0);
