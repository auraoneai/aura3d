/**
 * Flag list and URL for a game capture (C-33 --flags passthrough; #626).
 *
 * Default (union) mode: the game's games.json `qrFlags` are prepended to the
 * requested list. That is how per-game route flags reach flag-on captures, but
 * because resolveQrFlags is first-write-wins it also means `--flags none` or a
 * `-x` kill switch can never turn a games.json flag off: every "flags-off" game
 * capture was really flags-on.
 *
 * Exact mode (`--flags-exact` / QRC_FLAGS_EXACT=1): the requested list is the
 * whole list. `none` captures with an explicit `a3d-qr=none`, so nothing from
 * games.json is armed, and a route id yields only that route id.
 */

/**
 * @param {readonly string[] | undefined} gameQrFlags games.json qrFlags for the game
 * @param {string} requested --flags / QRC_FLAGS value ("none", "all" or a comma list)
 * @param {boolean} exact exact mode
 * @returns {string[]} flag tokens for the a3d-qr URL parameter (empty = no parameter)
 */
export function captureFlagList(gameQrFlags, requested, exact) {
  const tokens = String(requested ?? "none").split(",").map((t) => t.trim()).filter(Boolean);
  const requestedList = tokens.length === 1 && tokens[0] === "none" ? [] : tokens;
  if (exact) return requestedList.length ? [...new Set(requestedList)] : ["none"];
  return [...new Set([...(gameQrFlags ?? []), ...requestedList])];
}

/** Append `a3d-qr=<list>` to a route; an empty list leaves the route unchanged. */
export function captureUrlWithFlags(route, flags) {
  const r = `${route}${route.includes("?") ? "&" : "?"}a3dLighting=background=off,probes=off,contact=off`;
  if (!flags.length) return r;
  return `${r}&a3d-qr=${encodeURIComponent(flags.join(","))}`;
}
