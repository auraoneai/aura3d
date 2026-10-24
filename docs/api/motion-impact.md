# createImpactWorld and createImpactFeedback: hits that have consequences

`import { createImpactWorld, createImpactFeedback, createHitStop, createCameraShake } from "@aura3d/engine/game"`

Swept-sphere collision against static boxes (optionally yawed) and spheres. A fast body cannot tunnel through a wall or gate, and each new contact emits one `Impact`.

```ts
const world = createImpactWorld({
  colliders: [{ kind: "box", id: "gate", tag: "gate", center: [0, 1.5, 40], half: [3, 1.5, 0.2], restitution: 0.1 }],
  restitution: 0.2, friction: 0.1, eventMinSpeed: 0.5
});
const hitStop = createHitStop(); const shake = createCameraShake();
const feedback = createImpactFeedback({
  hitStop, shake, cue: (name, gain) => cues.play(name, { gain }), cueName: "gate-hit",
  particles: (b) => burst(b.point, b.normal, b.count, b.speed), damagePerSpeed: 2, onDamage: (d) => hurt(d)
});
// each fixed step; scale dt by hitStop.timeScale() and call hitStop.update(realDt) once per frame:
for (const impact of world.step(body, dt)) feedback.handle(impact);
const s = shake.update(realDt); // add s.x, s.y, s.roll to the camera
```

- `body` is `{ position, velocity, radius }` and is mutated. Resolution: reflect the normal velocity with restitution, damp the tangent with friction, up to 4 slides per step.
- `Impact`: `colliderId`, `tag`, `point`, `normal` (out of the collider), `speed` (approach speed before the response), `impulse`. Contacts slower than `eventMinSpeed` resolve silently (resting contact). Sliding along a wall emits once.
- Feedback strength scales with `speed / fullSpeed` (default 12 m/s): hit-stop 30 to 80 ms, trauma shake (decays, deterministic), cue gain, particle count, optional damage. Pass only the pieces you use.
- Box corners are sharp expanded boxes (slightly conservative at corners). Add colliders that match the visible meshes; an invisible gap or invisible wall is a bug.
- Test: drive a body at 3, 12 and 60 m/s into a wall and gate and assert it stops, slides or bounces (never passes through) and fires one impact.
