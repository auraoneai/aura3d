import { describe, expect, it } from "vitest";
import { GHOST_ORDER, startRun, st } from "../../../apps/showcase-dot-dash-3d/src/game/sim";
import { bindApp, buildScene, syncVisuals } from "../../../apps/showcase-dot-dash-3d/src/game/world";

/**
 * Arcade actors stay alive on screen: every sentry star spins between frames, its pupils sit ahead of its eye whites
 * along its move direction, the courier's nose points where it travels, and eaten sentries draw eyes only.
 */
type PoolRec = { m: Float32Array; c: Float32Array; n: number };
function fakeApp() {
  const pools = new Map<string, PoolRec>();
  const handle = (id: string): unknown => new Proxy({}, {
    get(_t, key: string) {
      if (key === "setInstanceTransforms") return (m: Float32Array, n: number, c: Float32Array) => { pools.set(id, { m: Float32Array.from(m.subarray(0, n * 16)), c: Float32Array.from(c.subarray(0, n * 3)), n }); };
      return () => handle(id);
    }
  });
  return { app: { nodes: { require: handle, get: handle }, camera: undefined, canvas: null } as never, pools };
}
const yawOf = (m: Float32Array, i: number) => Math.atan2(m[i * 16 + 8]!, m[i * 16 + 10]!);
const posOf = (m: Float32Array, i: number) => [m[i * 16 + 12]!, m[i * 16 + 13]!, m[i * 16 + 14]!];
const POOLS = ["pool-sentryBlitz", "pool-sentrySly", "pool-sentryFlick", "pool-sentryDim"];

describe("dot-dash-3d arcade actors move", () => {
  it("sentry stars spin, eyes look along the move direction, the courier faces its travel", () => {
    buildScene();
    const { app, pools } = fakeApp();
    bindApp(app);
    startRun("quick" as never, "classic" as never);
    st.mode = "play" as never;
    st.hasMoved = true;
    for (const g of st.ghosts) { g.state = "active" as never; g.dir = { x: 1, z: 0 } as never; }
    st.player.dir = { x: -1, z: 0 } as never;
    const frame = () => { st.time += 0.1; syncVisuals(0.1); return POOLS.map((id) => yawOf(pools.get(id)!.m, 0)); };
    const a = frame();
    for (let i = 0; i < 20; i++) frame();
    const b = frame();
    expect(POOLS.every((id) => pools.get(id)!.n >= 1)).toBe(true);
    for (let i = 0; i < POOLS.length; i++) expect(Math.abs(a[i]! - b[i]!), `${POOLS[i]} spins`).toBeGreaterThan(0.05);
    // eyes: 4 sentries x (2 whites + 2 pupils); every pupil is ahead (+x, the move direction) of the nearest white
    const eye = pools.get("pool-eye")!;
    expect(eye.n).toBeGreaterThanOrEqual(GHOST_ORDER.length * 4);
    const whites: number[][] = [], pupils: number[][] = [];
    for (let i = 0; i < eye.n; i++) (eye.c[i * 3]! > 0.5 ? whites : pupils).push(posOf(eye.m, i));
    expect(pupils.length).toBe(whites.length);
    for (const p of pupils) {
      const w = whites.reduce((best, q) => (Math.hypot(q[0]! - p[0]!, q[2]! - p[2]!) < Math.hypot(best[0]! - p[0]!, best[2]! - p[2]!) ? q : best));
      expect(p[0]! - w[0]!).toBeGreaterThan(0.02);
      expect(p[1]!).toBeGreaterThan(w[1]!);
    }
    // courier nose: travel -x => yaw -pi/2 (local +z rotated onto -x)
    const courier = pools.get("pool-courier")!;
    expect(courier.n).toBe(1);
    const cy = yawOf(courier.m, 0);
    expect(Math.abs(Math.sin(cy) - -1)).toBeLessThan(0.05);
    // eaten: the body disappears, the eyes stay
    for (const g of st.ghosts) g.state = "eyes" as never;
    frame();
    for (const id of POOLS) expect(pools.get(id)!.n, id).toBe(0);
    expect(pools.get("pool-eye")!.n).toBe(GHOST_ORDER.length * 4);
  }, 60_000);
});
