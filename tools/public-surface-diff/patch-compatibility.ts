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
