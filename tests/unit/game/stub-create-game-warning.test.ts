import { afterEach, describe, expect, it, vi } from "vitest";

describe("root createGame stub", () => {
  afterEach(() => vi.restoreAllMocks());

  it("points at @aura3d/engine/game once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.resetModules();
    const { createGame } = await import("../../../packages/engine/src/contracts/stubs/game");
    const options = { id: "t", target: {} as HTMLElement, scene: () => ({}) };
    try { createGame(options as never); } catch { /* a bare target cannot mount; the warning fires first */ }
    try { createGame(options as never); } catch { /* second call must not warn again */ }
    const messages = warn.mock.calls.map((call) => String(call[0])).filter((m) => m.startsWith("CREATE_GAME_STUB"));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("@aura3d/engine/game");
  }, 60_000); // cold import of the whole engine graph takes ~4 s alone and over 5 s when files run in parallel
});
