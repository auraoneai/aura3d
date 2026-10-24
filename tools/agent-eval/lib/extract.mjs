import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Pull AGENTEVAL_RESULT / AGENTEVAL_FRAME lines out of remote run logs. Later lines for the same id win. */
export function parseRemoteLog(text) {
  const results = new Map();
  const frames = [];
  for (const line of text.split("\n")) {
    const at = line.indexOf("AGENTEVAL_");
    if (at < 0) continue;
    const rest = line.slice(at);
    if (rest.startsWith("AGENTEVAL_RESULT ")) {
      try {
        const r = JSON.parse(rest.slice("AGENTEVAL_RESULT ".length));
        results.set(r.id, r);
      } catch {
        /* partial line */
      }
    } else if (rest.startsWith("AGENTEVAL_FRAME ")) {
      const [, id, index, data] = rest.trim().split(" ");
      if (id && data) frames.push({ id, index: Number(index), data });
    }
  }
  return { results: [...results.values()], frames };
}

export function writeRemote({ outDir, logs, merge = false }) {
  const merged = new Map();
  if (merge && existsSync(join(outDir, "results.json"))) for (const r of JSON.parse(readFileSync(join(outDir, "results.json"), "utf8"))) merged.set(r.id, r);
  const frames = [];
  for (const text of logs) {
    const parsed = parseRemoteLog(text);
    for (const r of parsed.results) merged.set(r.id, r);
    frames.push(...parsed.frames);
  }
  mkdirSync(join(outDir, "frames"), { recursive: true });
  for (const f of frames) writeFileSync(join(outDir, "frames", `${f.id}-${f.index}.jpg`), Buffer.from(f.data, "base64"));
  writeFileSync(join(outDir, "results.json"), JSON.stringify([...merged.values()], null, 2));
  return { results: merged.size, frames: frames.length };
}
