// layering (PRD-15 §6.3, T3.14) — module graph over packages/engine/src/agent-api:
//   nodes/     may not import compiler/, app/, or @aura3d/rendering values
//              (type-only imports allowed)
//   compiler/  may not import app/
//   devtools/  may be imported ONLY by public/devtools.ts
// Anything else (root-level files, app→nodes/compiler, devtools→*) is free.
// Fail mode for the whole tree: every un-allowlisted violation is enforced.

import type { GateFinding } from "../index";
import { agentApiFiles, specifierHits, resolveSpecifier } from "./moduleGraph";
import { edgeAllowed, isExpired, loadAllowlist } from "./shared";
import { relative } from "node:path";

const AGENT_API = "packages/engine/src/agent-api";
const DEVTOOLS_PUBLIC = `${AGENT_API}/public/devtools.ts`;

type Tier = "nodes" | "compiler" | "app" | "devtools" | "other";

function tierOf(repoPath: string): Tier | null {
  if (!repoPath.startsWith(`${AGENT_API}/`)) return null;
  const rest = repoPath.slice(AGENT_API.length + 1);
  if (rest.startsWith("nodes/")) return "nodes";
  if (rest.startsWith("compiler/")) return "compiler";
  if (rest.startsWith("app/")) return "app";
  if (rest.startsWith("devtools/")) return "devtools";
  return "other";
}

export function checkLayering(root: string): GateFinding[] {
  const allowlist = loadAllowlist(root);
  const findings: GateFinding[] = [];
  for (const file of agentApiFiles(root)) {
    const fromRel = relative(root, file);
    const fromTier = tierOf(fromRel);
    for (const hit of specifierHits(file)) {
      const spec = hit.spec;
      const resolved = resolveSpecifier(file, spec, root);
      const toRel = resolved ? relative(root, resolved) : null;
      const toTier = toRel ? tierOf(toRel) : null;
      let why: string | null = null;

      if (fromTier === "nodes" && hit.valueEdge) {
        if (toTier === "compiler" || toTier === "app" || toTier === "devtools") {
          why = `nodes/ may not value-import ${toTier}/`;
        } else if (spec === "@aura3d/rendering" || spec.startsWith("@aura3d/rendering/")) {
          why = "nodes/ may not value-import @aura3d/rendering (type-only allowed)";
        }
      } else if (fromTier === "compiler" && hit.valueEdge && (toTier === "app" || toTier === "devtools")) {
        why = `compiler/ may not value-import ${toTier}/`;
      } else if (toTier === "devtools" && hit.valueEdge && fromRel !== DEVTOOLS_PUBLIC) {
        why = "only agent-api/public/devtools.ts may import devtools/";
      }

      if (!why) continue;
      const key = toRel ?? spec;
      const entry = edgeAllowed(allowlist, "layering", fromRel, key) ?? edgeAllowed(allowlist, "layering", fromRel, spec);
      if (entry && !isExpired(entry)) {
        findings.push({ rule: "layering", file: fromRel, detail: `${why} → ${key} (allowlisted until ${entry.expires}: ${entry.reason})`, enforced: false });
      } else {
        findings.push({ rule: "layering", file: fromRel, detail: `${why} → ${key}${entry ? " (ALLOWLIST EXPIRED)" : ""}`, enforced: true });
      }
    }
  }
  return findings;
}
