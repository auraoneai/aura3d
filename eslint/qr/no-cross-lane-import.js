/**
 * qr-no-cross-lane-import (custodian prd15, CONTRACTS.md §4): a file owned by
 * lane A may not import a path owned by lane B unless the contract file lists
 * it as a consumer. WARN mode in PR 0a — violations warn, never fail.
 */

const LANE_DIR_RE = /lanes\/(prd\d{2})|commands\/(prd\d{2})|compiler\/(?:.*\.)?(prd\d{2})\.ts|scenes\/(prd\d{2})\//;

export default {
  meta: {
    type: "suggestion",
    docs: { description: "Warn on cross-lane imports not declared by the contract." },
    schema: [],
    messages: {
      crossLane: "Cross-lane import '{{target}}' resolves into lane {{targetLane}}'s area from lane {{sourceLane}}'s file."
    }
  },
  create(context) {
    const source = context.filename ?? context.getFilename();
    const sourceLane = LANE_DIR_RE.exec(source)?.slice(1).find(Boolean) ?? null;
    if (!sourceLane) return {};
    return {
      ImportDeclaration(node) {
        const target = String(node.source.value);
        const m = /lanes\/(prd\d{2})|commands\/(prd\d{2})/.exec(target);
        const targetLane = m?.slice(1).find(Boolean) ?? null;
        if (targetLane && targetLane !== sourceLane) {
          context.report({ node: node.source, messageId: "crossLane", data: { target, targetLane, sourceLane } });
        }
      }
    };
  }
};
