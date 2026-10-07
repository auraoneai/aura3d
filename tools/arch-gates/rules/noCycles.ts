// no-cycles (PRD-15 §6.12) — Tarjan SCC over the agent-api value-import
// graph; any SCC of size > 1 is a finding. Dated allowlist entries suppress
// known structural debt while owner repoints land (CONTRACTS §6.5).

import type { GateFinding } from "../index";
import { agentApiGraph } from "./moduleGraph";
import { edgeAllowed, isExpired, loadAllowlist } from "./shared";

const AGENT_API = "packages/engine/src/agent-api";
const INDEX = `${AGENT_API}/index.ts`;

export function checkNoCycles(root: string): GateFinding[] {
  const allowlist = loadAllowlist(root);
  // Edge allowlist: drop leaf→index edges whose repoint request is open —
  // they collapse every foreign leaf into the barrel's SCC and hide the real
  // intra-leaf cycles underneath.
  const graph = new Map<string, Set<string>>();
  const allFiles = new Set<string>();
  for (const e of agentApiGraph(root)) {
    allFiles.add(e.from); allFiles.add(e.to);
    const entry = edgeAllowed(allowlist, "no-cycles", e.from, e.to);
    if (entry && !isExpired(entry)) continue;
    (graph.get(e.from) ?? graph.set(e.from, new Set()).get(e.from)!).add(e.to);
  }

  // Tarjan
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  const sccs: string[][] = [];
  let counter = 0;
  const sc = (v: string) => {
    index.set(v, counter); low.set(v, counter); counter++;
    stack.push(v); on.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) { sc(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (on.has(w)) { low.set(v, Math.min(low.get(v)!, index.get(w)!)); }
    }
    if (low.get(v) === index.get(v)) {
      const cc: string[] = [];
      for (;;) { const w = stack.pop()!; on.delete(w); cc.push(w); if (w === v) break; }
      if (cc.length > 1) sccs.push(cc.sort());
    }
  };
  for (const v of allFiles) if (!index.has(v)) sc(v);

  const findings: GateFinding[] = [];
  for (const members of sccs) {
    // Suppress iff the computed SCC is a subset of a dated allowlist entry's
    // member set — repoints shrink the SCC yet stay covered; a NEW member
    // joining resurfaces the finding.
    const entry = allowlist.find((e) =>
      e.rule === "no-cycles" && e.scc && members.every((m) => e.scc!.includes(m)));
    const label = `SCC size ${members.length}: ${members.slice(0, 6).join(", ")}${members.length > 6 ? `, … +${members.length - 6}` : ""}`;
    if (entry && !isExpired(entry)) {
      findings.push({ rule: "no-cycles", file: members[0], detail: `${label} (allowlisted until ${entry.expires}: ${entry.reason})`, enforced: false });
    } else {
      findings.push({ rule: "no-cycles", file: members[0], detail: `${label}${entry ? " (ALLOWLIST EXPIRED)" : ""}`, enforced: true });
    }
  }
  return findings;
}
