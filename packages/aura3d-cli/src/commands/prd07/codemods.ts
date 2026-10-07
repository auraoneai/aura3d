// PRD-07 P6-T5 — `vfx-pools-to-effects` codemod (C-39). Two jobs:
//   1. Report E25 route-local spark/burst pools — pooled primitives created
//      once, hidden, then re-driven per frame via handle.setScale(life).
//   2. Rewrite the simple patterns to the prd07 effects surface:
//      `effects.spawnLoop(x)` → `effects.spawn(x)` and pooled
//      `primitives.box/sphere(...)…​.runtime(...)` builders →
//      `app.effects.burst(...)` (marked approximate: pool bookkeeping moves to
//      the burst handle, which a human still has to wire in).

import type { AuraCodemod } from "../../contracts/commands";

type CodemodRow = {
  readonly file: string;
  readonly line: number;
  readonly construct: string;
  readonly mapping: "exact" | "approximate" | "none";
  readonly target?: string;
  readonly note?: string;
};

/** End index of the balanced (...) region starting at `open` (index of "("). */
export function matchParens(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const c = source[i];
    if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

interface ChainMatch {
  readonly start: number;
  readonly end: number; // exclusive, just past runtime(...)
  readonly primitive: "box" | "sphere";
}

/**
 * Match `primitives.box|sphere(<args>) [.<method>(<args>)]* .runtime(<args>)`
 * with balanced-paren skipping (nested calls inside args are legal).
 */
export function findPooledPrimitiveChains(source: string): readonly ChainMatch[] {
  const out: ChainMatch[] = [];
  const re = /primitives\.(box|sphere)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const primitive = m[1] as "box" | "sphere";
    const open = m.index + m[0].length - 1;
    const close = matchParens(source, open);
    if (close < 0) continue;
    let cursor = close + 1;
    let runtimeEnd = -1;
    // Walk `.method(...)` chains; stop at the first `.runtime(` (its end), or
    // at anything that is not a chain link.
    for (;;) {
      const skip = source.slice(cursor);
      const ws = skip.match(/^\s*/);
      cursor += ws?.[0].length ?? 0;
      const link = source.slice(cursor).match(/^\.(\w+)\s*\(/);
      if (!link) break;
      const method = link[1];
      const argOpen = cursor + link[0].length - 1;
      const argClose = matchParens(source, argOpen);
      if (argClose < 0) break;
      cursor = argClose + 1;
      if (method === "runtime") {
        runtimeEnd = cursor;
        break;
      }
    }
    if (runtimeEnd > 0) {
      out.push({ start: m.index, end: runtimeEnd, primitive });
      re.lastIndex = runtimeEnd;
    } else {
      re.lastIndex = close + 1;
    }
  }
  return out;
}

const lineOf = (source: string, index: number): number => source.slice(0, index).split("\n").length;

export function vfxPoolsToEffectsTransform(source: string, fileName: string): {
  readonly code: string;
  readonly rows: readonly CodemodRow[];
} {
  const rows: CodemodRow[] = [];
  let code = source;

  // --- E25 report sites -----------------------------------------------------
  const poolRe = /Array\.from\s*\(\s*\{\s*length/g;
  let pm: RegExpExecArray | null;
  while ((pm = poolRe.exec(source))) {
    // Only report when the Array.from body plausibly builds pooled primitives.
    const window = source.slice(pm.index, pm.index + 2000);
    if (/primitives\.(box|sphere)/.test(window) && /\.runtime\s*\(/.test(window)) {
      rows.push({
        file: fileName,
        line: lineOf(source, pm.index),
        construct: "E25 pooled-primitive array",
        mapping: "approximate",
        target: "app.effects.burst / effects.spawn",
        note: "E25: route-local spark/burst pool; migrate to the prd07 effects API"
      });
    }
  }
  const scaleRe = /\b\w+\.setScale\s*\(/g;
  let sm: RegExpExecArray | null;
  while ((sm = scaleRe.exec(source))) {
    // Only flag scale calls driven by a life/age term (the E25 signature).
    const window = source.slice(Math.max(0, sm.index - 400), sm.index + 200);
    if (/\b(life|age|SHARD_LIFETIME|LIFETIME)\b/.test(window)) {
      rows.push({
        file: fileName,
        line: lineOf(source, sm.index),
        construct: "E25 life-driven setScale",
        mapping: "none",
        note: "E25: per-frame scale drive on a pooled primitive; burst handles this internally"
      });
    }
  }

  // --- Rewrites -------------------------------------------------------------
  // effects.spawnLoop(x) → effects.spawn(x) — loop lifetime moves to the handle.
  const spawnLoopRe = /effects\.spawnLoop\s*\(\s*([^,)]*)/g;
  let lm: RegExpExecArray | null;
  while ((lm = spawnLoopRe.exec(code))) {
    rows.push({
      file: fileName,
      line: lineOf(code, lm.index),
      construct: lm[0],
      mapping: "approximate",
      target: `effects.spawn(${lm[1].trim()}`,
      note: "loop lifetime: move to spawned-instance handle.stop()"
    });
  }
  code = code.replace(/effects\.spawnLoop\s*\(/g, "effects.spawn(");

  // Pooled primitives.box/sphere chains ending in .runtime(...) → burst stubs.
  // Approximate: the burst replaces the pool per-burst, not the pooled node.
  const chains = findPooledPrimitiveChains(code);
  if (chains.length > 0) {
    let rewritten = "";
    let cursor = 0;
    for (const chain of chains) {
      rewritten += code.slice(cursor, chain.start);
      rewritten += 'app.effects.burst("explosion-small", [0, 0, 0], { count: 8 })';
      rows.push({
        file: fileName,
        line: lineOf(code, chain.start),
        construct: `primitives.${chain.primitive}(…).runtime(…)`,
        mapping: "approximate",
        target: 'app.effects.burst("explosion-small", …)',
        note: "E25 rewrite: pooled primitive → effects.burst; pool bookkeeping moves to the burst handle"
      });
      cursor = chain.end;
    }
    rewritten += code.slice(cursor);
    code = rewritten;
  }

  rows.sort((a, b) => a.line - b.line);
  return { code, rows };
}

export function vfxPoolsToEffectsCodemod(): AuraCodemod {
  return {
    name: "vfx-pools-to-effects",
    owner: "prd07",
    description:
      "Report E25 route-local spark/burst pools and rewrite the simple patterns: " +
      "effects.spawnLoop → effects.spawn; pooled primitives.box/sphere + .runtime → app.effects.burst",
    transform: vfxPoolsToEffectsTransform
  };
}
