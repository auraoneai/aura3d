// Keep the editorial guide distinct from the full-screen playable route.
export function gameGuidePath(game) {
  const slug = game.url.split("/").filter(Boolean).at(-1).replace(/^showcase-/, "");
  return `/games/${slug}/`;
}
