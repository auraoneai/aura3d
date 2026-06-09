/* Shared formatting + small text helpers (ported from the design source). */

/** mm:ss from seconds. */
export function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return m + ":" + String(ss).padStart(2, "0");
}

/** Capitalise first letter. */
export function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** **bold** -> <span class="hl"> for AURA reasoning. */
export function boldHtml(s: string): string {
  return (s || "").replace(/\*\*([^*]+)\*\*/g, '<span class="hl">$1</span>');
}

/** Highlight command args: --flags (blue) and "quoted strings" (green). */
export function highlightArgs(s: string): string {
  // Sentinels guard quoted strings from the --flag pass, then become .str spans.
  const OPEN = String.fromCharCode(1);
  const CLOSE = String.fromCharCode(2);
  return s
    .replace(/("[^"]*")/g, OPEN + '$1' + CLOSE)
    .replace(/(--[a-z]+)/g, '<span class="flag">$1</span>')
    .replace(new RegExp(OPEN + '([^' + CLOSE + ']*)' + CLOSE, 'g'), '<span class="str">$1</span>');
}

/** Short hex revision hash. */
export function hash(): string {
  return Math.random().toString(16).slice(2, 8);
}

/** Darken a hex color (for avatar gradients). */
export function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.round(r * 0.55);
  g = Math.round(g * 0.55);
  b = Math.round(b * 0.62);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
