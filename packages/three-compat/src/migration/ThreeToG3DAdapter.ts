import { V5_THREE_IMPORT_MAP } from "./ImportMap";
import { createV5CompatibilityWarnings } from "./CompatibilityWarnings";

export interface V5MigrationResult {
  readonly code: string;
  readonly rewrittenImports: number;
  readonly warnings: ReturnType<typeof createV5CompatibilityWarnings>;
}

export function migrateThreeToG3D(source: string): V5MigrationResult {
  let code = source;
  let rewrittenImports = 0;
  for (const [from, to] of Object.entries(V5_THREE_IMPORT_MAP)) {
    const before = code;
    code = code.replaceAll(`from "${from}"`, `from "${to}"`).replaceAll(`from '${from}'`, `from '${to}'`);
    if (code !== before) rewrittenImports += 1;
  }
  code = code.replaceAll("new THREE.WebGLRenderer", "createRendererV5");
  code = code.replaceAll("renderer.setSize", "renderer.resize");
  return {
    code,
    rewrittenImports,
    warnings: createV5CompatibilityWarnings(source)
  };
}
