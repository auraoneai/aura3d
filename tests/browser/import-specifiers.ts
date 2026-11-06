import ts from "typescript";

/** Text that may precede the quote of an import specifier: `from`, `import`, `import(` (optionally with a comment). */
const SPECIFIER_LEAD = /(?:\bfrom|\bimport|\bimport\s*\(\s*(?:\/\*[^]*?\*\/\s*)?)\s*$/;

/**
 * Rewrite module specifiers (`from "x"`, `import "x"`, `import("x")`, `export ... from "x"`) using the TypeScript
 * scanner, so text that only looks like an import (comments, template literals, prose in packed dist files) is never
 * touched. `map` returns the replacement, or undefined to keep the specifier.
 */
export function mapModuleSpecifiers(source: string, map: (specifier: string) => string | undefined): string {
  const found = ts.preProcessFile(source, true, true).importedFiles
    .map((reference) => ({ specifier: reference.fileName, start: reference.pos + 1 }))
    .filter((reference) => source.startsWith(reference.specifier, reference.start) && SPECIFIER_LEAD.test(source.slice(Math.max(0, reference.start - 80), reference.start - 1)))
    .sort((left, right) => left.start - right.start);
  let output = "";
  let cursor = 0;
  for (const { specifier, start } of found) {
    if (start < cursor) continue;
    const replacement = map(specifier);
    if (replacement === undefined) continue;
    output += source.slice(cursor, start) + replacement;
    cursor = start + specifier.length;
  }
  return output + source.slice(cursor);
}
