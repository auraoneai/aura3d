/**
 * Dev backend client — the LOCAL studio control surface.
 *
 * Talks to the Vite dev-server middleware (see `vite.config.ts`) which shells the
 * REAL agent-native Scene-Tool CLI (`animation-scene.ts`) and the render pipeline
 * against the shared working document. This is dev-only: the user's own coding agent
 * remains the director. Command mode runs raw scene-tool commands here; Prompt mode
 * only displays the intent (the agent drives the actual commands).
 */

export interface SceneResult {
  ok: boolean;
  /** Raw CLI stdout/stderr — "ok …" on commit, "REJECTED — …" on validator rejection. */
  output: string;
  rejected?: boolean;
  ms?: number;
  /** Short content hash of the resulting working document ("doc @ xxx"). */
  hash?: string;
  error?: string;
}

export interface RenderResult {
  ok: boolean;
  output?: string;
  ms?: number;
  /** Served under /preview/* by the dev middleware (null if not produced). */
  video?: string | null;
  poster?: string | null;
  hash?: string;
  error?: string;
}

/** Fetch the REAL working document (or { exists:false } when none has been authored). */
export async function fetchDocument(): Promise<Record<string, unknown>> {
  const r = await fetch("/api/document");
  return (await r.json()) as Record<string, unknown>;
}

/** Fetch the REAL command/result history (array; [] when none). */
export async function fetchHistory(): Promise<unknown[]> {
  const r = await fetch("/api/history");
  const v = (await r.json()) as unknown;
  return Array.isArray(v) ? v : [];
}

/** Fetch the EXISTING render (if any) so the Stage shows it on load without re-rendering. */
export async function fetchExistingRender(): Promise<{ video?: string | null; poster?: string | null; exists?: boolean }> {
  try {
    const r = await fetch("/api/render");
    return (await r.json()) as { video?: string | null; poster?: string | null; exists?: boolean };
  } catch {
    return { exists: false };
  }
}

/** Run one validated Scene-Tool command against the working document. */
export async function runSceneCommand(command: string): Promise<SceneResult> {
  try {
    const r = await fetch("/api/scene", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command })
    });
    return (await r.json()) as SceneResult;
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e), rejected: true };
  }
}

/** Render the working document (low-fi by default) via the real pipeline. */
export async function runRender(opts: { lowFi?: boolean; range?: string } = {}): Promise<RenderResult> {
  try {
    const r = await fetch("/api/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(opts)
    });
    return (await r.json()) as RenderResult;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Parse a committed/rejected CLI result into a card header verb + args + diff lines. */
export function parseCliResult(command: string, res: SceneResult): {
  diffs: { op: "+" | "~" | "!"; k: "add" | "mod" | "del"; t: string }[];
} {
  if (!res.ok || res.rejected) {
    // The CLI prints "REJECTED — edit would break the scene:\n - reason\n - reason".
    const lines = res.output
      .split("\n")
      .map((l) => l.replace(/^\s*-\s*/, "").trim())
      .filter((l) => l && !/^REJECTED/i.test(l) && !/break the scene/i.test(l));
    const reasons = lines.length ? lines : [res.output.replace(/^REJECTED[^:]*:?/i, "").trim() || "rejected"];
    return { diffs: reasons.map((r) => ({ op: "!", k: "del", t: escapeHtml(r) })) };
  }
  // On success the CLI prints "ok" / "cast … ← …" / "set → …" plus warnings.
  const lines = res.output.split("\n").map((l) => l.trim()).filter(Boolean);
  const diffs = lines
    .filter((l) => l !== "ok")
    .map((l) => ({ op: "~" as const, k: "mod" as const, t: escapeHtml(l) }));
  if (!diffs.length) diffs.push({ op: "~", k: "mod", t: escapeHtml(command) });
  return { diffs };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
