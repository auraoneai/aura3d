// apps/showcase-gravity-post/src/v2/scenarios/index.ts — §7.2.1 scenarios.
// `?scenario=` presets drive REAL game paths only (contract select + pod
// reset + the same launch the Enter key performs) — no pose teleport or
// state forgery, so captured frames equal playable frames.
export const GRAVITY_SCENARIOS = ["delivery-1", "hazard-mail", "dock-approach"] as const;
export type GravityScenario = (typeof GRAVITY_SCENARIOS)[number];

export interface GravityScenarioActions {
  /** Jump to a contract index through the real next-contract/reset path. */
  loadContract: (index: number) => void;
  /** Keyboard-seeded launch on the active contract (identical to Enter). */
  launchKeyboardAim: () => void;
}

export function applyGravityScenario(
  name: string,
  actions: GravityScenarioActions
): boolean {
  switch (name) {
    case "delivery-1":
      actions.loadContract(0);
      return true;
    case "hazard-mail":
      actions.loadContract(3);
      return true;
    case "dock-approach":
      actions.loadContract(0);
      actions.launchKeyboardAim();
      return true;
    default:
      return false;
  }
}
