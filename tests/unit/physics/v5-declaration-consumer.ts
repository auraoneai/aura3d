import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const fixture = resolve(dirname(fileURLToPath(import.meta.url)), "native-v5-declaration-consumer.fixture.ts");
const backend = /^@(?:aura3d\/physics-rapier|dimforge\/rapier3d-compat)(?:\/|$)/u;

export interface V5DeclarationConsumerResult {
  readonly success: boolean;
  readonly diagnostics: readonly { readonly code: number; readonly message: string }[];
  readonly forbiddenResolutions: readonly string[];
  readonly escapedResolutions: readonly string[];
}

function inside(root: string, path: string): boolean {
  const child = relative(root, path);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

/**
 * Check an explicitly staged source-declaration candidate, with both optional
 * backend packages unavailable to the resolver. This is not an installed-pack
 * or build check; callers must establish the staged candidate's provenance.
 */
export function checkV5DeclarationConsumer(
  stage: string,
  consumerSource = readFileSync(fixture, "utf8")
): V5DeclarationConsumerResult {
  const stageRoot = realpathSync(resolve(stage));
  const enginePackage = resolve(stageRoot, "node_modules/@aura3d/engine/package.json");
  if (!existsSync(enginePackage)) throw new Error("The candidate must contain node_modules/@aura3d/engine/package.json.");

  const consumerFile = resolve(stageRoot, "__aura_v5_declaration_consumer__.mts");
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    strict: true,
    skipLibCheck: false,
    types: [],
    noEmit: true
  };
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
    resolve(fileName) === consumerFile
      ? ts.createSourceFile(fileName, consumerSource, languageVersion, true, ts.ScriptKind.TS)
      : originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);

  const forbiddenResolutions: string[] = [];
  const escapedResolutions: string[] = [];
  host.resolveModuleNameLiterals = (names, containingFile, redirectedReference, compilerOptions, containingSourceFile) =>
    names.map((name) => {
      if (backend.test(name.text)) {
        forbiddenResolutions.push(name.text);
        return { resolvedModule: undefined };
      }
      const mode = ts.getModeForUsageLocation(containingSourceFile, name, compilerOptions);
      const result = ts.resolveModuleName(name.text, containingFile, compilerOptions, host, undefined, redirectedReference, mode);
      const resolvedFile = result.resolvedModule?.resolvedFileName;
      if (resolvedFile) {
        const realFile = realpathSync(resolvedFile);
        if (/[/\\]node_modules[/\\]@(?:aura3d[/\\]physics-rapier|dimforge[/\\]rapier3d-compat)(?:[/\\]|$)/u.test(realFile)) {
          forbiddenResolutions.push(name.text);
          return { resolvedModule: undefined };
        }
        if (!inside(stageRoot, realFile)) {
          escapedResolutions.push(`${name.text}: ${realFile}`);
          return { resolvedModule: undefined };
        }
      }
      return result;
    });

  const program = ts.createProgram([consumerFile], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  }));
  return {
    success: diagnostics.length === 0 && forbiddenResolutions.length === 0 && escapedResolutions.length === 0,
    diagnostics,
    forbiddenResolutions,
    escapedResolutions
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 4 || process.argv[2] !== "--stage") {
    throw new Error("Usage: tsx tests/unit/physics/v5-declaration-consumer.ts --stage <candidate-directory>");
  }
  const result = checkV5DeclarationConsumer(process.argv[3]!);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.success) process.exitCode = 1;
}
