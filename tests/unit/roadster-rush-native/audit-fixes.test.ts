import { describe, expect, it } from "vitest";
import { RoadsterGame, type GameAudio, type GameHud } from "../../../apps/showcase-roadster-rush/src/native/game";
import { Player } from "../../../apps/showcase-roadster-rush/src/native/player";
import { Traffic } from "../../../apps/showcase-roadster-rush/src/native/traffic";
import { FreewayWorld } from "../../../apps/showcase-roadster-rush/src/native/world";
import { trafficYawOffset } from "../../../apps/showcase-roadster-rush/src/render/pools";

/** Audit fixes on the simulation side of Apex Overdrive: assisted runs (RR-7), music on pause (RR-9), traffic facing (RR-3). */

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

function makeGame(options: { audio?: GameAudio; hud?: GameHud; storage?: Pick<Storage, "getItem" | "setItem"> | null } = {}): RoadsterGame {
  const game = new RoadsterGame({ player: new Player(), traffic: new Traffic(), world: new FreewayWorld(), params: new URLSearchParams("seed=42"), storage: options.storage ?? null, audio: options.audio, hud: options.hud });
  game.boot();
  game.manual = true;
  return game;
}

function crashToGameOver(game: RoadsterGame): void {
  game.player.shieldTimer = 0;
  game.player.rocketTimer = 0;
  game.player.graceTimer = 0;
  game.triggerAction("crash");
  for (let i = 0; i < 600 && game.mode !== "gameover"; i++) game.simStep(1 / 60);
}

describe("Apex Overdrive audit fixes (simulation side)", () => {
  it("boots into the title state and waits for a start (RR-10)", () => {
    const game = makeGame();
    expect(game.mode).toBe("title");
    for (let i = 0; i < 120; i++) game.simStep(1 / 60);
    expect(game.mode).toBe("title");
    expect(game.distance).toBe(0);
  });

  it("an unassisted run sets the saved best", () => {
    const storage = memoryStorage();
    const game = makeGame({ storage });
    game.start();
    for (let i = 0; i < 300; i++) game.simStep(1 / 60);
    crashToGameOver(game);
    expect(game.mode).toBe("gameover");
    expect(game.best).toBeGreaterThan(0);
    expect(storage.data.get("roadsterRush.best")).toBe(String(game.best));
  });

  it("an assisted run (scenario button or autopilot) never sets the saved best (RR-7)", () => {
    const storage = memoryStorage();
    let summary: { isBest: boolean; assisted?: boolean } | null = null;
    const game = makeGame({ storage, hud: { showGameOver: (s) => { summary = s; } } });
    game.start();
    game.markAssisted();
    for (let i = 0; i < 300; i++) game.simStep(1 / 60);
    crashToGameOver(game);
    expect(game.mode).toBe("gameover");
    expect(game.score).toBeGreaterThan(0);
    expect(game.best).toBe(0);
    expect(storage.data.has("roadsterRush.best")).toBe(false);
    expect(summary).toMatchObject({ isBest: false, assisted: true });
    // the next run starts unassisted again
    game.start();
    expect(game.assisted).toBe(false);
  });

  it("pausing stops the music and resuming brings back the run music (RR-9)", () => {
    const music: Array<string | null> = [];
    let quiet = 0;
    const game = makeGame({ audio: { music: (k) => void music.push(k), quiet: () => void quiet++ } });
    game.start();
    music.length = 0;
    game.togglePause(true);
    expect(game.paused).toBe(true);
    expect(music).toEqual([null]);
    expect(quiet).toBe(1);
    game.togglePause(false);
    expect(music).toEqual([null, "run"]);
  });

  it("the baked Meshy traffic gets no half turn, the fallback models do (RR-3, lesson M15)", () => {
    expect(trafficYawOffset(true)).toBe(0);
    expect(trafficYawOffset(false)).toBeCloseTo(Math.PI, 12);
  });
});

