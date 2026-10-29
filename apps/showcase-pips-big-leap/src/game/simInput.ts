// Pip's Big Leap — per-frame input latch for the fixed-step sim (pure).
//
// The sim runs at a fixed 60 Hz step inside a variable display frame, so a
// frame can run zero, one or several steps. Edge inputs (jump/dive/pound
// presses) read during a frame are latched until one step consumes them:
// a press is never lost on a frame with no step (120/144 Hz displays) and
// never repeated across the catch-up steps of a slow frame.

export interface EdgeInputs {
  readonly jumpPressed: boolean;
  readonly divePressed: boolean;
  readonly poundPressed: boolean;
}

export interface InputLatch {
  /** Record this display frame's edge inputs (ORed into anything not yet consumed). */
  latch(frame: EdgeInputs): void;
  /** Take the latched edges for one sim step and clear them. */
  consume(): EdgeInputs;
  clear(): void;
}

export function createInputLatch(): InputLatch {
  let jump = false, dive = false, pound = false;
  return {
    latch(frame) {
      jump ||= frame.jumpPressed;
      dive ||= frame.divePressed;
      pound ||= frame.poundPressed;
    },
    consume() {
      const out = { jumpPressed: jump, divePressed: dive, poundPressed: pound };
      jump = dive = pound = false;
      return out;
    },
    clear() {
      jump = dive = pound = false;
    }
  };
}
