import { describe, expect, it } from "vitest";
import { createGameInput } from "../../../packages/engine/src/agent-api/GameRuntime";
import { createOnePress } from "../../../apps/showcase-aura-hoops-3d/src/input";

/**
 * C2/C3: one press fires its action on exactly one frame at 60, 120 and 144 Hz. The route used to OR in `buffered()`,
 * which stays true for the 140 ms buffer window, so Escape toggled the menu 9-10 times per press (an even count leaves it
 * unchanged) and one crossover stacked about ten velocity kicks.
 */
function simulate(hz: number, holdMs: number, mode: "route" | "old") {
  const input = createGameInput({ actions: { menu: ["Escape"], cross: ["KeyJ"], shoot: ["Space"] }, bufferMs: 140 } as any);
  const domPressed = new Set<string>();
  const domHeld = new Set<string>();
  const press = createOnePress(input, domPressed, domHeld);
  const old = (action: string, ...codes: string[]) => input.pressed(action) || input.buffered(action) || codes.some((c) => domPressed.has(c));
  const dt = 1 / hz;
  const frames = Math.round(hz * 0.6);
  const holdFrames = Math.max(1, Math.round((holdMs / 1000) * hz));
  let menuOpen = false;
  let toggles = 0;
  let crosses = 0;
  for (let f = 0; f < frames; f++) {
    // keydown lands before frame 5 (both the DOM listener and the engine binding see it), keyup after holdFrames
    if (f === 5) { domPressed.add("Escape"); domHeld.add("Escape"); domPressed.add("KeyJ"); domHeld.add("KeyJ"); input.press("Escape"); input.press("KeyJ"); }
    if (f === 5 + holdFrames) { domHeld.delete("Escape"); domHeld.delete("KeyJ"); input.release("Escape"); input.release("KeyJ"); }
    if (mode === "route") press.beginFrame();
    const read = mode === "route" ? press : old;
    if (read("menu", "Escape")) { menuOpen = !menuOpen; toggles++; }
    // a frame reads cross more than once (anyManual, then the juke itself): the route must agree within the frame
    const c1 = read("cross", "KeyJ");
    const c2 = read("cross", "KeyJ");
    if (c1 && c2) crosses++;
    input.update(dt);
    domPressed.clear();
  }
  return { toggles, menuOpen, crosses };
}

describe("Aura Hoops one-shot input", () => {
  for (const hz of [60, 120, 144]) {
    for (const holdMs of [16, 90, 400]) {
      it(`${hz} Hz, ${holdMs} ms press: one menu toggle and one crossover`, () => {
        const r = simulate(hz, holdMs, "route");
        expect(r.toggles).toBe(1);
        expect(r.menuOpen).toBe(true);
        expect(r.crosses).toBe(1);
      });
    }
  }

  it("the old buffered read fires on many frames per press (the shipped bug)", () => {
    const r60 = simulate(60, 90, "old");
    expect(r60.toggles).toBeGreaterThan(5);
    const r144 = simulate(144, 90, "old");
    expect(r144.toggles).toBeGreaterThan(10);
  });

  it("a second press after release fires again", () => {
    const input = createGameInput({ actions: { menu: ["Escape"] }, bufferMs: 140 } as any);
    const dom = new Set<string>(), held = new Set<string>();
    const press = createOnePress(input, dom, held);
    let fires = 0;
    const frameAt = (down: boolean | null) => {
      if (down === true) { dom.add("Escape"); held.add("Escape"); input.press("Escape"); }
      if (down === false) { held.delete("Escape"); input.release("Escape"); }
      press.beginFrame();
      if (press("menu", "Escape")) fires++;
      input.update(1 / 60);
      dom.clear();
    };
    frameAt(true); for (let i = 0; i < 5; i++) frameAt(null); frameAt(false); for (let i = 0; i < 5; i++) frameAt(null);
    frameAt(true); for (let i = 0; i < 5; i++) frameAt(null); frameAt(false);
    expect(fires).toBe(2);
  });
});
