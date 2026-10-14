// apps/showcase-orbital-defense/src/legacy/hud-diff.ts — T1.12 (Orbital Defense):
// write the HUD only when the displayed markup actually changed. String-compare
// before innerHTML; a constant state produces at most one DOM write total.
export function maybeWriteHud(
  host: { innerHTML: string },
  html: string,
  last: { value: string | undefined }
): boolean {
  if (html === last.value) return false;
  last.value = html;
  host.innerHTML = html;
  return true;
}
