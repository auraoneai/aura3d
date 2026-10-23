// Scripted, deterministic Apex Overdrive run. Used verbatim by the remote capture of the original build and by the
// native-simulation replay test, so both sides execute exactly the same input schedule and record the same fields.
// Must stay a single self-contained function declaration (it is serialised into the browser page).
export function runReference(game, options) {
  const seed = options.seed;
  const steps = options.steps;
  const every = options.every || 5;
  const dt = 1 / 60;
  const hash = (step, k) => {
    let n = Math.imul((step + 1) ^ 2654435769, 2246822507) ^ Math.imul((k + seed) | 0, 3266489909);
    n ^= n >>> 16;
    n = Math.imul(n, 2146121005);
    n ^= n >>> 15;
    return (n >>> 0) / 4294967296;
  };
  const schedule = (step) => {
    const out = [];
    if (step % 24 === 0) {
      const x = hash(step, 1);
      if (x < 0.3) out.push(["left"]);
      else if (x < 0.6) out.push(["right"]);
    }
    if (step % 90 === 30 && hash(step, 2) < 0.5) out.push(["hop"]);
    if (step % 300 === 120) out.push(["thrustHold", { duration: 1.2 + hash(step, 3) * 1.5 }]);
    if (step % 300 === 260) out.push(["thrustRelease"]);
    if (step % 200 === 90 && hash(step, 4) < 0.6) out.push([hash(step, 5) < 0.5 ? "rollLeft" : "rollRight"]);
    if (step % 500 === 0) out.push(["boost", { duration: 1.5 }]);
    if (step % 420 === 200) out.push(["dive", { duration: 0.8 }]);
    if (step % 700 === 350) out.push(["pickup", { kind: ["shield", "magnet", "multiplier", "air", "rocket"][Math.floor(hash(step, 6) * 5)] }]);
    return out;
  };
  const r5 = (v) => Math.round(v * 1e6) / 1e6;
  game.manual = true;
  game.mode = "title";
  game.start();
  const samples = [];
  const details = [];
  const modes = [];
  for (let step = 0; step < steps; step++) {
    for (const [action, opts] of schedule(step)) game.triggerAction(action, opts);
    game.simStep(dt);
    if (game.mode === "gameover") game.triggerAction("start");
    if (step % every !== 0) continue;
    const p = game.player;
    const t = game.traffic;
    let vsum = 0;
    for (const v of t.vehicles) vsum += v.x * 7 + v.z;
    let ssum = 0;
    for (const s of t.skyCars) ssum += s.x + s.y * 3 + s.z;
    let psum = 0;
    for (const k of t.pickups) psum += k.x + k.y * 2 + k.z;
    samples.push({
      s: step,
      mode: game.mode,
      dist: r5(game.distance),
      score: r5(game.score),
      bolts: game.bolts,
      mult: game.mult,
      chain: game.chain,
      x: r5(p.position.x),
      y: r5(p.position.y),
      z: r5(p.position.z),
      spd: r5(p.speed),
      air: r5(p.air),
      lane: p.lane,
      gr: p.grounded ? 1 : 0,
      roll: p.rolling ? 1 : 0,
      boost: p.boosting ? 1 : 0,
      alive: p.alive === false ? 0 : 1,
      rocket: r5(p.rocketTimer || 0),
      shield: r5(p.shieldTimer || 0),
      magnet: r5(p.magnetTimer || 0),
      veh: t.vehicles.length,
      sky: t.skyCars.length,
      pick: t.pickups.length,
      vsum: r5(vsum),
      ssum: r5(ssum),
      psum: r5(psum)
    });
    if (step % 100 === 0) {
      const near = t.vehicles.slice().sort((a, b) => Math.abs(a.z - p.position.z) - Math.abs(b.z - p.position.z)).slice(0, 8).map((v) => [v.type, v.lane, r5(v.x), r5(v.z), r5(v.spd)]);
      const sky = t.skyCars.slice().sort((a, b) => Math.abs(a.z - p.position.z) - Math.abs(b.z - p.position.z)).slice(0, 4).map((c) => [r5(c.x), r5(c.y), r5(c.z), c.dir]);
      const picks = t.pickups.slice().sort((a, b) => Math.abs(a.z - p.position.z) - Math.abs(b.z - p.position.z)).slice(0, 6).map((k) => [k.kind, r5(k.x), r5(k.y), r5(k.z)]);
      details.push({ s: step, near, sky, picks });
    }
    if (modes.length === 0 || modes[modes.length - 1][1] !== game.mode) modes.push([step, game.mode]);
  }
  return { seed, steps, every, samples, details, modes };
}
