import { THREE_COMPAT_THREE_IMPORT_MAP } from "./ImportMap";
import { createThreeCompatCompatibilityWarnings } from "./CompatibilityWarnings";

export interface ThreeCompatMigrationResult {
  readonly code: string;
  readonly rewrittenImports: number;
  readonly warnings: ReturnType<typeof createThreeCompatCompatibilityWarnings>;
}

export function migrateThreeToA3D(source: string): ThreeCompatMigrationResult {
  let code = source;
  let rewrittenImports = 0;
  for (const [from, to] of Object.entries(THREE_COMPAT_THREE_IMPORT_MAP)) {
    const before = code;
    code = code.replaceAll(`from "${from}"`, `from "${to}"`).replaceAll(`from '${from}'`, `from '${to}'`);
    if (code !== before) rewrittenImports += 1;
  }
  code = code.replaceAll("new THREE.WebGLRenderer", "createThreeCompatRenderer");
  code = code.replaceAll("renderer.setSize", "renderer.resize");
  return {
    code,
    rewrittenImports,
    warnings: createThreeCompatCompatibilityWarnings(source)
  };
}
