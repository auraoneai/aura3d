// GU47 WP-22 (lane g12) SS47-H1: the wooden level sign (board, post, one SDF chapter name per chapter).
import { describe, expect, it } from "vitest";
import { DRESSING_KEEP_OUT, LANE_CLEARANCE } from "../../../apps/showcase-slingshot-siege/src/game/dressing";
import { CHAPTERS } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { SIGN_BOARD, SIGN_CENTER, SIGN_KEEP_OUT, SIGN_PARK, levelSignNodes, signTextNodeId, signTextPlacement } from "../../../apps/showcase-slingshot-siege/src/game/sign";
import { buildStage } from "../../../apps/showcase-slingshot-siege/src/game/stage";

type Node = { name?: string; position?: readonly number[]; text3D?: { backend?: string; unsupportedCharacters?: readonly string[]; sdfWidthWorld?: number }; [key: string]: unknown };
const json = (n: unknown): Node => (typeof (n as { toJSON?: unknown }).toJSON === "function" ? (n as { toJSON(): Node }).toJSON() : n) as Node;

describe("slingshot-siege wooden level sign (SS47-H1)", () => {
  it("builds a board, a post and one SDF text per chapter, all glyphs supported", () => {
    const nodes = levelSignNodes(3).map(json);
    expect(nodes).toHaveLength(2 + CHAPTERS.length);
    for (const ch of CHAPTERS) {
      const text = nodes.find((n) => n.name === signTextNodeId(ch.id))!;
      expect(text.text3D?.backend).toBe("sdf");
      expect(text.text3D?.unsupportedCharacters ?? []).toEqual([]);
      // The name fits on the board face.
      expect(text.text3D!.sdfWidthWorld!).toBeLessThanOrEqual(SIGN_BOARD[0]);
    }
  });

  it("shows only the boot chapter's text in place; the others are parked", () => {
    const nodes = levelSignNodes(2).map(json);
    for (const ch of CHAPTERS) {
      const text = nodes.find((n) => n.name === signTextNodeId(ch.id))!;
      if (ch.id === 2) expect(text.position).toEqual(signTextPlacement(ch.name.toUpperCase()).position);
      else expect(text.position).toEqual([...SIGN_PARK]);
    }
  });

  it("stands clear of the flight lane and keeps the beach dressing off it", () => {
    expect(Math.abs(SIGN_CENTER[2]) - SIGN_BOARD[0] / 2).toBeGreaterThanOrEqual(LANE_CLEARANCE);
    expect(DRESSING_KEEP_OUT).toContainEqual([...SIGN_KEEP_OUT]);
  });

  it("is part of the stage on every chapter", () => {
    for (const ch of CHAPTERS) {
      const names = buildStage(ch, { reducedMotion: true }).nodes.map((n) => json(n).name);
      expect(names).toContain("siege-level-sign-board");
      expect(names).toContain(signTextNodeId(ch.id));
    }
  });
});
