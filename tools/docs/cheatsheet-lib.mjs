// Pure helpers for the first-screen cheat sheet gate (docs/agents/first-screen.md): block extraction and frame analysis.
import { createHash } from "node:crypto";

/** Fenced ts blocks with a render attribute: ```ts render=animated | static | asset:animated | asset:static */
export function extractBlocks(markdown) {
  const blocks = [];
  for (const match of markdown.matchAll(/```ts([^\n]*)\n([\s\S]*?)```/g)) {
    const attrs = Object.fromEntries([...match[1].matchAll(/(\w+)=(\S+)/g)].map((m) => [m[1], m[2]]));
    const code = match[2];
    const heading = [...markdown.slice(0, match.index).matchAll(/^### (.+)$/gm)].pop()?.[1] ?? `block ${blocks.length + 1}`;
    const render = attrs.render ?? "static";
    blocks.push({
      index: blocks.length + 1,
      heading,
      code,
      lines: code.replace(/\n$/, "").split("\n").length,
      render,
      asset: render.startsWith("asset:"),
      animated: render.endsWith("animated"),
      sha256: createHash("sha256").update(`${render}\n${code}`).digest("hex")
    });
  }
  return blocks;
}

export function lumaOf(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** frame: { width, height, data } with RGBA bytes. */
export function frameStats(frame, { blackLuma = 8 } = {}) {
  const { width, height, data } = frame;
  const pixels = width * height;
  let lit = 0;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < pixels; i += 1) {
    const l = lumaOf(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (l > blackLuma) lit += 1;
    sum += l;
    sumSq += l * l;
  }
  const mean = sum / pixels;
  return { litFraction: lit / pixels, meanLuma: mean, stdLuma: Math.sqrt(Math.max(0, sumSq / pixels - mean * mean)) };
}

/** Mean absolute RGB difference between two same-size frames on a 0 to 255 scale. */
export function frameDifference(a, b) {
  if (a.width !== b.width || a.height !== b.height) throw new Error("frame size mismatch");
  const pixels = a.width * a.height;
  let total = 0;
  for (let i = 0; i < pixels; i += 1) {
    total += Math.abs(a.data[i * 4] - b.data[i * 4]) + Math.abs(a.data[i * 4 + 1] - b.data[i * 4 + 1]) + Math.abs(a.data[i * 4 + 2] - b.data[i * 4 + 2]);
  }
  return total / (pixels * 3);
}

export const THRESHOLDS = { minLitFraction: 0.05, minStdLuma: 3, minAnimatedDiff: 0.2 };

/** Verdict for one block given two frames taken apart in time. */
export function analyzeFrames(first, second, { animated, thresholds = THRESHOLDS } = {}) {
  const a = frameStats(first);
  const b = frameStats(second);
  const diff = frameDifference(first, second);
  const failures = [];
  for (const [name, s] of [["frame1", a], ["frame2", b]]) {
    if (s.litFraction < thresholds.minLitFraction) failures.push(`${name} is black (lit fraction ${s.litFraction.toFixed(3)})`);
    else if (s.stdLuma < thresholds.minStdLuma) failures.push(`${name} is a flat colour (luma std ${s.stdLuma.toFixed(2)})`);
  }
  if (animated && diff <= thresholds.minAnimatedDiff) failures.push(`animated block did not change between frames (difference ${diff.toFixed(3)} <= ${thresholds.minAnimatedDiff})`);
  return { pass: failures.length === 0, failures, frame1: a, frame2: b, difference: diff };
}

/** Gate used by tools/agent-docs: every block of the sheet has a passing, hash-matching report entry and stays under 25 lines. */
export function verifyReport(blocks, report) {
  const problems = [];
  const byHash = new Map((report?.blocks ?? []).map((entry) => [entry.sha256, entry]));
  for (const block of blocks) {
    const entry = byHash.get(block.sha256);
    if (!entry) problems.push(`block ${block.index} (${block.heading}) has no render report for its current text`);
    else if (!entry.typecheck?.pass) problems.push(`block ${block.index} (${block.heading}) failed typecheck`);
    else if (!entry.render?.pass) problems.push(`block ${block.index} (${block.heading}) failed the render check: ${(entry.render?.failures ?? []).join("; ")}`);
    if (block.lines >= 25) problems.push(`block ${block.index} (${block.heading}) is ${block.lines} lines (limit 24)`);
  }
  return problems;
}
