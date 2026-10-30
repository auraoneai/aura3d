/**
 * GU47 TT-H2 / TT-A2: rear-board text, the live venue + score line and the LED ribbon pulse.
 */
import { describe, expect, it } from "vitest";
import { createAuraText3DGeometry } from "@aura3d/engine";
import {
  BOARD_IDS, BOARD_TEXTS, BOARD_TEXT_SIZE, BOARD_Y, LED_PULSE_SECONDS, STAND_TEXT_SIZE, buildBoardNodes, createBoardsController, pointsText, standLineText, textWidth
} from "../../../examples/aura-slam/view/boards";
import { CAMERA_CLASSIC, CAMERA_V2, cameraFovForAspect, projectWorldPoint } from "../../../examples/aura-slam/view/camera";
import { createPoseRig } from "../../../examples/aura-slam/view/poseRig";
import { buildTennisScene } from "../../../examples/aura-slam/view/scene";

/** Sponsor board centre x (view/boards.ts). */
const BOARD_X = 4.3;
type Node = { name?: string; text3D?: { text?: string; backend?: string }; children?: Node[] };
const flat = (nodes: Node[] = []): Node[] => nodes.flatMap((n) => [n, ...flat(n.children)]);

describe("GU47 TT-H2: rear boards", () => {
  it("three text nodes (3 draws): AURA SLAM, WORLD TOUR and the venue line, requested with the SDF backend", () => {
    const nodes = flat((buildTennisScene(createPoseRig(), { venue: "clay" }).toJSON() as unknown as { nodes: Node[] }).nodes).filter((n) => n.text3D);
    expect(nodes.map((n) => n.name)).toEqual([BOARD_IDS.left, BOARD_IDS.right, BOARD_IDS.stand]);
    expect(nodes.map((n) => n.text3D?.text)).toEqual([BOARD_TEXTS.left, BOARD_TEXTS.right, "PARIS"]);
    for (const n of nodes) expect(n.text3D?.backend).toBe("sdf");
    expect(flat((buildTennisScene(createPoseRig(), { look: "original" }).toJSON() as unknown as { nodes: Node[] }).nodes).some((n) => n.text3D)).toBe(false);
  });

  it("cap height >= 10 px at 1280x720 for the board and the stand line, under the classic and the TT-C1 v2 camera", () => {
    for (const rig of [CAMERA_CLASSIC, CAMERA_V2]) {
      const fov = cameraFovForAspect(1280 / 720, rig);
      const px = (y0: number, y1: number, z: number) => Math.abs(projectWorldPoint(1280, 720, BOARD_X, y0, z, fov, rig).y - projectWorldPoint(1280, 720, BOARD_X, y1, z, fov, rig).y);
      expect(px(BOARD_Y, BOARD_Y + BOARD_TEXT_SIZE, -10.64), rig.id).toBeGreaterThanOrEqual(10);
      expect(px(0.5, 0.5 + STAND_TEXT_SIZE, -11.665), rig.id).toBeGreaterThanOrEqual(10);
    }
    // The lettering fits the board face under the LED ribbon (0.33-0.51 m) and inside the 3.2 m board.
    expect(BOARD_Y + BOARD_TEXT_SIZE).toBeLessThanOrEqual(0.33);
    for (const text of Object.values(BOARD_TEXTS)) expect(textWidth(text, BOARD_TEXT_SIZE)).toBeLessThan(3.2);
  });

  it("the sponsor boards (0.78 m) never hide the stand line from the v2 eye", () => {
    // Ray from the v2 eye to the stand line's bottom edge, at the boards' front face (z -10.68).
    const [, ey, ez] = CAMERA_V2.eye;
    const atBoard = 0.5 + ((ey - 0.5) / (ez + 11.665)) * (11.665 - 10.68);
    expect(atBoard).toBeGreaterThan(0.78);
  });

  it("the layout width matches the text mesh", () => {
    for (const text of ["AURA SLAM", "WORLD TOUR", "TROPICAL BEACH  6-6  AD-40"]) {
      const geo = createAuraText3DGeometry(text, { size: BOARD_TEXT_SIZE }).geometry as unknown as { positions: ArrayLike<number> | number[][] };
      const xs: number[] = [];
      const pos = geo.positions as unknown as ArrayLike<number> & { length: number };
      if (Array.isArray(pos) && Array.isArray(pos[0])) for (const v of pos as unknown as number[][]) xs.push(v[0]!);
      else for (let i = 0; i < pos.length; i += 3) xs.push(pos[i]!);
      const meshWidth = Math.max(...xs) - Math.min(...xs);
      expect(Math.abs(meshWidth - textWidth(text, BOARD_TEXT_SIZE)), text).toBeLessThan(BOARD_TEXT_SIZE * 0.1);
    }
    expect(buildBoardNodes("NEW YORK")).toHaveLength(3);
  });
});

