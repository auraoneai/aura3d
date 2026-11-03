import ts from "typescript";

export type PatchDeclarationCompatibility = "compatible-addition" | "incompatible-change";

function tokens(source: string): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
  const result: string[] = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.WhitespaceTrivia || token === ts.SyntaxKind.NewLineTrivia) continue;
    result.push(scanner.getTokenText());
  }
  return result;
}

function isSubsequence(before: readonly string[], after: readonly string[]): boolean {
  let cursor = 0;
  for (const token of after) {
    if (token === before[cursor]) cursor += 1;
    if (cursor === before.length) return true;
  }
  return before.length === 0;
}

function declaration(source: string): ts.Statement | undefined {
  return ts.createSourceFile("surface.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    .statements.find(ts.isDeclarationStatement);
}

function objectMembers(node: ts.Statement | undefined): readonly ts.TypeElement[] | undefined {
  if (node && ts.isInterfaceDeclaration(node)) return node.members;
  if (node && ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) return node.type.members;
  return undefined;
}

function memberKey(member: ts.TypeElement): string {
  const name = member.name && ts.isIdentifier(member.name)
    ? member.name.text
    : member.name?.getText() ?? "";
  return `${member.kind}:${name}`;
}

function isCompatibleAddedMember(member: ts.TypeElement): boolean {
  // A service interface can gain callable operations without changing any
  // existing call. Data properties remain stricter because downstream code
  // commonly constructs those objects directly.
  return ts.isMethodSignature(member)
    || (ts.isPropertySignature(member) && member.questionToken !== undefined);
}

/**
 * Classifies a retained public declaration for patch-version source compatibility.
 *
 * The old token stream must remain present in order, which rejects removals,
 * renamed members and changed existing parameter/property types. New class
 * members, defaulted/optional function parameters and wider return objects are
 * additive. Exported object contracts receive one stricter rule: a new required
 * member would break existing object literals and implementors, so only optional
 * top-level members are accepted there.
 */
export function classifyPatchDeclarationChange(
  before: string,
  after: string
): PatchDeclarationCompatibility {
  if (!isSubsequence(tokens(before), tokens(after))) return "incompatible-change";

  const beforeMembers = objectMembers(declaration(before));
  const afterMembers = objectMembers(declaration(after));
  if (beforeMembers && afterMembers) {
    const retained = new Set(beforeMembers.map(memberKey));
    for (const member of afterMembers) {
      if (!retained.has(memberKey(member)) && !isCompatibleAddedMember(member)) {
        return "incompatible-change";
      }
    }
  }
  return "compatible-addition";
}

export type ReleaseKind = "patch" | "minor" | "major";
export type SurfaceChangeKind = "value-removal" | "type-removal" | "runtime-export-removal" | "subpath-removal" | "package-removal" | "bin-removal" | "condition-removal" | "condition-target-change" | "condition-order-change" | "declaration-change" | "addition";
export interface ReleaseChange {
  kind: SurfaceChangeKind;
  before?: string;
  after?: string;
  /** Earliest version expressly promised for removal, when present. */
  removalVersion?: string;
}
export interface ReleaseChangeClassification {
  compatible: boolean;
  breaking: boolean;
  disposition: "compatible" | "major-break" | "breaking" | "deprecation-window";
}
function compareVersions(a: string, b: string): number {
  if (!/^\d+\.\d+\.\d+$/.test(a) || !/^\d+\.\d+\.\d+$/.test(b)) throw new Error("Versions must be stable semver triples");
  const left = a.split(".").map(Number), right = b.split(".").map(Number);
  return left[0]! - right[0]! || left[1]! - right[1]! || left[2]! - right[2]!;
}
/**
 * Report breaks at every release level. Patch/minor cannot contain them; a major
 * may, except before a previously announced earliest removal version. A
 * declaration edit without proof of compatibility is treated as breaking.
 */
export function classifyReleaseChange(change: ReleaseChange, release: ReleaseKind, candidateVersion: string): ReleaseChangeClassification {
  if (!(["patch", "minor", "major"] as const).includes(release)) throw new Error(`Unknown release kind: ${release}`);
  if (change.kind === "addition") {
    return { compatible: true, breaking: false, disposition: "compatible" };
  }
  // The old token subsequence test is retained for its existing patch report;
  // it cannot prove variance or exhaustiveness, so a new diff fails closed on
  // an altered signature unless TypeScript consumer assignments proved it.
  if (change.removalVersion && compareVersions(candidateVersion, change.removalVersion) < 0) {
    return { compatible: false, breaking: true, disposition: "deprecation-window" };
  }
  return release === "major"
    ? { compatible: true, breaking: true, disposition: "major-break" }
    : { compatible: false, breaking: true, disposition: "breaking" };
}
export function validateReleaseKind(before: string, after: string, kind: ReleaseKind): void {
  if (compareVersions(before, after) >= 0) throw new Error("Candidate version must be newer than baseline");
  const a = before.split(".").map(Number), b = after.split(".").map(Number);
  const actual = b[0] !== a[0] ? "major" : b[1] !== a[1] ? "minor" : "patch";
  if (actual !== kind) throw new Error(`Release kind ${kind} does not match ${before} -> ${after} (${actual})`);
}
