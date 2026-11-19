import { describe, expect, it } from "vitest";
import { ShapeShiftSim } from "../../../apps/showcase-shape-shift-sprint/src/sim";
import { IDOL_RIVAL_PARTS, buildWorld } from "../../../apps/showcase-shape-shift-sprint/src/world";

/**
 * Idol wow pass, moving parts: the rival drill boat's auger and the rival coupe's two thruster turbines are procedural
 * spinning nodes on the rigid Idol bodies. Advances real gameplay frames through a recording app and checks each part
 * is mounted inside its rival group at the measured anchor and turns between frames.
 */
type N = { kind?: string; name?: string; position?: number[]; children?: N[]; runtime?: { id?: string } };

function recordingApp() {
  const rotations = new Map<string, number[]>();
  const anything: unknown = new Proxy(function () {}, { get: () => anything, apply: () => anything });
  const handle = (id: string): unknown => new Proxy({}, {
    get(_t, key: string) {
      if (key === "setRotation") return (x: number, y: number, z: number) => { rotations.set(id, [x, y, z]); return handle(id); };
      if (key === "setUniform" || key === "setInstances" || key === "setInstanceTransforms") return () => handle(id);
      if (key.startsWith("set")) return () => handle(id);
      return anything;
    }
  });
  return { app: { nodes: { require: handle, get: handle }, camera: anything } as never, rotations };
}

describe("shape-shift-sprint Idol rivals keep spinning parts", () => {
  it("mounts the auger and turbines inside the rival groups at the measured anchors", () => {
    const nodes = buildWorld({ sim: new ShapeShiftSim(7), aspect: 16 / 9 } as never).scene.toJSON().nodes as unknown as N[];
    const r0 = nodes.find((n) => n.runtime?.id === "rival-0")!, r1 = nodes.find((n) => n.runtime?.id === "rival-1")!;
    expect(r0.children?.find((c) => c.runtime?.id === "rival-0-auger")?.position).toEqual(IDOL_RIVAL_PARTS.auger);
    for (let i = 0; i < 2; i++) expect(r1.children?.find((c) => c.runtime?.id === `rival-1-fan-${i}`)?.position).toEqual(IDOL_RIVAL_PARTS.fans[i]);
  }, 60_000);

  it("the auger and both turbines turn between gameplay frames", () => {
    const sim = new ShapeShiftSim(7);
    const world = buildWorld({ sim, aspect: 16 / 9 } as never);
    const { app, rotations } = recordingApp();
    const rt = world.bind(app);
    sim.begin();
    const spinAt = () => ["rival-0-auger", "rival-1-fan-0", "rival-1-fan-1"].map((id) => rotations.get(id)?.[2]);
    for (let f = 0; f < 3; f++) { sim.advance(); rt.update(sim, 16 / 9); }
    const a = spinAt();
    for (let f = 0; f < 6; f++) { sim.advance(); rt.update(sim, 16 / 9); }
    const b = spinAt();
    for (let i = 0; i < 3; i++) {
      expect(a[i], `part ${i} rotated`).toBeTypeOf("number");
      expect(Math.abs(b[i]! - a[i]!), `part ${i} turns`).toBeGreaterThan(0.05);
    }
  }, 60_000);
});
