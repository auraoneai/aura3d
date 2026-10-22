/**
 * F-7a: `scanFeelSource` — flags "evidence-only feel" in route/template
 * sources.
 *
 * Tracks locals bound to `app.camera.shake`, `app.camera.punchIn`,
 * `game.cameraRig`, `game.cameraDirector` or `gameFeel.create` results, then
 * reports `.update(`/`.follow(`/`.snap(` calls whose output is
 *   (i) discarded (`void x.update(...)` / bare expression statement),
 *  (ii) written only into evidence/HUD/diagnostics payloads,
 * (iii) bound to a variable that is never read again.
 * Calls feeding `app.camera.use/addLayer` or `app.feel.emit` are real feel and
 * stay clean.
 */

export interface FeelLintRow {
  readonly line: number;
  readonly severity: "error" | "warning";
  readonly message: string;
}

const CREATOR_CALL_RE = /(?:camera|app\.camera)\s*\.\s*(?:shake|punchIn)\s*\(|\bgame\s*\.\s*(?:cameraRig|cameraDirector)\s*\(|\bgameFeel\s*\.\s*create\s*\(/;
const FEEL_METHOD_RE = /\.(update|follow|snap|apply|resolve)\s*\(/;
const REAL_SINK_RE = /\b(?:camera\.use|app\.camera\.use|addLayer|addTraumaLayer|feel\.emit|app\.feel\.emit|presented|setPose|setFov|use)\s*\(/;
const EVIDENCE_SINK_RE = /\b(?:publishEvidence|evidence|diagnostics|collectGameRuntimeEvidence|setHud|hudText|hud\.|overlayText|log)\b/;
const DECL_RE = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g;

function lineOf(source: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index && i < source.length; i += 1) if (source[i] === "\n") n += 1;
  return n;
}

/** All occurrences of `name` in `text`, excluding the declaration site itself. */
function* reads(text: string, name: string): Generator<{ index: number; line: string }> {
  const re = new RegExp(`\\b${name}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = text.lastIndexOf("\n", m.index) + 1;
    const end = text.indexOf("\n", m.index);
    yield { index: m.index, line: text.slice(start, end === -1 ? text.length : end) };
  }
}

export function scanFeelSource(text: string): readonly FeelLintRow[] {
  const rows: FeelLintRow[] = [];
  const lines = text.split("\n");

  // Pass 1: variables bound to feel creators.
  const feelVars = new Set<string>();
  for (const m of text.matchAll(DECL_RE)) {
    const declLine = lines[lineOf(text, m.index) - 1] ?? "";
    if (CREATOR_CALL_RE.test(declLine)) feelVars.add(m[1]!);
  }
  if (feelVars.size === 0) return rows;

  // Pass 2: for each creator var, inspect its method calls and where results go.
  for (const v of feelVars) {
    const callRe = new RegExp(`\\b${v}${FEEL_METHOD_RE.source}`, "g");
    for (const m of text.matchAll(callRe)) {
      const method = m[1]!;
      const callLine = lines[lineOf(text, m.index) - 1] ?? "";
      if (REAL_SINK_RE.test(callLine)) continue;

      const trimmed = callLine.trimStart();
      const isVoidCall = trimmed.startsWith("void ") || (!trimmed.startsWith("const") && !trimmed.startsWith("let") && !trimmed.startsWith("var") && !/[=({[]/.test(trimmed.slice(0, callLine.indexOf(v))));
      const sinksIntoEvidence = EVIDENCE_SINK_RE.test(callLine);
      if (isVoidCall) {
        rows.push({ line: lineOf(text, m.index), severity: "error", message: `\`${v}.${method}()\` result discarded — feel output never reaches the frame (evidence-only feel, F-7)` });
        continue;
      }
      if (sinksIntoEvidence) {
        rows.push({ line: lineOf(text, m.index), severity: "error", message: `\`${v}.${method}()\` feeds evidence/HUD only — route it through app.camera.use/addLayer or app.feel (evidence-only feel, F-7)` });
        continue;
      }

      // Bound result: check every later read of the destination variable.
      const decl = new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${v}\\.${method}\\s*\\(`).exec(callLine);
      if (decl) {
        const resultVar = decl[1]!;
        const afterDecl = text.slice(m.index);
        const laterReads = [...reads(afterDecl, resultVar)].filter((r) => !new RegExp(`\\b(?:const|let|var)\\s+${resultVar}\\s*=`).test(r.line));
        if (laterReads.length === 0) {
          rows.push({ line: lineOf(text, m.index), severity: "warning", message: `\`${v}.${method}()\` output bound to \`${resultVar}\` but never read — possible evidence-only feel (F-7)` });
          continue;
        }
        const voidRe = new RegExp(`^\\s*(?:void\\s+${resultVar}\\s*;?\\s*|//)`);
        if (laterReads.every((r) => voidRe.test(r.line))) {
          rows.push({ line: lineOf(text, m.index), severity: "error", message: `\`${v}.${method}()\` output \`${resultVar}\` is only \`void\`ed — discarded feel output (evidence-only feel, F-7)` });
          continue;
        }
        const allEvidence = laterReads.every((r) => EVIDENCE_SINK_RE.test(r.line) && !REAL_SINK_RE.test(r.line));
        if (allEvidence) {
          rows.push({ line: lineOf(text, m.index), severity: "error", message: `\`${v}.${method}()\` output only feeds evidence/HUD via \`${resultVar}\` — evidence-only feel (F-7)` });
        }
      }
    }
  }
  return rows;
}