describe("Apex Overdrive sign gantry geometry (RR-6)", () => {
  it("the drawn boards fill exactly the collision band across every lane", async () => {
    const { gantryBoxes } = await import("../../../apps/showcase-roadster-rush/src/render/gantry");
    const { SIGN_BAND } = await import("../../../apps/showcase-roadster-rush/src/native/world");
    const boards = gantryBoxes().filter((b) => b.part === "board");
    expect(boards.length).toBe(2);
    for (const b of boards) {
      expect(b.center[1] - b.size[1] / 2).toBeCloseTo(SIGN_BAND.minY, 9);
      expect(b.center[1] + b.size[1] / 2).toBeCloseTo(SIGN_BAND.maxY, 9);
    }
    // a car body (about 2 m wide) anywhere on the five lanes (centres -7.2..7.2 m) is covered by board in x
    const minX = Math.min(...boards.map((b) => b.center[0] - b.size[0] / 2));
    const maxX = Math.max(...boards.map((b) => b.center[0] + b.size[0] / 2));
    expect(minX).toBeLessThanOrEqual(-8.2);
    expect(maxX).toBeGreaterThanOrEqual(8.2);
    const gap = boards.map((b) => [b.center[0] - b.size[0] / 2, b.center[0] + b.size[0] / 2]).sort((a, c) => a[0]! - c[0]!);
    expect(gap[1]![0]! - gap[0]![1]!).toBeLessThan(0.5);
  });
});

describe("Apex Overdrive pass-through (owner QA Nov 18): nothing drawn in the drivable/flyable corridor is ghost geometry", () => {
  it("the drawn gantry steel ends at the sign band top, so no truss hangs ghost-like in the sky lane above the crash band", async () => {
    const { SIGN_BAND } = await import("../../../apps/showcase-roadster-rush/src/native/world");
    const { GANTRY_TRUSS_FRACTION, IDOL_GANTRY, gantryFit } = await import("../../../apps/showcase-roadster-rush/src/render/idolFleet");
    const by = Number((IDOL_GANTRY as { bounds?: readonly number[] }).bounds?.[1]);
    expect(by).toBeGreaterThan(1);
    const top = gantryFit(SIGN_BAND.maxY)[1] * by;
    expect(top).toBeCloseTo(SIGN_BAND.maxY, 6);
    // the truss (top 19% of the frame) lies inside the collidable band, behind the boards
    expect(top * (1 - GANTRY_TRUSS_FRACTION)).toBeGreaterThan(SIGN_BAND.minY);
  });

  it("every roadside solid stands outside the corridor a car body can reach (centre clamp + half width)", async () => {
    const { CRASH_X_LIMIT, VEHICLE_SPECS } = await import("../../../apps/showcase-roadster-rush/src/native/constants");
    const { gantryBoxes } = await import("../../../apps/showcase-roadster-rush/src/render/gantry");
    const { GANTRY_HALF_SPAN } = await import("../../../apps/showcase-roadster-rush/src/render/idolFleet");
    const { PYLON_X, PYLON_KIT } = await import("../../../apps/showcase-roadster-rush/src/render/pylons");
    const { RING_X, RING_SIZE, BILLBOARD_X, BILLBOARD_FRAME_SIZE, SPAN_PIER_X, SPAN_DECK_Y } = await import("../../../apps/showcase-roadster-rush/src/render/dressing");
    const { CEILING } = await import("../../../apps/showcase-roadster-rush/src/native/constants");
    const reach = CRASH_X_LIMIT + VEHICLE_SPECS.sedan.w / 2; // the hero is narrower than a sedan
    // gantry legs (procedural boxes and the Idol towers, inner faces at about 0.84 of the half span)
    for (const b of gantryBoxes().filter((b) => b.part === "steel" && b.size[1] > 5)) expect(Math.abs(b.center[0]) - b.size[0] / 2).toBeGreaterThan(reach);
    expect(GANTRY_HALF_SPAN * 0.84).toBeGreaterThan(reach - 0.5);
    expect(PYLON_X - PYLON_KIT.column.size[0] / 2).toBeGreaterThan(reach);
    expect(RING_X - RING_SIZE[0] / 2).toBeGreaterThan(reach);
    expect(BILLBOARD_X - BILLBOARD_FRAME_SIZE[0] / 2).toBeGreaterThan(reach);
    expect(SPAN_PIER_X).toBeGreaterThan(reach);
    expect(SPAN_DECK_Y - 0.9).toBeGreaterThan(CEILING + 1.2);
    // light poles stand at |x| 12.1 (main.ts)
    expect(12.1).toBeGreaterThan(reach);
  });
});
