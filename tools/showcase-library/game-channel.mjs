/**
 * game-channel.mjs — PRD-09 Phase 6: shared reader for the C-33 game beacon
 * (`window.__AURA3D_GAME__`) and the C-24 lazy evidence channel
 * (`window.__AURA3D_GAME_EVIDENCE__[route]`) with fallback to route-local
 * legacy globals (`*_EVIDENCE__`, `*_PROOF__`, `*_REVIEW__`) for routes not
 * yet applied by their migration patch.
 *
 * Sections only evaluate when the page opts in via `?evidence=1` (or
 * `__AURA3D_EVIDENCE_OPT_IN__`); append `evidence=1` to the probe URL when a
 * caller needs section contents rather than the beacon alone.
 */

/** Page-side evaluator: beacon + channel snapshot + legacy globals. */
export const READ_GAME_CHANNEL_SNIPPET = `(() => {
  const w = window;
  const beacon = w.__AURA3D_GAME__ ? { ...w.__AURA3D_GAME__ } : null;
  const registry = (w.__AURA3D_GAME_EVIDENCE__ && typeof w.__AURA3D_GAME_EVIDENCE__ === "object")
    ? w.__AURA3D_GAME_EVIDENCE__ : null;
  let evidence = null;
  if (registry) {
    for (const key of Object.keys(registry)) {
      try {
        const value = registry[key];
        if (value && typeof value === "object") { evidence = { id: key, ...value }; break; }
      } catch { /* lazy getter threw — skip */ }
    }
  }
  const legacy = {};
  for (const key of Object.keys(w)) {
    if (!/(_EVIDENCE__|_PROOF__|_REVIEW__)$/.test(key)) continue;
    try {
      const value = w[key];
      if (value && typeof value === "object") {
        legacy[key] = value;
      }
    } catch { /* ignore unreadable globals */ }
  }
  return { beacon, evidence, legacy, migrated: Boolean(beacon) };
})()`;

/** Convenience wrapper for Playwright pages. */
export async function readGameChannel(page) {
  return page.evaluate(READ_GAME_CHANNEL_SNIPPET)
    .catch(() => ({ beacon: null, evidence: null, legacy: {}, migrated: false }));
}

/** C-33 readiness: the beacon reports session state "playing". */
export function channelReady(snapshot) {
  return snapshot?.beacon?.state === "playing";
}

/** Append `evidence=1` to a route URL so channel sections evaluate. */
export function withEvidenceOptIn(url) {
  return url + (url.includes("?") ? "&" : "?") + "evidence=1";
}

/**
 * Merge evidence claims for a snapshot: channel sections win when present,
 * legacy route globals are still read for unmigrated routes.
 */
export function channelEvidenceClaims(snapshot) {
  const claims = {};
  const sections = snapshot?.evidence?.sections;
  if (sections && typeof sections === "object") {
    for (const [name, value] of Object.entries(sections)) {
      try { claims[`channel.${name}`] = value; } catch { /* lazy getter */ }
    }
  }
  for (const [key, value] of Object.entries(snapshot?.legacy ?? {})) {
    claims[`legacy.${key}`] = value;
  }
  return claims;
}
