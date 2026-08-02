/**
 * Canonical mounted-route evidence statuses.
 *
 * Every status below is handled deliberately. `unknown`, `error`, `failed`,
 * `blank`, and any other value are rejected so a route cannot invent a status
 * that silently satisfies a wait-for-evidence gate.
 */
export const routeEvidenceStatusPolicy = Object.freeze({
  /** The route mounted and is idle but interactive. */
  ready: Object.freeze({ accepted: true, meaning: "mounted-and-interactive" }),
  /** The route mounted and its own loop is advancing. */
  running: Object.freeze({ accepted: true, meaning: "mounted-and-advancing" }),
  /** A game route mounted and gameplay is active. */
  playing: Object.freeze({ accepted: true, meaning: "mounted-gameplay-active" }),
  /** A game route mounted and reached its own terminal/finished state. */
  completed: Object.freeze({ accepted: true, meaning: "mounted-gameplay-finished" }),
  /**
   * The route mounted and deliberately reported that the environment cannot run
   * it. This is accepted as a mounted result, never as a capability claim.
   */
  unsupported: Object.freeze({ accepted: true, meaning: "mounted-capability-refused" })
});

export const acceptedRouteEvidenceStatuses = Object.freeze(
  Object.keys(routeEvidenceStatusPolicy).filter((status) => routeEvidenceStatusPolicy[status].accepted)
);

export const acceptedRouteEvidenceStatusPattern = /^(?:ready|running|playing|completed|unsupported)$/;

export function isAcceptedRouteEvidenceStatus(value) {
  return typeof value === "string" && acceptedRouteEvidenceStatusPattern.test(value);
}

/**
 * `unsupported` proves the route mounted and refused deliberately. It must never
 * be counted as proof that the claimed capability works.
 */
export function routeEvidenceStatusProvesCapability(value) {
  return isAcceptedRouteEvidenceStatus(value) && value !== "unsupported";
}