describe("GU47 TT-A2: live score line", () => {
  it("tennis calls: 0/15/30/40, deuce and advantage", () => {
    expect(pointsText(0, 0)).toBe("0-0");
    expect(pointsText(2, 1)).toBe("30-15");
    expect(pointsText(3, 2)).toBe("40-30");
    expect(pointsText(3, 3)).toBe("40-40");
    expect(pointsText(5, 4)).toBe("AD-40");
    expect(pointsText(4, 5)).toBe("40-AD");
  });

  it("the stand line carries venue, games and points in glyphs the mesh has", () => {
    expect(standLineText("New York", { playerGames: 2, aiGames: 1, playerPoints: 2, aiPoints: 1 })).toBe("NEW YORK  2-1  30-15");
    expect(standLineText("The Moon", null)).toBe("THE MOON");
    const text = standLineText("Tropical Beach", { playerGames: 6, aiGames: 6, playerPoints: 4, aiPoints: 5 });
    expect(createAuraText3DGeometry(text, { size: STAND_TEXT_SIZE }).unsupportedCharacters).toEqual([]);
  });

  it("rewrites the stand mesh only when the text changes, recentred; the frame text is what debug() reports", () => {
    const calls: string[] = [];
    const stand = {
      setGeometry: () => { calls.push("geometry"); return stand; },
      setPosition: (x: number) => { calls.push(`x=${x.toFixed(3)}`); return stand; }
    };
    const boards = createBoardsController(stand as never, undefined, "NEW YORK");
    expect(boards.setStandText("NEW YORK")).toBe("NEW YORK");
    expect(calls).toEqual([]);
    expect(boards.setStandText("NEW YORK  0-0  15-0")).toBe("NEW YORK  0-0  15-0");
    expect(calls).toEqual(["geometry", `x=${(-textWidth("NEW YORK  0-0  15-0", STAND_TEXT_SIZE) / 2).toFixed(3)}`]);
    expect(boards.standText).toBe("NEW YORK  0-0  15-0");
  });
});

describe("GU47 TT-H2: LED ribbon pulse on aces", () => {
  it("lights the ribbon for the pulse and restores it; no pulse under reduced motion", () => {
    const materials: { emissiveIntensity?: number }[] = [];
    const ribbon = { setMaterial: (m: { emissiveIntensity?: number }) => { materials.push(m); return ribbon; } };
    const boards = createBoardsController(undefined, ribbon as never, "PARIS");
    boards.pulse(false);
    boards.step(1 / 60, "#e1d4b7");
    expect(boards.pulsing).toBe(true);
    expect(materials.at(-1)?.emissiveIntensity).toBeGreaterThan(1);
    for (let t = 0; t < LED_PULSE_SECONDS + 0.1; t += 1 / 60) boards.step(1 / 60, "#e1d4b7");
    expect(boards.pulsing).toBe(false);
    expect(materials.at(-1)?.emissiveIntensity ?? 0).toBe(0);
    const calm = createBoardsController(undefined, ribbon as never, "PARIS");
    const before = materials.length;
    calm.pulse(true);
    calm.step(1 / 60, "#e1d4b7");
    expect(calm.pulsing).toBe(false);
    expect(materials.length).toBe(before);
  });
});
