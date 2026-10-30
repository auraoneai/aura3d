import { describe, expect, it } from "vitest";
import { SIGN_SIZE, signOrigin, signSpan, signText } from "../../../examples/roadster-hours-port/art/signs";
import { LEVELS } from "../../../examples/roadster-hours-port/data";
import { buildWorld } from "../../../examples/roadster-hours-port/world";

type Node = { name?: string; visible?: boolean; text3D?: { backend?: string; unsupportedCharacters?: readonly string[] } };
const collect = (node: unknown, out: Node[] = []): Node[] => {
  if (!node || typeof node !== "object") return out;
  const n = node as Node;
  if (typeof n.name === "string" && n.name.startsWith("gate-sign-")) out.push(n);
  for (const child of Object.values(node)) collect(child, out);
  return out;
};

describe("Saltwind Highway SDF gate signs (RH47-17)", () => {
  it("sign text keeps only SDF catalogue characters", () => {
    expect(signText("Harbor relay")).toBe("HARBOR RELAY");
    expect(signText("Spire · relay!")).toBe("SPIRE RELAY");
  });

  it("centres the span on the gantry for any yaw", () => {
    const span = { min: 0, max: 10 };
    for (const psi of [0, 0.7, -1.3]) {
      const o = signOrigin([3, 9, -4], psi, span);
      // the span midpoint (local x 5) rotated by psi lands on the centre
      expect(o[0] + 5 * Math.cos(psi)).toBeCloseTo(3, 9);
      expect(o[2] - 5 * Math.sin(psi)).toBeCloseTo(-4, 9);
    }
    expect(signSpan("COAST RELAY").max - signSpan("COAST RELAY").min).toBeGreaterThan(SIGN_SIZE * 4);
  });

  it("one SDF sign per gate (the runtime shows only the next gate's); none on ?look=original", () => {
    LEVELS.forEach((level, i) => {
      const signs = collect(buildWorld(i, "gu47").scene.toJSON());
      expect(signs).toHaveLength(level.gates.length);
      for (const s of signs) {
        expect(s.text3D?.backend).toBe("sdf");
        expect(s.text3D?.unsupportedCharacters ?? []).toEqual([]);
      }
      expect(collect(buildWorld(i, "original").scene.toJSON())).toHaveLength(0);
    });
  });
});
