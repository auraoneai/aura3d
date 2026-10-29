/**
 * One-shot input for Aura Hoops 3D: each physical press fires its action on exactly one simulation frame.
 *
 * Two bugs this replaces. The engine's `buffered()` stays true for the whole buffer window (140 ms here, 8 to 20 frames),
 * so reading it as a press fired Escape, crossovers and defender switches on every one of those frames. And the route
 * reads both the engine edge and its own DOM keydown edge (it works before the canvas has focus); the two edges arrive
 * one frame apart, so even without the buffer a press would fire twice.
 *
 * Rule: an action fires on the first frame either edge is seen, every read during that frame agrees, and it cannot fire
 * again until the action and all its fallback keys are released (and at least one frame has passed).
 */
export interface PressSource {
  pressed(action: string): boolean;
  held(action: string): boolean;
}

export interface OnePress {
  (action: string, ...codes: string[]): boolean;
  /** Call once at the start of every simulation frame, before any read. */
  beginFrame(): void;
}

export function createOnePress(input: PressSource, domPressed: ReadonlySet<string>, domHeld: ReadonlySet<string>): OnePress {
  let frame = 0;
  /** action -> frame it fired on; kept until the action is released. */
  const fired = new Map<string, number>();
  const codesOf = new Map<string, readonly string[]>();
  const isHeld = (action: string): boolean => input.held(action) || (codesOf.get(action) ?? []).some((c) => domHeld.has(c));
  const press = ((action: string, ...codes: string[]): boolean => {
    if (codes.length > 0) codesOf.set(action, codes);
    const at = fired.get(action);
    if (at !== undefined) return at === frame;
    const edge = input.pressed(action) || codes.some((c) => domPressed.has(c));
    if (!edge) return false;
    fired.set(action, frame);
    return true;
  }) as OnePress;
  press.beginFrame = () => {
    frame += 1;
    // Keep a fired action at least one more frame: a tap shorter than a frame is already released when the engine's edge
    // (one frame behind the DOM edge) arrives, and must not fire a second time.
    for (const [action, at] of fired) if (at < frame - 1 && !isHeld(action)) fired.delete(action);
  };
  return press;
}
