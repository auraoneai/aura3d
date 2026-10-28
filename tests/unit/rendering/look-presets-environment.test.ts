import { describe, expect, it } from "vitest";
import { looks, lookPresetIds } from "../../../packages/engine/src/agent-api/index";

/**
 * Exposure convention (beat-three.js PRD, WP-Q.1 / section 6): a scene that authors lights and no environment is lit by
 * those lights only. A look preset must therefore bring its own environment, otherwise it would go dark with the
 * exposure calibration. This pins that every preset's expansion contains an environment node.
 */
function kinds(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== "object") return out;
  const n = node as { kind?: string; children?: unknown[] };
  if (typeof n.kind === "string") out.push(n.kind);
  for (const child of n.children ?? []) kinds(child, out);
  return out;
}

describe("look presets keep their own environment", () => {
  const ids = lookPresetIds;
  it("has presets to check", () => {
    expect(ids.length).toBeGreaterThan(0);
  });
  for (const id of ids) {
    it(`${id} expands with an environment node`, () => {
      const expansion = (looks.preset(id as never) as unknown as { toJSON(): unknown }).toJSON();
      expect(kinds(expansion), `${id} expansion kinds`).toContain("environment");
    });
  }
});
